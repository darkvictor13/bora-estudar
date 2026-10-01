\set ON_ERROR_STOP on
begin;
reset role;
select app_test.act_as_owner();
insert into auth.users(id, email, raw_user_meta_data) values
 ('ef000000-0000-4000-8000-000000000001','subject-teacher@local.test','{"name":"Professor"}'),
 ('ef000000-0000-4000-8000-000000000002','subject-student@local.test','{"name":"Ana"}'),
 ('ef000000-0000-4000-8000-000000000003','subject-outsider@local.test','{"name":"Bruno"}');
update public.profiles set role='teacher' where id='ef000000-0000-4000-8000-000000000001';
update public.profiles set teacher_id='ef000000-0000-4000-8000-000000000001', access_status='active', access_expires_at=null
 where id in ('ef000000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000003');
insert into public.classes(id,teacher_id,name) values
 ('ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','Turma A'),
 ('ef100000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000001','Turma B');
insert into public.class_students(class_id,student_id,teacher_id) values
 ('ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000001'),
 ('ef100000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000003','ef000000-0000-4000-8000-000000000001');
set role authenticated;
select app_test.act_as('ef000000-0000-4000-8000-000000000001');
insert into public.mock_exams(id,teacher_id,class_id,title,exam_date,max_score) values
 ('ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001','Prova',current_date,100);
insert into public.mock_exam_results(exam_id,teacher_id,student_id,score) values
 ('ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002',75);
insert into public.mock_exam_subjects(exam_id,teacher_id,subject,question_count) values
 ('ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','Português',10);
insert into public.mock_exam_subject_results(exam_id,teacher_id,student_id,subject,correct_answers) values
 ('ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','Português',7);
do $$ begin
 insert into public.mock_exam_subject_results(exam_id,teacher_id,student_id,subject,correct_answers) values
 ('ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000003','Português',6);
 raise exception 'FALHOU: aceitou aluno de outra turma';
exception when raise_exception then
 if sqlerrm not like 'Aluno não pertence%' then raise; end if;
end $$;
do $$ begin
 update public.mock_exam_subject_results set correct_answers=11;
 raise exception 'FALHOU: aceitou acertos acima do total';
exception when raise_exception then
 if sqlerrm not like 'Acertos fora%' then raise; end if;
end $$;
do $$ begin
 update public.mock_exam_subjects set question_count=6;
 raise exception 'FALHOU: aceitou reduzir abaixo dos acertos';
exception when raise_exception then
 if sqlerrm not like 'Há acertos%' then raise; end if;
end $$;
do $$ begin
 insert into public.mock_exam_subjects(exam_id,teacher_id,subject,question_count) values
 ('ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','português',10);
 raise exception 'FALHOU: aceitou a mesma matéria com outra caixa';
exception when unique_violation then null;
end $$;
-- Em rascunho o gatilho deixa apagar; quem segura os acertos é a FK.
do $$ begin
 delete from public.mock_exam_subjects where subject='Português';
 raise exception 'FALHOU: apagar a matéria levou os acertos lançados';
exception when foreign_key_violation then null;
end $$;
select app_test.act_as('ef000000-0000-4000-8000-000000000002');
do $$ begin
 if exists(select 1 from public.mock_exam_subjects) or exists(select 1 from public.mock_exam_subject_results) then
  raise exception 'FALHOU: aluno vê matéria em rascunho'; end if;
end $$;
select app_test.act_as('ef000000-0000-4000-8000-000000000001');
update public.mock_exams set published=true where id='ef200000-0000-4000-8000-000000000001';
do $$ begin
 delete from public.mock_exam_subject_results;
 raise exception 'FALHOU: apagou acertos publicados';
exception when raise_exception then
 if sqlerrm not like 'Retire a publicação%' then raise; end if;
end $$;
do $$ begin
 delete from public.mock_exam_subjects;
 raise exception 'FALHOU: apagou matéria publicada';
exception when raise_exception then
 if sqlerrm not like 'Retire a publicação%' then raise; end if;
end $$;
select app_test.act_as('ef000000-0000-4000-8000-000000000002');
do $$ begin
 if (select count(*) from public.mock_exam_subjects) <> 1 or
    (select count(*) from public.mock_exam_subject_results) <> 1 then
  raise exception 'FALHOU: aluno não vê análise publicada'; end if;
end $$;
do $$ begin
 if (select count(*) from public.mock_exam_scoreboard('ef200000-0000-4000-8000-000000000001')
      where subject = 'Português' and is_self and score = 7) <> 1 then
  raise exception 'FALHOU: o placar não trouxe os acertos do próprio aluno'; end if;
end $$;
select app_test.act_as('ef000000-0000-4000-8000-000000000003');
do $$ begin
 if exists(select 1 from public.mock_exam_subject_results)
    or exists(select 1 from public.mock_exam_scoreboard('ef200000-0000-4000-8000-000000000001')) then
  raise exception 'FALHOU: aluno de outra turma vê os acertos'; end if;
end $$;
rollback;
