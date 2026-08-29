# Arquitetura

O repositório entrega três coisas que precisam evoluir juntas: o site, a
extensão de navegador e o banco. Elas estão no mesmo repositório porque
compartilham contratos que, quando versionados separadamente, derivam.

## Mapa

```
bora-estudar/
├── apps/
│   ├── web/                 # SPA React + Vite — painéis de aluno e professor
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

`docs/fluxos-e2e.md` cataloga os fluxos exercitáveis de ponta a ponta, no
formato que um teste e2e precisa. `docs/bugs-encontrados.md` registra a
varredura de QA que produziu esse catálogo.

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

Daí decorre uma propriedade que simplifica o deploy: **a extensão é agnóstica
de ambiente**. O `manifest.json` só pede permissão em `tecconcursos.com.br`, e
o `returnUrl` chega dentro do payload — quem o monta é o `StartQuizButton`, a
partir de `location.origin`. O mesmo `dist/` serve local, staging e produção,
desde que compilado do mesmo commit. O que amarra as duas pontas não é
configuração, é o `PROTOCOL_VERSION`.

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

`npm run test:e2e` percorre essa cadeia inteira sem navegador, contra o
Supabase local: 21 checagens que vão da abertura da sessão até a meta concluída,
incluindo a retentativa com o mesmo `requestId` e a prova de que a segunda
bateria do bloco não repete nenhuma questão da primeira.

### Onde mora o acoplamento com o TEC

Todo o conhecimento do HTML de terceiro está em
`apps/extension/src/content/tec-page.ts`: os seletores da questão e do
resultado, a navegação e a observação da página. Quando o TEC mudar o layout —
e vai mudar — só esse arquivo é tocado. O motor de seleção
(`content/engine.ts`) é função pura e tem testes próprios.

Uma sutileza que parece bug e não é: ao abrir uma questão que o aluno já
resolveu antes, fora desta bateria, o TEC mostra o resultado de imediato. O
content script guarda esse id na abertura e ignora o resultado até o primeiro
clique num controle de resposta — sem isso, um acerto antigo entraria como se
tivesse acabado de acontecer.

## Banco

O contrato está em `supabase/migrations`. Resumo do que a arquitetura assume:

- `quiz_session_questions` é um ledger append-only e a única fonte de
  desempenho; todo agregado vem de view, nunca de contador mantido à mão;
- a escrita se divide entre planejar e executar: o professor grava direto em
  `study_plans`, `study_plan_blocks`, `goals` e `subscriptions`, restrito por
  RLS e por grant de coluna; as tabelas de execução só mudam por RPC;
- toda RPC mutante é idempotente por `request_id` com hash de payload;
- nada é apagado fisicamente: `deleted_at` mais a tabela `audit_log`.

### Linha de base do schema

Contagens conferidas por consulta ao banco, para servir de referência quando
alguém precisar saber se algo regrediu:

| | |
|---|---|
| Tabelas | 21, todas com RLS habilitada |
| Policies | 33 |
| Views | 5, todas com `security_invoker = true` |
| `DELETE` para `anon`/`authenticated` | zero, em tabela nenhuma |
| Funções em `public` | 16, das quais 11 com `execute` para `authenticated` |
| Gatilho de criação de perfil | presente e ativo em `auth.users` |

Atenção ao nome do último: o gatilho chama-se **`on_auth_user_created`**;
`tg_create_profile_for_new_user` é a função que ele executa. Procurar pelo nome
da função na lista de gatilhos não acha nada.

As 11 funções com grant são as da API pública — as quatro `tg_*` e
`reserve_operation` ficam sem grant para papel nenhum, desde a migration
`20260829183000_harden_function_grants.sql`. Ver BUG-14 em
[`bugs-encontrados.md`](bugs-encontrados.md) para o que isso corrigiu.

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

## O site é uma SPA, e por que isso é possível

`apps/web` é React servido por Vite: arquivo estático, sem servidor de
aplicação. Isso não é uma escolha de conveniência — é uma consequência de onde
a fronteira de segurança está.

Nada no site guarda segredo. Toda leitura passa por RLS, toda escrita de
execução passa por RPC, e o bundle carrega apenas a publishable key, que é
pública por definição. Não existe caminho em que o front decida o que a pessoa
pode ver: quem decide é o banco. Retirar a camada de servidor não afrouxou
nenhuma verificação porque nenhuma verificação morava nela.

O que a camada de servidor de fato fazia era atender ao framework. Dois
arquivos existiam só por isso, e o comentário de ambos dizia a razão em voz
alta — "só Route Handler grava cookie", "Server Component não consegue gravar
cookie". No navegador, gravar cookie é o comportamento normal do cliente do
Supabase, então os dois desapareceram.

O que se perdeu, explicitamente: não há mais HTML renderizado no servidor, e a
primeira pintura espera a cascata de sessão (validar token, ler perfil, ler
assinatura). Como toda tela é painel autenticado e não existe superfície de
marketing, nenhuma delas dependia de SEO nem de primeira pintura instantânea.
Também não há mais status HTTP 404: o servidor devolve o mesmo `index.html` para
qualquer caminho, e "este aluno não é seu" é uma decisão que depende de
autenticação e RLS — coisas que só acontecem depois de a página carregar.

### Roteamento

A árvore de rotas está em `src/router.tsx`, explícita numa estrutura de dados.
Cada tela é um arquivo em `src/routes/`, e o dado de cada uma vem de um `loader`
— que é o corpo do componente assíncrono de antes, movido para fora da
renderização, sem mudar uma consulta.

Duas coisas que o framework fazia e agora são explícitas:

- **título da aba** — declarado no `handle` da rota e aplicado por um efeito
  único em `RootLayout`, no lugar de `export const metadata` em 19 arquivos;
- **redirecionar e revalidar depois de uma action** — a action devolve
  `redirectTo` ou `success`, e `useFormActionState` executa. É o par
  `redirect()` + `revalidatePath()` de antes, num lugar só.

Os formulários não mudaram de forma: `useActionState` e `useFormStatus` são
React 19, não do framework, e aceitam função async comum.

O controle de acesso mora em duas camadas:

1. o `loader` do layout de cada área chama `requireRole`, que redireciona para a
   home do papel real quando o papel não bate;
2. o `loader` de cada tela de estudo chama `requireStudentAccess`, que exige
   assinatura ativa. Conta e lista de espera ficam de fora dessa exigência —
   quem ainda aguarda liberação precisa conseguir se cadastrar.

A renovação do token deixou de precisar de camada própria: o cliente do
Supabase no navegador renova sozinho, o que dispensa o `proxy.ts` que rodava
antes de cada renderização.

Vale repetir o que isso NÃO é: essas duas camadas são conveniência de
navegação, não segurança. Quem recusa acesso a dado é a RLS. Uma guarda de
rota no cliente pode ser burlada por qualquer pessoa com um console aberto, e
continua não rendendo uma linha de outro aluno.

`src/lib/routes.ts` é a única fonte dos caminhos; nada monta URL na mão — nem a
sidebar, nem os redirecionamentos, nem a árvore de rotas.

### A sessão é consultada uma vez por navegação

`getSessionContext()` memoiza a consulta **em voo**, e só ela. O React Router
dispara os loaders de todas as rotas casadas em paralelo, então o layout da
área e a página pedem o contexto no mesmo instante; sem a memoização seriam
duas idas ao servidor de auth e quatro consultas por navegação.

A memoização é liberada quando a consulta termina, de propósito: guardar o
contexto entre navegações deixaria `hasAccess` velho, e o aluno cujo acesso o
professor acabou de liberar continuaria empurrado para a lista de espera até
recarregar a página.

## Decisões pendentes

- **Admin não enxerga dado de domínio.** A RLS usa
  `can_view_context(student_id, teacher_id)`, que não reconhece o papel admin.
  Por ora `requireRole("teacher")` aceita admin — espelhando o `is_teacher()`
  do banco, que é `role in ('teacher','admin')` — e ele cai na área do
  professor, vazia. Antes disso o admin não conseguia entrar: a home dele era
  a área do professor, e essa área o devolvia para a própria home. Uma área de
  administração de verdade ainda precisa ser desenhada.
- **`data_collection_permissions` no manifesto.** O `web-ext lint` avisa que a
  chave será obrigatória. Declarar o que a extensão coleta é decisão de
  política, não técnica, e precisa ser resolvida antes de publicar na AMO.
- **Correlação de tópico na seleção.** `pickQuestions` já prioriza inéditas,
  depois mais erradas, depois vistas há mais tempo. Falta agrupar por tópico
  quando o aluno erra muito na mesma matéria.
- **Reforços e extras na extensão.** O ledger e as RPCs aceitam as três fases;
  o content script hoje só conduz a fase `main`.
