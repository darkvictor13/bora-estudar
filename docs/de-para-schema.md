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

**Segunda revisão, 14/09/2026.** A migration foi aplicada num Postgres local e
atacada com dois professores e dois alunos de mentira, tudo dentro de uma
transação revertida. Sete ataques passaram, e a correção mudou constraint,
policy e grant — não coluna. O de-para de colunas continua valendo linha por
linha; o que mudou está em
[A segunda rodada de auditoria](#a-segunda-rodada-de-auditoria), e tem
consequência direta para o script de carga: as FKs compostas novas **recusam
linha do banco de origem que esteja inconsistente**, e o de-para agora traz as
consultas que encontram essas linhas antes de a carga rodar.

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

### `goal_entries.goal_id` ganhou FK, e ela é composta

No banco de origem, `registros.meta_id` apontava para `metas` sem restrição
nenhuma — um registro podia referenciar meta inexistente sem o banco reclamar.

A primeira rodada acrescentou `references goals(id)`. A segunda trocou por
`(goal_id, teacher_id, student_id) → goals (id, teacher_id, student_id)`: a FK
de coluna única garantia que a meta EXISTE, e não que ela é do aluno que está
lançando. Ver a seção da segunda rodada.

---

## Funções e gatilhos

| origem | destino |
|---|---|
| `is_professor()` | `is_teacher()` |
| `can_access_professor()` | `can_access_teacher()` |
| `can_access_profile()` | **removida** — a policy de `profiles` ficou inline, sem função no caminho |
| `set_updated_at()` | `set_updated_at()`, agora com `search_path` fixo |
| `bora_proteger_campos_administrativos_perfil()` | `protect_profile_admin_fields()`, agora em INSERT também |
| `proteger_identidade_lista_espera()` | `protect_waitlist_identity()`, com a mesma exceção de manutenção dos outros (`20260914190000`) |
| `bora_criar_perfil_novo_aluno()` | `app_private.create_profile_for_new_user()` (`20260914190000`) — **sem a regra do professor mais antigo** |
| `bora_private.validar_contexto_meta_bateria()` | `app_private.validate_session_goal_context()` |
| `bora_private.bloquear_recontextualizacao_meta_com_bateria()` | `app_private.freeze_goal_with_sessions()` |
| `bora_private.proteger_meta_questoes_bloco()` | `app_private.protect_goal_notebook_block()` |
| `bora_private.proteger_resultado_meta_questoes()` | `app_private.protect_goal_quiz_result()` |
| `bora_private.proteger_identidade_bloco_catalogo()` | `app_private.protect_notebook_identity()` |
| — | `public.is_teacher_of(uuid)` — **nova**, ver a segunda rodada |
| — | `public.has_active_access()` — **nova**, idem |
| — | `public.my_teacher()` — **nova**, idem |
| — | `app_private.protect_goal_planning_fields()` — **novo gatilho**, idem |

O schema `bora_private` virou `app_private`.

As quatro últimas não têm origem: nasceram na segunda rodada de auditoria, para
fechar buraco que o banco antigo também tinha e ninguém tinha nomeado.

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

**O gatilho de criação de perfil — RESOLVIDO em `20260914190000`.** Ficou de
fora da migration inicial, e o custo apareceu em staging: quem se cadastrava
ganhava usuário no GoTrue e nenhuma linha em `profiles`, confirmava o e-mail e
lia "Entramos, mas seu perfil não foi encontrado." no login.

`app_private.create_profile_for_new_user()` o repõe, e **não copia duas coisas**:

- **a regra do professor mais antigo.** O gatilho de origem anexava quem se
  cadastrava sem metadado ao professor de menor `created_at` — uma regra que
  dependia da ordem de criação das contas e entregava os dados de um aluno a
  quem por acaso tivesse entrado primeiro. O perfil passa a nascer **sem
  professor**, e a consequência é `waitlist.teacher_id` nulável: a lista de
  espera é a fila de quem ainda não tem um. Enquanto `user_role` não tiver
  'admin', essa fila é legível por qualquer professor — está dito na policy.
- **o `role` do metadado.** `raw_user_meta_data` é escrito pelo CLIENTE na
  chamada de cadastro: quem mandasse `{"role":"teacher"}` nasceria professor, e
  professor enxerga aluno. Toda conta nasce ALUNO e `pending`; promover entra na
  mesma fila de "liberar acesso precisa nascer como RPC", logo abaixo.

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

## A segunda rodada de auditoria

A primeira rodada comparou schema com schema. Esta aplicou a migration e
**atacou o resultado**: dois professores e dois alunos de mentira, cada ataque
rodando com o papel `authenticated` e o JWT da vítima ou do atacante, tudo numa
transação revertida. Sete passaram.

A causa era sempre a mesma. O CLAUDE.md diz que **contexto denormalizado é
protegido por FK composta**, e a regra valia em `quiz_sessions`,
`reinforcement_cycles` e `study_plan_notebooks` — as três tabelas que vieram do
motor de bateria. Nas outras, não valia. E policy não substitui essa FK: a
policy confere os IDs **da própria linha**, que são justamente os que quem
escreve escolheu; ela não tem como conferir que a linha **apontada** pertence ao
mesmo par.

### As FKs que viraram compostas

| tabela | antes | agora | o que passava sem ela |
|---|---|---|---|
| `goals` | `study_plan_id → study_plans(id)` | `(study_plan_id, teacher_id, student_id)` | o aluno reatribuía a própria meta a outro professor, e movia a meta para o planejamento de outro aluno |
| `goal_entries` | `goal_id → goals(id)` | `(goal_id, teacher_id, student_id)` | o aluno lançava minutos e acertos na meta de outro aluno |
| `class_students` | `class_id → classes(id)` | `(class_id, teacher_id)` | o professor matriculava aluno na turma de outro professor |
| `theory_catalog_subject_rules` | `catalog_id → theory_catalogs(id)` | `(catalog_id, teacher_id)` | o professor ocupava o par `(catalog_id, subject_key)` no catálogo de outro, e o dono batia em `duplicate key` sem enxergar a linha que estava no caminho |
| `theory_review_rules` | idem | `(catalog_id, teacher_id)` | idem, com `(catalog_id, subject_key, review_number)` |
| `theory_lessons` | idem | `(catalog_id, teacher_id)`, com `on delete set null (catalog_id)` | aula de um professor aparecia listada no catálogo de outro |
| `study_plan_theory_catalogs` | `study_plan_id` e `catalog_id` soltos | `(study_plan_id, teacher_id, student_id)` e `(catalog_id, teacher_id)` | o professor ligava o catálogo de outro ao próprio planejamento, e o aluno ficava com um catálogo que ele não tem permissão de ler |
| `theory_progress` | `study_plan_id → study_plans(id)` | `(study_plan_id, student_id)` | o aluno gravava progresso dentro do planejamento de outro aluno |
| `theory_reviews` | idem | `(study_plan_id, student_id)` | o `exists` que a policy fazia virou constraint |

São nove substituições, não nove acréscimos: o total de FKs continua 53.

Os alvos novos são quatro UNIQUE: `classes (id, teacher_id)`, `study_plans (id,
student_id)`, `goals (id, teacher_id, student_id)` e `theory_catalogs (id,
teacher_id)`. Nenhuma delas restringe mais que a PK — existem só para ser alvo
de FK, como `study_plans (id, teacher_id, student_id)` já era.

### O que mudou fora das FKs

- **`is_teacher_of()` em `study_plans` e `class_students`.** `teacher_id =
  auth.uid()` diz que quem escreve é o professor da linha, não que o aluno da
  linha é aluno dele. Qualquer professor criava planejamento para aluno alheio,
  e o aluno passava a ver esse planejamento, porque `study_plans_select` casa
  por `student_id`.
- **`has_active_access()` nas escritas do aluno** — metas (ramo do aluno),
  `goal_entries`, `theory_progress` e `theory_reviews`. Nenhuma policy olhava
  `access_status` nem `access_expires_at`. Fica no `WITH CHECK` e não no
  `USING`: o `WITH CHECK` levanta 42501, o `USING` filtraria em silêncio. A
  leitura continua aberta, então quem venceu ainda vê o próprio histórico, e
  `profiles` e `waitlist` ficam de fora — é por elas que o pendente pede acesso.
- **`GRANT UPDATE` por coluna** em `goals`, `goal_entries`, `study_plans`,
  `study_plan_notebooks`, `study_plan_theory_catalogs`, `theory_progress` e
  `theory_reviews`. É a defesa 2 do CLAUDE.md, que até aqui só `profiles`
  estava usando.
- **`protect_goal_planning_fields()`.** `goals_delete` decide pelo `type`, e
  `type` era atualizável pelo aluno: ele trocava a meta do professor para
  'extra' e apagava em seguida. O gatilho congela o `type` para quem não é o
  professor da meta, e o resto do planejamento só nas metas do professor — o
  aluno continua editando o estudo extra que ele mesmo lançou.
- **`coupons` saiu da API.** RLS ligada, zero policy, zero grant. `is_teacher()`
  não é "é admin" e a tabela não tem dono: todo professor lia o código e os
  meses de todos os cupons. O resgate e a administração passam pela RPC que o
  item 1 do cabeçalho da migration já previa.
- **`my_teacher()`.** `profiles_select` nunca deixou o aluno ler a linha do
  próprio professor — o professor tem `teacher_id` nulo — e o contrato da UI
  pede `teacherName`. A função devolve só `id` e `name`, em vez de abrir uma
  linha que carrega `plan`, `coupon_used` e `access_status`.

### O que ficou em aberto, de propósito

`theory_progress.theory_lesson_id` e `theory_reviews.theory_lesson_id` não são
amarrados ao catálogo do planejamento. Amarrar exige `teacher_id` nas duas
tabelas — coluna nova, que mudaria o de-para de colunas. O resíduo é o aluno
marcar progresso numa aula de outro professor **dentro do próprio
planejamento**: sujeira na linha dele, sem leitura de dado alheio, porque
`theory_lessons_select` continua exigindo `can_access_teacher`.

`catalog_blocks` continua com `using (true)` para qualquer autenticado. É
catálogo comum, sem conteúdo de aluno, e o professor precisa dele para montar
caderno.

### Antes de carregar dado: as sete consultas

Esta é a parte do de-para que a segunda rodada mudou de verdade. **Uma FK
composta recusa linha que a FK de coluna única aceitava**, e o banco de origem
rodou anos sem nenhuma delas — inclusive sem FK alguma em `registros.meta_id`.
Rode as consultas abaixo **contra o banco de origem** antes de escrever o
`INSERT ... SELECT`; cada uma devolve exatamente as linhas que a carga vai
rejeitar.

```sql
-- 1. metas cujo trio não bate com o planejamento  → goals_study_plan_fk
select m.id, m.professor_id, m.aluno_id, m.planejamento_id
  from metas m left join planejamentos p on p.id = m.planejamento_id
 where p.id is null or p.professor_id <> m.professor_id or p.aluno_id <> m.aluno_id;

-- 2. registros cujo trio não bate com a meta  → goal_entries_goal_fk
select r.id, r.meta_id from registros r left join metas m on m.id = r.meta_id
 where m.id is null or m.professor_id <> r.professor_id or m.aluno_id <> r.aluno_id;

-- 3. matrículas em turma de outro professor  → class_students_class_fk
select a.turma_id, a.aluno_id from aluno_turmas a left join turmas t on t.id = a.turma_id
 where t.id is null or t.professor_id <> a.professor_id;

-- 4. regras em catálogo de outro professor  → *_catalog_fk (três tabelas)
select 'regras_materia' as tabela, r.id from teoria_catalogo_regras_materia r
  left join teoria_catalogos c on c.id = r.catalogo_id
 where c.id is null or c.professor_id <> r.professor_id
union all
select 'regras_revisao', r.id from teoria_regras_revisao r
  left join teoria_catalogos c on c.id = r.catalogo_id
 where c.id is null or c.professor_id <> r.professor_id
union all
select 'aulas', a.id from teoria_aulas a
  left join teoria_catalogos c on c.id = a.catalogo_id
 where a.catalogo_id is not null and (c.id is null or c.professor_id <> a.professor_id);

-- 5. catálogo do planejamento, as duas pontas  → study_plan_theory_catalogs_*_fk
select t.id from teoria_planejamento_catalogos t
  left join planejamentos p on p.id = t.planejamento_id
  left join teoria_catalogos c on c.id = t.catalogo_id
 where p.id is null or p.professor_id <> t.professor_id or p.aluno_id <> t.aluno_id
    or c.id is null or c.professor_id <> t.professor_id;

-- 6. progresso e revisão fora do planejamento do aluno  → theory_*_study_plan_fk
select 'progresso' as tabela, g.id from teoria_progresso g
  left join planejamentos p on p.id = g.planejamento_id
 where p.id is null or p.aluno_id <> g.aluno_id
union all
select 'revisoes', v.id from teoria_revisoes v
  left join planejamentos p on p.id = v.planejamento_id
 where p.id is null or p.aluno_id <> v.aluno_id;

-- 7. planejamento e turma de aluno que não é do professor  → is_teacher_of
-- Não é FK: a policy só vale para `authenticated`, e a carga roda como
-- service_role. Mas uma linha assim fica inalcançável pela UI depois de migrada
-- — o professor não consegue mais editar o que ele mesmo criou.
select p.id, p.professor_id, p.aluno_id from planejamentos p
  join profiles a on a.id = p.aluno_id
 where a.professor_id is distinct from p.professor_id;
```

Linha que aparecer em 1 a 6 **não entra** — ou é corrigida na origem, ou fica de
fora com registro de qual consulta a pegou. A 7 entra, mas precisa de decisão:
ou o vínculo em `profiles.professor_id` é acertado, ou o planejamento vira
órfão de tela.

---

## Estado dos dois lados

Medido com a **mesma consulta** nos dois: o dump de origem foi aplicado num
banco descartável e interrogado pelo catálogo, em vez de contado no texto. A
primeira versão deste arquivo trazia dois números tirados de `grep` no dump, e
os dois estavam errados — 102 CHECKs (são 68) e 53 índices (são 85).

A coluna da direita foi medida depois da segunda rodada; a do meio é o que a
primeira rodada tinha produzido, para o diff ficar legível.

| | origem | 1ª rodada | agora |
|---|---|---|---|
| Tabelas / com RLS | 25 / 25 | 24 / 24 | 24 / 24 |
| Colunas | 326 | 294 | 294 |
| Policies | 79 | 63 | 62 |
| Tipos enumerados | 0 | 12 | 12 |
| CHECK constraints | 68 | 46 | 46 |
| Foreign keys | 49 | 53 | 53 |
| Índices | 85 | 81 | 92 |
| Views | 0 | 1 | 1 |
| Gatilhos | 12 | 27 | 28 |
| Funções (`public` + `app_private`) | 13 | 10 | 14 |
| Tabelas com `GRANT ALL` para `anon` | 20 | 0 | 0 |
| Funções sem `search_path` fixo | 1 | 0 | 0 |

A queda de 68 para 46 CHECKs não é perda de validação: cada
`CHECK (col = ANY (ARRAY[…]))` virou tipo enumerado.

O salto de 12 para 27 gatilhos é quase todo `set_updated_at`, que passou a
existir em toda tabela que tem a coluna. O 28º é
`protect_goal_planning_fields`.

Uma policy a menos é `coupons_select_teacher`, que saiu inteira.

Foreign keys ficaram em 53 porque as nove FKs compostas da segunda rodada
**substituíram** as de coluna única, uma a uma.

### Os onze índices a mais

+13 e −2, e nenhum dos dois lados é arbitrário.

Entraram quatro UNIQUE que existem só para ser alvo de FK composta — `classes
(id, teacher_id)`, `study_plans (id, student_id)`, `goals (id, teacher_id,
student_id)` e `theory_catalogs (id, teacher_id)` — e nove índices comuns, um
para cada FK composta nova mais `goals_plan_context_idx`.

Esses nove não são luxo. **Uma FK precisa de índice do lado que referencia, na
ordem das colunas da FK**: é ele que o Postgres usa quando a linha-pai é
apagada, e apagar um perfil cascateia por vinte tabelas. Os índices que já
existiam não serviam porque começam pela coluna errada —
`theory_progress_student_plan_idx` é `(student_id, study_plan_id)` e a FK é
`(study_plan_id, student_id)`.

Saíram dois de `goals`, pelo motivo oposto: `(study_plan_id)` era prefixo de
`goals_week_idx` e `(teacher_id)` era prefixo de
`goals_teacher_plan_week_status_idx`. Índice que é prefixo de outro não serve
nenhuma leitura a mais, e custa em toda escrita.

### Os quatro índices a menos que a primeira rodada já tinha tirado

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
