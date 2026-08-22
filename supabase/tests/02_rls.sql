\pset pager off
-- Segundo aluno, com professor diferente, para provar o isolamento.
insert into auth.users (id,email,raw_user_meta_data) values
 ('33333333-3333-3333-3333-333333333333','prof2@x.com','{"role":"teacher","name":"Prof Carla"}'),
 ('44444444-4444-4444-4444-444444444444','aluno2@x.com','{"role":"student","name":"Aluno Dora"}');
insert into public.student_teacher_links (student_id,teacher_id)
 values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333');
insert into public.study_plans (student_id,teacher_id,name,start_date,status)
 values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','Plano Dora',current_date,'active');

-- Sem RLS (superuser) enxerga tudo: 2 planejamentos, 2 metas.
select 'A superuser ve study_plans' item, count(*)::text valor from public.study_plans;

set role authenticated;

-- ALUNO 1
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'B aluno1 ve study_plans (1)'  item, count(*)::text valor from public.study_plans;
select 'C aluno1 ve goals (2)'          item, count(*)::text valor from public.goals;
select 'D aluno1 ve sessoes (1)'       item, count(*)::text valor from public.quiz_sessions;
select 'E aluno1 ve ledger (15)'        item, count(*)::text valor from public.quiz_session_questions;
select 'F aluno1 ve profiles (1: so ele)' item, count(*)::text valor from public.profiles;

-- ALUNO 2: não pode ver NADA do aluno 1.
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
select 'G aluno2 ve study_plans (1)'  item, count(*)::text valor from public.study_plans;
select 'H aluno2 ve goals (0)'          item, count(*)::text valor from public.goals;
select 'I aluno2 ve sessoes (0)'       item, count(*)::text valor from public.quiz_sessions;
select 'J aluno2 ve ledger (0)'         item, count(*)::text valor from public.quiz_session_questions;
select 'K aluno2 ve vw_seen_questions (0)' item, count(*)::text valor from public.vw_seen_questions;
select 'L aluno2 ve vw_goal_performance (0)' item, count(*)::text valor from public.vw_goal_performance;

-- PROFESSOR 1 vê o próprio aluno, não o do outro professor.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'M prof1 ve study_plans (1)'  item, count(*)::text valor from public.study_plans;
select 'N prof1 ve goals (2)'          item, count(*)::text valor from public.goals;
select 'O prof1 ve profiles (2: ele+aluno)' item, count(*)::text valor from public.profiles;

-- Escrita direta nas tabelas transacionais deve ser negada mesmo para o dono.
do $$ begin
  insert into public.goals (study_plan_id,student_id,teacher_id,week_number,weekday,day_order,type,title,created_by)
  values ((select id from public.study_plans limit 1),'22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111',1,1,99,'theory','hack','11111111-1111-1111-1111-111111111111');
  raise exception 'FALHOU: INSERT direto em goals foi aceito';
exception when insufficient_privilege then
  raise notice 'P OK  INSERT direto em goals negado (so via RPC)';
end $$;

do $$ begin
  update public.quiz_sessions set duration_minutes = 9999;
  raise exception 'FALHOU: UPDATE direto em quiz_sessions foi aceito';
exception when insufficient_privilege then
  raise notice 'Q OK  UPDATE direto em quiz_sessions negado';
end $$;

reset role;

-- Invariantes restantes.
do $$
declare v_plan uuid; v_goal uuid;
begin
  select id into v_plan from public.study_plans where student_id='22222222-2222-2222-2222-222222222222';
  select id into v_goal from public.goals where type='theory' limit 1;
  begin
    insert into public.goals (study_plan_id,student_id,teacher_id,week_number,weekday,day_order,type,title,created_by)
    values (v_plan,'22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
            1,1,1,'theory','colisao','11111111-1111-1111-1111-111111111111');
    raise exception 'FALHOU: aceitou day_order duplicada';
  exception when unique_violation then
    raise notice 'R OK  day_order duplicada bloqueada';
  end;
end $$;

do $$ begin
  insert into public.quiz_session_questions (quiz_session_id,question_id,execution_order,round,phase,outcome,answered_at)
  values ((select id from public.quiz_sessions limit 1),1001,99,0,'main','correct',now());
  raise exception 'FALHOU: aceitou questao duplicada no ledger';
exception when unique_violation then
  raise notice 'S OK  (sessao,questao,rodada) duplicada bloqueada no ledger';
end $$;
