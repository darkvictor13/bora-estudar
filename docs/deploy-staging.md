# Automação do deploy

Plano do pipeline. **Staging publica sozinho a cada commit na `main`; produção
sai por disparo manual.** Cobre banco e site, na ordem em que precisam subir.

Onde este arquivo se encaixa nos outros:

- [`ambiente-staging.md`](ambiente-staging.md) é o runbook da montagem manual —
  criar projeto, aplicar schema, configurar auth. **Está no `.gitignore`**, por
  conter ref de projeto e chave; se você clonou o repositório e ele não existe,
  é isso.
- [`deploy-cloudflare.md`](deploy-cloudflare.md) é o passo 5 daquele runbook
  resolvido para o Cloudflare, feito à mão, de uma máquina.
- **Este arquivo** é o mesmo trabalho feito por CI, com o banco na frente do
  site.

**Os workflows existem.** Foram escritos em 29/08/2026, e este arquivo deixou
de ser um plano de YAML para ser o registro do porquê de cada decisão — a seção
"Os workflows" aponta para os arquivos reais e lista onde a implementação
divergiu do plano, com o motivo. O que roda hoje sem nunca ter rodado no
GitHub, e o que foi medido de verdade, está no fim.

---

## Modelo de deploy

Um branch só. `main` é o tronco, é o default do repositório, e é o que já
existe hoje — não há branch a criar nem default a trocar.

| Ambiente | Gatilho | Quem dispara |
|---|---|---|
| staging | push em `main` | qualquer commit, sem intervenção |
| produção | `workflow_dispatch` | uma pessoa, clicando |

**Staging é o espelho contínuo da `main`.** Não existe "promover para staging":
o que está na `main` está em staging alguns minutos depois. Isso é o que dá
valor ao ambiente — se ele estiver atrás, ninguém confia no que testou lá.

**Produção é uma decisão, não uma consequência.** O commit já rodou em staging;
publicar é escolher quando. Não há PR de promoção, não há branch de produção, e
por isso também não há as duas armadilhas que um modelo de dois branches
traz — divergência por squash e hotfix que precisa de back-merge. Elas
simplesmente não existem aqui.

Quatro consequências que não são automáticas:

**1. A proteção de produção sai da branch e vai para o Environment.** Num modelo
de dois branches, quem protege produção é a regra de escrita em `main`. Aqui não
há branch de produção: o que separa um clique de um deploy é o GitHub
Environment `producao` — a *deployment branch rule* limitando-o a `main` e, se
quiser, o *required reviewer*. Sem a branch rule, um `workflow_dispatch`
disparado de qualquer branch lê os secrets de produção e publica código que
nunca passou por staging. **Essa configuração deixou de ser opcional.**

**2. A janela entre banco e site existe nos dois ambientes, e em produção ela é
longa.** Em staging os dois sobem no mesmo pipeline, com minutos de diferença.
Entre um commit e o deploy manual de produção podem passar dias e dezenas de
commits. Então: **toda migration precisa ser compatível com o bundle que já está
no ar** — coluna nova nasce `nullable` ou com default, RPC nova não substitui a
antiga no mesmo commit.

**3. O `db push` de produção aplica um lote, não uma migration.** Como produção
acumula, um deploy manual pode rodar dez migrations de uma vez. O
`db push --dry-run` que vai para o log antes da execução é o registro do que
aquele lote fez — é a única coisa que responde "o que mudou no banco naquele
dia".

**4. Produção ainda não existe, e será um projeto novo.** Hoje só staging está
montado; produção sai quando o app estiver bom, num projeto Supabase criado na
hora. (A organização já teve um segundo projeto, e o runbook mandava não
confundir os dois no `--linked`; ele não existe mais — hoje `projects list`
devolve só o de staging.) O workflow de produção pode ser escrito desde já:
ele não roda
enquanto ninguém clicar. É a vantagem prática do disparo manual — não precisa de
flag de desligamento.

---

## Proteção de branch

`main` recebe commit direto por desenho: é o tronco, e todo push publica
staging. O freio de segurança é o pipeline, não a plataforma — o job `verificar`
roda antes do de banco, então push quebrado não publica nada.

O que vale ligar em Settings → Rules → Rulesets, num ruleset só em `main`:

| Regra | Por quê |
|---|---|
| Restrict deletions | não custa nada e o branch é o único |
| Block force pushes (non-fast-forward) | staging rastreia a `main`; reescrever histórico embaixo de um commit publicado deixa o ambiente apontando para código que não existe mais |

**Exigir PR e status check em `main` é opcional aqui**, e é escolha de fluxo de
trabalho, não de segurança: o gate de qualidade que impede um deploy ruim é o
job `verificar`, que roda em push também. Se ligar "Require a pull request" e
"Require status checks", ligue **sem bypass** — um ruleset em que o dono passa
por cima do status check protege exatamente ninguém, já que ele é a única pessoa
que dá push. E lembre que **bypass é concedido por ruleset, não por regra**: é
por isso que misturar "restringir escrita" com "exigir verificação" no mesmo
ruleset não funciona.

**Não ligue "Require linear history"** se um dia voltar a existir branch de
promoção — ela proíbe merge commit. Com um branch só, é indiferente.

Duas restrições da plataforma que continuam valendo, caso o modelo mude:

- "Restrict who can push to matching branches", da proteção clássica, é
  exclusiva de repositório de organização. Este é pessoal (`darkvictor13`).
- Rulesets resolvem, e são gratuitos porque o repositório é público.

---

## O repositório é público

Três consequências para o CI, e uma é proibição:

- **PR vinda de fork não recebe secret nenhum.** É o padrão do GitHub, e é por
  isso que `ci.yml` e `ci-banco.yml` foram desenhados sem credencial: rodam
  igual vindos de fork.
- **`deploy-staging.yml` dispara só em push de branch**, nunca em
  `pull_request` — não existe caminho por onde um fork acione deploy. E
  `deploy-producao.yml` dispara só em `workflow_dispatch`, que exige permissão
  de escrita no repositório.
- **Nunca usar `pull_request_target`.** É o gatilho que roda com os secrets do
  repositório e o código da PR junto; em repositório público, é entregar a
  chave.

É também por isso que `docs/ambiente-staging.md` está no `.gitignore`, e por isso
que este arquivo cita ref de projeto e domínio pelo nome do lugar onde eles
estão, não pelo valor.

---

## Por que GitHub Actions, e não os painéis

Cloudflare e Supabase têm, cada um, uma integração que faz deploy por commit sem
YAML nenhum. As duas foram avaliadas.

**Workers Builds (Cloudflare)** conecta o repositório por Worker e oferece
*root directory*, *build command*, *deploy command* (padrão `npx wrangler
deploy`), *build watch paths* para monorepo e **build variables and secrets que
existem só durante o build** — ou seja, resolve corretamente o problema das
`VITE_*`. O *branch control* cobriria staging: Worker de staging lendo `main`.
Não cobre produção neste modelo: o produto é orientado a commit, e o que se quer
em produção é justamente o contrário — publicar quando alguém decidir, a partir
de um commit que já rodou em staging.

**Integração GitHub do Supabase**, com "Deploy to production" ligado, aplica as
migrations ao dar merge no branch de produção, e mais as Edge Functions e os
Storage buckets declarados no `config.toml`. A documentação é explícita sobre o
resto:

> "All other configurations, including API, **Auth**, and seed files, are
> ignored by default."

**A integração não empurra a config de auth.** `site_url` e
`additional_redirect_urls` — exatamente o que quebra staging e mata o link de
recuperação de senha — continuam manuais. O painel automatiza o passo fácil
(`db push`) e deixa o difícil. As preview branches por PR, que são o valor real
da integração, exigem plano Pro e são cobradas por compute-hour. E ela também é
por-commit: um deploy manual de produção não é o modelo dela.

**Onde os dois falham juntos, e é o mesmo lugar:** nenhum sabe da existência do
outro. O site pode subir antes de a migration existir, e o sintoma disso — a
tela do aluno quebrando numa RPC que "existe no código" — manda o time depurar
o front quando o problema é a ordem.

E um problema específico daqui: **`npm run build` de `apps/web` é `vite build`,
que não faz typecheck.** O `tsc --noEmit` é o script `typecheck`, separado. Um
Workers Builds com o build command óbvio publica sem reclamar um código que o
`npm run check` reprovaria. Neste repositório o gate de qualidade não é
subproduto do build.

**Decisão: GitHub Actions.** É o único lugar que ordena banco → site, roda o
`check` antes e a fumaça depois, faz produção sob demanda, e mantém tudo isso em
code review. Workers Builds e a integração do Supabase ficam **desligados** —
dois sistemas publicando o mesmo branch disputam quem escreve por último.

O preview por PR é bom demais para descartar: dá para tê-lo dentro do Actions,
com `npx wrangler versions upload --env staging` numa PR, sem promover nada.
Fica como fase 2.

---

## O que o pipeline precisa garantir

Tudo derivado do código, não de preferência:

| Exigência | Por quê |
|---|---|
| `npm run check` verde antes de publicar | `vite build` não faz typecheck; o gate é explícito ou não existe |
| Migration aplicada **antes** do bundle novo | o bundle novo é quem chama a RPC nova; a ordem inversa quebra a tela |
| As duas `VITE_*` no ambiente do **build** | substituição estática do Vite: a chave é assada no bundle |
| Fumaça por conteúdo, nunca por status | o fallback de SPA devolve 200 para qualquer caminho |
| Nunca `seed.sql`, nunca `db:reset` contra a nuvem | senha em texto claro e escrita direta em `auth.users` |
| Produção só a partir de `main` | é o único código que passou por staging |

---

## O ambiente de staging já existe

Os ambientes criados para teste **são** o staging deste plano. Não há projeto
novo a criar de nenhum dos dois lados, e não é coincidência: os dois nomes já
batem com o que o repositório produz.

Conferido contra a infraestrutura real em 29/08/2026:

| O que | Estado |
|---|---|
| Projeto Supabase `bora-estudar-staging` | `ACTIVE_HEALTHY`, sa-east-1, Postgres 17.6 |
| Ref do projeto × `[remotes.staging].project_id` | batem |
| Migrations local × remoto | a mesma única migration dos dois lados; **zero drift** |
| Worker `bora-estudar-staging` | publicado, com deployment de 25/08/2026 |
| Nome do Worker × `--env staging` | batem — o CI publica **por cima**, não cria um segundo |
| Rota funda, caminho do link de e-mail | 200 nos dois |
| Cache | `no-cache` na casca, `immutable` no asset — sem concatenação |
| `site_url` e allowlist de auth | já apontam para o domínio do Worker |

**Que a auth já esteja certa foi o achado que mais muda o plano**, porque
estava registrada como pendente. A sondagem: um `verify` de recuperação com
`redirect_to` fora da allowlist cai no `site_url` do projeto, e o `Location`
da resposta o revela. Ele devolve o domínio do Worker de staging, não
`localhost:3000`. Com o caminho real do e-mail — `/confirmar?next=…` — o
`Location` volta com o caminho **e a query preservados**, o que só acontece se
`/**` estiver na allowlist. Recuperação de senha funciona em staging hoje.

Isso não quer dizer que `supabase config push` rodou; quer dizer que o projeto
está no estado que ele produziria. A pendência de empurrar o `[remotes.staging]`
deixa de ser um conserto e passa a ser uma escolha — e uma com risco, porque o
push leva a config inteira e o que está no ar já está certo.

**O primeiro `db push` do CI será no-op.** É o melhor estado possível para
ligar o pipeline: o job de banco estreia sem nada a aplicar, então uma falha
ali no primeiro run é problema de credencial, não de schema.

Duas ressalvas do reuso, nenhuma bloqueante:

- **Staging herda os dados do ambiente de teste** — inclusive usuários criados
  à mão para experimentar. Some com a regra que já estava escrita: a suíte e2e
  dá `delete from auth.users`, então continua proibido apontá-la para lá.
- **Quanto de conteúdo existe no banco não foi verificado** (exige credencial
  de admin). O runbook registrou zero usuários e zero questões em 23/08; se
  ainda for assim, staging sobe corretamente e não serve para testar nada
  enquanto o passo 4 do runbook não rodar. Isso é trabalho de dados, não de
  pipeline.

---

## O que já existe

Tudo o que este plano previa, menos a configuração que só existe no GitHub e no
Cloudflare:

| No repositório | Estado |
|---|---|
| `.github/workflows/` | os quatro workflows; ver "Os workflows" |
| `scripts/fumaca.sh` | teste de fumaça, usado pelo CI e executável à mão |
| `apps/web/wrangler.jsonc` | `env.staging` vazio (o sufixo dá `bora-estudar-staging`) e `env.producao` com `name` explícito |
| `apps/web/public/_headers` | política de cache, com a concatenação de regras já medida e contornada |
| `supabase/config.toml` | bloco `[remotes.staging]` com `project_id` e o `site_url` do domínio real |
| `package.json` | `wrangler` pinado em `4.125.0` — sem isso `npx wrangler` resolve o que houver de mais novo no dia, no CI e na sua máquina |
| `CLAUDE.md` | seção "Deploy", com o que não é dedutível do código |
| `.gitignore` | `.wrangler/` ignorado |

**O `env.producao` entrou antes de produção existir**, ao contrário do que o
plano dizia. O motivo é o `deploy-producao.yml`: ele referencia `--env
producao`, e um workflow que aponta para um ambiente inexistente no
`wrangler.jsonc` é um arquivo incoerente esperando o dia do primeiro clique
para revelar isso. O bloco é config, não recurso — não cria nada no Cloudflare.
Dry-run dos dois ambientes conferido.

**Deploy sempre com `--env`.** Um `wrangler deploy` sem a flag publica o Worker
`bora-estudar` do nível superior, que não é ambiente nenhum.

---

## Os workflows

Existem, em `.github/workflows/`. Esta seção registra só o que **diverge do
plano** — o resto está nos arquivos, comentado no lugar onde importa.

| Arquivo | Gatilho | Jobs |
|---|---|---|
| `ci.yml` | PR em `main`, `workflow_call`, dispatch | `check` |
| `ci-banco.yml` | PR que toca em `supabase/**` ou `packages/database/**` | `invariantes` |
| `deploy-staging.yml` | push em `main`, dispatch | `verificar` → `banco` → `site` → `fumaca` |
| `deploy-producao.yml` | `workflow_dispatch` | `resolver` → `verificar` → `banco` → `site` → `fumaca` |

### Cinco divergências do plano, e o porquê

**1. O gate é um workflow reusável, não uma cópia por arquivo.** O plano aceitava
duplicar os steps de verificação nos três lugares. Ao escrever, isso ficou
insustentável: um gate copiado deriva, e a forma como ele deriva é perder um
step — o `ext:build`, digamos — em uma cópia só. O resultado é staging
publicando o que o `npm run check` reprovaria, sem nada vermelho na tela.
`ci.yml` ganhou `workflow_call` com dois inputs (`ref` e `wrangler_env`) e os
dois deploys o chamam. Segue valendo o que motivou separar os deploys em dois
arquivos: nenhum `environment:` é calculado por expressão.

**2. `actions/checkout@v7` e `actions/setup-node@v7`.** O plano escrevia `@v6` e
`@v5`, os dois defasados. Conferido pela API do GitHub: são os majors estáveis
mais recentes, de junho e julho de 2026.

**3. O input `commit` de produção deixou de ter furo.** O plano documentava que
a deployment branch rule valida o *ref* do dispatch e não o SHA do input, e
oferecia apagar o input como saída. O job `resolver` resolve melhor: faz
checkout de `main` com `fetch-depth: 0` e recusa qualquer SHA que não seja
ancestral dela, antes de qualquer job tocar em banco ou site. Testado nos dois
sentidos, inclusive com um commit fabricado fora da `main` — ver o fim do
arquivo. O input pode ficar, e produção continua publicando só código que
passou por staging.

**4. O teste de fumaça virou `scripts/fumaca.sh`.** Eram trinta linhas de shell
para duplicar entre dois workflows. Como script, roda à mão contra qualquer
ambiente — `scripts/fumaca.sh <site> <supabase>` — e foi assim que deu para
testá-lo de verdade antes de existir CI. Ele **acumula** as falhas em vez de
parar na primeira: o CI precisa dizer tudo o que está errado numa execução só.

**5. Nenhuma expressão `${{ }}` dentro de um `run:`.** Toda interpolação passa
por `env:` e o shell lê a variável. É a diferença entre um valor e um pedaço de
comando; num repositório público, com dispatch que aceita input, não vale
economizar as duas linhas.

### Detalhes que os arquivos carregam

- **`WRANGLER_SEND_METRICS: "false"`** nos jobs que chamam o wrangler. Sem isso
  cada execução imprime o aviso de telemetria no log.
- **O `|| true` no `grep` do `fumaca.sh` não é descuido.** Sob `set -o
  pipefail`, um `grep` sem casamento aborta o script no meio e as verificações
  seguintes nunca rodam — o CI falharia sem dizer o que estava errado. Foi
  encontrado rodando o caminho negativo, não lendo o código.
- **A fumaça espera o asset propagar, e é o content-type que diz que ele
  chegou.** A publicação no Cloudflare não fica visível de uma vez: o
  `index.html` já vinha da versão nova enquanto o pedido do bundle, noutra
  conexão, ainda caía onde o manifesto era o antigo — e ali o hash novo não
  existe, então o `not_found_handling: single-page-application` respondeu com o
  `index.html`. Os dois são 200; o que separa é `text/javascript` de
  `text/html`. Sem a espera, as checagens de conteúdo liam a casca em HTML e o
  CI acusava "build sem as VITE_*" com o bundle correto no ar — diagnóstico
  errado do problema certo, medido em 18/09/2026 onze segundos depois do
  deploy. Seis tentativas, cinco segundos entre elas; se ainda vier HTML, é
  falha de verdade, e o texto do erro passou a dizer isso.
- **`ci-banco.yml` roda `db:reset` entre `db:test` e `db:types`.** As suítes
  deixam a base truncada; é a mesma armadilha de ordem que o `CLAUDE.md`
  descreve entre `db:test` e `e2e`.
- **`deploy-producao.yml` avisa no cabeçalho que o Environment precisa existir
  antes.** Referenciar um Environment inexistente faz o GitHub criá-lo na hora,
  **sem proteção nenhuma** — o modo de falhar é parecer que funcionou.


## Segredos e variáveis

Por GitHub Environment (`staging`, e depois `producao`):

| Nome | Tipo | Conteúdo |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | token com permissão **Edit Cloudflare Workers**, escopado a uma conta |
| `CLOUDFLARE_ACCOUNT_ID` | var | do `wrangler whoami` |
| `SUPABASE_ACCESS_TOKEN` | secret | PAT do dashboard — não é o login do CLI |
| `SUPABASE_DB_PASSWORD` | secret | senha do Postgres do projeto |
| `SUPABASE_PROJECT_ID` | var | ref do projeto do ambiente |
| `VITE_SUPABASE_URL` | **var** | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **var** | `sb_publishable_…` |
| `SITE_URL` | var | domínio publicado do ambiente |

Nada no nível do repositório. Não há flag de "produção ativa": o workflow de
produção existe desde já e simplesmente não roda enquanto ninguém clicar.

**As duas `VITE_*` vão como var, não como secret**, por dois motivos. Elas são
assadas num bundle público e não escondem nada — `apps/web/src` não tem uma
única referência a `service_role`. E como secret o GitHub mascara a string no
log, que é exatamente a saída do teste de fumaça que confere se a chave entrou
no bundle.

No Environment `producao`, duas proteções:

- **Deployment branch rule limitada a `main`.** Obrigatória, pelo item 1 do
  modelo: é a única coisa que impede um dispatch de branch qualquer de ler os
  secrets de produção.
- **Required reviewer.** Opcional, e num repositório de uma pessoa vale menos
  como revisão do que como confirmação — o clique passa a exigir um segundo
  clique. Ligue se o disparo acidental preocupar; ignore se não.

---

## Armadilhas que o pipeline precisa respeitar

**`vite build` não faz typecheck.** O gate é `npm run check`, explícito, antes
do deploy — não o sucesso do build.

**Var de Worker não chega a bundle de Vite.** As `VITE_*` entram no `env:` do
step de build. Configuradas como variável do Worker ficam corretas no painel e
inúteis no produto, e o sintoma é a tela em branco reclamando de variável
ausente — o que faz o time procurar no lugar onde a variável está.

**`npm ci` na raiz; build por workspace.** São workspaces do npm.

**`--yes` no `db push`.** É flag global do CLI; vale para `config push` também.

**Nunca `--include-seed`, nunca `db:reset`/`db:test` contra a nuvem.** O
`seed.sql` tem senha em texto claro e escreve direto em `auth.users`; o
cabeçalho do arquivo proíbe ambiente compartilhado.

**Drift de tipos só se confere localmente.** `gen types --linked` sempre emite
o bloco `__InternalSupabase`; diff contra a nuvem acusa diferença sempre.

**Falha no job `site` deixa a migration aplicada.** A ordem banco → site é a
certa, mas ela tem esse custo: se o deploy do Worker falhar, o banco já mudou e
o bundle antigo continua no ar. É exatamente o cenário que a regra de
compatibilidade de migration cobre — e é a razão de ela valer também em staging,
onde a janela é de minutos.

**`supabase config push` fica fora do pipeline, e agora por um motivo mais
forte.** Ele é o caminho versionado para a allowlist de auth — a coisa que mais
quebrou staging — mas **a allowlist do projeto já está correta** (medido; ver
"O ambiente de staging já existe"), e o comando empurra a config inteira: rate
limits, templates, SMTP. Rodá-lo hoje não conserta nada e pode desfazer o que
está bom.

Pior: **`config push` não tem `--dry-run`** — conferido no `--help` do CLI
2.115.0, que só aceita `--project-ref`. Não existe "ver o diff sem empurrar"
como existe no `db push`. A revisão é o prompt de confirmação, o que exige
rodar sem `--yes` e ler com atenção. Um job de CI, que por definição roda com
`--yes`, empurraria sem ninguém ver. É por isso que este comando não vira job
antes de rodar uma vez à mão.

A integração do painel do Supabase também não resolve: não existe caminho
automático pronto para auth.

**A suíte e2e não roda contra staging pelo CI.** Três impedimentos
independentes: `auth.spec.ts` fala com o Mailpit, que não existe lá; as
fixtures dão `delete from auth.users`; e o `E2E_DATABASE_URL` pede conexão
direta na 5432, que é o caminho IPv6 que o runner do GitHub não alcança. Se um
dia entrar, entra num job com Supabase em Docker — e com `db:reset` entre o
`db:test` e o `e2e`, pela armadilha de ordem do `CLAUDE.md`.

**`_headers` mora em `public/`, e regras que casam o mesmo caminho
concatenam.** O Vite copia `public/*` a cada build, e o `dist` é descartável —
por isso o arquivo vive em `public/`. E o arquivo já resolve a armadilha
medida: `/*` com `no-cache` primeiro, `/assets/*` apagando o cabeçalho com `!`
antes de escrever `immutable`. Sem o `!`, o asset hasheado sai com
`immutable, no-cache`. Quem editar esse arquivo precisa saber disso; a fumaça
verifica os dois casos.

**Dois sistemas de deploy no mesmo branch se atropelam.** Se um dia o Workers
Builds for ligado, o job `site` sai do Actions no mesmo commit.

**`--output json` não é o que parece.** Essa flag é o formato das variáveis de
`supabase status`, não da listagem. Para extrair o ref de um script, a flag é
`--output-format json`, que devolve `{"projects":[...]}`. Um one-liner com a
primeira falha sem dizer por quê.

**O envio de e-mail do projeto hospedado é 2 por hora.** `email_sent`, no rate
limit do GoTrue, estrangula qualquer teste que passe por recuperação de senha —
e é justamente o fluxo que mais precisa de verificação manual. Subir esse teto
exige `[auth.email.smtp]` de verdade (Resend, SendGrid); o remetente embutido é
só para teste e não é configurável. Enquanto não houver SMTP próprio, planeje
em cima de 2 e-mails por hora, e mantenha `enable_confirmations = false` —
ligá-la sem SMTP deixa todo cadastro preso esperando um e-mail que não chega.

---

## Voltar atrás

```bash
npx wrangler rollback --config apps/web/wrangler.jsonc --env staging
npx wrangler rollback --config apps/web/wrangler.jsonc --env producao
```

Devolve o bundle anterior em segundos. O que ele **não** desfaz é migration nem
config de auth — daí a ordem banco → site e a regra de compatibilidade do item 2
do modelo. Banco é forward-only: reverter é migration nova.

Em produção existe um segundo caminho, mais lento e mais previsível: disparar
`deploy-producao.yml` de novo com o SHA anterior no input. O rollback do
wrangler devolve o bundle sem tocar em nada; o redeploy refaz o pipeline
inteiro, e o log fica com registro do que foi publicado.

---

## Decisões tomadas

1. **Staging acompanha a `main` sem intervenção.** Ambiente atrás do código é
   ambiente em que ninguém confia.
2. **Produção é disparo manual**, e por isso não precisa de branch própria, de
   PR de promoção nem de flag de desligamento. O que a protege é o Environment.
3. **Dois arquivos de deploy**, um por ambiente, em vez de um com o ambiente
   calculado por expressão. Some a única parte do plano anterior que dependia de
   comportamento não confirmado. O gate de qualidade, ao contrário, é **um só**,
   chamado pelos dois por `workflow_call`: separar os deploys protege a leitura,
   duplicar o gate protegeria nada e apodreceria.
4. **Produção fica para depois**, quando o app estiver bom. O
   `deploy-producao.yml` pode ser escrito junto com o resto: sem clique, não
   roda.
5. **Produção será um projeto Supabase novo.** Vale criar na mesma região de
   staging (sa-east-1) — número medido em staging só significa alguma coisa se a
   distância for a mesma.

## Pendências

1. **Criar o token do Cloudflare e o PAT do Supabase, e cadastrar o Environment
   `staging` — ANTES de os workflows chegarem à `main`.** A ordem importa: o
   `deploy-staging.yml` dispara no primeiro push, e sem os secrets o job `banco`
   morre no `supabase link`. Não estraga nada — o gate já passou e o site não é
   tocado —, mas o primeiro run fica vermelho por configuração ausente, que é a
   pior primeira impressão possível de um pipeline novo. É a única pendência que
   separa o repositório de um deploy automático: infraestrutura, schema e auth
   de staging já estão no lugar.
2. **Decidir o que fazer com `supabase config push`.** Deixou de ser um
   conserto — a auth remota já está certa. Continua valendo empurrar uma vez à
   mão para provar que o `[remotes.staging]` versionado reproduz o estado atual;
   mas sem `--dry-run`, e com o que está no ar funcionando, não há pressa.
3. **Criar o ruleset de `main`** (restrict deletions, block force pushes). Isso
   precisa ser feito com a conta `darkvictor13`: o `gh` autenticado nesta
   máquina é o `victor-almeida-xbri`, que não tem push no repositório e leva 403
   na API de administração.
4. **No dia da produção**, criar o Environment `producao` **com a deployment
   branch rule limitada a `main`** antes do primeiro dispatch. Referenciar um
   Environment que não existe faz o GitHub criá-lo na hora, sem proteção
   nenhuma — parece ter funcionado e não protegeu nada. O job `resolver` já
   recusa commit fora da `main`, mas ele não substitui a regra: quem dispara de
   outra branch ainda leria os secrets de produção.
5. **Rodar o pipeline uma primeira vez e olhar.** Nada aqui jamais executou num
   runner do GitHub; ver "O que foi verificado".

---

## O que foi verificado, e o que não

Conferido na documentação das ferramentas em 24/08/2026:

- Workers Builds: root directory, build command, deploy command, build
  variables restritas ao build, build watch paths, branch control com branch de
  produção configurável, e `--env <nome>` nos comandos de deploy;
- integração GitHub do Supabase: aplica migrations, Edge Functions e Storage
  buckets do `config.toml`, e **ignora API, Auth e seed** no deploy de
  produção; branching é Pro e as preview branches são cobradas por
  compute-hour;
- `supabase link` usa o pooler por padrão (`--skip-pooler` é o inverso), e
  `--yes` é flag global do CLI;
- `assets` é chave herdável entre ambientes do wrangler, e Worker sem `main`,
  só com assets, é configuração válida.

Conferido na documentação do GitHub em 24/08/2026:

- "Restrict who can push to matching branches" é exclusiva de repositório de
  organização;
- rulesets são gratuitos em repositório público, e "Restrict updates" restringe
  o push a quem tem bypass;
- o bypass é concedido por ruleset, e não por regra;
- "Require linear history" proíbe merge commit.

Executado de verdade em 29/08/2026, no repositório e contra a infraestrutura —
não é leitura de documentação:

- **o gate inteiro do `ci.yml`, localmente**: `npm run ext:build`, `npm run
  check` (typecheck, lint e testes de todos os workspaces) e `npm run build
  --workspace @bora/web` com as `VITE_*` placeholder. Tudo verde neste commit;
- **a sequência inteira do `ci-banco.yml`**: `npm run db:test` (todas as suítes
  de invariante passaram), depois `db:reset`, `db:types` e `git diff
  --exit-code packages/database/` sem drift;
- **`wrangler deploy --dry-run` SEM credencial nenhuma**, com `HOME` apontado
  para um diretório vazio e sem `CLOUDFLARE_API_TOKEN`, nos dois ambientes.
  Sai 0. É o que garante que o `ci.yml` roda igual numa PR vinda de fork, e a
  afirmação estava no plano sem ter sido medida;
- **`scripts/fumaca.sh` contra o staging publicado**: passou nas nove
  verificações. E contra um alvo que não é a SPA: reprovou as cinco aplicáveis,
  saiu 1, e — depois de corrigido o `pipefail` — reportou todas em vez de parar
  na primeira;
- **a validação de ancestralidade do `resolver`**, nos dois sentidos: aceita a
  ponta da `main`, um commit antigo dela e o input vazio; recusa um SHA
  inexistente, uma string com `;` (que chega como valor, nunca como comando) e
  um commit fabricado com `git commit-tree` fora da `main` — este último é o
  caso que o input existia para permitir e a regra existe para barrar;
- **os majors de `actions/checkout` e `actions/setup-node`**, pela API do
  GitHub: v7 estável nos dois, de junho e julho de 2026. O plano escrevia v6 e
  v5;
- **o YAML dos quatro workflows** parseia, e o grafo de `needs`/`uses` é o
  pretendido.

Conferido contra a infraestrutura real em 29/08/2026 — é o que sustenta a seção
"O ambiente de staging já existe":

- `supabase projects list` devolve **um só** projeto na org: `bora-estudar-staging`,
  ref igual ao `[remotes.staging].project_id`, sa-east-1, `ACTIVE_HEALTHY`;
- `supabase migration list --linked` mostra a mesma migration local e remota —
  sem drift, e o primeiro `db push` do CI é no-op;
- `wrangler deployments list --config apps/web/wrangler.jsonc --env staging`
  resolve para um Worker **que já existe**, com deployment de 25/08/2026: o CI
  publicaria por cima do ambiente de teste, não ao lado dele;
- o site responde 200 na raiz, em rota funda e no caminho do link de e-mail; a
  casca sai com `no-cache` e o asset hasheado com `immutable` **sem** o
  `no-cache` concatenado;
- o bundle publicado contém a URL do projeto de staging;
- **a auth remota já aponta para o domínio do Worker.** Medido por sondagem do
  `/auth/v1/verify`: `redirect_to` fora da allowlist cai no `site_url`, e o
  `Location` da resposta o revela como o domínio do Worker; com o caminho real
  do e-mail, o `Location` preserva caminho e query, o que prova o `/**` na
  allowlist;
- **o `grep -qE 'sb_secret|service_role'` do teste de fumaça reprova o bundle
  real.** `@supabase/supabase-js` carrega o literal `sb_secret_` num validador
  de formato de chave. O padrão corrigido,
  `sb_secret_[A-Za-z0-9_-]{10,}`, dá zero no mesmo bundle, e o controle
  positivo confere: a publishable key inteira é encontrada pelo padrão
  equivalente;
- `supabase config push --help` (CLI 2.115.0) não oferece `--dry-run`.

Conferido neste repositório:

- `main` é o branch padrão e o único no remoto; não existe branch `staging`, e
  este plano não cria nenhuma;
- `web-ext lint` sai com código 1 quando o `--source-dir` não existe — é o que
  quebra `npm run check` em clone limpo;
- `apps/web` compila com `vite build`, e `typecheck` é script separado;
- as fixtures do e2e apagam linhas de `auth.users`;
- `--env staging` sobre o `wrangler.jsonc` atual publica o Worker
  `bora-estudar-staging` — o domínio resultante é o que está no
  `[remotes.staging]` do `config.toml`;
- a concatenação de regras do `_headers` foi medida na mão, e o contorno com
  `!` está no próprio arquivo;
- o repositório é público, pertence a `darkvictor13`, e hoje **não tem nenhum
  ruleset nem proteção em `main`** — conferido pela API.

**Não verificado:**

- **nenhum workflow rodou num runner do GitHub.** Os comandos foram executados
  um a um nesta máquina, na mesma ordem e com os mesmos argumentos, mas o que
  só existe no Actions segue sem prova: `workflow_call` entre os arquivos, os
  Environments, a leitura de `secrets`/`vars`, o `concurrency`, e o cache do
  `setup-node`. A primeira execução é o teste;
- **o comportamento do GitHub ao referenciar um Environment inexistente.** O
  cabeçalho do `deploy-producao.yml` afirma que ele o cria sem proteção; é o
  entendimento da documentação, não medição;
- o comportamento exato da deployment branch rule de um Environment sob
  `workflow_dispatch`, e se o *required reviewer* permite que quem disparou
  aprove o próprio deploy (há uma opção "prevent self-review"; não foi
  conferida). Nada disso bloqueia staging;
- `${{ inputs.commit || github.sha }}` como `ref` de checkout — a expressão é
  trivial, mas ninguém a rodou aqui;
- se o branch de produção da integração GitHub do Supabase é configurável por
  projeto (a documentação não afirma). Como a decisão foi não usar a
  integração, não bloqueia;
- **quanto conteúdo existe no banco de staging** — exige credencial de admin,
  que não foi usada aqui. O runbook registrou zero usuários e zero questões em
  23/08/2026 e não há sinal de que isso tenha mudado;
- `wrangler rollback`, e o primeiro deploy num `--env` cujo Worker ainda não
  existe — o que vale para produção, não mais para staging;
- `supabase config push` contra a nuvem: o bloco `[remotes.staging]` está
  escrito, mas nunca foi empurrado.
