-- Estudo extra avulso — spec docs/specs/19-estudo-extra-avulso.md
--
-- Duas coisas ao mesmo tempo, e a ordem entre elas importa:
--
--   1. `goals.extra_activity` deixa de ser `text` e vira enum. A coluna guardava
--      valor de domínio, em português, em campo livre — exatamente o que o
--      CLAUDE.md proíbe, e a mesma dívida que a spec 11 corrigiu em
--      `student_preferences.theme` (`text not null default 'claro'`);
--   2. o aluno passa a poder REGISTRAR o que estudou fora da semana montada
--      pelo professor, por RPC — `goals` continua sem `insert` para ele.
--
-- Compatível com o bundle que já está no ar, e isso é verificável, não
-- otimismo: o único caminho do site que escreve `extra_activity` é `buildWeek`,
-- e ele manda sempre `null`. O `'revisao'` que existe no banco veio do seed, e é
-- convertido aqui. `apply_study_plan_batch` mantém a assinatura.

-- =============================================================================
-- 1. O ENUM
-- =============================================================================
-- Os sete tipos que a v96 oferecia no `<select id="extra-tipo">` (aluno.html:1067),
-- com os identificadores em inglês, como todo enum do schema. O rótulo em
-- português vive na tela.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'extra_activity_kind') then
    create type public.extra_activity_kind as enum (
      'statute',          -- lei seca
      'flashcards',       -- Anki
      'mock_exam',        -- simulado
      'review',           -- revisão
      'extra_questions',  -- questões extras
      'video_lesson',     -- videoaula
      'other'             -- outro
    );
  end if;
end;
$$;

-- =============================================================================
-- 2. O DADO ANTES DO TIPO
-- =============================================================================
-- R-EXTRA-03. Sem esta linha o `alter ... using` abaixo falha na única linha que
-- existe no banco, que guarda `'revisao'`.

update public.goals set extra_activity = 'review' where extra_activity = 'revisao';

alter table public.goals
  alter column extra_activity type public.extra_activity_kind
  using extra_activity::public.extra_activity_kind;

comment on column public.goals.extra_activity is
  'Tipo do estudo extra. Enum, nunca texto livre: o que a pessoa quer escrever vai em student_note.';

-- =============================================================================
-- 3. apply_study_plan_batch CONVERTE O TEXTO DO PAYLOAD
-- =============================================================================
-- Mesma assinatura, mesmo corpo, com um `::public.extra_activity_kind` no fim.
-- `jsonb_to_recordset` continua lendo `extra_activity` como `text` — o payload é
-- JSON e não tem tipo de enum — e a conversão acontece na projeção.

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
    b.planned_minutes, b.source_goal_id, b.source_week,
    -- A ÚNICA mudança nesta função: o payload é JSON e não tem tipo de enum,
    -- então a conversão acontece aqui, na projeção.
    b.extra_activity::public.extra_activity_kind, v_uid
  from base b;

  get diagnostics v_count = row_count;

  v_result := jsonb_build_object('batch_id', p_batch_id, 'goals_inserted', v_count, 'replay', false);
  update public.operations
     set result = v_result where request_id = p_batch_id;
  return v_result;
end;
$$;

-- =============================================================================
-- 4. REGISTRAR
-- =============================================================================
-- Idempotência COM PAYLOAD: `request_id` + `reserve_operation`, com hash de
-- plano, semana, dia, tipo, minutos e observação.
create or replace function public.record_extra_study(
  p_study_plan_id uuid,
  p_request_id    uuid,
  p_week          smallint,
  p_weekday       smallint,
  p_activity      public.extra_activity_kind,
  p_spent_minutes integer,
  p_note          text default null
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_plan        public.study_plans%rowtype;
  v_goal        public.goals%rowtype;
  v_note        text := nullif(btrim(coalesce(p_note, '')), '');
  v_order       smallint;
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  if p_spent_minutes is null or p_spent_minutes < 1 or p_spent_minutes > 240 then
    raise exception 'tempo em minutos deve estar entre 1 e 240';
  end if;
  if p_weekday is null or p_weekday < 0 or p_weekday > 6 then
    raise exception 'dia da semana invalido';
  end if;
  if p_week is null or p_week < 1 or p_week > 200 then
    raise exception 'semana invalida';
  end if;
  if length(coalesce(v_note, '')) > 2000 then
    raise exception 'observacao passa de 2000 caracteres';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'record_extra_study', p_study_plan_id,
    p_study_plan_id::text || '|' || p_week::text || '|' || p_weekday::text || '|' ||
    p_activity::text || '|' || p_spent_minutes::text || '|' || coalesce(v_note, '')
  );

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.status = 'active' and p.deleted_at is null
   for update;
  if not found then raise exception 'planejamento nao esta active'; end if;
  if v_plan.student_id <> v_uid then
    raise exception 'somente o aluno pode registrar o proprio estudo' using errcode='42501';
  end if;

  -- Replay: devolve o registro criado antes, sem criar outro.
  if not v_reservation.reserved then
    select * into v_goal from public.goals g
     where g.id = ((v_reservation.previous)->>'goal_id')::uuid;
    if found then return v_goal; end if;
  end if;

  -- A semana precisa existir no planejamento. Sem isso o registro criaria uma
  -- semana fantasma no seletor do painel (R-EXTRA-09).
  if not exists (
    select 1 from public.goals m
     where m.study_plan_id = p_study_plan_id and m.week_number = p_week and m.deleted_at is null
  ) then
    raise exception 'a semana % ainda nao tem metas neste planejamento', p_week;
  end if;

  -- day_order continua sendo do banco, nunca do cliente.
  select (coalesce(max(m.day_order), 0) + 1)::smallint into v_order
    from public.goals m
   where m.study_plan_id = p_study_plan_id
     and m.week_number = p_week
     and m.weekday = p_weekday
     and m.deleted_at is null;

  insert into public.goals (
    study_plan_id, student_id, teacher_id,
    week_number, weekday, day_order,
    type, status, title, extra_activity,
    spent_minutes, student_note, completed_at, created_by
  ) values (
    p_study_plan_id, v_plan.student_id, v_plan.teacher_id,
    p_week, p_weekday, v_order,
    'extra_study', 'completed',
    -- Título derivado do tipo, nunca digitado: título livre viraria o campo
    -- multiuso que a v96 tinha (R-EXTRA-12).
    'Estudo extra — ' || case p_activity
      when 'statute'         then 'Lei seca'
      when 'flashcards'      then 'Anki'
      when 'mock_exam'       then 'Simulado'
      when 'review'          then 'Revisão'
      when 'extra_questions' then 'Questões extras'
      when 'video_lesson'    then 'Videoaula'
      else 'Outro'
    end,
    p_activity, p_spent_minutes, v_note, now(), v_uid
  ) returning * into v_goal;

  update public.operations
     set result = jsonb_build_object('goal_id', v_goal.id)
   where request_id = p_request_id;

  return v_goal;
end;
$$;

comment on function public.record_extra_study(uuid, uuid, smallint, smallint, public.extra_activity_kind, integer, text) is
  'Registra estudo feito fora da semana planejada. Nasce concluído. Idempotente por request_id + reserve_operation.';

-- =============================================================================
-- 5. REMOVER
-- =============================================================================
-- Só o que o PRÓPRIO aluno criou: meta de estudo extra planejada pelo professor
-- é da semana dele, e desfazê-la é `reopen_goal` (R-EXTRA-15).
create or replace function public.delete_extra_study(
  p_goal_id    uuid,
  p_request_id uuid
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_goal        public.goals%rowtype;
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'delete_extra_study', p_goal_id, p_goal_id::text
  );

  select * into v_goal from public.goals g where g.id = p_goal_id for update;
  if not found then raise exception 'registro nao encontrado'; end if;
  if v_goal.student_id <> v_uid then
    raise exception 'somente o aluno pode remover o proprio registro' using errcode='42501';
  end if;

  if not v_reservation.reserved then return v_goal; end if;
  if v_goal.deleted_at is not null then return v_goal; end if;

  if v_goal.type <> 'extra_study' then
    raise exception 'so registro de estudo extra pode ser removido';
  end if;
  -- `created_by` é o que separa o registro do aluno da meta que o professor
  -- planejou: as duas são `extra_study`.
  if v_goal.created_by <> v_uid then
    raise exception 'esta meta foi planejada pelo professor e nao pode ser removida por voce';
  end if;

  update public.goals set deleted_at = now()
   where id = p_goal_id returning * into v_goal;

  update public.operations
     set result = jsonb_build_object('goal_id', p_goal_id, 'deleted', true)
   where request_id = p_request_id;

  return v_goal;
end;
$$;

comment on function public.delete_extra_study(uuid, uuid) is
  'Remove (deleted_at) um registro de estudo extra criado pelo próprio aluno. Idempotente por request_id.';

-- =============================================================================
-- 6. GRANTS
-- =============================================================================
revoke execute on function
  public.record_extra_study(uuid, uuid, smallint, smallint, public.extra_activity_kind, integer, text)
from public;
revoke execute on function public.delete_extra_study(uuid, uuid) from public;

grant execute on function
  public.record_extra_study(uuid, uuid, smallint, smallint, public.extra_activity_kind, integer, text),
  public.delete_extra_study(uuid, uuid)
to authenticated;

-- Nenhum grant novo em `goals`: o aluno continua sem insert, update e delete.
