# 41 — Conteúdo fora do bundle

**Situação:** não implementada · **Fluxos e2e:** nenhum novo; F-FLASH-03 a F-FLASH-05 e F-LEI-01 a F-LEI-03 como regressão

Fecha o que as specs [38](38-biblioteca-de-flashcards-no-banco.md),
[39](39-biblioteca-de-flashcards-lida-do-banco.md) e
[40](40-leis-editais-e-marcacoes-no-banco.md) deixaram aberto. Revoga a parte de
R-BIB-32 que mantinha o chunk publicado.

---

## Problema

A spec 38 abriu com "o conteúdo pago está aberto": o arquivo dos cartões ia
para o navegador de qualquer visitante, com ou sem conta. Ela adiou a correção
para a 39, onde o site passaria a ler do banco. A 39 fez o site ler do banco,
mas manteve o arquivo vivo para a implementação `fixtures`, e o Vite continua
gerando um chunk com ele a cada build. A 40 repetiu o desenho com o Vade Mecum.

Por isso, hoje, o banco **não é** a única fonte do conteúdo. Medido no `dist`
de 01/10/2026:

- `pf2029-policial-flashcards-*.js`, 1,6 MB: frente e verso dos 5.108 cartões,
  em texto puro;
- um chunk por lei (15) e um com os mapas dos três editais.

Esses arquivos são servidos pelo mesmo Worker que serve o site, a quem pedir, e
quem não tem conta pode baixá-los. A policy que limita o texto do cartão e do
artigo a quem tem acesso vigente (R-BIB-13, R-LEI-07) continua valendo no
banco, mas o próprio produto entrega uma segunda cópia que não passa por ela.
E nada impede a volta: a 39 trocou o import estático por um dinâmico, e o teste
que ela deixou (CA-10) confere só o estático. Foi exatamente o caminho por onde
o conteúdo saiu de novo.

Há um custo menor ao lado. A `fixtures` lê o arquivo inteiro para servir uma
tela local, e os testes do contrato afirmam números do conteúdo real
("15 leis", "os oito aliases"). Cada lote editorial novo pode quebrar um teste
de contrato que não tem nada a ver com ele.

**O que esta spec não resolve, de propósito:** o repositório é público, e os
Markdown de `content/flashcards/` e o JSON que sai deles continuam legíveis no
GitHub. *(Decidido na entrevista: o repositório fica aberto.)* O texto das leis
não tem esse problema, porque lei é domínio público (Lei 9.610, art. 8º, IV).

---

## Regras

| Id | Regra |
|---|---|
| R-PUB-01 | Nenhum conteúdo editorial é publicado com o site: nem cartão da biblioteca, nem texto de lei, nem o índice da biblioteca de leis, nem mapa de edital. Quem os entrega é o banco, pelas policies das specs 38 a 40. O índice e os mapas, legíveis por qualquer autenticado, saem do bundle junto, porque hoje chegam também a quem não tem conta. *(Decidido na entrevista.)* |
| R-PUB-02 | Os arquivos de conteúdo moram em `content/`, ao lado dos Markdown de onde saem, e servem de entrada para a carga: `content/flashcards/pf2029-policial-flashcards.json`, `content/flashcards/pf2029-informatica-flashcards.json` (o legado, lido só pelos oito cartões consolidados, R-BIB-16), `content/laws/library/index.json`, `content/laws/library/text/<id>.json` e `content/laws/library/exam-maps.json`. |
| R-PUB-03 | `apps/web` não guarda conteúdo nem o importa: `apps/web/src/data/` deixa de existir, e nenhum arquivo de `apps/web/src` tem caminho que chegue a `content/`, por import estático, dinâmico ou `new URL`. Quem impõe é o teste de CA-03, que substitui o de CA-10 da spec 39. |
| R-PUB-04 | Mudar o lugar não muda o conteúdo. Os geradores (`build-pf-flashcards.mjs`, `import-police-flashcards.mjs`, `build-law-library.mjs`, `build-law-exam-maps.mjs`) passam a escrever em `content/`, e as cargas e seus testes a ler de lá. Nenhum id e nenhum texto mudam: regenerar produz arquivos idênticos byte a byte aos de hoje, e a carga seguinte não escreve linha nenhuma (R-BIB-17, CA-02 da 40). |
| R-PUB-05 | A `fixtures` serve uma **amostra sintética** escrita em TS, com texto inventado. Nenhum trecho do conteúdo real entra nela, nem resumido. Cobre o que o contrato precisa exercitar: duas matérias; três decks, sendo um `historical`; cartões sem aviso e com cada um dos quatro valores de `LibraryFlashcardNotice`; um alias de cartão retirado para cartão ativo; duas leis curtas em matérias diferentes; um edital com um item cuja norma tem texto e outro cuja norma não tem. *(Decidido na entrevista.)* |
| R-PUB-06 | Os números do conteúdo real (5.108 cartões, 15 leis, 768 artigos, três editais, os oito aliases) são afirmados só pela carga: `17_library_content.sql`, `18_laws.sql` e `scripts/load-*.test.mjs`, que já os afirmam. Os testes do contrato (`fixtures.test.ts`) e do domínio (`law-exam-maps.test.ts`) afirmam a amostra. |
| R-PUB-07 | `scripts/check-dist-content.mjs <dist>` lê os arquivos de `content/` e falha, nomeando o arquivo do `dist` e o trecho encontrado, quando qualquer arquivo do `dist` contém uma linha de frente ou verso de cartão ou de parágrafo de artigo com 40 caracteres ou mais. Cada linha é procurada em duas formas: crua, e escapada como string JSON. São as duas formas em que um texto chega a um chunk (template literal ou string entre aspas). *(Suposição do autor: com menos de 40 caracteres, frases genéricas de lei casariam com texto que não é conteúdo.)* |
| R-PUB-08 | A varredura roda **no `dist` que vai para o ar**. No `ci.yml` roda depois de "Compilar o site". No job `site` dos dois deploys roda depois de compilar e antes de publicar, ao lado de "Nenhum sourcemap vai para o ar", porque o deploy recompila com as variáveis reais e o `dist` do CI não é o publicado. Os três lugares chamam o mesmo script, que é quem guarda a regra. |
| R-PUB-09 | A amostra de R-PUB-05 também passa pela varredura, sem exceção. Se alguém copiar um cartão real para a amostra, o build reprova. |
| R-PUB-10 | Nenhuma migration, RPC, policy ou grant muda. O banco já é a fonte. Esta spec tira do site a cópia que sobrou. |

---

## Fluxo

```
content/**/*.md ──► geradores ──► content/**/*.json ──► carga (job banco) ──► banco ──► site lê pela API
                                         │
                                         └──► check-dist-content.mjs (lê como referência)

apps/web ──► vite build ──► dist ──► check-dist-content.mjs ──► falhou? para aqui
                                                            └─► publicar (só nos deploys)
```

A varredura é o último passo antes de publicar, e essa ordem não pode inverter.
Varrer depois de publicar só diz que o conteúdo já saiu.

---

## Superfície

| Camada | Item |
|---|---|
| Conteúdo | `apps/web/src/data/**` → `content/flashcards/*.json` e `content/laws/library/**` (R-PUB-02), conteúdo intacto |
| Geradores | `scripts/build-pf-flashcards.mjs`, `scripts/import-police-flashcards.mjs`, `scripts/build-law-library.mjs`, `scripts/build-law-exam-maps.mjs`: caminho de saída |
| Carga | `scripts/load-library-flashcards.mjs`, `scripts/load-law-library.mjs`: caminho de entrada |
| Testes de script | `scripts/law-library.test.mjs`, `scripts/police-flashcards.test.mjs`: caminho; `scripts/check-dist-content.test.mjs` (novo) |
| Varredura | `scripts/check-dist-content.mjs` (novo) |
| CI | `.github/workflows/ci.yml`, `deploy-staging.yml`, `deploy-producao.yml`: um passo cada (R-PUB-08) |
| Fixtures | `apps/web/src/lib/api/fixtures-library.ts` e `fixtures-laws.ts` leem a amostra; amostra nova em `apps/web/src/lib/api/fixtures-content.ts` |
| Testes do site | `lib/api/fixtures.test.ts` e `lib/domain/law-exam-maps.test.ts` passam a afirmar a amostra; `lib/domain/library-flashcards.test.ts` perde a checagem de CA-10 da 39; `lib/content-boundary.test.ts` (novo, CA-03) |
| Specs | 39 e 40 ganham nota apontando para esta, no commit da implementação |

Nenhuma rota, componente, RPC ou migration.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | O `dist` compilado não contém nenhuma linha de cartão ou de artigo com 40 caracteres ou mais, nem crua nem escapada. | `scripts/check-dist-content.mjs` no `ci.yml` e nos dois deploys |
| CA-02 | A varredura reprova um `dist` com um trecho real (cru, e escapado com aspas e quebra de linha), nomeando arquivo e trecho. Aprova um `dist` limpo e um que contenha só a amostra. | `scripts/check-dist-content.test.mjs` |
| CA-03 | `apps/web/src/data/` não existe, e nenhum arquivo de `apps/web/src` referencia `content/` ou um JSON de conteúdo, por import estático, dinâmico ou `new URL`. | `apps/web/src/lib/content-boundary.test.ts` |
| CA-04 | Os JSON chegam a `content/` como renomeação pura. A biblioteca de cartões regenerada a partir dos Markdown é idêntica à versionada. O lote de leis lido de `content/` tem 15 leis e 768 artigos íntegros. | `git diff --find-renames=100%` do commit sem alteração de conteúdo; `scripts/police-flashcards.test.mjs`; `scripts/law-library.test.mjs` |
| CA-05 | A carga lida de `content/` produz o mesmo banco: 5.108 cartões, 14 matérias, 101 decks, 46 normas, 15 leis, 768 artigos e três editais com 69 itens. Uma segunda carga não escreve nada. | `supabase/tests/17_library_content.sql` (01), `18_laws.sql` (01, 02), `scripts/load-library-flashcards.test.mjs` (CA-03), `scripts/load-law-library.test.mjs` (CA-02) |
| CA-06 | A `fixtures` cumpre o contrato com a amostra: o catálogo vem sem texto e o deck com texto; os quatro avisos aparecem; o alias resolve; o deck histórico aparece marcado; a lei abre por artigo; o edital marca como disponível só a norma que tem texto; as marcações gravam e apagam. | `apps/web/src/lib/api/fixtures.test.ts` |
| CA-07 | O filtro e a cobertura do mapa de edital funcionam sobre a amostra. | `apps/web/src/lib/domain/law-exam-maps.test.ts` |
| CA-08 | Contra o banco, as telas de flashcards e de leis continuam iguais. | F-FLASH-03, F-FLASH-04, F-FLASH-05, F-LEI-01, F-LEI-02, F-LEI-03 (regressão) |

Nenhum fluxo e2e novo. O que esta spec garante é a **ausência** de um arquivo
no `dist`, e um navegador não enxerga chunk que ninguém carrega: o da `fixtures`
nunca é pedido quando quem atende é o `supabase`. Por isso a prova é a
varredura do `dist`.

---

## Fora de escopo

- **O repositório público.** Os cartões continuam legíveis no GitHub, nos
  Markdown e no JSON. *(Decidido na entrevista.)* Se isso mudar, o caminho é
  tornar o repositório privado. Tirar o conteúdo do repositório seria outra
  spec, com a carga passando a buscar a fonte com um segredo novo.
- **O que já foi baixado.** Não há como recolher. Depois do primeiro deploy
  desta spec, o caminho antigo do chunk cai no `not_found_handling` do Worker
  e devolve o `index.html`.
- **PDFs de aula em `apps/web/public/materials/`.** Também são publicados
  abertos, mas fechá-los exige Supabase Storage com bucket, policy e URL
  assinada, mexendo em banco e site ao mesmo tempo. Fica para spec própria.
  *(Decidido na entrevista.)*
- **Conteúdo real no `vite dev`.** Um módulo virtual que existisse só no
  servidor de desenvolvimento manteria o conteúdo real na `fixtures`, mas seria
  uma segunda forma de ler o arquivo. A amostra basta para construir tela.
  *(Decidido na entrevista.)*
- **Carregar a `fixtures` só quando ela é escolhida.** Fazer `lib/api/index.ts`
  importá-la sob demanda tiraria a amostra do bundle de produção. Com R-PUB-05
  a amostra é texto inventado e pequeno, e deixá-la no bundle não custa nada.
