# Arquitetura

O repositório entrega três coisas que precisam evoluir juntas: o site, a
extensão de navegador e o banco. Elas estão no mesmo repositório porque
compartilham contratos que, quando versionados separadamente, derivam.

## Mapa

```
bora-estudar/
├── apps/
│   ├── web/                 # Next.js 16 (App Router) — painéis de aluno e professor
│   └── extension/           # Extensão MV3 — conduz a bateria no TEC Concursos
├── packages/
│   ├── protocol/            # Contrato site ↔ extensão (a única definição)
│   └── database/            # Tipos gerados do schema Supabase
├── supabase/
│   ├── config.toml
│   ├── migrations/          # Schema versionado
│   ├── seed.sql             # Usuários e dados de desenvolvimento
│   └── tests/               # 49 checagens de invariantes (npm run db:test)
└── docs/
```

Workspaces do npm. Sem Turborepo, Lerna ou pnpm: quatro pacotes não justificam
uma camada extra de orquestração, e `npm run <script> --workspaces` resolve.

## Idioma

Identificadores em inglês — no TypeScript e também no banco: tabelas, colunas,
enums, valores de enum e funções. Comentários, mensagens de erro, texto de
interface e descrições de teste em português, porque é o idioma do time e do
usuário final.

## Por que os limites estão onde estão

### `packages/protocol` é o núcleo da decisão

Site e extensão trocam dados pelo fragmento (`#`) da URL. Esse contrato é a
peça mais frágil do sistema: as duas pontas são versionadas separadamente na
prática — o site atualiza sozinho, a extensão só quando o usuário quer.

Na versão anterior do produto cada lado mantinha sua própria cópia das formas
de payload, e elas derivaram. O sintoma aparecia só em runtime, quando um campo
chegava faltando. Aqui existe **uma** definição, importada pelos dois, com:

- `PROTOCOL_VERSION` comparada em toda leitura — payload de versão diferente é
  rejeitado com mensagem acionável em vez de falhar em cascata;
- validação de runtime na fronteira, porque `JSON.parse` devolve `any` e um
  tipo do TypeScript não sobrevive à serialização;
- `historyComplete: boolean`, para o site poder admitir que não conseguiu
  carregar o histórico inteiro. A versão anterior marcava o histórico como
  autoritativo mesmo truncado, e o motor passava a repetir questões em silêncio.

O pacote é dependência zero e roda sem build tanto no Node quanto no navegador.

### `packages/database` é separado de `web`

Os tipos vêm de `supabase gen types` e são versionados. Ficam num pacote, e não
dentro de `apps/web`, por dois motivos: o diff de cada migration mostra o
impacto na superfície de tipos, e Edge Functions futuras consomem os mesmos
tipos sem depender do app.

### A extensão não fala com o Supabase

Ela recebe um payload do site e devolve outro. Nunca vê uma chave do Supabase,
nunca abre conexão com o banco. Duas consequências boas: o pacote distribuído
na loja não carrega credencial, e toda regra de negócio permanece atrás das
RPCs, onde é verificável.

Por isso `@bora/extension` depende de `@bora/protocol`, mas não de
`@bora/database`.

## Fluxo de uma bateria

```
  aluno clica em "iniciar"
        │
  web ──┤ RPC start_quiz_session ──────────────► supabase
        │ ◄── quiz_session (id, session_number, main_target)
        │
        │ monta QuizStart + histórico (view vw_seen_questions)
        │ redireciona para tecconcursos.com.br/#boraQuizStart=<base64url>
        ▼
  extensão lê a hash, PERSISTE a sessão, e só então limpa a hash
        │
        │ aluno responde as questões; cada resposta vai para storage.local
        │
        │ ao finalizar: gera requestId UMA vez, AGUARDA a gravação,
        │ e só então navega
        │ redireciona para <returnUrl>#boraQuizResult=<base64url>
        ▼
  web lê a hash ──► RPC finish_quiz_session (idempotente por requestId)
        │           e só limpa a hash DEPOIS da confirmação
        ▼
  aluno registra o tempo ──► RPC record_quiz_session_time ──► goal concluída
```

As duas ordenações em maiúsculas são deliberadas. Invertê-las reintroduz as
duas perdas silenciosas de resultado que existiam na versão anterior: limpar a
hash antes de confirmar a gravação, e navegar antes de a sessão chegar ao disco.

## Banco

O contrato está em `supabase/migrations`. Resumo do que a arquitetura assume:

- `quiz_session_questions` é um ledger append-only e a única fonte de
  desempenho; todo agregado vem de view, nunca de contador mantido à mão;
- a escrita se divide entre planejar e executar: o professor grava direto em
  `study_plans`, `study_plan_blocks`, `goals` e `subscriptions`, restrito por
  RLS e por grant de coluna; as tabelas de execução só mudam por RPC;
- toda RPC mutante é idempotente por `request_id` com hash de payload;
- nada é apagado fisicamente: `deleted_at` mais a tabela `audit_log`.

### Duas medidas de desempenho

O produto distingue, desde a v93, duas coisas que costumam ser confundidas:

- **desempenho oficial** — acertos sobre questões `main`. É a nota da meta e o
  critério de ordenação dos blocos;
- **aproveitamento total** — acertos sobre `main` + `extra` + `reinforcement`.

As duas saem do mesmo ledger, por `vw_block_performance`. O caderno de erros
(`vw_block_errors`) reúne as três fases, cada questão rotulada com a fase da
ocorrência mais recente.

O reforço automático a cada três sessões continua avaliando **somente** as
principais — `record_reinforcement` soma `main_count`/`main_correct` e exige
revisão apenas dos erros de `phase = 'main'`.

`npm run db:test` recria a base e roda 59 checagens de invariante: fluxo
completo com replay em cada RPC, isolamento de RLS entre dois alunos de
professores diferentes, o ciclo de reforço, e o recorte por fase. Cada checagem
que testa um estado proibido usa `raise exception` se o banco aceitar — então a
suíte falha quando uma constraint desaparece, não só quando o código quebra.

`supabase/seed.sql` cria as metas chamando as RPCs reais, com o professor
impersonado. Se uma regra de negócio regredir, `supabase db reset` falha em vez
de gravar dado inválido.

## Roteamento

Rotas explícitas, um arquivo por tela. A versão anterior usava catch-all por
papel (`/aluno/[[...segments]]`), que centralizava o controle de acesso mas
fazia qualquer tela puxar o bundle de todas as outras.

O controle de acesso mora em três camadas:

1. `src/proxy.ts` renova a sessão antes de qualquer renderização;
2. o layout de cada área chama `requireRole`, que redireciona para a home do
   papel real quando o papel não bate;
3. as telas de estudo do aluno chamam `requireStudentAccess`, que exige
   assinatura ativa. Conta e lista de espera ficam de fora dessa exigência —
   quem ainda aguarda liberação precisa conseguir se cadastrar.

`src/lib/routes.ts` é a única fonte dos caminhos; nada monta URL na mão.

## Decisões pendentes

- **Admin não enxerga dado de domínio.** A RLS usa
  `can_view_context(student_id, teacher_id)`, que não reconhece o papel admin.
- **`data_collection_permissions` no manifesto.** O `web-ext lint` avisa que a
  chave será obrigatória. Declarar o que a extensão coleta é decisão de
  política, não técnica, e precisa ser resolvida antes de publicar na AMO.
- **Motor de seleção de questões.** `pickQuestions` hoje só ordena por menos
  vistas. Erros recentes, espaçamento e correlação de tópico faltam.
