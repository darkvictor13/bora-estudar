\pset pager off
\set ON_ERROR_STOP on
-- Dificuldades por tópico — spec docs/specs/23-dificuldades-por-topico.md
--
-- Cobre CA-01 a CA-03. Usa os usuários das suítes 01 e 02, e uma bateria criada
-- aqui com tópicos controlados: as suítes anteriores gravam `topic` nulo, e o
-- que se testa é justamente o agrupamento POR tópico.
--
-- O ledger é append-only por gatilho, então as linhas entram pela RPC real.

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select '00 semana 92 criada' item, public.apply_study_plan_batch(
  'c0000000-0000-4000-8000-00000000009c'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 92::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Bateria tópicos A','planned_minutes',60),
    jsonb_build_object('weekday',2,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Bateria tópicos B','planned_minutes',60)
  ))::text valor;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- Bateria 1: 2 erros em "Álgebra", 1 em "Geometria" ----------
do $$
declare v_goal uuid; v_session uuid;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=92 and title='Bateria tópicos A' and deleted_at is null;

  select id into v_session from public.start_quiz_session(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'bbbb0000-0000-0000-0000-000000000001'::uuid, v_goal);

  perform public.finish_quiz_session(v_session, 'f0000000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_array(
      jsonb_build_object('question_id',1001,'execution_order',1,'round',0,'phase','main',
        'outcome','incorrect','topic','Álgebra','answered_at',now()),
      jsonb_build_object('question_id',1002,'execution_order',2,'round',0,'phase','main',
        'outcome','incorrect','topic','Álgebra','answered_at',now()),
      jsonb_build_object('question_id',1003,'execution_order',3,'round',0,'phase','main',
        'outcome','correct','topic','Álgebra','answered_at',now()),
      jsonb_build_object('question_id',1004,'execution_order',4,'round',0,'phase','main',
        'outcome','incorrect','topic','Geometria','answered_at',now()),
      jsonb_build_object('question_id',1005,'execution_order',5,'round',0,'phase','main',
        'outcome','correct','topic','Trigonometria','answered_at',now())
    ), false);

  perform public.record_quiz_session_time(v_session, 'f0000000-0000-4000-8000-000000000002'::uuid, 60);
  raise notice '01 OK  bateria 1 gravada com tópicos';
end $$;

-- ---------- Bateria 2: mais 1 erro em "Álgebra" (2ª bateria!) ----------
do $$
declare v_goal uuid; v_session uuid;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=92 and title='Bateria tópicos B' and deleted_at is null;

  select id into v_session from public.start_quiz_session(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'bbbb0000-0000-0000-0000-000000000001'::uuid, v_goal);

  perform public.finish_quiz_session(v_session, 'f0000000-0000-4000-8000-000000000003'::uuid,
    jsonb_build_array(
      jsonb_build_object('question_id',1006,'execution_order',1,'round',0,'phase','main',
        'outcome','incorrect','topic','Álgebra','answered_at',now()),
      jsonb_build_object('question_id',1007,'execution_order',2,'round',0,'phase','main',
        'outcome','correct','topic','Geometria','answered_at',now())
    ), false);

  perform public.record_quiz_session_time(v_session, 'f0000000-0000-4000-8000-000000000004'::uuid, 45);
  raise notice '02 OK  bateria 2 gravada';
end $$;

-- ---------- CA-01: a agregação ----------
do $$
declare r record;
begin
  select * into r from public.vw_topic_difficulty
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and block_id='bbbb0000-0000-0000-0000-000000000001' and topic='Álgebra';

  if r.answered <> 4 then raise exception 'FALHOU: answered=% (esperado 4)', r.answered; end if;
  if r.correct <> 1 then raise exception 'FALHOU: correct=% (esperado 1)', r.correct; end if;
  if r.incorrect <> 3 then raise exception 'FALHOU: incorrect=% (esperado 3)', r.incorrect; end if;
  if r.distinct_wrong <> 3 then
    raise exception 'FALHOU: distinct_wrong=% (esperado 3)', r.distinct_wrong;
  end if;
  -- É o número que decide "recorrente": erro em 2 baterias distintas.
  if r.sessions_with_error <> 2 then
    raise exception 'FALHOU: sessions_with_error=% (esperado 2)', r.sessions_with_error;
  end if;
  if r.score_pct <> 25 then raise exception 'FALHOU: score_pct=%', r.score_pct; end if;
  raise notice '03 OK  Álgebra agregada: 4 respondidas, 3 erros, 2 baterias com erro';
end $$;

do $$
declare v_sessoes integer;
begin
  select sessions_with_error into v_sessoes from public.vw_topic_difficulty
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and block_id='bbbb0000-0000-0000-0000-000000000001' and topic='Geometria';
  if v_sessoes <> 1 then
    raise exception 'FALHOU: Geometria com % baterias com erro (esperado 1)', v_sessoes;
  end if;
  raise notice '04 OK  Geometria errou em 1 bateria só — nao e recorrente';
end $$;

-- Tópico sem erro nenhum existe na view, com incorrect = 0. Quem o esconde é a
-- tela (R-DIFI-07): a view descreve, a tela decide o que mostrar.
do $$
declare v_erros integer;
begin
  select incorrect into v_erros from public.vw_topic_difficulty
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and block_id='bbbb0000-0000-0000-0000-000000000001' and topic='Trigonometria';
  if v_erros <> 0 then
    raise exception 'FALHOU: Trigonometria com % erros', v_erros;
  end if;
  raise notice '05 OK  topico sem erro aparece na view com incorrect = 0';
end $$;

-- ---------- CA-02: fase e status ----------
-- As suítes anteriores gravaram extras e reforços; nenhum deles pode ter
-- entrado nesta agregação.
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_topic_difficulty d
   where exists (
     select 1 from public.quiz_session_questions q
      join public.quiz_sessions s on s.id = q.quiz_session_id
     where s.student_id = d.student_id and q.phase <> 'main'
       and coalesce(nullif(btrim(q.topic),''),'Tópico não identificado') = d.topic
       and s.block_id = d.block_id
       and not exists (
         select 1 from public.quiz_session_questions q2
          where q2.quiz_session_id = q.quiz_session_id and q2.phase = 'main'
            and coalesce(nullif(btrim(q2.topic),''),'Tópico não identificado') = d.topic
       )
   );
  if v_linhas <> 0 then
    raise exception 'FALHOU: % linha(s) vieram de fase diferente de main', v_linhas;
  end if;
  raise notice '06 OK  so a fase main entra na agregacao';
end $$;

-- ---------- CA-03: isolamento ----------
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_topic_difficulty
   where student_id='22222222-2222-2222-2222-222222222222';
  if v_linhas <> 0 then
    raise exception 'FALHOU: aluno2 viu % linha(s) do aluno1', v_linhas;
  end if;
  raise notice '07 OK  aluno nao ve a dificuldade de outro (security_invoker)';
end $$;

-- O professor do aluno1 vê.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_topic_difficulty
   where student_id='22222222-2222-2222-2222-222222222222';
  if v_linhas < 3 then
    raise exception 'FALHOU: o professor viu so % linha(s)', v_linhas;
  end if;
  raise notice '08 OK  o professor do aluno enxerga a agregacao';
end $$;

reset role;

do $$
declare v_ok boolean;
begin
  select coalesce(c.reloptions, '{}') @> array['security_invoker=true'] into v_ok
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname='vw_topic_difficulty';
  if not v_ok then
    raise exception 'FALHOU: vw_topic_difficulty sem security_invoker';
  end if;
  raise notice '09 OK  vw_topic_difficulty tem security_invoker';
end $$;
