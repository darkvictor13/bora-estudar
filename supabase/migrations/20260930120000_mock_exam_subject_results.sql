-- Disciplinas e acertos dos simulados presenciais.
create table public.mock_exam_subjects (
  exam_id uuid not null,
  teacher_id uuid not null,
  subject text not null check (char_length(btrim(subject)) between 1 and 100),
  question_count integer not null check (question_count between 1 and 1000),
  primary key (exam_id, subject),
  unique (exam_id, teacher_id, subject),
  foreign key (exam_id, teacher_id) references public.mock_exams(id, teacher_id) on delete cascade
);
create table public.mock_exam_subject_results (
  exam_id uuid not null,
  teacher_id uuid not null,
  student_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null,
  correct_answers integer not null check (correct_answers >= 0),
  primary key (exam_id, student_id, subject),
  foreign key (exam_id, teacher_id, subject)
    references public.mock_exam_subjects(exam_id, teacher_id, subject) on delete cascade
);
create index mock_exam_subject_results_student_idx on public.mock_exam_subject_results(student_id);

alter table public.mock_exam_subjects enable row level security;
alter table public.mock_exam_subject_results enable row level security;
revoke all on public.mock_exam_subjects, public.mock_exam_subject_results from anon, authenticated;
grant select on public.mock_exam_subjects, public.mock_exam_subject_results to authenticated;
grant insert (exam_id, teacher_id, subject, question_count) on public.mock_exam_subjects to authenticated;
grant update (question_count) on public.mock_exam_subjects to authenticated;
grant delete on public.mock_exam_subjects to authenticated;
grant insert (exam_id, teacher_id, student_id, subject, correct_answers)
  on public.mock_exam_subject_results to authenticated;
grant update (correct_answers) on public.mock_exam_subject_results to authenticated;
grant delete on public.mock_exam_subject_results to authenticated;
grant all on public.mock_exam_subjects, public.mock_exam_subject_results to service_role;

create policy mock_exam_subjects_select on public.mock_exam_subjects for select to authenticated
using (exists (select 1 from public.mock_exams e where e.id = mock_exam_subjects.exam_id));
create policy mock_exam_subjects_insert on public.mock_exam_subjects for insert to authenticated
with check (teacher_id = (select auth.uid()) and public.is_teacher()
  and exists (select 1 from public.mock_exams e where e.id = exam_id and e.teacher_id = teacher_id and not e.published));
create policy mock_exam_subjects_update on public.mock_exam_subjects for update to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher())
with check (teacher_id = (select auth.uid()) and public.is_teacher());
create policy mock_exam_subjects_delete on public.mock_exam_subjects for delete to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher());

create policy mock_exam_subject_results_select on public.mock_exam_subject_results for select to authenticated
using (exists (select 1 from public.mock_exams e where e.id = mock_exam_subject_results.exam_id));
create policy mock_exam_subject_results_insert on public.mock_exam_subject_results for insert to authenticated
with check (teacher_id = (select auth.uid()) and public.is_teacher() and public.is_teacher_of(student_id));
create policy mock_exam_subject_results_update on public.mock_exam_subject_results for update to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher())
with check (teacher_id = (select auth.uid()) and public.is_teacher() and public.is_teacher_of(student_id));
create policy mock_exam_subject_results_delete on public.mock_exam_subject_results for delete to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher());

create function app_private.validate_mock_exam_subject() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_exam public.mock_exams; v_exam_id uuid;
begin
  if tg_op = 'DELETE' then v_exam_id := old.exam_id; else v_exam_id := new.exam_id; end if;
  select * into v_exam from public.mock_exams where id = v_exam_id for share;
  if v_exam.id is null then raise exception 'Simulado não encontrado.'; end if;
  if v_exam.published then raise exception 'Retire a publicação antes de alterar as matérias.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.teacher_id <> v_exam.teacher_id then raise exception 'Professor diferente do simulado.'; end if;
  new.subject := btrim(new.subject);
  if exists (select 1 from public.mock_exam_subject_results r where r.exam_id = new.exam_id
    and r.subject = new.subject and r.correct_answers > new.question_count) then
    raise exception 'Há acertos lançados acima do novo total de questões.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_mock_exam_subject() from public, anon, authenticated;
create trigger validate_mock_exam_subject before insert or update or delete on public.mock_exam_subjects
for each row execute function app_private.validate_mock_exam_subject();

create function app_private.validate_mock_exam_subject_result() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_exam public.mock_exams; v_questions integer; v_exam_id uuid;
begin
  if tg_op = 'DELETE' then v_exam_id := old.exam_id; else v_exam_id := new.exam_id; end if;
  select * into v_exam from public.mock_exams where id = v_exam_id for share;
  if v_exam.id is null then raise exception 'Simulado não encontrado.'; end if;
  if v_exam.published then raise exception 'Retire a publicação antes de alterar os acertos.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.teacher_id <> v_exam.teacher_id then raise exception 'Professor diferente do simulado.'; end if;
  select s.question_count into v_questions from public.mock_exam_subjects s
   where s.exam_id = new.exam_id and s.teacher_id = new.teacher_id and s.subject = new.subject;
  if v_questions is null or new.correct_answers > v_questions then
    raise exception 'Acertos fora do total de questões da matéria.';
  end if;
  if not exists (select 1 from public.class_students cs join public.profiles p on p.id = cs.student_id
     where cs.class_id = v_exam.class_id and cs.teacher_id = v_exam.teacher_id
       and cs.student_id = new.student_id and p.teacher_id = v_exam.teacher_id and p.role = 'student') then
    raise exception 'Aluno não pertence à turma do simulado.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_mock_exam_subject_result() from public, anon, authenticated;
create trigger validate_mock_exam_subject_result before insert or update or delete on public.mock_exam_subject_results
for each row execute function app_private.validate_mock_exam_subject_result();
