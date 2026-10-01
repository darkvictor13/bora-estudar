-- Distribuição semanal anônima para o aluno: uma caixa por semana do plano ativo.
-- Cada semana compara alunos da mesma turma e mesma posição semanal do plano.
create function public.student_weekly_question_comparison(p_year integer)
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
  v_from timestamptz;
  v_to timestamptz;
begin
  if p_year < 2000 or p_year > 2100 then
    raise exception 'ano fora do intervalo permitido';
  end if;
  if v_student is null or not public.has_active_access() or not exists (
    select 1 from public.profiles p where p.id = v_student and p.role = 'student'
  ) then
    raise exception 'comparacao disponivel apenas ao aluno com acesso ativo';
  end if;

  select sp.id, sp.teacher_id, sp.class_id
    into v_plan, v_teacher, v_class
    from public.study_plans sp
   where sp.student_id = v_student and sp.status = 'active'
   order by sp.updated_at desc
   limit 1;
  if v_plan is null or v_class is null then return; end if;

  v_from := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC');
  v_to := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');

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
     where ge.created_at >= v_from and ge.created_at < v_to
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

revoke all on function public.student_weekly_question_comparison(integer)
  from public, anon, authenticated;
grant execute on function public.student_weekly_question_comparison(integer) to authenticated;
