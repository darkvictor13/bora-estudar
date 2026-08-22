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
│   └── seed.sql             # Usuários e dados de desenvolvimento
└── docs/
```

Workspaces do npm. Sem Turborepo, Lerna ou pnpm: quatro pacotes não justificam
uma camada extra de orquestração, e `npm run <script> --workspaces` resolve.

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
- `historicoCompleto: boolean`, para o site poder admitir que não conseguiu
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
  web ──┤ RPC iniciar_bateria  ──────────────► supabase
        │ ◄── bateria (id, numero, alvo)
        │
        │ monta BateriaInicio + histórico (view vw_questoes_vistas)
        │ redireciona para tecconcursos.com.br/#boraBateriaInicio=<base64url>
        ▼
  extensão lê a hash, PERSISTE a sessão, e só então limpa a hash
        │
        │ aluno responde as questões; cada resposta vai para storage.local
        │
        │ ao finalizar: gera requestId UMA vez, AGUARDA a gravação,
        │ e só então navega
        │ redireciona para <urlRetorno>#boraBateriaResultado=<base64url>
        ▼
  web lê a hash ──► RPC finalizar_bateria (idempotente por requestId)
        │           e só limpa a hash DEPOIS da confirmação
        ▼
  aluno registra o tempo ──► RPC registrar_tempo_bateria ──► meta concluída
```

As duas ordenações em maiúsculas são deliberadas. Invertê-las reintroduz as
duas perdas silenciosas de resultado que existiam na versão anterior: limpar a
hash antes de confirmar a gravação, e navegar antes de a sessão chegar ao disco.

## Banco

O contrato está em `supabase/migrations`. Resumo do que a arquitetura assume:

- `bateria_questoes` é um ledger append-only e a única fonte de desempenho;
  todo agregado vem de view, nunca de contador mantido à mão;
- o cliente **lê** tabelas e views (filtradas por RLS) e **escreve** apenas por
  RPC — as tabelas transacionais não têm grant de INSERT/UPDATE/DELETE;
- toda RPC mutante é idempotente por `request_id` com hash de payload;
- nada é apagado fisicamente: `excluido_em` mais a tabela `auditoria`.

`supabase/seed.sql` cria as metas chamando as RPCs reais, com o professor
impersonado. Se uma regra de negócio regredir, `supabase db reset` falha em vez
de gravar dado inválido.

## Decisões pendentes

- **Roteamento do `apps/web`.** Ainda não há rotas de aluno/professor. A versão
  anterior usava catch-all por papel (`/aluno/[[...segments]]`), que centraliza
  o controle de acesso mas custa legibilidade e code splitting.
- **Admin não enxerga dado de domínio.** A RLS usa
  `pode_ver_contexto(aluno_id, professor_id)`, que não reconhece o papel admin.
- **Faltam RPCs de escrita para planejamento.** Como o INSERT direto está
  revogado, hoje o professor não consegue criar planejamento nem bloco pela
  aplicação; só o seed consegue, porque roda como superusuário.
- **`data_collection_permissions` no manifesto.** O `web-ext lint` avisa que a
  chave será obrigatória. Declarar o que a extensão coleta é decisão de
  política, não técnica, e precisa ser resolvida antes de publicar na AMO.
- **Motor de seleção de questões.** `selecionarQuestoes` hoje só ordena por
  menos vistas. Erros recentes, espaçamento e correlação de tópico faltam.
