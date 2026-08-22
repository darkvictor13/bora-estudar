-- =============================================================================
-- Bora Estudar — Schema inicial completo
-- =============================================================================
-- Cria toda a base do zero num projeto Supabase novo e vazio.
-- Idempotente no nível do arquivo: pode ser reexecutado sem erro.
-- A transação é gerenciada pelo CLI do Supabase; não há begin/commit aqui.
--
-- Ordem de execução:
--   1. extensões e utilitários
--   2. tipos enumerados
--   3. tabelas (identidade → catálogo → planejamento → execução → suporte)
--   4. views de desempenho
--   5. triggers
--   6. RLS
--   7. RPCs (única via de escrita nas tabelas transacionais)
--   8. grants
--
-- Princípios aplicados:
--   - o ledger `quiz_session_questions` é a única fonte de verdade de desempenho;
--     nenhum contador agregado é mantido à mão;
--   - nada é apagado fisicamente: `deleted_at` + tabela `audit_log`;
--   - toda operação mutante é idempotente por `request_id` com hash de payload;
--   - invariantes de negócio são constraints, não sequências de UPDATE no client;
--   - nenhum dado de domínio em texto livre: tudo é coluna tipada ou FK;
--   - o contexto denormalizado (student_id/teacher_id) é protegido por FK composta.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSÕES E UTILITÁRIOS
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Mantém `updated_at` sem depender do client.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at is
  'Trigger BEFORE UPDATE: mantém updated_at. O client nunca escreve essa coluna.';


-- =============================================================================
-- 2. TIPOS ENUMERADOS
-- =============================================================================
-- Substituem os CHECK (col in ('a','b')) e os discriminadores que antes viviam
-- embutidos em texto livre.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('student','teacher','admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'access_status') then
    create type public.access_status as enum ('pending','active','suspended','expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'study_plan_status') then
    create type public.study_plan_status as enum ('draft','active','paused','archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'goal_type') then
    create type public.goal_type as enum ('theory','question_block','reinforcement','extra_study');
  end if;
  if not exists (select 1 from pg_type where typname = 'goal_status') then
    create type public.goal_status as enum ('pending','in_progress','completed','skipped','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'quiz_session_status') then
    create type public.quiz_session_status as enum ('in_progress','awaiting_time','completed','cancelled','voided');
  end if;
  if not exists (select 1 from pg_type where typname = 'quiz_session_origin') then
    create type public.quiz_session_origin as enum ('goal','error_notebook');
  end if;
  if not exists (select 1 from pg_type where typname = 'question_phase') then
    create type public.question_phase as enum ('main','reinforcement','extra');
  end if;
  if not exists (select 1 from pg_type where typname = 'question_outcome') then
    create type public.question_outcome as enum ('correct','incorrect');
  end if;
  if not exists (select 1 from pg_type where typname = 'batch_mode') then
    create type public.batch_mode as enum ('append','replace','replan');
  end if;
end;
$$;


-- =============================================================================
-- 3. TABELAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 Identidade e acesso
-- -----------------------------------------------------------------------------
-- `profiles` guarda QUEM a pessoa é. `subscriptions` guarda O QUE ela contratou.
-- Manter os dois separados impede que um upsert de cadastro zere uma assinatura
-- paga — que é o que acontece quando access_status mora na mesma linha do nome.

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role not null default 'student',
  name          text not null check (length(btrim(name)) >= 2),
  contact_email text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Identidade. Espelha auth.users 1:1. Sem dados comerciais.';


create table if not exists public.coupons (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  months       smallint not null check (months > 0),
  max_uses     integer check (max_uses > 0),
  current_uses integer not null default 0 check (current_uses >= 0),
  valid_until  date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint coupon_uses_within_limit
    check (max_uses is null or current_uses <= max_uses)
);


-- Substitui `profiles.teacher_id`. Como tabela, o vínculo tem início e fim,
-- então trocar de professor não apaga o histórico de quem acompanhou o aluno.
create table if not exists public.student_teacher_links (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  created_at timestamptz not null default now(),
  constraint link_period_valid  check (ended_at is null or ended_at > started_at),
  constraint link_not_self   check (student_id <> teacher_id)
);

-- Um professor vigente por aluno, garantido pelo banco.
create unique index if not exists active_link_uidx
  on public.student_teacher_links (student_id)
  where ended_at is null;

create index if not exists link_teacher_idx
  on public.student_teacher_links (teacher_id)
  where ended_at is null;


create table if not exists public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  status     public.access_status not null default 'pending',
  plan       text not null default 'teste',
  validity   daterange,
  coupon_id  uuid references public.coupons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_subscription_has_validity
    check (status <> 'active' or validity is not null)
);

-- Uma assinatura ativa por aluno.
-- Nota: para impedir também SOBREPOSIÇÃO entre assinaturas históricas, troque
-- este índice por um EXCLUDE gist — requer `create extension btree_gist`:
--   alter table public.subscriptions add constraint subscription_no_overlap
--     exclude using gist (student_id with =, validity with &&);
-- O índice parcial abaixo resolve o caso real (uma vigente por vez) sem
-- depender da extensão estar no search_path da migração.
create unique index if not exists active_subscription_uidx
  on public.subscriptions (student_id)
  where status = 'active';

create index if not exists subscription_student_idx on public.subscriptions (student_id, status);


create table if not exists public.waitlist (
  student_id    uuid primary key references public.profiles(id) on delete cascade,
  teacher_id    uuid references public.profiles(id) on delete set null,
  name          text not null,
  email         text not null,
  whatsapp      text,
  interest_area text,
  focus_exam    text,
  timezone      text,
  birth_date    date,
  status        text not null default 'aguardando',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 3.2 Catálogo de questões
-- -----------------------------------------------------------------------------
-- O mapa questão → tópico precisa ser tabela, não um JSON de 1 MB baixado a cada
-- login e cruzado em JavaScript. Como tabela, o cruzamento vira JOIN.

create table if not exists public.catalogs (
  key        text primary key,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_blocks (
  id             uuid primary key default gen_random_uuid(),
  catalog_key    text not null references public.catalogs(key) on delete restrict,
  block_key      text not null,
  number         integer not null check (number > 0),
  name           text not null,
  subject_key    text not null,
  subject_name   text not null,
  question_count integer not null default 0 check (question_count >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (catalog_key, block_key),
  unique (catalog_key, subject_key, number)
);

create index if not exists catalog_blocks_subject_idx
  on public.catalog_blocks (catalog_key, subject_key)
  where active;

create table if not exists public.catalog_questions (
  block_id    uuid   not null references public.catalog_blocks(id) on delete cascade,
  question_id bigint not null check (question_id > 0),
  topic       text   not null,
  position    integer not null check (position > 0),
  primary key (block_id, question_id),
  unique (block_id, position)
);

-- Suporta "de que tópico é a questão N", usado na reconstrução do resumo.
create index if not exists catalog_questions_question_idx
  on public.catalog_questions (question_id);


-- -----------------------------------------------------------------------------
-- 3.3 Planejamento
-- -----------------------------------------------------------------------------

create table if not exists public.study_plans (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete restrict,
  teacher_id   uuid not null references public.profiles(id) on delete restrict,
  name         text not null check (length(btrim(name)) > 0),
  area         text,
  target_exam  text,
  stage        text,
  study_model  text,
  weekly_goals integer not null default 24 check (weekly_goals between 1 and 200),
  start_date   date not null default current_date,
  status       public.study_plan_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint study_plan_not_self check (student_id <> teacher_id),
  constraint study_plan_name_unique    unique (student_id, name),
  -- Alvo das FKs compostas das tabelas filhas: garante que a cópia
  -- denormalizada de student_id/teacher_id nunca possa divergir do pai.
  constraint study_plan_context_uk   unique (id, student_id, teacher_id)
);

-- Um planejamento ativo por aluno. Torna inexprimível o estado "dois ativos"
-- (o aluno vê um, o professor edita outro) e o estado "zero ativos".
create unique index if not exists active_study_plan_uidx
  on public.study_plans (student_id)
  where status = 'active' and deleted_at is null;

create index if not exists study_plan_teacher_idx
  on public.study_plans (teacher_id, student_id)
  where deleted_at is null;


create table if not exists public.study_plan_blocks (
  id               uuid primary key default gen_random_uuid(),
  study_plan_id    uuid not null,
  student_id       uuid not null,
  teacher_id       uuid not null,
  catalog_block_id uuid references public.catalog_blocks(id) on delete restrict,

  subject_name     text not null,
  subject_color    text not null default '#5B6B85',
  subject_target   smallint not null default 80 check (subject_target between 0 and 100),
  name             text not null,
  link             text,
  question_count   integer not null default 0 check (question_count >= 0),
  subject_order    integer not null check (subject_order >= 0),
  block_order      integer not null check (block_order >= 0),
  active           boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint study_plan_block_context_fk
    foreign key (study_plan_id, student_id, teacher_id)
    references public.study_plans (id, student_id, teacher_id) on delete cascade,
  -- Alvo das FKs compostas de goals e quiz_sessions.
  constraint study_plan_block_context_uk unique (id, study_plan_id, student_id)
);

create unique index if not exists study_plan_block_order_uidx
  on public.study_plan_blocks (study_plan_id, subject_order, block_order)
  where deleted_at is null;

create index if not exists study_plan_block_plan_idx
  on public.study_plan_blocks (study_plan_id)
  where deleted_at is null and active;


-- Lote de aplicação do planejamento semanal. O `id` É o request_id gerado pelo
-- professor antes de enviar: reenviar o mesmo lote é no-op, não duplica a semana.
create table if not exists public.study_plan_batches (
  id            uuid primary key,
  study_plan_id uuid not null references public.study_plans(id) on delete cascade,
  week_number   smallint not null check (week_number between 1 and 200),
  mode          public.batch_mode not null,
  goal_count    integer not null check (goal_count >= 0),
  applied_at    timestamptz not null default now(),
  applied_by    uuid not null references public.profiles(id) on delete restrict
);

create index if not exists study_plan_batch_idx
  on public.study_plan_batches (study_plan_id, week_number, applied_at desc);


-- -----------------------------------------------------------------------------
-- 3.4 Metas
-- -----------------------------------------------------------------------------
-- Sem campo de texto multiuso e sem contadores. Cada metadado que antes era
-- codificado dentro de `descricao` (TIPO_REFORCO:1, REFORCO_ORIGEM_ID:<uuid>,
-- ORIGEM_SEMANA:n, TIPO_EXTRA:1, ATIVIDADE_EXTRA:..., BORA_BATERIA_V1:<base64>)
-- é agora coluna tipada, FK ou linha em quiz_session_questions.

create table if not exists public.goals (
  id                    uuid primary key default gen_random_uuid(),
  study_plan_id         uuid not null,
  student_id            uuid not null,
  teacher_id            uuid not null,
  batch_id              uuid references public.study_plan_batches(id) on delete set null,

  week_number           smallint not null check (week_number between 1 and 200),
  weekday               smallint not null check (weekday between 0 and 6),
  day_order             smallint not null check (day_order > 0),

  type                  public.goal_type   not null,
  status                public.goal_status not null default 'pending',

  block_id              uuid,
  title                 text not null check (length(btrim(title)) > 0),
  teacher_note          text,
  student_note          text,
  external_link         text,
  planned_minutes       integer check (planned_minutes > 0),

  -- Era REFORCO_ORIGEM_ID dentro de descricao. Agora é FK de verdade.
  source_goal_id        uuid references public.goals(id) on delete restrict,
  source_week           smallint check (source_week between 1 and 200),
  reinforcement_skipped boolean not null default false,
  extra_activity        text,

  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  created_by            uuid not null references public.profiles(id) on delete restrict,

  constraint goal_context_fk
    foreign key (study_plan_id, student_id, teacher_id)
    references public.study_plans (id, student_id, teacher_id) on delete restrict,
  constraint goal_block_fk
    foreign key (block_id, study_plan_id, student_id)
    references public.study_plan_blocks (id, study_plan_id, student_id) on delete restrict,

  constraint goal_block_required
    check (type <> 'question_block' or block_id is not null),
  constraint goal_reinforcement_has_source
    check (type <> 'reinforcement' or source_goal_id is not null),
  constraint goal_extra_has_activity
    check (type <> 'extra_study' or extra_activity is not null),
  constraint goal_completion_consistent
    check ((status = 'completed') = (completed_at is not null)),
  constraint goal_source_not_self
    check (source_goal_id is null or source_goal_id <> id)
);

-- Torna a colisão de posição um erro do banco em vez de dado sujo.
-- O predicado parcial é o que permite o fluxo "substituir": a meta antiga é
-- marcada como excluída e sai do índice, liberando a posição para a nova.
create unique index if not exists goal_position_uidx
  on public.goals (study_plan_id, week_number, weekday, day_order)
  where deleted_at is null;

create index if not exists goal_schedule_idx
  on public.goals (study_plan_id, week_number, weekday, day_order)
  where deleted_at is null;

create index if not exists goal_student_status_idx
  on public.goals (student_id, status)
  where deleted_at is null;

create index if not exists goal_source_idx
  on public.goals (source_goal_id)
  where source_goal_id is not null;


-- -----------------------------------------------------------------------------
-- 3.5 Baterias
-- -----------------------------------------------------------------------------

create table if not exists public.quiz_sessions (
  id                 uuid primary key default gen_random_uuid(),
  study_plan_id      uuid not null,
  student_id         uuid not null,
  teacher_id         uuid not null,
  block_id           uuid not null,
  -- RESTRICT, não SET NULL: uma bateria nunca perde o vínculo com sua meta.
  goal_id            uuid references public.goals(id) on delete restrict,
  origin             public.quiz_session_origin not null default 'goal',

  execution_sequence integer  not null check (execution_sequence > 0),
  session_number     integer  check (session_number > 0),
  main_target        smallint not null default 15 check (main_target between 1 and 50),

  status             public.quiz_session_status not null default 'in_progress',
  duration_minutes   integer check (duration_minutes > 0),

  completion_id      uuid,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  voided_at          timestamptz,
  voided_by          uuid references public.profiles(id) on delete restrict,
  void_reason        text,
  updated_at         timestamptz not null default now(),

  constraint quiz_session_context_fk
    foreign key (study_plan_id, student_id, teacher_id)
    references public.study_plans (id, student_id, teacher_id) on delete restrict,
  constraint quiz_session_block_fk
    foreign key (block_id, study_plan_id, student_id)
    references public.study_plan_blocks (id, study_plan_id, student_id) on delete restrict,

  constraint quiz_session_origin_check check (
    (origin = 'goal'          and goal_id is not null and session_number is not null)
    or
    (origin = 'error_notebook' and goal_id is null     and session_number is null)
  ),

  -- Máquina de estados declarativa. Cada status define exatamente quais marcos
  -- temporais existem. Os contadores saíram: a contagem vem do ledger, e a
  -- validação de quantidade acontece dentro de finish_quiz_session.
  constraint quiz_session_state_check check (
    case status
      when 'in_progress' then
        finished_at is null and completed_at is null and cancelled_at is null
        and voided_at is null and voided_by is null
        and duration_minutes is null and completion_id is null
      when 'awaiting_time' then
        finished_at is not null and completed_at is null and cancelled_at is null
        and voided_at is null and voided_by is null
        and duration_minutes is null and completion_id is not null
      when 'completed' then
        finished_at is not null and completed_at is not null and cancelled_at is null
        and voided_at is null and voided_by is null
        and duration_minutes is not null and completion_id is not null
      when 'cancelled' then
        finished_at is not null and cancelled_at is not null and completed_at is null
        and voided_at is null and voided_by is null
        and duration_minutes is null and completion_id is not null
      when 'voided' then
        finished_at is not null and cancelled_at is null
        and voided_at is not null and voided_by is not null
        and completion_id is not null
      else false
    end
  )
);

-- Uma bateria aberta por planejamento. Antes isso era validado só dentro da RPC.
create unique index if not exists open_quiz_session_uidx
  on public.quiz_sessions (study_plan_id)
  where status in ('in_progress','awaiting_time');

-- Número visível do bloco: cancelada/anulada não consome o número.
create unique index if not exists quiz_session_number_uidx
  on public.quiz_sessions (study_plan_id, block_id, session_number)
  where session_number is not null and status not in ('cancelled','voided');

-- Uma meta só pode ter uma bateria válida; pode ser refeita se a anterior caiu.
create unique index if not exists quiz_session_goal_uidx
  on public.quiz_sessions (goal_id)
  where goal_id is not null and status not in ('cancelled','voided');

create unique index if not exists quiz_session_completion_uidx
  on public.quiz_sessions (completion_id)
  where completion_id is not null;

create index if not exists quiz_session_student_idx
  on public.quiz_sessions (student_id, study_plan_id, started_at desc);

create index if not exists quiz_session_block_completed_idx
  on public.quiz_sessions (study_plan_id, block_id)
  where status = 'completed';


-- -----------------------------------------------------------------------------
-- 3.6 Ledger de questões — a fonte única de verdade
-- -----------------------------------------------------------------------------
-- Append-only. Todo número de desempenho do sistema é derivado desta tabela.
-- Nenhum agregado é escrito à mão em lugar nenhum.

create table if not exists public.quiz_session_questions (
  id                 uuid   primary key default gen_random_uuid(),
  quiz_session_id    uuid   not null references public.quiz_sessions(id) on delete restrict,
  question_id        bigint not null check (question_id > 0),
  execution_order    smallint not null check (execution_order > 0),
  round              smallint not null default 0 check (round >= 0),
  phase              public.question_phase      not null,
  outcome            public.question_outcome not null,
  topic              text,
  source_question_id bigint check (source_question_id > 0),
  answered_at        timestamptz not null,
  recorded_at        timestamptz not null default now(),

  -- Impede que um retry duplique respostas dentro da mesma bateria, mesmo que
  -- a chave de idempotência falhe na camada de cima.
  constraint quiz_session_question_unique  unique (quiz_session_id, question_id, round),
  constraint quiz_session_order_unique    unique (quiz_session_id, execution_order),
  constraint reinforcement_has_source
    check ((phase = 'reinforcement') = (source_question_id is not null))
);

create index if not exists quiz_session_questions_session_idx
  on public.quiz_session_questions (quiz_session_id, phase);

create index if not exists quiz_session_questions_question_idx
  on public.quiz_session_questions (question_id);


-- -----------------------------------------------------------------------------
-- 3.7 Reforços por ciclo
-- -----------------------------------------------------------------------------
-- Sem uuid[], sem chave derivada por concatenação e sem JSONB: tabela de junção
-- com integridade referencial e tabela filha agregável em SQL.

create table if not exists public.reinforcements (
  id            uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null,
  student_id    uuid not null,
  teacher_id    uuid not null,
  block_id      uuid not null,
  request_id    uuid not null unique,
  cutoff        timestamptz not null,
  source_score  smallint not null check (source_score between 0 and 100),
  completed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint reinforcement_context_fk
    foreign key (study_plan_id, student_id, teacher_id)
    references public.study_plans (id, student_id, teacher_id) on delete restrict,
  constraint reinforcement_block_fk
    foreign key (block_id, study_plan_id, student_id)
    references public.study_plan_blocks (id, study_plan_id, student_id) on delete restrict
);

create index if not exists reinforcement_student_idx
  on public.reinforcements (student_id, study_plan_id, completed_at desc);


-- Substitui `baterias_origem uuid[]` + `ciclo_chave`.
create table if not exists public.reinforcement_sessions (
  reinforcement_id uuid not null references public.reinforcements(id) on delete cascade,
  quiz_session_id  uuid not null references public.quiz_sessions(id) on delete restrict,
  primary key (reinforcement_id, quiz_session_id),
  -- Garantia mais forte que a chave de ciclo concatenada: uma bateria não pode
  -- ser reaproveitada em dois ciclos de reforço diferentes.
  constraint session_in_single_cycle unique (quiz_session_id)
);


-- Substitui `resultado_reforco jsonb`.
create table if not exists public.reinforcement_questions (
  reinforcement_id uuid   not null references public.reinforcements(id) on delete cascade,
  question_id      bigint not null check (question_id > 0),
  phase            public.question_phase      not null,
  outcome          public.question_outcome not null,
  topic            text,
  primary key (reinforcement_id, question_id)
);


-- Estado do ciclo de revisão. Antes vivia só no localStorage, o que fazia o
-- aluno refazer reforços concluídos ao trocar de navegador.
create table if not exists public.review_cycles (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  block_id         uuid not null references public.study_plan_blocks(id) on delete cascade,
  cutoff           timestamptz not null,
  completed_at     timestamptz not null default now(),
  reinforcement_id uuid references public.reinforcements(id) on delete set null,
  unique (student_id, block_id, cutoff)
);

create index if not exists review_cycle_block_idx
  on public.review_cycles (student_id, block_id, cutoff desc);


-- -----------------------------------------------------------------------------
-- 3.8 Preferências, idempotência e auditoria
-- -----------------------------------------------------------------------------

-- jsonb é apropriado aqui: preferência de interface, sem relacionamento nem
-- necessidade de agregação. O critério não é "jsonb é ruim", é se o conteúdo
-- tem estrutura relacional que precisa de integridade ou consulta.
create table if not exists public.student_preferences (
  student_id    uuid primary key references public.profiles(id) on delete cascade,
  theme         text not null default 'claro',
  cycle_config  jsonb not null default '{}'::jsonb,
  review_config jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);


-- Registro de operações mutantes. O par (request_id, payload_hash) é o que
-- torna todo retry seguro: mesmo hash devolve o resultado anterior sem
-- reexecutar; hash diferente é rejeitado em vez de aceito como replay.
create table if not exists public.operations (
  request_id   uuid primary key,
  operation    text not null,
  actor_id     uuid not null references public.profiles(id) on delete restrict,
  target_id    uuid,
  payload_hash text not null,
  result       jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists operation_target_idx on public.operations (target_id, operation, created_at desc);


create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('insert','update','delete')),
  actor_id    uuid,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_record_idx
  on public.audit_log (table_name, record_id, occurred_at desc);


-- =============================================================================
-- 4. VIEWS DE DESEMPENHO
-- =============================================================================
-- security_invoker garante que a RLS das tabelas base seja aplicada a quem
-- consulta a view — sem isso a view rodaria com os privilégios do dono e
-- vazaria dados entre alunos.

create or replace view public.vw_quiz_session_performance
with (security_invoker = true) as
select
  s.id               as quiz_session_id,
  s.student_id,
  s.teacher_id,
  s.study_plan_id,
  s.block_id,
  s.goal_id,
  s.status,
  s.main_target,
  s.duration_minutes,

  count(*) filter (where q.phase = 'main')                                     as main_count,
  count(*) filter (where q.phase = 'main'          and q.outcome = 'correct')   as main_correct,
  count(*) filter (where q.phase = 'main'          and q.outcome = 'incorrect') as main_incorrect,

  count(*) filter (where q.phase = 'reinforcement')                            as reinforcement_count,
  count(*) filter (where q.phase = 'reinforcement' and q.outcome = 'correct')   as reinforcement_correct,
  count(*) filter (where q.phase = 'reinforcement' and q.outcome = 'incorrect') as reinforcement_incorrect,

  count(*) filter (where q.phase = 'extra')                                    as extra_count,
  count(*) filter (where q.phase = 'extra'         and q.outcome = 'correct')   as extra_correct,
  count(*) filter (where q.phase = 'extra'         and q.outcome = 'incorrect') as extra_incorrect,

  count(q.id)                                                                  as total_count,
  count(*) filter (where q.outcome = 'correct')                                as total_correct,
  count(*) filter (where q.outcome = 'incorrect')                              as total_incorrect
from public.quiz_sessions s
left join public.quiz_session_questions q on q.quiz_session_id = s.id
group by s.id;

comment on view public.vw_quiz_session_performance is
  'Desempenho de uma sessão, por fase. main_* é a nota oficial; total_* inclui extras e reforços.';


-- A nota da meta sai SÓ das principais. Extras e reforços praticados durante a
-- sessão contam para o aproveitamento total, nunca para a nota.
create or replace view public.vw_goal_performance
with (security_invoker = true) as
select
  g.id            as goal_id,
  g.student_id,
  g.teacher_id,
  g.study_plan_id,
  g.status,
  coalesce(sum(d.main_count), 0)   as questions_answered,
  coalesce(sum(d.main_correct), 0) as correct_answers,
  sum(s.duration_minutes)          as minutes_spent
from public.goals g
left join public.quiz_sessions s
       on s.goal_id = g.id and s.status = 'completed'
left join public.vw_quiz_session_performance d
       on d.quiz_session_id = s.id
where g.deleted_at is null
group by g.id;


-- Substitui o SELECT que trazia dezenas de milhares de linhas do ledger para
-- agregar em JavaScript sob o teto de linhas do PostgREST. Aqui volta uma linha
-- por questão distinta — algumas centenas.
--
-- Todas as fases contam como "vista": uma questão respondida como extra não
-- deve reaparecer como inédita na sessão seguinte.
create or replace view public.vw_seen_questions
with (security_invoker = true) as
select
  s.student_id,
  s.study_plan_id,
  s.block_id,
  q.question_id,
  count(*)                                              as times_seen,
  count(*) filter (where q.outcome = 'correct')         as correct_answers,
  count(*) filter (where q.outcome = 'incorrect')       as incorrect_answers,
  max(q.answered_at)                                    as last_seen_at
from public.quiz_session_questions q
join public.quiz_sessions s on s.id = q.quiz_session_id
where s.status = 'completed'
group by s.student_id, s.study_plan_id, s.block_id, q.question_id;


-- Alimenta a tabela "Blocos x desempenho", que mostra as duas medidas lado a
-- lado: a nota oficial e o que o aluno de fato praticou no bloco.
create or replace view public.vw_block_performance
with (security_invoker = true) as
select
  d.student_id,
  d.study_plan_id,
  d.block_id,
  count(*)                        as session_count,

  sum(d.main_count)               as main_count,
  sum(d.main_correct)             as main_correct,
  sum(d.main_incorrect)           as main_incorrect,

  sum(d.extra_count)              as extra_count,
  sum(d.extra_correct)            as extra_correct,
  sum(d.extra_incorrect)          as extra_incorrect,

  sum(d.reinforcement_count)      as reinforcement_count,
  sum(d.reinforcement_correct)    as reinforcement_correct,
  sum(d.reinforcement_incorrect)  as reinforcement_incorrect,

  sum(d.total_count)              as total_count,
  sum(d.total_correct)            as total_correct,
  sum(d.total_incorrect)          as total_incorrect,

  -- Nota oficial: só principais. É por ela que os blocos são ordenados.
  case when sum(d.main_count) > 0
       then round(100.0 * sum(d.main_correct) / sum(d.main_count))::smallint
  end                             as official_score_pct,

  -- Aproveitamento total: tudo que o aluno resolveu no bloco.
  case when sum(d.total_count) > 0
       then round(100.0 * sum(d.total_correct) / sum(d.total_count))::smallint
  end                             as total_score_pct
from public.vw_quiz_session_performance d
where d.status = 'completed'
group by d.student_id, d.study_plan_id, d.block_id;

comment on view public.vw_block_performance is
  'Composição e desempenho de um bloco. official_score_pct usa só principais; total_score_pct inclui extras e reforços.';


-- Caderno de erros: uma linha por questão distinta errada no bloco, somando as
-- três fases, com a fase da ocorrência mais recente para a UI rotular.
create or replace view public.vw_block_errors
with (security_invoker = true) as
select
  s.student_id,
  s.study_plan_id,
  s.block_id,
  q.question_id,
  max(q.topic)                                                as topic,
  count(*)                                                    as error_count,
  count(*) filter (where q.phase = 'main')                    as main_errors,
  count(*) filter (where q.phase = 'extra')                   as extra_errors,
  count(*) filter (where q.phase = 'reinforcement')           as reinforcement_errors,
  max(q.answered_at)                                          as last_error_at,
  (array_agg(q.phase order by q.answered_at desc))[1]         as last_error_phase
from public.quiz_session_questions q
join public.quiz_sessions s on s.id = q.quiz_session_id
where s.status = 'completed'
  and q.outcome = 'incorrect'
group by s.student_id, s.study_plan_id, s.block_id, q.question_id;

comment on view public.vw_block_errors is
  'Questões erradas por bloco, somando as três fases. Uma linha por questão distinta.';


-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','subscriptions','waitlist','catalog_blocks','study_plans',
    'study_plan_blocks','goals','quiz_sessions','student_preferences'
  ] loop
    execute format(
      'drop trigger if exists tg_%1$s_atualizado_em on public.%1$s;
       create trigger tg_%1$s_atualizado_em before update on public.%1$s
         for each row execute function public.tg_set_updated_at();', t);
  end loop;
end;
$$;


-- O ledger é append-only: nem UPDATE nem DELETE, nem por RPC security definer.
create or replace function public.tg_block_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'quiz_session_questions e append-only: % nao permitido', tg_op
    using errcode = '0A000';
end;
$$;

drop trigger if exists tg_bateria_questoes_imutavel on public.quiz_session_questions;
create trigger tg_bateria_questoes_imutavel
  before update or delete on public.quiz_session_questions
  for each row execute function public.tg_block_ledger_mutation();


create or replace function public.tg_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  uuid;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  v_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);

  insert into public.audit_log (table_name, record_id, action, actor_id, old_value, new_value)
  values (tg_table_name, v_id, lower(tg_op), auth.uid(), v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['study_plans','goals','quiz_sessions','subscriptions'] loop
    execute format(
      'drop trigger if exists tg_%1$s_auditoria on public.%1$s;
       create trigger tg_%1$s_auditoria after insert or update or delete on public.%1$s
         for each row execute function public.tg_write_audit_log();', t);
  end loop;
end;
$$;


-- Criação automática do perfil quando um usuário se registra.
create or replace function public.tg_create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, name, contact_email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'role',''), 'student')::public.user_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(coalesce(new.email,'student'), '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_create_profile_for_new_user();


-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
-- Helpers SECURITY DEFINER para evitar recursão entre políticas.

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','admin'));
$$;

create or replace function public.is_teacher_of(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_teacher_links v
     where v.student_id = p_student_id and v.teacher_id = auth.uid() and v.ended_at is null
  );
$$;

-- Predicado padrão das tabelas que carregam o contexto denormalizado.
create or replace function public.can_view_context(p_student_id uuid, p_professor_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_student_id or auth.uid() = p_professor_id;
$$;

alter table public.profiles                   enable row level security;
alter table public.coupons                   enable row level security;
alter table public.student_teacher_links enable row level security;
alter table public.subscriptions              enable row level security;
alter table public.waitlist             enable row level security;
alter table public.catalogs                enable row level security;
alter table public.catalog_blocks          enable row level security;
alter table public.catalog_questions        enable row level security;
alter table public.study_plans            enable row level security;
alter table public.study_plan_blocks      enable row level security;
alter table public.study_plan_batches       enable row level security;
alter table public.goals                    enable row level security;
alter table public.quiz_sessions                 enable row level security;
alter table public.quiz_session_questions         enable row level security;
alter table public.reinforcements                 enable row level security;
alter table public.reinforcement_sessions         enable row level security;
alter table public.reinforcement_questions         enable row level security;
alter table public.review_cycles           enable row level security;
alter table public.student_preferences       enable row level security;
alter table public.operations                enable row level security;
alter table public.audit_log                enable row level security;

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_teacher_of(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- vínculos
drop policy if exists links_read on public.student_teacher_links;
create policy links_read on public.student_teacher_links for select to authenticated
  using (student_id = auth.uid() or teacher_id = auth.uid());

-- subscriptions: leitura própria; escrita só por service_role.
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(student_id));

-- coupons: só o código público, para validação no cadastro.
drop policy if exists coupons_read on public.coupons;
create policy coupons_read on public.coupons for select to authenticated
  using (active and (valid_until is null or valid_until >= current_date));

-- lista de espera
drop policy if exists waitlist_own on public.waitlist;
create policy waitlist_own on public.waitlist for all to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(student_id))
  with check (student_id = auth.uid());

-- catálogo: leitura para todo autenticado.
drop policy if exists catalogs_read on public.catalogs;
create policy catalogs_read on public.catalogs for select to authenticated using (active);

drop policy if exists catalog_blocks_read on public.catalog_blocks;
create policy catalog_blocks_read on public.catalog_blocks for select to authenticated using (active);

drop policy if exists catalog_questions_read on public.catalog_questions;
create policy catalog_questions_read on public.catalog_questions for select to authenticated using (true);

-- planejamento e execução: leitura pelo contexto, escrita só por RPC.
drop policy if exists study_plans_read on public.study_plans;
create policy study_plans_read on public.study_plans for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

drop policy if exists study_plan_blocks_read on public.study_plan_blocks;
create policy study_plan_blocks_read on public.study_plan_blocks for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

drop policy if exists batches_read on public.study_plan_batches;
create policy batches_read on public.study_plan_batches for select to authenticated
  using (exists (select 1 from public.study_plans p
                  where p.id = study_plan_id and public.can_view_context(p.student_id, p.teacher_id)));

drop policy if exists goals_read on public.goals;
create policy goals_read on public.goals for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

drop policy if exists quiz_sessions_read on public.quiz_sessions;
create policy quiz_sessions_read on public.quiz_sessions for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

drop policy if exists quiz_session_questions_read on public.quiz_session_questions;
create policy quiz_session_questions_read on public.quiz_session_questions for select to authenticated
  using (exists (select 1 from public.quiz_sessions b
                  where b.id = quiz_session_id and public.can_view_context(b.student_id, b.teacher_id)));

drop policy if exists reinforcements_read on public.reinforcements;
create policy reinforcements_read on public.reinforcements for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

drop policy if exists reinforcement_sessions_read on public.reinforcement_sessions;
create policy reinforcement_sessions_read on public.reinforcement_sessions for select to authenticated
  using (exists (select 1 from public.reinforcements r
                  where r.id = reinforcement_id and public.can_view_context(r.student_id, r.teacher_id)));

drop policy if exists reinforcement_questions_read on public.reinforcement_questions;
create policy reinforcement_questions_read on public.reinforcement_questions for select to authenticated
  using (exists (select 1 from public.reinforcements r
                  where r.id = reinforcement_id and public.can_view_context(r.student_id, r.teacher_id)));

drop policy if exists review_cycles_own on public.review_cycles;
create policy review_cycles_own on public.review_cycles for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_of(student_id));

-- Preferências: única tabela em que o client escreve direto. É estado de UI,
-- não dado de domínio, e a chave primária já é o próprio dono.
drop policy if exists preferences_own on public.student_preferences;
create policy preferences_own on public.student_preferences for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists operations_own on public.operations;
create policy operations_own on public.operations for select to authenticated
  using (actor_id = auth.uid());

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using (public.is_teacher());


-- =============================================================================
-- 7. RPCs — a única via de escrita nas tabelas transacionais
-- =============================================================================

-- Idempotência compartilhada. Devolve o resultado anterior se o mesmo
-- request_id chegar com o mesmo payload; rejeita se o payload mudou.
create or replace function public.reserve_operation(
  p_request_id uuid,
  p_operation   text,
  p_alvo_id    uuid,
  p_payload    text,
  out reserved boolean,
  out previous  jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := md5(coalesce(p_payload, ''));
  v_previous public.operations%rowtype;
begin
  if p_request_id is null then
    raise exception 'request_id obrigatorio' using errcode = '22004';
  end if;

  insert into public.operations (request_id, operation, actor_id, target_id, payload_hash)
  values (p_request_id, p_operation, auth.uid(), p_alvo_id, v_hash)
  on conflict (request_id) do nothing;

  if found then
    reserved := true;
    previous  := null;
    return;
  end if;

  select * into v_previous from public.operations o where o.request_id = p_request_id;

  if v_previous.payload_hash <> v_hash then
    raise exception 'request_id % ja utilizado com outro payload', p_request_id
      using errcode = '23505';
  end if;

  reserved := false;
  previous  := coalesce(v_previous.result, '{}'::jsonb);
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.1 Ativar planejamento (troca atômica)
-- -----------------------------------------------------------------------------
create or replace function public.activate_study_plan(p_study_plan_id uuid)
returns public.study_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.study_plans%rowtype;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.deleted_at is null
   for update;
  if not found then raise exception 'planejamento nao encontrado'; end if;
  if v_plan.teacher_id <> v_uid then
    raise exception 'somente o professor responsavel pode ativar o planejamento' using errcode='42501';
  end if;

  -- Arquiva e ativa na mesma transação. O índice parcial active_study_plan_uidx
  -- torna impossível terminar com dois ativos ou com nenhum.
  update public.study_plans
     set status = 'archived'
   where student_id = v_plan.student_id
     and status = 'active'
     and id <> p_study_plan_id
     and deleted_at is null;

  update public.study_plans
     set status = 'active'
   where id = p_study_plan_id
   returning * into v_plan;

  return v_plan;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.2 Aplicar lote de goals da semana
-- -----------------------------------------------------------------------------
-- Substitui o DELETE + INSERT não transacional feito pelo client. Reenviar o
-- mesmo lote é no-op; um DELETE que falha aborta a transação inteira.
create or replace function public.apply_study_plan_batch(
  p_batch_id         uuid,
  p_study_plan_id uuid,
  p_week          smallint,
  p_mode            public.batch_mode,
  p_goals           jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_plan   public.study_plans%rowtype;
  v_count    integer;
  v_blocking   integer;
  v_result    jsonb;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_goals is null or jsonb_typeof(p_goals) <> 'array' then
    raise exception 'p_goals deve ser um array JSON';
  end if;

  -- Replay: o lote já foi aplicado, devolve o resultado sem tocar em goals.
  select l.goal_count into v_count from public.study_plan_batches l where l.id = p_batch_id;
  if found then
    return jsonb_build_object('batch_id', p_batch_id, 'goals_inserted', v_count, 'replay', true);
  end if;

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.deleted_at is null
   for update;
  if not found then raise exception 'planejamento nao encontrado'; end if;
  if v_plan.teacher_id <> v_uid then
    raise exception 'somente o professor responsavel pode planejar' using errcode='42501';
  end if;

  -- Uma bateria aberta impede substituir a semana: os resultados dela ainda
  -- não foram gravados e seriam perdidos.
  if p_mode in ('replace','replan') then
    select count(*) into v_blocking
      from public.quiz_sessions b
      join public.goals m on m.id = b.goal_id
     where m.study_plan_id = p_study_plan_id
       and m.week_number = p_week
       and m.deleted_at is null
       and b.status in ('in_progress','awaiting_time');
    if v_blocking > 0 then
      raise exception 'ha bateria aberta nesta semana; finalize ou cancele antes de replanejar';
    end if;
  end if;

  -- Soft delete. Metas concluídas só saem no modo replanejar, e mesmo assim
  -- continuam na tabela e no audit_log.
  if p_mode = 'replace' then
    update public.goals
       set deleted_at = now()
     where study_plan_id = p_study_plan_id
       and week_number = p_week
       and deleted_at is null
       and status in ('pending','in_progress','skipped');
  elsif p_mode = 'replan' then
    update public.goals
       set deleted_at = now()
     where study_plan_id = p_study_plan_id
       and week_number = p_week
       and deleted_at is null
       and not exists (select 1 from public.quiz_sessions b
                        where b.goal_id = goals.id and b.status = 'completed');
  end if;

  insert into public.study_plan_batches (id, study_plan_id, week_number, mode, goal_count, applied_by)
  values (p_batch_id, p_study_plan_id, p_week, p_mode, jsonb_array_length(p_goals), v_uid);

  -- day_order é gerada aqui, continuando a maior ordem sobrevivente do dia.
  -- Nunca é calculada no client por leitura-do-máximo.
  with entrada as (
    select
      x.weekday,
      x.type,
      x.block_id,
      x.title,
      x.teacher_note,
      x.external_link,
      x.planned_minutes,
      x.source_goal_id,
      x.source_week,
      x.extra_activity,
      row_number() over (partition by x.weekday order by x.position, x.title) as seq
    from jsonb_to_recordset(p_goals) as x(
      weekday           smallint,
      position              integer,
      type                 text,
      block_id             uuid,
      title               text,
      teacher_note text,
      external_link         text,
      planned_minutes   integer,
      source_goal_id       uuid,
      source_week        smallint,
      extra_activity      text
    )
  ),
  base as (
    select e.*, coalesce(
      (select max(m.day_order) from public.goals m
        where m.study_plan_id = p_study_plan_id
          and m.week_number = p_week
          and m.weekday = e.weekday
          and m.deleted_at is null), 0) as offset_dia
    from entrada e
  )
  insert into public.goals (
    study_plan_id, student_id, teacher_id, batch_id,
    week_number, weekday, day_order,
    type, block_id, title, teacher_note, external_link,
    planned_minutes, source_goal_id, source_week, extra_activity, created_by
  )
  select
    p_study_plan_id, v_plan.student_id, v_plan.teacher_id, p_batch_id,
    p_week, b.weekday, (b.offset_dia + b.seq)::smallint,
    b.type::public.goal_type, b.block_id, b.title, b.teacher_note, b.external_link,
    b.planned_minutes, b.source_goal_id, b.source_week, b.extra_activity, v_uid
  from base b;

  get diagnostics v_count = row_count;

  v_result := jsonb_build_object('batch_id', p_batch_id, 'goals_inserted', v_count, 'replay', false);
  update public.operations
     set result = v_result where request_id = p_batch_id;
  return v_result;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.3 Iniciar bateria
-- -----------------------------------------------------------------------------
create or replace function public.start_quiz_session(
  p_study_plan_id uuid,
  p_block_id        uuid,
  p_goal_id         uuid
)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_plan      public.study_plans%rowtype;
  v_block     public.study_plan_blocks%rowtype;
  v_goal      public.goals%rowtype;
  v_session   public.quiz_sessions%rowtype;
  v_sequence integer;
  v_number    integer;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.status = 'active' and p.deleted_at is null
   for update;
  if not found then raise exception 'planejamento nao esta active'; end if;
  if v_plan.student_id <> v_uid then
    raise exception 'somente o aluno pode iniciar a bateria' using errcode='42501';
  end if;

  select * into v_block from public.study_plan_blocks pb
   where pb.id = p_block_id and pb.study_plan_id = p_study_plan_id
     and pb.active and pb.deleted_at is null;
  if not found then raise exception 'bloco invalido ou indisponivel'; end if;

  -- A retomada é avaliada ANTES da validação da meta: como start_quiz_session
  -- move a meta para 'em_andamento', exigir 'pendente' aqui faria a segunda
  -- chamada falhar em vez de devolver a bateria já aberta.
  select * into v_session from public.quiz_sessions b
   where b.study_plan_id = p_study_plan_id
     and b.status in ('in_progress','awaiting_time');
  if found then
    if v_session.goal_id = p_goal_id then return v_session; end if;
    raise exception 'ja existe uma bateria aberta neste planejamento';
  end if;

  select * into v_goal from public.goals m
   where m.id = p_goal_id and m.study_plan_id = p_study_plan_id
     and m.block_id = p_block_id and m.type = 'question_block'
     and m.status = 'pending' and m.deleted_at is null;
  if not found then raise exception 'meta nao e uma meta de questoes pendente deste bloco'; end if;

  -- Seriação garantida pelo FOR UPDATE no planejamento, acima.
  select coalesce(max(b.execution_sequence), 0) + 1 into v_sequence
    from public.quiz_sessions b
   where b.study_plan_id = p_study_plan_id and b.block_id = p_block_id;

  select coalesce(max(b.session_number), 0) + 1 into v_number
    from public.quiz_sessions b
   where b.study_plan_id = p_study_plan_id and b.block_id = p_block_id
     and b.session_number is not null
     and b.status not in ('cancelled','voided');

  insert into public.quiz_sessions (
    study_plan_id, student_id, teacher_id, block_id, goal_id, origin,
    execution_sequence, session_number, main_target, status
  ) values (
    p_study_plan_id, v_plan.student_id, v_plan.teacher_id, p_block_id, p_goal_id, 'goal',
    v_sequence, v_number, 15, 'in_progress'
  ) returning * into v_session;

  update public.goals set status = 'in_progress' where id = p_goal_id;

  return v_session;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.4 Finalizar bateria
-- -----------------------------------------------------------------------------
create or replace function public.finish_quiz_session(
  p_quiz_session_id uuid,
  p_request_id uuid,
  p_outcomes jsonb,
  p_cancel   boolean default false
)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_session    public.quiz_sessions%rowtype;
  v_reservation    record;
  v_main integer;
  v_reinforcement_qty   integer;
  v_extras     integer;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception 'p_outcomes deve ser um array JSON';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'finish_quiz_session', p_quiz_session_id,
    p_quiz_session_id::text || '|' || coalesce(p_cancel,false)::text || '|' || p_outcomes::text
  );

  select * into v_session from public.quiz_sessions b where b.id = p_quiz_session_id for update;
  if not found then raise exception 'bateria nao encontrada'; end if;
  if v_session.student_id <> v_uid then
    raise exception 'somente o aluno pode finalizar a bateria' using errcode='42501';
  end if;

  -- Replay: devolve o estado atual sem regravar nada.
  if not v_reservation.reserved then return v_session; end if;

  if v_session.status <> 'in_progress' then
    raise exception 'bateria ja finalizada (status %)', v_session.status;
  end if;

  insert into public.quiz_session_questions (
    quiz_session_id, question_id, execution_order, round, phase, outcome,
    topic, source_question_id, answered_at
  )
  select
    p_quiz_session_id, x.question_id, x.execution_order, coalesce(x.round, 0),
    x.phase::public.question_phase, x.outcome::public.question_outcome,
    nullif(btrim(coalesce(x.topic,'')), ''), x.source_question_id,
    coalesce(x.answered_at, now())
  from jsonb_to_recordset(p_outcomes) as x(
    question_id        bigint,
    execution_order    smallint,
    round            smallint,
    phase              text,
    outcome         text,
    topic            text,
    source_question_id bigint,
    answered_at     timestamptz
  );

  select
    count(*) filter (where phase = 'main'),
    count(*) filter (where phase = 'reinforcement'),
    count(*) filter (where phase = 'extra')
    into v_main, v_reinforcement_qty, v_extras
  from public.quiz_session_questions where quiz_session_id = p_quiz_session_id;

  if not p_cancel then
    if v_main < 1 or v_main > v_session.main_target then
      raise exception 'bateria concluida exige entre 1 e % questoes principais', v_session.main_target;
    end if;
    if (v_reinforcement_qty > 0 or v_extras > 0) and v_main <> v_session.main_target then
      raise exception 'reinforcements/extras so podem existir depois de todas as principais';
    end if;
    if mod(v_extras, 5) <> 0 then
      raise exception 'questoes extras sao adicionadas em blocos de 5';
    end if;
  end if;

  if p_cancel then
    update public.quiz_sessions
       set status = 'cancelled', finished_at = now(), cancelled_at = now(),
           completion_id = p_request_id
     where id = p_quiz_session_id returning * into v_session;
    update public.goals set status = 'pending'
     where id = v_session.goal_id and status = 'in_progress';
  else
    update public.quiz_sessions
       set status = 'awaiting_time', finished_at = now(),
           completion_id = p_request_id
     where id = p_quiz_session_id returning * into v_session;
  end if;

  update public.operations
     set result = jsonb_build_object('quiz_session_id', p_quiz_session_id, 'status', v_session.status)
   where request_id = p_request_id;

  return v_session;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.5 Registrar tempo (conclui a bateria e a meta)
-- -----------------------------------------------------------------------------
create or replace function public.record_quiz_session_time(
  p_quiz_session_id    uuid,
  p_request_id    uuid,
  p_duration_minutes integer
)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.quiz_sessions%rowtype;
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'tempo em minutos deve ser positivo';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'record_quiz_session_time', p_quiz_session_id,
    p_quiz_session_id::text || '|' || p_duration_minutes::text
  );

  select * into v_session from public.quiz_sessions b where b.id = p_quiz_session_id for update;
  if not found then raise exception 'bateria nao encontrada'; end if;
  if v_session.student_id <> v_uid then
    raise exception 'somente o aluno pode registrar o tempo' using errcode='42501';
  end if;

  if not v_reservation.reserved then return v_session; end if;

  if v_session.status <> 'awaiting_time' then
    raise exception 'bateria nao esta aguardando tempo (status %)', v_session.status;
  end if;

  update public.quiz_sessions
     set status = 'completed', completed_at = now(), duration_minutes = p_duration_minutes
   where id = p_quiz_session_id returning * into v_session;

  update public.goals
     set status = 'completed', completed_at = now()
   where id = v_session.goal_id and deleted_at is null;

  update public.operations
     set result = jsonb_build_object('quiz_session_id', p_quiz_session_id, 'status', 'completed')
   where request_id = p_request_id;

  return v_session;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.6 Anular bateria (professor)
-- -----------------------------------------------------------------------------
-- Nunca apaga: o ledger fica intacto e a meta volta a pendente.
create or replace function public.void_quiz_session(
  p_quiz_session_id uuid,
  p_request_id uuid,
  p_reason     text default null
)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.quiz_sessions%rowtype;
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'void_quiz_session', p_quiz_session_id,
    p_quiz_session_id::text || '|' || coalesce(p_reason,'')
  );

  select * into v_session from public.quiz_sessions b where b.id = p_quiz_session_id for update;
  if not found then raise exception 'bateria nao encontrada'; end if;
  if v_session.teacher_id <> v_uid then
    raise exception 'somente o professor responsavel pode anular' using errcode='42501';
  end if;

  if not v_reservation.reserved then return v_session; end if;
  if v_session.status = 'voided' then return v_session; end if;
  if v_session.status not in ('completed','awaiting_time') then
    raise exception 'somente bateria finalizada pode ser anulada';
  end if;

  update public.quiz_sessions
     set status = 'voided', voided_at = now(), voided_by = v_uid,
         completed_at = null, duration_minutes = null,
         void_reason = nullif(btrim(coalesce(p_reason,'')), '')
   where id = p_quiz_session_id returning * into v_session;

  -- goal_id nunca é nulo aqui (ON DELETE RESTRICT + soft delete), então a
  -- reversão da meta não pode ser silenciosamente pulada.
  update public.goals
     set status = 'pending', completed_at = null
   where id = v_session.goal_id and deleted_at is null;

  update public.operations
     set result = jsonb_build_object('quiz_session_id', p_quiz_session_id, 'status', 'voided')
   where request_id = p_request_id;

  return v_session;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.7 Registrar reforço de ciclo
-- -----------------------------------------------------------------------------
create or replace function public.record_reinforcement(
  p_study_plan_id uuid,
  p_block_id        uuid,
  p_quiz_session_ids        uuid[],
  p_request_id      uuid,
  p_outcomes      jsonb
)
returns public.reinforcements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_plan       public.study_plans%rowtype;
  v_reinforcement    public.reinforcements%rowtype;
  v_reservation    record;
  v_count        integer;
  v_main integer;
  v_correct    integer;
  v_cutoff     timestamptz;
  v_score smallint;
  v_missing   integer;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_quiz_session_ids is null or cardinality(p_quiz_session_ids) <> 3 then
    raise exception 'o reforco de ciclo exige exatamente 3 quiz_sessions';
  end if;
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception 'p_outcomes deve ser um array JSON';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'record_reinforcement', p_block_id, p_outcomes::text
  );
  if not v_reservation.reserved then
    select * into v_reinforcement from public.reinforcements r where r.request_id = p_request_id;
    return v_reinforcement;
  end if;

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.student_id = v_uid and p.deleted_at is null
   for update;
  if not found then raise exception 'planejamento invalido'; end if;

  select count(*), coalesce(sum(d.main_count),0), coalesce(sum(d.main_correct),0),
         max(b.completed_at)
    into v_count, v_main, v_correct, v_cutoff
  from public.quiz_sessions b
  join public.vw_quiz_session_performance d on d.quiz_session_id = b.id
 where b.id = any(p_quiz_session_ids)
   and b.study_plan_id = p_study_plan_id
   and b.block_id = p_block_id
   and b.student_id = v_uid
   and b.status = 'completed';

  if v_count <> 3 then
    raise exception 'as 3 quiz_sessions precisam estar concluidas e pertencer ao mesmo bloco';
  end if;
  if v_main <= 0 then raise exception 'ciclo sem questoes principais'; end if;

  v_score := round(100.0 * v_correct / v_main)::smallint;
  if v_score >= 80 then
    raise exception 'este ciclo atingiu 80%% e nao exige reforco automatico';
  end if;

  insert into public.reinforcements (
    study_plan_id, student_id, teacher_id, block_id,
    request_id, cutoff, source_score
  ) values (
    p_study_plan_id, v_uid, v_plan.teacher_id, p_block_id,
    p_request_id, v_cutoff, v_score
  ) returning * into v_reinforcement;

  -- unique(quiz_session_id) impede reaproveitar sessão em dois ciclos.
  insert into public.reinforcement_sessions (reinforcement_id, quiz_session_id)
  select v_reinforcement.id, unnest(p_quiz_session_ids);

  insert into public.reinforcement_questions (reinforcement_id, question_id, phase, outcome, topic)
  select v_reinforcement.id, x.question_id, x.phase::public.question_phase,
         x.outcome::public.question_outcome, nullif(btrim(coalesce(x.topic,'')),'')
  from jsonb_to_recordset(p_outcomes) as x(
    question_id bigint, phase text, outcome text, topic text
  );

  -- Todo erro principal do ciclo precisa ter sido revisado.
  -- Em SQL relacional isto é um EXCEPT; com o jsonb antigo eram quatro blocos
  -- de jsonb_to_recordset.
  select count(*) into v_missing from (
    select q.question_id
      from public.quiz_session_questions q
      join public.reinforcement_sessions rb on rb.quiz_session_id = q.quiz_session_id
     where rb.reinforcement_id = v_reinforcement.id
       and q.phase = 'main' and q.outcome = 'incorrect'
    except
    select rq.question_id from public.reinforcement_questions rq
     where rq.reinforcement_id = v_reinforcement.id and rq.phase = 'main'
  ) faltantes;

  if v_missing > 0 then
    raise exception 'o reforco precisa revisar as % questoes erradas restantes do ciclo', v_missing;
  end if;

  insert into public.review_cycles (student_id, block_id, cutoff, reinforcement_id)
  values (v_uid, p_block_id, v_cutoff, v_reinforcement.id)
  on conflict (student_id, block_id, cutoff) do nothing;

  update public.operations
     set result = jsonb_build_object('reinforcement_id', v_reinforcement.id)
   where request_id = p_request_id;

  return v_reinforcement;
end;
$$;


-- =============================================================================
-- 8. GRANTS
-- =============================================================================
-- O client autenticado só LÊ tabelas (filtrado por RLS) e EXECUTA RPCs.
-- Escrita direta existe apenas em student_preferences, que é estado de UI.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on
  public.profiles, public.coupons, public.student_teacher_links, public.subscriptions,
  public.catalogs, public.catalog_blocks, public.catalog_questions,
  public.study_plans, public.study_plan_blocks, public.study_plan_batches,
  public.goals, public.quiz_sessions, public.quiz_session_questions,
  public.reinforcements, public.reinforcement_sessions, public.reinforcement_questions,
  public.review_cycles, public.operations, public.audit_log,
  public.vw_quiz_session_performance, public.vw_goal_performance,
  public.vw_seen_questions, public.vw_block_performance, public.vw_block_errors
to authenticated;

grant select, insert, update on public.profiles          to authenticated;
grant select, insert, update on public.waitlist    to authenticated;
grant select, insert, update on public.student_preferences to authenticated;

grant execute on function
  public.activate_study_plan(uuid),
  public.apply_study_plan_batch(uuid, uuid, smallint, public.batch_mode, jsonb),
  public.start_quiz_session(uuid, uuid, uuid),
  public.finish_quiz_session(uuid, uuid, jsonb, boolean),
  public.record_quiz_session_time(uuid, uuid, integer),
  public.void_quiz_session(uuid, uuid, text),
  public.record_reinforcement(uuid, uuid, uuid[], uuid, jsonb),
  public.is_teacher(),
  public.is_teacher_of(uuid),
  public.can_view_context(uuid, uuid)
to authenticated;

-- reserve_operation é infraestrutura interna das RPCs, não API pública.
revoke all on function public.reserve_operation(uuid, text, uuid, text) from anon, authenticated;

