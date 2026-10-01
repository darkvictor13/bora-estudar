# 39 — Biblioteca de flashcards lida do banco

**Situação:** implementada em 01/10/2026 · **Fluxos e2e:** F-FLASH-04 e F-FLASH-05; F-FLASH-03 continua como regressão

Segunda de três (ver a 38). A 38 pôs o conteúdo no banco; esta amarra a
revisão ao cartão e faz o site ler de lá.

---

## Problema

Depois da 38 o conteúdo existe em dois lugares — no banco e no arquivo
publicado com o site — e quem decide o que o aluno vê ainda é o arquivo. Três
coisas continuam valendo como antes:

- uma revisão pode ser gravada para um cartão que o banco não tem, ou que foi
  retirado, porque a revisão aponta para `(deck_id, card_id)` sem FK;
- a correção de um cartão só chega ao aluno com um build novo do site, mesmo
  já estando no banco;
- a tela de flashcards baixa os 5.108 cartões inteiros para mostrar uma lista
  de decks, e a de estatísticas também.

---

## Regras

| Id | Regra |
|---|---|
| R-BIB-24 | `library_flashcard_reviews (deck_id, card_id)` tem FK para `library_flashcards (deck_id, id)`, `on delete restrict` (`library_flashcard_reviews_card_fk`). |
| R-BIB-25 | A FK nasce `not valid` na migration e é **validada pela carga**, depois de o conteúdo estar no banco. A 38 e a 39 chegam juntas a staging e produção, e o banco de lá tem revisões e ainda nenhum cartão no momento do `db push`: validar ali falharia. Uma FK `not valid` já confere toda linha nova. |
| R-BIB-26 | Cartão retirado não aceita revisão nova nem atualização da que existe: o `WITH CHECK` de `library_flashcard_reviews_insert` e `_update` exige cartão ativo. A revisão antiga continua legível. |
| R-BIB-27 | **Custo conhecido:** entre o `db push` e o fim da carga do mesmo deploy (segundos), revisar cartão da biblioteca é recusado, porque o cartão ainda não existe para a FK. Vale só para o deploy que leva a 38 e a 39 juntas; nos seguintes o conteúdo já está lá. |
| R-BIB-28 | A lista de decks não carrega texto de cartão: `vw_library_flashcard_decks` ganha `card_ids` e `topics` (os tópicos distintos, para a busca), no fim da view. |
| R-BIB-29 | O texto chega por deck, só quando o aluno abre o deck. |
| R-BIB-30 | O aviso editorial do cartão vem de `editorial_notice` (spec 38, R-BIB-09). A frase continua no front, uma por valor do enum. |
| R-BIB-31 | Os aliases vêm de `library_flashcard_aliases`. A regra de leitura não muda: a memória mais recente entre o par antigo e o novo vence, e a resposta seguinte grava no par novo. |
| R-BIB-32 | O arquivo deixa de ser importado pelo código do site. A implementação `fixtures` o carrega por import dinâmico, num chunk separado. *(Decidido na entrevista: o chunk continua publicado em `dist`.)* |

---

## Fluxo

```
/aluno/flashcards           → loadLibraryFlashcardCatalog → matérias + vw_library_flashcard_decks + aliases
/aluno/flashcards?deck=X    → loadLibraryFlashcardDeck(X) → library_flashcards do deck, ativos, por posição
revisar                     → gradeLibraryFlashcard       → confere cartão ativo → INSERT/UPDATE (FK + WITH CHECK)
```

---

## Superfície

| Camada | Item |
|---|---|
| Migration | `supabase/migrations/20261001150000_library_flashcard_review_fk.sql` — uma |
| Banco | FK `library_flashcard_reviews_card_fk`; índice `(deck_id, card_id)` no lugar de `library_flashcard_reviews_deck_idx`; policies de INSERT e UPDATE; `vw_library_flashcard_decks` + `card_ids`, `topics` |
| Carga | `scripts/load-library-flashcards.mjs` valida a FK no fim |
| Contrato | `loadLibraryFlashcardCatalog`, `loadLibraryFlashcardDeck`; tipos `LibraryCatalog`, `LibraryDeckContent`, `LibraryFlashcardNotice` |
| Adaptadores | `lib/api/supabase/library-flashcards.ts`; `lib/api/fixtures-library.ts` (novo, import dinâmico) |
| Domínio | `lib/domain/library-flashcards.ts` sem o JSON; aliases por parâmetro |
| Rotas | `routes/student/Flashcards.tsx`, `routes/student/FlashcardStatistics.tsx` |
| Testes | `supabase/tests/17_library_content.sql` (11 a 18), `11_library_flashcards.sql` passa a usar um cartão real; `apps/e2e/tests/flashcards.spec.ts` (F-FLASH-04, 05) |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Revisão para cartão que não existe no deck é recusada pelo banco. | `supabase/tests/17_library_content.sql` (12, 14) |
| CA-02 | Revisão nova e atualização de revisão em cartão retirado são recusadas com `42501`; a revisão antiga continua legível. | `17_library_content.sql` (15, 16, 17) |
| CA-03 | Cartão com revisão não se apaga. | `17_library_content.sql` (13) |
| CA-04 | Depois da carga a FK está validada (`convalidated`). | `17_library_content.sql` (11) |
| CA-05 | A view entrega os ids e os tópicos de cada deck, e nada além disso do texto. | `17_library_content.sql` (18) |
| CA-06 | O catálogo, o deck e a revisão obedecem ao mesmo contrato nas duas implementações. | `lib/api/fixtures.test.ts` ("o catálogo traz ids e tópicos…") |
| CA-07 | A lista de decks e a busca por tópico funcionam sem baixar o texto dos cartões. | F-FLASH-04 |
| CA-08 | Um cartão corrigido no banco aparece corrigido no deck sem build novo do site. | F-FLASH-05 |
| CA-09 | A revisão de um cartão da biblioteca continua gravando duas vezes, pelo INSERT e pelo UPDATE. | F-FLASH-03 (regressão) |
| CA-10 | Nenhum módulo do site importa estaticamente o JSON da biblioteca. | `lib/domain/library-flashcards.test.ts` |

---

## Fora de escopo

- **Editor de cartão.** Continua sendo o importador.
- **Paginação do deck.** O maior deck tem 259 cartões; a leitura é inteira.
- **Tirar o chunk de `dist`.** Decidido na entrevista; se o conteúdo precisar
  deixar de ser publicado, a `fixtures` passa a usar uma amostra sintética.
