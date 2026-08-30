\pset pager off
\set ON_ERROR_STOP on
-- Resumo por tópicos da bateria — spec docs/specs/26-topicos-do-bloco-e-da-bateria.md
--
-- Cobre CA-01 a CA-04. Cria a própria semana (94) com duas baterias: uma
-- concluída, com as três fases, e outra que fica em andamento. As suítes
-- compartilham a base, e um teste que agrega precisa do próprio recorte.

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select '00 semana 94 criada' item, public.apply_study_plan_batch(
  'c0000000-0000-4000-8000-00000000009e'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 94::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Resumo — concluida','planned_minutes',60),
    jsonb_build_object('weekday',2,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Resumo — aberta','planned_minutes',60)
  ))::text valor;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- CA-01: as tres fases, agrupadas por topico ----------
do $$
declare v_goal uuid; v_session uuid; v_linhas integer;
        v_feitas integer; v_main integer; v_ref integer; v_ext integer;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=94 and title='Resumo — concluida' and deleted_at is null;

  select id into v_session from public.start_quiz_session(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'bbbb0000-0000-0000-0000-000000000001'::uuid, v_goal);

  -- 15 principais em dois tópicos, mais 1 reforço e 5 extras. A ordem importa:
  -- reforços e extras só podem existir depois de TODAS as principais.
  perform public.finish_quiz_session(v_session, 'f0000000-0000-4000-8000-0000000000b0'::uuid,
    (select jsonb_agg(x order by (x->>'execution_order')::int) from (
       select jsonb_build_object(
         'question_id', 1000 + g, 'execution_order', g, 'round', 0, 'phase','main',
         'outcome', case when g <= 10 then 'correct' else 'incorrect' end,
         'topic', case when g <= 8 then 'Cálculo' else 'Estatística' end,
         'answered_at', now()) as x
         from generate_series(1,15) g
       union all
       select jsonb_build_object(
         'question_id', 1030, 'execution_order', 16, 'round', 0, 'phase','reinforcement',
         'outcome','correct', 'topic','Estatística',
         'source_question_id', 1011, 'answered_at', now())
       union all
       select jsonb_build_object(
         'question_id', 1020 + g, 'execution_order', 16 + g, 'round', 1, 'phase','extra',
         'outcome', case when g <= 3 then 'correct' else 'incorrect' end,
         'topic','Cálculo', 'answered_at', now())
         from generate_series(1,5) g
     ) t));

  perform public.record_quiz_session_time(v_session,
    'f0000000-0000-4000-8000-0000000000b1'::uuid, 90);

  select count(*) into v_linhas from public.vw_session_topics where quiz_session_id = v_session;
  if v_linhas <> 2 then
    raise exception 'FALHOU: % topico(s) na bateria, esperava 2', v_linhas;
  end if;

  select answered, main_count, reinforcement_count, extra_count
    into v_feitas, v_main, v_ref, v_ext
    from public.vw_session_topics
   where quiz_session_id = v_session and topic = 'Cálculo';

  -- Cálculo: 8 principais + 5 extras = 13.
  if v_feitas <> 13 or v_main <> 8 or v_ref <> 0 or v_ext <> 5 then
    raise exception 'FALHOU: Cálculo veio % feitas / % main / % ref / % extra',
      v_feitas, v_main, v_ref, v_ext;
  end if;

  select answered, main_count, reinforcement_count
    into v_feitas, v_main, v_ref
    from public.vw_session_topics
   where quiz_session_id = v_session and topic = 'Estatística';

  -- Estatística: 7 principais + 1 reforço = 8.
  if v_feitas <> 8 or v_main <> 7 or v_ref <> 1 then
    raise exception 'FALHOU: Estatística veio % feitas / % main / % ref',
      v_feitas, v_main, v_ref;
  end if;
  raise notice '01 OK  agrupa por topico e separa as tres fases';
end $$;

-- Os acertos por fase batem com a nota da sessao.
do $$
declare v_main_ok integer; v_extra_ok integer; v_geral integer;
begin
  select sum(main_correct), sum(extra_correct), sum(correct)
    into v_main_ok, v_extra_ok, v_geral
    from public.vw_session_topics t
    join public.goals g on g.id = (select goal_id from public.quiz_sessions where id = t.quiz_session_id)
   where g.title = 'Resumo — concluida';

  if v_main_ok <> 10 then raise exception 'FALHOU: % acertos principais, esperava 10', v_main_ok; end if;
  if v_extra_ok <> 3 then raise exception 'FALHOU: % acertos extras, esperava 3', v_extra_ok; end if;
  -- 10 principais + 1 reforço + 3 extras.
  if v_geral <> 14 then raise exception 'FALHOU: % acertos no total, esperava 14', v_geral; end if;
  raise notice '02 OK  os acertos por fase somam a nota da sessao';
end $$;

-- ---------- CA-02: bateria em andamento nao entra ----------
do $$
declare v_goal uuid; v_session uuid; v_linhas integer;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=94 and title='Resumo — aberta' and deleted_at is null;

  select id into v_session from public.start_quiz_session(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'bbbb0000-0000-0000-0000-000000000001'::uuid, v_goal);

  select count(*) into v_linhas from public.vw_session_topics where quiz_session_id = v_session;
  if v_linhas <> 0 then
    raise exception 'FALHOU: bateria em andamento trouxe % linha(s)', v_linhas;
  end if;
  -- Cancelada tambem nao entra, e cancelar aqui libera o planejamento: so ha
  -- uma bateria aberta por vez, e a proxima asserção precisa abrir outra.
  perform public.finish_quiz_session(v_session, 'f0000000-0000-4000-8000-0000000000b4'::uuid,
                                     '[]'::jsonb, true);

  select count(*) into v_linhas from public.vw_session_topics where quiz_session_id = v_session;
  if v_linhas <> 0 then
    raise exception 'FALHOU: bateria cancelada trouxe % linha(s)', v_linhas;
  end if;
  raise notice '03 OK  bateria em andamento e cancelada nao tem resumo';
end $$;

-- ---------- CA-03: questao sem topico vira "Topico nao identificado" --------
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select '04 semana 95 criada' item, public.apply_study_plan_batch(
  'c0000000-0000-4000-8000-00000000009f'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 95::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Resumo — sem topico','planned_minutes',60)
  ))::text valor;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare v_goal uuid; v_session uuid; v_topic text;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=95 and title='Resumo — sem topico' and deleted_at is null;

  select id into v_session from public.start_quiz_session(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'bbbb0000-0000-0000-0000-000000000001'::uuid, v_goal);

  -- Tópico em branco e nulo: os dois caem no mesmo balde.
  perform public.finish_quiz_session(v_session, 'f0000000-0000-4000-8000-0000000000b2'::uuid,
    (select jsonb_agg(jsonb_build_object(
       'question_id', 1040 + g, 'execution_order', g, 'round', 0, 'phase','main',
       'outcome','correct',
       'topic', case when g % 2 = 0 then null else '   ' end,
       'answered_at', now()))
       from generate_series(1,15) g));

  perform public.record_quiz_session_time(v_session,
    'f0000000-0000-4000-8000-0000000000b3'::uuid, 60);

  select topic into v_topic from public.vw_session_topics where quiz_session_id = v_session;
  if v_topic is distinct from 'Tópico não identificado' then
    raise exception 'FALHOU: topico veio %', coalesce(v_topic,'nulo');
  end if;
  raise notice '05 OK  topico nulo e em branco caem em "Topico nao identificado"';
end $$;

-- ---------- CA-04: isolamento ----------
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_session_topics
   where student_id='22222222-2222-2222-2222-222222222222';
  if v_linhas <> 0 then
    raise exception 'FALHOU: aluno2 viu % linha(s) da bateria do aluno1', v_linhas;
  end if;
  raise notice '06 OK  aluno nao ve o resumo de outro (security_invoker)';
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_session_topics
   where student_id='22222222-2222-2222-2222-222222222222';
  if v_linhas < 3 then
    raise exception 'FALHOU: o professor viu so % linha(s)', v_linhas;
  end if;
  raise notice '07 OK  o professor do aluno enxerga o resumo';
end $$;

reset role;
do $$
declare v_inv boolean;
begin
  select 'security_invoker=true' = any(c.reloptions) into v_inv
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname='vw_session_topics';
  if v_inv is not true then
    raise exception 'FALHOU: vw_session_topics sem security_invoker';
  end if;
  raise notice '08 OK  vw_session_topics tem security_invoker';
end $$;
