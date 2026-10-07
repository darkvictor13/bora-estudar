-- =============================================================================
-- A escrita do aluno: registro de estudo e estudo extra (QA-04, QA-07, QA-10,
-- QA-11, QA-28, N-02, N-05, N-07)
-- =============================================================================
-- Implementa `docs/specs/12-conclusao-de-meta.md` (R-CONC-21 a R-CONC-26) e
-- `docs/specs/19-estudo-extra-avulso.md` (R-EXTRA-20 a R-EXTRA-28).
--
-- O QUE ESTA MIGRATION FECHA
--
--   QA-04  Registrar estudo eram duas (registro) ou três (extra) requisições
--          soltas, e `goal_entries` não tinha `request_id`: resposta perdida
--          mais nova tentativa gravava duas vezes.
--   QA-07  `goals_update` não pedia `has_active_access()`: o aluno com o acesso
--   N-05   vencido concluía, reabria e pulava, e apagava registro e meta extra.
--   QA-10  `goal_entries` aceitava qualquer número (-30, 1000 e 14400 minutos).
--   QA-11  Não havia piso nem teto para a data do estudo extra.
--   QA-28  O aluno escrevia `spent_minutes`, `questions_answered` e
--          `correct_answers` da meta: o resultado é dos registros.
--   N-02   Todo extra nascia com `day_position = 99`, e o segundo do dia batia
--          em `goals_one_per_slot_idx`.
--   N-07   O extra lançado para ontem contava como estudo de hoje: o registro só
--          tinha `created_at`. `goal_entries.studied_on` guarda o dia.
--
-- DUAS RPCs PÚBLICAS E DUAS AUXILIARES
--
--   `record_goal_entry`   registra estudo numa meta e passa `pending` a
--                         `in_progress`, numa transação
--   `record_extra_study`  cria a meta `extra` e o registro, numa transação
--   `app_private.replay_goal_entry`, `app_private.replay_extra_study`
--                         a comparação da retentativa, em um lugar só
--
-- IDEMPOTÊNCIA (as duas, da forma "com payload"): `request_id` numa coluna
-- única, `goal_entries_request_uidx`, e a comparação das PRÓPRIAS colunas do
-- registro. Mesma chave e mesmo payload devolve o resultado anterior sem
-- gravar; outra carga com a mesma chave é recusada com `23505`.
--
-- COMPATIBILIDADE COM O BUNDLE QUE JÁ ESTÁ NO AR
--
-- As duas colunas novas, `request_id` e `studied_on`, são nuláveis, e o bundle
-- no ar não as conhece: ele continua lendo o dia por `created_at`, que é o
-- comportamento de antes. RPCs novas não substituem nada, e o INSERT direto do
-- aluno continua aceito (o PR seguinte do plano o retira, depois de staging
-- rodar o bundle novo). As policies só ENCOLHEM para quem tem o acesso vencido,
-- e o gatilho só recusa colunas que o bundle nunca escreve. `request_id`,
-- `studied_on` e `created_at` saem do grant de INSERT: o bundle no ar não manda
-- nenhuma das três.
--
-- O QUE ESTA MIGRATION FEZ COM OS DADOS (só existe staging, com dado de teste)
--
--   1. Apagou os registros fora das CHECKs novas, e as metas `extra` que
--      ficaram sem registro por causa disso. Apagar, e não grampear: os valores
--      eram de teste do QA, e grampear inventaria um número.
--   2. Zerou `spent_minutes`, `questions_answered` e `correct_answers` das
--      metas sem bateria: o resultado sai dos registros.
--   3. Preencheu `studied_on` dos extras lançados pelo aluno, pela heurística:
--      meta `extra` concluída, com um dos cinco títulos do diálogo, e registro
--      gravado até 60 s depois dela (o bundle anterior fazia os dois INSERTs em
--      seguida). A meta extra do professor não casa: o título dela é livre. O
--      lixo do QA-11 (extra de semana lá na frente, com o dia derivado depois do
--      dia do lançamento + 1) saiu inteiro, registro e meta.
--
--   Contagens no banco local do QA de 06/10/2026: (1) 8 registros e 1 meta
--   extra; (2) 1 meta com `correct_answers = 999`; (3) 26 registros extras, 2
--   deles em 2031-01-01. O banco local de quem implementou o PR já tinha sido
--   recriado e não tinha nenhum dos três; o que cada execução apagou sai no
--   `raise notice` do arquivo.
-- =============================================================================

-- 1. Dados (corrigir e validar no mesmo arquivo)
do $$
declare
  v_goals   uuid[];
  v_entries integer;
  v_extras  integer;
  v_zeroed  integer;
begin
  select coalesce(array_agg(distinct e.goal_id), '{}') into v_goals
    from public.goal_entries e
   where not (e.minutes between 0 and 240 and e.questions between 0 and 500
              and e.correct_answers between 0 and e.questions
              and (e.minutes > 0 or e.questions > 0));

  delete from public.goal_entries e
   where not (e.minutes between 0 and 240 and e.questions between 0 and 500
              and e.correct_answers between 0 and e.questions
              and (e.minutes > 0 or e.questions > 0));
  get diagnostics v_entries = row_count;

  -- Só a meta `extra` que ficou SEM registro: a do professor fica. Em passos, e
  -- não numa CTE: a CTE que modifica dado não enxerga o próprio DELETE.
  delete from public.goals g
   where g.id = any (v_goals) and g.type = 'extra'
     and not exists (select 1 from public.goal_entries e where e.goal_id = g.id);
  get diagnostics v_extras = row_count;

  update public.goals
     set spent_minutes = null, questions_answered = 0, correct_answers = 0
   where notebook_block_id is null
     and (spent_minutes is not null or questions_answered is distinct from 0
          or correct_answers is distinct from 0);
  get diagnostics v_zeroed = row_count;

  raise notice 'goal_entries: % registro(s) fora das regras apagado(s), % meta(s) extra sem registro apagada(s), % meta(s) com resultado zerado(s)',
    v_entries, v_extras, v_zeroed;
end $$;

-- 2. Limites de um registro (D-04). Nascem validados: o bloco acima deixou todas
--    as linhas dentro da regra.
alter table public.goal_entries
  add constraint goal_entries_minutes_check check (minutes between 0 and 240),
  add constraint goal_entries_questions_check check (questions between 0 and 500),
  add constraint goal_entries_correct_answers_check check (correct_answers between 0 and questions),
  add constraint goal_entries_not_empty_check check (minutes > 0 or questions > 0);

-- 3. A chave de retentativa. Nulável: o bundle no ar insere sem ela.
alter table public.goal_entries add column request_id uuid;
comment on column public.goal_entries.request_id is
  'Gerada uma vez na origem (o diálogo), e o UNIQUE é a idempotência de record_goal_entry e record_extra_study. Nula nos registros anteriores e nos que o professor ou o bundle antigo inserem direto. Só as RPCs a escrevem.';
create unique index goal_entries_request_uidx on public.goal_entries (request_id);

-- 3b. O dia do estudo, quando não é o dia do lançamento (N-07). Nulável.
alter table public.goal_entries add column studied_on date;
comment on column public.goal_entries.studied_on is
  'O dia escolhido no estudo extra; nulo = o dia local de created_at (registrar numa meta é "estudei agora"). O dia de um registro é studied_on, ou o dia local de created_at: ver entryDay em lib/domain/schedule.ts. Escrita só pelas RPCs.';

-- Backfill do extra lançado pelo aluno (heurística declarada no cabeçalho).
do $$
declare
  v_deleted_entries integer;
  v_deleted_goals   integer;
  v_filled          integer;
begin
  create temporary table extra_days on commit drop as
    select e.id as entry_id, g.id as goal_id,
           sp.starts_on + (g.week_number - 1) * 7
             + ((g.weekday - extract(isodow from sp.starts_on)::integer + 7) % 7) as day,
           (e.created_at at time zone 'UTC')::date as recorded_on
      from public.goal_entries e
      join public.goals g on g.id = e.goal_id
      join public.study_plans sp on sp.id = g.study_plan_id
     where g.type = 'extra' and g.status = 'completed'
       and g.title in ('Lei seca', 'Anki', 'Simulado', 'Revisão', 'Questões extras')
       and abs(extract(epoch from e.created_at - g.created_at)) < 60;

  delete from public.goal_entries e using extra_days d
   where e.id = d.entry_id and d.day > d.recorded_on + 1;
  get diagnostics v_deleted_entries = row_count;

  delete from public.goals g using extra_days d
   where g.id = d.goal_id and d.day > d.recorded_on + 1
     and not exists (select 1 from public.goal_entries e where e.goal_id = g.id);
  get diagnostics v_deleted_goals = row_count;

  update public.goal_entries e set studied_on = d.day
    from extra_days d
   where e.id = d.entry_id and d.day <= d.recorded_on + 1;
  get diagnostics v_filled = row_count;

  raise notice 'goal_entries: % registro(s) extra no futuro apagado(s) com % meta(s), % studied_on preenchido(s)',
    v_deleted_entries, v_deleted_goals, v_filled;
end $$;

-- O teto da escolha 3 do plano, no banco: não é futuro em lugar nenhum do
-- planeta. `timezone(text, timestamptz)` é IMMUTABLE. O piso (`starts_on`)
-- exigiria uma junção e mora na RPC.
alter table public.goal_entries
  add constraint goal_entries_studied_on_check
  check (studied_on is null or studied_on <= (created_at at time zone 'UTC')::date + 1);

-- Revogar no nível da tabela leva junto os grants de coluna; por isso o grant
-- vem DEPOIS. As colunas que ficam são exatamente as que o bundle no ar manda.
revoke insert on public.goal_entries from authenticated;
grant insert (goal_id, teacher_id, student_id, minutes, questions, correct_answers,
              manual_lesson, theory_stage, note) on public.goal_entries to authenticated;

-- 4. Acesso vigente nas escritas do aluno (QA-07, N-05). O WITH CHECK levanta
--    42501 no UPDATE; o USING do DELETE filtra em silêncio, e o adaptador conta.
alter policy goals_update on public.goals
  using (teacher_id = (select auth.uid()) or student_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid())
              or (student_id = (select auth.uid()) and public.has_active_access()));
alter policy goals_delete on public.goals
  using (teacher_id = (select auth.uid())
         or (student_id = (select auth.uid()) and type in ('extra', 'reinforcement')
             and public.has_active_access()));
alter policy goal_entries_delete on public.goal_entries
  using (teacher_id = (select auth.uid())
         or (student_id = (select auth.uid()) and public.has_active_access()));

-- 5. O resultado da meta não é do aluno (QA-28). O corpo é o de
--    20260914150000, mais o bloco marcado. Só meta SEM bateria: a de bateria é de
--    `protect_goal_quiz_result`, que dispara DEPOIS deste (ordem alfabética).
create or replace function app_private.protect_goal_planning_fields() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged or (select auth.uid()) = old.teacher_id then
    return new;
  end if;

  if old.type is distinct from new.type then
    raise exception 'o tipo da meta so e alterado pelo professor';
  end if;

  -- NOVO (QA-28).
  if coalesce(old.notebook_block_id, new.notebook_block_id) is null
     and (old.spent_minutes is distinct from new.spent_minutes
       or old.questions_answered is distinct from new.questions_answered
       or old.correct_answers is distinct from new.correct_answers) then
    raise exception 'o resultado da meta sai dos registros de estudo, e o aluno nao o edita';
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

-- 6. A comparação da retentativa, em função própria (o mesmo motivo de
--    `replay_access_grant`: é chamada de dois lugares em cada RPC).
create or replace function app_private.replay_goal_entry(
  p_entry public.goal_entries, p_student_id uuid, p_goal_id uuid, p_minutes integer,
  p_questions integer, p_correct_answers integer, p_note text, p_manual_lesson text,
  p_theory_stage public.theory_stage
) returns uuid
  language plpgsql immutable set search_path = '' as $$
begin
  if p_entry.student_id is distinct from p_student_id
     or p_entry.goal_id is distinct from p_goal_id
     or p_entry.minutes is distinct from p_minutes
     or p_entry.questions is distinct from p_questions
     or p_entry.correct_answers is distinct from p_correct_answers
     or p_entry.note is distinct from p_note
     or p_entry.manual_lesson is distinct from p_manual_lesson
     or p_entry.theory_stage is distinct from p_theory_stage then
    raise exception 'este request_id ja foi usado com outro registro' using errcode = 'unique_violation';
  end if;
  return p_entry.id;
end;
$$;

create or replace function app_private.replay_extra_study(
  p_entry public.goal_entries, p_goal public.goals, p_student_id uuid,
  p_study_plan_id uuid, p_title text, p_subject text, p_date date,
  p_minutes integer, p_questions integer, p_correct_answers integer, p_note text
) returns uuid
  language plpgsql immutable set search_path = '' as $$
begin
  -- O dia é a própria coluna `studied_on`, e semana e dia da meta derivam dele.
  if p_entry.student_id is distinct from p_student_id
     or p_goal.study_plan_id is distinct from p_study_plan_id
     or p_goal.type is distinct from 'extra'
     or p_goal.title is distinct from p_title
     or p_goal.subject is distinct from p_subject
     or p_entry.studied_on is distinct from p_date
     or p_entry.minutes is distinct from p_minutes
     or p_entry.questions is distinct from p_questions
     or p_entry.correct_answers is distinct from p_correct_answers
     or p_entry.note is distinct from p_note then
    raise exception 'este request_id ja foi usado com outro estudo' using errcode = 'unique_violation';
  end if;
  return p_goal.id;
end;
$$;

create or replace function public.record_goal_entry(
  p_request_id uuid, p_goal_id uuid, p_minutes integer, p_questions integer,
  p_correct_answers integer, p_note text default null,
  p_manual_lesson text default null, p_theory_stage public.theory_stage default null
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_lesson text := nullif(btrim(p_manual_lesson), '');
  v_goal public.goals%rowtype;
  v_seen public.goal_entries%rowtype;
  v_entry uuid;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null then
    raise exception 'request_id e obrigatorio' using errcode = 'check_violation';
  end if;

  -- A TRAVA VEM ANTES DA BUSCA POR request_id: duas chamadas com a mesma chave
  -- na mesma meta se serializam, e a segunda enxerga a gravação da primeira.
  -- `no key update`, e não `update`, para não bloquear o `for key share` da FK de
  -- quem insere outros registros da meta.
  select * into v_goal from public.goals g where g.id = p_goal_id for no key update;
  if not found or v_goal.student_id <> v_uid then
    -- Inexistente e alheia dão o MESMO erro: distinguir diria que o id existe.
    raise exception 'meta nao encontrada' using errcode = 'no_data_found';
  end if;

  -- A RETENTATIVA VEM ANTES DA CHECAGEM DE ACESSO: se a primeira tentativa gravou
  -- e o acesso venceu em seguida, a retentativa responde "gravado".
  select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
  if found then
    return app_private.replay_goal_entry(v_seen, v_uid, p_goal_id, p_minutes, p_questions,
                                         p_correct_answers, v_note, v_lesson, p_theory_stage);
  end if;

  if v_goal.notebook_block_id is not null then
    raise exception 'meta de bateria se registra pela bateria';
  end if;
  if not public.has_active_access() then
    raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
  end if;

  begin
    insert into public.goal_entries (goal_id, teacher_id, student_id, minutes, questions,
      correct_answers, note, manual_lesson, theory_stage, request_id)
    values (v_goal.id, v_goal.teacher_id, v_goal.student_id, p_minutes, p_questions,
      p_correct_answers, v_note, v_lesson, p_theory_stage, p_request_id)
    returning id into v_entry;
  exception when unique_violation then
    -- A mesma chave noutra meta, em paralelo: a trava acima é por meta.
    select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
    if not found then raise; end if;
    return app_private.replay_goal_entry(v_seen, v_uid, p_goal_id, p_minutes, p_questions,
                                         p_correct_answers, v_note, v_lesson, p_theory_stage);
  end;

  -- REGISTRAR NÃO CONCLUI. Só "pendente" vira "em andamento".
  if v_goal.status = 'pending' then
    update public.goals set status = 'in_progress' where id = v_goal.id;
  end if;
  return v_entry;
end;
$$;

create or replace function public.record_extra_study(
  p_request_id uuid, p_study_plan_id uuid, p_kind text, p_subject text, p_date date,
  p_minutes integer, p_questions integer, p_correct_answers integer, p_note text default null
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  -- O tipo vive no TÍTULO (spec 19): texto conferido aqui, sem enum que nada guardaria.
  v_title text := case p_kind
                    when 'dry_law' then 'Lei seca'
                    when 'anki' then 'Anki'
                    when 'mock_exam' then 'Simulado'
                    when 'review' then 'Revisão'
                    when 'extra_questions' then 'Questões extras'
                  end;
  v_subject text := btrim(p_subject);
  v_note text := nullif(btrim(p_note), '');
  -- O "hoje" do banco: a data em que já é hoje em algum lugar do planeta (UTC+14).
  -- O banco não conhece o fuso do aparelho; a regra estrita é de `validation.ts`.
  v_latest date := ((now() at time zone 'UTC') + interval '14 hours')::date;
  v_plan public.study_plans%rowtype;
  v_seen public.goal_entries%rowtype;
  v_seen_goal public.goals%rowtype;
  v_week integer;
  v_weekday integer;
  v_position integer;
  v_goal uuid;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null then
    raise exception 'request_id e obrigatorio' using errcode = 'check_violation';
  end if;
  if v_title is null then
    raise exception 'tipo de estudo extra invalido' using errcode = 'check_violation';
  end if;
  if v_subject is null or v_subject = '' then
    raise exception 'a materia e obrigatoria' using errcode = 'check_violation';
  end if;

  -- A trava no PLANO: serializa os extras do aluno (e a geração da semana, que
  -- trava a mesma linha), e é o que torna seguro o `max(day_position) + 1`.
  select * into v_plan from public.study_plans p where p.id = p_study_plan_id for no key update;
  if not found or v_plan.student_id <> v_uid then
    raise exception 'planejamento nao encontrado' using errcode = 'no_data_found';
  end if;

  v_week := (p_date - v_plan.starts_on) / 7 + 1;
  v_weekday := extract(isodow from p_date)::integer;

  select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
  if found then
    select * into v_seen_goal from public.goals g where g.id = v_seen.goal_id;
    return app_private.replay_extra_study(v_seen, v_seen_goal, v_uid, p_study_plan_id, v_title,
      v_subject, p_date, p_minutes, p_questions, p_correct_answers, v_note);
  end if;

  if v_plan.status <> 'active' then
    raise exception 'o planejamento nao esta ativo';
  end if;
  if not public.has_active_access() then
    raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
  end if;
  if p_date is null or p_date < v_plan.starts_on or p_date > v_latest then
    raise exception 'a data do estudo extra vai do inicio do planejamento ate hoje'
      using errcode = 'check_violation';
  end if;

  -- N-02: depois de tudo que já existe no dia. Seguro porque o plano está travado.
  select coalesce(max(g.day_position), 0) + 1 into v_position from public.goals g
   where g.study_plan_id = v_plan.id and g.week_number = v_week and g.weekday = v_weekday;

  begin  -- as DUAS inserções no bloco: a exceção desfaz a meta junto
    insert into public.goals (study_plan_id, teacher_id, student_id, week_number, weekday,
      weekday_name, day_position, type, subject, title, planned_minutes, status, completed_at)
    values (v_plan.id, v_plan.teacher_id, v_plan.student_id, v_week, v_weekday,
      (array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira',
             'Sábado','Domingo'])[v_weekday],
      v_position, 'extra', v_subject, v_title, p_minutes, 'completed', now())
    returning id into v_goal;

    insert into public.goal_entries (goal_id, teacher_id, student_id, minutes, questions,
      correct_answers, note, request_id, studied_on)
    values (v_goal, v_plan.teacher_id, v_plan.student_id, p_minutes, p_questions,
      p_correct_answers, v_note, p_request_id, p_date);
  exception when unique_violation then
    select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
    if not found then raise; end if;  -- era outra unicidade: propaga
    select * into v_seen_goal from public.goals g where g.id = v_seen.goal_id;
    return app_private.replay_extra_study(v_seen, v_seen_goal, v_uid, p_study_plan_id, v_title,
      v_subject, p_date, p_minutes, p_questions, p_correct_answers, v_note);
  end;
  return v_goal;
end;
$$;

-- 7. Privilégios. O Supabase concede EXECUTE por default a anon e authenticated,
--    e o Postgres a PUBLIC: revogue dos três antes do grant nominal.
revoke all on function app_private.replay_goal_entry(public.goal_entries, uuid, uuid, integer,
  integer, integer, text, text, public.theory_stage) from public, anon, authenticated;
revoke all on function app_private.replay_extra_study(public.goal_entries, public.goals, uuid,
  uuid, text, text, date, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.record_goal_entry(uuid, uuid, integer, integer, integer, text,
  text, public.theory_stage) from public, anon, authenticated;
revoke all on function public.record_extra_study(uuid, uuid, text, text, date, integer, integer,
  integer, text) from public, anon, authenticated;
grant execute on function public.record_goal_entry(uuid, uuid, integer, integer, integer, text,
  text, public.theory_stage) to authenticated;
grant execute on function public.record_extra_study(uuid, uuid, text, text, date, integer, integer,
  integer, text) to authenticated;

comment on function public.record_goal_entry(uuid, uuid, integer, integer, integer, text, text,
  public.theory_stage) is
  'Registra estudo numa meta sem bateria e passa pending a in_progress, numa transação. Idempotente com payload: goal_entries_request_uidx (índice único de request_id), comparando as colunas do registro.';
comment on function public.record_extra_study(uuid, uuid, text, text, date, integer, integer,
  integer, text) is
  'Cria a meta extra (já concluída) e o registro do dia escolhido, numa transação, com a posição depois da maior do dia. Idempotente com payload: goal_entries_request_uidx, comparando as colunas da meta e do registro.';

-- 8. O recorte por ano das comparações segue o dia do registro (N-07). As três
--    funções abaixo são as de origem com UM predicado trocado:
--      ge.created_at >= v_from and ge.created_at < v_to
--    por
--      coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date)
--        >= make_date(p_year, 1, 1) and ... < make_date(p_year + 1, 1, 1)
--    (v_from e v_to saem, sem uso). Com `studied_on` nulo é o mesmo limite UTC de
--    antes: nada muda para quem não é extra. `create or replace` preserva os grants.

-- Origem: 20260929230000_student_question_comparison.sql
-- Comparação anônima para o painel do aluno.
--
-- O navegador não recebe a lista de notas da turma. A função calcula tudo no
-- banco e devolve somente agregados quando há pelo menos cinco alunos com dez
-- ou mais questões no mesmo ano, na mesma turma e em planejamentos ativos.
create or replace function public.student_question_comparison(p_year integer)
returns table (
  sample_size integer,
  minimum_questions integer,
  student_questions bigint,
  student_score numeric,
  percentile numeric,
  box_min numeric,
  q1 numeric,
  median numeric,
  q3 numeric,
  box_max numeric,
  lower_whisker numeric,
  upper_whisker numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid();
  v_teacher uuid;
  v_class uuid;
  v_count integer := 0;
  v_questions bigint := 0;
  v_student_score numeric;
  v_min numeric;
  v_q1 numeric;
  v_median numeric;
  v_q3 numeric;
  v_max numeric;
  v_lower numeric;
  v_upper numeric;
  v_percentile numeric;
begin
  if p_year < 2000 or p_year > 2100 then
    raise exception 'ano fora do intervalo permitido';
  end if;

  if v_student is null or not public.has_active_access() or not exists (
    select 1 from public.profiles p where p.id = v_student and p.role = 'student'
  ) then
    raise exception 'comparacao disponivel apenas ao aluno com acesso ativo';
  end if;

  -- A turma é a da MATRÍCULA de hoje, e não só a de `study_plans.class_id`:
  -- nada atualiza o plano quando o aluno sai da turma, e quem saiu continuava
  -- recebendo a distribuição dos ex-colegas — sem contar na amostra, o que com
  -- cinco colegas eram as cinco notas exatas.
  select sp.teacher_id, sp.class_id
    into v_teacher, v_class
    from public.study_plans sp
    join public.class_students cs
      on cs.class_id = sp.class_id
     and cs.student_id = sp.student_id
     and cs.teacher_id = sp.teacher_id
   where sp.student_id = v_student and sp.status = 'active'
   order by sp.updated_at desc
   limit 1;

  if v_class is null then
    return query select 0, 10, 0::bigint, null::numeric, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric;
    return;
  end if;

  -- A tabela temporária da consulta fica dentro da função para que nenhuma
  -- linha individual atravesse a fronteira da API.
  with active_plans as (
    select sp.id, sp.student_id
      from public.study_plans sp
      join public.class_students cs
        on cs.class_id = sp.class_id
       and cs.student_id = sp.student_id
       and cs.teacher_id = sp.teacher_id
     where sp.teacher_id = v_teacher
       and sp.class_id = v_class
       and sp.status = 'active'
  ), totals as (
    select ap.student_id,
           coalesce(sum(ge.questions), 0)::bigint as questions,
           coalesce(sum(ge.correct_answers), 0)::bigint as correct
      from active_plans ap
      left join public.goals g on g.study_plan_id = ap.id and g.student_id = ap.student_id
      left join public.goal_entries ge
        on ge.goal_id = g.id
       and ge.student_id = ap.student_id
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date)
             >= make_date(p_year, 1, 1)
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date)
             < make_date(p_year + 1, 1, 1)
     group by ap.student_id
  ), eligible as (
    select student_id, questions,
           round((correct::numeric / questions::numeric) * 100, 2) as score
      from totals where questions >= 10
  ), aggregate as (
    select count(*)::integer as n,
           min(score) as min_score,
           percentile_cont(0.25) within group (order by score)::numeric as p25,
           percentile_cont(0.50) within group (order by score)::numeric as p50,
           percentile_cont(0.75) within group (order by score)::numeric as p75,
           max(score) as max_score
      from eligible
  )
  select a.n, a.min_score, a.p25, a.p50, a.p75, a.max_score,
         coalesce(t.questions, 0),
         case when coalesce(t.questions, 0) >= 10 then e.score end
    into v_count, v_min, v_q1, v_median, v_q3, v_max,
         v_questions, v_student_score
    from aggregate a
    left join totals t on t.student_id = v_student
    left join eligible e on e.student_id = v_student;

  -- A amostra mínima evita publicar quartis que praticamente revelariam as
  -- notas dos poucos colegas existentes na turma.
  if v_count < 5 then
    return query select v_count, 10, v_questions, v_student_score, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric;
    return;
  end if;

  with active_plans as (
    select sp.id, sp.student_id
      from public.study_plans sp
      join public.class_students cs
        on cs.class_id = sp.class_id
       and cs.student_id = sp.student_id
       and cs.teacher_id = sp.teacher_id
     where sp.teacher_id = v_teacher and sp.class_id = v_class and sp.status = 'active'
  ), eligible as (
    select ap.student_id,
           round((sum(ge.correct_answers)::numeric / sum(ge.questions)::numeric) * 100, 2) as score
      from active_plans ap
      join public.goals g on g.study_plan_id = ap.id and g.student_id = ap.student_id
      join public.goal_entries ge on ge.goal_id = g.id and ge.student_id = ap.student_id
     where coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) >= make_date(p_year, 1, 1)
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) < make_date(p_year + 1, 1, 1)
     group by ap.student_id
    having sum(ge.questions) >= 10
  )
  select min(score) filter (where score >= v_q1 - 1.5 * (v_q3 - v_q1)),
         max(score) filter (where score <= v_q3 + 1.5 * (v_q3 - v_q1)),
         case when v_student_score is null then null
              else round(100 * count(*) filter (
                where student_id <> v_student and score < v_student_score
              )::numeric / greatest(v_count - 1, 1), 1)
          end
    into v_lower, v_upper, v_percentile
    from eligible;

  return query select v_count, 10, v_questions, v_student_score, v_percentile,
    v_min, v_q1, v_median, v_q3, v_max, v_lower, v_upper;
end;
$$;

-- Origem: 20260930100000_student_weekly_question_comparison.sql
-- Distribuição semanal anônima para o aluno: uma caixa por semana do plano ativo.
-- Cada semana compara alunos da mesma turma e mesma posição semanal do plano.
create or replace function public.student_weekly_question_comparison(p_year integer)
returns table (
  week_number integer,
  sample_size integer,
  minimum_questions integer,
  student_questions bigint,
  student_score numeric,
  percentile numeric,
  box_min numeric,
  q1 numeric,
  median numeric,
  q3 numeric,
  box_max numeric,
  lower_whisker numeric,
  upper_whisker numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid();
  v_teacher uuid;
  v_class uuid;
  v_plan uuid;
begin
  if p_year < 2000 or p_year > 2100 then
    raise exception 'ano fora do intervalo permitido';
  end if;
  if v_student is null or not public.has_active_access() or not exists (
    select 1 from public.profiles p where p.id = v_student and p.role = 'student'
  ) then
    raise exception 'comparacao disponivel apenas ao aluno com acesso ativo';
  end if;

  -- A turma é a da MATRÍCULA de hoje, e não só a de `study_plans.class_id`:
  -- nada atualiza o plano quando o aluno sai da turma, e quem saiu continuava
  -- recebendo a distribuição dos ex-colegas — sem contar na amostra, o que com
  -- cinco colegas eram as cinco notas exatas.
  select sp.id, sp.teacher_id, sp.class_id
    into v_plan, v_teacher, v_class
    from public.study_plans sp
    join public.class_students cs
      on cs.class_id = sp.class_id
     and cs.student_id = sp.student_id
     and cs.teacher_id = sp.teacher_id
   where sp.student_id = v_student and sp.status = 'active'
   order by sp.updated_at desc
   limit 1;
  if v_plan is null or v_class is null then return; end if;

  return query
  with active_plans as (
    select sp.id, sp.student_id
      from public.study_plans sp
      join public.class_students cs
        on cs.class_id = sp.class_id
       and cs.student_id = sp.student_id
       and cs.teacher_id = sp.teacher_id
     where sp.teacher_id = v_teacher
       and sp.class_id = v_class
       and sp.status = 'active'
  ), weekly_totals as (
    select g.week_number as week, ap.student_id,
           sum(ge.questions)::bigint as questions,
           sum(ge.correct_answers)::bigint as correct
      from active_plans ap
      join public.goals g on g.study_plan_id = ap.id and g.student_id = ap.student_id
      join public.goal_entries ge on ge.goal_id = g.id and ge.student_id = ap.student_id
     where coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) >= make_date(p_year, 1, 1)
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) < make_date(p_year + 1, 1, 1)
       and g.week_number > 0
     group by g.week_number, ap.student_id
  ), weeks as (
    select distinct g.week_number as week
      from public.goals g
      join weekly_totals wt on wt.week = g.week_number
     where g.study_plan_id = v_plan
       and g.week_number > 0
  ), eligible as (
    select wt.week, wt.student_id, wt.questions,
           round(100 * wt.correct::numeric / wt.questions::numeric, 2) as score
      from weekly_totals wt
     where wt.questions >= 5
  ), quartiles as (
    select e.week, count(*)::integer as n,
           min(e.score) as min_score,
           percentile_cont(0.25) within group (order by e.score)::numeric as p25,
           percentile_cont(0.50) within group (order by e.score)::numeric as p50,
           percentile_cont(0.75) within group (order by e.score)::numeric as p75,
           max(e.score) as max_score
      from eligible e group by e.week
  ), distribution as (
    select q.week, q.n, q.min_score, q.p25, q.p50, q.p75, q.max_score,
           min(e.score) filter (where e.score >= q.p25 - 1.5 * (q.p75 - q.p25)) as lower_value,
           max(e.score) filter (where e.score <= q.p75 + 1.5 * (q.p75 - q.p25)) as upper_value
      from quartiles q join eligible e on e.week = q.week
     group by q.week, q.n, q.min_score, q.p25, q.p50, q.p75, q.max_score
  )
  select w.week, coalesce(d.n, 0), 5,
         coalesce(self_totals.questions, 0),
         case when coalesce(self_totals.questions, 0) >= 5 then self_result.score end,
         case when d.n >= 5 and self_result.score is not null then
           round(100 * (select count(*)::numeric from eligible peer
             where peer.week = w.week and peer.student_id <> v_student
               and peer.score < self_result.score) / greatest(d.n - 1, 1), 1)
         end,
         case when d.n >= 5 then d.min_score end,
         case when d.n >= 5 then d.p25 end,
         case when d.n >= 5 then d.p50 end,
         case when d.n >= 5 then d.p75 end,
         case when d.n >= 5 then d.max_score end,
         case when d.n >= 5 then d.lower_value end,
         case when d.n >= 5 then d.upper_value end
    from weeks w
    left join distribution d on d.week = w.week
    left join weekly_totals self_totals on self_totals.week = w.week and self_totals.student_id = v_student
    left join eligible self_result on self_result.week = w.week and self_result.student_id = v_student
   order by w.week;
end;
$$;

-- Origem: 20260930110000_student_subject_peer_comparison.sql
-- Média anônima dos colegas por disciplina, limitada à turma e ao plano ativo.
-- O aluno não recebe notas individuais; a média só aparece com cinco colegas elegíveis.
create or replace function public.student_subject_peer_comparison(p_year integer)
returns table (
  subject text,
  student_score numeric,
  peer_average numeric,
  sample_size integer,
  minimum_questions integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid();
  v_teacher uuid;
  v_class uuid;
  v_plan uuid;
begin
  if p_year < 2000 or p_year > 2100 then
    raise exception 'ano fora do intervalo permitido';
  end if;
  if v_student is null or not public.has_active_access() or not exists (
    select 1 from public.profiles p where p.id = v_student and p.role = 'student'
  ) then
    raise exception 'comparacao disponivel apenas ao aluno com acesso ativo';
  end if;

  -- A turma é a da MATRÍCULA de hoje, e não só a de `study_plans.class_id`:
  -- nada atualiza o plano quando o aluno sai da turma, e quem saiu continuava
  -- recebendo a distribuição dos ex-colegas — sem contar na amostra, o que com
  -- cinco colegas eram as cinco notas exatas.
  select sp.id, sp.teacher_id, sp.class_id
    into v_plan, v_teacher, v_class
    from public.study_plans sp
    join public.class_students cs
      on cs.class_id = sp.class_id
     and cs.student_id = sp.student_id
     and cs.teacher_id = sp.teacher_id
   where sp.student_id = v_student and sp.status = 'active'
   order by sp.updated_at desc
   limit 1;
  if v_plan is null or v_class is null then return; end if;

  return query
  with self_totals as (
    select g.subject as subject_name,
           sum(ge.questions)::bigint as questions,
           sum(ge.correct_answers)::bigint as correct
      from public.goals g
      join public.goal_entries ge
        on ge.goal_id = g.id and ge.student_id = v_student
     where g.study_plan_id = v_plan and g.student_id = v_student
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) >= make_date(p_year, 1, 1)
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) < make_date(p_year + 1, 1, 1)
     group by g.subject
    having sum(ge.questions) > 0
  ), peer_totals as (
    select g.subject as subject_name, sp.student_id,
           sum(ge.questions)::bigint as questions,
           sum(ge.correct_answers)::bigint as correct
      from public.study_plans sp
      join public.class_students cs
        on cs.class_id = sp.class_id
       and cs.student_id = sp.student_id
       and cs.teacher_id = sp.teacher_id
      join public.goals g
        on g.study_plan_id = sp.id and g.student_id = sp.student_id
      join public.goal_entries ge
        on ge.goal_id = g.id and ge.student_id = sp.student_id
     where sp.teacher_id = v_teacher and sp.class_id = v_class
       and sp.status = 'active' and sp.student_id <> v_student
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) >= make_date(p_year, 1, 1)
       and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date) < make_date(p_year + 1, 1, 1)
     group by g.subject, sp.student_id
    having sum(ge.questions) >= 5
  ), peer_averages as (
    select pt.subject_name, count(*)::integer as n,
           round(avg(100 * pt.correct::numeric / pt.questions::numeric), 2) as average_score
      from peer_totals pt
     group by pt.subject_name
  )
  select st.subject_name, round(100 * st.correct::numeric / st.questions::numeric, 2),
         case when pa.n >= 5 then pa.average_score end,
         coalesce(pa.n, 0), 5
    from self_totals st
    left join peer_averages pa on pa.subject_name = st.subject_name
   order by st.subject_name;
end;
$$;
