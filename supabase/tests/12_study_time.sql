\pset pager off
\set ON_ERROR_STOP on
-- Tempo de estudo — spec docs/specs/25-tempo-de-estudo-e-series.md
--
-- Cobre CA-01 a CA-03. Cria a própria semana (93) para não somar o que as
-- suítes anteriores deixaram: as suítes compartilham a base e rodam em
-- sequência, e um teste que agrega precisa criar o próprio recorte.
--
-- O que estas asserções seguram: que o minuto vem da bateria quando há bateria
-- e do declarado quando não há, que meta reaberta some da view no mesmo
-- instante, e que a view não vaza tempo entre alunos.

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select '00 semana 93 criada' item, public.apply_study_plan_batch(
  'c0000000-0000-4000-8000-00000000009d'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 93::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Tempo — bateria','planned_minutes',60),
    jsonb_build_object('weekday',2,'position',1,'type','theory',
      'title','Tempo — teoria','planned_minutes',60),
    jsonb_build_object('weekday',3,'position',1,'type','theory',
      'title','Tempo — sem minuto','planned_minutes',60)
  ))::text valor;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- CA-01: o minuto vem da bateria ----------
do $$
declare v_goal uuid; v_session uuid; v_min integer;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and title='Tempo — bateria' and deleted_at is null;

  select id into v_session from public.start_quiz_session(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'bbbb0000-0000-0000-0000-000000000001'::uuid, v_goal);

  perform public.finish_quiz_session(v_session, 'f0000000-0000-4000-8000-00000000009d'::uuid,
    (select jsonb_agg(jsonb_build_object(
       'question_id', 1000 + g, 'execution_order', g, 'round', 0, 'phase','main',
       'outcome', case when g <= 12 then 'correct' else 'incorrect' end,
       'topic','Tempo','answered_at', now()))
       from generate_series(1,15) g));

  perform public.record_quiz_session_time(v_session,
    'f0000000-0000-4000-8000-00000000009e'::uuid, 97);

  select minutes_spent into v_min from public.vw_study_time where goal_id = v_goal;
  if v_min is distinct from 97 then
    raise exception 'FALHOU: a meta de bateria trouxe % em vez de 97', coalesce(v_min::text,'nada');
  end if;
  raise notice '01 OK  o minuto da meta de bateria vem de quiz_sessions';
end $$;

-- ---------- CA-01: o minuto vem do declarado ----------
do $$
declare v_goal uuid; v_min integer; v_q integer;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and title='Tempo — teoria' and deleted_at is null;

  perform public.complete_goal(v_goal, 'f0000000-0000-4000-8000-00000000009f'::uuid, 45, null);

  select minutes_spent, questions_answered into v_min, v_q
    from public.vw_study_time where goal_id = v_goal;
  if v_min is distinct from 45 then
    raise exception 'FALHOU: a meta de teoria trouxe % em vez de 45', coalesce(v_min::text,'nada');
  end if;
  if v_q <> 0 then
    raise exception 'FALHOU: meta de teoria trouxe % questoes', v_q;
  end if;
  raise notice '02 OK  o minuto da meta sem bateria vem do declarado';
end $$;

-- ---------- CA-13: nao existe meta concluida sem minuto ----------
-- A v96 aceitava e somava `Number(m.tempo)||0`. Aqui os dois caminhos ate
-- `completed` exigem o tempo, e e o banco que garante — nao a tela.
do $$
declare v_goal uuid;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and title='Tempo — recusa nulo' and deleted_at is null;

  perform public.complete_goal(v_goal, 'f0000000-0000-4000-8000-0000000000a0'::uuid, null, null);
  raise exception 'FALHOU: concluiu meta sem informar tempo';
exception when others then
  if sqlerrm not like '%tempo em minutos%' then raise; end if;
  raise notice '03 OK  concluir sem tempo e recusado (a meta continua pendente)';
end $$;

-- E a view nao tem uma linha sequer com minuto nulo.
do $$
declare v_nulas integer;
begin
  select count(*) into v_nulas from public.vw_study_time where minutes_spent is null;
  if v_nulas <> 0 then
    raise exception 'FALHOU: % linha(s) concluida(s) sem minuto', v_nulas;
  end if;
  raise notice '04 OK  nenhuma meta concluida sem minuto';
end $$;

-- ---------- A data é local, e não UTC ----------
do $$
declare v_data date; v_esperada date;
begin
  select completed_on into v_data from public.vw_study_time
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001' and week_number=93
   limit 1;
  v_esperada := (now() at time zone 'America/Sao_Paulo')::date;
  if v_data is distinct from v_esperada then
    raise exception 'FALHOU: data % em vez de % (fuso local)', v_data, v_esperada;
  end if;
  raise notice '05 OK  completed_on e a data local, nao a UTC';
end $$;

-- ---------- CA-02: meta reaberta some ----------
do $$
declare v_goal uuid; v_linhas integer;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and title='Tempo — teoria' and deleted_at is null;

  perform public.reopen_goal(v_goal, 'f0000000-0000-4000-8000-0000000000a1'::uuid);

  select count(*) into v_linhas from public.vw_study_time where goal_id = v_goal;
  if v_linhas <> 0 then
    raise exception 'FALHOU: a meta reaberta continua na view';
  end if;
  raise notice '06 OK  meta reaberta sai da view no mesmo instante';
end $$;

-- E volta ao ser concluída de novo, com o tempo novo.
do $$
declare v_goal uuid; v_min integer;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and title='Tempo — teoria' and deleted_at is null;

  perform public.complete_goal(v_goal, 'f0000000-0000-4000-8000-0000000000a2'::uuid, 30, null);

  select minutes_spent into v_min from public.vw_study_time where goal_id = v_goal;
  if v_min is distinct from 30 then
    raise exception 'FALHOU: apos reconcluir, % em vez de 30', coalesce(v_min::text,'nada');
  end if;
  raise notice '07 OK  reconcluir devolve a linha com o tempo novo';
end $$;

-- ---------- A disciplina vem do bloco; a atividade, da meta ----------
do $$
declare v_disc text; v_teoria text;
begin
  select subject_name into v_disc from public.vw_study_time
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and goal_type='question_block';
  if v_disc is distinct from 'Ciências Forenses' then
    raise exception 'FALHOU: disciplina % na meta de bateria', coalesce(v_disc,'nula');
  end if;

  -- Meta de teoria nao tem bloco, entao nao tem disciplina: quem a agrupa e a
  -- atividade, do lado da tela (R-TEMP-08).
  select subject_name into v_teoria from public.vw_study_time
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=93 and goal_type='theory' limit 1;
  if v_teoria is not null then
    raise exception 'FALHOU: meta de teoria trouxe disciplina %', v_teoria;
  end if;
  raise notice '08 OK  disciplina vem do bloco, e meta sem bloco vem sem disciplina';
end $$;

-- ---------- CA-03: isolamento ----------
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_study_time
   where student_id='22222222-2222-2222-2222-222222222222';
  if v_linhas <> 0 then
    raise exception 'FALHOU: aluno2 viu % linha(s) de tempo do aluno1', v_linhas;
  end if;
  raise notice '09 OK  aluno nao ve o tempo de outro (security_invoker)';
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.vw_study_time
   where student_id='22222222-2222-2222-2222-222222222222' and week_number=93;
  -- Duas, e não três: a terceira meta foi recusada por não informar tempo.
  if v_linhas <> 2 then
    raise exception 'FALHOU: o professor viu % linha(s) da semana 93, esperava 2', v_linhas;
  end if;
  raise notice '10 OK  o professor do aluno enxerga o tempo dele';
end $$;

reset role;
do $$
declare v_inv boolean;
begin
  select 'security_invoker=true' = any(c.reloptions) into v_inv
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname='vw_study_time';
  if v_inv is not true then
    raise exception 'FALHOU: vw_study_time sem security_invoker';
  end if;
  raise notice '11 OK  vw_study_time tem security_invoker';
end $$;
