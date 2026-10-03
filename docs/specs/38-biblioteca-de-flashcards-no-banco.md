# 38 — Biblioteca de flashcards no banco

**Situação:** implementada em 01/10/2026 · **Fluxos e2e:** nenhum novo — o front não muda nesta spec; F-FLASH-03 continua valendo como regressão

Primeira de três. Esta traz o conteúdo da biblioteca PF 2029 para o banco e o
carrega; a **39** amarra as revisões ao cartão por FK e passa o site a ler do
banco; a **40** faz o mesmo com leis, editais e marcações de leitura.

---

## Problema

Os 5.108 cartões da biblioteca PF 2029 existem só num arquivo publicado junto
com o site. Isso custa três coisas.

**Nada garante que uma revisão aponte para um cartão que existe.** O banco
guarda a memória de cada aluno por `(deck_id, card_id)`, mas não conhece
cartão nenhum: `card_id` é um uuid solto. A consolidação de Informática já
moveu oito cartões de lugar, e quem impede que o histórico desses alunos fique
órfão é uma tabela de equivalências mantida dentro do mesmo arquivo, resolvida
no navegador. Um importador que gere id novo para um cartão antigo apaga, em
silêncio, a memória de quem já o estudava — o dado de uma hora de estudo que
não se recria.

**O conteúdo pago está aberto.** O arquivo vai para o navegador de qualquer
visitante, com ou sem conta, com ou sem acesso liberado.

**Corrigir um cartão exige publicar o site.** Uma vírgula errada num verso é um
build, um deploy e, em produção, um disparo manual.

Há ainda uma regra de produto morando em texto livre: o aviso de "conteúdo
revogado" ou "pendente de conferência" que o aluno vê durante o estudo é
decidido por expressão regular sobre o `status` do cartão
(`/conferir|verificar|revisar/`). Um status novo com outra grafia perde o aviso
sem ninguém perceber.

---

## Regras

### Conteúdo

| Id | Regra |
|---|---|
| R-BIB-01 | O conteúdo da biblioteca é matéria → deck → cartão: `library_flashcard_subjects`, `library_flashcard_decks` (que já existe e ganha colunas) e `library_flashcards`. |
| R-BIB-02 | O id de cartão é o uuid que o importador já gera e o arquivo já publica. Nenhum id muda nesta spec: as revisões existentes continuam apontando para o mesmo par `(deck_id, card_id)`. |
| R-BIB-03 | `unique (deck_id, id)` em `library_flashcards` — é o alvo da FK composta que a spec 39 cria a partir de `library_flashcard_reviews`. |
| R-BIB-04 | Cartão **não troca de deck**. Mover é retirar o antigo, criar o novo e registrar alias (R-BIB-08). Imposto pelo carregador, que recusa a carga inteira, e por gatilho em `library_flashcards` que levanta exceção quando `deck_id` muda. |
| R-BIB-05 | Cartão **não é apagado**: sai por `retired_at`. `DELETE` não é concedido a ninguém além de `service_role`, e as FKs para o cartão são `on delete restrict`. |
| R-BIB-06 | Corrigir frente, verso ou tópico é edição no lugar, com o mesmo id, e **mantém a memória do aluno**. Mudança de sentido é cartão novo com o antigo retirado — e é decisão de quem edita o conteúdo, não do carregador. *(Decidido na entrevista.)* |
| R-BIB-07 | `origin` e `status` são FK para `library_flashcard_origins` e `library_flashcard_statuses`, carregadas na migration. Valor desconhecido faz o carregador recusar a carga. `status_id` é nulável: os oito cartões do arquivo antigo de Informática não declaram status, e ausência é "sem aviso". |
| R-BIB-08 | `library_flashcard_aliases (old_deck_id, old_card_id) → (deck_id, card_id)` substitui `previousReviews`. As duas pontas são FK para `library_flashcards`; o destino precisa estar ativo e a origem retirada — dois gatilhos de constraint `deferrable initially deferred` (`library_flashcard_aliases_endpoints` e `library_flashcards_alias_endpoints`), conferidos no fim da transação, porque a carga retira o antigo e grava o alias em qualquer ordem. |
| R-BIB-09 | O aviso editorial é coluna de `library_flashcard_statuses`: `editorial_notice`, enum `library_flashcard_notice` com `revoked`, `pending_check`, `future_effect`, `version_caveat`; nulo é sem aviso. A expressão regular sai da regra; a frase em português continua no front. |
| R-BIB-10 | Nenhum contador é guardado. `totalCards` de matéria e de deck sai de `vw_library_flashcard_decks` (`security_invoker = true`), que conta só cartões ativos. |
| R-BIB-11 | As colunas novas de `library_flashcard_decks` (`subject_id`, `number`, `title`, `position`) nascem nulas e `historical` nasce `false`: as 101 linhas de hoje e o bundle no ar continuam válidos antes da primeira carga. |

### Quem lê, quem escreve

| Id | Regra |
|---|---|
| R-BIB-12 | Ninguém em `authenticated` escreve em tabela de conteúdo: RLS ligada, só `SELECT` concedido. A escrita é do carregador. |
| R-BIB-13 | Ler cartão exige `has_active_access()` ou `is_teacher()`. Aluno vencido continua lendo o próprio histórico em `library_flashcard_reviews` (regra que já existe) e deixa de ler o texto. *(Decidido na entrevista.)* |
| R-BIB-14 | Matérias, decks, origens, status e aliases continuam legíveis a qualquer autenticado: são o índice, não o conteúdo. `vw_library_flashcard_decks` também, mas com `security_invoker` a contagem passa pela policy de R-BIB-13 — quem não lê cartão vê `active_cards = 0`. Sem efeito na tela: `/aluno/flashcards` já exige acesso vigente. *(Corrigido na implementação: a primeira versão dizia que a view mostrava a contagem a todos.)* |
| R-BIB-15 | `anon` não lê nada da biblioteca. |

### Carga

| Id | Regra |
|---|---|
| R-BIB-16 | `scripts/load-library-flashcards.mjs` lê `content/flashcards/pf2029-policial-flashcards.json` *(era `apps/web/src/data/`; mudou na spec 41)* e o JSON legado de Informática (só para os oito cartões consolidados) e escreve tudo numa transação só, por conexão direta (`pg`). Carga pela metade não existe. |
| R-BIB-17 | A carga é idempotente: rodar duas vezes com o mesmo arquivo não muda linha nenhuma — upsert por PK, comparando conteúdo antes de escrever, para que `updated_at` só ande quando o texto andou. |
| R-BIB-18 | Cartão que estava no banco e sumiu do arquivo é **retirado**, nunca apagado. Cartão retirado que volta ao arquivo é reativado. |
| R-BIB-19 | Os oito cartões consolidados de Informática entram como retirados, nos decks antigos, com alias para o equivalente atual — é o que permite à spec 39 validar a FK sobre as revisões que já existem. |
| R-BIB-20 | A carga recusa, com mensagem que nomeia o cartão: id duplicado, cartão mudando de deck, `origin` ou `status` desconhecido, alias apontando para cartão inexistente ou retirado, deck sem matéria. |
| R-BIB-21 | Ao fim, a carga **conta as revisões órfãs** — linha de `library_flashcard_reviews` sem cartão correspondente — e falha se houver alguma. É a pré-condição da FK da spec 39, verificada em cada ambiente antes de ela existir. |
| R-BIB-22 | Em staging e produção a carga roda no job `banco`, depois do `db push` e antes do job `site`, com `--linked`: o host vem de `supabase/.temp/pooler-url`, que o `supabase link` escreve, e a senha de `SUPABASE_DB_PASSWORD`. Nenhum segredo novo. Sem `--linked` o destino é sempre o banco local, mesmo com a senha no ambiente. *(Decidido na entrevista.)* |
| R-BIB-23 | Localmente, `npm run db:reset` roda a carga depois do seed; `npm run db:test` também, antes das suítes. |

---

## Fluxo

```
importador (já existe)        carregador (novo)                    banco
content/flashcards/*.md  ──►  pf2029-policial-flashcards.json  ──►  1 transação
                              + legado de Informática               ├─ upsert subjects/decks/cards
                                                                    ├─ retira o que sumiu
                                                                    ├─ upsert aliases
                                                                    └─ conta revisões órfãs → 0 ou falha
```

No deploy: `db push` → carga → site. O bundle desta spec é o mesmo de hoje,
então a ordem entre carga e site não importa ainda; importa a partir da 39.

---

## Superfície

| Camada | Item |
|---|---|
| Migration | `supabase/migrations/20261001120000_library_flashcard_content.sql` — uma |
| Banco | `library_flashcard_subjects`, `library_flashcards`, `library_flashcard_origins`, `library_flashcard_statuses`, `library_flashcard_aliases`; colunas novas em `library_flashcard_decks`; enum `library_flashcard_notice`; `vw_library_flashcard_decks`; `app_private.forbid_library_card_move` e `app_private.check_library_flashcard_alias` |
| RPCs | nenhuma — conteúdo não tem escrita de usuário |
| Carga | `scripts/load-library-flashcards.mjs`, com `scripts/load-library-flashcards.test.mjs` |
| CI | passo "Carregar a biblioteca de flashcards" no job `banco` de `deploy-staging.yml` e `deploy-producao.yml` |
| Scripts npm | `db:reset` roda a carga depois do reset; `supabase/tests/run.sh` roda a carga antes das suítes e o teste da carga depois delas |
| Tipos | `packages/database/src/schema.gen.ts` regenerado |
| Docs | `docs/de-para-schema.md` (coluna 01/10) e a asserção de tamanho de `supabase/tests/07_schema.sql` |
| Site | nada |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Depois da carga local, o banco tem 5.108 cartões ativos, 14 matérias e 101 decks, e a contagem por deck da view bate com o arquivo. | `17_library_content.sql` (01) + `load-library-flashcards.test.mjs` (CA-01) |
| CA-02 | Os oito cartões consolidados existem retirados, com alias para um cartão ativo; retirar o destino, reativar a origem ou apagar um cartão citado é recusado. | `17_library_content.sql` (02, 04, 05, 06) |
| CA-03 | Rodar a carga duas vezes não altera `updated_at` de linha nenhuma. | `scripts/load-library-flashcards.test.mjs` (CA-03) |
| CA-04 | Um arquivo sem um cartão retira esse cartão; o arquivo original o reativa com o mesmo id. | `load-library-flashcards.test.mjs` (CA-04) |
| CA-05 | Mudar o `deck_id` de um cartão é recusado — pelo carregador e por UPDATE direto da manutenção. | `load-library-flashcards.test.mjs` (CA-05) + `17_library_content.sql` (03) |
| CA-06 | `status` ou `origin` desconhecido recusa a carga inteira, sem escrita parcial. | `load-library-flashcards.test.mjs` (CA-06) |
| CA-07 | Revisão órfã faz a carga falhar nomeando o par `(deck_id, card_id)`. | `load-library-flashcards.test.mjs` (CA-07) |
| CA-08 | Aluno com acesso vigente lê cartão; aluno vencido e aluno `pending` leem zero linhas; professor lê. Contado por linhas, não por exceção. | `17_library_content.sql` (07 a 10) |
| CA-09 | Aluno vencido continua lendo a própria revisão editorial. | `11_library_flashcards.sql` (já existe — continua passando) |
| CA-10 | `anon` não lê nenhuma tabela da biblioteca; `authenticated` não tem INSERT, UPDATE nem DELETE em nenhuma, e tentar levanta `42501`. | `01_grants.sql` (28, 30, 31) |
| CA-11 | Todo status que hoje gera aviso no front tem `editorial_notice` não nulo, e o mapeamento reproduz `flashcardEditorialNote` para os 33 status do arquivo. | `load-library-flashcards.test.mjs` (CA-11) |
| CA-12 | A revisão de um cartão da biblioteca continua gravando pelo site, sem mudança. | F-FLASH-03 (regressão; F-FLASH-01 e 02 rodados junto) |

---

## Fora de escopo

- **FK das revisões para o cartão, e "cartão retirado não aceita revisão".**
  São da spec 39, numa migration própria. Na mesma migration desta, entre o
  `db push` e a carga toda revisão seria recusada pela FK — e o bundle no ar
  continua revisando. R-BIB-21 garante que, quando a 39 chegar, a FK valida.
- **O site lendo do banco, e o arquivo saindo do bundle.** Spec 39. Só depois de
  ela estar em produção o conteúdo deixa de estar aberto (o problema 2 desta
  spec continua existindo até lá).
- **Editor de cartão para o professor.** O conteúdo continua nascendo nos
  Markdown de `content/` e passando pelo importador; o banco é destino, não
  fonte.
- **`canonical_id` legível (`FC-DP-TEORIA-CRIME-0001`).** O padrão de
  `content/laws/vade-mecum-base-v1/00_PADRAO_OFICIAL_IDS.md` sugere, mas nenhum
  arquivo de cartão o traz ainda; inventar um aqui seria um segundo id sem dono.
- **`tags`.** Vazio nos 5.108 cartões. Volta quando houver valor para guardar,
  e volta como tabela, não como `text[]`.
- **Leis, editais e marcações de leitura sincronizadas.** Spec 40.
