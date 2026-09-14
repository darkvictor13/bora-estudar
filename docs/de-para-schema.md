# De-para: banco de produção → migration inicial

Mapa entre o schema do projeto Supabase **`bora-estudar-concursos`**
(ref `chchoicpbzzjkpazdqau`, sa-east-1, Postgres 17.6) e
[`supabase/migrations/20260914150000_initial_schema.sql`](../supabase/migrations/20260914150000_initial_schema.sql).

Serve para duas coisas, e só para elas: escrever o script de migração de dados
quando ele existir, e conferir uma afirmação sobre "como era antes" sem abrir o
banco antigo.

## Como este arquivo foi produzido

Não foi escrito à mão. O lado esquerdo saiu de `supabase db dump --schema public`
contra o projeto real, em 14/09/2026; o lado direito, de `information_schema`
depois de aplicar a migration num Postgres local. O de-para foi conferido **nos
dois sentidos** por script: toda coluna de origem tem destino ou motivo de
remoção, e toda coluna nova tem origem ou marca de acréscimo. São 25 tabelas e
326 colunas de origem, 24 tabelas e 294 colunas de destino.

O que o mapa **não** cobre: dado. Nenhuma linha foi lida, copiada ou contada —
contar linha exige conexão direta ao banco, e este trabalho foi todo feito pela
API de gerenciamento.

---

## Tabelas

| origem | destino |
|---|---|
| `aluno_turmas` | `class_students` |
| `aulas` | `subject_lessons` |
| `baterias` | `quiz_sessions` |
| `blocos` | `subject_blocks` |
| `catalogo_blocos` | `catalog_blocks` |
| `cupons` | `coupons` |
| `disciplinas` | `subjects` |
| `lista_espera` | `waitlist` |
| `metas` | `goals` |
| `planejamento_cadernos` | `study_plan_notebooks` |
| `planejamentos` | `study_plans` |
| `profiles` | `profiles` |
| `questoes_resultados` | `quiz_session_questions` |
| `reforcos_ciclos` | `reinforcement_cycles` |
| `registros` | `goal_entries` |
| `teoria_aulas` | `theory_lessons` |
| `teoria_catalogo_regras_materia` | `theory_catalog_subject_rules` |
| `teoria_catalogos` | `theory_catalogs` |
| `teoria_planejamento_catalogos` | `study_plan_theory_catalogs` |
| `teoria_progresso` | `theory_progress` |
| `teoria_regras_materia` | `theory_subject_rules` |
| `teoria_regras_revisao` | `theory_review_rules` |
| `teoria_revisoes` | `theory_reviews` |
| `turmas` | `classes` |
| `backup_metas_gabriel_antes_zerar` | **não recriada** |

A que não veio era um backup manual, com 23 colunas todas anuláveis, nenhuma FK,
RLS ligada e **zero policies** — inacessível para qualquer usuário, visível só
por `service_role`. Se o conteúdo dela importa, ele sai de lá por exportação,
não por migration.

Três renomeações merecem explicação, porque o nome novo não é tradução do
antigo:

- **`registros` → `goal_entries`.** "Registro" sozinho não diz registro de quê;
  a tabela guarda o que o aluno lançou numa meta.
- **`planejamento_cadernos` → `study_plan_notebooks`.** Mantém "caderno", que é
  o vocabulário do produto, em vez de virar "block" e colidir com
  `subject_blocks`.
- **`questoes_resultados` → `quiz_session_questions`.** O nome antigo sugere
  agregado; a tabela é o ledger, uma linha por questão respondida.

---

## Tipos enumerados

O banco de origem não tinha um único enum: validava por CHECK sobre `text`. Os
valores abaixo são a tradução de cada `CHECK ... = ANY (ARRAY[…])`.

| enum novo | coluna de origem | valores |
|---|---|---|
| `user_role` | `profiles.tipo` | `professor`→`teacher`, `aluno`→`student` |
| `study_plan_status` | `planejamentos.status` | `ativo`→`active`, `pausado`→`paused`, `concluido`→`completed`, `arquivado`→`archived` |
| `goal_type` | `metas.tipo` | `teoria`→`theory`, `bloco`→`question_block`, `revisao`→`review`, `reforco`→`reinforcement`, `simulado`→`mock_exam`, `extra`→`extra` |
| `goal_status` | `metas.status` | `pendente`→`pending`, `em_andamento`→`in_progress`, `concluida`→`completed`, `pulada`→`skipped` |
| `quiz_session_status` | `baterias.status` | `em_andamento`→`in_progress`, `aguardando_tempo`→`awaiting_time`, `concluida`→`completed`, `cancelada`→`cancelled`, `anulada`→`voided` |
| `quiz_session_origin` | `baterias.origem` | `meta`→`goal`, `caderno_erros`→`error_notebook` |
| `question_outcome` | `questoes_resultados.resultado` | `acertou`→`correct`, `errou`→`incorrect` |
| `question_phase` | `questoes_resultados.tipo` | `principal`→`main`, `reforco`→`reinforcement`, `extra`→`extra` |
| `theory_stage` | `registros.fase_teoria` | `leitura_em_andamento`→`reading`, `pdf_concluido`→`pdf_done`, `questoes_em_andamento`→`questions_in_progress`, `questoes_concluidas`→`questions_done` |
| `theory_review_status` | `teoria_revisoes.status` | `pendente`→`pending`, `em_andamento`→`in_progress`, `concluida`→`completed` |

### Os dois que são proposta, não leitura

`profiles.status_acesso` e `lista_espera.status` eram `text` **sem CHECK**: o
schema não registra quais valores existem, e nenhum dado foi lido. Estes dois
enums são chute informado e **precisam ser conferidos antes de migrar dado** —
um valor fora da lista faz a conversão falhar.

| enum | default de origem | valores propostos |
|---|---|---|
| `access_status` | `'pendente'` | `pending`, `active`, `suspended`, `expired` |
| `waitlist_status` | `'aguardando'` | `waiting`, `released`, `declined` |

A conferência é uma consulta:

```sql
select distinct status_acesso from public.profiles;
select distinct status        from public.lista_espera;
```

---

## Colunas

Convenções que valem em toda tabela, e por isso não se repetem na nota de cada
linha:

| origem | destino |
|---|---|
| `professor_id` | `teacher_id` |
| `aluno_id` | `student_id` |
| `planejamento_id` | `study_plan_id` |
| `bloco_id` | `block_id` |
| `disciplina_chave` / `disciplina_nome` | `subject_key` / `subject_name` |
| `catalogo_chave` / `catalogo_id` | `catalog_key` / `catalog_id` |
| `nome` / `descricao` / `ativo` / `ordem` | `name` / `description` / `active` / `position` |

### `aluno_turmas` → `class_students`

| origem | destino | nota |
|---|---|---|
| `turma_id` | `class_id` |  |
| `aluno_id` | `student_id` |  |
| `professor_id` | `teacher_id` |  |
| `created_at` | `created_at` |  |

### `aulas` → `subject_lessons`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `disciplina_id` | `subject_id` |  |
| `ordem` | `position` |  |
| `nome` | `name` |  |
| `link` | `link` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `baterias` → `quiz_sessions`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `meta_id` | `goal_id` |  |
| `meta_origem_id` | `origin_goal_id` |  |
| `bloco_id` | `block_id` |  |
| `disciplina_chave` | `subject_key` |  |
| `catalogo_chave` | `catalog_key` |  |
| `sequencia_execucao` | `execution_order` |  |
| `numero_bateria` | `session_number` |  |
| `origem` | `origin` | vira o enum `quiz_session_origin` |
| `quantidade_principal` | `main_target` |  |
| `status` | `status` | vira o enum `quiz_session_status` |
| `principais_total` | — | removida: contador mantido à mão → `vw_quiz_session_performance` |
| `acertos_principais` | — | removida: idem |
| `erros_principais` | — | removida: idem |
| `reforcos_total` | — | removida: idem |
| `acertos_reforcos` | — | removida: idem |
| `erros_reforcos` | — | removida: idem |
| `extras_total` | — | removida: idem |
| `acertos_extras` | — | removida: idem |
| `erros_extras` | — | removida: idem |
| `tempo_minutos` | `duration_minutes` |  |
| `finalizacao_request_id` | `finish_request_id` |  |
| `finalizacao_payload` | `finish_payload` |  |
| `iniciada_em` | `started_at` |  |
| `finalizada_em` | `finished_at` |  |
| `cancelada_em` | `cancelled_at` |  |
| `concluida_em` | `completed_at` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |
| `anulada_em` | `voided_at` |  |
| `anulada_por` | `voided_by` |  |
| `motivo_anulacao` | `void_reason` |  |

### `blocos` → `subject_blocks`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `disciplina_id` | `subject_id` |  |
| `ordem` | `position` |  |
| `nome` | `name` |  |
| `link` | `link` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `catalogo_blocos` → `catalog_blocks`

| origem | destino | nota |
|---|---|---|
| `catalogo_chave` | `catalog_key` |  |
| `catalogo_id` | `catalog_id` |  |
| `catalogo_disciplina_chave` | `catalog_subject_key` |  |
| `disciplina_nome` | `subject_name` |  |
| `bloco_numero` | `block_number` |  |
| `bloco_nome` | `block_name` |  |
| `descricao` | `description` |  |
| `questoes_posicoes` | `question_slots` |  |
| `questoes_ativas` | `active_questions` |  |
| `topicos` | `topics` |  |
| `ativo` | `active` |  |
| `created_at` | `created_at` |  |
| — | `updated_at` | acrescentada: a tabela não tinha carimbo de atualização |

### `cupons` → `coupons`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `codigo` | `code` |  |
| `descricao` | `description` |  |
| `meses_liberacao` | `months_granted` |  |
| `ativo` | `active` |  |
| `criado_em` | `created_at` | renomeada para a convenção única |
| — | `updated_at` | acrescentada: a tabela não tinha carimbo de atualização |

### `disciplinas` → `subjects`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `nome` | `name` |  |
| `cor` | `color` |  |
| `peso` | `weight` |  |
| `meta_aproveitamento` | `target_score` |  |
| `ativo` | `active` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `lista_espera` → `waitlist`

| origem | destino | nota |
|---|---|---|
| `aluno_id` | `student_id` |  |
| `professor_id` | `teacher_id` |  |
| `nome` | `name` |  |
| `email` | `email` |  |
| `whatsapp` | `whatsapp` |  |
| `area_interesse` | `interest_area` |  |
| `concurso_foco` | `target_exam` |  |
| `fuso_horario` | `timezone` |  |
| `data_nascimento` | `birth_date` |  |
| `status` | `status` | vira o enum `waitlist_status` — **valores a confirmar** |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `metas` → `goals`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `semana_numero` | `week_number` |  |
| `dia_semana` | `weekday` |  |
| `dia_nome` | `weekday_name` |  |
| `ordem_dia` | `day_position` |  |
| `tipo` | `type` | vira o enum `goal_type` |
| `disciplina` | `subject` |  |
| `titulo` | `title` |  |
| `descricao` | `description` |  |
| `aula` | `lesson` |  |
| `bloco` | `block` |  |
| `tempo_previsto_minutos` | `planned_minutes` |  |
| `tempo_gasto_minutos` | `spent_minutes` |  |
| `questoes_feitas` | `questions_answered` |  |
| `acertos` | `correct_answers` |  |
| `status` | `status` | vira o enum `goal_status` |
| `data_prevista` | `due_on` |  |
| `concluida_em` | `completed_at` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |
| `questoes_bloco_id` | `notebook_block_id` |  |

### `planejamento_cadernos` → `study_plan_notebooks`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `disciplina_chave` | `subject_key` |  |
| `disciplina_nome` | `subject_name` |  |
| `disciplina_cor` | `subject_color` |  |
| `disciplina_meta` | `subject_target` |  |
| `caderno_chave` | `notebook_key` |  |
| `caderno_nome` | `notebook_name` |  |
| `caderno_link` | `notebook_link` |  |
| `total_questoes` | `total_questions` |  |
| `ordem_disciplina` | `subject_position` |  |
| `ordem_caderno` | `notebook_position` |  |
| `ativo` | `active` |  |
| `excluido` | `deleted` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |
| `bloco_id` | `block_id` |  |
| `catalogo_chave` | `catalog_key` |  |

### `planejamentos` → `study_plans`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `turma_id` | `class_id` |  |
| `nome` | `name` |  |
| `area` | `area` |  |
| `concurso_alvo` | `target_exam` |  |
| `fase` | `stage` |  |
| `modelo_estudo` | `study_model` |  |
| `metas_semanais` | `weekly_goals` |  |
| `data_inicio` | `starts_on` |  |
| `data_prova` | `exam_date` |  |
| `status` | `status` | vira o enum `study_plan_status` |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `profiles` → `profiles`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `nome` | `name` |  |
| `tipo` | `role` | vira o enum `user_role` |
| `professor_id` | `teacher_id` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |
| `status_acesso` | `access_status` | vira o enum `access_status` — **valores a confirmar** |
| `acesso_liberado_ate` | `access_expires_at` |  |
| `plano` | `plan` |  |
| `cupom_usado` | `coupon_used` |  |
| `origem_acesso` | `access_origin` |  |
| `criado_em` | — | removida: duplicata de `created_at`; só um dos pares era mantido por trigger |
| `atualizado_em` | — | removida: duplicata de `updated_at` |

### `questoes_resultados` → `quiz_session_questions`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `bateria_id` | `quiz_session_id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `bloco_id` | `block_id` |  |
| `questao_id` | `question_id` |  |
| `ordem_execucao` | `execution_order` |  |
| `rodada` | `round` |  |
| `resultado` | `outcome` | vira o enum `question_outcome` |
| `tipo` | `phase` | vira o enum `question_phase`; o nome novo diz o que a coluna guarda |
| `origem_questao_id` | `source_question_id` |  |
| `respondida_em` | `answered_at` |  |
| `created_at` | `created_at` |  |

### `reforcos_ciclos` → `reinforcement_cycles`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `bloco_id` | `block_id` |  |
| `disciplina_chave` | `subject_key` |  |
| `catalogo_chave` | `catalog_key` |  |
| `baterias_origem` | `source_session_ids` |  |
| `ciclo_chave` | `cycle_key` |  |
| `cutoff` | `cutoff` |  |
| `desempenho_origem` | `source_score` |  |
| `questoes_principais` | `main_questions` |  |
| `erros_origem` | `source_errors` |  |
| `questoes_unicas` | `unique_questions` |  |
| `resultado_reforco` | `reinforcement_result` |  |
| `request_id` | `request_id` |  |
| `concluido_em` | `completed_at` |  |
| `created_at` | `created_at` |  |

### `registros` → `goal_entries`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `meta_id` | `goal_id` | **ganhou FK**: no banco de origem apontava para `metas` sem restrição nenhuma |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `tempo_min` | `minutes` |  |
| `questoes` | `questions` |  |
| `acertos` | `correct_answers` |  |
| `erros` | `wrong_answers` | coluna gerada; segue gerada |
| `desempenho` | `score` | coluna gerada; segue gerada |
| `aula_manual` | `manual_lesson` |  |
| `fase_teoria` | `theory_stage` | vira o enum `theory_stage` |
| `observacao` | `note` |  |
| `created_at` | `created_at` |  |

### `teoria_aulas` → `theory_lessons`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `disciplina` | `subject` |  |
| `disciplina_chave` | `subject_key` |  |
| `codigo_aula` | `lesson_code` |  |
| `ordem` | `position` |  |
| `titulo` | `title` |  |
| `arquivo_pdf` | `pdf_file` |  |
| `pagina_inicio_teoria` | `theory_start_page` |  |
| `pagina_fim_teoria` | `theory_end_page` |  |
| `total_paginas_pdf` | `pdf_total_pages` |  |
| `inicio_questoes_finais` | `final_questions_start` |  |
| `tem_teoria` | `has_theory` |  |
| `ativo` | `active` |  |
| `observacao` | `note` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |
| `catalogo_id` | `catalog_id` |  |
| `cadernos_tec` | `tec_notebooks` |  |

### `teoria_catalogo_regras_materia` → `theory_catalog_subject_rules`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `catalogo_id` | `catalog_id` |  |
| `professor_id` | `teacher_id` |  |
| `disciplina` | `subject` |  |
| `disciplina_chave` | `subject_key` |  |
| `questoes_iniciais` | `initial_questions` |  |
| `ativo` | `active` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `teoria_catalogos` → `theory_catalogs`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `nome` | `name` |  |
| `chave` | `key` |  |
| `descricao` | `description` |  |
| `ativo` | `active` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `teoria_planejamento_catalogos` → `study_plan_theory_catalogs`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `catalogo_id` | `catalog_id` |  |
| `professor_id` | `teacher_id` |  |
| `aluno_id` | `student_id` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `teoria_progresso` → `theory_progress`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `aluno_id` | `student_id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `teoria_aula_id` | `theory_lesson_id` |  |
| `pagina_atual` | `current_page` |  |
| `teoria_concluida` | `theory_done` |  |
| `teoria_concluida_em` | `theory_done_at` |  |
| `questoes_iniciais_feitas` | `initial_questions_done` |  |
| `questoes_iniciais_concluidas` | `initial_questions_complete` |  |
| `questoes_iniciais_concluidas_em` | `initial_questions_complete_at` |  |
| `aula_concluida` | `lesson_done` |  |
| `aula_concluida_em` | `lesson_done_at` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `teoria_regras_materia` → `theory_subject_rules`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `disciplina` | `subject` |  |
| `disciplina_chave` | `subject_key` |  |
| `questoes_iniciais` | `initial_questions` |  |
| `ativo` | `active` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `teoria_regras_revisao` → `theory_review_rules`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `catalogo_id` | `catalog_id` |  |
| `professor_id` | `teacher_id` |  |
| `disciplina` | `subject` |  |
| `disciplina_chave` | `subject_key` |  |
| `numero_revisao` | `review_number` |  |
| `espacamento_aulas` | `lesson_spacing` |  |
| `questoes_minimas` | `minimum_questions` |  |
| `ativo` | `active` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

### `teoria_revisoes` → `theory_reviews`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `aluno_id` | `student_id` |  |
| `planejamento_id` | `study_plan_id` |  |
| `teoria_aula_id` | `theory_lesson_id` |  |
| `numero_revisao` | `review_number` |  |
| `questoes_minimas` | `minimum_questions` |  |
| `questoes_feitas` | `questions_answered` |  |
| `status` | `status` | vira o enum `theory_review_status` |
| `criada_em` | `created_at` | renomeada para a convenção única |
| `iniciada_em` | `started_at` |  |
| `concluida_em` | `completed_at` |  |
| `updated_at` | `updated_at` |  |

### `turmas` → `classes`

| origem | destino | nota |
|---|---|---|
| `id` | `id` |  |
| `professor_id` | `teacher_id` |  |
| `nome` | `name` |  |
| `descricao` | `description` |  |
| `created_at` | `created_at` |  |
| `updated_at` | `updated_at` |  |

---

## O que mudou de forma, não de nome

### Os nove contadores de `baterias`

`principais_total`, `acertos_principais`, `erros_principais` e os mesmos três
para reforço e extra saíram da tabela. O número passa a vir de
`vw_quiz_session_performance`, sobre o ledger.

A view expõe, por sessão: `main_total`, `main_correct`, `main_incorrect`,
`reinforcement_total`, `reinforcement_correct`, `reinforcement_incorrect`,
`extra_total`, `extra_correct`, `extra_incorrect`.

**Isso tem um custo, e ele é real.** Duas invariantes que eram `CHECK` na tabela
dependiam desses contadores e não cabem mais numa constraint, porque agora
exigem contar linhas de outra tabela:

- "entre 1 e `quantidade_principal` questões principais";
- "extras em múltiplo de 5".

As duas passam a ser responsabilidade da RPC que fecha a bateria — e é lá que
precisam de teste. Enquanto essa RPC não existir, ninguém escreve no ledger: não
há policy de INSERT.

### `profiles` tinha dois carimbos de cada

`created_at` **e** `criado_em`, `updated_at` **e** `atualizado_em`. Só o par em
inglês era mantido por trigger; o outro congelava no `default now()` e divergia
em silêncio. Ficou um par, e o trigger de `updated_at` agora existe em **toda**
tabela que tem a coluna — no banco de origem eram cinco de dezenove.

### Duas colunas nasceram

`coupons.updated_at` e `catalog_blocks.updated_at`. As duas tabelas não tinham
carimbo de atualização nenhum.

### `goal_entries.goal_id` ganhou FK

No banco de origem, `registros.meta_id` apontava para `metas` sem restrição
nenhuma — um registro podia referenciar meta inexistente sem o banco reclamar.

---

## Funções e gatilhos

| origem | destino |
|---|---|
| `is_professor()` | `is_teacher()` |
| `can_access_professor()` | `can_access_teacher()` |
| `can_access_profile()` | **removida** — a policy de `profiles` ficou inline, sem função no caminho |
| `set_updated_at()` | `set_updated_at()`, agora com `search_path` fixo |
| `bora_proteger_campos_administrativos_perfil()` | `protect_profile_admin_fields()`, agora em INSERT também |
| `proteger_identidade_lista_espera()` | `protect_waitlist_identity()` |
| `bora_private.validar_contexto_meta_bateria()` | `app_private.validate_session_goal_context()` |
| `bora_private.bloquear_recontextualizacao_meta_com_bateria()` | `app_private.freeze_goal_with_sessions()` |
| `bora_private.proteger_meta_questoes_bloco()` | `app_private.protect_goal_notebook_block()` |
| `bora_private.proteger_resultado_meta_questoes()` | `app_private.protect_goal_quiz_result()` |
| `bora_private.proteger_identidade_bloco_catalogo()` | `app_private.protect_notebook_identity()` |

O schema `bora_private` virou `app_private`.

### Uma mudança de lógica dentro dos gatilhos

Três funções decidiam "quem está agindo" com `session_user = 'postgres'`. Numa
conexão do PostgREST `session_user` é sempre `authenticator`, então a checagem
dependia de como a conexão foi aberta, não de quem estava agindo. Agora o sinal
é o papel do JWT:

```sql
v_actor text := coalesce(auth.jwt() ->> 'role', '');
v_privileged boolean := v_actor not in ('authenticated', 'anon');
```

Sem JWT (migration, `psql`, seed) passa; `service_role` passa; `authenticated` e
`anon` são usuário final e não passam.

`current_user` **não** serve no lugar de `session_user`, e o erro é fácil de
cometer: dentro de `SECURITY DEFINER` ele é o dono da função, então daria
privilegiado para todo mundo.

### `bora.bateria_rpc` virou `app.quiz_rpc`

É o sinal que a RPC de bateria liga na própria transação
(`set_config('app.quiz_rpc', '1', true)`) para poder escrever o resultado da
meta. Sem ele, nem aluno nem professor alteram aquele número. **A RPC que liga
esse sinal ainda não existe** — ver abaixo.

---

## O que não veio junto

Nada disto é esquecimento: são decisões, e cada uma tem um motivo.

**As seis RPCs de execução** — `iniciar_bateria`, `finalizar_bateria` (475
linhas), `anular_bateria`, `registrar_tempo_bateria`, `registrar_reforco_ciclo`
e `limpar_metas_pendentes_professor`. Elas carregam a lógica do modelo antigo,
inclusive a manutenção dos nove contadores que deixaram de existir. A execução
de bateria vai ser redesenhada, e as RPCs nascem com ela.

**O gatilho de criação de perfil.** `bora_criar_perfil_novo_aluno()` roda em
`auth.users`, fora do schema `public`, e é o que cria a linha em `profiles`
quando alguém se cadastra. **Sem ele, cadastro novo não ganha perfil.** Ele
também embute uma regra de negócio que precisa de decisão antes de ser copiada:
quando o metadado não indica professor, o aluno é anexado ao professor mais
antigo da base. É o primeiro item a resolver antes de qualquer tela de cadastro
funcionar.

**A liberação de acesso.** Com o grant por coluna em `profiles`, nem o dono nem
o professor alteram `role`, `access_status`, `access_expires_at`, `plan`,
`coupon_used`, `access_origin` ou `teacher_id` pelo PostgREST. Isso fecha a
escalação de privilégio e, de quebra, o professor promovendo aluno a professor —
mas significa que **liberar acesso precisa nascer como RPC**.

**O resgate de cupom.** `coupons` deixou de ser legível por qualquer um; só o
professor lê. O resgate, que no banco de origem não existia como RPC, também
precisa nascer assim — validando o código do lado do servidor, sem expor a
tabela.

---

## Estado dos dois lados

Medido com a **mesma consulta** nos dois: o dump de origem foi aplicado num
banco descartável e interrogado pelo catálogo, em vez de contado no texto. A
primeira versão deste arquivo trazia dois números tirados de `grep` no dump, e
os dois estavam errados — 102 CHECKs (são 68) e 53 índices (são 85).

| | origem | migration |
|---|---|---|
| Tabelas / com RLS | 25 / 25 | 24 / 24 |
| Policies | 79 | 63 |
| Tipos enumerados | 0 | 12 |
| CHECK constraints | 68 | 46 |
| Foreign keys | 49 | 53 |
| Índices | 85 | 81 |
| Views | 0 | 1 |
| Gatilhos | 12 | 27 |
| Tabelas com `GRANT ALL` para `anon` | 20 | 0 |
| Funções sem `search_path` fixo | 1 | 0 |

A queda de 68 para 46 CHECKs não é perda de validação: cada
`CHECK (col = ANY (ARRAY[…]))` virou tipo enumerado.

O salto de 12 para 27 gatilhos é quase todo `set_updated_at`, que passou a
existir em toda tabela que tem a coluna.

### Os quatro índices a menos

A comparação foi feita tabela a tabela, não só no total. Fora a tabela de
backup, a diferença está toda em `metas` → `goals`, e são quatro redundâncias do
banco de origem:

- `(planejamento_id)` estava indexado **duas vezes**, com nomes diferentes
  (`idx_metas_planejamento_id` e `metas_planejamento_id_idx`);
- `(planejamento_id, semana_numero, dia_semana, ordem_dia)` existia como índice
  comum **e** como índice único — o único já serve as duas leituras;
- `(professor_id, aluno_id, planejamento_id, semana_numero, status)` e
  `(professor_id, planejamento_id, aluno_id, semana_numero, status)` são as
  mesmas cinco colunas em ordem trocada;
- `(professor_id, planejamento_id, aluno_id, semana_numero, dia_semana,
  ordem_dia)`, de seis colunas, ficou coberto pelo único de slot mais o de
  contexto. **Esta é a única das quatro que é julgamento, não dedução** — se
  alguma consulta depender exatamente desse prefixo, ela volta.

Duas ausências encontradas nessa comparação **eram perda de verdade**, e foram
repostas antes deste arquivo existir:

| índice | invariante |
|---|---|
| `study_plans_name_per_student_uidx` | um planejamento por aluno com o mesmo nome |
| `quiz_session_questions_one_reinforcement_per_source_uidx` | uma correlata por questão de origem, na mesma bateria |
