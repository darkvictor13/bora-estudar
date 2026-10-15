\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Anular bateria (spec 16)
-- =============================================================================
-- O ledger é append-only por desenho, e a anulação é o único jeito de um
-- resultado errado deixar de contar sem apagar nada. A suíte prova as duas
-- metades: o que a anulação DESFAZ (status, meta, número) e o que ela NÃO PODE
-- tocar (as linhas do ledger), e quem pode pedi-la.
--
-- Roda ANTES da exclusão de conta (22): usa a bateria do Bruno, e a 22 apaga o
-- Bruno. A bateria anulada continua sendo uma linha de `quiz_sessions`, então o
-- que a 22 espera encontrar continua lá.
-- =============================================================================

select app_test.act_as_owner();

-- A meta que a bateria fechou, e duas respostas no ledger.
update public.goals set status = 'completed', completed_at = now()
 where id = 'a5000000-0000-4000-8000-000000000001';

insert into public.quiz_session_questions
  (quiz_session_id, teacher_id, student_id, study_plan_id, block_id, question_id, execution_order, outcome, phase)
select s.id, s.teacher_id, s.student_id, s.study_plan_id, s.block_id, q.id, q.ordem, q.outcome::public.question_outcome, 'main'
  from public.quiz_sessions s,
       (values (920001, 1, 'correct'), (920002, 2, 'incorrect')) as q(id, ordem, outcome)
 where s.id = 'a7000000-0000-4000-8000-000000000001';

-- ---------- Quem não pode ----------
set role authenticated;
select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi, professor de outra turma
do $$ begin
  perform public.void_quiz_session('a7000000-0000-4000-8000-000000000001', 'tentativa alheia');
  raise exception 'FALHOU: um professor alheio anulou a bateria';
exception when insufficient_privilege then
  raise notice '01 OK  professor alheio e recusado com 42501';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno, o próprio aluno
do $$ begin
  perform public.void_quiz_session('a7000000-0000-4000-8000-000000000001', 'eu mesmo');
  raise exception 'FALHOU: o aluno anulou a propria bateria';
exception when insufficient_privilege then
  raise notice '02 OK  o aluno nao anula a propria bateria';
end $$;

reset role;
set role anon;
do $$ begin
  perform public.void_quiz_session('a7000000-0000-4000-8000-000000000001', 'anonimo');
  raise exception 'FALHOU: anonimo executou void_quiz_session';
exception when insufficient_privilege then
  raise notice '03 OK  anon nao tem EXECUTE';
end $$;
reset role;

-- ---------- Anular, como a professora responsável ----------
set role authenticated;
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana

-- Bateria inexistente e bateria alheia dão o MESMO erro: a função não é oráculo.
do $$ begin
  perform public.void_quiz_session('deadbeef-0000-4000-8000-000000000000', 'x');
  raise exception 'FALHOU: anulou uma bateria que nao existe';
exception when insufficient_privilege then
  raise notice '04 OK  bateria inexistente da o mesmo 42501 da alheia';
end $$;

do $$
declare r record;
begin
  select * into r from public.void_quiz_session('a7000000-0000-4000-8000-000000000001', '  resposta no automatico  ');
  if r.new_status <> 'voided' or r.new_reason <> 'resposta no automatico' or r.new_voided_at is null then
    raise exception 'FALHOU: a anulacao devolveu % / % / %', r.new_status, r.new_reason, r.new_voided_at;
  end if;
  raise notice '05 OK  a professora anula, e o motivo e gravado sem as pontas';
end $$;

reset role;
select app_test.act_as_owner();
do $$
declare s public.quiz_sessions; g public.goals; v_ledger integer;
begin
  select * into s from public.quiz_sessions where id = 'a7000000-0000-4000-8000-000000000001';
  if s.status <> 'voided' or s.voided_by <> '11111111-1111-4111-8111-111111111111' or s.voided_at is null then
    raise exception 'FALHOU: a sessao nao ficou anulada por quem anulou: %', row_to_json(s);
  end if;

  -- NADA é apagado: as duas respostas continuam no ledger.
  select count(*) into v_ledger from public.quiz_session_questions
   where quiz_session_id = s.id;
  if v_ledger <> 2 then
    raise exception 'FALHOU: o ledger ficou com % linha(s), esperava as 2 de antes', v_ledger;
  end if;
  raise notice '06 OK  o ledger continua intacto depois de anular';

  select * into g from public.goals where id = 'a5000000-0000-4000-8000-000000000001';
  if g.status <> 'pending' or g.completed_at is not null then
    raise exception 'FALHOU: a meta nao voltou a pendente: % / %', g.status, g.completed_at;
  end if;
  raise notice '07 OK  a meta volta a pending, com completed_at nulo';
end $$;

-- ---------- Idempotência: a segunda chamada devolve sem reescrever nada ----------
select voided_at as voided_before, void_reason as reason_before
  from public.quiz_sessions where id = 'a7000000-0000-4000-8000-000000000001' \gset
set role authenticated;
select app_test.act_as('11111111-1111-4111-8111-111111111111');
select public.void_quiz_session('a7000000-0000-4000-8000-000000000001', 'outro motivo qualquer');
reset role;
select app_test.act_as_owner();
select (voided_at = :'voided_before'::timestamptz and void_reason = :'reason_before') as unchanged
  from public.quiz_sessions where id = 'a7000000-0000-4000-8000-000000000001' \gset
select set_config('t.unchanged', :'unchanged', false) \gset
do $$ begin
  if not current_setting('t.unchanged')::boolean then
    raise exception 'FALHOU: a segunda chamada reescreveu o motivo ou a data da anulacao';
  end if;
  raise notice '08 OK  a retentativa devolve o estado gravado, sem reescrever';
end $$;

-- ---------- A meta e o número ficam livres para uma bateria nova ----------
-- Mesmo `goal_id` e mesmo `session_number` da anulada: os dois índices únicos
-- parciais ignoram `voided`. Se algum voltasse a contá-la, este INSERT falharia.
insert into public.quiz_sessions (
  id, teacher_id, student_id, study_plan_id, goal_id, origin_goal_id, block_id,
  subject_key, catalog_key, execution_order, session_number, origin, status
) values (
  'a7000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'a2000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001','forenses','pcpr26_forenses_01',
  2, 1, 'goal', 'in_progress'
);
do $$ begin raise notice '09 OK  a meta e o numero da bateria anulada ficam livres para a proxima'; end $$;

-- ---------- Só bateria finalizada se anula ----------
set role authenticated;
select app_test.act_as('11111111-1111-4111-8111-111111111111');
do $$ begin
  perform public.void_quiz_session('a7000000-0000-4000-8000-000000000002', 'em andamento');
  raise exception 'FALHOU: anulou uma bateria em andamento';
exception when raise_exception then
  if sqlerrm <> 'Só uma bateria finalizada pode ser anulada.' then raise; end if;
  raise notice '10 OK  bateria em andamento nao se anula (para essa existe cancelar)';
end $$;

reset role;
select app_test.act_as_owner();
do $$ begin
  update public.quiz_sessions set void_reason = repeat('x', 501)
   where id = 'a7000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: a CHECK de void_reason aceitou 501 caracteres';
exception when check_violation then
  raise notice '11 OK  quiz_sessions_void_reason_check recusa mais de 500 caracteres';
end $$;
