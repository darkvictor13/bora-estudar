\set ON_ERROR_STOP on
-- Cenário próprio: não depende das alterações das outras suítes.
begin;
reset role;
select app_test.act_as_owner();
insert into auth.users(id, email, raw_user_meta_data) values
 ('ee000000-0000-4000-8000-000000000001','exam-teacher@local.test','{"name":"Prof"}'),
 ('ee000000-0000-4000-8000-000000000002','exam-teacher2@local.test','{"name":"Outro professor"}'),
 ('ee000000-0000-4000-8000-000000000003','exam-student@local.test','{"name":"Ana"}'),
 ('ee000000-0000-4000-8000-000000000004','exam-student2@local.test','{"name":"Bruno"}'),
 ('ee000000-0000-4000-8000-000000000005','exam-other-class@local.test','{"name":"Carla"}');
update public.profiles set role='teacher' where id in ('ee000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000002');
update public.profiles set teacher_id='ee000000-0000-4000-8000-000000000001', access_status='active', access_expires_at=null
 where id in ('ee000000-0000-4000-8000-000000000003','ee000000-0000-4000-8000-000000000004','ee000000-0000-4000-8000-000000000005');
insert into public.classes(id,teacher_id,name) values
 ('ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','Presencial A'),
 ('ee100000-0000-4000-8000-000000000002','ee000000-0000-4000-8000-000000000001','Presencial B'),
 ('ee100000-0000-4000-8000-000000000003','ee000000-0000-4000-8000-000000000002','Outro professor');
insert into public.class_students(class_id,student_id,teacher_id) values
 ('ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000003','ee000000-0000-4000-8000-000000000001'),
 ('ee100000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000004','ee000000-0000-4000-8000-000000000001'),
 ('ee100000-0000-4000-8000-000000000002','ee000000-0000-4000-8000-000000000005','ee000000-0000-4000-8000-000000000001');

set role authenticated;
select app_test.act_as('ee000000-0000-4000-8000-000000000001');
insert into public.mock_exams(id,teacher_id,class_id,title,exam_date,max_score) values
 ('ee200000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','ee100000-0000-4000-8000-000000000001','Simulado',current_date,100);
insert into public.mock_exam_results(exam_id,teacher_id,student_id,score) values
 ('ee200000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000003',80),
 ('ee200000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000004',80);
do $$ begin
 if (select student_name from public.mock_exam_results where student_id='ee000000-0000-4000-8000-000000000003') <> 'Ana' then
  raise exception 'FALHOU: nome não veio do perfil';
 end if;
end $$;
do $$ begin
 update public.mock_exam_results set score=101 where student_id='ee000000-0000-4000-8000-000000000003';
 raise exception 'FALHOU: aceitou nota acima do máximo';
exception when raise_exception then
 if sqlerrm not like 'Nota fora%' then raise; end if;
end $$;
do $$ begin
 insert into public.mock_exam_results(exam_id,teacher_id,student_id,score) values
 ('ee200000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000005',70);
 raise exception 'FALHOU: lançou nota de outra turma';
exception when raise_exception then
 if sqlerrm not like 'Aluno não pertence%' then raise; end if;
end $$;
do $$ begin
 update public.mock_exams set max_score=10 where id='ee200000-0000-4000-8000-000000000001';
 raise exception 'FALHOU: alterou o máximo depois do cadastro';
exception when insufficient_privilege then null;
end $$;
do $$ begin
 update public.mock_exam_results set teacher_id='ee000000-0000-4000-8000-000000000002';
 raise exception 'FALHOU: trocou o dono da nota';
exception when insufficient_privilege then null;
end $$;
do $$ begin
 insert into public.mock_exams(id,teacher_id,class_id,title,exam_date,max_score) values
 ('ee200000-0000-4000-8000-000000000002','ee000000-0000-4000-8000-000000000001','ee100000-0000-4000-8000-000000000003','Invasão',current_date,100);
 raise exception 'FALHOU: criou simulado em turma alheia';
exception when foreign_key_violation then null;
end $$;

select app_test.act_as('ee000000-0000-4000-8000-000000000003');
do $$ begin
 if exists(select 1 from public.mock_exams) or exists(select 1 from public.mock_exam_results) then
  raise exception 'FALHOU: aluno lê rascunho';
 end if;
end $$;
select app_test.act_as('ee000000-0000-4000-8000-000000000001');
update public.mock_exams set published=true where id='ee200000-0000-4000-8000-000000000001';
do $$ begin
 update public.mock_exam_results set score=90 where student_id='ee000000-0000-4000-8000-000000000003';
 raise exception 'FALHOU: editou ranking ainda publicado';
exception when raise_exception then
 if sqlerrm not like 'Retire a publicação%' then raise; end if;
end $$;
select app_test.act_as('ee000000-0000-4000-8000-000000000003');
do $$ declare n int; begin
 if (select count(*) from public.mock_exam_results) <> 2 then raise exception 'FALHOU: aluno não vê ranking publicado da turma'; end if;
 update public.mock_exam_results set score=100 where student_id='ee000000-0000-4000-8000-000000000003';
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'FALHOU: aluno alterou nota'; end if;
 update public.mock_exams set published=false;
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'FALHOU: aluno alterou publicação'; end if;
end $$;
select app_test.act_as('ee000000-0000-4000-8000-000000000005');
do $$ begin
 if exists(select 1 from public.mock_exams) or exists(select 1 from public.mock_exam_results) then raise exception 'FALHOU: outra turma acessa ranking'; end if;
end $$;
select app_test.act_as('ee000000-0000-4000-8000-000000000002');
do $$ declare n int; begin
 if exists(select 1 from public.mock_exams) or exists(select 1 from public.mock_exam_results) then raise exception 'FALHOU: outro professor acessa ranking'; end if;
 update public.mock_exams set published=false;
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'FALHOU: outro professor altera ranking'; end if;
end $$;
reset role;
select app_test.act_as_owner();
update public.profiles set access_status='expired' where id='ee000000-0000-4000-8000-000000000003';
set role authenticated;
select app_test.act_as('ee000000-0000-4000-8000-000000000003');
do $$ begin
 if exists(select 1 from public.mock_exams) or exists(select 1 from public.mock_exam_results) then raise exception 'FALHOU: acesso vencido vê ranking'; end if;
end $$;
reset role;
set role anon;
do $$ begin
 perform 1 from public.mock_exams;
 raise exception 'FALHOU: anônimo acessou simulados';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
