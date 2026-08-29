# 09 — Reforço e revisões

**Situação:** implementada **pela metade** — o banco executa, as telas só recomendam
**Fluxos e2e:** F-ALU-03, F-BAT-14, F-PROF-09

---

## Problema

Errar uma questão só tem valor se o erro volta. O produto precisa de dois
mecanismos distintos, e a versão anterior os mantinha separados — corretamente:

- **reforço** é reação a desempenho: um bloco em que o aluno vai mal precisa ser
  reatacado, e especificamente pelas questões que ele errou;
- **revisão espaçada** é calendário: o caderno TEC lido na semana 1 volta na
  semana 6, independentemente da nota.

A v2 executava os dois, mas guardava o estado do ciclo de reforço **só no
`localStorage`**. Trocar de navegador fazia o aluno refazer reforços já
concluídos, e o resultado do reforço vivia como base64 dentro de um campo de
observação.

---

## Regras

### Quando o reforço é devido

| Id | Regra |
|---|---|
| R-REF-01 | O ciclo é um conjunto fechado de **exatamente 3 baterias válidas** do mesmo bloco. |
| R-REF-02 | Vale só bateria `completed`; cancelada e anulada não entram. |
| R-REF-03 | O gatilho é o **desempenho oficial acumulado do ciclo abaixo de 80%** — só a fase `main`. |
| R-REF-04 | Um ciclo em 80% ou mais não exige reforço, e `record_reinforcement` recusa: `este ciclo atingiu 80% e nao exige reforco automatico`. |
| R-REF-05 | Uma bateria não pode ser reaproveitada em dois ciclos: `reinforcement_sessions.session_in_single_cycle`. Substitui a "chave de ciclo" concatenada da v2. |

### Executar o reforço

| Id | Regra |
|---|---|
| R-REF-06 | `record_reinforcement` passa por `reserve_operation`: mesmo `request_id` com o mesmo payload devolve o reforço anterior. |
| R-REF-07 | **Todo erro principal do ciclo precisa ter sido revisado.** A RPC calcula o `EXCEPT` entre os erros `main` das três sessões e as questões do reforço, e recusa se sobrar alguma. |
| R-REF-08 | Quem executa é o **aluno**: a RPC exige `study_plans.student_id = auth.uid()`. |
| R-REF-09 | O reforço grava `cutoff` — o `completed_at` da última das três — e `source_score`, o percentual que o justificou. |
| R-REF-10 | Concluir um reforço insere em `review_cycles (student_id, block_id, cutoff)`, com `on conflict do nothing`. É esse estado, no banco e não no navegador, que impede refazer o mesmo ciclo em outro computador. |

### Caderno de erros

| Id | Regra |
|---|---|
| R-REF-11 | `vw_block_errors` traz **uma linha por questão distinta errada** no bloco, somando as três fases, com a fase da ocorrência mais recente para a interface rotular. |
| R-REF-12 | Só sessões `completed` entram. |
| R-REF-13 | A tela seleciona o bloco por `?bloco=<uuid>`; id que não pertence ao planejamento é ignorado, sem erro. |

---

## O que existe hoje

| Peça | Onde | Situação |
|---|---|---|
| Detectar o ciclo devido | `/aluno/revisoes`, `/professor/revisoes` | ✅ lê `vw_block_performance`, filtra `session_count >= 3` e `official_score_pct < 80` |
| Ver os erros do bloco | `/aluno/revisoes?bloco=` | ✅ lê `vw_block_errors` |
| Contar ciclos já fechados | `/aluno/revisoes` | ✅ conta linhas de `review_cycles` por bloco |
| **Executar o reforço** | — | ❌ `record_reinforcement` existe, com `reinforcements`, `reinforcement_sessions` e `reinforcement_questions`, e **nenhuma tela a chama** |
| **Conduzir a fase `reinforcement`** | extensão | ❌ o protocolo aceita, o content script só conduz `main` |
| **Agendar reforço como meta** | — | ❌ `goal_type` tem `reinforcement` e `goals.source_goal_id` é FK de verdade; nada os cria |
| **Ignorar um reforço sugerido** | — | ❌ `goals.reinforcement_skipped` existe e ninguém escreve |
| **Caderno de erros no TEC** | — | ❌ `quiz_session_origin` prevê `error_notebook` e nada o produz |
| **Revisão espaçada** | — | ❌ não existe conceito de calendário de releitura em nenhuma tela |

As duas metades que faltam — a RPC sem tela e a fase sem content script — são
**o mesmo fluxo**, e não fazem sentido separadas: sem a extensão conduzindo a
fase `reinforcement`, não há `p_outcomes` para passar à RPC.

---

## Fluxo pretendido, quando fechar

```
/aluno/revisoes
   bloco com 3 baterias válidas e oficial < 80%
        │
        ├─ hoje: mostra e recomenda
        └─ falta: [Fazer reforço]
                     │
                     ▼  payload com as questões erradas do ciclo
             extensão conduz a fase "reinforcement"
                     │
                     ▼
             rpc record_reinforcement(plano, bloco, [3 sessões], requestId, outcomes)
                     │  valida: 3 completed, mesmo bloco, oficial < 80%
                     │  valida: nenhum erro principal ficou de fora  (R-REF-07)
                     └─► reinforcements + reinforcement_questions + review_cycles
```

---

## Superfície

| Camada | Item |
|---|---|
| Rotas | `/aluno/revisoes` (`?bloco=<uuid>`), `/professor/revisoes` |
| Telas | `routes/student/Reviews.tsx`, `routes/teacher/Reviews.tsx` |
| Leitura | `getBlockErrors`, `getReviewCycles`, `getBlockPerformance` — `lib/data/student.ts`; `getPlanProgress` — `lib/data/teacher.ts` |
| Views | `vw_block_errors`, `vw_block_performance` |
| RPC | `record_reinforcement(p_study_plan_id, p_block_id, p_quiz_session_ids, p_request_id, p_outcomes)` — **sem chamador** |
| Banco | `reinforcements`, `reinforcement_sessions`, `reinforcement_questions`, `review_cycles` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | `/professor/revisoes` lista os blocos com 3+ baterias válidas e oficial abaixo de 80% | F-PROF-09 |
| CA-02 | `/aluno/revisoes?bloco=<uuid>` mostra os erros do bloco; id alheio é ignorado sem quebrar | F-ALU-03 |
| CA-03 | Com 11/15, a tela mostra 4 questões no caderno de erros, fase "principal" | F-BAT-14 |
| CA-04 | `record_reinforcement` com número de sessões diferente de 3 é recusada | `supabase/tests/` |
| CA-05 | Ciclo em 80% ou mais é recusado | `supabase/tests/` |
| CA-06 | Reforço que deixa um erro principal de fora é recusado, citando quantas faltam | `supabase/tests/` |
| CA-07 | A mesma bateria em dois ciclos viola `session_in_single_cycle` | `supabase/tests/` |
| CA-08 | Reenvio com o mesmo `request_id` devolve o reforço anterior | `supabase/tests/` |
| CA-09 | Concluir o reforço insere em `review_cycles` e o ciclo deixa de ser oferecido — inclusive em outro navegador | **sem cobertura** — falta a tela |
| CA-10 | Um reforço executado muda `total_score_pct` do bloco e **não** muda `official_score_pct` | `supabase/tests/` |

---

## Fora de escopo

- **Revisão espaçada.** É a outra metade do problema e não existe. Precisa de
  spec própria antes de virar código: `review_cycles` hoje guarda ciclo de
  reforço, não calendário de releitura, e reusar a tabela para os dois seria
  repetir a confusão que a tela de `/aluno/revisoes` já começa a ter.
- **Reforço decidido pelo professor.** A RPC exige que o executor seja o aluno.
- **Limiar configurável.** 80% é fixo, e vem de `study_plan_blocks.subject_target`
  apenas na exibição do badge — o gatilho do reforço usa o literal.
- **Reforço entre blocos.** O ciclo é sempre dentro de um bloco.
