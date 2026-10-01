-- Simulados aplicados presencialmente, com notas lançadas pelo professor.
create table public.mock_exams (
  id uuid primary key,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  class_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  exam_date date not null,
  max_score numeric(10,2) not null check (max_score > 0 and max_score <= 100000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (class_id, teacher_id) references public.classes(id, teacher_id) on delete restrict,
  unique (id, teacher_id)
);

create table public.mock_exam_results (
  exam_id uuid not null,
  teacher_id uuid not null,
  student_id uuid not null references public.profiles(id) on delete restrict,
  student_name text not null default '',
  score numeric(10,2) check (score >= 0 and score <= 100000),
  updated_at timestamptz not null default now(),
  primary key (exam_id, student_id),
  foreign key (exam_id, teacher_id) references public.mock_exams(id, teacher_id) on delete restrict
);

create index mock_exams_teacher_date_idx on public.mock_exams(teacher_id, exam_date desc);
create index mock_exams_class_idx on public.mock_exams(class_id, teacher_id);
create index mock_exam_results_student_idx on public.mock_exam_results(student_id);
create index mock_exam_results_teacher_idx on public.mock_exam_results(teacher_id);

alter table public.mock_exams enable row level security;
alter table public.mock_exam_results enable row level security;
revoke all on public.mock_exams, public.mock_exam_results from anon, authenticated;
grant select on public.mock_exams, public.mock_exam_results to authenticated;
grant insert (id, teacher_id, class_id, title, exam_date, max_score) on public.mock_exams to authenticated;
grant update (title, exam_date, published) on public.mock_exams to authenticated;
grant insert (exam_id, teacher_id, student_id, score) on public.mock_exam_results to authenticated;
grant update (score) on public.mock_exam_results to authenticated;
grant all on public.mock_exams, public.mock_exam_results to service_role;

create policy mock_exams_select on public.mock_exams for select to authenticated
using (
  (teacher_id = (select auth.uid()) and public.is_teacher())
  or (published and public.has_active_access() and exists (
    select 1 from public.class_students cs join public.profiles p on p.id = cs.student_id
    where cs.class_id = mock_exams.class_id and cs.teacher_id = mock_exams.teacher_id
      and cs.student_id = (select auth.uid()) and p.teacher_id = mock_exams.teacher_id
      and p.role = 'student'
  ))
);
create policy mock_exams_insert on public.mock_exams for insert to authenticated
with check (teacher_id = (select auth.uid()) and public.is_teacher());
create policy mock_exams_update on public.mock_exams for update to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher())
with check (teacher_id = (select auth.uid()) and public.is_teacher());

-- A consulta ao simulado herda a RLS: só o professor ou a turma com resultado publicado.
create policy mock_exam_results_select on public.mock_exam_results for select to authenticated
using (exists (select 1 from public.mock_exams e where e.id = mock_exam_results.exam_id));
create policy mock_exam_results_insert on public.mock_exam_results for insert to authenticated
with check (teacher_id = (select auth.uid()) and public.is_teacher() and public.is_teacher_of(student_id));
create policy mock_exam_results_update on public.mock_exam_results for update to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher())
with check (teacher_id = (select auth.uid()) and public.is_teacher() and public.is_teacher_of(student_id));

create function app_private.validate_mock_exam_result() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_exam public.mock_exams; v_name text;
begin
  select * into v_exam from public.mock_exams where id = new.exam_id for share;
  if v_exam.id is null then raise exception 'Simulado não encontrado.'; end if;
  if v_exam.published then
    raise exception 'Retire a publicação antes de alterar as notas.';
  end if;
  if new.score is not null and (new.score < 0 or new.score > v_exam.max_score) then
    raise exception 'Nota fora da pontuação máxima do simulado.';
  end if;
  select coalesce(nullif(btrim(p.name), ''), 'Aluno') into v_name
    from public.class_students cs join public.profiles p on p.id = cs.student_id
   where cs.class_id = v_exam.class_id and cs.teacher_id = v_exam.teacher_id
     and cs.student_id = new.student_id and p.teacher_id = v_exam.teacher_id and p.role = 'student';
  if v_name is null then raise exception 'Aluno não pertence à turma do simulado.'; end if;
  new.student_name := v_name;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function app_private.validate_mock_exam_result() from public, anon, authenticated;
create trigger validate_mock_exam_result before insert or update on public.mock_exam_results
for each row execute function app_private.validate_mock_exam_result();

create trigger mock_exams_updated_at before update on public.mock_exams
for each row execute function public.set_updated_at();
