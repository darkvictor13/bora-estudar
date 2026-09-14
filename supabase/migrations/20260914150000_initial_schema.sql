-- Schema inicial da reimplementação.
--
-- Reproduz as 24 tabelas do projeto `bora-estudar-concursos`
-- (ref chchoicpbzzjkpazdqau), com os problemas da auditoria corrigidos e os
-- identificadores em inglês, como manda o CLAUDE.md.
--
-- O QUE MUDOU EM RELAÇÃO AO BANCO DE ORIGEM
--
--  1. `cupons` deixou de ser público. A policy antiga era
--     `FOR SELECT USING (ativo = true)` sem cláusula `TO`, o que vale para o
--     papel `public` — qualquer requisição anônima lia código e meses de
--     liberação. Agora só o professor lê, e o resgate precisa nascer como RPC
--     `SECURITY DEFINER` (não existe neste arquivo: não existia no banco).
--
--  2. Nenhum `GRANT ALL`, e nada para `anon`. Vinte das 25 tabelas tinham
--     `GRANT ALL ... TO anon`, com a RLS como barreira única — e `GRANT ALL`
--     inclui TRUNCATE, que a RLS não filtra. Aqui cada grant é explícito, e
--     `profiles` recebe grant POR COLUNA.
--
--  3. `search_path` fixo em `''` em toda função. No banco de origem três
--     funções `SECURITY DEFINER` usavam `'public'` — e eram justamente as que
--     decidem autorização — e `set_updated_at` não tinha nenhum.
--
--  4. `REVOKE EXECUTE ... FROM PUBLIC` em todas. Eram 13 funções para 9
--     revokes; `is_professor()` e `set_updated_at()` ficavam executáveis por
--     `anon`.
--
--  5. A proteção dos campos administrativos de `profiles` passou a valer no
--     INSERT também. Antes o trigger era só `BEFORE UPDATE`, e a policy de
--     INSERT não olhava coluna nenhuma.
--
--  6. Policies deduplicadas. `metas` tinha 16 policies — quatro por comando,
--     em três gerações de nomenclatura — e policies permissivas somam por OR:
--     a mais larga vencia e as outras três só escondiam qual regra valia.
--     `profiles` tinha 3 SELECT; `planejamentos` e `planejamento_cadernos`, 2.
--
--  7. Os nove contadores de `baterias` (acertos_principais, erros_extras, …)
--     saíram. O número agora vem de `vw_quiz_session_performance`, sobre o
--     ledger. Ver a nota em "Consequência" no bloco da view.
--
--  8. Um carimbo de tempo por linha. `profiles` tinha `created_at` E
--     `criado_em`, `updated_at` E `atualizado_em`, com só um dos pares
--     mantido por trigger. E o trigger de `updated_at` agora existe em TODA
--     tabela que tem a coluna — antes eram cinco de dezenove.
--
--  9. Tipos enumerados no lugar de `text` + CHECK. O banco de origem não
--     tinha um único enum; validava por CHECK, o que funciona no banco mas
--     chega ao TypeScript como `string`.
--
-- 10. `backup_metas_gabriel_antes_zerar` não foi recriada. Era backup manual
--     de dados de um aluno, parado em produção, com RLS ligada e zero
--     policies. Se o conteúdo dela importa, ele precisa sair de lá por
--     exportação, não por migration.
--
-- SEGUNDA RODADA DE AUDITORIA — O QUE ESTA VERSÃO DO ARQUIVO CORRIGE
--
-- A primeira rodada olhou o banco de origem. Esta olhou o resultado: o schema
-- acima foi aplicado num Postgres local e atacado com dois professores e dois
-- alunos de mentira. Sete ataques passaram, e a causa era sempre a mesma — a
-- regra "contexto denormalizado é protegido por FK composta" valia em
-- `quiz_sessions`, `reinforcement_cycles` e `study_plan_notebooks`, e não
-- valia nas outras. A policy sozinha confere os IDs DA PRÓPRIA LINHA; ela não
-- tem como conferir que a linha APONTADA pertence ao mesmo par.
--
-- 11. `goals` ganhou FK composta para `study_plans (id, teacher_id,
--     student_id)`. Sem ela, o aluno reatribuía a própria meta a outro
--     professor (que passava a vê-la em `goals_select`) e movia a meta para o
--     planejamento de outro aluno — as duas coisas por UPDATE direto, porque
--     `goals_update` aceita `student_id = auth.uid()` e nada mais olhava.
--
-- 12. `goal_entries` ganhou FK composta para `goals (id, teacher_id,
--     student_id)`. A FK de coluna única, acrescentada na primeira rodada,
--     garantia que a meta EXISTE; não que ela é do aluno que está lançando.
--     Um aluno gravava minutos e acertos na meta de outro.
--
-- 13. `class_students`, `theory_catalog_subject_rules`, `theory_review_rules`,
--     `theory_lessons`, `study_plan_theory_catalogs`, `theory_progress` e
--     `theory_reviews` ganharam a FK composta equivalente. A pior delas era
--     `theory_catalog_subject_rules`: como a UNIQUE é `(catalog_id,
--     subject_key)` e o `catalog_id` não era conferido, um professor ocupava o
--     slot no catálogo de OUTRO professor e o dono do catálogo não conseguia
--     mais criar a própria regra.
--
-- 14. `is_teacher_of()`, nas policies de `study_plans` e `class_students`.
--     `teacher_id = auth.uid()` diz que quem escreve é o professor da linha,
--     não que o aluno da linha é aluno dele: qualquer professor criava
--     planejamento e enfiava aluno alheio na própria turma.
--
-- 15. `GRANT UPDATE` por coluna em `goals`, `goal_entries`, `study_plans`,
--     `study_plan_notebooks`, `study_plan_theory_catalogs`, `theory_progress`
--     e `theory_reviews` — é a defesa 2 do CLAUDE.md, que só `profiles`
--     estava usando. As colunas de contexto ficam fora do grant.
--
-- 16. `protect_goal_planning_fields()`. `goals_delete` decide pelo `type`, e
--     `type` era atualizável pelo aluno: ele trocava a meta do professor para
--     'extra' e apagava em seguida. O gatilho congela o planejamento da meta
--     para quem não é o professor dela, e o `type` para todo mundo que não
--     seja o professor.
--
-- 17. `has_active_access()` nas escritas do aluno. Nenhuma policy olhava
--     `access_status` nem `access_expires_at` — aluno vencido ou pendente
--     continuava lançando registro e progresso pela API, com o bloqueio
--     existindo só no frontend. Fica no WITH CHECK, e não no USING, de
--     propósito: WITH CHECK levanta 42501, USING filtraria em silêncio.
--
-- 18. `coupons` deixou de ser legível pela API. `is_teacher()` não é "é
--     admin", e a tabela não tem dono — todo professor lia o código e os meses
--     de todos os cupons. Sem policy e sem grant: o resgate e a administração
--     passam pela RPC que o item 1 já previa.
--
-- 19. `my_teacher()`. `profiles_select` nunca deixou o aluno ler o próprio
--     professor (o professor tem `teacher_id` nulo), e o contrato da UI pede
--     `teacherName`. Uma função `SECURITY DEFINER` devolve só `id` e `name`,
--     em vez de abrir a linha inteira do professor — que carrega `plan`,
--     `coupon_used` e `access_status`.
--
-- 20. Dois índices redundantes a menos em `goals`: `(study_plan_id)` era
--     prefixo de `goals_week_idx` e `(teacher_id)` era prefixo de
--     `goals_teacher_plan_week_status_idx`.
--
-- O QUE FICOU DE FORA, DE PROPÓSITO
--
-- `catalog_blocks` continua com `using (true)`: é catálogo comum, sem conteúdo
-- de aluno nenhum, e o professor precisa dele para montar caderno.
--
-- `theory_progress.theory_lesson_id` e `theory_reviews.theory_lesson_id` ainda
-- não são amarrados ao catálogo do planejamento. Amarrar exige `teacher_id`
-- nas duas tabelas, que é coluna nova e muda o de-para. O risco é o aluno
-- marcar progresso numa aula de outro professor DENTRO DO PRÓPRIO
-- planejamento: sujeira na linha dele, sem leitura de dado alheio, porque
-- `theory_lessons_select` continua exigindo `can_access_teacher`.
--
-- DUAS DECISÕES QUE PRECISAM SER CONFERIDAS CONTRA OS DADOS REAIS
--
-- `access_status` e `waitlist_status` viraram enum, mas as colunas de origem
-- (`profiles.status_acesso`, `lista_espera.status`) eram texto SEM CHECK: o
-- banco não diz quais valores existem. Os valores abaixo são proposta — o de
-- `access_status` segue o vocabulário que o repositório já usava, e o de
-- `waitlist_status` parte do único valor provável ('aguardando', usado nas
-- policies). Confira contra um `select distinct` antes de migrar dado.

create schema if not exists app_private;

comment on schema app_private is
  'Funções de gatilho que impõem invariantes. Nada aqui é API: sem grant para anon ou authenticated.';

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('teacher', 'student');

-- PROPOSTA: a coluna de origem era texto sem CHECK. Ver o cabeçalho.
create type public.access_status as enum ('pending', 'active', 'suspended', 'expired');

-- PROPOSTA: idem. 'waiting' é o 'aguardando' que as policies de origem citam.
create type public.waitlist_status as enum ('waiting', 'released', 'declined');

create type public.study_plan_status as enum ('active', 'paused', 'completed', 'archived');

create type public.goal_type as enum
  ('theory', 'question_block', 'review', 'reinforcement', 'mock_exam', 'extra');

create type public.goal_status as enum ('pending', 'in_progress', 'completed', 'skipped');

create type public.quiz_session_status as enum
  ('in_progress', 'awaiting_time', 'completed', 'cancelled', 'voided');

create type public.quiz_session_origin as enum ('goal', 'error_notebook');

create type public.question_outcome as enum ('correct', 'incorrect');

create type public.question_phase as enum ('main', 'reinforcement', 'extra');

create type public.theory_stage as enum
  ('reading', 'pdf_done', 'questions_in_progress', 'questions_done');

create type public.theory_review_status as enum ('pending', 'in_progress', 'completed');

-- ---------------------------------------------------------------------------
-- Função de carimbo
--
-- As duas de autorização vêm depois das tabelas: função SQL é validada na
-- criação, e `public.profiles` ainda não existe aqui. Todas com
-- `set search_path = ''` — uma função SECURITY DEFINER que resolve nome pelo
-- search_path do chamador é o caminho clássico de escalação, e as três de
-- autorização do banco de origem usavam 'public'.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text,
  role              public.user_role not null default 'student',
  teacher_id        uuid references public.profiles(id) on delete set null,
  access_status     public.access_status not null default 'pending',
  access_expires_at timestamptz,
  plan              text,
  coupon_used       text,
  access_origin     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.profiles.role is
  'Campo administrativo: não é atualizável por `authenticated` (ver os grants por coluna no fim do arquivo) e é congelado pelo trigger de proteção.';

-- ---------------------------------------------------------------------------
-- Turmas
-- ---------------------------------------------------------------------------

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Alvo da FK composta de class_students.
  unique (id, teacher_id)
);

create table public.class_students (
  class_id   uuid not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id),
  -- Composta, e não `references classes(id)`: a policy de INSERT confere que
  -- `teacher_id` é quem está escrevendo, mas não conferia de quem é a TURMA —
  -- um professor matriculava aluno na turma de outro.
  constraint class_students_class_fk
    foreign key (class_id, teacher_id)
    references public.classes (id, teacher_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Disciplinas do professor, e o que pende delas
-- ---------------------------------------------------------------------------

create table public.subjects (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  color        text default '#38bdf8',
  weight       integer not null default 1,
  target_score integer not null default 80,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.subject_blocks (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  position   integer default 0,
  name       text not null,
  link       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subject_lessons (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  position   integer default 0,
  name       text not null,
  link       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- coupons
--
-- Sem leitura pública. Era a única tabela que vazava dado para requisição
-- anônima: `GET /rest/v1/cupons` com a chave anon devolvia código e meses de
-- liberação.
-- ---------------------------------------------------------------------------

create table public.coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  description    text,
  months_granted integer not null default 3,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint coupons_months_granted_check check (months_granted > 0)
);

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------

create table public.waitlist (
  student_id    uuid primary key references public.profiles(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  email         text not null,
  whatsapp      text not null,
  interest_area text not null,
  target_exam   text not null,
  timezone      text not null default 'America/Sao_Paulo',
  birth_date    date,
  status        public.waitlist_status not null default 'waiting',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint waitlist_name_check          check (char_length(btrim(name)) between 3 and 160),
  constraint waitlist_email_check         check (char_length(btrim(email)) between 5 and 320),
  constraint waitlist_whatsapp_check      check (char_length(btrim(whatsapp)) between 8 and 30),
  constraint waitlist_interest_area_check check (char_length(btrim(interest_area)) between 2 and 120),
  constraint waitlist_target_exam_check   check (char_length(btrim(target_exam)) between 2 and 180),
  constraint waitlist_timezone_check      check (char_length(btrim(timezone)) between 3 and 80)
);

-- ---------------------------------------------------------------------------
-- Catálogo de blocos
-- ---------------------------------------------------------------------------

create table public.catalog_blocks (
  catalog_key        text primary key,
  catalog_id         text not null,
  catalog_subject_key text not null,
  subject_name       text not null,
  block_number       smallint not null,
  block_name         text not null,
  description        text,
  question_slots     integer not null,
  active_questions   integer not null,
  topics             integer not null,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint catalog_blocks_block_number_check   check (block_number > 0),
  constraint catalog_blocks_question_slots_check check (question_slots >= 0),
  constraint catalog_blocks_active_questions_check
    check (active_questions >= 0 and active_questions <= question_slots),
  constraint catalog_blocks_topics_check         check (topics >= 0),
  constraint catalog_blocks_no_blanks_check check (
    btrim(catalog_key) <> '' and btrim(catalog_id) <> ''
    and btrim(catalog_subject_key) <> '' and btrim(subject_name) <> ''
    and btrim(block_name) <> ''
  ),
  unique (catalog_key, catalog_subject_key),
  unique (catalog_id, catalog_subject_key, block_number)
);

-- ---------------------------------------------------------------------------
-- study_plans
-- ---------------------------------------------------------------------------

create table public.study_plans (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  class_id     uuid references public.classes(id) on delete set null,
  name         text not null,
  area         text not null default 'Fiscal',
  target_exam  text,
  stage        text not null default 'Pré-edital',
  study_model  text not null default 'Avanço progressivo',
  weekly_goals integer not null default 24,
  starts_on    date not null default current_date,
  exam_date    date,
  status       public.study_plan_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Alvo das FKs compostas que carregam o contexto denormalizado.
  unique (id, teacher_id, student_id),
  -- Alvo das FKs de theory_progress e theory_reviews, que não têm teacher_id.
  unique (id, student_id)
);

-- ---------------------------------------------------------------------------
-- study_plan_notebooks (os cadernos do planejamento)
-- ---------------------------------------------------------------------------

create table public.study_plan_notebooks (
  id                uuid primary key default gen_random_uuid(),
  study_plan_id     uuid not null references public.study_plans(id) on delete cascade,
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  subject_key       text not null,
  subject_name      text not null,
  subject_color     text not null default '#5B6B85',
  subject_target    integer not null default 80,
  notebook_key      text not null,
  notebook_name     text not null,
  notebook_link     text not null default '',
  total_questions   integer not null default 0,
  subject_position  integer not null default 0,
  notebook_position integer not null default 0,
  active            boolean not null default true,
  deleted           boolean not null default false,
  block_id          uuid not null default gen_random_uuid(),
  catalog_key       text references public.catalog_blocks(catalog_key) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint study_plan_notebooks_subject_target_check
    check (subject_target between 0 and 100),
  constraint study_plan_notebooks_total_questions_check check (total_questions >= 0),
  constraint study_plan_notebooks_catalog_key_not_blank
    check (catalog_key is null or btrim(catalog_key) <> ''),
  unique (study_plan_id, notebook_key),
  unique (block_id),
  -- Alvos das FKs compostas de goals, quiz_sessions e reinforcement_cycles.
  unique (teacher_id, student_id, study_plan_id, block_id),
  unique (teacher_id, student_id, study_plan_id, block_id, subject_key, catalog_key)
);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------

create table public.goals (
  id                uuid primary key default gen_random_uuid(),
  study_plan_id     uuid not null,
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  week_number       integer not null default 1,
  weekday           integer not null,
  weekday_name      text not null,
  day_position      integer not null default 1,
  type              public.goal_type not null,
  subject           text not null,
  title             text not null,
  description       text,
  lesson            text,
  block             text,
  planned_minutes   integer not null default 60,
  spent_minutes     integer,
  questions_answered integer default 0,
  correct_answers   integer default 0,
  status            public.goal_status not null default 'pending',
  due_on            date,
  completed_at      timestamptz,
  notebook_block_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint goals_weekday_check check (weekday between 1 and 7),
  constraint goals_notebook_block_type_check
    check (notebook_block_id is null or type = 'question_block'),

  -- Alvo da FK composta de goal_entries.
  unique (id, teacher_id, student_id),

  -- Composta, e não `references study_plans(id)`. Com a FK de coluna única, o
  -- aluno reatribuía a meta a outro professor e movia a meta para o
  -- planejamento de outro aluno: `goals_update` aceita a linha por
  -- `student_id = auth.uid()`, e nada conferia que o trio continuava batendo
  -- com o planejamento. É a mesma FK que quiz_sessions já usava.
  constraint goals_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete cascade,

  constraint goals_notebook_block_fk
    foreign key (teacher_id, student_id, study_plan_id, notebook_block_id)
    references public.study_plan_notebooks (teacher_id, student_id, study_plan_id, block_id)
    on delete restrict
);

-- ---------------------------------------------------------------------------
-- goal_entries (os registros de estudo de uma meta)
-- ---------------------------------------------------------------------------

create table public.goal_entries (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  minutes       integer not null default 0,
  questions     integer not null default 0,
  correct_answers integer not null default 0,
  wrong_answers integer generated always as (greatest(questions - correct_answers, 0)) stored,
  score         numeric generated always as (
                  case when questions > 0
                       then round((correct_answers::numeric / questions::numeric) * 100, 2)
                       else 0 end
                ) stored,
  manual_lesson text,
  theory_stage  public.theory_stage,
  note          text,
  created_at    timestamptz not null default now(),

  -- Composta, e não `references goals(id)`. A FK de coluna única garantia que
  -- a meta EXISTE; não que ela é do aluno que está lançando. Com ela sozinha,
  -- um aluno gravava minutos e acertos na meta de outro — a policy só exigia
  -- `student_id = auth.uid()`, e `student_id` é da PRÓPRIA linha.
  constraint goal_entries_goal_fk
    foreign key (goal_id, teacher_id, student_id)
    references public.goals (id, teacher_id, student_id) on delete cascade
);

-- `goal_id` não tinha FK no banco de origem. Aqui tem, e é composta.
comment on column public.goal_entries.goal_id is
  'FK acrescentada: no banco de origem esta coluna apontava para metas sem restrição nenhuma. É composta com teacher_id e student_id — a FK de coluna única deixava um aluno lançar registro na meta de outro.';

-- ---------------------------------------------------------------------------
-- quiz_sessions (as baterias)
--
-- Sem os nove contadores. Ver `vw_quiz_session_performance`.
-- ---------------------------------------------------------------------------

create table public.quiz_sessions (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete restrict,
  student_id        uuid not null references public.profiles(id) on delete restrict,
  study_plan_id     uuid not null,
  goal_id           uuid references public.goals(id) on delete set null,
  origin_goal_id    uuid,
  block_id          uuid not null,
  subject_key       text not null,
  catalog_key       text not null,
  execution_order   integer not null,
  session_number    integer,
  origin            public.quiz_session_origin not null default 'goal',
  main_target       smallint not null default 15,
  status            public.quiz_session_status not null default 'in_progress',
  duration_minutes  integer,
  finish_request_id uuid unique,
  finish_payload    jsonb,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  cancelled_at      timestamptz,
  completed_at      timestamptz,
  voided_at         timestamptz,
  voided_by         uuid references public.profiles(id) on delete restrict,
  void_reason       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quiz_sessions_execution_order_check check (execution_order > 0),
  constraint quiz_sessions_session_number_check
    check (session_number is null or session_number > 0),
  constraint quiz_sessions_main_target_check check (main_target between 1 and 15),
  constraint quiz_sessions_duration_check
    check (duration_minutes is null or duration_minutes > 0),
  constraint quiz_sessions_goal_snapshot_check
    check (goal_id is null or origin_goal_id = goal_id),
  constraint quiz_sessions_origin_goal_check check (
    (origin = 'goal' and origin_goal_id is not null and session_number is not null
      and ((status in ('in_progress', 'awaiting_time') and goal_id is not null)
           or status in ('completed', 'cancelled', 'voided')))
    or (origin = 'error_notebook' and goal_id is null and origin_goal_id is null
        and session_number is null)
  ),
  -- Máquina de estados. As cláusulas que contavam questão saíram junto com os
  -- contadores; ver a nota da view.
  constraint quiz_sessions_state_check check (
    (status = 'in_progress' and finished_at is null and cancelled_at is null
      and completed_at is null and duration_minutes is null
      and finish_request_id is null and finish_payload is null
      and voided_at is null and voided_by is null)
    or (status = 'awaiting_time' and finished_at is not null and cancelled_at is null
      and completed_at is null and duration_minutes is null
      and finish_request_id is not null and finish_payload is not null
      and voided_at is null and voided_by is null)
    or (status = 'completed' and finished_at is not null and cancelled_at is null
      and completed_at is not null and duration_minutes is not null
      and finish_request_id is not null and finish_payload is not null
      and voided_at is null and voided_by is null)
    or (status = 'cancelled' and finished_at is not null and cancelled_at is not null
      and completed_at is null and duration_minutes is null
      and finish_request_id is not null and finish_payload is not null
      and voided_at is null and voided_by is null)
    or (status = 'voided' and finished_at is not null and cancelled_at is null
      and finish_request_id is not null and finish_payload is not null
      and voided_at is not null and voided_by is not null)
  ),

  unique (student_id, study_plan_id, block_id, execution_order),
  -- Alvo da FK composta do ledger.
  unique (id, teacher_id, student_id, study_plan_id, block_id),

  constraint quiz_sessions_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete restrict,
  constraint quiz_sessions_notebook_fk
    foreign key (teacher_id, student_id, study_plan_id, block_id, subject_key, catalog_key)
    references public.study_plan_notebooks
      (teacher_id, student_id, study_plan_id, block_id, subject_key, catalog_key)
    on delete restrict
);

-- ---------------------------------------------------------------------------
-- quiz_session_questions — o ledger
-- ---------------------------------------------------------------------------

create table public.quiz_session_questions (
  id                 uuid primary key default gen_random_uuid(),
  quiz_session_id    uuid not null,
  teacher_id         uuid not null,
  student_id         uuid not null,
  study_plan_id      uuid not null,
  block_id           uuid not null,
  question_id        bigint not null,
  execution_order    integer not null,
  round              smallint not null default 0,
  outcome            public.question_outcome not null,
  phase              public.question_phase not null,
  source_question_id bigint,
  answered_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),

  constraint quiz_session_questions_question_id_check check (question_id > 0),
  constraint quiz_session_questions_execution_order_check check (execution_order > 0),
  constraint quiz_session_questions_round_check check (round >= 0),
  constraint quiz_session_questions_source_check
    check (source_question_id is null or source_question_id > 0),
  constraint quiz_session_questions_phase_round_check check (
    (phase = 'main' and round = 0 and source_question_id is null)
    or (phase = 'extra' and round > 0 and source_question_id is null)
    or (phase = 'reinforcement' and source_question_id is not null
        and source_question_id <> question_id)
  ),

  unique (quiz_session_id, execution_order),
  unique (quiz_session_id, question_id),

  constraint quiz_session_questions_session_fk
    foreign key (quiz_session_id, teacher_id, student_id, study_plan_id, block_id)
    references public.quiz_sessions (id, teacher_id, student_id, study_plan_id, block_id)
    on delete restrict,
  constraint quiz_session_questions_source_fk
    foreign key (quiz_session_id, source_question_id)
    references public.quiz_session_questions (quiz_session_id, question_id)
    on delete restrict deferrable initially deferred
);

comment on table public.quiz_session_questions is
  'Ledger append-only: a única fonte de desempenho. Escrita só por RPC — não há policy de INSERT, UPDATE ou DELETE.';

-- ---------------------------------------------------------------------------
-- reinforcement_cycles
-- ---------------------------------------------------------------------------

create table public.reinforcement_cycles (
  id                  uuid primary key default gen_random_uuid(),
  teacher_id          uuid not null,
  student_id          uuid not null,
  study_plan_id       uuid not null,
  block_id            uuid not null,
  subject_key         text not null,
  catalog_key         text not null,
  source_session_ids  uuid[] not null,
  cycle_key           text not null,
  cutoff              timestamptz not null,
  source_score        smallint not null,
  main_questions      integer not null,
  source_errors       integer not null,
  unique_questions    integer not null,
  reinforcement_result jsonb not null,
  request_id          uuid not null unique,
  completed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),

  constraint reinforcement_cycles_source_score_check check (source_score between 0 and 100),
  constraint reinforcement_cycles_main_questions_check check (main_questions > 0),
  constraint reinforcement_cycles_source_errors_check check (source_errors >= 0),
  constraint reinforcement_cycles_unique_questions_check check (unique_questions >= 0),
  constraint reinforcement_cycles_three_sessions_check
    check (cardinality(source_session_ids) = 3),

  unique (student_id, study_plan_id, block_id, cycle_key),

  constraint reinforcement_cycles_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete restrict,
  constraint reinforcement_cycles_notebook_fk
    foreign key (teacher_id, student_id, study_plan_id, block_id, subject_key, catalog_key)
    references public.study_plan_notebooks
      (teacher_id, student_id, study_plan_id, block_id, subject_key, catalog_key)
    on delete restrict
);

-- ---------------------------------------------------------------------------
-- Teoria
-- ---------------------------------------------------------------------------

create table public.theory_catalogs (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  key         text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (teacher_id, key),
  -- Alvo das FKs compostas das quatro tabelas que apontam para o catálogo.
  unique (id, teacher_id)
);

create table public.theory_subject_rules (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  subject           text not null,
  subject_key       text not null,
  initial_questions integer not null default 15,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint theory_subject_rules_initial_questions_check
    check (initial_questions between 1 and 200),
  unique (teacher_id, subject_key)
);

create table public.theory_catalog_subject_rules (
  id                uuid primary key default gen_random_uuid(),
  catalog_id        uuid not null,
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  subject           text not null,
  subject_key       text not null,
  initial_questions integer not null default 15,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint theory_catalog_subject_rules_initial_questions_check
    check (initial_questions between 1 and 200),
  unique (catalog_id, subject_key),
  -- Composta. Era a pior das FKs de coluna única: a UNIQUE acima é por
  -- catálogo, e o catálogo não era conferido contra quem escreve. Um professor
  -- criava a regra dentro do catálogo de OUTRO, ocupava o par
  -- (catalog_id, subject_key), e o dono do catálogo batia em `duplicate key`
  -- ao criar a regra dele — sem enxergar a linha que estava no caminho,
  -- porque a policy de SELECT filtra por `teacher_id`.
  constraint theory_catalog_subject_rules_catalog_fk
    foreign key (catalog_id, teacher_id)
    references public.theory_catalogs (id, teacher_id) on delete cascade
);

create table public.theory_review_rules (
  id               uuid primary key default gen_random_uuid(),
  catalog_id       uuid not null,
  teacher_id       uuid not null references public.profiles(id) on delete cascade,
  subject          text not null,
  subject_key      text not null,
  review_number    integer not null,
  lesson_spacing   integer not null,
  minimum_questions integer not null default 15,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint theory_review_rules_review_number_check check (review_number between 1 and 10),
  constraint theory_review_rules_lesson_spacing_check check (lesson_spacing between 1 and 200),
  constraint theory_review_rules_minimum_questions_check
    check (minimum_questions between 1 and 200),
  unique (catalog_id, subject_key, review_number),
  -- Composta, pelo mesmo motivo de theory_catalog_subject_rules.
  constraint theory_review_rules_catalog_fk
    foreign key (catalog_id, teacher_id)
    references public.theory_catalogs (id, teacher_id) on delete cascade
);

create table public.theory_lessons (
  id                   uuid primary key default gen_random_uuid(),
  teacher_id           uuid not null references public.profiles(id) on delete cascade,
  catalog_id           uuid,
  subject              text not null,
  subject_key          text not null,
  lesson_code          text not null,
  position             integer not null default 1,
  title                text not null,
  pdf_file             text not null,
  theory_start_page    integer,
  theory_end_page      integer,
  pdf_total_pages      integer,
  final_questions_start integer,
  has_theory           boolean not null default true,
  active               boolean not null default true,
  note                 text,
  tec_notebooks        jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint theory_lessons_pages_valid_check check (
    has_theory = false
    or (theory_start_page is not null and theory_end_page is not null
        and theory_start_page >= 1 and theory_end_page >= theory_start_page)
  ),
  constraint theory_lessons_end_within_pdf_check check (
    pdf_total_pages is null or theory_end_page is null
    or theory_end_page <= pdf_total_pages
  ),
  unique (teacher_id, catalog_id, pdf_file),
  -- Composta. A coluna é anulável e a FK é MATCH SIMPLE: aula sem catálogo
  -- não é conferida, que é o comportamento desejado. A lista de colunas no
  -- `set null` é obrigatória aqui — sem ela o Postgres anularia `teacher_id`
  -- junto, e `teacher_id` é NOT NULL, então apagar um catálogo falharia.
  constraint theory_lessons_catalog_fk
    foreign key (catalog_id, teacher_id)
    references public.theory_catalogs (id, teacher_id) on delete set null (catalog_id)
);

create table public.study_plan_theory_catalogs (
  id            uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null unique,
  catalog_id    uuid not null,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- As duas pontas compostas: o planejamento é do par, e o catálogo é do
  -- professor. Sem a segunda, um professor ligava o catálogo de outro ao
  -- próprio planejamento — e o aluno ficava com um catálogo que ele não tem
  -- permissão de ler, porque `theory_catalogs_select` exige
  -- `can_access_teacher`.
  constraint study_plan_theory_catalogs_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete cascade,
  constraint study_plan_theory_catalogs_catalog_fk
    foreign key (catalog_id, teacher_id)
    references public.theory_catalogs (id, teacher_id) on delete cascade
);

create table public.theory_progress (
  id                          uuid primary key default gen_random_uuid(),
  student_id                  uuid not null references public.profiles(id) on delete cascade,
  study_plan_id               uuid not null,
  theory_lesson_id            uuid not null references public.theory_lessons(id) on delete cascade,
  current_page                integer not null default 0,
  theory_done                 boolean not null default false,
  theory_done_at              timestamptz,
  initial_questions_done      integer not null default 0,
  initial_questions_complete  boolean not null default false,
  initial_questions_complete_at timestamptz,
  lesson_done                 boolean not null default false,
  lesson_done_at              timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint theory_progress_current_page_check check (current_page >= 0),
  constraint theory_progress_initial_questions_check check (initial_questions_done >= 0),
  unique (student_id, study_plan_id, theory_lesson_id),
  -- Composta. `theory_progress_write` só exigia `student_id = auth.uid()`, e
  -- `theory_reviews_write` já conferia o planejamento no WITH CHECK: as duas
  -- tabelas irmãs discordavam, e a que não conferia deixava o aluno gravar
  -- progresso dentro do planejamento de outro aluno.
  constraint theory_progress_study_plan_fk
    foreign key (study_plan_id, student_id)
    references public.study_plans (id, student_id) on delete cascade
);

create table public.theory_reviews (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  study_plan_id     uuid not null,
  theory_lesson_id  uuid not null references public.theory_lessons(id) on delete cascade,
  review_number     integer not null,
  minimum_questions integer not null default 15,
  questions_answered integer not null default 0,
  status            public.theory_review_status not null default 'pending',
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint theory_reviews_review_number_check check (review_number between 1 and 10),
  constraint theory_reviews_minimum_questions_check
    check (minimum_questions between 1 and 200),
  constraint theory_reviews_questions_answered_check check (questions_answered >= 0),
  unique (student_id, study_plan_id, theory_lesson_id, review_number),
  -- O que o WITH CHECK da policy já exigia, agora como constraint: invariante
  -- que cabe no banco não fica só na policy.
  constraint theory_reviews_study_plan_fk
    foreign key (study_plan_id, student_id)
    references public.study_plans (id, student_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

-- `(study_plan_id)` e `(teacher_id)` sozinhos saíram: eram prefixo de
-- `goals_week_idx` e de `goals_teacher_plan_week_status_idx`. Um índice que é
-- prefixo de outro não serve nenhuma leitura a mais, e custa em toda escrita.
create index goals_student_idx           on public.goals (student_id);
create index goals_week_idx              on public.goals (study_plan_id, week_number);
-- Cobre `goals_study_plan_fk` na ordem da FK, para o cascade não virar seq scan.
create index goals_plan_context_idx
  on public.goals (study_plan_id, teacher_id, student_id);
create index goals_teacher_plan_week_status_idx
  on public.goals (teacher_id, study_plan_id, student_id, week_number, status);
create index goals_notebook_block_idx
  on public.goals (teacher_id, student_id, study_plan_id, notebook_block_id)
  where notebook_block_id is not null;
create unique index goals_one_per_slot_idx
  on public.goals (study_plan_id, week_number, weekday, day_position);

-- Um planejamento por aluno com o mesmo nome. Estava no banco de origem como
-- `planejamentos_unico_por_aluno_nome_idx`.
create unique index study_plans_name_per_student_uidx
  on public.study_plans (teacher_id, student_id, name);

create index study_plans_teacher_idx on public.study_plans (teacher_id);
create index study_plans_student_idx on public.study_plans (student_id);
create index study_plans_class_idx   on public.study_plans (class_id);

create index study_plan_notebooks_active_idx
  on public.study_plan_notebooks (study_plan_id, active, deleted);
create index study_plan_notebooks_plan_idx
  on public.study_plan_notebooks (study_plan_id, teacher_id, student_id);
create unique index study_plan_notebooks_catalog_context_uidx
  on public.study_plan_notebooks (teacher_id, student_id, study_plan_id, catalog_key)
  where catalog_key is not null;

create index quiz_sessions_student_date_idx on public.quiz_sessions (student_id, started_at desc);
create index quiz_sessions_plan_date_idx    on public.quiz_sessions (study_plan_id, started_at desc);
create index quiz_sessions_context_idx
  on public.quiz_sessions (teacher_id, student_id, study_plan_id, block_id, status);
create index quiz_sessions_goal_idx        on public.quiz_sessions (goal_id) where goal_id is not null;
create index quiz_sessions_origin_goal_idx on public.quiz_sessions (origin_goal_id) where origin_goal_id is not null;
create unique index quiz_sessions_one_open_per_plan_uidx
  on public.quiz_sessions (student_id, study_plan_id)
  where status in ('in_progress', 'awaiting_time');
create unique index quiz_sessions_goal_not_cancelled_uidx
  on public.quiz_sessions (goal_id)
  where goal_id is not null and status not in ('cancelled', 'voided');
create unique index quiz_sessions_number_context_uidx
  on public.quiz_sessions (student_id, study_plan_id, block_id, session_number)
  where session_number is not null and status not in ('cancelled', 'voided');

create index quiz_session_questions_context_idx
  on public.quiz_session_questions (student_id, study_plan_id, block_id, answered_at desc);
create index quiz_session_questions_student_question_idx
  on public.quiz_session_questions (student_id, question_id, answered_at desc);
create index quiz_session_questions_session_phase_idx
  on public.quiz_session_questions (quiz_session_id, round, phase, outcome);
-- Uma correlata por questão de origem, dentro da mesma bateria. Estava no
-- banco de origem como `questoes_resultados_um_reforco_por_origem_uidx`.
create unique index quiz_session_questions_one_reinforcement_per_source_uidx
  on public.quiz_session_questions (quiz_session_id, source_question_id)
  where phase = 'reinforcement' and source_question_id is not null;

create index quiz_session_questions_errors_idx
  on public.quiz_session_questions (student_id, study_plan_id, block_id, answered_at desc)
  where outcome = 'incorrect';

create index reinforcement_cycles_student_plan_idx
  on public.reinforcement_cycles (student_id, study_plan_id, completed_at desc);
create index reinforcement_cycles_teacher_student_idx
  on public.reinforcement_cycles (teacher_id, student_id, study_plan_id);

create index waitlist_teacher_status_idx on public.waitlist (teacher_id, status, created_at desc);

create index theory_lessons_catalog_idx on public.theory_lessons (catalog_id, subject_key, position);
create index theory_lessons_teacher_idx on public.theory_lessons (teacher_id, subject_key, position);
create index theory_progress_student_plan_idx on public.theory_progress (student_id, study_plan_id);
create index theory_reviews_student_plan_status_idx
  on public.theory_reviews (student_id, study_plan_id, status);

-- Índices das FKs compostas novas.
--
-- Uma FK precisa de índice do lado que REFERENCIA, na ordem das colunas da FK:
-- é ele que o Postgres usa quando a linha-pai é apagada. Os que já existem
-- cobrem o prefixo errado — `theory_progress_student_plan_idx` começa por
-- `student_id`, e a FK começa por `study_plan_id`.
create index goal_entries_goal_idx
  on public.goal_entries (goal_id, teacher_id, student_id);
create index class_students_class_idx
  on public.class_students (class_id, teacher_id);
create index theory_catalog_subject_rules_catalog_idx
  on public.theory_catalog_subject_rules (catalog_id, teacher_id);
create index theory_review_rules_catalog_idx
  on public.theory_review_rules (catalog_id, teacher_id);
create index theory_lessons_catalog_teacher_idx
  on public.theory_lessons (catalog_id, teacher_id);
create index study_plan_theory_catalogs_catalog_idx
  on public.study_plan_theory_catalogs (catalog_id, teacher_id);
create index theory_progress_plan_student_idx
  on public.theory_progress (study_plan_id, student_id);
create index theory_reviews_plan_student_idx
  on public.theory_reviews (study_plan_id, student_id);

-- ---------------------------------------------------------------------------
-- View de desempenho
--
-- Substitui os nove contadores que `baterias` mantinha à mão
-- (principais_total, acertos_principais, erros_principais, e os mesmos três
-- para reforço e extra). Contador mantido em paralelo ao ledger é a falha que
-- produziu número divergente na versão anterior do produto.
--
-- CONSEQUÊNCIA, e ela é real: duas invariantes que eram CHECK deixaram de
-- caber numa constraint, porque dependem de contar linhas de outra tabela —
-- "entre 1 e main_target questões principais" e "extras em múltiplo de 5".
-- Elas passam a ser responsabilidade da RPC que fecha a bateria, e é lá que
-- precisam de teste. Enquanto a RPC não existir, ninguém escreve no ledger.
--
-- `security_invoker = true` é obrigatório: sem ele a view roda com o
-- privilégio do dono e vaza dado entre alunos.
-- ---------------------------------------------------------------------------

create or replace view public.vw_quiz_session_performance
with (security_invoker = true) as
select
  s.id            as quiz_session_id,
  s.teacher_id,
  s.student_id,
  s.study_plan_id,
  s.block_id,
  s.status,
  s.main_target,
  count(q.*) filter (where q.phase = 'main')                              as main_total,
  count(q.*) filter (where q.phase = 'main' and q.outcome = 'correct')    as main_correct,
  count(q.*) filter (where q.phase = 'main' and q.outcome = 'incorrect')  as main_incorrect,
  count(q.*) filter (where q.phase = 'reinforcement')                     as reinforcement_total,
  count(q.*) filter (where q.phase = 'reinforcement' and q.outcome = 'correct')   as reinforcement_correct,
  count(q.*) filter (where q.phase = 'reinforcement' and q.outcome = 'incorrect') as reinforcement_incorrect,
  count(q.*) filter (where q.phase = 'extra')                            as extra_total,
  count(q.*) filter (where q.phase = 'extra' and q.outcome = 'correct')   as extra_correct,
  count(q.*) filter (where q.phase = 'extra' and q.outcome = 'incorrect') as extra_incorrect
from public.quiz_sessions s
left join public.quiz_session_questions q on q.quiz_session_id = s.id
group by s.id, s.teacher_id, s.student_id, s.study_plan_id, s.block_id, s.status, s.main_target;

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção
-- ---------------------------------------------------------------------------

-- Campos administrativos do perfil.
--
-- Agora em INSERT também: no banco de origem o trigger era só BEFORE UPDATE, e
-- a policy de INSERT não olhava coluna nenhuma — quem conseguisse inserir a
-- própria linha entrava como professor.
create or replace function public.protect_profile_admin_fields() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  -- Quem está agindo sai do JWT, e só dele. O banco de origem testava
  -- `session_user = 'postgres'`, que numa conexão do PostgREST é sempre
  -- `authenticator` — a checagem dependia de como a conexão foi aberta. E
  -- `current_user` não serve: dentro de SECURITY DEFINER ele é o DONO da
  -- função, então daria privilegiado para todo mundo.
  --
  -- Sem JWT (migration, psql, seed) é trabalho de manutenção e passa;
  -- `service_role` passa; `authenticated` e `anon` são usuário final e não.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Toda conta nasce aluno e pendente. Papel e acesso são concedidos por
    -- quem tem privilégio, nunca pelo próprio dono da linha.
    new.role := 'student';
    new.access_status := 'pending';
    new.access_expires_at := null;
    new.plan := null;
    new.coupon_used := null;
    return new;
  end if;

  if (select auth.uid()) = old.id then
    new.role := old.role;
    new.teacher_id := old.teacher_id;
    new.access_status := old.access_status;
    new.access_expires_at := old.access_expires_at;
    new.plan := old.plan;
    new.coupon_used := old.coupon_used;
    new.access_origin := old.access_origin;
  end if;

  return new;
end;
$$;

create trigger protect_profile_admin_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- Identidade do cadastro da lista de espera.
create or replace function public.protect_waitlist_identity() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.student_id is distinct from old.student_id
     or new.teacher_id is distinct from old.teacher_id
     or lower(new.email) is distinct from lower(old.email) then
    raise exception 'os vinculos do cadastro nao podem ser alterados';
  end if;
  return new;
end;
$$;

create trigger protect_waitlist_identity
  before update on public.waitlist
  for each row execute function public.protect_waitlist_identity();

-- Identidade do caderno.
create or replace function app_private.protect_notebook_identity() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if old.block_id is distinct from new.block_id then
    raise exception 'block_id e imutavel';
  end if;

  -- catalog_key pode ser definido uma única vez (NULL -> valor).
  if old.catalog_key is not null and old.catalog_key is distinct from new.catalog_key then
    raise exception 'catalog_key e imutavel depois de definido';
  end if;

  if new.catalog_key is not null and btrim(new.catalog_key) = '' then
    raise exception 'catalog_key nao pode ser vazio';
  end if;

  return new;
end;
$$;

create trigger protect_notebook_identity
  before update of block_id, catalog_key on public.study_plan_notebooks
  for each row execute function app_private.protect_notebook_identity();

-- Quem pode configurar a meta ligada a um caderno.
create or replace function app_private.protect_goal_notebook_block() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  -- Quem está agindo sai do JWT, e só dele. O banco de origem testava
  -- `session_user = 'postgres'`, que numa conexão do PostgREST é sempre
  -- `authenticator` — a checagem dependia de como a conexão foi aberta. E
  -- `current_user` não serve: dentro de SECURITY DEFINER ele é o DONO da
  -- função, então daria privilegiado para todo mundo.
  --
  -- Sem JWT (migration, psql, seed) é trabalho de manutenção e passa;
  -- `service_role` passa; `authenticated` e `anon` são usuário final e não.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
  v_plan_ok boolean := false;
begin
  if v_privileged then
    return new;
  end if;

  -- Metas manuais continuam como estão.
  if tg_op = 'INSERT' and new.notebook_block_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.notebook_block_id is null
     and new.notebook_block_id is null then
    return new;
  end if;

  if v_uid is null then
    raise exception 'usuario nao autenticado';
  end if;

  -- A autorização não confia em NEW.teacher_id isoladamente: confirma o
  -- professor pelo planejamento real, senão um aluno se colocaria como
  -- professor no mesmo INSERT.
  select exists (
    select 1 from public.study_plans p
     where p.id = new.study_plan_id
       and p.teacher_id = v_uid
       and p.student_id = new.student_id
  ) into v_plan_ok;

  if not v_plan_ok or new.teacher_id is distinct from v_uid then
    raise exception 'somente o professor real do planejamento pode configurar a meta de bateria';
  end if;

  if new.notebook_block_id is not null and new.type is distinct from 'question_block' then
    raise exception 'meta ligada a caderno precisa ser do tipo question_block';
  end if;

  if tg_op = 'UPDATE' and old.notebook_block_id is not null then
    if old.teacher_id is distinct from new.teacher_id
       or old.student_id is distinct from new.student_id
       or old.study_plan_id is distinct from new.study_plan_id
       or old.type is distinct from new.type then
      raise exception 'contexto tecnico da meta de bateria e imutavel';
    end if;

    if old.teacher_id is distinct from v_uid then
      raise exception 'somente o professor vinculado pode alterar o bloco da meta';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_goal_notebook_block
  before insert or update of notebook_block_id, teacher_id, student_id, study_plan_id, type
  on public.goals
  for each row execute function app_private.protect_goal_notebook_block();

-- O planejamento da meta é do professor; o aluno só registra execução.
--
-- `goals_update` aceita a linha por `teacher_id = auth.uid()` OU
-- `student_id = auth.uid()`, sem distinguir o que cada um pode mudar. Com isso
-- o aluno trocava o `type` de uma meta do professor para 'extra' e apagava em
-- seguida, porque `goals_delete` decide pelo tipo — a meta sumia da semana e
-- nada no banco registrava que ela existiu.
--
-- O `type` fica congelado para quem não é o professor da meta, inclusive nas
-- metas que o próprio aluno criou: é ele que governa quem pode apagar. O resto
-- do planejamento (título, matéria, dia, minutos previstos, bloco do caderno)
-- fica congelado só nas metas do professor — o aluno continua editando o
-- estudo extra que ele mesmo lançou.
create or replace function app_private.protect_goal_planning_fields() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  -- Mesmo critério das outras: o papel sai do JWT, e só dele. Ver a nota
  -- longa em `protect_profile_admin_fields`.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged or (select auth.uid()) = old.teacher_id then
    return new;
  end if;

  if old.type is distinct from new.type then
    raise exception 'o tipo da meta so e alterado pelo professor';
  end if;

  if old.type not in ('extra', 'reinforcement')
     and (old.title is distinct from new.title
       or old.subject is distinct from new.subject
       or old.description is distinct from new.description
       or old.lesson is distinct from new.lesson
       or old.block is distinct from new.block
       or old.planned_minutes is distinct from new.planned_minutes
       or old.week_number is distinct from new.week_number
       or old.weekday is distinct from new.weekday
       or old.weekday_name is distinct from new.weekday_name
       or old.day_position is distinct from new.day_position
       or old.due_on is distinct from new.due_on
       or old.notebook_block_id is distinct from new.notebook_block_id) then
    raise exception 'somente o professor altera o planejamento da meta';
  end if;

  return new;
end;
$$;

create trigger protect_goal_planning_fields
  before update on public.goals
  for each row execute function app_private.protect_goal_planning_fields();

-- Contexto congelado depois que existe bateria.
create or replace function app_private.freeze_goal_with_sessions() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if old.teacher_id is distinct from new.teacher_id
     or old.student_id is distinct from new.student_id
     or old.study_plan_id is distinct from new.study_plan_id
     or old.notebook_block_id is distinct from new.notebook_block_id
     or old.type is distinct from new.type then

    if exists (
      select 1 from public.quiz_sessions s
       where s.origin_goal_id = old.id or s.goal_id = old.id
    ) then
      raise exception 'contexto tecnico da meta nao pode mudar depois que existe bateria';
    end if;
  end if;

  return new;
end;
$$;

create trigger freeze_goal_with_sessions
  before update of teacher_id, student_id, study_plan_id, notebook_block_id, type
  on public.goals
  for each row execute function app_private.freeze_goal_with_sessions();

-- Resultado da meta de bateria só muda pelo motor.
--
-- O motor sinaliza com `set_config('app.quiz_rpc', '1', true)` dentro da
-- transação da RPC. Sem isso, nem o aluno nem o professor alteram o número.
create or replace function app_private.protect_goal_quiz_result() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  -- Quem está agindo sai do JWT, e só dele. O banco de origem testava
  -- `session_user = 'postgres'`, que numa conexão do PostgREST é sempre
  -- `authenticator` — a checagem dependia de como a conexão foi aberta. E
  -- `current_user` não serve: dentro de SECURITY DEFINER ele é o DONO da
  -- função, então daria privilegiado para todo mundo.
  --
  -- Sem JWT (migration, psql, seed) é trabalho de manutenção e passa;
  -- `service_role` passa; `authenticated` e `anon` são usuário final e não.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
  v_rpc boolean := coalesce(current_setting('app.quiz_rpc', true), '') = '1';
begin
  if coalesce(old.notebook_block_id, new.notebook_block_id) is null then
    return new;
  end if;

  if v_privileged or v_rpc then
    return new;
  end if;

  if old.questions_answered is distinct from new.questions_answered
     or old.correct_answers is distinct from new.correct_answers
     or old.spent_minutes is distinct from new.spent_minutes
     or old.status is distinct from new.status
     or old.completed_at is distinct from new.completed_at then
    raise exception 'resultado de meta de bateria so pode ser alterado pelo motor de baterias';
  end if;

  return new;
end;
$$;

create trigger protect_goal_quiz_result
  before update on public.goals
  for each row execute function app_private.protect_goal_quiz_result();

-- A bateria de meta precisa casar com a meta.
create or replace function app_private.validate_session_goal_context() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.origin = 'goal' and new.goal_id is not null then
    if not exists (
      select 1 from public.goals g
       where g.id = new.goal_id
         and g.teacher_id = new.teacher_id
         and g.student_id = new.student_id
         and g.study_plan_id = new.study_plan_id
         and g.notebook_block_id = new.block_id
         and g.type = 'question_block'
    ) then
      raise exception 'meta nao corresponde ao contexto tecnico da bateria';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_session_goal_context
  before insert or update of goal_id, teacher_id, student_id, study_plan_id, block_id, origin
  on public.quiz_sessions
  for each row execute function app_private.validate_session_goal_context();

-- ---------------------------------------------------------------------------
-- updated_at
--
-- Em TODA tabela que tem a coluna. No banco de origem eram cinco de dezenove,
-- e as outras catorze só mudavam se alguém lembrasse de escrever.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'classes', 'subjects', 'subject_blocks', 'subject_lessons',
    'coupons', 'waitlist', 'catalog_blocks', 'study_plans',
    'study_plan_notebooks', 'goals', 'quiz_sessions', 'theory_catalogs',
    'theory_subject_rules', 'theory_catalog_subject_rules',
    'theory_review_rules', 'theory_lessons', 'study_plan_theory_catalogs',
    'theory_progress', 'theory_reviews'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles                     enable row level security;
alter table public.classes                      enable row level security;
alter table public.class_students               enable row level security;
alter table public.subjects                     enable row level security;
alter table public.subject_blocks               enable row level security;
alter table public.subject_lessons              enable row level security;
alter table public.coupons                      enable row level security;
alter table public.waitlist                     enable row level security;
alter table public.catalog_blocks               enable row level security;
alter table public.study_plans                  enable row level security;
alter table public.study_plan_notebooks         enable row level security;
alter table public.goals                        enable row level security;
alter table public.goal_entries                 enable row level security;
alter table public.quiz_sessions                enable row level security;
alter table public.quiz_session_questions       enable row level security;
alter table public.reinforcement_cycles         enable row level security;
alter table public.theory_catalogs              enable row level security;
alter table public.theory_subject_rules         enable row level security;
alter table public.theory_catalog_subject_rules enable row level security;
alter table public.theory_review_rules          enable row level security;
alter table public.theory_lessons               enable row level security;
alter table public.study_plan_theory_catalogs   enable row level security;
alter table public.theory_progress              enable row level security;
alter table public.theory_reviews               enable row level security;

-- ---------------------------------------------------------------------------
-- Funções de autorização
--
-- Aqui, e não no topo: função SQL tem o corpo validado na criação, e estas
-- leem `public.profiles`.
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'teacher'
  );
$$;

create or replace function public.can_access_teacher(p_teacher uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) = p_teacher
      or exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.teacher_id = p_teacher
      );
$$;

-- O inverso de `can_access_teacher`: quem está agindo é o professor DESTE
-- aluno?
--
-- `teacher_id = auth.uid()` dentro de uma policy diz que quem escreve é o
-- professor da LINHA — que é um valor que quem escreve escolheu. Não diz nada
-- sobre o aluno. Sem esta função, qualquer professor criava planejamento para
-- aluno de outro e matriculava aluno alheio na própria turma: as duas coisas
-- passavam, porque a linha inteira era montada por quem estava atacando.
create or replace function public.is_teacher_of(p_student uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_student and p.teacher_id = (select auth.uid())
  );
$$;

-- O acesso do aluno está vigente?
--
-- Nenhuma policy olhava `access_status` nem `access_expires_at`: aluno vencido
-- ou ainda pendente continuava lançando registro e progresso por uma chamada
-- direta à API, porque o bloqueio existia só no frontend.
--
-- Entra no WITH CHECK das escritas do ALUNO, e não no USING nem nas leituras:
-- WITH CHECK levanta 42501, que a tela consegue explicar, enquanto um USING
-- falso filtraria a linha em silêncio (ver a nota sobre isso no CLAUDE.md). E
-- quem venceu continua lendo o próprio histórico.
--
-- `profiles` e `waitlist` ficam de fora de propósito: é por elas que um aluno
-- pendente pede acesso, e fechá-las trancaria a porta de entrada.
create or replace function public.has_active_access() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.access_status = 'active'
       and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

-- O professor do aluno, com id e nome — e nada além disso.
--
-- `profiles_select` nunca deixou o aluno ler a linha do próprio professor: a
-- policy é `id = auth.uid() or teacher_id = auth.uid()`, e o professor tem
-- `teacher_id` nulo. O contrato da UI pede `teacherName` (Account, em
-- `apps/web/src/lib/api/contract.ts`), então a leitura precisa existir.
--
-- Por função, e não abrindo a policy: a linha de `profiles` carrega `plan`,
-- `coupon_used`, `access_status` e `access_expires_at`, e a RLS decide QUAL
-- LINHA, nunca QUAL COLUNA. Por view também não — view precisa de
-- `security_invoker = true` neste repositório, e com ele a view herdaria a
-- mesma policy e voltaria vazia.
create or replace function public.my_teacher()
  returns table (id uuid, name text)
  language sql stable security definer set search_path = '' as $$
  select t.id, t.name
    from public.profiles t
   where t.id = (
     select p.teacher_id from public.profiles p where p.id = (select auth.uid())
   );
$$;

-- ---------------------------------------------------------------------------
-- Policies — uma por comando, por tabela.
--
-- Policies permissivas somam por OR. Manter duas para o mesmo comando não
-- restringe nada: amplia, e esconde qual das duas está valendo.
-- ---------------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or teacher_id = (select auth.uid()));

create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- classes
create policy classes_select on public.classes for select to authenticated
  using (public.can_access_teacher(teacher_id));
create policy classes_insert on public.classes for insert to authenticated
  with check (public.is_teacher() and teacher_id = (select auth.uid()));
create policy classes_update on public.classes for update to authenticated
  using (public.is_teacher() and teacher_id = (select auth.uid()))
  with check (public.is_teacher() and teacher_id = (select auth.uid()));
create policy classes_delete on public.classes for delete to authenticated
  using (public.is_teacher() and teacher_id = (select auth.uid()));

-- class_students
create policy class_students_select on public.class_students for select to authenticated
  using (public.can_access_teacher(teacher_id) or student_id = (select auth.uid()));
-- `is_teacher_of` é o que impede matricular aluno de outro professor. A FK
-- composta `class_students_class_fk` cuida da outra ponta, a turma.
create policy class_students_insert on public.class_students for insert to authenticated
  with check (
    public.is_teacher()
    and teacher_id = (select auth.uid())
    and public.is_teacher_of(student_id)
  );
create policy class_students_delete on public.class_students for delete to authenticated
  using (public.is_teacher() and teacher_id = (select auth.uid()));

-- subjects
create policy subjects_select on public.subjects for select to authenticated
  using (public.can_access_teacher(teacher_id));
create policy subjects_insert on public.subjects for insert to authenticated
  with check (public.is_teacher() and teacher_id = (select auth.uid()));
create policy subjects_update on public.subjects for update to authenticated
  using (public.is_teacher() and teacher_id = (select auth.uid()))
  with check (public.is_teacher() and teacher_id = (select auth.uid()));
create policy subjects_delete on public.subjects for delete to authenticated
  using (public.is_teacher() and teacher_id = (select auth.uid()));

-- subject_blocks
create policy subject_blocks_select on public.subject_blocks for select to authenticated
  using (exists (
    select 1 from public.subjects s
     where s.id = subject_blocks.subject_id and public.can_access_teacher(s.teacher_id)
  ));
create policy subject_blocks_insert on public.subject_blocks for insert to authenticated
  with check (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_blocks.subject_id and s.teacher_id = (select auth.uid())
  ));
create policy subject_blocks_update on public.subject_blocks for update to authenticated
  using (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_blocks.subject_id and s.teacher_id = (select auth.uid())
  ))
  with check (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_blocks.subject_id and s.teacher_id = (select auth.uid())
  ));
create policy subject_blocks_delete on public.subject_blocks for delete to authenticated
  using (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_blocks.subject_id and s.teacher_id = (select auth.uid())
  ));

-- subject_lessons
create policy subject_lessons_select on public.subject_lessons for select to authenticated
  using (exists (
    select 1 from public.subjects s
     where s.id = subject_lessons.subject_id and public.can_access_teacher(s.teacher_id)
  ));
create policy subject_lessons_insert on public.subject_lessons for insert to authenticated
  with check (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_lessons.subject_id and s.teacher_id = (select auth.uid())
  ));
create policy subject_lessons_update on public.subject_lessons for update to authenticated
  using (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_lessons.subject_id and s.teacher_id = (select auth.uid())
  ))
  with check (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_lessons.subject_id and s.teacher_id = (select auth.uid())
  ));
create policy subject_lessons_delete on public.subject_lessons for delete to authenticated
  using (public.is_teacher() and exists (
    select 1 from public.subjects s
     where s.id = subject_lessons.subject_id and s.teacher_id = (select auth.uid())
  ));

-- coupons — sem policy, e sem grant lá embaixo.
--
-- A tabela é global: não tem coluna de dono, e `user_role` não tem 'admin'.
-- `is_teacher()` não é "é admin", então a policy anterior dava a TODO professor
-- o código e os meses de liberação de TODOS os cupons. Com RLS ligada e zero
-- policy, só `service_role` lê — e o resgate passa pela RPC `SECURITY DEFINER`
-- que o item 1 do cabeçalho já previa, que valida o código do lado do servidor
-- sem devolver a tabela. Tela de administração de cupom, se nascer, nasce pela
-- mesma RPC.

-- waitlist
create policy waitlist_select on public.waitlist for select to authenticated
  using (
    student_id = (select auth.uid())
    or (teacher_id = (select auth.uid()) and public.is_teacher())
  );
create policy waitlist_insert_student on public.waitlist for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'waiting'
    and lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role = 'student'
         and p.teacher_id = waitlist.teacher_id
    )
  );
create policy waitlist_update on public.waitlist for update to authenticated
  using (
    (student_id = (select auth.uid()) and status = 'waiting')
    or (teacher_id = (select auth.uid()) and public.is_teacher())
  )
  with check (
    (student_id = (select auth.uid()) and status = 'waiting')
    or (teacher_id = (select auth.uid()) and public.is_teacher())
  );
create policy waitlist_delete_teacher on public.waitlist for delete to authenticated
  using (teacher_id = (select auth.uid()) and public.is_teacher());

-- catalog_blocks — catálogo comum, leitura para quem está autenticado.
create policy catalog_blocks_select on public.catalog_blocks for select to authenticated
  using (true);

-- study_plans
create policy study_plans_select on public.study_plans for select to authenticated
  using (teacher_id = (select auth.uid()) or student_id = (select auth.uid()));
-- `is_teacher_of`: sem ele, `teacher_id = auth.uid()` deixava qualquer
-- professor criar planejamento para aluno de outro — e o aluno passava a ver
-- esse planejamento, porque `study_plans_select` casa por `student_id`.
create policy study_plans_insert on public.study_plans for insert to authenticated
  with check (
    teacher_id = (select auth.uid()) and public.is_teacher_of(student_id)
  );
create policy study_plans_update on public.study_plans for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid()) and public.is_teacher_of(student_id)
  );
create policy study_plans_delete on public.study_plans for delete to authenticated
  using (teacher_id = (select auth.uid()));

-- study_plan_notebooks
create policy study_plan_notebooks_select on public.study_plan_notebooks for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (student_id = (select auth.uid()) and deleted = false)
  );
create policy study_plan_notebooks_insert on public.study_plan_notebooks for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.study_plans p
       where p.id = study_plan_notebooks.study_plan_id
         and p.teacher_id = (select auth.uid())
         and p.student_id = study_plan_notebooks.student_id
    )
  );
create policy study_plan_notebooks_update on public.study_plan_notebooks for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.study_plans p
       where p.id = study_plan_notebooks.study_plan_id
         and p.teacher_id = (select auth.uid())
         and p.student_id = study_plan_notebooks.student_id
    )
  );
create policy study_plan_notebooks_delete on public.study_plan_notebooks for delete to authenticated
  using (teacher_id = (select auth.uid()));

-- goals
create policy goals_select on public.goals for select to authenticated
  using (teacher_id = (select auth.uid()) or student_id = (select auth.uid()));

create policy goals_insert on public.goals for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    or (
      -- O aluno cria só estudo extra e reforço, no próprio planejamento ativo,
      -- e só enquanto o acesso dele estiver vigente.
      student_id = (select auth.uid())
      and public.has_active_access()
      and type in ('extra', 'reinforcement')
      and exists (
        select 1 from public.study_plans p
         where p.id = goals.study_plan_id
           and p.student_id = (select auth.uid())
           and p.teacher_id = goals.teacher_id
           and p.status = 'active'
      )
    )
  );

-- Quem VÊ a linha para atualizar são os dois. O QUE cada um pode mudar não
-- cabe numa policy, que decide linha e não coluna, e está em três lugares:
--   * `goals_study_plan_fk`, que impede o trio divergir do planejamento;
--   * o GRANT UPDATE por coluna, que tira teacher_id, student_id e
--     study_plan_id do alcance do PostgREST;
--   * `protect_goal_planning_fields`, que congela o `type` e, nas metas do
--     professor, o resto do planejamento.
create policy goals_update on public.goals for update to authenticated
  using (teacher_id = (select auth.uid()) or student_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()) or student_id = (select auth.uid()));

create policy goals_delete on public.goals for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    or (student_id = (select auth.uid()) and type in ('extra', 'reinforcement'))
  );

-- goal_entries
--
-- O que impede um aluno lançar registro na meta de OUTRO é
-- `goal_entries_goal_fk`, não a policy: `student_id` e `teacher_id` aqui são
-- da própria linha, e quem insere escolhe os dois.
create policy goal_entries_select on public.goal_entries for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));
create policy goal_entries_insert on public.goal_entries for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    or (student_id = (select auth.uid()) and public.has_active_access())
  );
create policy goal_entries_update on public.goal_entries for update to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid())
    or (student_id = (select auth.uid()) and public.has_active_access())
  );
create policy goal_entries_delete on public.goal_entries for delete to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));

-- quiz_sessions, o ledger e os ciclos: leitura e nada mais.
-- Escrita é de RPC, que ainda vai ser escrita junto com a execução nova.
create policy quiz_sessions_select on public.quiz_sessions for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));

create policy quiz_session_questions_select on public.quiz_session_questions
  for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));

create policy reinforcement_cycles_select on public.reinforcement_cycles
  for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));

-- Teoria: o professor administra o que é dele; o aluno lê o do seu professor.
create policy theory_catalogs_select on public.theory_catalogs for select to authenticated
  using (public.can_access_teacher(teacher_id));
create policy theory_catalogs_write on public.theory_catalogs for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

create policy theory_subject_rules_select on public.theory_subject_rules for select to authenticated
  using (public.can_access_teacher(teacher_id));
create policy theory_subject_rules_write on public.theory_subject_rules for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

create policy theory_catalog_subject_rules_select on public.theory_catalog_subject_rules
  for select to authenticated using (public.can_access_teacher(teacher_id));
create policy theory_catalog_subject_rules_write on public.theory_catalog_subject_rules
  for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

create policy theory_review_rules_select on public.theory_review_rules for select to authenticated
  using (public.can_access_teacher(teacher_id));
create policy theory_review_rules_write on public.theory_review_rules for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

create policy theory_lessons_select on public.theory_lessons for select to authenticated
  using (public.can_access_teacher(teacher_id));
create policy theory_lessons_write on public.theory_lessons for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

create policy study_plan_theory_catalogs_select on public.study_plan_theory_catalogs
  for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));
create policy study_plan_theory_catalogs_write on public.study_plan_theory_catalogs
  for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.study_plans p
       where p.id = study_plan_theory_catalogs.study_plan_id
         and p.teacher_id = (select auth.uid())
         and p.student_id = study_plan_theory_catalogs.student_id
    )
  );

create policy theory_progress_select on public.theory_progress for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.study_plans p
       where p.id = theory_progress.study_plan_id
         and p.teacher_id = (select auth.uid())
         and p.student_id = theory_progress.student_id
    )
  );
-- O planejamento é garantido por `theory_progress_study_plan_fk`; aqui fica só
-- o acesso vigente. No WITH CHECK, não no USING: assim o aluno vencido recebe
-- 42501 ao gravar e continua enxergando e apagando o que já era dele.
create policy theory_progress_write on public.theory_progress for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and public.has_active_access());

create policy theory_reviews_select on public.theory_reviews for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.study_plans p
       where p.id = theory_reviews.study_plan_id
         and p.teacher_id = (select auth.uid())
         and p.student_id = theory_reviews.student_id
    )
  );
-- O `exists` que estava aqui virou `theory_reviews_study_plan_fk`. Sobra o
-- acesso vigente, pelo mesmo motivo de theory_progress.
create policy theory_reviews_write on public.theory_reviews for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and public.has_active_access());

-- ---------------------------------------------------------------------------
-- Grants
--
-- Nada de `GRANT ALL`, e nada para `anon`. No banco de origem, vinte tabelas
-- tinham `GRANT ALL ... TO anon` — e `GRANT ALL` inclui TRUNCATE, que a RLS
-- não filtra. `anon` aqui não precisa de tabela nenhuma: o perfil nasce por
-- gatilho em `auth.users`.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Impede que a próxima tabela volte a nascer com GRANT ALL. É a causa raiz do
-- item 2 do cabeçalho: o default do projeto concede tudo a anon e authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- `service_role` é a chave de backend, e tem BYPASSRLS: o que o protege não é
-- grant, é nunca sair do servidor. Explícito porque este arquivo revoga o
-- default — sem isto ele fica só com REFERENCES/TRIGGER/TRUNCATE, e qualquer
-- rotina administrativa quebra com "permission denied".
grant select, insert, update, delete on all tables in schema public to service_role;

-- profiles: grant POR COLUNA. As colunas administrativas ficam de fora do
-- grant, então nem o dono nem o professor as alteram pelo PostgREST — a
-- liberação de acesso precisa nascer como RPC. A RLS sozinha não resolveria:
-- ela decide QUAL LINHA, nunca QUAL COLUNA.
grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

grant select, insert, update, delete on public.classes            to authenticated;
grant select, insert, delete         on public.class_students     to authenticated;
grant select, insert, update, delete on public.subjects           to authenticated;
grant select, insert, update, delete on public.subject_blocks     to authenticated;
grant select, insert, update, delete on public.subject_lessons    to authenticated;
grant select, insert, update, delete on public.waitlist           to authenticated;
grant select                         on public.catalog_blocks     to authenticated;

-- `coupons` não aparece aqui de propósito: RLS ligada, zero policy e zero
-- grant. Ver a nota na seção de policies.

-- Daqui para baixo, UPDATE é POR COLUNA — a defesa 2 do CLAUDE.md, que até
-- agora só `profiles` estava usando. As colunas de contexto (`teacher_id`,
-- `student_id`, `study_plan_id`, e o `goal_id` que é o contexto de
-- `goal_entries`) ficam fora do grant: a RLS decide QUAL LINHA e nunca QUAL
-- COLUNA, então sem isto um UPDATE legítimo carrega junto a mudança de dono.
-- `id`, `created_at` e `updated_at` também ficam de fora — o carimbo é do
-- gatilho.

grant select, insert, delete on public.study_plans to authenticated;
grant update (
  class_id, name, area, target_exam, stage, study_model, weekly_goals,
  starts_on, exam_date, status
) on public.study_plans to authenticated;

grant select, insert, delete on public.study_plan_notebooks to authenticated;
-- `block_id` fica fora: é a identidade do caderno, e o gatilho
-- `protect_notebook_identity` já o trata como imutável. `catalog_key` fica
-- dentro porque pode ser definido uma vez (NULL -> valor).
grant update (
  subject_key, subject_name, subject_color, subject_target, notebook_key,
  notebook_name, notebook_link, total_questions, subject_position,
  notebook_position, active, deleted, catalog_key
) on public.study_plan_notebooks to authenticated;

grant select, insert, delete on public.goals to authenticated;
grant update (
  week_number, weekday, weekday_name, day_position, type, subject, title,
  description, lesson, block, planned_minutes, spent_minutes,
  questions_answered, correct_answers, status, due_on, completed_at,
  notebook_block_id
) on public.goals to authenticated;

grant select, insert, delete on public.goal_entries to authenticated;
-- `wrong_answers` e `score` são colunas geradas: não entram em UPDATE.
grant update (
  minutes, questions, correct_answers, manual_lesson, theory_stage, note
) on public.goal_entries to authenticated;

-- Execução: leitura e nada mais. A escrita é da RPC, que roda como definer.
grant select on public.quiz_sessions          to authenticated;
grant select on public.quiz_session_questions to authenticated;
grant select on public.reinforcement_cycles   to authenticated;
grant select on public.vw_quiz_session_performance to authenticated;

grant select, insert, update, delete on public.theory_catalogs              to authenticated;
grant select, insert, update, delete on public.theory_subject_rules         to authenticated;
grant select, insert, update, delete on public.theory_catalog_subject_rules to authenticated;
grant select, insert, update, delete on public.theory_review_rules          to authenticated;
grant select, insert, update, delete on public.theory_lessons               to authenticated;

-- As três de baixo carregam contexto, e seguem a mesma regra por coluna.
grant select, insert, delete on public.study_plan_theory_catalogs to authenticated;
grant update (catalog_id) on public.study_plan_theory_catalogs to authenticated;

grant select, insert, delete on public.theory_progress to authenticated;
grant update (
  current_page, theory_done, theory_done_at, initial_questions_done,
  initial_questions_complete, initial_questions_complete_at,
  lesson_done, lesson_done_at
) on public.theory_progress to authenticated;

grant select, insert, delete on public.theory_reviews to authenticated;
grant update (
  minimum_questions, questions_answered, status, started_at, completed_at
) on public.theory_reviews to authenticated;

-- Funções: `revoke ... from public` acima já tirou o EXECUTE que o Postgres
-- concede por padrão ao grantee vazio. Revogar de `anon` e `authenticated`
-- sem revogar de PUBLIC não tira nada — os dois herdam dele.
grant execute on function public.is_teacher()                 to authenticated;
grant execute on function public.can_access_teacher(uuid)     to authenticated;
grant execute on function public.is_teacher_of(uuid)          to authenticated;
grant execute on function public.has_active_access()          to authenticated;
grant execute on function public.my_teacher()                 to authenticated;

-- As de gatilho não são API: rodam pelo gatilho, com o privilégio do dono.
-- Ninguém recebe EXECUTE.
revoke all on all functions in schema app_private from public, anon, authenticated;
