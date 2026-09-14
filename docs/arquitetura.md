# Arquitetura

O repositório entrega duas coisas que precisam evoluir juntas: o site e o
banco. Elas estão no mesmo repositório porque compartilham contratos que,
quando versionados separadamente, derivam.

> **A extensão de navegador foi removida**, e com ela `packages/protocol`. Este
> documento guarda o registro do que ela era e do que ficou no lugar — o que
> ainda descreve o sistema está no presente; o que descreve a extensão está
> marcado como histórico.

## Mapa

```
bora-estudar/
├── apps/
│   ├── web/                 # SPA React + Vite — painéis de aluno e professor
│   └── e2e/                 # Suíte Playwright, contra o site
├── packages/
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

Workspaces do npm. Sem Turborepo, Lerna ou pnpm: três pacotes não justificam
uma camada extra de orquestração, e `npm run <script> --workspaces` resolve.

## Idioma

Identificadores em inglês — no TypeScript e também no banco: tabelas, colunas,
enums, valores de enum e funções. Comentários, mensagens de erro, texto de
interface e descrições de teste em português, porque é o idioma do time e do
usuário final.

## Por que os limites estão onde estão

### `packages/protocol` era o núcleo da decisão — histórico

Site e extensão trocavam dados pelo fragmento (`#`) da URL, e esse contrato era
a peça mais frágil do sistema: as duas pontas eram versionadas separadamente na
prática — o site atualizava sozinho, a extensão só quando o usuário quisesse.
Por isso existia **uma** definição, importada pelos dois, com `PROTOCOL_VERSION`
comparada em toda leitura e validação de runtime na fronteira.

Duas lições dali continuam valendo para qualquer fronteira que venha a
substituí-la:

- **uma definição só, importada pelas duas pontas.** Na versão anterior do
  produto cada lado mantinha sua cópia das formas de payload, e elas derivaram;
  o sintoma aparecia só em runtime, quando um campo chegava faltando;
- **admitir o que não se sabe.** O payload levava `historyComplete: boolean`
  para o site poder dizer que não conseguiu carregar o histórico inteiro. A
  versão anterior marcava o histórico como autoritativo mesmo truncado, e o
  motor passava a repetir questões em silêncio.

### `packages/database` é separado de `web`

Os tipos vêm de `supabase gen types` e são versionados. Ficam num pacote, e não
dentro de `apps/web`, por dois motivos: o diff de cada migration mostra o
impacto na superfície de tipos, e Edge Functions futuras consomem os mesmos
tipos sem depender do app.

### A extensão não falava com o Supabase — histórico

Ela recebia um payload do site e devolvia outro. Nunca via uma chave do
Supabase, nunca abria conexão com o banco: o pacote distribuído na loja não
carregava credencial, e toda regra de negócio permanecia atrás das RPCs, onde é
verificável. É a mesma exigência que qualquer superfície de execução nova
precisa cumprir.

## Fluxo de uma bateria

**A execução não existe hoje.** O caminho abaixo é o que havia até a remoção da
extensão, e está aqui porque o banco continua exatamente assim — quem desenhar a
execução nova encaixa no mesmo ledger.

```
  aluno pede para iniciar
        │
  web ──┤ RPC start_quiz_session ──────────────► supabase
        │ ◄── quiz_session (id, session_number, main_target)
        │
        │ [removido] payload com o catálogo do bloco e o histórico do aluno
        ▼
  [removido] a extensão conduzia as questões no TEC e devolvia o resultado
        │
        ▼
  web ──► RPC finish_quiz_session (idempotente por requestId)
        │
        ▼
  aluno registra o tempo ──► RPC record_quiz_session_time ──► goal concluída
```

Do que sobrou, a parte viva é a última linha: `record_quiz_session_time` e o
cancelamento continuam na tela do aluno, e são o que fecha uma sessão que já
esteja aberta.

Duas propriedades do desenho antigo valem ser lembradas antes de escrever o
novo, porque cada uma corresponde a uma perda real de bateria já respondida:
**confirmar a gravação antes de descartar a única cópia do resultado**, e
**gerar o `request_id` uma vez, na origem, reusando-o em toda retentativa**.

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
- **Como o aluno responde uma bateria.** É a pendência que a remoção da
  extensão abriu, e a maior: o banco tem a sessão, o ledger e as três fases;
  não há superfície que as execute. Enquanto não houver, a tela do aluno abre
  nenhuma bateria — de propósito, para não produzir sessão travada.
- ~~**Reforços e extras na extensão.**~~ Sem efeito: as três fases eram
  conduzidas pelo content script, que saiu. As fases continuam no schema
  (`question_phase`) e nos agregados.
- ~~**Correlação de tópico na seleção.**~~ Sem efeito pelo mesmo motivo: o
  rodízio por tópico vivia no motor da extensão. O tópico continua no catálogo
  e no ledger, que é o que uma seleção nova precisa.
