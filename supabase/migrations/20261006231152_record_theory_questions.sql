-- =============================================================================
-- As questões da teoria à prova de retentativa (QA-04, PR 5b)
-- =============================================================================
-- Implementa `docs/specs/32-fluxo-da-teoria.md` (R-TEO-21 a R-TEO-24).
--
-- O QUE ESTA MIGRATION FAZ
--
--   `record_initial_questions`   questões iniciais: ledger, soma, conclusão da
--                                aula e revisões numa transação; idempotente
--                                por `goal_entries.request_id`
--   `record_review_questions`    questões de revisão, idempotente por
--                                `theory_review_entries.request_id`
--   `theory_review_entries`      o ledger da revisão, que não existia: o
--                                contador `theory_reviews.questions_answered`
--                                era mantido à mão, sem registro nenhum
--   `goal_entries.theory_lesson_id`  a aula do registro, para o replay comparar
--   `app_private.initial_questions_required`, `replay_initial_questions` e
--   `replay_review_entry`        o mínimo da aula e a comparação da retentativa,
--                                cada um em um lugar só
--
-- IDEMPOTÊNCIA (as duas, da forma "com payload"): `request_id` numa coluna
-- única — `goal_entries_request_uidx`, do 5a, e `theory_review_entries_request_uidx`
-- — e a comparação das PRÓPRIAS colunas do registro. Mesma chave e mesmo payload
-- devolve o estado atual sem somar; outro payload é recusado com `23505`.
--
-- OS CONTADORES FICAM, COM UM ESCRITOR
--
-- `theory_progress.initial_questions_done` e `theory_reviews.questions_answered`
-- continuam colunas. As RPCs as escrevem numa instrução que soma (`x = x + n`),
-- depois de o ledger aceitar a linha. Não dá para derivar do ledger agora: o
-- histórico anterior não guarda a aula nem a revisão no registro, e o bundle que
-- está no ar lê e escreve as colunas até o PR seguinte do plano fechar o caminho
-- direto.
--
-- A REGRA DO CATÁLOGO E O MÍNIMO PADRÃO (15) EXISTEM EM DOIS LUGARES: aqui, em
-- `record_initial_questions` e `initial_questions_required`, e em
-- `loadTheoryContext` / `DEFAULT_INITIAL_QUESTIONS`, em
-- `apps/web/src/lib/api/supabase/theory.ts`. Mudar uma é mudar a outra.
--
-- COMPATIBILIDADE COM O BUNDLE QUE JÁ ESTÁ NO AR: nada é revogado. O bundle
-- anterior continua inserindo em `goal_entries` e somando em `theory_progress` e
-- `theory_reviews` direto; fechar esse caminho é o PR 5c.
--
-- O QUE ESTA MIGRATION FEZ COM OS DADOS: nenhum corrigido. Tabela nova e coluna
-- nulável; os registros antigos ficam com `theory_lesson_id` nulo, que quer dizer
-- "anterior a esta migration".
-- =============================================================================

-- 1. A aula do registro. Fora do grant de INSERT por coluna do 5a, como
--    `request_id`: só a RPC a escreve.
alter table public.goal_entries add column theory_lesson_id uuid;
alter table public.goal_entries
  add constraint goal_entries_theory_lesson_fk
  foreign key (theory_lesson_id, teacher_id)
  references public.theory_lessons (id, teacher_id)
  on delete set null (theory_lesson_id);
create index goal_entries_theory_lesson_idx
  on public.goal_entries (theory_lesson_id, teacher_id) where theory_lesson_id is not null;
comment on column public.goal_entries.theory_lesson_id is
  'A aula das questões iniciais. Preenchida só por `record_initial_questions`, e é o que o replay compara. Nula nos registros anteriores a esta coluna.';

-- 2. O ledger da revisão. Alvo da FK composta primeiro.
alter table public.theory_reviews
  add constraint theory_reviews_id_student_key unique (id, student_id);

create table public.theory_review_entries (
  id               uuid primary key default gen_random_uuid(),
  theory_review_id uuid not null,
  student_id       uuid not null,
  questions        integer not null,
  correct_answers  integer not null,
  request_id       uuid not null,
  created_at       timestamptz not null default now(),
  constraint theory_review_entries_questions_check check (questions between 1 and 500),
  constraint theory_review_entries_correct_answers_check
    check (correct_answers between 0 and questions),
  -- Cascade, e não restrict: a revisão é da aula (`theory_reviews` cascateia de
  -- `theory_lessons` e de `study_plans`), e o registro dela vai junto. O
  -- desempenho que não pode sumir mora em `goal_entries`, não aqui.
  constraint theory_review_entries_review_fk
    foreign key (theory_review_id, student_id)
    references public.theory_reviews (id, student_id) on delete cascade
);
create unique index theory_review_entries_request_uidx
  on public.theory_review_entries (request_id);
create index theory_review_entries_review_idx
  on public.theory_review_entries (theory_review_id, student_id);
comment on table public.theory_review_entries is
  'Questões registradas numa revisão. Append-only: SELECT para authenticated; quem escreve é `record_review_questions`.';

alter table public.theory_review_entries enable row level security;
create policy theory_review_entries_select on public.theory_review_entries
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.theory_reviews r
        join public.study_plans p on p.id = r.study_plan_id
       where r.id = theory_review_entries.theory_review_id
         and p.teacher_id = (select auth.uid())
    )
  );
grant select on public.theory_review_entries to authenticated;

-- 3. O mínimo de questões iniciais da aula: a regra da disciplina DA AULA, no
--    catálogo da aula, e 15 sem regra (R-TEO-07).
create or replace function app_private.initial_questions_required(p_lesson_id uuid)
  returns integer language sql stable set search_path = '' as $$
  select coalesce(
    (select r.initial_questions
       from public.theory_lessons l
       join public.theory_catalog_subject_rules r
         on r.catalog_id = l.catalog_id and r.subject_key = l.subject_key and r.active
      where l.id = p_lesson_id),
    15);
$$;

-- 4. A comparação da retentativa, em função própria (o mesmo motivo de
--    `replay_access_grant`: a RPC devolve de dois lugares, a entrada normal e a
--    corrida perdida no índice).
create or replace function app_private.replay_initial_questions(
  p_entry public.goal_entries, p_student_id uuid, p_goal_id uuid, p_lesson_id uuid,
  p_questions integer, p_correct_answers integer
) returns table (current_page integer, theory_done boolean, initial_questions_done integer,
                 initial_questions_required integer, lesson_done boolean)
  language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
begin
  if p_entry.student_id is distinct from p_student_id
     or p_entry.goal_id is distinct from p_goal_id
     or p_entry.theory_lesson_id is distinct from p_lesson_id
     or p_entry.questions is distinct from p_questions
     or p_entry.correct_answers is distinct from p_correct_answers then
    raise exception 'este request_id ja foi usado com outro registro'
      using errcode = 'unique_violation';
  end if;
  -- O progresso ATUAL: o resultado de registrar é o estado da aula, e o que a
  -- retentativa precisa é não somar de novo.
  return query
    select tp.current_page, tp.theory_done, tp.initial_questions_done,
           app_private.initial_questions_required(p_lesson_id), tp.lesson_done
      from public.theory_progress tp
      join public.goals g on g.id = p_entry.goal_id
     where tp.student_id = p_student_id
       and tp.study_plan_id = g.study_plan_id
       and tp.theory_lesson_id = p_lesson_id;
end;
$$;

create or replace function public.record_initial_questions(
  p_request_id uuid, p_goal_id uuid, p_lesson_id uuid,
  p_questions integer, p_correct_answers integer
) returns table (current_page integer, theory_done boolean, initial_questions_done integer,
                 initial_questions_required integer, lesson_done boolean)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid      uuid := (select auth.uid());
  v_goal     public.goals%rowtype;
  v_catalog  uuid;
  v_lesson   public.theory_lessons%rowtype;
  v_required integer;
  v_seen     public.goal_entries%rowtype;
  v_progress public.theory_progress%rowtype;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null then
    raise exception 'request_id e obrigatorio' using errcode = 'check_violation';
  end if;
  -- A faixa das CHECKs de `goal_entries`, mais "questão zero não é registro".
  if p_questions is null or p_questions not between 1 and 500
     or p_correct_answers is null or p_correct_answers not between 0 and p_questions then
    raise exception 'questoes ou acertos fora da faixa' using errcode = 'check_violation';
  end if;

  -- SECURITY DEFINER passa por cima da RLS: o dono é conferido aqui. A trava vem
  -- ANTES da busca pela chave: duas chamadas com a mesma chave na mesma meta se
  -- serializam, e a segunda enxerga a gravação da primeira. `no key update`
  -- para não bloquear o `for key share` da FK de quem insere outros registros.
  -- Inexistente, alheia e de outro tipo dão o MESMO erro: distinguir diria que o
  -- id existe.
  select * into v_goal from public.goals g
   where g.id = p_goal_id and g.student_id = v_uid and g.type = 'theory'
   for no key update;
  if not found then
    raise exception 'meta nao encontrada' using errcode = 'no_data_found';
  end if;

  -- A RETENTATIVA VEM ANTES DA CHECAGEM DE ACESSO: se a primeira tentativa
  -- gravou e o acesso venceu em seguida, a retentativa responde "gravado".
  select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
  if found then
    return query select * from app_private.replay_initial_questions(
      v_seen, v_uid, p_goal_id, p_lesson_id, p_questions, p_correct_answers);
    return;
  end if;

  if not public.has_active_access() then
    raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
  end if;

  -- O catálogo do planejamento: o da TURMA prevalece, o vínculo individual
  -- atende quem está fora dela. É a regra de `loadTheoryContext` (theory.ts).
  select coalesce(
    (select c.theory_catalog_id
       from public.class_students cs
       join public.classes c on c.id = cs.class_id and c.teacher_id = cs.teacher_id
      where cs.student_id = v_goal.student_id and cs.teacher_id = v_goal.teacher_id),
    (select l.catalog_id from public.study_plan_theory_catalogs l
      where l.study_plan_id = v_goal.study_plan_id)
  ) into v_catalog;

  select * into v_lesson from public.theory_lessons l
   where l.id = p_lesson_id and l.catalog_id = v_catalog and l.active and l.published;
  if not found then
    raise exception 'aula nao encontrada no catalogo do planejamento' using errcode = 'no_data_found';
  end if;
  v_required := app_private.initial_questions_required(v_lesson.id);

  begin
    insert into public.goal_entries (
      goal_id, teacher_id, student_id, minutes, questions, correct_answers,
      theory_stage, manual_lesson, theory_lesson_id, request_id)
    values (
      v_goal.id, v_goal.teacher_id, v_uid, 0, p_questions, p_correct_answers,
      'questions_in_progress', v_lesson.title, v_lesson.id, p_request_id);
  exception when unique_violation then
    -- A mesma chave noutra meta, em paralelo: a trava acima é por meta.
    select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
    if not found then raise; end if;  -- era outra unicidade: propaga
    return query select * from app_private.replay_initial_questions(
      v_seen, v_uid, p_goal_id, p_lesson_id, p_questions, p_correct_answers);
    return;
  end;

  -- SOMA NUMA INSTRUÇÃO SÓ. O bloqueio de linha do upsert serializa duas abas, e
  -- a segunda soma sobre o que a primeira gravou.
  insert into public.theory_progress as tp
    (student_id, study_plan_id, theory_lesson_id, initial_questions_done)
  values (v_uid, v_goal.study_plan_id, v_lesson.id, p_questions)
  on conflict (student_id, study_plan_id, theory_lesson_id)
  do update set initial_questions_done = tp.initial_questions_done + excluded.initial_questions_done
  returning * into v_progress;

  -- A aula fecha pelas questões, sem olhar a leitura (R-TEO-06), e as revisões
  -- nascem na mesma transação (R-TEO-23).
  if not v_progress.lesson_done and v_progress.initial_questions_done >= v_required then
    update public.theory_progress tp
       set lesson_done = true, lesson_done_at = now(),
           initial_questions_complete = true, initial_questions_complete_at = now()
     where tp.id = v_progress.id
    returning * into v_progress;

    insert into public.theory_reviews
      (student_id, study_plan_id, theory_lesson_id, review_number, minimum_questions)
    select v_uid, v_goal.study_plan_id, v_lesson.id, r.review_number, r.minimum_questions
      from public.theory_review_rules r
     where r.catalog_id = v_lesson.catalog_id and r.subject_key = v_lesson.subject_key
       and r.active
    on conflict (student_id, study_plan_id, theory_lesson_id, review_number) do nothing;
  end if;

  return query select v_progress.current_page, v_progress.theory_done,
    v_progress.initial_questions_done, v_required, v_progress.lesson_done;
end;
$$;

create or replace function app_private.replay_review_entry(
  p_entry public.theory_review_entries, p_student_id uuid, p_review_id uuid,
  p_questions integer, p_correct_answers integer
) returns table (study_plan_id uuid, questions_answered integer,
                 status public.theory_review_status)
  language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
begin
  if p_entry.student_id is distinct from p_student_id
     or p_entry.theory_review_id is distinct from p_review_id
     or p_entry.questions is distinct from p_questions
     or p_entry.correct_answers is distinct from p_correct_answers then
    raise exception 'este request_id ja foi usado com outro registro'
      using errcode = 'unique_violation';
  end if;
  return query select r.study_plan_id, r.questions_answered, r.status
                 from public.theory_reviews r where r.id = p_review_id;
end;
$$;

create or replace function public.record_review_questions(
  p_request_id uuid, p_review_id uuid, p_questions integer, p_correct_answers integer
) returns table (study_plan_id uuid, questions_answered integer,
                 status public.theory_review_status)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid    uuid := (select auth.uid());
  v_review public.theory_reviews%rowtype;
  v_seen   public.theory_review_entries%rowtype;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null then
    raise exception 'request_id e obrigatorio' using errcode = 'check_violation';
  end if;
  if p_questions is null or p_questions not between 1 and 500
     or p_correct_answers is null or p_correct_answers not between 0 and p_questions then
    raise exception 'questoes ou acertos fora da faixa' using errcode = 'check_violation';
  end if;

  -- A trava serializa duas abas, e a segunda vê o `completed` da primeira.
  -- `no key update` não bloqueia o `for key share` da FK do ledger.
  select * into v_review from public.theory_reviews r
   where r.id = p_review_id and r.student_id = v_uid
   for no key update;
  if not found then
    raise exception 'revisao nao encontrada' using errcode = 'no_data_found';
  end if;

  -- O REPLAY VEM ANTES DE "JÁ CONCLUÍDA" (R-TEO-24): a retentativa do envio que
  -- fechou a revisão tem de receber a revisão, não um conflito.
  select * into v_seen from public.theory_review_entries e where e.request_id = p_request_id;
  if found then
    return query select * from app_private.replay_review_entry(
      v_seen, v_uid, p_review_id, p_questions, p_correct_answers);
    return;
  end if;

  if not public.has_active_access() then
    raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
  end if;
  -- P0001: `translateDbError` mostra a mensagem crua, e ela é a frase de hoje.
  if v_review.status = 'completed' then
    raise exception 'Esta revisão já foi concluída.';
  end if;

  begin
    insert into public.theory_review_entries
      (theory_review_id, student_id, questions, correct_answers, request_id)
    values (v_review.id, v_uid, p_questions, p_correct_answers, p_request_id);
  exception when unique_violation then
    select * into v_seen from public.theory_review_entries e where e.request_id = p_request_id;
    if not found then raise; end if;
    return query select * from app_private.replay_review_entry(
      v_seen, v_uid, p_review_id, p_questions, p_correct_answers);
    return;
  end;

  -- No UPDATE, toda expressão lê a linha ANTIGA.
  update public.theory_reviews r
     set questions_answered = r.questions_answered + p_questions,
         status = case when r.questions_answered + p_questions >= r.minimum_questions
                       then 'completed'::public.theory_review_status
                       else 'in_progress'::public.theory_review_status end,
         started_at = coalesce(r.started_at, now()),
         completed_at = case when r.questions_answered + p_questions >= r.minimum_questions
                             then now() end
   where r.id = v_review.id;

  return query select r.study_plan_id, r.questions_answered, r.status
                 from public.theory_reviews r where r.id = v_review.id;
end;
$$;

-- 5. Privilégios. O Supabase concede EXECUTE por default a anon e authenticated,
--    e o Postgres a PUBLIC: revogue dos três antes do grant nominal.
revoke all on function app_private.initial_questions_required(uuid)
  from public, anon, authenticated;
revoke all on function app_private.replay_initial_questions(
  public.goal_entries, uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function app_private.replay_review_entry(
  public.theory_review_entries, uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.record_initial_questions(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.record_review_questions(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_initial_questions(uuid, uuid, uuid, integer, integer)
  to authenticated;
grant execute on function public.record_review_questions(uuid, uuid, integer, integer)
  to authenticated;

comment on function public.record_initial_questions(uuid, uuid, uuid, integer, integer) is
  'Questões iniciais: ledger, soma, conclusão da aula e revisões numa transação. Idempotente com payload: goal_entries_request_uidx (índice único de request_id), comparando as colunas do registro.';
comment on function public.record_review_questions(uuid, uuid, integer, integer) is
  'Questões de revisão: ledger e soma numa transação. Idempotente com payload: theory_review_entries_request_uidx (índice único de request_id), comparando as colunas do registro.';
