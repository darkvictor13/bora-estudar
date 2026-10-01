# 40 — Leis, editais e marcações no banco

**Situação:** não implementada · **Fluxos e2e:** F-LEI-01 a F-LEI-03

Terceira de três (ver a 38 e a 39). Atualiza o que a spec
[34](34-cronograma-leis-flashcards.md) diz sobre marcações: elas deixam de
ficar no navegador.

---

## Problema

O Vade Mecum — 15 leis, 768 artigos e os mapas de três editais — mora em
arquivos publicados com o site. Quatro coisas custam por isso:

- **a marcação de leitura fica presa ao aparelho.** O aluno que grifa a Lei de
  Drogas no computador abre o celular e não vê nada; limpar o navegador apaga
  tudo, sem aviso;
- **a marcação é presa à posição do caractere.** Corrigir uma vírgula no começo
  de um parágrafo desloca todos os grifos dele, e passa a pintar o trecho
  errado sem que ninguém perceba;
- **corrigir uma lei exige publicar o site**, como acontecia com os cartões;
- **o mapa de edital repete o título de cada norma**, e o vínculo "esta norma
  tem texto na biblioteca" é um booleano escrito à mão no arquivo
  (`available`), que pode dizer o contrário do que a biblioteca tem.

---

## Regras

### Conteúdo

| Id | Regra |
|---|---|
| R-LEI-01 | Uma norma, um `canonical_id` (`BR-FED-LEI-11343-2006`): `legal_norms`. Entram as 37 da lista mestra e as 9 que só os mapas citam, com `sphere` e `verification_status` nulos quando a lista mestra não os declara. |
| R-LEI-02 | O texto é outra coisa que a norma: `laws` é a edição de uma norma na biblioteca, com o id curto que a URL já usa (`ld`), `norm_id` único e FK para `legal_norms`. |
| R-LEI-03 | `law_articles` guarda o artigo com o id que o arquivo já traz (`ld-art-33`) e os parágrafos em `text[]`. Artigo não se apaga: sai por `retired_at`, porque marcação aponta para ele. |
| R-LEI-04 | `law_subjects` é a matéria da biblioteca, por FK — não texto livre. |
| R-LEI-05 | `exam_notices` → `exam_notice_sections` → `exam_notice_items`. O item guarda só o vínculo (`norm_id`) e o recorte (`scope`). O título vem da norma; "tem texto na biblioteca" é calculado pela existência de `laws` para a norma — o `available` do arquivo sai. |
| R-LEI-06 | O número de artigos não é guardado: sai de `vw_law_library`. |
| R-LEI-07 | Ler o texto (`law_articles`) exige acesso vigente ou professor, como os cartões. Normas, matérias, a biblioteca e os mapas são o índice e ficam abertos a autenticado. *(Decidido na entrevista.)* |
| R-LEI-08 | Ninguém em `authenticated` escreve em conteúdo de lei. A carga é `scripts/load-law-library.mjs`, no mesmo passo do deploy da 38, numa transação e idempotente. |

### Marcações

| Id | Regra |
|---|---|
| R-LEI-09 | A marcação é do aluno e mora em `law_marks`, uma linha por trecho marcado: `id` gerado no navegador, `student_id`, `law_id`, `article_id`, `paragraph_index`, `start_offset`, `end_offset`, `style`, `color` e a âncora de texto (R-LEI-11). |
| R-LEI-10 | O aluno escreve direto, com RLS: lê, cria, altera e apaga só as próprias; criar e alterar exigem acesso vigente; ler não (quem venceu continua vendo os próprios grifos). `GRANT UPDATE` só em posição, âncora, estilo e cor — `student_id`, `law_id` e `article_id` ficam fora. |
| R-LEI-11 | **Âncora por trecho, além da posição** (o `TextQuoteSelector` da W3C Web Annotation): cada marcação guarda `quote` (o texto exato marcado), `prefix` e `suffix` (até 32 caracteres antes e depois). *(Proposto e decidido na entrevista.)* |
| R-LEI-12 | Ao abrir a lei, cada marcação é reancorada: se o parágrafo gravado ainda tem `quote` na posição gravada, pinta ali; senão procura `quote` em todos os parágrafos do artigo e escolhe a ocorrência cujo contexto mais se parece com `prefix` e `suffix`, desempatando pela mais próxima da posição antiga. |
| R-LEI-13 | Marcação cujo `quote` não existe mais no artigo — ou cujo artigo foi retirado — não é pintada, **continua no banco**, e o leitor diz quantas estão nessa situação. Nenhuma marcação é apagada pela correção de um texto. |
| R-LEI-14 | `(law_id, article_id)` tem FK composta para `law_articles (law_id, id)`: o artigo é da lei que a linha diz. |
| R-LEI-15 | Salvar é a diferença entre o antes e o depois de cada ação (criar, alterar, apagar por `id`). É **naturalmente idempotente**, e quem sustenta é a PK `law_marks_pkey`: criar é `insert … on conflict do nothing` com o id do navegador; alterar grava valores absolutos; apagar é por id. As gravações de uma aba saem em fila, uma depois da outra. |
| R-LEI-16 | As marcações que estavam no navegador **não são migradas**: a conta começa sem marcação. *(Decidido na entrevista.)* |
| R-LEI-17 | `quote` tem o tamanho exato de `end_offset - start_offset` (CHECK). |

---

## Fluxo

```
/aluno/leis?lei=X → loadLawLibrary + loadLawDocument(X) + loadLawMarks(X) + loadExamMaps
                  → reancorar (R-LEI-12) → pintar as encontradas, contar as perdidas
marcar/apagar     → nova lista → diff por id → saveLawMarks (fila) → INSERT / UPDATE / DELETE
```

---

## Superfície

| Camada | Item |
|---|---|
| Migration | `supabase/migrations/20261001180000_law_library.sql` — uma |
| Banco | `law_subjects`, `legal_norms`, `laws`, `law_articles`, `exam_notices`, `exam_notice_sections`, `exam_notice_items`, `law_marks`; enums `legal_norm_sphere`, `legal_norm_verification`, `law_mark_style`, `law_mark_color`; `vw_law_library` |
| Carga | `scripts/load-law-library.mjs` + `.test.mjs`; passo no job `banco` dos dois deploys; `db:reset` e `run.sh` |
| Conteúdo | os textos saem de `apps/web/public/laws/` para `apps/web/src/data/laws/text/`; `index.json` ganha `canonicalId` e perde `contentPath` |
| Contrato | `loadLawLibrary`, `loadLawDocument`, `loadExamMaps`, `loadLawMarks`, `saveLawMarks` |
| Adaptadores | `lib/api/supabase/laws.ts` (novo); `lib/api/fixtures-laws.ts` (novo, import dinâmico) |
| Domínio | `lib/domain/law-markings.ts`: `anchorLawMarks`, `diffLawMarks`, `withLawQuotes`; `law-library.ts` e `law-exam-maps.ts` sem JSON |
| Tela | `routes/student/Laws.tsx`, `components/student/LawContinuousReader.tsx`, `components/student/LawExamMaps.tsx` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A carga traz 46 normas, 15 leis, 768 artigos ativos e os 3 editais com os 69 itens; `vw_law_library` conta os artigos de cada lei. | `supabase/tests/18_laws.sql` |
| CA-02 | Carregar duas vezes não escreve nada; o artigo que some do arquivo é retirado e volta com o mesmo id. | `scripts/load-law-library.test.mjs` |
| CA-03 | Aluno vigente e professor leem os artigos; vencido e pendente leem zero; o índice é legível a todos os autenticados. | `18_laws.sql` |
| CA-04 | O aluno lê e escreve só as próprias marcações; o colega lê zero e apaga zero (contado por linhas). | `18_laws.sql` |
| CA-05 | `student_id`, `law_id` e `article_id` estão fora do grant de UPDATE (`42501`). | `18_laws.sql` |
| CA-06 | Artigo de outra lei, `quote` de tamanho errado e escrita sem acesso vigente são recusados. | `18_laws.sql` |
| CA-07 | Reancorar: trecho no lugar pinta no lugar; trecho deslocado pinta no lugar novo; trecho repetido escolhe pelo contexto; trecho que sumiu não pinta e é contado. | `lib/domain/law-markings.test.ts` |
| CA-08 | O diff de marcações produz criar, alterar e apagar por id, e nada para listas iguais. | `law-markings.test.ts` |
| CA-09 | O contrato de leis, editais e marcações é o mesmo nas duas implementações. | `lib/api/fixtures.test.ts` |
| CA-10 | A marcação feita num aparelho aparece em outra sessão do mesmo aluno. | F-LEI-01 |
| CA-11 | Corrigido o texto antes do trecho grifado, o grifo continua no mesmo trecho; apagado o trecho, o leitor avisa que uma marcação ficou sem lugar. | F-LEI-02 |
| CA-12 | O mapa de edital mostra a norma como disponível quando a biblioteca tem o texto dela, e abre a lei. | F-LEI-03 |

---

## Fora de escopo

- **Migrar as marcações do navegador.** Decidido na entrevista (R-LEI-16).
- **Reancorar entre artigos.** A busca fica dentro do artigo gravado: um
  trecho que mudou de artigo é tratado como perdido, porque a mesma frase
  aparece em artigos diferentes da mesma lei e pintar no artigo errado é pior
  do que avisar.
- **Gravar a posição reancorada.** A reancoragem roda a cada abertura e é
  determinística; a posição gravada só muda quando o aluno mexe na marcação.
- **Desfazer entre sessões.** O desfazer continua sendo da sessão da tela.
- **Busca no texto integral (`tsvector`).** Não foi pedida.
