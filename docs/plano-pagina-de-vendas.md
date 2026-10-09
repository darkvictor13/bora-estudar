# Plano — página de vendas

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e a
> [spec 44](specs/44-pagina-de-vendas.md). A spec diz **o que** a página faz e
> por quê. Este plano diz **onde** ela mora, **como** é construída e em que
> **ordem**. Se os dois divergirem, um deles tem um defeito: corrija antes de
> seguir.

| | |
|---|---|
| Spec | [44 — Página de vendas](specs/44-pagina-de-vendas.md) |
| Fluxos e2e | F-VND-01 a F-VND-10, reservados em [`fluxos-e2e.md`](fluxos-e2e.md) |
| Branch | `feature/pagina-de-vendas` |
| Migration | não — nenhum arquivo de `supabase/` muda |
| App | não — nenhum arquivo de `apps/web` muda |
| Bloqueia staging | o número do WhatsApp (seção 13) |
| Bloqueia produção | o endereço da escola, a razão social e o Environment `producao` (seção 13) |

---

## 1. Onde a página mora, e por quê

**Num workspace próprio, `apps/landing` (`@bora/landing`), escrito em React
sem MUI e publicado num Worker só dela.** O React roda **só no build**: um
plugin do Vite renderiza os componentes com `renderToStaticMarkup`, e o que vai
ao ar é HTML, CSS escrito à mão, fontes e imagens. Nenhum `.js` chega ao
navegador (R-VND-14).

As alternativas, e o que derrubou cada uma:

| Alternativa | Por que não |
|---|---|
| Uma rota pública dentro do app (`/` ou `/conheca`) | O app é SPA: o servidor entrega o mesmo `index.html` para qualquer caminho, e o robô que monta a prévia do WhatsApp não executa JavaScript. Todo link sairia com a prévia "Plataforma de estudos para concursos.", que é justamente o problema que a spec quer resolver. A rota ainda carregaria o bundle do app inteiro, e `lib/env.ts` lança sem as `VITE_SUPABASE_*`, então a página cairia junto com o app (R-VND-13). E a CSP sem `script-src` (R-VND-14) não cabe no Worker de uma SPA. |
| Pré-renderizar com React e `@bora/ui` | Renderizado no build e sem hidratação, nenhum runtime iria ao navegador. O custo está em outro lugar. O MUI pinta pelo Emotion, e para o CSS chegar ao HTML seria preciso extraí-lo na compilação (`@emotion/server`), coisa que o projeto nunca fez. Os componentes interativos do MUI (Accordion, ripple) não funcionam sem JavaScript, então as perguntas continuariam em `<details>` escrito à mão. E o ganho é reaproveitar três ou quatro caixas. |
| HTML escrito à mão | Funciona, e foi a primeira versão deste plano. Perde para o React sem MUI por três motivos. O "Criar minha conta" aparece umas oito vezes, e os dois cartões de oferta saindo do MESMO componente garantem o mesmo peso visual (R-VND-01) pela estrutura, e não por disciplina. Perguntas, recursos e passos viram dados tipados. E o link do WhatsApp é montado por uma função TypeScript testada, não por um plugin que reescreve HTML com expressão regular. |
| O mesmo Worker do app, com um caminho a mais | `not_found_handling` é um só por Worker: o app precisa de `single-page-application` e a página de `404-page` (R-VND-16). O `_headers` também é um só, e a CSP da página derrubaria o app. |

**O custo da escolha:** a página não reusa `Card`, `Button` nem nenhuma outra
primitiva de `@bora/ui`, que são componentes MUI. Ela tem os próprios
componentes, sem estilo embutido, e um `styles.css` escrito à mão. O que faz
página e app parecerem o mesmo produto é a cor, e a cor não é copiada: o build
lê `@bora/ui/tokens` e gera as variáveis (seção 4.5), usando só pares que
`packages/ui/src/contrast.test.ts` já mede. Trocar um token no app troca na
página no build seguinte.

---

## 2. O que foi medido antes de escrever

Medido em 09/10/2026 contra as versões instaladas: Vite 8.2.2, React 19.2.8,
wrangler 4.125.0 e Node 24.20. Cada linha virou uma decisão deste plano.

**O caminho do React ao HTML**

| Medido | Resultado | Consequência |
|---|---|---|
| `vite.config.ts` importando um `.tsx` | o Vite compila o JSX ao carregar a configuração, com o runtime automático, sem `import React` | o plugin importa `src/render.tsx` direto; não há um segundo build |
| Plugin `transformIndexHtml` com `order: "pre"` devolvendo o HTML do `renderToStaticMarkup` | o Vite processa o resultado como se fosse o arquivo: `<img src>`, `<link rel="icon">` e `<link rel="stylesheet">` saem com hash em `assets/` | imagens e CSS entram por caminho de texto no componente, e o Vite cuida do resto |
| React no build, com a página renderizada | o `dist` sai sem nenhum `.js` | nada de React vai ao ar |
| Duas páginas de entrada | `build.rolldownOptions.input` com `index.html` e `404.html`; o plugin escolhe o componente por `ctx.filename` | um HTML vazio por página, só como ponto de entrada (seção 4.2) |
| `vite dev` com o plugin | renderiza a página; editar um componente reinicia o servidor sozinho ("src/Page.tsx changed, restarting server…") | sem HMR, mas a mudança aparece ao recarregar |
| Caminho de imagem que não existe | **o build passa**, com código 0, e o HTML sai com `src="/src/assets/nao-existe.webp"` literal | `assertPublishable` recusa caminho de fonte que sobrou no HTML compilado (seção 4.3) |
| React 19 com `<img>` sem `loading="lazy"` | acrescenta sozinho `<link rel="preload" as="image">` no `<head>` | inofensivo: mesma URL, mesma origem. Para a imagem da abertura, até ajuda |
| `<meta charSet>` | o React escreve `charSet`, com maiúscula | o HTML não diferencia; os testes que leem o HTML cru usam regex sem diferenciar maiúsculas |

**O resto**

| Medido | Resultado | Consequência |
|---|---|---|
| Alias de `resolve.alias` num `src` de HTML | **não resolve**: o atributo sai literal | o símbolo entra por caminho relativo ao HTML de entrada, `../web/public/fronteira-mark.svg`, que o Vite resolve, copia e marca com hash |
| `assetsInlineLimit` padrão (4 KB) com o símbolo (cerca de 600 B) num `<img>` | o atributo vira `src="data:image/svg+xml,…"` | `img-src 'self'` bloqueia `data:`, então **`build.assetsInlineLimit: 0`** |
| `%VITE_X%` no HTML sem a variável | fica literal, com um aviso, e o build termina com 0 | os componentes não usam `%VITE_X%`: recebem o ambiente por prop, já validado (seção 4.3) |
| `vite.config.ts` importando `@bora/ui/tokens` pelo symlink do workspace | funciona: o Vite empacota o pacote ligado | nada a copiar |
| `node --test` importando `@bora/ui/tokens` | funciona no Node 24; no Node 22 do sistema dá `ERR_UNKNOWN_FILE_EXTENSION` | é o mesmo aviso do CLAUDE.md: `nvm use` antes |
| `wrangler dev` com `_headers` e `not_found_handling: "404-page"` | aplica os cabeçalhos; caminho inexistente responde **404** com o `404.html`; `/index.html` responde 307 para `/` | a suíte e2e roda contra `wrangler dev`, que se comporta como o ar |
| `.gitignore` | ignora **qualquer** diretório chamado `build/` | o código do build mora em `apps/landing/config/`. A primeira versão da spec dizia `build/`, e já foi corrigida |
| `waitlist` depois do vínculo | `link_student` só faz `update … set teacher_id`; a linha sai apenas no cascade de apagar a conta | a contagem por `created_at` (seção 11) não perde quem já virou aluno |
| Fontes, subconjunto latino | DM Sans variável: 36,9 KB; DM Mono 500: 15,0 KB | cabem no orçamento (seção 7.4); o `unicode-range` faz o navegador baixar só o subconjunto latino |
| GitHub Environments | só existe `staging`; o `SITE_URL` dele é `https://bora-estudar-staging.bora-estudar-saas.workers.dev`, sem barra no fim | `VITE_APP_URL` reusa o `SITE_URL`, e o subdomínio da conta dá o endereço da página (seção 10.3) |

---

## 3. Os arquivos

```
apps/landing/
├── package.json             @bora/landing: dev, build, preview, lint, test, typecheck
├── tsconfig.json            estende ../../tsconfig.base.json; jsx react-jsx; inclui vite.config.ts, config/ e src/
├── eslint.config.js         typescript-eslint, mais a trava contra hooks (seção 4.6)
├── vite.config.ts
├── wrangler.jsonc           Workers bora-landing-staging e bora-landing
├── .env.development         lido só pelo `vite dev`; o build não o lê (seção 4.3)
├── index.html               entrada vazia: o conteúdo é de src/pages/Home.tsx
├── 404.html                 entrada vazia: o conteúdo é de src/pages/NotFound.tsx
├── og-card.html             entrada vazia de src/pages/OgCard.tsx; o `vite dev` serve, o build não inclui
├── config/                  roda no Node, durante o build
│   ├── landing-plugin.ts    o plugin: lê o ambiente, renderiza, confere, emite robots e sitemap
│   ├── page-env.ts          R-VND-09, 12 e 18
│   ├── page-env.test.ts     CA-11 e CA-12
│   ├── brand-tokens.ts      R-VND-07
│   └── brand-tokens.test.ts CA-13
├── public/
│   ├── _headers
│   └── og.png               1200×630, em endereço estável (sem hash)
└── src/                     a página
    ├── render.tsx           nome da página → HTML
    ├── pages/               Home.tsx, NotFound.tsx, OgCard.tsx
    ├── components/          Document, Header, Footer, SignUpLink, SignInLink, WhatsAppLink,
    │                        OfferCard, Feature, Step, FaqItem, ProductShot
    ├── content.ts           o texto que se repete em lista: ofertas, recursos, passos, perguntas
    ├── links.ts             URLs de cadastro, de entrada e do WhatsApp (R-VND-10 e 11)
    ├── links.test.ts
    ├── styles.css
    └── assets/screens/      *.webp, gerados por apps/e2e/tools/landing-screens.ts

apps/e2e/
├── tests/landing.spec.ts
├── tools/landing-screens.ts
├── support/app.ts           + LANDING_URL e LANDING_WHATSAPP
├── support/contrast.ts      + assertAA, que sai de tests/theme.spec.ts
└── playwright.config.ts     + segundo webServer

scripts/fumaca-pagina.sh
.github/workflows/ci.yml, deploy-staging.yml, deploy-producao.yml
.gitignore                   + .wrangler/
```

`robots.txt` e `sitemap.xml` não estão na árvore: o build os emite (seção 4.2).

`package.json`:

- **dependências:** `@bora/ui` (`*`, só para `@bora/ui/tokens`),
  `@fontsource-variable/dm-sans` e `@fontsource/dm-mono`, nas mesmas faixas do
  app. As fontes vão ao ar, e os tokens viram o CSS que vai ao ar.
- **de desenvolvimento:** `react`, `react-dom`, `@types/react` e
  `@types/react-dom` nas versões do app, porque nada deles chega ao navegador;
  `vite`, `typescript`, `eslint`, `@eslint/js`, `typescript-eslint` e
  `@types/node`, nas mesmas faixas do app.
- **scripts:** `test` é `node --test "config/**/*.test.ts" "src/**/*.test.ts"`.

Fora o link do workspace, nada entra novo no lockfile: o React já está na raiz,
pelo app.

---

## 4. O build

### 4.1 `vite.config.ts`

```ts
import { resolve } from "node:path";

import { defineConfig } from "vite";

import { landingPage } from "./config/landing-plugin.ts";

export default defineConfig({
  plugins: [landingPage()],
  build: {
    // ZERO, e não o padrão de 4 KB: o símbolo tem ~600 B e viraria `data:` no
    // `<img>`, que a CSP (`img-src 'self'`) bloqueia. Medido.
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        notFound: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
  server: { port: 3100, strictPort: true },
});
```

Não há `@vitejs/plugin-react` nem Sentry. O plugin do React existe para o JSX
que vai ao navegador, e aqui nenhum vai: quem compila o JSX é o carregador da
configuração (medido). E sem JavaScript no navegador não há erro de navegador
para relatar.

### 4.2 Do JSX ao HTML: `config/landing-plugin.ts`

**`index.html`, `404.html` e `og-card.html` são entradas vazias**:

```html
<!doctype html>
<!-- O conteúdo desta página é src/pages/Home.tsx, renderizado por
     config/landing-plugin.ts. Nada escrito aqui vai ao ar. -->
<html><head></head><body></body></html>
```

O Vite precisa de um arquivo HTML por página como ponto de entrada. Quem decide
o conteúdo é o plugin.

**O plugin `landingPage()`:**

- **`configResolved(config)`** chama `readPageEnv(config.env)`, que lança com o
  nome da variável errada (seção 4.3), e calcula `cssVariables(light)` uma vez
  (seção 4.5). O `config.env` já inclui as variáveis do processo e as do
  `.env.development`, no `vite dev`.
- **`transformIndexHtml`, com `order: "pre"`**, devolve
  `render(pageOf(ctx.filename), { env, brandCss })`.
  - O `pre` é o que faz o Vite tratar o HTML renderizado como se fosse o
    arquivo: as URLs de `<img>`, `<link rel="icon">` e
    `<link rel="stylesheet">` são resolvidas e marcadas com hash depois do hook
    (medido).
  - `pageOf` mapeia `index.html` para `"home"`, `404.html` para `"not-found"` e
    `og-card.html` para `"og-card"`, e lança diante de qualquer outro nome.
- **`transformIndexHtml`, com `order: "post"`**, só no build
  (`config.command === "build"`), chama `assertPublishable(html, env.indexable)`
  sobre o HTML já compilado. No `vite dev` não roda, porque o Vite injeta
  `/@vite/client`, que é um `<script>`.
- **`generateBundle`** emite `robots.txt` e, quando couber, `sitemap.xml`, com
  `this.emitFile`.

**`src/render.tsx`** devolve `"<!doctype html>" + renderToStaticMarkup(<Página
{...props} />)`. É `renderToStaticMarkup` e não `renderToString`: este último
deixa marcadores de hidratação, e aqui nunca vai haver hidratação.

**Nenhum React chega ao ar porque nenhum `<script>` o carrega.** As entradas
não têm `<script>`, e `assertPublishable` recusa um `<script>` no HTML
compilado. Um `<script type="module" src="/src/main.tsx">` acrescentado por
engano mandaria o React inteiro ao navegador, e o build reprovaria.

### 4.3 `config/page-env.ts`

Funções puras, testadas em `page-env.test.ts`.

**`readPageEnv(env)`** devolve `{ appUrl, pageUrl, whatsappNumber, indexable }`
ou lança um erro que diz qual variável está errada e o que recebeu:

- `VITE_APP_URL` e `VITE_PAGE_URL` precisam ser exatamente a **origem**, ou
  seja, `valor === new URL(valor).origin`. Isso recusa barra no fim, caminho,
  query e fragmento numa comparação só. O protocolo é `https:`, e `http:` só vale
  para `localhost` e `127.0.0.1`.
- `VITE_WHATSAPP_NUMBER` só tem dígitos, começa por `55` e tem 12 ou 13
  dígitos.
- `VITE_PAGE_INDEXABLE` pode faltar, ser `"false"` ou ser `"true"`. Qualquer
  outro valor é recusado: um `"ture"` digitado errado não pode desligar a
  indexação de produção em silêncio.

Sem essa recusa, o componente montaria `href="undefined/cadastro"`, e o build
passaria.

**`assertPublishable(html, indexable)`** confere o HTML **compilado**, que é o
único lugar onde estes defeitos aparecem:

- um `<script` (seção 4.2);
- um `src` ou `href` com `data:`, que a CSP bloquearia no ar sem nada falhar
  aqui. É esta trava que sustenta o `assetsInlineLimit: 0`;
- um `src` ou `href` que ainda comece por `/src/` ou `../`, ou seja, um caminho
  de imagem que o Vite não achou. O build passa com ele (medido), e a imagem
  quebraria só no ar;
- com indexação ligada, `[A PREENCHER]` (R-VND-09).

**`robotsTxt` e `sitemapXml`:** com indexação desligada, `User-agent: *` e
`Disallow: /`, sem sitemap. Com indexação ligada, `Allow: /`, mais
`Sitemap: <pageUrl>/sitemap.xml`, e o sitemap lista `<pageUrl>/` (R-VND-18).

**`.env.development`**, commitado, para o `vite dev` abrir sem configuração:

```
VITE_APP_URL=http://localhost:3000
VITE_PAGE_URL=http://localhost:3100
VITE_WHATSAPP_NUMBER=5500000000000
```

O DDD `00` não existe, então um clique em desenvolvimento não chama ninguém. O
`vite build` roda em modo `production` e não lê esse arquivo, então o build
continua recusando as variáveis ausentes. O `.gitignore` cobre `.env` e
`.env*.local`, não `.env.development`, e o arquivo não guarda credencial.

**Efeito colateral:** o `npm run build` da raiz roda todos os workspaces e
passa a exigir as três variáveis. Hoje ninguém usa o build da raiz (o CI e os
deploys compilam por workspace), e quem usar vai ler na mensagem o nome da
variável que falta.

### 4.4 `src/links.ts`

Funções puras, testadas em `links.test.ts`. Os componentes de link chamam
estas funções, e nenhum componente monta URL por conta própria.

- `signUpUrl(env)` é `${env.appUrl}/cadastro`, e `signInUrl(env)` é
  `${env.appUrl}/entrar` (R-VND-10).
- `whatsappUrl(env, message)` é
  `https://wa.me/${env.whatsappNumber}?text=${encodeURIComponent(message)}`
  (R-VND-11). O `+` de "Escola + plataforma" sai `%2B`, e não vira espaço.

`WhatsAppLink` é o único componente que escreve `target="_blank"` e
`rel="noopener noreferrer"`, então nenhum link de WhatsApp nasce sem eles.

### 4.5 `config/brand-tokens.ts`

**`cssVariables(scheme)`** percorre o `SchemeTokens` e devolve
`:root { color-scheme: light; … }` com uma variável por papel, em kebab-case:
`--surface-base`, `--surface-control-border`, `--text-secondary`,
`--accent-primary-soft`, `--accent-focus-ring`, `--fill-primary-hover`,
`--elevation-md` e assim por diante. Junto vêm os tokens sem cor de que o CSS
precisa: `--radius-md`, `--radius-lg`, `--radius-pill`, `--font-sans`,
`--font-mono`, `--motion-fast` e `--easing-standard`.

O componente `Document` o escreve como primeiro filho do `<head>`, com
`<style dangerouslySetInnerHTML={{ __html: brandCss }} />`. O
`dangerouslySetInnerHTML` existe porque o React escaparia o texto como filho
comum. O conteúdo é gerado dos tokens, e nada de quem visita a página entra
nele.

Ser `<style>` embutido, e não arquivo, é o que a spec decidiu (R-VND-15). O
preço é o `'unsafe-inline'` em `style-src`, aceitável numa página sem nenhum
conteúdo de terceiro onde injetar. Fica registrado aqui como um custo, não como
um descuido.

**`mediaQueriesOf(css)`** existe para o teste: `@media` não aceita `var()`, e é
exatamente por isso que alguém escreveria `@media (min-width: 768px)`. O teste
lê `src/styles.css` e reprova qualquer consulta que não seja
`(min-width: <n>px)` com `n` de `breakpoints`, ou
`(prefers-reduced-motion: no-preference)`.

### 4.6 Componentes e conteúdo

- **`Document`** escreve `<html lang="pt-BR">` e o `<head>` inteiro: título,
  descrição, `canonical`, `og:*`, `twitter:card`, `robots` (quando
  `!env.indexable`), ícone, o `<style>` dos tokens e o
  `<link rel="stylesheet" href="/src/styles.css">`. As três páginas o usam, e
  é assim que nenhuma nasce sem metadado.
- **`content.ts`** guarda, como dados `as const`, o que se repete em lista:
  ofertas, recursos, passos e perguntas. Os marcadores `[A PREENCHER]` moram ali
  ou no componente da seção, nunca em dois lugares. O que aparece uma vez só
  (abertura, chamado final, 404) fica no componente da página.
- **Os componentes não têm estado nem efeito.** Nada roda no navegador: um
  `useState` renderizaria o valor inicial uma vez e nunca mudaria, e um
  `useEffect` simplesmente não rodaria. O `eslint.config.js` recusa com
  `no-restricted-imports` todo hook importado de `react`, com essa explicação na
  mensagem.
- **Nenhuma prop `style`.** O estilo mora em `styles.css`, com classes escritas
  à mão (`.button--primary`, `.offer`). O único CSS embutido é o dos tokens.
- **Imagens por caminho de texto**, relativo à raiz do projeto
  (`/src/assets/screens/minha-semana.webp`) ou ao HTML de entrada
  (`../web/public/fronteira-mark.svg`). O Vite os resolve, e
  `assertPublishable` acusa o caminho que ele não achou.
- **Sem teste de unidade de componente.** O runner nativo do Node só remove
  tipos e não compila JSX. Testar componentes exigiria trazer um runner novo
  para conferir o que o e2e e o `assertPublishable` já conferem no HTML
  compilado. Lógica que mereça teste sai do componente para um `.ts`, como
  `links.ts`.

### 4.7 Fontes

No topo de `src/styles.css`:

```css
@import "@fontsource-variable/dm-sans/wght.css";
@import "@fontsource/dm-mono/500.css";
```

O Vite copia os `.woff2` para `assets/` com hash (medido). Os dois arquivos
declaram os subconjuntos latino e latino estendido com `unicode-range`, e texto
em português só baixa o latino. O mono aparece só nos números do passo a passo,
e por isso entra um peso só: `monoWeight.medium`, já que DM Mono não tem
negrito.

---

## 5. O texto proposto

A ordem das seções serve a duas coisas. Primeiro, ao argumento: o que é, como
se compra, o que tem, como começa, dúvidas. Segundo, ao orçamento de bytes:
"Ofertas" é só texto, e afasta as imagens de "Recursos" da primeira dobra
(seção 7.4).

As tabelas abaixo são o conteúdo de `content.ts` e dos componentes de página.

Os `data-testid` seguem as regras do CLAUDE.md: nomeiam o papel, e o que varia
vai num `data-*` ao lado. Cada um é escrito pelo componente que tem o papel, e
nunca na página. São estes:

- `cta-signup` em todo "Criar minha conta" (`SignUpLink`), `cta-signin` em todo
  "Entrar" (`SignInLink`) e `cta-whatsapp` em todo link de WhatsApp
  (`WhatsAppLink`), com `data-offer` (`school`, `platform` ou `general`);
- `offer`, `step`, `access-notice`, `faq-item` e `product-shot`.

Todo `cta-*` é um controle de ação, e todos medem pelo menos 44×44 (R-VND-19),
inclusive os do rodapé. Por isso nenhum fica dentro de um parágrafo, onde não
haveria altura para isso.

### `<head>` (`Document`)

| Campo | Texto |
|---|---|
| `title` | Fronteira Concursos · Sua semana de estudo montada por um professor |
| `description` | Aulas, revisões, Lei Seca, flashcards e simulados numa plataforma só, com a semana montada por um professor. Na escola presencial ou online. |
| `og:title` | Fronteira Concursos — sua semana de estudo montada por um professor |
| `og:description` | igual à `description` |
| `og:image` | `${env.pageUrl}/og.png`, com `og:image:width` 1200, `og:image:height` 630 e `og:image:alt` "Fronteira Concursos" |
| `canonical` e `og:url` | `${env.pageUrl}/` |
| ícone | `<link rel="icon" href="../web/public/fronteira-mark.svg" type="image/svg+xml">` |

### Cabeçalho (`Header`, fixo no topo)

- O símbolo, num link para `/`, com `alt="Fronteira Concursos"`. O nome escrito
  ao lado aparece a partir de `sm`.
- `nav aria-label="Seções"`, com "Ofertas", "Recursos", "Como funciona" e
  "Perguntas", ancorados nas seções. Aparece a partir de `lg`.
- **Entrar** (`SignInLink`).
- **Criar minha conta** (`SignUpLink`).

### Abertura

> # Estude para o concurso com a semana montada por um professor.
>
> A Fronteira Concursos junta aulas, revisões, Lei Seca, flashcards e simulados
> numa plataforma só. Um professor monta a sua semana, acompanha o seu
> desempenho e ajusta o plano.
>
> **[Criar minha conta]** · [Falar no WhatsApp]

- Mensagem do WhatsApp: "Olá! Vim pela página da Fronteira Concursos e quero
  saber mais."
- `ProductShot` com `minha-semana.webp`, `fetchPriority="high"` e a legenda
  "Telas reais da plataforma, com dados de demonstração." (R-VND-06).

### Ofertas — `id="ofertas"`

> ## Duas formas de estudar com a Fronteira
>
> As duas têm a plataforma completa e a semana montada por um professor. O que
> muda é onde as aulas acontecem.

Dois `OfferCard`, sem nenhuma prop que mude tamanho ou destaque, e sem selo de
"mais procurado" (R-VND-01).

| | `data-offer="school"` | `data-offer="platform"` |
|---|---|---|
| Título (`h3`) | Escola + plataforma | Plataforma |
| Frase | Aulas presenciais com a turma, e a plataforma para estudar entre uma aula e outra. | Estude de onde estiver, com a semana montada por um professor. |
| Lista | Aulas presenciais em [A PREENCHER: cidade e bairro] · Simulado presencial, com o ranking da turma na plataforma · A semana montada pelo professor · Aulas com PDF, revisões, Lei Seca e flashcards | A semana montada pelo professor · Aulas com PDF, questões e Resumos Flash · Revisões, Lei Seca e flashcards · Desempenho por disciplina |
| Chamados | **Criar minha conta** · Falar no WhatsApp | **Criar minha conta** · Falar no WhatsApp |
| Mensagem do WhatsApp | Olá! Vim pela página da Fronteira Concursos e quero saber da Escola + plataforma. | Olá! Vim pela página da Fronteira Concursos e quero saber da Plataforma. |

Depois dos cartões, a frase de R-VND-02:

> Valores e turmas são combinados pelo WhatsApp.

### Recursos — `id="recursos"`

> ## O que tem na plataforma
>
> Telas reais da plataforma, com dados de demonstração.

Quatro `Feature` (R-VND-05), cada um com `h3`, um parágrafo e um
`ProductShot`. A partir de `lg`, a imagem alterna de lado.

| `h3` | Texto | Imagem |
|---|---|---|
| A semana montada pelo professor | O professor diz o que estudar em cada dia e por quanto tempo. Você acompanha no cronograma, registra o que estudou por fora e mede o tempo com o cronômetro. | `cronograma.webp` |
| Aulas e revisões no tempo certo | Cada aula traz o PDF, as questões iniciais e o Resumo Flash. Depois, as revisões voltam ao conteúdo em intervalos, para ele não escapar. | `aulas.webp` |
| Lei Seca e flashcards | Leia a lei artigo por artigo, revise com flashcards e grife o que importa. Os grifos ficam salvos na sua conta e aparecem em qualquer aparelho. | `leis.webp` |
| Simulados e estatísticas | Acompanhe o desempenho por disciplina e o tempo de estudo de cada semana. Na escola, o simulado presencial entra na plataforma com o ranking da turma. | `estatisticas.webp` |

Cada frase corresponde a algo que está no ar: estudo extra (spec 19), questões
iniciais e revisões (`record_initial_questions` e `record_review_questions`),
grifos no banco (`law_marks` e `flashcard_marks`), desempenho por disciplina e
ranking do simulado (`SubjectPerformanceCard` e `MockExamRanking`). **De
propósito, a página não diz "veja onde você mais erra":** dificuldades por
tópico (spec 23) não tem cobertura. Recurso que sair do ar sai daqui no mesmo
commit (R-VND-05).

### Como funciona — `id="como-funciona"`

> ## Como funciona

Uma `ol` de `Step`, cada um em `data-testid="step"`. O número aparece em DM
Mono e leva `aria-hidden`, porque a própria lista já dá a ordem.

1. **Crie a sua conta.** Nome, e-mail e senha.
2. **Diga o que você estuda.** Depois do cadastro, você entra na lista de
   espera e informa o WhatsApp, a área e o concurso em foco.
3. **Combine com o professor.** Pelo WhatsApp, vocês combinam a oferta, o valor
   e a turma. **Criar a conta não libera as aulas: o professor libera o seu
   acesso depois desse contato.** ← `data-testid="access-notice"`
4. **Comece a semana.** Com o acesso liberado, a sua semana aparece montada na
   plataforma.

Os três campos do passo 2 são os obrigatórios de R-CTA-07.

### Perguntas — `id="perguntas"`

> ## Perguntas frequentes

Cada pergunta é um `FaqItem`: um `details` com `summary`, em
`data-testid="faq-item"`.

| Pergunta | Resposta |
|---|---|
| Criar a conta já libera as aulas? | Não. A conta nasce na lista de espera, e o professor libera o acesso depois de conversar com você e combinar a oferta. Até lá, você já consegue entrar, manter os seus dados e dizer para qual concurso estuda. ← `data-testid="access-notice"` |
| Quanto custa? | Depende da oferta e da turma. Valores e turmas são combinados pelo WhatsApp. |
| Para qual concurso a Fronteira prepara? | Para concursos em geral. Você diz o concurso em foco na lista de espera, e o professor monta a semana a partir dele. |
| Onde são as aulas presenciais? | [A PREENCHER: endereço da escola, dias e horários das turmas.] |
| Preciso instalar alguma coisa? | Não. A plataforma abre no navegador, no computador ou no celular. |
| Por quanto tempo vale o acesso? | Pelo período combinado com o professor. A data de vencimento aparece em Meus dados, dentro da plataforma. |
| Já tenho conta. Por onde entro? | Pelo botão Entrar, no alto da página. (Aqui é texto, não link: um link no meio da resposta não teria os 44px de R-VND-19.) |

A sexta resposta é R-CTA-16: "Válido até" aparece no cartão Acesso de Meus
dados.

### Chamado final

> ## Pronto para montar a sua semana?
>
> Crie a conta agora e combine o resto pelo WhatsApp.
>
> **[Criar minha conta]** · [Falar no WhatsApp]

A mensagem do WhatsApp é a da abertura.

### Rodapé (`Footer`)

O símbolo e "Fronteira Concursos"; os links "Entrar", "Criar minha conta" e
"WhatsApp", pelos mesmos componentes de link e com `min-height: 44px`; e a
linha "[A PREENCHER: razão social e CNPJ]". Não há ano de copyright: um ano
escrito à mão envelhece sozinho.

### `NotFound` (o 404)

O mesmo `Header`, sem a `nav`, e o mesmo `Document`.

- `title`: "Página não encontrada · Fronteira Concursos", com `robots`
  `noindex` sempre, porque um 404 nunca se indexa.
- `h1`: "Esta página não existe."
- Texto: "O endereço pode ter mudado ou ter sido digitado com algum erro."
- Links: "Ir para a página inicial" (`/`) e **Criar minha conta**
  (`SignUpLink`).

Todos os caminhos de asset saem absolutos (`/assets/…`), que é o padrão do
Vite com `base: "/"`. É isso que faz o 404 de `/a/b/c` carregar o CSS.

---

## 6. O estilo

Um `styles.css` só, escrito para a tela pequena primeiro e alargado por
`@media (min-width: …)` nos pontos de `breakpoints`: 561, 701, 821 e 1025.

- **Coluna:** `width: min(1120px, 100% - 32px)` com `margin-inline: auto`. É
  1120 como a entrada do app (`PublicLayout`) e dá 16px de margem a 375px.
- **Grade:** colunas sempre `minmax(0, 1fr)`, nunca `1fr` sozinho (regra do
  CLAUDE.md, de 375px). Os cartões de oferta lado a lado a partir de `md`.
- **Cabeçalho:** `position: sticky; top: 0`, fundo `--surface-raised` e borda
  inferior `--surface-border`. Abaixo de `sm`, mostra só o símbolo, "Entrar" e
  "Criar minha conta" (32 + 70 + 160 px cabem nos 343). As seções levam
  `scroll-margin-top` com a altura do cabeçalho, para a âncora não esconder o
  título.
- **Botões:** `.button`, com `min-height: 44px` (R-VND-19), `--radius-md` e
  peso 600.
  - `--primary`: fundo `--fill-primary` e texto `--fill-primary-text`. No hover
    vai para `--fill-primary-hover`: texto branco escurece no hover (CLAUDE.md).
  - `--secondary`: fundo `--surface-raised`, texto `--accent-primary` e borda de
    1px `--surface-control-border`, que é limite de controle e precisa de 3:1.
- **Foco:** `:focus-visible { outline: 2px solid transparent; box-shadow:
  var(--accent-focus-ring) }`. O contorno transparente é o que aparece no modo
  de alto contraste do Windows, onde a sombra some.
- **Fundo da abertura:** os dois halos de `PublicLayout`, com os mesmos
  números, sobre `--surface-base`: `--accent-primary-soft` a 75% 15% e
  `--accent-secondary-soft` a 18% 92%.
- **Cartões:** `--surface-raised`, borda `--surface-border` (acabamento, sem
  3:1), `--radius-lg` e `--elevation-sm`.
- **Texto:** `--text-primary` e `--text-secondary` sobre `--surface-base` e
  `--surface-raised`; links em `--accent-primary`, sublinhados. Todos esses pares
  estão em `contrast.test.ts`.
- **Tipografia:** a raiz fica nos 16px do navegador (CLAUDE.md). O corpo é
  `1rem` com entrelinha 1,55.
  - `h1`: `clamp(2.25rem, 1.4rem + 3.6vw, 3.625rem)`, peso 800, `letter-spacing`
    −0,04em, na linha do título de `PublicLayout`;
  - `h2`: `clamp(1.625rem, 1.2rem + 1.6vw, 2.25rem)`;
  - `h3`: `1.25rem`.
- **Perguntas:** `summary` com `min-height: 44px`, `list-style: none` e um
  chevron em `::after` que gira com `[open]`.
- **Imagens:** `max-width: 100%`, `height: auto`, borda `--surface-border`,
  `--radius-lg` e `--elevation-lg`. `ProductShot` exige `width` e `height`,
  para a página não pular quando a imagem chega.
- **Movimento:** `scroll-behavior: smooth`, o giro do chevron e as transições de
  hover só dentro de `@media (prefers-reduced-motion: no-preference)`. Nada de
  `transition` no `body` (CLAUDE.md).
- **"Pular para o conteúdo":** fora da tela até receber foco. O destino é
  `<main id="conteudo" tabIndex={-1}>`.
- **Tema:** sem `@media (prefers-color-scheme)` nenhum, e `color-scheme: light`
  no `:root` (R-VND-08).

---

## 7. As imagens

### 7.1 As capturas do produto

**`apps/e2e/tools/landing-screens.ts`**, rodado com
`npm run landing:screens --workspace @bora/e2e`, no Node 24.

1. Sobe o app com `npm run dev --workspace @bora/web -- --port 3200` e o
   ambiente `VITE_API_IMPL=fixtures`, `VITE_SENTRY_DSN=` e as duas
   `VITE_SUPABASE_*` locais de `apps/web/.env.example`. O `lib/env.ts` exige as
   duas mesmo no modo `fixtures`, porque `lib/api/index.ts` importa o
   adaptador do Supabase. A sessão já nasce como a aluna de exemplo, com acesso
   liberado (`seedState()` em `lib/api/fixtures.ts`).
2. **Aborta toda requisição que não seja para `localhost:3200`, e falha se
   houver alguma.** É o que garante R-VND-06, de que nenhum dado real entra na
   imagem, e não só promete.
3. Abre o Chromium com viewport 1280×800, `deviceScaleFactor: 1`, `locale`
   pt-BR, fuso de São Paulo e tema claro. Para cada rota, espera o `h1` e o
   `networkidle` e captura a viewport em PNG.
4. Converte o PNG para WebP dentro do próprio Chromium: desenha num `canvas` e
   chama `toDataURL("image/webp", 0.82)`. Assim não entra dependência nova. Em
   seguida grava em `apps/landing/src/assets/screens/` e **falha se o arquivo
   passar do orçamento**.

| Arquivo | Rota | Onde aparece | Orçamento |
|---|---|---|---|
| `minha-semana.webp` | `/aluno` | abertura | 90 KB |
| `cronograma.webp` | `/aluno/cronograma` | recursos, 1º | 50 KB |
| `aulas.webp` | `/aluno/teoria` | recursos, 2º | 50 KB |
| `leis.webp` | `/aluno/leis` | recursos, 3º | 50 KB |
| `estatisticas.webp` | `/aluno/estatisticas` | recursos, 4º | 50 KB |

**WebP, e não JPEG** como dizia a primeira versão da spec, que foi corrigida:
captura de tela tem área chapada e texto. O JPEG borra o texto nas bordas e
pesa mais, e o orçamento de 350 KB não tem folga para isso.

O 1280 de largura exibido a cerca de 640px CSS dá densidade 2× em tela retina
sem precisar de `srcset`.

O texto alternativo mora em `content.ts`, junto do caminho da imagem, e é
escrito **olhando a captura gerada**: um `alt` que descreve outra tela é pior do
que nenhum. Rascunho, a conferir:

- `minha-semana`: "A tela Minha semana, com as metas de cada dia: disciplina,
  tipo de estudo e tempo previsto."
- `cronograma`: "O cronograma da semana, com as metas distribuídas pelos dias."
- `aulas`: "A lista de aulas, com o PDF, as questões iniciais e o Resumo Flash de
  cada uma."
- `leis`: "Um artigo de lei aberto para leitura." Acrescente "com um trecho
  grifado" só se a amostra tiver grifo.
- `estatisticas`: "O painel de estatísticas, com o desempenho por disciplina."

### 7.2 A imagem de compartilhamento

**`src/pages/OgCard.tsx`** é um quadro de 1200×630 com os halos, o símbolo, o
nome e a frase do `h1`, **sem captura de tela**. Com área chapada, o PNG fica
pequeno. Usa o mesmo `Document` e o mesmo CSS da página. A entrada `og-card.html`
é servida pelo `vite dev`, mas não está no `input` do build e por isso nunca
chega ao `dist`.

A mesma ferramenta sobe `npm run dev --workspace @bora/landing` na porta 3100,
abre `/og-card.html` e captura o quadro em `apps/landing/public/og.png`. O teto
é de 250 KB: o WhatsApp descarta a prévia quando a imagem é pesada, e esse teto
deixa folga.

O `og.png` fica em `public/` porque o `og:image` precisa de um endereço estável
(R-VND-17). Com hash, cada build mudaria a URL que os robôs de prévia já
guardaram.

### 7.3 Quando regenerar

Quando uma tela do aluno mudar de forma visível, ou quando um token mudar.
A ferramenta roda à mão e o resultado é commitado: o CI não tem o app em modo
`fixtures` no ar, e não precisa ter. A troca de imagens vai num commit próprio.

### 7.4 O orçamento dos 350 KB

| Item | Estimativa |
|---|---|
| HTML (sem compressão: o `wrangler dev` local não comprime, e medir sem compressão é medir o pior caso) | ~20 KB |
| CSS | ~10 KB |
| DM Sans latino + DM Mono 500 latino | 52 KB |
| Símbolo | 1 KB |
| `minha-semana.webp` | ≤ 90 KB |
| **Subtotal** | **~173 KB** |
| Imagens `loading="lazy"` perto da dobra | +50 a 100 KB |

**A armadilha está na última linha.** O Chrome começa a baixar a imagem
`loading="lazy"` cerca de 1250px **antes** de ela entrar na tela (2500px em
conexão lenta). Numa janela de 1280×720, tudo até uns 1970px de altura chega
na primeira carga. É por isso que "Ofertas", que é só texto, fica entre a
abertura e "Recursos": a primeira ou as duas primeiras imagens de recurso
entram na conta, e as outras não. F-VND-09 mede o número real.

O `preload` que o React 19 acrescenta para imagem sem `loading="lazy"` não
muda a conta: aponta para a mesma URL do `<img>`, e o navegador a baixa uma
vez só.

---

## 8. Cabeçalhos e Worker

### 8.1 `public/_headers`

```
# As duas regras do app (apps/web/public/_headers), pelo mesmo motivo: regras
# que casam o mesmo caminho CONCATENAM os valores, então o asset apaga o
# Cache-Control com `!` antes de escrever o seu.
/*
  Cache-Control: no-cache
  Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
```

- **`default-src 'none'`, sem `script-src`:** script nenhum roda, nem embutido,
  nem de arquivo (R-VND-14). É a mesma regra que `assertPublishable` confere no
  build, agora do lado do navegador.
- **`style-src 'unsafe-inline'`:** o `<style>` dos tokens (seção 4.5).
- **`form-action 'none'` e `frame-ancestors 'none'`:** a página não tem
  formulário, e ninguém a embute.
- A CSP **não** governa a navegação para o app nem para `wa.me`: clique em link
  é navegação de topo, e a diretiva que a controlaria (`navigate-to`) não
  existe nos navegadores.
- A regra `/*` vale também para o 404. Medido no `wrangler dev`.

### 8.2 `wrangler.jsonc`

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "bora-landing",
  "compatibility_date": "2026-08-23",
  "assets": {
    "directory": "./dist",
    // O oposto do app: caminho inexistente responde 404 com o 404.html (R-VND-16).
    "not_found_handling": "404-page"
  },
  "env": {
    // Pela regra do sufixo, o Worker publicado é `bora-landing-staging`.
    "staging": {},
    // `name` explícito, senão o sufixo o transformaria em `bora-landing-producao`.
    // Deploy SEMPRE com `--env`, como no app.
    "producao": { "name": "bora-landing" }
  }
}
```

### 8.3 Sem `favicon.ico`

O ícone é o próprio símbolo, por `<link rel="icon">`, e é o mesmo arquivo com
hash do `<img>` do cabeçalho. O navegador só pede `/favicon.ico` quando a
página não declara ícone nenhum. Copiar o `.ico` do app seria o arquivo
copiado que R-VND-07 proíbe, e a spec foi corrigida para tirá-lo da superfície.

---

## 9. Testes

### 9.1 Unidade, em `npm run check`

**`config/page-env.test.ts`:**

- **CA-11:** cada variável ausente lança um erro que diz o nome dela. A tabela de
  valores malformados inclui:
  - `https://x.dev/` (barra no fim), `https://x.dev/app` (caminho),
    `http://x.dev` (http fora de localhost) e `ftp://x.dev`;
  - `(11) 90000-0000` (máscara), `11900000000` (sem o 55) e um número de 14
    dígitos.

  Também cobre os casos que passam: `http://localhost:3000` e números de 12 e de
  13 dígitos.
- **CA-12:**
  - desligada: o `robotsTxt` diz `Disallow: /` e não há sitemap;
  - ligada: `Allow`, `Sitemap: <pageUrl>/sitemap.xml`, o sitemap lista
    `<pageUrl>/`, e `[A PREENCHER]` lança;
  - `VITE_PAGE_INDEXABLE="ture"` lança.
- **`assertPublishable` (CA-15):** lança diante de `<script`, de
  `src="data:…"`, de `src="/src/…"` e de `href="../…"`, com indexação ligada ou
  não; e aceita um HTML compilado limpo.

O `noindex` no HTML é escrito pelo `Document`, e quem o confere é o F-VND-06,
contra a página servida.

**`src/links.test.ts`:** cadastro e entrada saem da origem do app sem barra
dobrada; no `whatsappUrl`, o `+` sai `%2B`, o acento sai codificado e o número
vai no caminho.

**`config/brand-tokens.test.ts` (CA-13):**

- toda folha de `light` vira uma variável `--`;
- não há dois papéis caindo no mesmo nome em kebab-case;
- todo `@media` de `src/styles.css` é um valor de `breakpoints` ou o de
  movimento reduzido.

**Componente não tem teste de unidade** (seção 4.6). O que eles produzem é
conferido no HTML compilado: em todo build, por `assertPublishable`, e na suíte
e2e, abaixo.

### 9.2 Ponta a ponta, em `npm run e2e`

**`support/app.ts`** ganha:

```ts
export const LANDING_URL = process.env["E2E_LANDING_URL"] ?? "http://localhost:3110";
/** DDD 00: não existe, então nenhum link de teste chama ninguém. */
export const LANDING_WHATSAPP = "5500000000000";
```

**`playwright.config.ts`:** `webServer` vira lista, e o segundo servidor é:

```ts
{
  command:
    `npm run build --workspace @bora/landing && ` +
    `npx wrangler dev --config apps/landing/wrangler.jsonc --ip 127.0.0.1 --port ${new URL(LANDING_URL).port}`,
  url: LANDING_URL,
  cwd: "../..",
  // NUNCA reaproveita. O dist é compilado só quando o comando sobe: reaproveitar
  // um `wrangler dev` antigo testaria, em silêncio, a página do build anterior.
  // Porta ocupada vira erro que diz qual porta.
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    VITE_APP_URL: BASE_URL,
    VITE_PAGE_URL: LANDING_URL,
    VITE_WHATSAPP_NUMBER: LANDING_WHATSAPP,
    WRANGLER_SEND_METRICS: "false",
  },
}
```

A porta 3110 não colide com o `vite dev` da página (3100), com o app (3000) nem
com a ferramenta de capturas (3200).

**`support/contrast.ts`** recebe o `assertAA` que hoje é local em
`tests/theme.spec.ts`, com as listas de seletores como parâmetro. O
`theme.spec.ts` passa as dele. Assim o contraste da página é medido pela mesma
régua, sem cópia.

**`tests/landing.spec.ts`** importa `test` de `../fixtures/index.ts`, como os
outros arquivos, e tem um `describe` por id:

| Id | Como prova |
|---|---|
| F-VND-01 | `test.use({ javaScriptEnabled: false })`. Confere: o `h1` visível; dois `offer` com os nomes "Escola + plataforma" e "Plataforma"; um `access-notice` dentro de `#como-funciona` e outro dentro de `#perguntas`; um clique num `summary` deixa o `details` com `open`; o `innerText` do `body` não contém "R$". |
| F-VND-02 | Todo `cta-signup` tem `href` igual a `${BASE_URL}/cadastro`, e todo `cta-signin` igual a `${BASE_URL}/entrar`. Depois clica no do cabeçalho e preenche o cadastro como F-AUTH-08. Espera `/aluno/lista-espera` com o aviso "Seu acesso ainda não foi liberado" e confere no banco, por `fixtures/db.ts`, `teacher_id` nulo e `access_status` `pending`. |
| F-VND-03 | Pelo menos quatro `cta-whatsapp`. Em cada um: host `wa.me`, caminho `/${LANDING_WHATSAPP}`, `text` não vazio, `target="_blank"` e os dois tokens no `rel`. Dentro de cada `offer`, o `text` contém o nome da oferta. |
| F-VND-04 | Junta tudo de `page.on("request")`. Abre a página, rola até o `footer` em passos de `mouse.wheel`, para disparar as imagens preguiçosas, e espera o `networkidle`. Toda origem pedida é a da página. Na resposta do `goto`, a CSP contém `default-src 'none'` e não contém `script-src`. |
| F-VND-05 | Viewport 375×812. `documentElement.scrollWidth === clientWidth`. Todo `[data-testid^="cta-"]` e todo `summary` visível mede pelo menos 44×44 no `boundingBox()`. |
| F-VND-06 | `request.get(LANDING_URL + "/")`, sem navegador, e expressões regulares **sem diferenciar maiúsculas** sobre o HTML (o React escreve `charSet`). Confere `lang="pt-BR"`, `title`, `description`, `canonical` e `og:url` iguais a `${LANDING_URL}/`, `og:image` igual a `${LANDING_URL}/og.png`, `og:type`, `og:locale` `pt_BR`, `twitter:card` `summary_large_image` e o `robots` `noindex` (o build do e2e não liga a indexação). O `og:image` responde `image/png`. |
| F-VND-07 | `request.get` num caminho com `Date.now()` responde 404, e o corpo tem `href="/"` e `href="${BASE_URL}/cadastro"`. |
| F-VND-08 | Abre todos os `details`, para as respostas entrarem na medida, e chama `assertAA`. Texto: `h1, h2, h3, p, li, a, summary, figcaption, .button`. Limite: `.button--secondary`. |
| F-VND-09 | Viewport 1280×720. Soma `responseBodySize + responseHeadersSize` de `request.sizes()` em todo `requestfinished` até o `networkidle`. O total fica em no máximo 350 × 1024 bytes, e a mensagem de falha lista o peso de cada item. |
| F-VND-10 | O primeiro `Tab` foca "Pular para o conteúdo", e o `Enter` deixa o foco em `main#conteudo`. Há um `h1` só, e todo `product-shot` tem `alt` não vazio. |

Quando os testes existirem, os dez ids saem de "Fluxos que ainda não existem",
em `fluxos-e2e.md`, para uma seção de área nova ("Página de vendas —
`tests/landing.spec.ts`"), e aquela seção volta a dizer "Hoje não há nenhum."

### 9.3 Fumaça no ar — `scripts/fumaca-pagina.sh`

Uso: `fumaca-pagina.sh <url-da-página> <url-do-app> [--indexavel]`. Roda no CI
depois de publicar, e à mão contra qualquer ambiente.

- `/`:
  - 200, `text/html` e `Cache-Control` com `no-cache`;
  - contém `<h1`, e não contém `<script`;
  - a CSP tem `default-src 'none'` e não tem `script-src`.
- `canonical` e `og:url` começam pela URL da página; o `og:image` responde
  `image/png`.
- O HTML tem `href="<app>/cadastro"`.
- `/fumaca-<aleatório>` responde **404**, e o corpo cita `<app>/cadastro`.
- `robots.txt`: sem `--indexavel`, `Disallow: /`. Com `--indexavel`, tem
  `Sitemap:`, e o HTML não tem `[A PREENCHER]`.
- O CSS (o caminho sai do HTML, como em `fumaca.sh`) responde com `immutable` e
  sem `no-cache`.

**A propagação aqui falha de outro jeito, e a espera precisa saber disso.** Em
`fumaca.sh` (medido em 18/09/2026), o asset que ainda não propagou volta como
`index.html` com status 200, por causa do fallback de SPA. Aqui o
`not_found_handling` é `404-page`, então o asset que ainda não chegou volta
**404**. A espera tenta o CSS até 6 vezes, com 5 segundos entre as tentativas,
antes de reprovar. Sem isso, a fumaça acusaria cabeçalho errado num asset que
só estava atrasado.

---

## 10. Publicação

### 10.1 `ci.yml`: dois passos depois de "Validar a configuração do Worker"

```yaml
      # Spec 44. Placeholders, como no site: este dist nunca é publicado. O
      # número é do DDD 00, que não existe — um link de teste não chama ninguém.
      - name: Compilar a página de vendas
        run: npm run build --workspace @bora/landing
        env:
          VITE_APP_URL: https://app.exemplo.com.br
          VITE_PAGE_URL: https://exemplo.com.br
          VITE_WHATSAPP_NUMBER: "5500000000000"

      - name: Validar o Worker da página
        env:
          WRANGLER_ENV: ${{ inputs.wrangler_env || 'staging' }}
        run: npx wrangler deploy --config apps/landing/wrangler.jsonc --env "$WRANGLER_ENV" --dry-run
```

É o CA-14. O gate continua sendo um workflow só (CLAUDE.md): os deploys chamam
este arquivo, e ninguém copia os passos. Como `assertPublishable` roda dentro do
build, este passo também reprova a PR que acrescentar um `<script>`, uma imagem
com caminho errado ou um `data:`.

### 10.2 Job `pagina` nos dois deploys

Em `deploy-staging.yml`:

```yaml
  # Spec 44, R-VND-22. Depende só do gate: a página não fala com o banco, e
  # esperar o job `banco` só prenderia a página a uma migration que não lhe diz
  # respeito. Pelo mesmo motivo, `site` e `fumaca` não esperam por ela.
  pagina:
    needs: verificar
    runs-on: ubuntu-latest
    environment: staging
    env:
      WRANGLER_SEND_METRICS: "false"
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Instalar
        run: npm ci

      # `VITE_APP_URL` é o `SITE_URL` do Environment, e não uma variável nova:
      # é o mesmo fato, e duas variáveis para ele derivariam.
      - name: Compilar a página
        env:
          VITE_APP_URL: ${{ vars.SITE_URL }}
          VITE_PAGE_URL: ${{ vars.PAGE_URL }}
          VITE_WHATSAPP_NUMBER: ${{ vars.VITE_WHATSAPP_NUMBER }}
        run: npm run build --workspace @bora/landing

      - name: Publicar no Cloudflare
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
        run: npx wrangler deploy --config apps/landing/wrangler.jsonc --env staging

      - name: Fumaça
        env:
          PAGE_URL: ${{ vars.PAGE_URL }}
          SITE_URL: ${{ vars.SITE_URL }}
        run: scripts/fumaca-pagina.sh "$PAGE_URL" "$SITE_URL"
```

Em `deploy-producao.yml`, o mesmo job muda em cinco pontos:

- `needs: [resolver, verificar]`;
- `checkout` com `ref: ${{ needs.resolver.outputs.sha }}`;
- `VITE_PAGE_INDEXABLE: "true"` no passo de compilar, o único lugar do
  repositório que liga a indexação;
- `--env producao` no deploy;
- `--indexavel` na fumaça.

Com `[A PREENCHER]` no HTML, este job falha no build. Como ele não está na
cadeia do app, o app publica do mesmo jeito (R-VND-22).

### 10.3 Variáveis do GitHub, à mão, **antes do merge**

No Environment `staging`:

| Nome | Tipo | Valor |
|---|---|---|
| `PAGE_URL` | var | `https://bora-landing-staging.bora-estudar-saas.workers.dev` |
| `VITE_WHATSAPP_NUMBER` | var | o número do negócio, só dígitos, com 55 e DDD |

```bash
gh variable set PAGE_URL --env staging --body 'https://bora-landing-staging.bora-estudar-saas.workers.dev'
gh variable set VITE_WHATSAPP_NUMBER --env staging --body '55…'
```

Sem as duas, o job `pagina` falha no build e diz o nome da variável, e o app
publica normalmente.

O endereço é previsível antes do primeiro deploy, porque o subdomínio
`bora-estudar-saas.workers.dev` é da conta e o nome do Worker é
`bora-landing-staging`. É o primeiro `wrangler deploy` que cria o Worker.
**Confira nesse primeiro deploy** se o `CLOUDFLARE_API_TOKEN` cria Worker novo:
ele foi pedido como "Edit Cloudflare Workers" escopado à conta, e um token
escopado a um Worker só recusaria.

O Environment `producao` ainda não existe. Quando for criado (com a deployment
branch rule, conforme o cabeçalho de `deploy-producao.yml`), recebe estas duas
variáveis junto com as do app.

### 10.4 A documentação que muda junto

- `CLAUDE.md`:
  - "Comandos" ganha `npm run dev --workspace @bora/landing` e
    `npm run landing:screens --workspace @bora/e2e`;
  - a tabela de "Deploy" ganha a página;
  - uma seção curta "A página de vendas" registra o que este plano mediu e que
    custa caro esquecer:
    - o React roda só no build, e nenhum componente usa hook;
    - o código do build fica em `config/`, e não em `build/`;
    - `assetsInlineLimit: 0`;
    - caminho de imagem errado passa no build, e só `assertPublishable` o pega;
    - alias não resolve no HTML.
- `docs/deploy-staging.md`: a tabela de variáveis e a lista de workflows.
- `docs/arquitetura.md`: o workspace novo, e por que ele não é uma rota do app.
- `docs/fluxos-e2e.md`: os ids mudam de seção (9.2).
- Spec 44: "Situação: implementada", e o mesmo no índice `docs/specs/README.md`.

---

## 11. Como medir o sucesso

O critério da spec é ter **mais inscrições novas na lista de espera** depois de
a página ir ao ar, contadas por `waitlist.created_at`.

```sql
-- @ambiente: qualquer
-- Inscrições novas na lista de espera e contas novas de aluno, por semana
-- (segunda a domingo, no fuso de Brasília). Só leitura.
with semanas as (
  select generate_series(
           date_trunc('week', (now() at time zone 'America/Sao_Paulo') - interval '15 weeks'),
           date_trunc('week', now() at time zone 'America/Sao_Paulo'),
           interval '1 week'
         )::date as semana
),
inscricoes as (
  select date_trunc('week', created_at at time zone 'America/Sao_Paulo')::date as semana,
         count(*) as inscricoes
    from public.waitlist
   group by 1
),
contas as (
  select date_trunc('week', created_at at time zone 'America/Sao_Paulo')::date as semana,
         count(*) as contas
    from public.profiles
   where role = 'student'
   group by 1
)
select s.semana,
       coalesce(c.contas, 0)     as contas_de_aluno,
       coalesce(i.inscricoes, 0) as inscricoes_na_lista
  from semanas s
  left join contas c using (semana)
  left join inscricoes i using (semana)
 order by s.semana;
```

**A métrica é `inscricoes_na_lista`.** A coluna `contas_de_aluno` está ali para
ler o funil: se as contas sobem e as inscrições não, a página está trazendo
cadastro, mas a tela da lista de espera está perdendo gente. É outro problema, e
de outra spec.

**Por que a contagem é estável:**

- a linha da lista de espera não sai com o vínculo: `link_student` só grava
  `teacher_id`;
- o salvamento é um upsert por `student_id` (R-CTA-08), então salvar de novo não
  cria linha nem muda o `created_at`;
- a linha só some quando a conta é apagada, pelo cascade.

**Como rodar:** no editor de SQL do painel do Supabase do ambiente, ou salvando
como `scripts/inscricoes-por-semana.sql` e rodando
`node scripts/rodar-sql.mjs inscricoes-por-semana.sql`. O `rodar-sql.mjs`
imprime o resultado do último comando com `console.table`. A primeira linha,
`@ambiente: qualquer`, é o que o deixa rodar em produção, e cabe porque a
consulta só lê. Contra produção, passe `SUPABASE_DB_URL`.

**O limite da medida, dito agora para ninguém descobrir depois:**

- **Não há "antes" para comparar ainda.** Em 09/10/2026 só existe staging, com
  dado de teste. Para comparar antes e depois, o app precisa ficar algumas
  semanas em produção, com o `/cadastro` público e sem a página, antes de a
  página ir ao ar. Se os dois forem ao ar juntos, a comparação vira número
  absoluto. A decisão é de quem marcar a data de produção (seção 13).
- **Antes e depois não isolam a página.** Um edital publicado na mesma semana
  move o número sozinho. Separar o cadastro que veio da página exigiria
  atribuição, que a spec deixou de fora. É a medida que a spec escolheu, não uma
  prova.

---

## 12. Ordem dos commits

Branch `feature/pagina-de-vendas`, com um PR. Cada commit passa no
`npm run check` sozinho.

| # | Commit | O que entra | Como conferir |
|---|---|---|---|
| 0 | Especifica a página de vendas (spec 44) | a spec, o índice, a reserva dos ids e este plano; só documentação | — |
| 1 | Cria o workspace da página de vendas | `package.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `config/` inteiro com os testes, as três entradas vazias, `src/render.tsx`, um `Document` e uma `Home` mínima (só o `h1` e um `[A PREENCHER]`), `src/links.ts` com o teste, `wrangler.jsonc`, `_headers`, `.env.development`, o `styles.css` só com as fontes, `.wrangler/` no `.gitignore` e o lockfile | `npm run check`; `npm run build --workspace @bora/landing` com as três variáveis, de novo sem uma delas (tem de recusar) e de novo com um `src` errado de propósito (tem de recusar); `npx wrangler deploy --config apps/landing/wrangler.jsonc --env staging --dry-run` |
| 2 | Escreve o texto e o estilo da página | os componentes, `content.ts`, `Home` e `NotFound` completas e o `styles.css`, com os `ProductShot` ainda sem imagem | `npm run dev --workspace @bora/landing`, olhando a 375, 820 e 1280px |
| 3 | Gera as capturas e a imagem de compartilhamento | `tools/landing-screens.ts`, `OgCard.tsx` com a entrada `og-card.html`, os `.webp`, o `og.png` e os caminhos e `alt` em `content.ts` | `npm run landing:screens --workspace @bora/e2e`; conferir cada `alt` contra a imagem |
| 4 | Cobre a página de vendas no e2e: F-VND-01 a F-VND-10 | `landing.spec.ts`, `playwright.config.ts`, `support/`, a mudança do `assertAA` e os ids em `fluxos-e2e.md` | `npm run e2e -- tests/landing.spec.ts tests/theme.spec.ts`, porque o `assertAA` mudou de lugar |
| 5 | Publica a página de vendas em staging e produção | `ci.yml`, os dois deploys, `fumaca-pagina.sh` e `deploy-staging.md` | o `ci.yml` do PR verde. **Antes do merge**, as variáveis da seção 10.3 |
| 6 | Documenta a página de vendas | `CLAUDE.md`, `arquitetura.md`, a situação da spec e o índice | — |

**Depois do merge:**

1. acompanhe o deploy de staging;
2. rode `scripts/fumaca-pagina.sh` à mão;
3. cole a URL de staging numa conversa do WhatsApp e confira a prévia.

O `noindex` de staging não atrapalha a prévia, porque o robô que a monta lê os
`og:*` e ignora o `robots`. Só que **a prévia fica guardada por URL**: se ela
sair errada, corrigir o `og.png` não basta para a mesma URL. Teste com um
parâmetro novo (`?v=2`).

---

## 13. O que depende de quem

| Pendência | Quem decide | O que bloqueia |
|---|---|---|
| O número do WhatsApp do negócio | o dono do negócio | o job `pagina` de staging, que falha sem `VITE_WHATSAPP_NUMBER` |
| Endereço, dias e horários da escola | o dono do negócio | produção, por causa do `[A PREENCHER]` |
| Razão social e CNPJ no rodapé | o dono do negócio | produção. Se o rodapé não for levar isso, apague a linha: o bloqueio é do marcador, não da informação |
| Domínio e marca | ver [`plano-email-staging.md`](plano-email-staging.md) | nada: até lá a página fica em `*.workers.dev`, e trocar de endereço é trocar variável (R-VND-12) |
| Environment `producao` | quem for abrir produção | a página em produção, junto com o app |
| Quantas semanas o app fica em produção antes da página | o dono do negócio | a comparação da seção 11 |

---

## 14. Armadilhas

- **Um `<script>` manda o React inteiro ao ar.** Basta um
  `<script type="module" src="/src/…">` numa entrada ou num componente, e a
  página deixa de cumprir R-VND-14 sem nada visível mudar. `assertPublishable`
  recusa no build, e a CSP bloqueia no ar.
- **Hook em componente compila e não faz nada.** `useState` renderiza o valor
  inicial uma vez e para ali; `useEffect` não roda. O ESLint recusa o import.
  Comportamento no navegador, aqui, é HTML (`<details>`) e CSS (`:target`,
  `:focus-visible`), nunca JavaScript.
- **Caminho de imagem errado passa no build** (medido). O HTML sai com o
  caminho de fonte literal, e a imagem quebra só no ar. Quem pega é
  `assertPublishable`.
- **`build/` está no `.gitignore`.** Um diretório com esse nome em qualquer
  lugar do repositório nunca é commitado, e o CI reprova por arquivo faltando,
  sem dizer por quê. O código do build fica em `config/`.
- **O `assetsInlineLimit` padrão quebra a página sem quebrar o build.** O
  símbolo vira `data:`, a CSP o bloqueia, e o cabeçalho fica sem logo apenas no
  ar, porque o `vite dev` não aplica o `_headers`. F-VND-04 não pega isso,
  porque `data:` não é requisição de rede. Quem pega é `assertPublishable`.
- **Alias não resolve em atributo de HTML.** Sai literal, e o resultado é uma
  imagem quebrada, não um erro de build.
- **O `vite dev` não tem HMR para os componentes.** Eles são dependência da
  configuração, e editar um reinicia o servidor (medido). Recarregue a página.
- **O runner nativo do Node não compila JSX.** Teste que importe um `.tsx`, ou
  um `.ts` que importe um `.tsx`, falha antes de rodar. Lógica testável fica em
  `.ts` sem dependência de componente.
- **O Node do sistema pode ser o 22**, que não roda TypeScript: `npm run check`
  falha com `ERR_UNKNOWN_FILE_EXTENSION`. Rode `nvm use` antes.
- **O `wrangler dev` grava `.wrangler/` dentro de `apps/landing`.** Sem a linha
  no `.gitignore`, o estado local do Miniflare acaba commitado.
- **O orçamento conta as imagens preguiçosas perto da dobra** (seção 7.4).
  Trocar a ordem das seções, ou subir "Recursos" para logo depois da abertura,
  pode estourar os 350 KB sem nenhuma imagem ter crescido.
- **No `wrangler dev` e no ar, o 404 é um 404 de verdade.** Teste de página
  inexistente confere o status, ao contrário do app ("Não existe status 404",
  no CLAUDE.md). As duas regras convivem porque são dois Workers.
