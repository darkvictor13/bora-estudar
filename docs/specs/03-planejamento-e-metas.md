# 03 — Planejamento e metas

**Situação:** implementada (leitura completa; escrita só pela geração semanal)
**Fluxos e2e:** F-ALU-01, F-ALU-02, F-ALU-06, F-PROF-01, F-PROF-02, F-PROF-03, F-PROF-08

---

## Problema

Um planejamento é o contrato entre professor e aluno: quais matérias, divididas
em quais blocos, em quantas semanas. Tudo que o aluno executa pendura nesse
contrato, e todo número de desempenho é lido através dele.

Na versão anterior o planejamento era um objeto no `localStorage` sincronizado
por `PATCH` direto do navegador, com o contexto (`aluno`, `professor`) repetido
em cada linha e **sem nada garantindo que as cópias concordassem**. Dois
planejamentos ativos ao mesmo tempo era um estado alcançável — o aluno via um,
o professor editava outro — e metade dos metadados vivia codificada dentro de
um campo de observação (`TIPO_REFORCO:1`, `REFORCO_ORIGEM_ID:<uuid>`,
`ORIGEM_SEMANA:n`).

---

## Regras

### Planejamento

| Id | Regra |
|---|---|
| R-PLAN-01 | **Um planejamento ativo por aluno.** Índice parcial `active_study_plan_uidx` sobre `status = 'active' and deleted_at is null`. Os estados "dois ativos" e — em conjunto com `activate_study_plan` — "zero ativos" são inexprimíveis. |
| R-PLAN-02 | Aluno e professor de um planejamento são pessoas diferentes: `study_plan_not_self`. |
| R-PLAN-03 | O nome é único por aluno: `study_plan_name_unique`. |
| R-PLAN-04 | `study_plan_context_uk (id, student_id, teacher_id)` existe para ser **alvo de FK composta** das tabelas filhas. É o que impede a cópia denormalizada de divergir do pai. |
| R-PLAN-05 | Trocar o planejamento ativo é atômico: `activate_study_plan` arquiva o anterior e ativa o novo na mesma transação. |
| R-PLAN-06 | Nada é apagado. Remover é `deleted_at`; FKs de histórico usam `on delete restrict`. |

### Blocos

| Id | Regra |
|---|---|
| R-BLK-01 | Um bloco pertence a exatamente um planejamento, com contexto amarrado por `study_plan_block_context_fk`. |
| R-BLK-02 | A ordem é única dentro do planejamento: `study_plan_block_order_uidx (study_plan_id, subject_order, block_order)` entre os não excluídos. |
| R-BLK-03 | `active = false` tira o bloco da geração de novas metas **sem** afetar metas concluídas nem estatísticas. |
| R-BLK-04 | `catalog_block_id` liga o bloco ao catálogo de questões. Sem essa ligação a bateria não pode abrir — ver [05](05-bateria-inteligente.md). |
| R-BLK-05 | `subject_target` é a meta de aproveitamento da disciplina, padrão 80, entre 0 e 100. É o que decide o badge "Abaixo" na tela do aluno. |

### Metas

| Id | Regra |
|---|---|
| R-GOAL-01 | Toda meta tem `week_number`, `weekday` (0–6) e `day_order`. A posição é única entre as vivas: `goal_position_uidx`, parcial em `deleted_at is null` — é o predicado parcial que permite o modo "substituir" liberar a posição. |
| R-GOAL-02 | Quatro tipos, no enum `goal_type`: `theory`, `question_block`, `reinforcement`, `extra_study`. |
| R-GOAL-03 | Cada tipo carrega o que lhe é obrigatório, por constraint: `question_block` exige `block_id`; `reinforcement` exige `source_goal_id`; `extra_study` exige `extra_activity`. |
| R-GOAL-04 | `status = 'completed'` se e somente se `completed_at is not null` — `goal_completion_consistent`. |
| R-GOAL-05 | Uma meta de reforço nunca aponta para si mesma: `goal_source_not_self`. |
| R-GOAL-06 | O contexto (`student_id`, `teacher_id`) é repetido em `goals` porque a RLS precisa dele, e é a FK composta `goal_context_fk` que garante que a cópia não diverge. |
| R-GOAL-07 | O `GRANT UPDATE` em `goals` **omite** `student_id`, `teacher_id` e `study_plan_id`. A RLS sozinha permitiria mover uma meta entre dois alunos do mesmo professor; o grant por coluna não permite. |
| R-GOAL-08 | `DELETE` não é concedido em `goals` para `authenticated`. Remover é `UPDATE` em `deleted_at`. |

---

## Quem lê o quê

| Tela | Rota | Mostra |
|---|---|---|
| Visão geral do aluno | `/aluno` | Metas da semana selecionada, agrupadas por dia; `?semana=<n>` |
| Disciplinas | `/aluno/disciplinas` | Blocos do planejamento ativo, com desempenho e badge contra `subject_target` |
| Cadernos TEC | `/aluno/cadernos` | Blocos agrupados por disciplina |
| Meus alunos | `/professor` | Uma linha por vínculo vigente, com planejamento ativo e badge de acesso |
| Ficha do aluno | `/professor/alunos/:studentId` | Planejamentos, metas concluídas/total, desempenho oficial, semanas planejadas |
| Planejamentos | `/professor/planejamentos` | Todos os planejamentos dos alunos vinculados |
| Cadernos | `/professor/cadernos` | Blocos de um planejamento; `?plano=<uuid>` |

Semana inexistente, texto ou número negativo em `?semana=` caem na primeira
semana com metas, sem quebrar (R-GOAL-01 não é violada porque nada é escrito).
`?plano=` com id inválido cai no planejamento ativo, ou no primeiro.

---

## Superfície

| Camada | Item |
|---|---|
| Rotas | `/aluno`, `/aluno/disciplinas`, `/aluno/cadernos`, `/professor`, `/professor/alunos/:studentId`, `/professor/planejamentos`, `/professor/cadernos` |
| Leitura | `lib/data/student.ts` (`getActiveStudyPlan`, `getWeekGoals`, `getPlanWeeks`, `getStudyPlanBlocks`), `lib/data/teacher.ts` (`getMyStudents`, `getStudentSummary`, `getPlanProgress`, `getAllTeacherPlans`) |
| Domínio | `lib/domain/goals.ts` — rótulos, `formatMinutes`, `scorePercent`, `weekdayName` |
| Escrita | Só `apply_study_plan_batch` — ver [04](04-geracao-semanal.md) |
| Banco | `study_plans`, `study_plan_blocks`, `goals`, `study_plan_batches`, `student_teacher_links` |
| RPC | `activate_study_plan` — **existe e não é chamada por nenhuma tela** |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | As sete telas do aluno e as seis do professor renderizam sem erro de runtime nem de console | F-ALU-01, F-PROF-01 |
| CA-02 | `?semana=` com valor inexistente, texto ou negativo cai na primeira semana com metas | F-ALU-02 |
| CA-03 | `?plano=` com id inválido cai no planejamento ativo, sem quebrar | F-PROF-08 |
| CA-04 | Ficha de aluno inexistente, de aluno de outro professor ou com id malformado dá 404 | F-PROF-03 |
| CA-05 | A lista do professor mostra uma linha por vínculo vigente, com badge de acesso correto | F-PROF-02 |
| CA-06 | Aluno sem planejamento ativo vê "Nenhum planejamento ativo." e nenhum dado alheio | F-ALU-06 |
| CA-07 | Aluno inserindo meta em planejamento alheio recebe `42501` | F-ISO-02 |
| CA-08 | Professor renomeando planejamento alheio afeta **zero linhas**, sem erro — a RLS filtra em silêncio no UPDATE | F-ISO-02 |
| CA-09 | Gravar dois planejamentos `active` para o mesmo aluno viola `active_study_plan_uidx` | `supabase/tests/` |
| CA-10 | Duas metas na mesma `(plano, semana, dia, ordem)` violam `goal_position_uidx`; marcar a primeira como excluída libera a posição | `supabase/tests/` |

---

## Fora de escopo

- **Criar planejamento e cadastrar blocos pela tela.** Só o seed cria. É a
  lacuna nº 3 do comparativo.
- **Ativar planejamento pela tela.** `activate_study_plan` está pronta e não é
  chamada.
- **Editar, arquivar e excluir planejamento.** `/professor/planejamentos` só lê.
- **Concluir meta de teoria ou de estudo extra.** Nenhuma action escreve
  `goals.status` fora do caminho da bateria — é a lacuna nº 1 do comparativo, e
  faz três das cinco metas semanais do seed serem impossíveis de fechar.
- **Aluno criando disciplina, bloco ou meta.** Deliberado: a fronteira da
  escrita fica entre planejar e executar.
