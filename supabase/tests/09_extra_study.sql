\pset pager off
\set ON_ERROR_STOP on
-- Estudo extra avulso — spec docs/specs/19-estudo-extra-avulso.md
--
-- Cobre CA-07 a CA-12. Usa os usuários das suítes 01 e 02 e cria a própria
-- semana (91) pela RPC real do professor.
--
-- O que estas asserções seguram: que o tipo é enum e não texto, que o aluno
-- continua sem insert em goals, que o replay não cria a segunda linha, que
-- apply_study_plan_batch continua aceitando o texto do payload, e que a meta
-- planejada pelo professor não é removível pelo aluno.

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select '00 semana 91 criada' item, public.apply_study_plan_batch(
  'c0000000-0000-4000-8000-00000000009b'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 91::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','theory',
      'title','Teoria da semana 91','planned_minutes',45),
    -- CA-11: o payload manda TEXTO e o banco grava enum.
    jsonb_build_object('weekday',2,'position',1,'type','extra_study',
      'title','Extra do professor','extra_activity','review','planned_minutes',30)
  ))::text valor;

do $$
declare v_tipo text;
begin
  select extra_activity::text into v_tipo from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=91 and title='Extra do professor';
  if v_tipo is distinct from 'review' then
    raise exception 'FALHOU: apply_study_plan_batch gravou % em vez de review', v_tipo;
  end if;
  raise notice '01 OK  apply_study_plan_batch converte o texto do payload para o enum';
end $$;

reset role;
-- Ids capturados SEM RLS, pelo mesmo motivo da suíte 07: as asserções de
-- isolamento precisam de um id válido enquanto autenticadas como outro aluno.
create temp table metas91 as
  select id, title, created_by from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001' and week_number=91;
grant select on metas91 to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- PODE: registrar ----------
do $$
declare v_goal public.goals%rowtype;
begin
  select * into v_goal from public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000001'::uuid,
    91::smallint, 3::smallint, 'flashcards'::public.extra_activity_kind, 45, '  Baralho de penal  ');

  if v_goal.status <> 'completed' or v_goal.completed_at is null then
    raise exception 'FALHOU: o registro nao nasceu concluido';
  end if;
  if v_goal.type <> 'extra_study' then
    raise exception 'FALHOU: type ficou %', v_goal.type;
  end if;
  if v_goal.extra_activity::text <> 'flashcards' then
    raise exception 'FALHOU: extra_activity ficou %', v_goal.extra_activity;
  end if;
  if v_goal.title <> 'Estudo extra — Anki' then
    raise exception 'FALHOU: o titulo ficou "%"', v_goal.title;
  end if;
  if v_goal.spent_minutes <> 45 or v_goal.student_note <> 'Baralho de penal' then
    raise exception 'FALHOU: tempo ou observacao errados';
  end if;
  if v_goal.block_id is not null or v_goal.batch_id is not null then
    raise exception 'FALHOU: o registro nasceu preso a bloco ou lote';
  end if;
  if v_goal.created_by <> auth.uid() then
    raise exception 'FALHOU: created_by nao e o aluno';
  end if;
  raise notice '02 OK  registro criado concluido, com titulo derivado do tipo';
end $$;

-- ---------- CA-08: replay não cria a segunda ----------
do $$
declare v_linhas integer;
begin
  perform public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000001'::uuid,
    91::smallint, 3::smallint, 'flashcards'::public.extra_activity_kind, 45, '  Baralho de penal  ');
  select count(*) into v_linhas from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=91 and extra_activity='flashcards' and deleted_at is null;
  if v_linhas <> 1 then
    raise exception 'FALHOU: o replay criou % linhas', v_linhas;
  end if;
  raise notice '03 OK  replay devolveu o registro sem criar outro';
end $$;

-- ---------- CA-09: bordas ----------
do $$ begin
  perform public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000002'::uuid,
    99::smallint, 3::smallint, 'review'::public.extra_activity_kind, 30, null);
  raise exception 'FALHOU: registrou em semana que nao existe';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '04 OK  semana inexistente recusada: %', sqlerrm;
end $$;

do $$ begin
  perform public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000003'::uuid,
    91::smallint, 3::smallint, 'review'::public.extra_activity_kind, 241, null);
  raise exception 'FALHOU: aceitou 241 minutos';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '05 OK  241 minutos recusado';
end $$;

do $$ begin
  perform public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000004'::uuid,
    91::smallint, 9::smallint, 'review'::public.extra_activity_kind, 30, null);
  raise exception 'FALHOU: aceitou dia 9';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '06 OK  dia fora de 0..6 recusado';
end $$;

-- Aluno de outro professor não registra no planejamento alheio.
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$ begin
  perform public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000005'::uuid,
    91::smallint, 3::smallint, 'review'::public.extra_activity_kind, 30, null);
  raise exception 'FALHOU: registrou em planejamento alheio';
exception when insufficient_privilege then
  raise notice '07 OK  planejamento alheio negado (42501)';
end $$;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- CA-07: valor fora do enum ----------
do $$ begin
  perform public.record_extra_study(
    'aaaa0000-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-4000-8000-000000000006'::uuid,
    91::smallint, 3::smallint, 'lei_seca'::public.extra_activity_kind, 30, null);
  raise exception 'FALHOU: aceitou valor fora do enum';
exception when invalid_text_representation then
  raise notice '08 OK  valor fora dos sete recusado pelo enum';
end $$;

reset role;
do $$ begin
  update public.goals set extra_activity = 'revisao'
   where week_number=91 and type='extra_study';
  raise exception 'FALHOU: o portugues antigo ainda e aceito';
exception when invalid_text_representation then
  raise notice '09 OK  o valor antigo em portugues nao existe mais';
end $$;

-- Os sete valores, e só eles.
do $$
declare v_valores text;
begin
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_valores
    from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'extra_activity_kind';
  if v_valores <> 'statute,flashcards,mock_exam,review,extra_questions,video_lesson,other' then
    raise exception 'FALHOU: o enum tem % ', v_valores;
  end if;
  raise notice '10 OK  o enum tem exatamente os sete valores da v96';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- Remover ----------
do $$
declare v_goal uuid; v_row public.goals%rowtype;
begin
  select id into v_goal from public.goals
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001'
     and week_number=91 and extra_activity='flashcards' and deleted_at is null;
  select * into v_row from public.delete_extra_study(
    v_goal, 'e0000000-0000-4000-8000-000000000007'::uuid);
  if v_row.deleted_at is null then
    raise exception 'FALHOU: deleted_at continuou nulo';
  end if;
  raise notice '11 OK  remover marca deleted_at';
end $$;

-- ---------- CA: meta do professor não é removível pelo aluno ----------
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas91 where title='Extra do professor';
  perform public.delete_extra_study(v_goal, 'e0000000-0000-4000-8000-000000000008'::uuid);
  raise exception 'FALHOU: o aluno removeu meta planejada pelo professor';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '12 OK  meta do professor recusada: %', sqlerrm;
end $$;

-- Meta que não é extra_study também não.
do $$
declare v_goal uuid;
begin
  select id into v_goal from metas91 where title='Teoria da semana 91';
  perform public.delete_extra_study(v_goal, 'e0000000-0000-4000-8000-000000000009'::uuid);
  raise exception 'FALHOU: removeu meta de teoria';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '13 OK  meta que nao e extra_study recusada: %', sqlerrm;
end $$;

-- ---------- CA-10: o aluno continua sem insert em goals ----------
do $$ begin
  insert into public.goals (study_plan_id, student_id, teacher_id, week_number, weekday,
                            day_order, type, title, extra_activity, created_by)
  values ('aaaa0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', 91, 4, 99, 'extra_study',
          'Na marra', 'other', '22222222-2222-2222-2222-222222222222');
  raise exception 'FALHOU: o aluno inseriu direto em goals';
exception when insufficient_privilege then
  raise notice '14 OK  INSERT direto em goals negado para o aluno';
end $$;

reset role;

-- ---------- CA-12: privilégios ----------
do $$
declare v_publico integer;
begin
  select count(*) into v_publico
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname in ('record_extra_study','delete_extra_study')
     and has_function_privilege('public', p.oid, 'execute');
  if v_publico <> 0 then
    raise exception 'FALHOU: % funcao(oes) chamavel(is) por PUBLIC', v_publico;
  end if;
  raise notice '15 OK  as duas sem execute para PUBLIC';
end $$;

do $$
declare v_sem integer;
begin
  select count(*) into v_sem
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname in ('record_extra_study','delete_extra_study')
     and not exists (
       select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%'
     );
  if v_sem <> 0 then
    raise exception 'FALHOU: % funcao(oes) sem set search_path = ''''', v_sem;
  end if;
  raise notice '16 OK  as duas declaram set search_path = ''''';
end $$;

-- A coluna é enum, não texto.
do $$
declare v_tipo text;
begin
  select udt_name into v_tipo from information_schema.columns
   where table_schema='public' and table_name='goals' and column_name='extra_activity';
  if v_tipo is distinct from 'extra_activity_kind' then
    raise exception 'FALHOU: extra_activity voltou a ser %', v_tipo;
  end if;
  raise notice '17 OK  goals.extra_activity e enum, nao texto';
end $$;
