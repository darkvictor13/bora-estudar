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
  v_from timestamptz;
  v_to timestamptz;
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

  select sp.teacher_id, sp.class_id
    into v_teacher, v_class
    from public.study_plans sp
   where sp.student_id = v_student and sp.status = 'active'
   order by sp.updated_at desc
   limit 1;

  if v_class is null then
    return query select 0, 10, 0::bigint, null::numeric, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric;
    return;
  end if;

  v_from := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC');
  v_to := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');

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
       and ge.created_at >= v_from
       and ge.created_at < v_to
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
     where ge.created_at >= v_from and ge.created_at < v_to
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

revoke all on function public.student_question_comparison(integer)
  from public, anon, authenticated;
grant execute on function public.student_question_comparison(integer) to authenticated;
