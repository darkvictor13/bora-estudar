\pset pager off
\set ON_ERROR_STOP on
-- Cenário do v93: uma sessão com as três fases.
-- 15 principais (11 ac / 4 er) + 5 extras (3 ac / 2 er) + 4 reforços (1 ac / 3 er).
--   desempenho oficial   = 11/15 = 73%
--   aproveitamento total = 15/24 = 63%
--
-- Usa um bloco EXCLUSIVO desta suíte: as anteriores deixam sessões no bloco
-- padrão, e os agregados por bloco somariam as duas coisas.

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

do $$
declare
  v_plan  uuid := (select id from public.study_plans where student_id='22222222-2222-2222-2222-222222222222');
  v_block uuid;
  v_goal  uuid;
  v_sess  uuid;
begin
  insert into public.catalog_blocks (id, catalog_key, block_key, number, name, subject_key, subject_name)
  values ('cccc0000-0000-4000-8000-0000000000f1','pcpr26','pcpr26_fases',9,'Bloco de fases','fases','Fases');

  insert into public.study_plan_blocks (id, study_plan_id, student_id, teacher_id, catalog_block_id,
                                        subject_name, name, subject_order, block_order)
  values ('bbbb0000-0000-4000-8000-0000000000f1', v_plan,
          '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
          'cccc0000-0000-4000-8000-0000000000f1','Fases','Bloco de fases', 9, 0)
  returning id into v_block;

  insert into public.goals (study_plan_id, student_id, teacher_id, week_number, weekday, day_order,
                            type, block_id, title, created_by)
  values (v_plan,'22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
          9, 6, 1, 'question_block', v_block, 'Sessão com extras e reforços',
          '11111111-1111-1111-1111-111111111111')
  returning id into v_goal;

  v_sess := (public.start_quiz_session(v_plan, v_block, v_goal)).id;

  perform public.finish_quiz_session(v_sess, gen_random_uuid(),
    (select jsonb_agg(x) from (
       select jsonb_build_object('question_id',7000+g,'execution_order',g,'round',0,'phase','main',
         'outcome', case when g<=11 then 'correct' else 'incorrect' end,
         'topic','T','answered_at','2026-08-22T10:00:00Z') as x
         from generate_series(1,15) g
       union all
       select jsonb_build_object('question_id',7100+g,'execution_order',15+g,'round',0,'phase','extra',
         'outcome', case when g<=3 then 'correct' else 'incorrect' end,
         'topic','T','answered_at','2026-08-22T10:30:00Z')
         from generate_series(1,5) g
       union all
       select jsonb_build_object('question_id',7200+g,'execution_order',20+g,'round',1,'phase','reinforcement',
         'outcome', case when g=1 then 'correct' else 'incorrect' end,
         'source_question_id',7000+11+g,
         'topic','T','answered_at','2026-08-22T11:00:00Z')
         from generate_series(1,4) g
     ) t), false);

  perform public.record_quiz_session_time(v_sess, gen_random_uuid(), 95);
end $$;

create temp table scope as
select 'bbbb0000-0000-4000-8000-0000000000f1'::uuid as block_id;

select '01 composicao da sessao' item,
       main_count||'P '||extra_count||'E '||reinforcement_count||'R = '||total_count||' total' valor
  from public.vw_quiz_session_performance where block_id = (select block_id from scope);

select '02 acertos por fase' item,
       'P '||main_correct||'/'||main_count||'  E '||extra_correct||'/'||extra_count||'  R '||reinforcement_correct||'/'||reinforcement_count valor
  from public.vw_quiz_session_performance where block_id = (select block_id from scope);

select '03 erros por fase' item,
       'P '||main_incorrect||'  E '||extra_incorrect||'  R '||reinforcement_incorrect valor
  from public.vw_quiz_session_performance where block_id = (select block_id from scope);

select '04 desempenho oficial (esperado 73%)' item, official_score_pct::text||'%' valor
  from public.vw_block_performance where block_id = (select block_id from scope);

select '05 aproveitamento total (esperado 63%)' item, total_score_pct::text||'%' valor
  from public.vw_block_performance where block_id = (select block_id from scope);

do $$
declare v_oficial smallint; v_total smallint;
begin
  select official_score_pct, total_score_pct into v_oficial, v_total
    from public.vw_block_performance where block_id='bbbb0000-0000-4000-8000-0000000000f1';
  if v_oficial <> 73 then raise exception 'FALHOU: oficial deveria ser 73%%, veio %%%', v_oficial; end if;
  if v_total <> 63 then raise exception 'FALHOU: total deveria ser 63%%, veio %%%', v_total; end if;
  raise notice '06 OK  as duas medidas coexistem: oficial 73%%, total 63%%';
end $$;

-- A nota da meta NÃO pode incluir extras nem reforços.
do $$
declare v_q integer; v_a integer;
begin
  select p.questions_answered, p.correct_answers into v_q, v_a
    from public.vw_goal_performance p
    join public.goals g on g.id = p.goal_id
   where g.block_id = 'bbbb0000-0000-4000-8000-0000000000f1';
  if v_q <> 15 or v_a <> 11 then
    raise exception 'FALHOU: extras/reforcos vazaram para a nota oficial (% de %)', v_a, v_q;
  end if;
  raise notice '07 OK  extras e reforcos ficam fora da nota oficial (%/%)', v_a, v_q;
end $$;

-- Caderno de erros: as três fases, cada uma rotulada.
select '08 questoes erradas no bloco' item, count(*)::text valor
  from public.vw_block_errors where block_id = (select block_id from scope);

select '09 erros por fase no caderno' item,
       'P '||sum(main_errors)||'  E '||sum(extra_errors)||'  R '||sum(reinforcement_errors) valor
  from public.vw_block_errors where block_id = (select block_id from scope);

do $$
declare v_total integer;
begin
  select sum(main_errors+extra_errors+reinforcement_errors) into v_total
    from public.vw_block_errors where block_id='bbbb0000-0000-4000-8000-0000000000f1';
  if v_total <> 9 then
    raise exception 'FALHOU: esperado 9 erros (4P + 2E + 3R), obtido %', v_total;
  end if;
  raise notice '10 OK  caderno de erros reune as tres fases (4P + 2E + 3R)';
end $$;
