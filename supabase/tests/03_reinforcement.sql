\pset pager off
\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- Três baterias concluídas no mesmo bloco, com 9/15 acertos cada (60%).
do $$
declare
  v_goal uuid; v_bat uuid; i int; v_plan uuid := (select id from public.study_plans
    where student_id='22222222-2222-2222-2222-222222222222');
  v_block uuid := (select id from public.study_plan_blocks limit 1);
begin
  -- Libera a bateria anulada do teste anterior e cria 3 ciclos novos.
  for i in 1..3 loop
    insert into public.goals (study_plan_id,student_id,teacher_id,week_number,weekday,day_order,
                              type,block_id,title,created_by)
    values (v_plan,'22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            2,i,1,'question_block',v_block,'Bateria '||i,'11111111-1111-1111-1111-111111111111')
    returning id into v_goal;

    v_bat := (public.start_quiz_session(v_plan, v_block, v_goal)).id;

    perform public.finish_quiz_session(v_bat, gen_random_uuid(),
      (select jsonb_agg(jsonb_build_object(
        'question_id', 1000 + ((i-1)*15) + g, 'execution_order', g, 'round', 0,
        'phase','main',
        'outcome', case when g<=9 then 'correct' else 'incorrect' end,
        'topic','T'||g, 'answered_at','2026-08-2'||i||'T10:00:00Z'))
       from generate_series(1,15) g), false);

    perform public.record_quiz_session_time(v_bat, gen_random_uuid(), 60);
  end loop;
end $$;

select '01 sessoes concluidas no bloco' item, count(*)::text valor
  from public.quiz_sessions where status='completed';

select '02 desempenho do ciclo' item, official_score_pct::text||'%' valor
  from public.vw_block_performance;

-- Erros únicos que o reforço PRECISA cobrir (6 por bateria x 3 = 18).
create temp table erradas as
select distinct q.question_id
  from public.quiz_session_questions q join public.quiz_sessions b on b.id=q.quiz_session_id
 where b.status='completed' and q.phase='main' and q.outcome='incorrect';
select '03 erros unicos do ciclo' item, count(*)::text valor from erradas;

-- Reforço INCOMPLETO deve ser rejeitado.
do $$
declare v_bats uuid[] := (select array_agg(id) from public.quiz_sessions where status='completed');
begin
  perform public.record_reinforcement(
    (select id from public.study_plans where student_id='22222222-2222-2222-2222-222222222222'),
    (select id from public.study_plan_blocks limit 1),
    v_bats, gen_random_uuid(),
    (select jsonb_agg(jsonb_build_object('question_id',question_id,'phase','main','outcome','correct'))
       from (select question_id from erradas limit 5) x));
  raise exception 'FALHOU: aceitou reforco incompleto';
exception when others then
  if sqlerrm like '%revisar%' then raise notice '04 OK  reforco incompleto rejeitado: %', sqlerrm;
  else raise; end if;
end $$;

-- Reforço COMPLETO deve passar.
do $$
declare
  v_bats uuid[] := (select array_agg(id) from public.quiz_sessions where status='completed');
  v_r public.reinforcements%rowtype;
begin
  v_r := public.record_reinforcement(
    (select id from public.study_plans where student_id='22222222-2222-2222-2222-222222222222'),
    (select id from public.study_plan_blocks limit 1),
    v_bats, 'e0000000-0000-0000-0000-00000000000e'::uuid,
    (select jsonb_agg(jsonb_build_object('question_id',question_id,'phase','main','outcome','correct'))
       from erradas));
  raise notice '05 OK  reforco registrado: desempenho de origem %%%', v_r.source_score;
end $$;

select '06 reinforcement_sessions (3)' item, count(*)::text valor from public.reinforcement_sessions;
select '07 reinforcement_questions (18)' item, count(*)::text valor from public.reinforcement_questions;
select '08 review_cycle criado' item, count(*)::text valor from public.review_cycles;

-- Uma bateria não pode entrar em dois ciclos.
do $$
declare v_bats uuid[] := (select array_agg(id) from public.quiz_sessions where status='completed');
begin
  perform public.record_reinforcement(
    (select id from public.study_plans where student_id='22222222-2222-2222-2222-222222222222'),
    (select id from public.study_plan_blocks limit 1),
    v_bats, gen_random_uuid(),
    (select jsonb_agg(jsonb_build_object('question_id',question_id,'phase','main','outcome','correct')) from erradas));
  raise exception 'FALHOU: reaproveitou bateria em dois ciclos';
exception when unique_violation then
  raise notice '09 OK  sessao reaproveitada em outro ciclo bloqueada';
end $$;
