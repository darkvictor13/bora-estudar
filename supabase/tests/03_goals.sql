\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- A fronteira entre planejar e executar
-- =============================================================================
-- "O professor planeja, o aluno executa" é a frase do CLAUDE.md. Aqui ela vira
-- asserção. São quatro gatilhos e duas policies sustentando a mesma regra, e
-- cada um cobre um buraco que os outros deixam:
--
--   goals_insert                   o aluno só cria extra e reforço
--   protect_goal_planning_fields   o `type` é do professor; o resto também,
--                                  nas metas dele
--   protect_goal_notebook_block    só o professor REAL do planejamento liga
--                                  meta a caderno
--   protect_goal_quiz_result       número de bateria é do motor
--   freeze_goal_with_sessions      contexto congela quando já existe bateria
--
-- Os gatilhos são BEFORE UPDATE e disparam em ordem alfabética de NOME. Onde
-- dois pegariam a mesma mudança, o teste confere o assunto da mensagem e não
-- qual gatilho falou — amarrar no gatilho tornaria o teste refém da ordem.
-- =============================================================================

set role authenticated;

-- ---------- O aluno não cria meta de planejamento ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title
  ) values (
    'a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',1,3,'Quarta',1,'theory','Ciências Forenses','Teoria que eu inventei');
  raise exception 'FALHOU: o aluno criou meta de teoria';
exception when insufficient_privilege then
  raise notice '01 OK  o aluno nao cria meta de planejamento';
end $$;

do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title
  ) values (
    'a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',1,3,'Quarta',1,'extra','Ciências Forenses','Simulado');
  raise notice '02 OK  o aluno cria estudo extra no proprio planejamento ativo';
end $$;

-- ---------- Acesso vencido não escreve ----------
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title
  ) values (
    'a2000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
    '66666666-6666-4666-8666-666666666666',1,3,'Quarta',1,'extra','Ciências Forenses','Simulado');
  raise exception 'FALHOU: aluna com acesso vencido lancou estudo extra';
exception when insufficient_privilege then
  raise notice '03 OK  has_active_access() barra quem venceu, no WITH CHECK';
end $$;

do $$
declare v_total integer;
begin
  -- E continua LENDO o próprio histórico: o bloqueio é de escrita.
  select count(*) into v_total from public.goals;
  if v_total < 1 then
    raise exception 'FALHOU: quem venceu perdeu o proprio historico';
  end if;
  raise notice '04 OK  quem venceu continua lendo o que ja era dele';
end $$;

-- ---------- O `type` é do professor, inclusive na meta do próprio aluno ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  update public.goals set type = 'extra'
   where id = 'a5000000-0000-4000-8000-000000000002';
  raise exception 'FALHOU: o aluno trocou o tipo da meta do professor';
exception when raise_exception then
  if sqlerrm not like '%tipo da meta%' then raise; end if;
  raise notice '05 OK  o tipo da meta so e alterado pelo professor';
end $$;

do $$ begin
  update public.goals set title = 'Teoria renomeada pelo aluno'
   where id = 'a5000000-0000-4000-8000-000000000002';
  raise exception 'FALHOU: o aluno reescreveu o planejamento do professor';
exception when raise_exception then
  if sqlerrm not like '%planejamento da meta%' then raise; end if;
  raise notice '06 OK  titulo, materia, dia e minutos sao do professor';
end $$;

do $$ begin
  update public.goals set title = 'Anki — 30 cartas'
   where id = 'a5000000-0000-4000-8000-000000000003';
  raise notice '07 OK  o aluno edita o estudo extra que ele mesmo lancou';
end $$;

-- ---------- O aluno registra execução na meta do professor ----------
do $$ begin
  update public.goals set status = 'completed', spent_minutes = 45, completed_at = now()
   where id = 'a5000000-0000-4000-8000-000000000002';
  raise notice '08 OK  executar a meta do professor continua sendo do aluno';
end $$;

-- ---------- Meta ligada a caderno: só o professor real ----------
do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title, notebook_block_id
  ) values (
    'a2000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',1,4,'Quinta',1,'question_block',
    'Ciências Forenses','Bateria que eu marquei','a4000000-0000-4000-8000-000000000001');
  raise exception 'FALHOU: o aluno criou meta de bateria se pondo como professor';
exception
  when raise_exception then
    if sqlerrm not like '%professor real%' then raise; end if;
    raise notice '09 OK  so o professor real do planejamento liga meta a caderno';
  when insufficient_privilege then
    raise notice '09 OK  so o professor real do planejamento liga meta a caderno (barrado na policy)';
end $$;

-- ---------- Resultado de bateria é do motor ----------
do $$ begin
  update public.goals set questions_answered = 15, correct_answers = 15
   where id = 'a5000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o aluno escreveu o proprio resultado de bateria';
exception when raise_exception then
  if sqlerrm not like '%motor de baterias%' then raise; end if;
  raise notice '10 OK  o resultado da meta de bateria so muda pelo motor';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$ begin
  update public.goals set correct_answers = 15
   where id = 'a5000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o professor escreveu o resultado da bateria';
exception when raise_exception then
  if sqlerrm not like '%motor de baterias%' then raise; end if;
  raise notice '11 OK  nem o professor escreve o resultado da bateria';
end $$;

-- ---------- Contexto congela depois que existe bateria ----------
do $$ begin
  update public.goals set type = 'theory'
   where id = 'a5000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o contexto da meta mudou com bateria existindo';
exception when raise_exception then
  if sqlerrm not like '%bateria%' then raise; end if;
  raise notice '12 OK  contexto tecnico congela depois da primeira bateria';
end $$;

-- ---------- O professor planeja o que é dele ----------
do $$ begin
  update public.goals set title = 'Teoria — aula 1 (revisada)', planned_minutes = 50
   where id = 'a5000000-0000-4000-8000-000000000002';
  raise notice '13 OK  o professor reescreve o planejamento da propria meta';
end $$;

-- ---------- Duas metas na mesma casa do dia ----------
do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title
  ) values (
    'a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',1,1,'Segunda',1,'theory','Ciências Forenses','Duplicata');
  raise exception 'FALHOU: duas metas ocuparam a mesma casa da semana';
exception when unique_violation then
  raise notice '14 OK  goals_one_per_slot_idx recusa duas metas na mesma casa';
end $$;
