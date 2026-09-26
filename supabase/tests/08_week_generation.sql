\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Gerar a semana, e o estado que os registros decidem
-- =============================================================================
-- `replace_week_goals` existe porque substituir a semana em duas requisições
-- deixava a semana vazia quando a segunda falhava, e porque o modo seguro
-- apagava o registro de estudo das metas em andamento. As asserções daqui
-- atacam as três coisas que a RPC promete:
--
--   * a transação: um lote com uma meta inválida não apaga nada;
--   * a preservação: o que o aluno estudou fica, no modo seguro;
--   * a idempotência: o mesmo `request_id` devolve o resultado guardado, e com
--     outro payload é recusado.
--
-- E os dois gatilhos que nasceram junto: o estado `pending`/`in_progress`
-- derivado de `goal_entries`, e o estudo extra que não colide com o do dia.
--
-- Usa a semana 5 do plano do Bruno, que nenhuma suíte anterior toca.
-- =============================================================================

-- Bruno precisa de acesso vigente para lançar registro. As suítes anteriores
-- mexem no acesso de outros alunos, não no dele — mas a asserção não pode
-- depender disso em silêncio.
reset role;
select app_test.act_as_owner();
update public.profiles
   set access_status = 'active', access_expires_at = now() + interval '1 month'
 where id = '22222222-2222-4222-8222-222222222222';

set role authenticated;

-- ---------- Gerar cria as metas ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_criadas integer; v_removidas integer; v_preservadas integer; v_total integer;
begin
  select goals_created, goals_removed, goals_preserved
    into v_criadas, v_removidas, v_preservadas
    from public.replace_week_goals(
      'a2000000-0000-4000-8000-000000000001', 5, true,
      '[{"weekday":1,"weekday_name":"Segunda","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Teoria A","planned_minutes":60},
        {"weekday":1,"weekday_name":"Segunda","day_position":2,"type":"theory","subject":"Ciências Forenses","title":"Teoria B","planned_minutes":60}]',
      'ad000000-0000-4000-8000-000000000001');

  if v_criadas <> 2 or v_removidas <> 0 or v_preservadas <> 0 then
    raise exception 'FALHOU: gerar deu % criadas, % removidas, % preservadas',
      v_criadas, v_removidas, v_preservadas;
  end if;

  select count(*) into v_total from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5;
  if v_total <> 2 then
    raise exception 'FALHOU: a semana ficou com % metas', v_total;
  end if;
  raise notice '01 OK  replace_week_goals cria a semana';
end $$;

-- ---------- Mesmo request_id, mesmo payload: devolve sem reexecutar ----------
do $$
declare v_criadas integer; v_total integer; v_lotes integer;
begin
  select goals_created into v_criadas
    from public.replace_week_goals(
      'a2000000-0000-4000-8000-000000000001', 5, true,
      '[{"weekday":1,"weekday_name":"Segunda","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Teoria A","planned_minutes":60},
        {"weekday":1,"weekday_name":"Segunda","day_position":2,"type":"theory","subject":"Ciências Forenses","title":"Teoria B","planned_minutes":60}]',
      'ad000000-0000-4000-8000-000000000001');

  select count(*) into v_total from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5;
  select count(*) into v_lotes from public.week_batches
   where request_id = 'ad000000-0000-4000-8000-000000000001';

  if v_criadas <> 2 or v_total <> 2 or v_lotes <> 1 then
    raise exception 'FALHOU: a retentativa reexecutou (% criadas, % metas, % lotes)',
      v_criadas, v_total, v_lotes;
  end if;
  raise notice '02 OK  mesmo request_id e mesmo payload devolve o resultado guardado';
end $$;

-- ---------- Mesmo request_id, payload diferente: recusa ----------
do $$ begin
  perform public.replace_week_goals(
    'a2000000-0000-4000-8000-000000000001', 5, true,
    '[{"weekday":2,"weekday_name":"Terça","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Outra","planned_minutes":60}]',
    'ad000000-0000-4000-8000-000000000001');
  raise exception 'FALHOU: o mesmo request_id passou com outro payload';
exception when raise_exception then
  if sqlerrm not like '%outro pedido%' then raise; end if;
  raise notice '03 OK  mesmo request_id com payload diferente e rejeitado';
end $$;

-- ---------- O primeiro registro põe a meta em andamento ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_meta uuid; v_status public.goal_status;
begin
  select id into v_meta from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001'
     and week_number = 5 and title = 'Teoria A';

  insert into public.goal_entries (id, goal_id, teacher_id, student_id, minutes)
  values ('ae000000-0000-4000-8000-000000000001', v_meta,
          '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222', 40);

  select status into v_status from public.goals where id = v_meta;
  if v_status <> 'in_progress' then
    raise exception 'FALHOU: com registro, a meta ficou %', v_status;
  end if;
  raise notice '04 OK  o primeiro registro poe a meta em andamento, sem UPDATE do cliente';
end $$;

-- ---------- O modo seguro preserva o que o aluno estudou ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare
  v_criadas integer; v_removidas integer; v_preservadas integer;
  v_registros integer; v_posicao_nova integer; v_posicao_velha integer;
begin
  select goals_created, goals_removed, goals_preserved
    into v_criadas, v_removidas, v_preservadas
    from public.replace_week_goals(
      'a2000000-0000-4000-8000-000000000001', 5, true,
      '[{"weekday":1,"weekday_name":"Segunda","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Teoria C","planned_minutes":60}]',
      'ad000000-0000-4000-8000-000000000002');

  if v_criadas <> 1 or v_removidas <> 1 or v_preservadas <> 1 then
    raise exception 'FALHOU: o modo seguro deu % criadas, % removidas, % preservadas',
      v_criadas, v_removidas, v_preservadas;
  end if;

  select count(*) into v_registros from public.goal_entries
   where id = 'ae000000-0000-4000-8000-000000000001';
  if v_registros <> 1 then
    raise exception 'FALHOU: o registro de estudo da meta em andamento sumiu';
  end if;

  -- A posição é do banco: a nova entra DEPOIS da que sobreviveu no dia.
  select day_position into v_posicao_velha from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5 and title = 'Teoria A';
  select day_position into v_posicao_nova from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5 and title = 'Teoria C';
  if v_posicao_nova <= v_posicao_velha then
    raise exception 'FALHOU: a meta nova ficou na posicao % antes da preservada (%)',
      v_posicao_nova, v_posicao_velha;
  end if;
  raise notice '05 OK  o modo seguro preserva a meta em andamento, com o registro dela';
end $$;

-- ---------- Uma meta inválida no lote não apaga nada ----------
do $$
declare v_antes integer; v_depois integer;
begin
  select count(*) into v_antes from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5;

  begin
    -- O caderno não existe neste planejamento: a FK composta recusa o INSERT,
    -- que vem DEPOIS do DELETE.
    perform public.replace_week_goals(
      'a2000000-0000-4000-8000-000000000001', 5, false,
      '[{"weekday":1,"weekday_name":"Segunda","day_position":1,"type":"question_block","subject":"Ciências Forenses","title":"Bateria fantasma","planned_minutes":60,"notebook_block_id":"a4000000-0000-4000-8000-000000000099"}]',
      'ad000000-0000-4000-8000-000000000003');
    raise exception 'FALHOU: o lote com caderno inexistente passou';
  exception when foreign_key_violation then
    null;
  end;

  select count(*) into v_depois from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5;
  if v_depois <> v_antes then
    raise exception 'FALHOU: o lote recusado apagou % metas', v_antes - v_depois;
  end if;
  raise notice '06 OK  o lote e uma transacao: o INSERT recusado desfaz o DELETE';
end $$;

-- ---------- Apagar o último registro devolve a meta a pendente ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_status public.goal_status;
begin
  delete from public.goal_entries where id = 'ae000000-0000-4000-8000-000000000001';

  select status into v_status from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5 and title = 'Teoria A';
  if v_status <> 'pending' then
    raise exception 'FALHOU: sem registro nenhum, a meta ficou %', v_status;
  end if;
  raise notice '07 OK  sem registro, a meta volta a pendente';
end $$;

-- ---------- Só o professor do planejamento gera ----------
do $$ begin
  perform public.replace_week_goals(
    'a2000000-0000-4000-8000-000000000001', 5, false, '[]', gen_random_uuid());
  raise exception 'FALHOU: o aluno regenerou a propria semana';
exception when insufficient_privilege then
  raise notice '08 OK  o aluno nao gera a semana';
end $$;

select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$ begin
  perform public.replace_week_goals(
    'a2000000-0000-4000-8000-000000000001', 5, false, '[]', gen_random_uuid());
  raise exception 'FALHOU: Davi apagou a semana do aluno da Ana';
exception when insufficient_privilege then
  raise notice '09 OK  professor alheio nao gera a semana';
end $$;

-- ---------- O modo completo apaga a semana inteira ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_removidas integer; v_total integer;
begin
  select goals_removed into v_removidas
    from public.replace_week_goals(
      'a2000000-0000-4000-8000-000000000001', 5, false, '[]',
      'ad000000-0000-4000-8000-000000000004');

  select count(*) into v_total from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5;
  if v_total <> 0 or v_removidas <> 2 then
    raise exception 'FALHOU: o modo completo deixou % metas (removeu %)', v_total, v_removidas;
  end if;
  raise notice '10 OK  o modo completo apaga a semana inteira';
end $$;

-- ---------- O segundo estudo extra do mesmo dia cabe ----------
--
-- O bundle manda 99 nos dois. Antes, o índice de casa recusava o segundo.
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_posicoes integer[];
begin
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title, status, completed_at
  ) values
    ('a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',5,3,'Quarta',99,'extra','Ciências Forenses','Anki','completed',now());
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title, status, completed_at
  ) values
    ('a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',5,3,'Quarta',99,'extra','Ciências Forenses','Lei seca','completed',now());

  select array_agg(day_position order by day_position) into v_posicoes from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5 and weekday = 3;
  if v_posicoes is distinct from array[99, 100] then
    raise exception 'FALHOU: os dois estudos extras ficaram nas posicoes %', v_posicoes;
  end if;
  raise notice '11 OK  o segundo estudo extra do dia vai para a proxima casa livre';
end $$;

-- ---------- As colunas de resultado da meta saíram do grant ----------
do $$ begin
  update public.goals set spent_minutes = 45
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 5;
  raise exception 'FALHOU: o aluno escreveu spent_minutes na meta';
exception when insufficient_privilege then
  raise notice '12 OK  spent_minutes, questions_answered e correct_answers estao fora do grant';
end $$;

reset role;
