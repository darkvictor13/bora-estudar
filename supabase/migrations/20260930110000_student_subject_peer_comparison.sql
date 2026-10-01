-- Média anônima dos colegas por disciplina, limitada à turma e ao plano ativo.
-- O aluno não recebe notas individuais; a média só aparece com cinco colegas elegíveis.
create function public.student_subject_peer_comparison(p_year integer)
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
  with self_totals as (
    select g.subject as subject_name,
           sum(ge.questions)::bigint as questions,
           sum(ge.correct_answers)::bigint as correct
      from public.goals g
      join public.goal_entries ge
        on ge.goal_id = g.id and ge.student_id = v_student
     where g.study_plan_id = v_plan and g.student_id = v_student
       and ge.created_at >= v_from and ge.created_at < v_to
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
       and ge.created_at >= v_from and ge.created_at < v_to
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

revoke all on function public.student_subject_peer_comparison(integer)
  from public, anon, authenticated;
grant execute on function public.student_subject_peer_comparison(integer) to authenticated;
