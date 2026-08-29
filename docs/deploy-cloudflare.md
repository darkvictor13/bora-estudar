# Publicar o site no Cloudflare

Passo a passo para hospedar `apps/web` no Cloudflare. Cobre **só o site**.

O banco, a autenticação e os dados estão em
[`ambiente-staging.md`](ambiente-staging.md), que trata o passo 5 — a
hospedagem — de forma genérica ("Vercel, Netlify, Cloudflare Pages, S3+CDN").
Este arquivo é esse passo 5 resolvido para o Cloudflare, e nada mais: se você
ainda não tem projeto Supabase hospedado, comece por lá, pelos passos 1 a 4.

A extensão não entra aqui. Ela é agnóstica de ambiente — o `manifest.json` só
pede permissão em `tecconcursos.com.br`, e a volta ao site é
`location.assign` para o `returnUrl` que veio dentro do payload, montado pelo
`StartQuizButton` a partir de `location.origin`. Domínio novo não exige
manifesto novo nem republicação na loja.

Verificado em 23/08/2026 com wrangler 4.125.0 e o `dist/` real do projeto. O
que foi executado de verdade e o que não foi está no fim do arquivo.

---

## Por que Workers com assets estáticos, e não Pages

Os dois servem: o site é arquivo estático, e as duas ofertas entendem o mesmo
arquivo `_headers`. A recomendação é **Workers com assets estáticos** porque o
Cloudflare passou a concentrar ali o desenvolvimento novo, e porque o
`not_found_handling: "single-page-application"` é uma chave de configuração
versionada no repositório — enquanto no Pages o mesmo comportamento depende de
convenção de arquivo ou de ajuste no painel, que ninguém revisa em code review.

Se você já tem Pages em uso e não quer trocar, o essencial é o mesmo: fallback
de SPA e política de cache. Salte para as duas seções de armadilhas.

**Nenhum script de Worker é necessário.** A configuração abaixo não tem `main`:
é um Worker só de assets, e o wrangler aceita. Não há servidor de aplicação
para escrever porque não há nada para ele fazer — ver "O site é uma SPA" em
[`arquitetura.md`](arquitetura.md).

---

## O que a aplicação exige da hospedagem

Três coisas, todas derivadas do código:

| Exigência | Por quê |
|---|---|
| Rewrite de qualquer caminho para `/index.html` com **200** | O roteamento é no cliente. `/confirmar?next=/redefinir-senha` chega do e-mail como acesso direto; sem fallback devolve 404 e o link de recuperação morre |
| As duas `VITE_*` presentes no **build** | `src/lib/env.ts` — o Vite faz substituição estática, a chave é assada no bundle |
| `index.html` sem cache longo, `assets/*` imutável | Os nomes em `assets/` já são hasheados pelo build; o `index.html` é quem aponta para eles |

E o que ela **não** exige: nenhuma chave secreta (não há uma referência a
`service_role` em `apps/web/src`), nenhum runtime Node, nenhuma variável de
ambiente de execução.

---

## 0. Antes de começar

```bash
node -v          # 24, conforme .nvmrc
npm i -g wrangler # ou use npx wrangler em todo comando
wrangler login    # interativo, abre o navegador
wrangler whoami   # confirma a conta e o account_id
```

Duas coisas precisam existir antes:

- **Projeto Supabase hospedado**, com schema aplicado — passos 1 e 2 do
  `ambiente-staging.md`. Você vai precisar da URL e da publishable key.
- **Uma decisão sobre o domínio.** Existe um ovo-e-galinha aqui: a
  autenticação do Supabase é allowlist de URL exata, então ela precisa do
  domínio final; e o domínio só existe depois do primeiro deploy. A ordem que
  funciona é: deploy primeiro (passo 4), pegue a URL `*.workers.dev`, configure
  a auth com ela (passo 5), e refaça o passo 5 quando trocar por domínio
  próprio.

---

## 1. `wrangler.jsonc`

Crie `apps/web/wrangler.jsonc` — este arquivo **é versionado**, não tem
segredo nenhum:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bora-estudar",
  "compatibility_date": "2026-08-23",
  "assets": {
    "directory": "./dist",
    // Qualquer caminho sem arquivo correspondente devolve index.html com 200.
    // É isto que faz `/aluno/revisoes` e `/confirmar?next=…` funcionarem como
    // acesso direto, e não só como navegação interna.
    "not_found_handling": "single-page-application"
  }
}
```

O `name` decide o subdomínio: `bora-estudar.<seu-subdominio>.workers.dev`.

Acrescente ao `.gitignore` da raiz, no bloco de build:

```
.wrangler/
```

## 2. `_headers` — política de cache

Crie `apps/web/public/_headers`. Tem de ser em `public/` e não em `dist/`: o
Vite copia `public/*` para a raiz do `dist` a cada build, e o `dist` é
descartável.

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
```

Os nomes em `assets/` carregam hash de conteúdo, então cache eterno é seguro e
desejável. O `index.html` é o que precisa ser buscado de novo depois de cada
deploy — sem isso, um navegador com o HTML velho continua pedindo um bundle
que já não existe.

## 3. As duas variáveis de build

**Esta é a armadilha mais caras do Cloudflare para uma SPA de Vite.**

Variável de Worker (`vars` no `wrangler.jsonc`) e segredo de Worker
(`wrangler secret put`) são de **execução**, e chegam ao código do Worker.
Aqui não existe código de Worker: o bundle já foi compilado, e
`import.meta.env.VITE_SUPABASE_URL` virou uma string literal dentro do
JavaScript no momento do `vite build`. Uma variável definida como var de
Worker **não aparece em lugar nenhum** — e o sintoma é a tela em branco com
"Variável de ambiente ausente: VITE_SUPABASE_URL" no console, que faz o time
procurar no painel do Cloudflare, onde a variável está, corretamente
configurada, e inútil.

Elas precisam existir no ambiente **onde o `vite build` roda**:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Não crie `.env.production`: ele **não** está no `.gitignore` e seria
commitado. Um build por ambiente; trocar de ambiente exige recompilar.

## 4. Primeiro deploy

Dois caminhos. O A é o que este documento verificou.

### A. Build local, deploy pelo wrangler

```bash
# da raiz do repositório
npm ci

VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
npm run build --workspace @bora/web

npx wrangler deploy --config apps/web/wrangler.jsonc
```

Use `npm run build --workspace @bora/web`, e não o `npm run build` da raiz: o
da raiz roda `--workspaces --if-present` e compila a extensão também, que não
tem nada a ver com este deploy.

Antes de subir, confira o que vai subir sem subir:

```bash
npx wrangler deploy --config apps/web/wrangler.jsonc --dry-run
```

E veja o resultado servido de verdade, localmente, com o mesmo motor que roda
na borda:

```bash
npx wrangler dev --config apps/web/wrangler.jsonc --port 8788
curl -o /dev/null -w "%{http_code}\n" http://localhost:8788/aluno/revisoes   # 200
```

### B. Build no Cloudflare a partir do GitHub

Conecte o repositório no painel (Workers → o projeto → Builds). Como é
monorepo, os campos que importam:

| Campo | Valor |
|---|---|
| Comando de build | `npm ci && npm run build --workspace @bora/web` |
| Diretório de saída | `apps/web/dist` |
| Caminho do `wrangler.jsonc` | `apps/web/wrangler.jsonc` |
| Variáveis de build | as duas `VITE_*` do passo 3 |
| `NODE_VERSION` | `24` |

O `.nvmrc` da raiz diz 24 e o `engines` do `package.json` exige >= 22; se a
imagem de build do Cloudflare vier com Node mais velho, é `NODE_VERSION` que
resolve.

Confira no painel os nomes exatos desses campos: eles mudaram junto com o
produto, e não foram verificados aqui.

## 5. Apontar a autenticação do Supabase para a URL nova

Sem isto o login funciona e a **recuperação de senha não** — e o sintoma é
enganoso, porque a tela diz "este link expirou".

O `redirectTo` do e-mail é montado no navegador, em
`src/lib/auth/actions.ts`, a partir de `location.origin`. Se essa URL não
estiver na allowlist, o GoTrue descarta e cai no `site_url` — que ainda aponta
para `localhost:3000`.

Siga o passo 3 do [`ambiente-staging.md`](ambiente-staging.md), com o domínio
do Cloudflare:

```toml
[remotes.staging.auth]
site_url = "https://bora-estudar.<subdominio>.workers.dev"
additional_redirect_urls = ["https://bora-estudar.<subdominio>.workers.dev/**"]
```

O `/**` não é decoração: o link do e-mail aponta para
`/confirmar?next=/redefinir-senha`, não para a raiz.

## 6. Domínio próprio

No painel, em Domains & Routes do Worker, adicione o domínio. O DNS precisa
estar no Cloudflare; o certificado é automático.

Depois de trocar o domínio, **volte ao passo 5**. E deixe a URL antiga na
allowlist enquanto houver link de e-mail em trânsito — eles valem por algumas
horas.

Ligue "Always Use HTTPS": os cookies de sessão que o `@supabase/ssr` grava
recebem o atributo `Secure` em https, e uma primeira visita em http não os
enxergaria.

## 7. Verificação

Nesta ordem, porque cada uma depende da anterior:

```bash
# 1. rota funda como acesso direto — prova o fallback de SPA
curl -o /dev/null -w "%{http_code}\n" https://<dominio>/aluno/revisoes        # 200

# 2. o caminho do link de e-mail
curl -o /dev/null -w "%{http_code}\n" "https://<dominio>/confirmar?next=/redefinir-senha"  # 200

# 3. a chave foi assada no bundle (deve achar a URL do Supabase)
curl -s https://<dominio>/assets/index-*.js | grep -c "<ref>.supabase.co"     # >= 1

# 4. cache
curl -sI https://<dominio>/ | grep -i cache-control                          # no-cache
curl -sI https://<dominio>/assets/index-*.js | grep -i cache-control         # immutable
```

Depois, na mão, o que nenhum curl cobre:

- **login dos três papéis** — aluno em `/aluno`, professor em `/professor`,
  admin também em `/professor` sem entrar em loop;
- **recuperação de senha inteira**, do pedido até entrar com a senha nova. O
  link precisa abrir **no mesmo navegador** que o pediu: o
  `exchangeCodeForSession` em `routes/AuthCallback.tsx` é PKCE e depende do
  verifier guardado em cookie do domínio. Em outro navegador falha, e a tela
  lê isso como link inválido;
- **a volta do TEC** — iniciar bateria, responder no TEC, voltar com
  `#boraQuizResult=`, ver o resultado gravado e o tempo registrado.

A suíte Playwright roda contra o ambiente publicado, com as ressalvas do passo
7 do `ambiente-staging.md` (o `auth.spec.ts` vai falhar por causa do Mailpit):

```bash
E2E_BASE_URL=https://<dominio> \
E2E_SUPABASE_URL=https://<ref>.supabase.co \
E2E_SUPABASE_KEY=sb_publishable_... \
E2E_DATABASE_URL="postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres" \
npm run e2e --workspace @bora/e2e
```

Cuidado: as fixtures criam e **apagam** usuários direto em `auth.users`. Não
aponte para um ambiente com dado que alguém precisa.

## 8. Voltar atrás

```bash
npx wrangler deployments list --config apps/web/wrangler.jsonc
npx wrangler rollback --config apps/web/wrangler.jsonc
```

O rollback devolve o bundle anterior. O que ele **não** desfaz é o passo 5: se
o deploy ruim veio junto com troca de domínio, a allowlist da auth continua
como você deixou.

---

## Armadilhas verificadas

**A regra `/index.html` do `_headers` não vale para rota funda.** Medido: `/`
recebe o `no-cache` da regra, e `/aluno/revisoes` recebe
`public, max-age=0, must-revalidate` — o padrão do Cloudflare para o fallback
de SPA, porque o caminho pedido não é `/index.html` e nenhuma regra casa. Esse
padrão é seguro (revalida sempre), então não há o que corrigir; mas se você
quiser um cabeçalho próprio na casca da SPA em todas as rotas, a regra precisa
ser `/*`, e aí ela também pega os assets — declare `/assets/*` antes.

**Var de Worker não chega a bundle de Vite.** Está no passo 3. É o erro que
mais custa tempo porque a configuração parece certa no painel.

**Fallback de SPA não é opcional, e o modo de falhar é indireto.** Sem ele o
primeiro sintoma não é "o site está quebrado": é o link de recuperação de
senha não funcionando — o mesmo sintoma do `site_url` errado, o que manda o
time investigar o Supabase quando o problema é o rewrite.

**Não existe status 404 para recurso alheio.** O servidor devolve o mesmo
`index.html` para qualquer caminho; "este aluno não é seu" é decisão que
depende de autenticação e RLS. Um monitor externo que verifique 404 em URL
inválida vai reportar 200 para sempre — monitore conteúdo, não status.

**O build precisa de `npm ci` na raiz.** São workspaces do npm: instalar
dentro de `apps/web` não resolve `@bora/protocol` nem `@bora/database`, que
são dependências locais.

---

## O que foi verificado, e o que não

Verificado em 23/08/2026, com wrangler 4.125.0 e o `dist/` real:

- `not_found_handling` aceita `"single-page-application"` (está no
  `config-schema.json` do wrangler, ao lado de `"404-page"` e `"none"`);
- Worker **sem `main`**, só com `assets`, é configuração válida —
  `wrangler deploy --dry-run` leu os 10 arquivos e aceitou;
- o fallback funciona: `/`, `/aluno/revisoes`, `/professor/metas` e
  `/confirmar?next=/redefinir-senha` devolvem 200 servindo o `index.html`, com
  o `<script src="/assets/index-*.js">` correto;
- o `_headers` é lido de dentro do diretório de assets e aplicado — `immutable`
  no asset hasheado, `no-cache` no index — e a ressalva da rota funda acima foi
  medida, não deduzida.

**Não verificado**, por exigir conta Cloudflare:

- `wrangler deploy` de verdade, e a URL `*.workers.dev` resultante;
- os nomes exatos dos campos de build no painel (caminho B do passo 4) e o
  comportamento da imagem de build com monorepo npm;
- domínio próprio, certificado e `wrangler rollback`;
- tudo do lado do Supabase hospedado: o `ambiente-staging.md` também declara,
  no fim, que nada dele foi rodado contra um projeto real.

Nada neste arquivo foi executado contra a infraestrutura do Cloudflare. Os
comandos com `<placeholder>` são os que ninguém rodou ainda.
