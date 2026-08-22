\set ON_ERROR_STOP on
\pset pager off

-- ---------- SEED ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','prof@x.com','{"role":"teacher","name":"Prof Ana"}'),
  ('22222222-2222-2222-2222-222222222222','aluno@x.com','{"role":"student","name":"Aluno Bruno"}');

select '01 trigger criou profiles' item, count(*)::text valor from public.profiles;

insert into public.student_teacher_links (student_id, teacher_id)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111');

insert into public.catalogs (key,name) values ('pcpr26','PCPR 2026');
insert into public.catalog_blocks (id,catalog_key,block_key,number,name,subject_key,subject_name)
values ('cccc0000-0000-0000-0000-000000000001','pcpr26','pcpr26_forenses_01',1,'Bloco 1','forenses','Ciências Forenses');
insert into public.catalog_questions (block_id,question_id,topic,position)
select 'cccc0000-0000-0000-0000-000000000001', 1000+g, 'Tópico '||((g%3)+1), g from generate_series(1,40) g;

insert into public.study_plans (id,student_id,teacher_id,name,start_date,status)
values ('aaaa0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111','Plano Fiscal',current_date,'active');

insert into public.study_plan_blocks (id,study_plan_id,student_id,teacher_id,catalog_block_id,
        subject_name,name,subject_order,block_order)
values ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
        'cccc0000-0000-0000-0000-000000000001','Ciências Forenses','Bloco 1',0,0);

-- ---------- INVARIANTE: um planejamento ativo por aluno ----------
do $$ begin
  insert into public.study_plans (student_id,teacher_id,name,start_date,status)
  values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Outro',current_date,'active');
  raise exception 'FALHOU: aceitou dois study_plans ativos';
exception when unique_violation then
  raise notice '02 OK  dois study_plans ativos bloqueados pelo indice';
end $$;

-- ---------- PROFESSOR: aplicar lote de metas ----------
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select '03 lote aplicado' item, public.apply_study_plan_batch(
  'a0000000-0000-0000-0000-00000000000a'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 1::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Bloco 1 — questões','planned_minutes',60),
    jsonb_build_object('weekday',1,'position',2,'type','theory','title','Teoria','planned_minutes',45)
  ))::text valor;

-- IDEMPOTÊNCIA: reenviar o MESMO lote não pode duplicar a semana.
select '04 lote reenviado (replay)' item, public.apply_study_plan_batch(
  'a0000000-0000-0000-0000-00000000000a'::uuid,
  'aaaa0000-0000-0000-0000-000000000001'::uuid, 1::smallint, 'append'::public.batch_mode,
  jsonb_build_array(
    jsonb_build_object('weekday',1,'position',1,'type','question_block',
      'block_id','bbbb0000-0000-0000-0000-000000000001','title','Bloco 1 — questões','planned_minutes',60),
    jsonb_build_object('weekday',1,'position',2,'type','theory','title','Teoria','planned_minutes',45)
  ))::text valor;

select '05 total de goals (deve ser 2)' item, count(*)::text valor from public.goals where deleted_at is null;

-- ---------- ALUNO: bateria completa ----------
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

create temp table ctx as
select m.id as goal_id from public.goals m where m.type='question_block' limit 1;

select '06 sessao iniciada' item, (public.start_quiz_session(
  'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001',
  (select goal_id from ctx))).status::text valor;

-- Segunda chamada retoma a mesma bateria em vez de criar outra.
select '07 retomada (mesma sessao)' item,
  ((public.start_quiz_session('aaaa0000-0000-0000-0000-000000000001',
    'bbbb0000-0000-0000-0000-000000000001',(select goal_id from ctx))).id
   = (select id from public.quiz_sessions limit 1))::text valor;

create temp table bat as select id from public.quiz_sessions limit 1;

-- Payload congelado: um retry real reenvia exatamente os mesmos bytes.
create temp table payload as
select (select jsonb_agg(jsonb_build_object(
     'question_id',1000+g,'execution_order',g,'round',0,'phase','main',
     'outcome', case when g<=11 then 'correct' else 'incorrect' end,
     'topic','Topico '||((g%3)+1),
     'answered_at','2026-08-22T10:00:00Z'))
   from generate_series(1,15) g) as p;

-- 15 principais: 11 acertos, 4 erros.
select '08 finalizada' item, (public.finish_quiz_session(
  (select id from bat),
  'f0000000-0000-0000-0000-00000000000f'::uuid,
  (select p from payload),
  false)).status::text valor;

-- IDEMPOTÊNCIA: mesmo request_id, mesmo payload → replay, sem duplicar o ledger.
select '09 finalizar replay' item, (public.finish_quiz_session(
  (select id from bat),
  'f0000000-0000-0000-0000-00000000000f'::uuid,
  (select p from payload),
  false)).status::text valor;

select '10 linhas no ledger (deve ser 15)' item, count(*)::text valor from public.quiz_session_questions;

-- request_id reutilizado com payload diferente deve ser REJEITADO.
do $$ begin
  perform public.finish_quiz_session((select id from bat),'f0000000-0000-0000-0000-00000000000f'::uuid,
    '[{"question_id":9999,"execution_order":1,"phase":"main","outcome":"correct"}]'::jsonb,false);
  raise exception 'FALHOU: aceitou request_id reutilizado com outro payload';
exception when unique_violation then
  raise notice '11 OK  request_id com payload diferente rejeitado';
end $$;

select '12 tempo registrado' item, (public.record_quiz_session_time(
  (select id from bat),'70000000-0000-0000-0000-000000000007'::uuid,80)).status::text valor;

select '13 goal concluida' item, status::text valor from public.goals where id=(select goal_id from ctx);

-- ---------- LEDGER IMUTÁVEL ----------
do $$ begin
  update public.quiz_session_questions set outcome='correct' where true;
  raise exception 'FALHOU: ledger aceitou UPDATE';
exception when feature_not_supported then
  raise notice '14 OK  ledger rejeita UPDATE';
end $$;

-- ---------- VIEWS DERIVADAS ----------
select '15 desempenho da sessao' item,
       main_count||' questões / '||main_correct||' acertos' valor
from public.vw_quiz_session_performance;

select '16 desempenho da goal' item,
       questions_answered||' feitas / '||correct_answers||' acertos / '||coalesce(minutes_spent,0)||' min' valor
from public.vw_goal_performance where questions_answered > 0;

select '17 questoes vistas (distintas)' item, count(*)::text valor from public.vw_seen_questions;

select '18 desempenho do bloco' item, score_pct::text||'%' valor from public.vw_block_performance;

-- ---------- ANULAÇÃO PELO PROFESSOR ----------
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select '19 anulada' item, (public.void_quiz_session(
  (select id from bat),'a1000000-0000-0000-0000-00000000000a'::uuid,'teste')).status::text valor;

select '20 goal voltou a pendente' item, status::text valor from public.goals where id=(select goal_id from ctx);
select '21 ledger preservado apos anular' item, count(*)::text valor from public.quiz_session_questions;
select '22 linhas em audit_log' item, count(*)::text valor from public.audit_log;

-- ---------- META COM BATERIA NAO PODE SER APAGADA ----------
do $$ begin
  delete from public.goals where id=(select goal_id from ctx);
  raise exception 'FALHOU: apagou meta com bateria';
exception when foreign_key_violation then
  raise notice '23 OK  goal com sessao protegida por ON DELETE RESTRICT';
end $$;
