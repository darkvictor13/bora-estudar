# 08 — Desempenho e estatísticas

**Situação:** implementada · **Fluxos e2e:** F-BAT-14, F-ALU-01

---

## Problema

Desempenho é o número que o aluno olha para decidir o que estudar e o professor
olha para decidir o que mudar. Precisa ser um só.

Na versão anterior eram três: o contador no bloco em `localStorage`, o contador
gravado no banco pelo `PATCH` da meta, e a soma feita na tela a partir das
metas. Escreviam pelo mesmo caminho lógico e por caminhos de código diferentes,
e divergiam — a tela de disciplinas mostrava um número, a de estatísticas
mostrava outro. O problema não era ter agregado; era ter **três caminhos
independentes escrevendo o mesmo número**.

Havia um segundo problema, mais sutil: a v2 misturava numa média só as questões
principais da bateria, os reforços e as questões extras. Um aluno que praticava
muito extra via a nota subir sem ter melhorado nas principais.

---

## Regras

| Id | Regra |
|---|---|
| R-PERF-01 | `quiz_session_questions` é o ledger e a **única fonte de desempenho**. É append-only, protegido pelo gatilho `tg_block_ledger_mutation`. |
| R-PERF-02 | **Todo número agregado vem de view.** Nenhuma coluna de contador é mantida à mão em lugar nenhum. |
| R-PERF-03 | Só sessões `completed` entram nos agregados. Cancelada, anulada e aguardando tempo ficam de fora — mas continuam no ledger, para auditoria. |
| R-PERF-04 | **Desempenho oficial** conta só a fase `main`. É a nota da meta e do bloco. |
| R-PERF-05 | **Aproveitamento total** conta as três fases. É o que o aluno praticou, não a nota. |
| R-PERF-06 | As duas medidas aparecem lado a lado, nunca fundidas. Ordenação de bloco usa a oficial. |
| R-PERF-07 | Estudo extra não entra em questões nem em desempenho — é meta de tipo `extra_study`, sem ledger. |
| R-PERF-08 | Toda view tem `with (security_invoker = true)`. Sem isso ela roda com privilégio do dono e vaza dados entre alunos. |
| R-PERF-09 | O ledger tem duas chaves únicas: `quiz_session_order_unique (quiz_session_id, execution_order)` e `quiz_session_question_unique (quiz_session_id, question_id, round)`. A segunda impede que uma retentativa duplique respostas dentro da mesma bateria **mesmo que a chave de idempotência falhe na camada de cima**. |
| R-PERF-10 | `reinforcement_has_source` repete no ledger o que o codec já valida: `source_question_id` existe se e só se `phase = 'reinforcement'`. |
| R-PERF-11 | `vw_seen_questions` conta **todas as fases** como vista; as demais views separam por fase. |

---

## As cinco views

| View | Grão | Para quê |
|---|---|---|
| `vw_quiz_session_performance` | uma sessão | contagens por fase (`main_*`, `reinforcement_*`, `extra_*`) e totais. É a base das outras |
| `vw_goal_performance` | uma meta | `questions_answered`, `correct_answers`, `minutes_spent` — **só principais** |
| `vw_block_performance` | um bloco | composição por fase, `official_score_pct` e `total_score_pct` |
| `vw_seen_questions` | uma questão distinta por bloco | `times_seen`, acertos, erros, `last_seen_at` — alimenta o motor [07] |
| `vw_block_errors` | uma questão distinta errada por bloco | `error_count` por fase, `last_error_at`, `last_error_phase` — alimenta o caderno de erros [09] |

`official_score_pct = round(100 * sum(main_correct) / sum(main_count))`, nulo
quando não há principais.
`total_score_pct` usa `total_correct / total_count`.

`vw_quiz_session_performance` faz `left join` no ledger e agrupa por sessão, o
que mantém na view a sessão sem nenhuma resposta — com zeros, em vez de sumir.

---

## Onde cada número aparece

| Tela | Medida |
|---|---|
| `/aluno` | por meta: `correct/answered · pct` a partir de `vw_goal_performance` |
| `/aluno/estatisticas` | cartão "Desempenho oficial" (só principais), cartão "Aproveitamento total" (as três fases), tabela "Blocos × desempenho" ordenada pelo pior oficial |
| `/aluno/disciplinas` | por bloco: oficial, com badge contra `subject_target` |
| `/aluno/cadernos` | por bloco: oficial |
| `/aluno/revisoes` | erros por bloco, de `vw_block_errors` |
| `/professor/alunos/:id` | metas concluídas/total, desempenho oficial, semanas planejadas |
| `/professor/estatisticas` | uma linha por aluno vinculado |

Com 11 acertos em 15 principais, **73%** aparece igual nas cinco telas do aluno.
É esse acoplamento que o F-BAT-14 verifica: um número só, cinco leitores.

---

## Superfície

| Camada | Item |
|---|---|
| Rotas | `/aluno/estatisticas`, `/professor/estatisticas`, e as telas acima |
| Leitura | `getGoalPerformance`, `getBlockPerformance` — `lib/data/student.ts`; `getPlanProgress` — `lib/data/teacher.ts` |
| Domínio | `scorePercent`, `formatMinutes` — `lib/domain/goals.ts` (testado em `goals.test.ts`) |
| Banco | `quiz_session_questions`, gatilho `tg_block_ledger_mutation`, as cinco views |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Com 11/15, `vw_goal_performance` traz 15 respondidas, 11 certas e 85 minutos | F-BAT-13 |
| CA-02 | Os mesmos 73% aparecem em `/aluno`, `/aluno/estatisticas`, `/aluno/disciplinas` e `/aluno/cadernos` | F-BAT-14 |
| CA-03 | Bateria cancelada não altera `vw_block_performance` nem `vw_seen_questions`, e as respostas continuam no ledger | F-BAT-15 |
| CA-04 | `UPDATE` e `DELETE` no ledger levantam erro do gatilho | `supabase/tests/` |
| CA-05 | Questões extras e de reforço mudam `total_score_pct` e **não** mudam `official_score_pct` | `supabase/tests/` |
| CA-06 | Aluno 2 lê zero linhas do ledger do aluno 1 | F-ISO-01, `supabase/tests/02_rls.sql` |
| CA-07 | Duas respostas com o mesmo `execution_order` na mesma sessão são recusadas | `supabase/tests/` |
| CA-08 | Toda view do schema declara `security_invoker = true` | `supabase/tests/` |
| CA-09 | Meta de estudo extra não aparece na contagem de questões nem no desempenho | **sem cobertura** — não há como concluí-la hoje |

---

## Fora de escopo

- **Tempo de estudo agregado.** `quiz_sessions.duration_minutes` é gravado e
  `vw_goal_performance` o soma, mas nenhuma tela mostra tempo por dia, por
  semana ou por mês. A v2 tinha, com gráfico e compartilhamento.
- **Séries temporais.** Não há desempenho por semana nem questões por semana.
- **Sequência de dias estudados.** Não há.
- **Dificuldade por tópico.** `topic` viaja no ledger e não é agregado por
  nenhuma view nem tela.
- **Filtros de histórico** por planejamento arquivado ou por ano.
- **Gráficos.** As telas são cartões e tabelas.
