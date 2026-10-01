\set ON_ERROR_STOP on
begin;
reset role;
select app_test.act_as_owner();

insert into auth.users(id, email, raw_user_meta_data) values
 ('fa000000-0000-4000-8000-000000000001','comparison-teacher@local.test','{"name":"Prof"}'),
 ('fa000000-0000-4000-8000-000000000002','comparison-1@local.test','{"name":"A1"}'),
 ('fa000000-0000-4000-8000-000000000003','comparison-2@local.test','{"name":"A2"}'),
 ('fa000000-0000-4000-8000-000000000004','comparison-3@local.test','{"name":"A3"}'),
 ('fa000000-0000-4000-8000-000000000005','comparison-4@local.test','{"name":"A4"}'),
 ('fa000000-0000-4000-8000-000000000006','comparison-5@local.test','{"name":"A5"}'),
 ('fa000000-0000-4000-8000-000000000007','comparison-6@local.test','{"name":"A6"}');

update public.profiles set role='teacher'
 where id='fa000000-0000-4000-8000-000000000001';
update public.profiles
   set teacher_id='fa000000-0000-4000-8000-000000000001',
       access_status='active', access_expires_at=null
 where id between 'fa000000-0000-4000-8000-000000000002'::uuid
              and 'fa000000-0000-4000-8000-000000000007'::uuid;

insert into public.classes(id,teacher_id,name) values
 ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','Turma comparável');
insert into public.class_students(class_id,student_id,teacher_id)
select 'fb000000-0000-4000-8000-000000000001'::uuid, id,
       'fa000000-0000-4000-8000-000000000001'::uuid
  from public.profiles
 where id between 'fa000000-0000-4000-8000-000000000002'::uuid
              and 'fa000000-0000-4000-8000-000000000007'::uuid;

insert into public.study_plans(id,teacher_id,student_id,class_id,name) values
 ('fc000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000001','Plano'),
 ('fc000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000001','Plano'),
 ('fc000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000004','fb000000-0000-4000-8000-000000000001','Plano'),
 ('fc000000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000005','fb000000-0000-4000-8000-000000000001','Plano'),
 ('fc000000-0000-4000-8000-000000000005','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000006','fb000000-0000-4000-8000-000000000001','Plano'),
 ('fc000000-0000-4000-8000-000000000006','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000007','fb000000-0000-4000-8000-000000000001','Plano');
insert into public.study_plans(id,teacher_id,student_id,class_id,name,status) values
 ('fc000000-0000-4000-8000-000000000099','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000001','Antigo','archived');

insert into public.goals(id,study_plan_id,teacher_id,student_id,weekday,weekday_name,type,subject,title) values
 ('fd000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',1,'Segunda','question_block','Geral','Bloco'),
 ('fd000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000003',1,'Segunda','question_block','Geral','Bloco'),
 ('fd000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000004',1,'Segunda','question_block','Geral','Bloco'),
 ('fd000000-0000-4000-8000-000000000004','fc000000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000005',1,'Segunda','question_block','Geral','Bloco'),
 ('fd000000-0000-4000-8000-000000000005','fc000000-0000-4000-8000-000000000005','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000006',1,'Segunda','question_block','Geral','Bloco'),
 ('fd000000-0000-4000-8000-000000000006','fc000000-0000-4000-8000-000000000006','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000007',1,'Segunda','question_block','Geral','Bloco'),
 ('fd000000-0000-4000-8000-000000000099','fc000000-0000-4000-8000-000000000099','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',1,'Segunda','question_block','Geral','Antigo');

insert into public.goal_entries(id,goal_id,teacher_id,student_id,questions,correct_answers,created_at) values
 ('fe000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',100,80,'2026-06-01'),
 ('fe000000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000003',100,50,'2026-06-01'),
 ('fe000000-0000-4000-8000-000000000003','fd000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000004',100,60,'2026-06-01'),
 ('fe000000-0000-4000-8000-000000000004','fd000000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000005',100,70,'2026-06-01'),
 ('fe000000-0000-4000-8000-000000000005','fd000000-0000-4000-8000-000000000005','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000006',100,90,'2026-06-01'),
 ('fe000000-0000-4000-8000-000000000006','fd000000-0000-4000-8000-000000000006','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000007',100,100,'2026-06-01'),
 ('fe000000-0000-4000-8000-000000000099','fd000000-0000-4000-8000-000000000099','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',100,0,'2026-06-01');

-- Geral tem cinco colegas. Em Informática, só quatro colegas responderam.
reset role;
select app_test.act_as_owner();
-- Posição 2 no dia: a meta de Geral já ocupa a 1, e `goals_one_per_slot_idx`
-- não deixa duas metas no mesmo lugar do mesmo plano.
insert into public.goals(id,study_plan_id,teacher_id,student_id,weekday,weekday_name,day_position,type,subject,title)
select ('fd000000-0000-4000-8000-0000000002' || lpad(n::text,2,'0'))::uuid,
       ('fc000000-0000-4000-8000-00000000000' || n::text)::uuid,
       'fa000000-0000-4000-8000-000000000001'::uuid,
       ('fa000000-0000-4000-8000-00000000000' || (n+1)::text)::uuid,
       1,'Segunda',2,'question_block','Informática','Redes'
  from generate_series(1,5) n;
insert into public.goal_entries(id,goal_id,teacher_id,student_id,questions,correct_answers,created_at)
select ('fe000000-0000-4000-8000-0000000002' || lpad(n::text,2,'0'))::uuid,
       ('fd000000-0000-4000-8000-0000000002' || lpad(n::text,2,'0'))::uuid,
       'fa000000-0000-4000-8000-000000000001'::uuid,
       ('fa000000-0000-4000-8000-00000000000' || (n+1)::text)::uuid,
       10, n * 2, '2026-06-08'
  from generate_series(1,5) n;

set role authenticated;
select app_test.act_as('fa000000-0000-4000-8000-000000000002');
do $$ declare general record; sparse record; begin
 select * into general from public.student_subject_peer_comparison(2026) where subject = 'Geral';
 if general.student_score <> 80 or general.sample_size <> 5 or general.peer_average <> 74 then
   raise exception 'FALHOU: média de Geral incluiu o próprio aluno ou plano arquivado (%)', row_to_json(general);
 end if;
 select * into sparse from public.student_subject_peer_comparison(2026) where subject = 'Informática';
 if sparse.student_score <> 20 or sparse.sample_size <> 4 or sparse.peer_average is not null then
   raise exception 'FALHOU: média com quatro colegas foi exposta (%)', row_to_json(sparse);
 end if;
 if exists (select 1 from public.student_subject_peer_comparison(2025)) then
   raise exception 'FALHOU: dados de outro ano entraram no radar';
 end if;
end $$;

-- Quem saiu da turma não recebe mais a média dos ex-colegas.
reset role;
select app_test.act_as_owner();
delete from public.class_students where student_id='fa000000-0000-4000-8000-000000000002';
set role authenticated;
select app_test.act_as('fa000000-0000-4000-8000-000000000002');
do $$ begin
 if exists (select 1 from public.student_subject_peer_comparison(2026)) then
   raise exception 'FALHOU: aluno fora da turma recebeu a média dos ex-colegas';
 end if;
end $$;

select app_test.act_as('fa000000-0000-4000-8000-000000000001');
do $$ begin
 perform public.student_subject_peer_comparison(2026);
 raise exception 'FALHOU: professor chamou radar individual';
exception when raise_exception then
 if sqlerrm not like 'comparacao disponivel%' then raise; end if;
end $$;
reset role;
set role anon;
do $$ begin
 perform public.student_subject_peer_comparison(2026);
 raise exception 'FALHOU: anônimo chamou comparação';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
