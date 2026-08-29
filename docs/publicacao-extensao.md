# Publicação da extensão na AMO

O que precisa estar pronto **antes** de submeter `apps/extension` à revisão da
Mozilla (addons.mozilla.org).

Onde este arquivo se encaixa nos outros:

- [`comparativo-fluxos-v2.md`](comparativo-fluxos-v2.md) §9 lista o que a
  extensão **faz** comparada à da v2. É a lista de produto, e ela **não é** a
  lista desta página: a AMO não recusa add-on por feature faltando.
- [`specs/06-protocolo-site-extensao.md`](specs/06-protocolo-site-extensao.md)
  é o contrato entre as duas pontas. PUB-04 muda esse contrato.
- **Este arquivo** é a lista de submissão: o que a revisão vai cobrar, o que ela
  vai levantar, e o que a listagem precisa ter.

---

## Estado hoje

`web-ext lint --source-dir dist` (addons-linter 7.20.0), em 29/08/2026:

```
errors 0 · warnings 0 · notices 1
```

O bundle está limpo do que mais reprova extensão: **nenhum `eval`, `new
Function`, `innerHTML`, `document.write` ou carregamento de código remoto** nos
dois alvos (`dist/content.js`, `dist/popup.js`). O painel é montado por API de
DOM de propósito, e o comentário no topo de `src/content/panel.ts` registra o
porquê — o conteúdo ao redor vem de uma página de terceiro.

**Passar no linter não é passar na revisão.** O linter não sabe que o fonte é
minificado, não sabe que não há política de privacidade, e não tenta usar o
add-on. Os oito itens abaixo são o que falta.

| | Item | Bloqueia? |
|---|---|---|
| PUB-01 | Envio do código-fonte com instruções de build | sim |
| PUB-02 | Política de privacidade | sim |
| PUB-03 | Notas ao revisor com conta de teste | sim |
| PUB-04 | `returnUrl` validado contra allowlist de origem | revisão levanta |
| PUB-05 | Remover a permissão `tabs` | revisão levanta |
| PUB-06 | `data_collection_permissions` no manifest | notice hoje |
| PUB-07 | Ícones de verdade | listagem |
| PUB-08 | Empacotamento e esquema de versão | processo |

---

## Bloqueiam a submissão

### PUB-01 · Envio do código-fonte com instruções de build

`build.mjs` roda com `minify: true` e embute `@bora/protocol` no bundle. A
política da AMO exige o código-fonte mais instruções de build para todo código
minificado, transpilado ou empacotado. Sem isso a revisão devolve sem analisar.

**A armadilha específica deste repositório:** a extensão é um workspace npm e
declara `"@bora/protocol": "*"`. Um revisor que baixar só `apps/extension/` e
rodar `npm install` recebe um erro de resolução — o pacote não existe no
registry. As instruções precisam partir da **raiz** do repositório.

Instruções a enviar, verificadas contra o que o CI usa (`.nvmrc` = 24; os
workflows usam `node-version-file: .nvmrc`):

```
Node 24 · npm 11
npm ci
npm run ext:build
Saída: apps/extension/dist/ — idêntica ao conteúdo do .zip submetido.
```

O arquivo enviado precisa ser o repositório inteiro (ou um recorte que contenha
`package.json`, `package-lock.json`, `packages/protocol/` e
`apps/extension/`), não a pasta da extensão sozinha.

**Verificar antes de enviar** que um `npm ci && npm run ext:build` em clone
limpo produz `dist/` byte a byte igual ao zip submetido. Build não reprodutível
é motivo de recusa.

### PUB-02 · Política de privacidade

Não existe nenhuma no repositório — nem `LICENSE`, nem documento de
privacidade. A AMO exige política de privacidade para add-on listado que
manipula dado de usuário, e este manipula: guarda as respostas do aluno em
`storage.local` (`src/shared/session.ts`, chave `bora.quiz.session.v1`) e as
devolve ao site pelo fragmento da URL.

O texto precisa dizer, no mínimo:

- que o dado guardado é a sessão de questões — fila, respostas, `requestId` — e
  que ele fica **no navegador**, em `storage.local`;
- que a extensão **não fala com o Supabase nem com nenhum servidor**: ela
  recebe um payload e devolve outro (é a regra do `CLAUDE.md`, e aqui ela vira
  argumento de privacidade);
- que o único destino do dado é o site do Bora Estudar, e qual é a origem;
- que nada é enviado a terceiros e não há telemetria.

Precisa estar hospedada numa URL pública antes da submissão — o campo da AMO
aceita texto, mas a listagem fica melhor com link estável.

### PUB-03 · Notas ao revisor com conta de teste

**Instalada num Firefox limpo, a extensão não mostra absolutamente nada.**
`boot()` (`src/content/index.ts:168`) sai cedo quando não há sessão salva nem
fragmento na URL, e o popup diz "Nenhuma bateria em andamento". O revisor não
tem por onde começar, e revisão que não consegue exercitar o add-on volta
pedindo.

As notas precisam conter:

- conta de aluno de teste no ambiente publicado, com senha;
- que essa conta precisa ter **vínculo com professor, assinatura vigente,
  planejamento ativo e uma meta `question_block` pendente** — sem isso o botão
  de iniciar bateria não aparece;
- o caminho: entrar → `/aluno` → iniciar bateria numa meta de questões → o site
  redireciona ao TEC com o fragmento → o painel aparece no canto inferior
  direito;
- que a extensão **só age em `tecconcursos.com.br`** e só depois de receber um
  fragmento `#boraQuizStart=` vindo do site;
- que o TEC exige conta própria para exibir questões — se o revisor não tiver
  uma, descrever isso e oferecer alternativa (vídeo do fluxo).

> A conta de teste vai para a AMO, não para o repositório. Não commite
> credencial aqui — vale o mesmo item 5 de "Antes de commitar" do `CLAUDE.md`.

---

## A revisão vai levantar

### PUB-04 · `returnUrl` validado contra allowlist de origem

`readQuizStart` (`packages/protocol/src/codec.ts:139`) aceita `returnUrl` como
qualquer string não vazia, e `sendResult` (`apps/extension/src/content/index.ts:102`)
faz `location.assign(buildResultUrl(body, session.start.returnUrl))`.

O payload chega pelo fragmento da URL numa página de terceiro. Qualquer site
pode mandar o aluno para
`https://www.tecconcursos.com.br/questoes#boraQuizStart=<payload com returnUrl próprio>`;
a extensão persiste esse `returnUrl` e, ao finalizar, navega para ele **levando
as respostas do aluno no fragmento**. É redirect aberto com exfiltração de
dado, e é o tipo de coisa que a revisão da AMO marca.

**Correção** — allowlist de origem dentro de `readQuizStart`, no protocolo e não
na extensão, para as duas pontas herdarem a trava:

- `new URL(returnUrl)` dentro de try/catch, rejeitando o que não parseia;
- `url.protocol` restrito a `https:` (mais `http:` só para `localhost`, que os
  testes usam — ver `apps/e2e` e `packages/protocol/src/codec.test.ts`, que
  hoje usam `http://localhost:3000/student`);
- `url.origin` conferido contra a lista de origens conhecidas do site;
- erro novo com código próprio, na linha dos que já existem em
  `ProtocolErrorCode`.

Fecha de quebra `javascript:` e `data:`.

**Cuidado ao mexer:** a lista de origens não pode ser lida de
`import.meta.env` indexado por variável — Vite só injeta com acesso literal
`import.meta.env.VITE_X`, e indexar compila para `undefined` em produção sem
aviso (`CLAUDE.md`). E como o protocolo é a única definição para as duas
pontas, a mudança é incompatível: ver se ela exige incrementar
`PROTOCOL_VERSION`.

### PUB-05 · Remover a permissão `tabs`

`static/manifest.json` pede `"permissions": ["storage", "tabs"]`. O popup
(`src/popup/index.ts`) usa `tabs.query({active: true, currentWindow: true})`
só para pegar o `id`, e `tabs.update(id, {url})` para navegar. **Nunca lê
`tab.url`, `tab.title` nem `tab.favIconUrl`.**

Verificado no schema WebExtension do Firefox embutido no `addons-linter`:
nem `tabs.update` nem `tabs.query` declaram `permissions`. Em Firefox a
permissão `tabs` gateia o acesso às propriedades privilegiadas de `Tab` e o
filtro de `query` por url — nada disso é usado aqui.

**Ação** remover `"tabs"` do manifest, recompilar, e fazer o teste de fumaça:
abrir o popup com bateria em andamento e clicar em "Continuar bateria". Se
navegar, a permissão sai de vez. Toda permissão pedida é questionada na
revisão, e uma a menos é uma pergunta a menos.

### PUB-06 · `data_collection_permissions` no manifest

É a única notice do linter:

```
MISSING_DATA_COLLECTION_PERMISSIONS
"/browser_specific_settings/gecko/data_collection_permissions" will be required
in the future.
```

Ainda é aviso, mas a Mozilla está fechando o consentimento de dados e isso vira
obrigatório. Custa duas linhas em `static/manifest.json`, dentro do bloco
`gecko` que já existe. Como a extensão não envia nada a servidor nenhum, o
valor honesto é `none`:

```json
"data_collection_permissions": { "required": ["none"] }
```

Rodar `npm run ext:build && npm run lint --workspace @bora/extension` depois e
confirmar que a notice sumiu.

---

## Listagem e processo

### PUB-07 · Ícones de verdade

`static/icons/icon-128.png` tem **312 bytes**: um "B" pixelado, placeholder do
commit que montou o monorepo. Os três tamanhos existem (16, 48, 128) e são PNG
válidos, então não reprova — mas é o que aparece na loja e na barra do Firefox.

Refazer os três a partir da identidade do site, e conferir que continuam
casando com as chaves de `icons` e `action.default_icon`.

### PUB-08 · Empacotamento e esquema de versão

Não existe passo de empacotamento. `apps/extension/package.json` tem `build`,
`watch`, `typecheck`, `test`, `lint` e `firefox`; **nenhum `web-ext build` nem
`web-ext sign`**, e nenhum workflow em `.github/workflows` produz o zip — o
`ci.yml` compila a extensão só para poder rodar o lint (`ci.yml:50-54`).

Duas decisões antes do primeiro upload:

**Versão.** O manifest está em `0.1.0`. A AMO nunca aceita versão que não
cresça, e o número submetido é permanente. Decidir o esquema agora, e decidir
se ele acompanha ou não o `PROTOCOL_VERSION` — são coisas diferentes: o
protocolo muda quando o contrato muda, a versão da extensão muda a cada
publicação.

**Quem empacota.** Se o zip for gerado à mão, ele vai divergir do que o CI
compila. Vale o mesmo raciocínio do gate de qualidade em `CLAUDE.md`: um passo
copiado deriva em silêncio. Um script `ext:package` chamando `web-ext build`
sobre `dist/`, usado tanto localmente quanto pelo CI, resolve — e é o mesmo
artefato que PUB-01 exige ser reproduzível.

---

## Não bloqueia a revisão, mas é decisão de produto

A extensão conduz só a fase `main`. Ficam de fora, e o banco já os suporta:

| Falta | Onde o banco já espera |
|---|---|
| Fase de reforço e rodada extra | enum `question_phase`; validações em `finish_quiz_session` (`initial_schema.sql:1534-1543`) |
| Fluxo de revisão (`bora-smart-review-v1` da v2) | `record_reinforcement` existe e nada o chama |
| Tópico por questão | `catalog_questions.topic` existe; a extensão manda `topic: null` sempre, então `vw_block_errors.topic` é nulo em toda linha e o caderno de erros não funciona |
| Balanceamento da seleção por tópico | a v2 fazia round-robin entre tópicos; `pickQuestions` ordena a lista inteira e corta em 15 |

Nada disso impede a AMO de aprovar. **A decisão é se vale publicar uma extensão
que conduz metade do ciclo de estudo**, ou se o reforço entra antes da primeira
submissão — publicada, ela passa a ter usuários numa versão instalada, e o
`PROTOCOL_VERSION` existe justamente porque a extensão instalada é sempre mais
velha que o site.

Detalhamento em [`comparativo-fluxos-v2.md`](comparativo-fluxos-v2.md) §9 e
§12, e em [`specs/09-reforco-e-revisoes.md`](specs/09-reforco-e-revisoes.md).

---

## No dia da submissão

1. `npm run check` — typecheck, lint e testes de todos os pacotes.
2. `npm run ext:build` a partir de clone limpo, com `npm ci`.
3. `npm run lint --workspace @bora/extension` — 0 erros, 0 warnings, 0 notices.
4. Conferir que o zip submetido é byte a byte o `dist/` do passo 2 (PUB-01).
5. Instalar o zip num Firefox limpo e percorrer o caminho das notas ao revisor
   (PUB-03) do começo ao fim, incluindo a volta ao site.
6. Anexar: fonte, instruções de build, política de privacidade, notas ao
   revisor e conta de teste.

Não afirme que passou sem ter rodado — item 4 de "Antes de commitar" do
`CLAUDE.md` vale aqui inteiro.
