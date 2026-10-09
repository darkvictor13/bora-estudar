# 44 — Página de vendas

**Situação:** não implementada · **Fluxos e2e:** F-VND-01 a F-VND-10

A página pública da Fronteira Concursos, **fora do app**. É a raiz do domínio no
desenho de [`../plano-email-staging.md`](../plano-email-staging.md) — "a raiz é
a página de vendas, `app.` é produção". O plano de implementação — onde a página
mora e por quê, o texto proposto, os arquivos e a ordem dos commits — está em
[`../plano-pagina-de-vendas.md`](../plano-pagina-de-vendas.md).

Não toca o banco: nenhuma RPC, migration, policy ou grant. A conversão acontece
no app, pelo cadastro ([01](01-autenticacao.md)) e pela lista de espera
([10](10-conta-e-lista-de-espera.md)), que já existem.

---

## Problema

Quem ouve falar da Fronteira Concursos — por indicação, num grupo de WhatsApp,
numa busca — não tem onde descobrir o que ela é antes de entregar nome, e-mail e
senha. O único endereço público do produto é a entrada da conta, que pressupõe
que a pessoa já decidiu. Toda a explicação — o que é a escola, o que é a
plataforma, quem libera o acesso, quanto custa — acontece em conversa individual
com o professor, repetida a cada interessado. Quem não pergunta não volta.

Quem cria a conta sem essa conversa descobre **depois** que a conta não abre as
aulas: o acesso é liberado pelo professor ([13](13-vinculo-e-liberacao-de-acesso.md)),
num intervalo que a spec 10 descreve como "pode durar semanas". A expectativa
quebrada vira desistência dentro da lista de espera, onde ninguém a vê.

E falta um endereço para compartilhar. Um link do produto colado no WhatsApp
não gera prévia que diga o que ele é: o servidor entrega a mesma casca de
aplicação para todo caminho, e quem monta a prévia não executa JavaScript.

O critério de sucesso, decidido na entrevista: **mais inscrições novas na lista
de espera** depois da publicação, contadas pelo `created_at` de `waitlist` — um
dado que o banco já tem, sem instrumentar a página.

---

## Regras

Nenhuma regra desta spec escreve no banco. As três defesas da escrita direta e
as formas de idempotência não se aplicam: não há escrita.

### O que a página diz

| Id | Regra |
|---|---|
| R-VND-01 | A página fala com o concurseiro, de concursos em geral, e apresenta **duas ofertas**: **Escola + plataforma** (aulas presenciais com a turma, mais a plataforma completa) e **Plataforma** (online, com a semana montada por um professor). As duas têm o mesmo peso visual. *(Decidido na entrevista: nenhum concurso em destaque.)* |
| R-VND-02 | Nenhuma oferta mostra preço. A página diz que valores e turmas são combinados pelo WhatsApp. *(Decidido na entrevista.)* |
| R-VND-03 | A página diz que **criar a conta não libera as aulas** — o professor libera depois do contato —, e diz isso em dois lugares: no passo a passo e numa pergunta frequente. É o comportamento das specs 10 e 13, contado antes do cadastro em vez de descoberto depois. |
| R-VND-04 | Nenhum número de aprovação, depoimento, nota ou avaliação. Prova social entra só com conteúdo real, com autorização por escrito, e por alteração desta spec. *(Hoje não há nenhuma: decidido na entrevista.)* |
| R-VND-05 | A página destaca quatro grupos de recurso, todos no ar para o aluno: **plano semanal do professor** (semana, cronograma, estudo extra, cronômetro); **aulas e revisão espaçada** (aula com PDF, questões iniciais, Resumos Flash, revisões); **Lei Seca e flashcards** (leitura por artigo, flashcards, grifos salvos na conta); **simulados e estatísticas** (desempenho por disciplina e, na escola, simulado presencial com ranking da turma). Recurso que sair do ar sai da página no mesmo commit. |
| R-VND-06 | As imagens do produto são capturas das telas reais no modo `VITE_API_IMPL=fixtures`, com dado sintético, e trazem a legenda "Telas reais da plataforma, com dados de demonstração.". Nenhum dado de aluno real, e nenhum conteúdo editorial além da amostra sintética da spec [41](41-conteudo-fora-do-bundle.md). |
| R-VND-07 | A marca é Fronteira Concursos. O símbolo é **o mesmo arquivo** do app (`apps/web/public/fronteira-mark.svg`, importado pelo build da página, não copiado). As cores vêm de `@bora/ui/tokens`, esquema `light`. Texto e limite de controle usam só pares já medidos por `packages/ui/src/contrast.test.ts`; os halos do fundo usam os `*Soft` do mesmo esquema, como a entrada do app (`PublicLayout`). As fontes são DM Sans e DM Mono, auto-hospedadas por `@fontsource`. |
| R-VND-08 | Tema claro, sempre. *(Suposição do autor: sem sessão o app é claro — R-TEMA-14 —, e quem sai da página cai em `/cadastro`. Uma página escura levando a um cadastro claro seria a troca de tema na frente da pessoa, que é o que o tema do app existe para evitar.)* |
| R-VND-09 | Texto que ainda depende de informação do negócio é marcado `[A PREENCHER]` no HTML. O build com indexação ligada (R-VND-18) recusa o marcador; staging publica com ele. |

### Para onde ela leva

| Id | Regra |
|---|---|
| R-VND-10 | O chamado principal é sempre "Criar minha conta" e leva a `<app>/cadastro`. "Entrar" leva a `<app>/entrar`. A página não grava nada: a conta nasce no cadastro, sempre aluno e sem professor (R-AUTH-07, F-AUTH-08), e o contato na lista de espera (R-CTA-07). |
| R-VND-11 | O chamado secundário é o WhatsApp: `https://wa.me/<número>?text=<mensagem>`, com a mensagem pronta citando a oferta de onde a pessoa saiu, ou a Fronteira quando não há oferta. Abre em nova aba, com `rel="noopener noreferrer"`. |
| R-VND-12 | O endereço do app, o da própria página e o número do WhatsApp entram por variável de build: `VITE_APP_URL`, `VITE_PAGE_URL` e `VITE_WHATSAPP_NUMBER`. O build **recusa** variável ausente ou malformada e diz qual: URL `https://` sem barra no fim (`http://` só para `localhost` e `127.0.0.1`); número só com dígitos, começando por `55`, de 12 ou 13 dígitos. *(Sem a recusa, o build passaria e o deploy publicaria `href="undefined/cadastro"`.)* Trocar de domínio não muda código. |

### Fora do app, e sem terceiros

| Id | Regra |
|---|---|
| R-VND-13 | A página é arquivo estático publicado num Worker próprio, separado do app. Não lê sessão, não fala com o Supabase e não depende de nenhuma variável do app: abre com o banco fora do ar e com o app quebrado. |
| R-VND-14 | A página **não executa JavaScript**. Ela é escrita em React, mas o React roda só no build: o HTML servido não carrega `<script>` nenhum, e o build recusa o HTML que carregar. Todo o conteúdo está no HTML servido — as perguntas frequentes abrem por `<details>` —, e a `Content-Security-Policy` de `apps/landing/public/_headers` não concede `script-src` (`default-src 'none'`). |
| R-VND-15 | Nenhuma requisição sai da origem da página. Fontes, imagens e estilos são servidos por ela, e a CSP só concede `'self'` — mais `'unsafe-inline'` em `style-src`, pelo bloco de variáveis de cor que o build injeta. Sem analytics, pixel ou cookie, e por isso sem banner de consentimento. |
| R-VND-16 | Caminho inexistente responde **404 de verdade**, com uma página que leva à raiz e ao cadastro (`not_found_handling: "404-page"`). É o oposto do app, que devolve o `index.html` para qualquer caminho. |

### Compartilhar e buscar

| Id | Regra |
|---|---|
| R-VND-17 | Os metadados de compartilhamento estão no HTML servido: `lang="pt-BR"`, `title`, `description`, `canonical`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image` (URL absoluta, 1200×630, endereço estável e sem hash), `og:locale` `pt_BR` e `twitter:card` `summary_large_image`. As URLs absolutas saem de `VITE_PAGE_URL`. |
| R-VND-18 | **Só produção é indexável**, e quem decide é `VITE_PAGE_INDEXABLE`, que só o job de produção liga. Fora dela, a página leva `<meta name="robots" content="noindex, nofollow">` e o build emite `robots.txt` com `Disallow: /`. Em produção, o `robots.txt` libera e aponta o `sitemap.xml`, que lista a raiz. |

### Acessível e leve

| Id | Regra |
|---|---|
| R-VND-19 | A 375px nada rola na horizontal, e todo controle de ação — os dois chamados, "Entrar", cada pergunta — tem pelo menos 44×44 px. |
| R-VND-20 | Um `h1` só e títulos sem salto de nível; `header`, `nav`, `main` e `footer`; "Pular para o conteúdo" como primeiro foco; foco visível com `accent.focusRing`; `alt` em toda imagem de produto, dizendo o que a tela mostra; rolagem suave só com `prefers-reduced-motion: no-preference`. |
| R-VND-21 | A primeira carga, numa janela de 1280×720, transfere no máximo **350 KB**. As imagens abaixo da dobra levam `loading="lazy"`; a principal, `width`, `height` e `fetchpriority="high"`. |

### Publicação

| Id | Regra |
|---|---|
| R-VND-22 | A página tem job próprio nos dois deploys, que depende só do gate de qualidade (`ci.yml`) e não do banco. Uma falha na página não segura o app, e vice-versa. O gate compila a página e valida o Worker dela em `--dry-run`, como já faz com o app. |

---

## Fluxo

```
indicação · grupo de WhatsApp · busca
        │
        ▼
página — raiz do domínio; HTML estático, sem JS, sem sessão
        │
        ├─ "Criar minha conta" ──────► <app>/cadastro                  [01 · F-AUTH-08]
        │                                     │
        │                                     ▼
        │                            /aluno/lista-espera               [10 · R-CTA-07]
        │                            WhatsApp · área · concurso
        │                                     │
        │                                     ▼
        │                 professor: find_student_by_email
        │                 → link_student → set_student_access           [13]
        │
        └─ "Falar no WhatsApp" ──────► wa.me/<número>?text=<oferta>
                                       a conversa termina no cadastro ↑
```

A medida de sucesso é a contagem semanal de `waitlist.created_at` antes e
depois da publicação. A consulta está no plano, seção 11.

---

## Superfície

| Camada | Item |
|---|---|
| Workspace | `apps/landing` (`@bora/landing`) — componentes React sem MUI, renderizados para HTML no build por `renderToStaticMarkup`, e CSS escrito à mão, compilados pelo Vite |
| Páginas | `apps/landing/src/pages/Home.tsx` e `NotFound.tsx`, com os componentes em `src/components/` e o texto em lista em `src/content.ts`; `index.html` e `404.html` são só as entradas do Vite |
| Estilo | `apps/landing/src/styles.css`, mais o `<style>` de variáveis que o build gera a partir de `@bora/ui/tokens` |
| Build | `apps/landing/vite.config.ts`; `apps/landing/config/landing-plugin.ts` (renderiza as páginas e confere o HTML compilado), `config/page-env.ts` (R-VND-09, 12 e 18) e `config/brand-tokens.ts` (R-VND-07); `src/links.ts` (R-VND-10 e 11); com os testes ao lado |
| Estáticos | `apps/landing/public/` — `_headers`, `og.png`; `robots.txt` e `sitemap.xml` emitidos pelo build |
| Imagens | `apps/landing/src/assets/screens/*.webp`, geradas por `apps/e2e/tools/landing-screens.ts` |
| Publicação | `apps/landing/wrangler.jsonc` (Workers `bora-landing-staging` e `bora-landing`); job `pagina` em `deploy-staging.yml` e `deploy-producao.yml`; dois passos em `ci.yml` |
| Fumaça | `scripts/fumaca-pagina.sh` |
| E2E | `apps/e2e/tests/landing.spec.ts`; segundo `webServer` em `playwright.config.ts`; `LANDING_URL` em `support/app.ts` |
| App | nenhum arquivo de `apps/web` muda |
| Banco | nenhum |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Com JavaScript desligado, a página mostra o `h1`, as duas ofertas pelo nome, o aviso de que o professor libera o acesso (no passo a passo e numa pergunta), as perguntas abrem, e o texto visível não contém "R$" | F-VND-01 |
| CA-02 | Todo "Criar minha conta" aponta para `<app>/cadastro`, e todo "Entrar" para `<app>/entrar`. Seguir o do topo e se cadastrar termina em `/aluno/lista-espera`, sem professor e sem acesso | F-VND-02 |
| CA-03 | Todo link de WhatsApp é `https://wa.me/<VITE_WHATSAPP_NUMBER>?text=…`; o de cada oferta cita a oferta na mensagem; todos levam `target="_blank"` e `rel="noopener noreferrer"` | F-VND-03 |
| CA-04 | Carregar a página e rolar até o fim não faz nenhuma requisição fora da origem dela, e a resposta traz a CSP sem `script-src` | F-VND-04; no ar, `scripts/fumaca-pagina.sh` |
| CA-05 | A 375px, `scrollWidth` é igual a `clientWidth`, e todo controle de ação mede pelo menos 44×44 | F-VND-05 |
| CA-06 | O HTML servido, lido sem navegador, traz os metadados de R-VND-17, com URLs absolutas que começam por `VITE_PAGE_URL` | F-VND-06; no ar, `scripts/fumaca-pagina.sh` |
| CA-07 | Caminho inexistente responde status 404, com links para a raiz e para o cadastro | F-VND-07; no ar, `scripts/fumaca-pagina.sh` |
| CA-08 | Contraste AA em toda a página, medido como em F-TEMA-07 | F-VND-08 |
| CA-09 | A primeira carga, a 1280×720, transfere no máximo 350 KB | F-VND-09 |
| CA-10 | O primeiro Tab foca "Pular para o conteúdo", e ele leva ao `main`; há um `h1` só; toda imagem de produto tem `alt` não vazio | F-VND-10 |
| CA-11 | O build recusa cada uma das três variáveis quando falta ou está malformada, e a mensagem diz qual é | `apps/landing/config/page-env.test.ts` |
| CA-12 | Com `VITE_PAGE_INDEXABLE` desligada, o build emite `noindex` e `Disallow: /`; ligada, emite `sitemap.xml` e recusa `[A PREENCHER]` no HTML | `apps/landing/config/page-env.test.ts` |
| CA-13 | Todo papel do esquema `light` vira variável CSS, e toda `@media` de largura em `styles.css` usa um valor de `breakpoints` (a única outra permitida é a de movimento reduzido) | `apps/landing/config/brand-tokens.test.ts` |
| CA-14 | O gate de qualidade compila a página e valida o Worker dela em `--dry-run` | `.github/workflows/ci.yml` — o passo reprova a PR |
| CA-15 | O build recusa o HTML compilado que tenha `<script>`, `src` ou `href` com `data:`, ou caminho de imagem que o Vite não resolveu | `apps/landing/config/page-env.test.ts`; o build de CA-14 roda a mesma conferência |

---

## Fora de escopo

- **Formulário de interesse sem conta.** Exigiria tabela nova com escrita
  anônima, com spam, limite de taxa e consentimento — é site e banco ao mesmo
  tempo, portanto outra spec. Hoje o cadastro e a lista de espera já captam
  nome, e-mail, WhatsApp e concurso.
- **Pagamento online e preço na página.** Não há integração de pagamento
  (spec 02), e o acesso é liberado pelo professor. Preço publicado precisaria de
  deploy a cada mudança.
- **Prova social.** Não existe conteúdo real hoje. Entra por alteração desta
  spec (R-VND-04).
- **Política de privacidade e termos de uso.** Não existe texto, e não é a
  página que vai escrevê-lo. A página não coleta dado nenhum; quem coleta é o
  cadastro do app. Fica para uma spec própria, quando houver texto revisado, e o
  rodapé ganha o link nesse dia.
- **Analytics, pixel, UTM e atribuição.** O sucesso é medido pela lista de
  espera. Separar o cadastro que veio da página do que veio de outro lugar
  exigiria gravar a origem no perfil (banco) e um script de terceiro (R-VND-15).
- **Mudar o app.** `/` do app continua levando a `/entrar` (ou à casa do papel),
  e o app não ganha link para a página. Rever quando o domínio existir.
- **Domínio.** A decisão é separada, e depende da marca — ver
  [`../plano-email-staging.md`](../plano-email-staging.md). Até lá a página sai
  em `*.workers.dev`, e trocar de endereço é trocar variável (R-VND-12).
- **Tema escuro** (R-VND-08), **uma página por concurso ou por oferta**, **blog**
  e **dados estruturados** (JSON-LD). Sem preço nem avaliação, o JSON-LD rende
  pouco, e é um `<script>` numa página que não tem nenhum.
- **Botão flutuante de WhatsApp.** O cabeçalho fixo já leva o chamado principal,
  e um botão flutuante cobre conteúdo a 375px.
