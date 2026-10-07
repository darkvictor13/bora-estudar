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
--   generate_week, clear_pending_goals
--                                  gerar e limpar a semana: uma transação, e
--                                  nunca o que o aluno estudou (spec 04)
--   goal_entries_goal_fk           NO ACTION: meta com registro não se apaga
--   protect_goal_planning_fields   (também) o resultado da meta sem bateria sai dos
--                                  registros, e o aluno não o escreve (QA-28)
--   goals_update / goals_delete / goal_entries_delete
--                                  acesso vigente para concluir, pular e apagar
--                                  (QA-07, N-05)
--   record_goal_entry, record_extra_study
--                                  o registro e o estudo extra: uma transação,
--                                  idempotentes por goal_entries_request_uidx
--                                  (QA-04, QA-10, QA-11, N-02, N-07)
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

-- Desde o 5c o aluno não tem ramo em `goals_insert`: nem `extra`, nem `reinforcement`.
-- O WITH CHECK da policy só aceita `teacher_id = auth.uid()`, e Bruno não é o professor
-- da linha. Estudo extra é `record_extra_study` (R-EXTRA-06).
do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title
  ) values (
    'a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',1,3,'Quarta',1,'extra','Ciências Forenses','Simulado');
  raise exception 'FALHOU: o aluno criou estudo extra por INSERT direto em goals';
exception when insufficient_privilege then
  raise notice '02 OK  o aluno nao insere meta, nem extra: o WITH CHECK so aceita o professor';
end $$;

do $$ begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title, spent_minutes, questions_answered, correct_answers
  ) values (
    'a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',1,3,'Quarta',1,'reinforcement','Ciências Forenses',
    'Reforço com resultado de fabrica', 120, 50, 50);
  raise exception 'FALHOU: o aluno criou reforco ja com o resultado preenchido';
exception when insufficient_privilege then
  raise notice '02b OK  nem reforco nasce com minutos e acertos do aluno (o gatilho do QA-28 e BEFORE UPDATE)';
end $$;

do $$
declare v_meta uuid;
begin
  -- O caminho que sobrou, com a assinatura do 5a: a meta nasce `extra` e `completed`.
  v_meta := public.record_extra_study('ae000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001', 'extra_questions', 'Ciências Forenses',
    current_date, 30, 10, 8);
  if not exists (select 1 from public.goals where id = v_meta and type = 'extra' and status = 'completed') then
    raise exception 'FALHOU: record_extra_study nao gravou a meta extra';
  end if;
  raise notice '02c OK  o estudo extra do aluno nasce por record_extra_study';
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
  -- Desde o 5c o motivo é a falta do ramo do aluno em `goals_insert`, e não o acesso
  -- vencido. O vencido pela RPC é teste do 5a (casos 36 e seguintes).
  raise notice '03 OK  quem venceu tambem nao insere meta: o ramo do aluno saiu de goals_insert';
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
  -- Sem `spent_minutes`: o resultado da meta sai dos registros (QA-28, caso 28).
  update public.goals set status = 'completed', completed_at = now()
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

-- =============================================================================
-- Gerar a semana (spec 04) — a semana 7 do plano do Bruno
-- =============================================================================
-- Cenário próprio, na semana 7, para não depender do que as suítes anteriores
-- fizeram na 1. Só o caso 27 toca na semana 1, e vem por último porque apaga os
-- estudos extras dela.
-- =============================================================================
reset role;
select app_test.act_as_owner();

insert into public.goals (
  id, study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
  day_position, type, subject, title, planned_minutes, status
) values
  ('a5000000-0000-4000-8000-000000000101','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   7,1,'Segunda',1,'theory','Ciências Forenses','Pendente',60,'pending'),
  ('a5000000-0000-4000-8000-000000000102','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   7,1,'Segunda',2,'theory','Ciências Forenses','Em andamento com registro',60,'in_progress'),
  ('a5000000-0000-4000-8000-000000000103','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   7,2,'Terça',1,'theory','Ciências Forenses','Concluída sem registro',60,'completed'),
  ('a5000000-0000-4000-8000-000000000104','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   7,3,'Quarta',1,'theory','Ciências Forenses','Pulada',60,'skipped');

insert into public.goal_entries (id, goal_id, teacher_id, student_id, minutes, questions, correct_answers) values
  ('a6000000-0000-4000-8000-000000000102','a5000000-0000-4000-8000-000000000102',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',40,0,0);

set role authenticated;

-- ---------- Quem pode gerar ----------
select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$ begin
  perform public.generate_week('ad000000-0000-4000-8000-0000000000f1',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"X","title":"Invasao","planned_minutes":60}]');
  raise exception 'FALHOU: Davi gerou a semana de um aluno que nao e dele';
exception when insufficient_privilege then
  -- Davi nao enxerga as metas (RLS): a conferencia de que nada mudou e a previa
  -- da Ana, no caso 17, que ainda conta 4.
  raise notice '15 OK  professor alheio nao gera a semana';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  perform public.generate_week('ad000000-0000-4000-8000-0000000000f2',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"X","title":"Invasao","planned_minutes":60}]');
  raise exception 'FALHOU: o aluno gerou a propria semana';
exception when insufficient_privilege then
  raise notice '16 OK  o aluno nao gera a propria semana';
end $$;

-- ---------- A prévia ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_total integer; v_preservadas integer;
begin
  select goals_total, goals_preserved into v_total, v_preservadas
    from public.week_replacement_preview('a2000000-0000-4000-8000-000000000001', 7);
  if v_total <> 4 or v_preservadas <> 2 then
    raise exception 'FALHOU: a previa contou (%, %), esperava (4, 2)', v_total, v_preservadas;
  end if;
  raise notice '17 OK  a previa conta a concluida e a com registro como preservadas';
end $$;

select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$ begin
  perform * from public.week_replacement_preview('a2000000-0000-4000-8000-000000000001', 7);
  raise exception 'FALHOU: Davi viu a previa da semana de outro professor';
exception when insufficient_privilege then
  raise notice '17 OK  professor alheio nao ve a previa';
end $$;

-- ---------- Falha no meio: a semana continua como estava (QA-05) ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$ begin
  perform public.generate_week('ad000000-0000-4000-8000-0000000000e1',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":9,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"X","title":"Dia invalido","planned_minutes":60}]');
  raise exception 'FALHOU: generate_week aceitou weekday 9';
exception when check_violation then
  null;
end $$;
do $$
declare v_metas integer; v_registros integer; v_lotes integer;
begin
  select count(*) into v_metas from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7;
  select count(*) into v_registros from public.goal_entries
   where goal_id = 'a5000000-0000-4000-8000-000000000102';
  select count(*) into v_lotes from public.goal_batches
   where id = 'ad000000-0000-4000-8000-0000000000e1';
  if v_metas <> 4 or v_registros <> 1 or v_lotes <> 0 then
    raise exception 'FALHOU: a falha deixou a semana em % metas, % registro(s), % lote(s)', v_metas, v_registros, v_lotes;
  end if;
  raise notice '18 OK  a gravacao que falha deixa a semana como estava';
end $$;

do $$
declare v_metas integer;
begin
  begin
    perform public.generate_week('ad000000-0000-4000-8000-0000000000e2',
      'a2000000-0000-4000-8000-000000000001', 7, '[]');
    raise exception 'FALHOU: generate_week aceitou semana vazia';
  exception when raise_exception then
    if sqlerrm not like '%ao menos uma meta%' then raise; end if;
  end;
  begin
    perform public.generate_week('ad000000-0000-4000-8000-0000000000e3',
      'a2000000-0000-4000-8000-000000000001', 0,
      '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"X","title":"S0","planned_minutes":60}]');
    raise exception 'FALHOU: generate_week aceitou a semana 0';
  exception when raise_exception then
    if sqlerrm not like '%1 a 520%' then raise; end if;
  end;
  select count(*) into v_metas from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7;
  if v_metas <> 4 then
    raise exception 'FALHOU: a recusa mexeu na semana (% metas)', v_metas;
  end if;
  raise notice '19 OK  semana vazia e semana fora de 1 a 520 sao recusadas sem tocar em nada';
end $$;

-- ---------- Gerar: sai o que não foi feito, fica o resto ----------
do $$
declare v_replay boolean; v_ficaram integer; v_sairam integer; v_seg integer; v_ter integer;
begin
  v_replay := public.generate_week('ad000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Nova de segunda","planned_minutes":60},
      {"weekday":2,"weekday_name":"Terça-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Nova de terça","planned_minutes":60}]');
  select count(*) into v_ficaram from public.goals
   where id in ('a5000000-0000-4000-8000-000000000102','a5000000-0000-4000-8000-000000000103');
  select count(*) into v_sairam from public.goals
   where id in ('a5000000-0000-4000-8000-000000000101','a5000000-0000-4000-8000-000000000104');
  select day_position into v_seg from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7 and title = 'Nova de segunda';
  select day_position into v_ter from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7 and title = 'Nova de terça';
  if v_replay or v_ficaram <> 2 or v_sairam <> 0 then
    raise exception 'FALHOU: replay %, ficaram %, sairam % (esperava false, 2, 0)', v_replay, v_ficaram, v_sairam;
  end if;
  if v_seg <> 3 or v_ter <> 2 then
    raise exception 'FALHOU: posicoes % e % (esperava 3 e 2: depois da maior que sobrou)', v_seg, v_ter;
  end if;
  raise notice '20 OK  gerar preserva a concluida e a com registro, e posiciona depois da maior';
end $$;

-- ---------- O aluno registra na meta nova ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  -- Pela RPC: desde o 5c o INSERT direto em `goal_entries` não existe.
  perform public.record_goal_entry('ae000000-0000-4000-8000-000000000003', g.id, 30, 0, 0)
    from public.goals g
   where g.study_plan_id = 'a2000000-0000-4000-8000-000000000001' and g.week_number = 7
     and g.title = 'Nova de segunda';
  raise notice '21 OK  o aluno registra estudo na meta que acabou de ser gerada';
end $$;

-- ---------- O replay não reexecuta ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_replay boolean; v_total integer;
begin
  v_replay := public.generate_week('ad000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Nova de segunda","planned_minutes":60},
      {"weekday":2,"weekday_name":"Terça-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Nova de terça","planned_minutes":60}]');
  select count(*) into v_total from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7;
  if not v_replay or v_total <> 4 then
    raise exception 'FALHOU: a retentativa reexecutou a geracao (replay %, % metas)', v_replay, v_total;
  end if;
  raise notice '22 OK  mesmo pedido depois de gravado devolve sem reexecutar';
end $$;

do $$ begin
  perform public.generate_week('ad000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 8,
    '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"X","title":"Outra semana","planned_minutes":60}]');
  raise exception 'FALHOU: o mesmo id foi aceito para outra semana';
exception when raise_exception then
  if sqlerrm not like '%outra semana%' then raise; end if;
  raise notice '23 OK  id reusado com outra semana e recusado';
end $$;

-- ---------- Uma segunda geração preserva a meta que ganhou registro ----------
do $$
declare v_total integer; v_titulos text;
begin
  perform public.generate_week('ad000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":3,"weekday_name":"Quarta-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Segunda geracao","planned_minutes":60}]');
  select count(*), string_agg(title, ' | ' order by title) into v_total, v_titulos from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7;
  if v_total <> 4 or v_titulos like '%Nova de terça%' or v_titulos not like '%Nova de segunda%' then
    raise exception 'FALHOU: depois da segunda geracao a semana tem % metas: %', v_total, v_titulos;
  end if;
  raise notice '24 OK  a meta nova que ganhou registro sobrevive a uma segunda geracao';
end $$;

-- ---------- O DELETE direto (o caminho do bundle antigo) não leva o estudo ----------
do $$
declare v_registros integer;
begin
  begin
    delete from public.goals where id = 'a5000000-0000-4000-8000-000000000102';
    raise exception 'FALHOU: o DELETE direto apagou meta com estudo registrado';
  exception when foreign_key_violation then
    null;
  end;
  select count(*) into v_registros from public.goal_entries
   where goal_id = 'a5000000-0000-4000-8000-000000000102';
  if v_registros <> 1 then
    raise exception 'FALHOU: o registro da meta 0102 sumiu (% linhas)', v_registros;
  end if;
  raise notice '25 OK  goal_entries_goal_fk e no action: meta com registro nao se apaga';
end $$;

-- ---------- Limpar apaga o que gerar substituiria ----------
do $$
declare v_primeira integer; v_segunda integer; v_ficaram integer;
begin
  v_primeira := public.clear_pending_goals('a2000000-0000-4000-8000-000000000001', 7);
  v_segunda  := public.clear_pending_goals('a2000000-0000-4000-8000-000000000001', 7);
  select count(*) into v_ficaram from public.goals
   where id in ('a5000000-0000-4000-8000-000000000102','a5000000-0000-4000-8000-000000000103');
  if v_primeira <> 1 or v_segunda <> 0 or v_ficaram <> 2 then
    raise exception 'FALHOU: limpar apagou % e depois %, e ficaram % (esperava 1, 0, 2)', v_primeira, v_segunda, v_ficaram;
  end if;
  raise notice '26 OK  limpar apaga so o pendente, e a segunda chamada apaga 0';
end $$;

-- ---------- Semana 1: a bateria e o registro ficam (por último) ----------
do $$
declare v_bateria integer; v_registro integer;
begin
  perform public.generate_week('ad000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000001', 1,
    '[{"weekday":5,"weekday_name":"Sexta-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Sexta nova","planned_minutes":60}]');
  select count(*) into v_bateria from public.goals where id = 'a5000000-0000-4000-8000-000000000001';
  select count(*) into v_registro from public.goals where id = 'a5000000-0000-4000-8000-000000000002';
  if v_bateria <> 1 or v_registro <> 1 then
    raise exception 'FALHOU: gerar a semana 1 apagou a meta com bateria (%) ou com registro (%)', v_bateria, v_registro;
  end if;
  raise notice '27 OK  a meta com bateria e a com registro sobrevivem a gerar';
end $$;

-- =============================================================================
-- A escrita do aluno: registro de estudo e estudo extra
-- =============================================================================
-- Vem DEPOIS de gerar a semana de propósito: o caso 27 apaga os estudos extras da
-- semana 1, e estes casos usam cenário próprio (semana 8) e limpam o que criaram.
-- A numeração continua a de cima, e por isso 28 em diante.
-- =============================================================================
reset role;
select app_test.act_as_owner();

insert into public.goals (
  id, study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
  day_position, type, subject, title, planned_minutes, status
) values
  ('a5000000-0000-4000-8000-000000000201','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   8,1,'Segunda',1,'theory','Ciências Forenses','Teoria pendente',60,'pending'),
  ('a5000000-0000-4000-8000-000000000202','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   8,1,'Segunda',2,'theory','Ciências Forenses','Outra teoria pendente',60,'pending'),
  ('a5000000-0000-4000-8000-000000000203','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   8,2,'Terça',1,'extra','Ciências Forenses','Anki',30,'pending'),
  ('a5000000-0000-4000-8000-000000000205','a2000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',
   8,1,'Segunda',1,'extra','Ciências Forenses','Extra da Fabi',30,'pending');
insert into public.goal_entries (id, goal_id, teacher_id, student_id, minutes, questions, correct_answers) values
  ('a6000000-0000-4000-8000-000000000205','a5000000-0000-4000-8000-000000000005',
   '11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',20,0,0);

-- ---------- O aluno não escreve o resultado da meta sem bateria (QA-28) ----------
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_meta uuid; v_coluna text;
begin
  -- A de teoria do professor e a de estudo extra dele: o `type` do extra deixa o
  -- aluno editar o título, mas não o número.
  foreach v_meta in array array[
    'a5000000-0000-4000-8000-000000000002'::uuid, 'a5000000-0000-4000-8000-000000000203'::uuid
  ] loop
    foreach v_coluna in array array['spent_minutes', 'questions_answered', 'correct_answers'] loop
      begin
        execute format('update public.goals set %I = 5 where id = %L', v_coluna, v_meta);
        raise exception 'FALHOU: o aluno escreveu % da meta %', v_coluna, v_meta;
      exception when raise_exception then
        if sqlerrm not like '%resultado da meta%' then raise; end if;
      end;
    end loop;
  end loop;
  raise notice '28 OK  o resultado da meta sem bateria e dos registros, e o aluno nao o escreve';
end $$;

-- ---------- Acesso vencido não conclui, não pula, não apaga (QA-07, N-05) ----------
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  update public.goals set status = 'completed', completed_at = now()
   where id = 'a5000000-0000-4000-8000-000000000005';
  raise exception 'FALHOU: aluna com acesso vencido concluiu a meta';
exception when insufficient_privilege then
  null;
end $$;
do $$ begin
  update public.goals set status = 'skipped'
   where id = 'a5000000-0000-4000-8000-000000000005';
  raise exception 'FALHOU: aluna com acesso vencido pulou a meta';
exception when insufficient_privilege then
  raise notice '29 OK  concluir e pular exigem acesso vigente (WITH CHECK de goals_update)';
end $$;

do $$
declare v_registros integer; v_metas integer;
begin
  -- DELETE barrado pelo USING filtra em silêncio: conta linhas.
  delete from public.goal_entries where id = 'a6000000-0000-4000-8000-000000000205';
  get diagnostics v_registros = row_count;
  delete from public.goals where id = 'a5000000-0000-4000-8000-000000000205';
  get diagnostics v_metas = row_count;
  if v_registros <> 0 or v_metas <> 0 then
    raise exception 'FALHOU: aluna vencida apagou % registro(s) e % meta(s)', v_registros, v_metas;
  end if;
  select count(*) into v_registros from public.goal_entries
   where id = 'a6000000-0000-4000-8000-000000000205';
  select count(*) into v_metas from public.goals
   where id = 'a5000000-0000-4000-8000-000000000205';
  if v_registros <> 1 or v_metas <> 1 then
    raise exception 'FALHOU: o registro ou a meta da Fabi sumiram (% e %)', v_registros, v_metas;
  end if;
  raise notice '30 OK  apagar registro e meta extra exige acesso vigente (0 linhas, sem erro)';
end $$;

-- ---------- O INSERT direto do bundle antigo foi fechado (PR 5c) ----------
-- Antes do 5c este caso esperava o contrário, por compatibilidade com o bundle no ar.
-- Hoje o registro nasce só nas RPCs, e o privilégio de INSERT não existe.
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  insert into public.goal_entries (goal_id, teacher_id, student_id, minutes, questions, correct_answers)
  values ('a5000000-0000-4000-8000-000000000202','11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222', 15, 0, 0);
  raise exception 'FALHOU: o INSERT direto do aluno em goal_entries ainda e aceito';
exception when insufficient_privilege then
  raise notice '31 OK  o INSERT direto do aluno em goal_entries foi fechado (so as RPCs registram)';
end $$;

-- ---------- record_goal_entry ----------
do $$
declare
  v_chave uuid := 'ae000000-0000-4000-8000-000000000001';
  v_id uuid; v_repetido uuid; v_linhas integer; v_status text; v_dia date;
begin
  v_id := public.record_goal_entry(v_chave, 'a5000000-0000-4000-8000-000000000201', 25, 10, 8, 'anotacao');
  select count(*), min(status::text) into v_linhas, v_status
    from public.goal_entries e join public.goals g on g.id = e.goal_id
   where e.request_id = v_chave;
  select studied_on into v_dia from public.goal_entries where id = v_id;
  if v_linhas <> 1 or v_status <> 'in_progress' or v_dia is not null then
    raise exception 'FALHOU: 1a chamada deixou % linha(s), meta %, studied_on %', v_linhas, v_status, v_dia;
  end if;

  v_repetido := public.record_goal_entry(v_chave, 'a5000000-0000-4000-8000-000000000201', 25, 10, 8, 'anotacao');
  select count(*) into v_linhas from public.goal_entries where request_id = v_chave;
  if v_repetido <> v_id or v_linhas <> 1 then
    raise exception 'FALHOU: a retentativa devolveu % (esperava %) e deixou % linhas', v_repetido, v_id, v_linhas;
  end if;

  -- O texto é normalizado antes de comparar: espaço nas pontas não é outro payload.
  v_repetido := public.record_goal_entry(v_chave, 'a5000000-0000-4000-8000-000000000201', 25, 10, 8, '  anotacao ');
  if v_repetido <> v_id then
    raise exception 'FALHOU: espaco na nota virou outro payload';
  end if;
  raise notice '32 OK  record_goal_entry grava, passa a in_progress, e a retentativa nao duplica';
end $$;

do $$ begin
  perform public.record_goal_entry('ae000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000201', 26, 10, 8, 'anotacao');
  raise exception 'FALHOU: mesma chave com outros minutos foi aceita';
exception when unique_violation then
  null;
end $$;
do $$ begin
  perform public.record_goal_entry('ae000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000202', 25, 10, 8, 'anotacao');
  raise exception 'FALHOU: mesma chave noutra meta foi aceita';
exception when unique_violation then
  raise notice '33 OK  mesma chave com outro payload (minutos, meta) e recusada com 23505';
end $$;

select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
do $$ begin
  perform public.record_goal_entry('ae000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000004', 25, 10, 8, 'anotacao');
  raise exception 'FALHOU: Carla reaproveitou a chave do Bruno';
exception when unique_violation then
  raise notice '34 OK  a chave de outro aluno nao devolve nem vaza o registro dele';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  perform public.record_goal_entry(gen_random_uuid(), 'a5000000-0000-4000-8000-000000000001', 25, 0, 0);
  raise exception 'FALHOU: registro numa meta de bateria';
exception when raise_exception then
  if sqlerrm not like '%bateria%' then raise; end if;
end $$;
do $$ begin
  perform public.record_goal_entry(gen_random_uuid(), 'a5000000-0000-4000-8000-000000000004', 25, 0, 0);
  raise exception 'FALHOU: Bruno registrou na meta da Carla';
exception when no_data_found then
  null;
end $$;
do $$ begin
  perform public.record_goal_entry(gen_random_uuid(), 'a5000000-0000-4000-8000-000000000201', 241, 0, 0);
  raise exception 'FALHOU: 241 minutos foram aceitos';
exception when check_violation then
  null;
end $$;
do $$ begin
  perform public.record_goal_entry(gen_random_uuid(), 'a5000000-0000-4000-8000-000000000201', 0, 0, 0);
  raise exception 'FALHOU: o registro vazio foi aceito';
exception when check_violation then
  raise notice '35 OK  bateria, meta alheia e numero fora da regra sao recusados, cada um com o seu SQLSTATE';
end $$;

select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  perform public.record_goal_entry(gen_random_uuid(), 'a5000000-0000-4000-8000-000000000005', 10, 0, 0);
  raise exception 'FALHOU: aluna com acesso vencido registrou estudo';
exception when insufficient_privilege then
  raise notice '36 OK  acesso vencido nao registra estudo';
end $$;

-- ---------- record_extra_study ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare
  v_chave uuid := 'ae000000-0000-4000-8000-000000000011';
  v_goal uuid; v_repetido uuid; v_segundo uuid; v_metas integer;
  v_meta public.goals; v_entry public.goal_entries; v_posicao_1 integer; v_posicao_2 integer;
begin
  v_goal := public.record_extra_study(v_chave, 'a2000000-0000-4000-8000-000000000001',
    'anki', 'Português', current_date, 20, 10, 8, 'nota');
  select * into v_meta from public.goals where id = v_goal;
  select * into v_entry from public.goal_entries where request_id = v_chave;
  if v_meta.type <> 'extra' or v_meta.status <> 'completed' or v_meta.completed_at is null
     or v_meta.week_number <> 1 or v_meta.weekday <> extract(isodow from current_date)
     or v_meta.title <> 'Anki' or v_meta.subject <> 'Português'
     or v_entry.goal_id <> v_goal or v_entry.studied_on is distinct from current_date
     or v_entry.minutes <> 20 or v_entry.questions <> 10 or v_entry.correct_answers <> 8 then
    raise exception 'FALHOU: o extra nasceu errado (meta %, registro %)', row_to_json(v_meta), row_to_json(v_entry);
  end if;
  v_posicao_1 := v_meta.day_position;

  -- N-02: o segundo extra do mesmo dia, com outra chave, cabe na posição seguinte.
  v_segundo := public.record_extra_study('ae000000-0000-4000-8000-000000000012',
    'a2000000-0000-4000-8000-000000000001', 'review', 'Direito', current_date, 15, 0, 0);
  select day_position into v_posicao_2 from public.goals where id = v_segundo;
  if v_segundo = v_goal or v_posicao_2 <> v_posicao_1 + 1 then
    raise exception 'FALHOU: o segundo extra do dia ficou na posicao % (o primeiro: %)', v_posicao_2, v_posicao_1;
  end if;

  -- A retentativa devolve a mesma meta, sem meta nova.
  select count(*) into v_metas from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and type = 'extra';
  v_repetido := public.record_extra_study(v_chave, 'a2000000-0000-4000-8000-000000000001',
    'anki', 'Português', current_date, 20, 10, 8, ' nota ');
  if v_repetido <> v_goal
     or (select count(*) from public.goals
          where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and type = 'extra') <> v_metas then
    raise exception 'FALHOU: a retentativa do extra devolveu % ou criou meta nova', v_repetido;
  end if;
  raise notice '37 OK  record_extra_study cria meta e registro com studied_on, cabe o segundo do dia, e a retentativa nao duplica';
end $$;

do $$
declare v_caso record;
begin
  -- A chave de 37 com outro payload: o replay compara ANTES de olhar a data.
  for v_caso in
    select * from (values
      ('minutos',  current_date, 21, 'Português'),
      ('data',     current_date + 1, 20, 'Português'),
      ('materia',  current_date, 20, 'Outra')
    ) as t(o_que, dia, minutos, materia)
  loop
    begin
      perform public.record_extra_study('ae000000-0000-4000-8000-000000000011',
        'a2000000-0000-4000-8000-000000000001', 'anki', v_caso.materia, v_caso.dia, v_caso.minutos, 10, 8, 'nota');
      raise exception 'FALHOU: mesma chave com outro(a) % foi aceita', v_caso.o_que;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise notice '38 OK  mesma chave com outros minutos, data ou materia e recusada com 23505';
end $$;

do $$
declare v_inicio date;
begin
  select starts_on into v_inicio from public.study_plans where id = 'a2000000-0000-4000-8000-000000000001';
  begin
    perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000001',
      'anki', 'Português', v_inicio - 1, 20, 0, 0);
    raise exception 'FALHOU: a data antes do inicio do planejamento foi aceita';
  exception when check_violation then null;
  end;
  begin
    perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000001',
      'anki', 'Português', current_date + 2, 20, 0, 0);
    raise exception 'FALHOU: a data futura foi aceita';
  exception when check_violation then null;
  end;
  begin
    perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000001',
      'outro', 'Português', current_date, 20, 0, 0);
    raise exception 'FALHOU: o tipo "outro" foi aceito';
  exception when check_violation then null;
  end;
  begin
    perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000001',
      'anki', '   ', current_date, 20, 0, 0);
    raise exception 'FALHOU: a materia em branco foi aceita';
  exception when check_violation then null;
  end;
  begin
    perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000001',
      'anki', 'Português', current_date, 241, 0, 0);
    raise exception 'FALHOU: 241 minutos foram aceitos';
  exception when check_violation then null;
  end;
  raise notice '39 OK  data fora de [starts_on, hoje+14h], tipo, materia e numero fora da regra sao recusados';
end $$;

do $$ begin
  perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000002',
    'anki', 'Português', current_date, 20, 0, 0);
  raise exception 'FALHOU: Bruno lancou extra no plano da Carla';
exception when no_data_found then
  raise notice '40 OK  plano alheio e plano inexistente dao o mesmo erro';
end $$;

select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-000000000004',
    'anki', 'Português', current_date, 20, 0, 0);
  raise exception 'FALHOU: aluna com acesso vencido lancou extra';
exception when insufficient_privilege then
  raise notice '41 OK  acesso vencido nao lanca estudo extra';
end $$;

reset role;
select app_test.act_as_owner();
insert into public.study_plans (id, teacher_id, student_id, name, starts_on, status) values
  ('a2000000-0000-4000-8000-0000000000e1','11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222','Plano pausado do Bruno', current_date, 'paused');
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  perform public.record_extra_study(gen_random_uuid(), 'a2000000-0000-4000-8000-0000000000e1',
    'anki', 'Português', current_date, 20, 0, 0);
  raise exception 'FALHOU: extra lancado num planejamento que nao esta ativo';
exception when raise_exception then
  if sqlerrm not like '%nao esta ativo%' then raise; end if;
  raise notice '42 OK  planejamento fora de active nao recebe estudo extra';
end $$;

-- Limpa o que este bloco criou: as suítes seguintes não contam com ele.
reset role;
select app_test.act_as_owner();
create temporary table limpeza_extras as
  select e.goal_id from public.goal_entries e
    join public.goals g on g.id = e.goal_id
   where e.request_id is not null and g.type = 'extra' and g.week_number = 1;
delete from public.goal_entries where request_id is not null;
delete from public.goal_entries
 where goal_id in (select id from public.goals where week_number = 8);
delete from public.goals where week_number = 8;
delete from public.goals where id in (select goal_id from limpeza_extras);
drop table limpeza_extras;
delete from public.study_plans where id = 'a2000000-0000-4000-8000-0000000000e1';
