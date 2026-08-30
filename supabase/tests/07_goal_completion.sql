\pset pager off
\set ON_ERROR_STOP on
-- Conclusão de meta sem bateria — spec docs/specs/12-conclusao-de-meta.md
--
-- Cobre CA-06 a CA-14. Usa os usuários das suítes 01 (prof1 1111…, aluno1
-- 2222…) e 02 (aluno2 4444…, de outro professor): o run.sh limpa o seed antes
-- de rodar e as suítes compartilham a base, em sequência.
--
-- As metas são criadas numa SEMANA PRÓPRIA (90), pela RPC real do professor.
-- Sem isso a suíte contaria o que as anteriores deixaram na semana 1, e um
-- teste que soma metas por semana passaria ou falharia conforme a ordem.
--
-- O que estas asserções seguram, e que nenhum teste de tela pega: que meta de
-- bateria não fecha por fora do ledger, que o replay não regrava, que o aluno
-- continua sem grant nenhum em `goals`, e que o teto de tempo mora no banco.

-- ---------- PRÉ-CONDIÇÃO: a semana 90, pelo caminho real ----------
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select '00 semana 90 criada' item, public.apply_study_plan_batch(
  'c0000000-0000-4000-8000-00000000009a'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 90::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','theory',
      'title','Teoria da semana 90','planned_minutes',45),
    jsonb_build_object('weekday',2,'position',1,'type','extra_study',
      'title','Estudo extra da semana 90','extra_activity','review','planned_minutes',30),
    jsonb_build_object('weekday',3,'position',1,'type','theory',
      'title','Teoria a reabrir','planned_minutes',45),
    jsonb_build_object('weekday',4,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001',
      'title','Bateria da semana 90','planned_minutes',60)
  ))::text valor;

reset role;

-- Ids da semana 90, capturados SEM RLS.
--
-- As asserções de isolamento precisam passar um id VÁLIDO enquanto autenticadas
-- como o aluno2. Buscar o id de dentro do bloco dele não serve: a RLS filtra o
-- SELECT, `v_goal` volta nulo e a RPC responde "meta nao encontrada" em vez de
-- 42501 — o teste passaria sem provar nada sobre a autorização.
create temp table metas90 as
  select id, title, type::text as type from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=90 and deleted_at is null;
grant select on metas90 to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- PODE: concluir meta de teoria ----------
do $$
declare
  v_goal uuid;
  v_row  public.goals%rowtype;
begin
  select id into v_goal from metas90 where title='Teoria da semana 90';

  select * into v_row from public.complete_goal(
    v_goal, 'c0000000-0000-4000-8000-000000000001'::uuid, 45, '  Li o capítulo 1.  ');

  if v_row.status <> 'completed' then
    raise exception 'FALHOU: status ficou % em vez de completed', v_row.status;
  end if;
  if v_row.completed_at is null then
    raise exception 'FALHOU: completed_at continuou nulo';
  end if;
  if v_row.spent_minutes <> 45 then
    raise exception 'FALHOU: spent_minutes ficou %', v_row.spent_minutes;
  end if;
  -- btrim aplicado na RPC: a observação não guarda os espaços digitados.
  if v_row.student_note <> 'Li o capítulo 1.' then
    raise exception 'FALHOU: student_note ficou "%"', v_row.student_note;
  end if;
  raise notice '01 OK  meta de teoria concluida com tempo e observacao';
end $$;

-- ---------- PODE: concluir meta de estudo extra planejada pelo professor ----------
do $$
declare v_goal uuid; v_row public.goals%rowtype;
begin
  select id into v_goal from metas90 where title='Estudo extra da semana 90';
  select * into v_row from public.complete_goal(
    v_goal, 'c0000000-0000-4000-8000-000000000002'::uuid, 30, null);
  if v_row.status <> 'completed' or v_row.student_note is not null then
    raise exception 'FALHOU: extra_study nao concluiu direito (% / %)', v_row.status, v_row.student_note;
  end if;
  raise notice '02 OK  meta de estudo extra concluida; observacao vazia vira null';
end $$;

-- ---------- CA-07: replay devolve o estado, sem regravar ----------
do $$
declare
  v_goal   uuid;
  v_antes  timestamptz;
  v_row    public.goals%rowtype;
  v_ops    integer;
begin
  select m.id, g.completed_at into v_goal, v_antes
    from metas90 m join public.goals g on g.id = m.id where m.title='Teoria da semana 90';

  perform pg_sleep(0.01);
  select * into v_row from public.complete_goal(
    v_goal, 'c0000000-0000-4000-8000-000000000001'::uuid, 45, '  Li o capítulo 1.  ');

  if v_row.completed_at <> v_antes then
    raise exception 'FALHOU: o replay regravou completed_at';
  end if;
  select count(*) into v_ops from public.operations
   where request_id='c0000000-0000-4000-8000-000000000001';
  if v_ops <> 1 then
    raise exception 'FALHOU: o replay criou uma segunda operacao (%)', v_ops;
  end if;
  raise notice '03 OK  replay devolveu o estado sem regravar';
end $$;

-- ---------- CA-07: mesmo request_id com payload diferente é recusado ----------
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas90 where title='Teoria da semana 90';
  perform public.complete_goal(v_goal, 'c0000000-0000-4000-8000-000000000001'::uuid, 90, null);
  raise exception 'FALHOU: aceitou o mesmo request_id com outro payload';
exception when unique_violation then
  raise notice '04 OK  request_id reusado com outro payload recusado (23505)';
end $$;

-- ---------- CA-10: meta já concluída não conclui de novo ----------
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas90 where title='Teoria da semana 90';
  perform public.complete_goal(v_goal, 'c0000000-0000-4000-8000-000000000003'::uuid, 45, null);
  raise exception 'FALHOU: concluiu uma meta que ja estava concluida';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '05 OK  meta ja concluida recusada: %', sqlerrm;
end $$;

-- ---------- CA-06: meta de bateria NÃO conclui por aqui ----------
-- É o que impede fechar uma meta de questões sem nenhuma linha no ledger.
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas90 where title='Bateria da semana 90';
  perform public.complete_goal(v_goal, 'c0000000-0000-4000-8000-000000000004'::uuid, 60, null);
  raise exception 'FALHOU: concluiu meta de bateria por fora do ledger';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '06 OK  meta de bateria recusada: %', sqlerrm;
end $$;

-- ---------- CA-11: a view enxerga o tempo declarado ----------
do $$
declare
  v_goal      uuid;
  v_minutos   bigint;
  v_questoes  bigint;
begin
  select id into v_goal from metas90 where title='Teoria da semana 90';
  select minutes_spent, questions_answered into v_minutos, v_questoes
    from public.vw_goal_performance where goal_id = v_goal;
  if v_minutos is distinct from 45 then
    raise exception 'FALHOU: minutes_spent da meta sem bateria ficou %', v_minutos;
  end if;
  -- Desempenho continua vindo só do ledger: meta de teoria não tem desempenho.
  if v_questoes <> 0 then
    raise exception 'FALHOU: questions_answered virou % numa meta de teoria', v_questoes;
  end if;
  raise notice '07 OK  vw_goal_performance usa spent_minutes e nao inventa desempenho';
end $$;

-- ---------- CA-05: desfazer ----------
do $$
declare v_goal uuid; v_row public.goals%rowtype;
begin
  select id into v_goal from metas90 where title='Teoria a reabrir';

  perform public.complete_goal(v_goal, 'c0000000-0000-4000-8000-000000000005'::uuid, 60, 'Anotação que sobrevive.');
  select * into v_row from public.reopen_goal(v_goal, 'c0000000-0000-4000-8000-000000000006'::uuid);

  if v_row.status <> 'pending' then
    raise exception 'FALHOU: status ficou % em vez de pending', v_row.status;
  end if;
  if v_row.completed_at is not null or v_row.spent_minutes is not null then
    raise exception 'FALHOU: reabrir nao zerou completed_at/spent_minutes';
  end if;
  -- R-CONC-13: o que o aluno escreveu continua valendo.
  if v_row.student_note is distinct from 'Anotação que sobrevive.' then
    raise exception 'FALHOU: reabrir apagou a observacao';
  end if;
  raise notice '08 OK  reabrir volta a pendente, zera o tempo e preserva a observacao';
end $$;

-- ---------- CA-10: meta pendente não reabre ----------
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas90 where title='Teoria a reabrir';
  perform public.reopen_goal(v_goal, 'c0000000-0000-4000-8000-000000000007'::uuid);
  raise exception 'FALHOU: reabriu uma meta que ja estava pendente';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '09 OK  meta pendente recusada por reopen_goal: %', sqlerrm;
end $$;

-- ---------- CA-08: isolamento entre alunos ----------
-- O aluno 2 é de outro professor e não pode tocar a meta do aluno 1.
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas90 where title='Estudo extra da semana 90';
  perform public.complete_goal(v_goal, 'c0000000-0000-4000-8000-00000000000a'::uuid, 30, null);
  raise exception 'FALHOU: aluno2 concluiu meta do aluno1';
exception when insufficient_privilege then
  raise notice '10 OK  complete_goal de meta alheia negado (42501)';
end $$;

do $$
declare v_goal uuid;
begin
  select id into v_goal from metas90 where title='Estudo extra da semana 90';
  perform public.reopen_goal(v_goal, 'c0000000-0000-4000-8000-00000000000b'::uuid);
  raise exception 'FALHOU: aluno2 reabriu meta do aluno1';
exception when insufficient_privilege then
  raise notice '11 OK  reopen_goal de meta alheia negado (42501)';
end $$;

-- A meta do aluno 1 ficou como estava. A conferência precisa ser feita COM O
-- JWT DELE: a RLS também filtra o SELECT, então contar daqui devolveria zero
-- mesmo que a escrita tivesse funcionado, e a asserção passaria sem provar nada.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare v_status text;
begin
  select status::text into v_status from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=90 and title='Estudo extra da semana 90' and deleted_at is null;
  if v_status is distinct from 'completed' then
    raise exception 'FALHOU: a meta do aluno1 virou % — alguem escreveu nela', v_status;
  end if;
  raise notice '12 OK  meta do aluno1 intacta depois das tentativas do aluno2';
end $$;

-- ---------- CA-12: o aluno continua sem grant em goals ----------
do $$ begin
  update public.goals set status='completed', completed_at=now()
   where student_id=auth.uid() and week_number=90;
  raise exception 'FALHOU: o aluno escreveu direto em goals';
exception when insufficient_privilege then
  raise notice '13 OK  UPDATE direto em goals negado para o aluno';
end $$;

do $$ begin
  delete from public.goals where student_id=auth.uid() and week_number=90;
  raise exception 'FALHOU: DELETE fisico permitido em goals';
exception when insufficient_privilege then
  raise notice '14 OK  DELETE em goals negado';
end $$;

-- ---------- CA-14: o teto de tempo mora no banco ----------
do $$ begin
  perform public.complete_goal(
    (select id from metas90 where title='Teoria a reabrir'),
    'c0000000-0000-4000-8000-00000000000c'::uuid, 241, null);
  raise exception 'FALHOU: aceitou 241 minutos';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '15 OK  241 minutos recusado pela RPC';
end $$;

do $$ begin
  perform public.complete_goal(
    (select id from metas90 where title='Teoria a reabrir'),
    'c0000000-0000-4000-8000-00000000000d'::uuid, 0, null);
  raise exception 'FALHOU: aceitou 0 minutos';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '16 OK  0 minutos recusado pela RPC';
end $$;

reset role;

-- E a constraint segura mesmo por fora da RPC — é o que faz a suíte falhar
-- quando alguém "simplifica" o check em vez de quando o código quebra.
do $$ begin
  update public.goals set spent_minutes = 241
   where week_number=90 and title='Teoria a reabrir' and deleted_at is null;
  raise exception 'FALHOU: a constraint goal_spent_minutes_range nao existe';
exception when check_violation then
  raise notice '17 OK  spent_minutes fora de 1..240 recusado pela constraint';
end $$;

do $$ begin
  update public.goals set student_note = repeat('x', 2001)
   where week_number=90 and title='Teoria a reabrir' and deleted_at is null;
  raise exception 'FALHOU: a constraint goal_student_note_length nao existe';
exception when check_violation then
  raise notice '18 OK  student_note acima de 2000 caracteres recusada pela constraint';
end $$;

-- ---------- CA-13: as duas funções não são chamáveis por PUBLIC ----------
-- O default do Postgres concede EXECUTE a PUBLIC, que não é anon nem
-- authenticated: sem o revoke explícito, qualquer autenticado herda o
-- privilégio pelo grantee vazio. Foi assim que reserve_operation ficou aberta.
do $$
declare v_publico integer;
begin
  select count(*) into v_publico
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('complete_goal','reopen_goal')
     and has_function_privilege('public', p.oid, 'execute');
  if v_publico <> 0 then
    raise exception 'FALHOU: % funcao(oes) desta spec chamavel(is) por PUBLIC', v_publico;
  end if;
  raise notice '19 OK  complete_goal e reopen_goal sem execute para PUBLIC';
end $$;

do $$
declare v_auth integer;
begin
  select count(*) into v_auth
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('complete_goal','reopen_goal')
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_auth <> 2 then
    raise exception 'FALHOU: authenticated tem execute em % de 2 funcoes', v_auth;
  end if;
  raise notice '20 OK  authenticated tem execute nominal nas duas';
end $$;

-- ---------- As duas funções declaram search_path fixo ----------
do $$
declare v_sem integer;
begin
  -- O Postgres guarda a opção como `search_path=""` — com as aspas literais —,
  -- então comparar com `search_path=` por igualdade não casa nunca.
  select count(*) into v_sem
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('complete_goal','reopen_goal')
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
     );
  if v_sem <> 0 then
    raise exception 'FALHOU: % funcao(oes) sem set search_path = ''''', v_sem;
  end if;
  raise notice '21 OK  as duas declaram set search_path = ''''';
end $$;

-- ---------- A view continua com security_invoker ----------
-- create or replace view NÃO herda as opções da view anterior: sem repetir a
-- cláusula, ela voltaria a rodar com privilégio do dono e vazaria dado.
do $$
declare v_ok boolean;
begin
  select coalesce(c.reloptions, '{}') @> array['security_invoker=true'] into v_ok
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname='vw_goal_performance';
  if not v_ok then
    raise exception 'FALHOU: vw_goal_performance perdeu security_invoker';
  end if;
  raise notice '22 OK  vw_goal_performance mantem security_invoker';
end $$;

-- ---------- CA-09: planejamento fora de active recusa ----------
-- Por último, porque arquiva o planejamento que as asserções acima usam.
update public.study_plans set status='paused'
 where id='aaaa0000-0000-0000-0000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

do $$ begin
  perform public.complete_goal(
    (select id from metas90 where title='Teoria a reabrir'),
    'c0000000-0000-4000-8000-00000000000e'::uuid, 45, null);
  raise exception 'FALHOU: concluiu meta de planejamento pausado';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '23 OK  planejamento fora de active recusa complete_goal: %', sqlerrm;
end $$;

do $$ begin
  perform public.reopen_goal(
    (select id from metas90 where title='Teoria da semana 90'),
    'c0000000-0000-4000-8000-00000000000f'::uuid);
  raise exception 'FALHOU: reabriu meta de planejamento pausado';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '24 OK  planejamento fora de active recusa reopen_goal: %', sqlerrm;
end $$;

reset role;
update public.study_plans set status='active'
 where id='aaaa0000-0000-0000-0000-000000000001';
