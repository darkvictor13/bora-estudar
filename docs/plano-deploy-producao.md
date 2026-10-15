# Plano de deploy de produção

**Estado em 15/10/2026:** produção **não existe**. Só há staging, com dado de
teste descartável. Este arquivo é o que precisa estar feito, na ordem, antes do
primeiro `workflow_dispatch` de [`deploy-producao.yml`](../.github/workflows/deploy-producao.yml).

Nasce da auditoria de prontidão (`chore/prod-readiness`) e junta duas listas:
o que o código **já faz** e só falta ligar no ambiente, e o que o código **não
consegue confirmar** (painéis do Supabase, do Cloudflare e do GitHub). Quem
executa cada passo está no cabeçalho de cada fase; um passo só vira `[x]` com a
evidência da coluna "Como confirmar".

O modelo de deploy, as proteções de branch e as armadilhas do pipeline estão em
[`deploy-staging.md`](deploy-staging.md) e não se repetem aqui. As decisões de
produto por trás de cada item estão nas specs [01](specs/01-autenticacao.md),
[11](specs/11-tema-claro-escuro.md), [16](specs/16-historico-e-anulacao-de-bateria.md),
[30](specs/30-cupom-de-acesso.md) e [46](specs/46-exclusao-de-conta-e-documentos-legais.md).

---

## Fase 0 — Decisões que só o dono do produto toma

Nada abaixo é técnico, e nenhuma das fases seguintes termina sem elas.

- [ ] **Quem é o controlador dos dados** (razão social, CNPJ) e o **e-mail de
  contato** da LGPD. Entram em `VITE_LEGAL_CONTROLLER_NAME` e
  `VITE_LEGAL_CONTACT_EMAIL` (Fase 3). *Como confirmar:* `/privacidade` em
  produção mostra o e-mail, e não "pelo seu professor, que repassa o pedido".
- [ ] **Revisão jurídica** de [`Privacy.tsx`](../apps/web/src/routes/public/Privacy.tsx)
  e [`Terms.tsx`](../apps/web/src/routes/public/Terms.tsx). O texto descreve o que
  o código faz, não foi escrito por advogado, e não traz foro nem CNPJ.
  *Como confirmar:* o PR com o texto final está mergeado na `main`.
- [ ] **Domínio de produção** (hoje staging está em `*.workers.dev`). O domínio
  decide `SITE_URL`, o redirect de e-mail do Supabase e o domínio de envio de
  e-mail (Fase 1). Veja [`plano-email-staging.md`](plano-email-staging.md).
- [ ] **O PDF de `prf/informatica` e os demais materiais**: confirmar que o
  portão (`/materials/*`, só com sessão e acesso) é a política desejada, e quais
  PDFs sobem. *Como confirmar:* lista dos arquivos de `apps/web/public/materials/`
  aprovada.
- [ ] **Os resumos flash** (`flash-summaries`) são uma importação pessoal e local
  (spec 45, `scripts/load-flash-summaries.mjs`, só contra o Supabase **local**).
  Decidir se chegam a produção, e como, **antes** do lançamento. Hoje o bucket
  existe, privado, e vazio.
- [ ] **Como os blocos do catálogo TEC (`catalog_blocks`) chegam ao banco.** Não
  há script de carga no repositório, e o `deploy-producao.yml` carrega só a
  biblioteca de flashcards e o Vade Mecum. *Como confirmar:* decisão registrada
  e, se for carga, o script commitado.
- [ ] **O que acontece com a conta de professor.** Promover é `UPDATE` de quem
  tem a chave do banco ([`scripts/promover-professor.sql`](../scripts/promover-professor.sql)),
  e a exclusão de conta de professor não existe (spec 46, fora de escopo).
  Decidir quem é o primeiro professor e quem pode pedir a exclusão dele.

---

## Fase 1 — Projeto do Supabase de produção

*Quem faz:* quem tem acesso à organização do Supabase. *Região:* a mesma de
staging (`sa-east-1`) — número medido em staging só vale com a mesma distância.

- [ ] **Criar o projeto** novo, separado de staging. Plano **Pro**: é o que dá
  backups diários com retenção e a proteção contra senha vazada. *Como
  confirmar:* dois `project_id` diferentes; o `[remotes.staging]` de
  [`supabase/config.toml`](../supabase/config.toml) aponta só para o de staging.
- [ ] **Anotar a retenção dos backups** (Database → Backups) e ligar o PITR se o
  plano permitir. A política de privacidade diz que as cópias do provedor
  "expiram no ciclo de retenção dele": o número precisa ser conhecido.
- [ ] **Authentication → Providers → Email:** *Confirm email* **ligado**. O
  `config.toml` base tem `enable_confirmations = false` (serve ao desenvolvimento
  local). *Como confirmar:* cadastrar uma conta de teste em produção e receber o
  e-mail antes de conseguir entrar.
- [ ] **Authentication → Passwords:** mínimo **8** e exigência
  *lowercase + uppercase + digits* — a política que o app já repete
  ([`validation.ts`](../apps/web/src/lib/api/validation.ts)). Ligar **"Prevent
  use of leaked passwords"** (só no Pro). *Como confirmar:*
  `curl -X POST $URL/auth/v1/signup` com `Abcdefgh` e com `abcdefg1` devolve
  `weak_password` (422); com `Abcdefg1` cria.
- [ ] **Authentication → URL Configuration:** `Site URL` = domínio de produção, e
  em *Redirect URLs* o mesmo domínio com `/**` (o link do e-mail aponta para
  `/confirmar?next=/redefinir-senha`, não para a raiz).
- [ ] **Authentication → Rate limits** revistos para o volume esperado, e o
  CAPTCHA decidido (cadastro aberto atrai robô).
- [ ] **SMTP próprio** (Resend, conforme o plano de e-mail), com domínio de envio
  verificado, remetente e os três templates em português
  ([`supabase/templates/`](../supabase/templates/)). O SMTP padrão do Supabase
  limita-se a poucos e-mails por hora e não serve a produção.
- [ ] **Network restrictions** do banco: decidir se vale restringir. O
  `supabase db push` do GitHub Actions conecta ao Postgres, e os IPs do runner
  variam: fechar a lista pode quebrar o deploy. Não restringir também é uma
  decisão — registrá-la.
- [ ] **Chaves:** só a *publishable* (`sb_publishable_…`) vai para o front.
  Conferir que a `secret`/`service_role` **não** está em nenhuma `VITE_*` nem em
  variável de Environment do front. *Como confirmar:* o `scripts/fumaca.sh` já
  reprova `sb_secret_`/`service_role` no bundle.
- [ ] **Versionar a configuração de produção**: acrescentar ao `config.toml` um
  `[remotes.producao]` (`project_id`, `site_url`, `additional_redirect_urls` com
  `/**`) **e** `[remotes.producao.auth.email] enable_confirmations = true`.
  Sem isso o `config push` de produção herdaria a confirmação desligada do base.
  Commit próprio, antes do `config push`.
- [ ] **`supabase config push --project-ref <produção>`**, uma vez, à mão, e
  depois conferir no painel que cada ajuste acima chegou. O pipeline **não** roda
  `config push`: sem este passo a política de senha, os templates e os limites de
  `config.toml` existem só no ambiente local.

### O mesmo vale para staging, e vem primeiro

A política de senha nova (8 + maiúscula + minúscula + número) está no `config.toml`
base desde 15/10/2026 e **ainda não está no Supabase de staging**.

- [ ] `supabase config push --project-ref gumvfizrjexbygrbceei` e repetir o
  `curl` de senha fraca acima contra staging. É também o ensaio do passo de
  produção.

---

## Fase 2 — Cloudflare

*Quem faz:* quem tem acesso à conta do Cloudflare.

- [ ] **Worker `bora-estudar`** (nome de produção) e o domínio de produção ligado
  a ele. Lembrete: o deploy é SEMPRE com `--env`; sem a flag publica um Worker que
  não é ambiente nenhum.
- [ ] **SSL/TLS em *Full (strict)*** e *Always Use HTTPS*.
- [ ] **HSTS** ligado no painel. O `_headers` já envia
  `Strict-Transport-Security: max-age=31536000`; o painel acrescenta, se quiser,
  `includeSubDomains` e `preload` — decisão consciente, porque `preload` não se
  desfaz depressa.
- [ ] **Conferir os cabeçalhos no ar** depois do primeiro deploy:
  `curl -sI https://<domínio>/` mostra `x-content-type-options`, `x-frame-options`,
  `referrer-policy`, `permissions-policy`, `strict-transport-security` e
  `content-security-policy-report-only`. (`scripts/fumaca.sh` confere os seis.)
- [ ] **Rate limit no domínio do app para `/materials/*`**: o portão chama o
  Supabase (duas RPCs no pior caso) a cada pedido de PDF. Decidir se vale uma
  regra de rate limit do Cloudflare. A API de auth é do Supabase e tem os limites
  dela (Fase 1).
- [ ] **Token do Cloudflare** com permissão *Edit Cloudflare Workers*, escopado a
  uma conta, no Environment (Fase 3).

---

## Fase 3 — GitHub: o Environment `producao`

*Quem faz:* a conta com permissão de administração do repositório
(`darkvictor13`; o `gh` desta máquina é outra conta e leva 403).

**Antes de qualquer outra coisa:** criar o Environment **com a deployment branch
rule limitada a `main`**. Referenciar um Environment que não existe faz o GitHub
criá-lo na hora, sem proteção nenhuma. *Como confirmar:* Settings → Environments →
`producao` → *Deployment branches* = `main`.

Variáveis (`vars`) e segredos (`secrets`) — os nomes são os do workflow:

| Nome | Tipo | Valor |
|---|---|---|
| `SUPABASE_PROJECT_ID` | var | ref do projeto **de produção** |
| `SUPABASE_ACCESS_TOKEN` | secret | PAT do dashboard |
| `SUPABASE_DB_PASSWORD` | secret | senha do Postgres de produção |
| `VITE_SUPABASE_URL` | var | `https://<ref-prod>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | var | `sb_publishable_…` de produção |
| `SITE_URL` | var | domínio de produção (usado pela fumaça) |
| `CLOUDFLARE_API_TOKEN` | secret | Fase 2 |
| `CLOUDFLARE_ACCOUNT_ID` | var | `wrangler whoami` |
| `VITE_SENTRY_DSN` | var | DSN do projeto Sentry de **produção** |
| `SENTRY_AUTH_TOKEN` | secret | envio de sourcemap |
| `SENTRY_ORG`, `SENTRY_PROJECT` | var | slugs |
| `VITE_LEGAL_CONTACT_EMAIL` | var | **obrigatório** (Fase 0) |
| `VITE_LEGAL_CONTROLLER_NAME` | var | razão social (Fase 0) |

- [ ] Nenhum valor de staging copiado por engano. *Como confirmar:* os dois
  `VITE_SUPABASE_URL` diferem, e o `SENTRY_ENVIRONMENT` de produção é `producao`
  (o workflow já fixa).
- [ ] **Required reviewer** no Environment (opcional, mas transforma o disparo
  acidental em dois cliques).
- [ ] **Ruleset de `main`**: bloquear deleção e force-push.
- [ ] **O `VITE_SUPABASE_URL` e a publishable key também são usados em RUNTIME
  pelo portão dos PDFs.** O workflow já os passa ao Worker por `--var`. Sem eles
  o portão responde 503. *Como confirmar:* o `scripts/fumaca.sh` (Fase 6).

---

## Fase 4 — Antes de disparar: o que precisa estar verde

- [ ] **Staging com a auditoria mergeada pelo tempo que o dono decidir** (a CSP,
  abaixo, pede pelo menos uma semana), e a `main` estável. Staging recebe cada
  commit da `main` e é o ensaio das migrations de `20261015130000` a
  `20261015170000`.
- [ ] **A CSP sem violação em staging.** Abrir o app em staging, passear pelas
  telas de aluno e de professor com o console aberto, e olhar `Content-Security-Policy-Report-Only`
  nas violações. Zero violações por uma semana: **promover** trocando o nome do
  cabeçalho para `Content-Security-Policy` em
  [`apps/web/public/_headers`](../apps/web/public/_headers) (commit próprio, e
  de novo uma passada em staging antes de produção). O hash do script do tema
  está nela, e `security-headers.test.ts` reprova se divergir.
- [ ] **`npm run check`, `npm run db:test` e `npm run e2e`** verdes no commit que
  vai ser publicado. O `ci.yml` roda o `check` em todo PR e nos dois deploys; o
  `db:test` roda no `ci-banco.yml` em PR que toca `supabase/`; **o e2e só roda à
  mão**. Lembrete do CLAUDE.md: `db:reset` entre `db:test` e `e2e`.
- [ ] **Compatibilidade com o bundle no ar.** Produção ainda não tem bundle,
  então a regra "migration compatível com o que está no ar" não restringe o
  primeiro deploy — mas **vale para todo deploy depois**, e o primeiro dispatch é
  o último em que se pode errar sem consequência. Rever as migrations de
  `20261015130000` a `20261015170000` com isso em mente.
- [ ] **`supabase db push --linked --dry-run`** contra produção mostra exatamente
  as migrations esperadas, **na ordem**. O workflow já roda o dry-run antes do
  push; olhar a saída.
- [ ] **Testar o fluxo de conta de ponta a ponta em staging com e-mail de
  verdade:** cadastro → confirmação → login → exclusão de conta → o mesmo e-mail
  cadastra de novo uma conta vazia.
- [ ] **Testar o cupom em staging:** criar um cupom por SQL (`insert into
  public.coupons (code, months_granted) values ('…', 3)` com a chave de serviço),
  resgatar com uma conta pendente, conferir `coupon_used` e `coupon_redemptions`.
  **Cupom não tem tela de cadastro** (spec 30, R-CUP-14): quem administra o
  produto cria por SQL, e isso precisa estar nas mãos de alguém em produção.
- [ ] **Testar o tema entre dois navegadores** em staging (a escolha atravessa).
- [ ] **Testar o portão dos PDFs em staging:** `curl -I https://<staging>/materials/prf/informatica/conceitos-protecao-seguranca.pdf`
  sem cookie dá **401**; logado com acesso, abre.
- [ ] **Backup/restauração**: pelo menos uma vez, restaurar um backup num projeto
  descartável e conferir que `db push` aplica o resto por cima. Se o plano de
  staging não tiver backup, o ensaio possível é `supabase db reset` do zero
  seguido de `db push`. Produção sem restauração testada é produção sem backup.

---

## Fase 5 — O disparo

- [ ] Conferir o SHA: o job `resolver` já recusa commit que não é ancestral da
  `main`; o que se publica é o commit que passou por staging.
- [ ] **Actions → Deploy produção → Run workflow** (campo vazio = a ponta da
  `main`; ou o SHA que o staging provou).
- [ ] Acompanhar os jobs na ordem em que **não podem inverter**: `verificar` →
  `banco` (dry-run, push, carga da biblioteca e do Vade Mecum) → `site` (build
  com as `VITE_*`, remoção de sourcemap, verificação de conteúdo editorial,
  publicação com `--env producao` e as duas `--var` do portão) → `fumaca`.
- [ ] **Se o `site` falhar depois de o `banco` passar**, o banco já mudou e o
  bundle antigo (se houver) continua no ar. Para o primeiro deploy não há bundle
  antigo; para os seguintes, é a regra de compatibilidade que segura o estrago.

---

## Fase 6 — Verificação em produção (manual, uma vez)

A `fumaca` automática confere: fallback de SPA, URL do Supabase e Sentry no
bundle, nenhum segredo, nenhum sourcemap, cabeçalhos de segurança, `/materials`
sem sessão dando 401, e `cache-control`. Falta o que só uma pessoa vê:

- [ ] **Cadastro com e-mail de verdade**, recebendo o e-mail confirmação no
  remetente certo, em português, com o link abrindo o app em produção.
- [ ] **Senha fraca recusada** pelo formulário e pela API (a mesma frase).
- [ ] **Primeiro professor**: promover a conta com
  [`scripts/promover-professor.sql`](../scripts/promover-professor.sql), entrar,
  e ver `/professor/alunos`.
- [ ] **Vincular e liberar** um aluno de teste, e ver as telas de estudo abrirem.
- [ ] **Exclusão de conta** com uma conta de teste: o cartão diz o que sai e o que
  fica, a conta some, o e-mail cadastra de novo.
- [ ] **`/privacidade` e `/termos`** abrem sem login, com o contato certo.
- [ ] **Um PDF**: sem login 401, logado sem acesso 403, logado com acesso abre.
- [ ] **Um erro de propósito** (ou o evento de teste do Sentry) chega ao painel de
  **produção**, sem nome nem e-mail.
- [ ] **Console do navegador** sem violação de CSP nas telas principais.
- [ ] **Security Advisor e Performance Advisor** do Supabase sem item novo em
  relação ao relatório da auditoria.
- [ ] **E-mail de recuperação de senha** chega e funciona.

---

## Fase 7 — Depois do lançamento

- [ ] **Alertas:** Sentry com regra de notificação; o Supabase com aviso de
  consumo e de saúde.
- [ ] **Promover a CSP** a enforcement, se ainda estiver em Report-Only.
- [ ] **Voltar atrás** (ver [`deploy-staging.md`](deploy-staging.md), "Voltar
  atrás"): o site volta redisparando o workflow com o SHA anterior; o banco **não
  tem migration de descida** — a correção é uma migration nova. Por isso a regra
  de compatibilidade importa mais depois do primeiro dispatch do que antes.
- [ ] **Itens abertos da auditoria** que não bloqueiam o lançamento:
  - exportação de dados (LGPD art. 18, V): não há tela nem RPC;
  - exclusão de conta de professor (spec 46, fora de escopo);
  - registro de versão e data do aceite dos termos no cadastro;
  - tela para cadastrar e desativar cupom (spec 30, R-CUP-14);
  - o motor que cria baterias, que continua não existindo: a anulação (spec 16)
    atua sobre o que já estiver registrado, e F-ANUL-04 segue sem cobertura.

---

## O que este plano **não** cobre

- **Migração de dados de outro ambiente.** Produção nasce vazia: `docs/de-para-schema.md`
  é insumo para um script de migração, não substituto, e ninguém pediu um.
- **A página de vendas** ([`plano-pagina-de-vendas.md`](plano-pagina-de-vendas.md)),
  que é um deploy separado.
- **Mudança de domínio depois do lançamento**: mexe em `SITE_URL`, redirect do
  Supabase, domínio de e-mail e, com HSTS, não é reversível rápido.
