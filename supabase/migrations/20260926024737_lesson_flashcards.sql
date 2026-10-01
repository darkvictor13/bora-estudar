-- Cartões nativos pertencem à aula, são escritos pelo professor e só aparecem
-- para alunos quando a aula está publicada.
alter table public.theory_lessons
  add column flashcard_cards jsonb not null default '[]'::jsonb,
  add constraint theory_lessons_flashcard_cards_array_check check (
    jsonb_typeof(flashcard_cards) = 'array' and jsonb_array_length(flashcard_cards) <= 200
  );

-- A repetição espaçada é pessoal e não integra os indicadores de questões.
create table public.flashcard_reviews (
  student_id uuid not null references public.profiles(id) on delete cascade,
  theory_lesson_id uuid not null references public.theory_lessons(id) on delete cascade,
  card_id uuid not null,
  due_at timestamptz not null,
  interval_minutes integer not null check (interval_minutes between 1 and 5256000),
  review_count integer not null check (review_count between 1 and 100000),
  last_grade text not null check (last_grade in ('again', 'hard', 'good', 'easy')),
  updated_at timestamptz not null default now(),
  primary key (student_id, theory_lesson_id, card_id)
);

create index flashcard_reviews_lesson_idx on public.flashcard_reviews(theory_lesson_id);

alter table public.flashcard_reviews enable row level security;
revoke all on public.flashcard_reviews from anon, authenticated;
grant select on public.flashcard_reviews to authenticated;
grant insert (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  on public.flashcard_reviews to authenticated;
grant update (due_at, interval_minutes, review_count, last_grade)
  on public.flashcard_reviews to authenticated;
grant all on public.flashcard_reviews to service_role;

-- A subconsulta herda a RLS de theory_lessons: só aulas publicadas do professor
-- vinculado e com acesso ativo são visíveis para o aluno.
create policy flashcard_reviews_select on public.flashcard_reviews for select to authenticated
using (
  student_id = (select auth.uid()) and exists (
    select 1 from public.theory_lessons lesson
    where lesson.id = flashcard_reviews.theory_lesson_id
      and lesson.active and lesson.published
      and lesson.flashcard_cards @> jsonb_build_array(jsonb_build_object('id', flashcard_reviews.card_id::text))
  )
);

create policy flashcard_reviews_insert on public.flashcard_reviews for insert to authenticated
with check (
  student_id = (select auth.uid()) and exists (
    select 1 from public.theory_lessons lesson
    where lesson.id = flashcard_reviews.theory_lesson_id
      and lesson.active and lesson.published
      and lesson.flashcard_cards @> jsonb_build_array(jsonb_build_object('id', flashcard_reviews.card_id::text))
  )
);

create policy flashcard_reviews_update on public.flashcard_reviews for update to authenticated
using (
  student_id = (select auth.uid()) and exists (
    select 1 from public.theory_lessons lesson
    where lesson.id = flashcard_reviews.theory_lesson_id
      and lesson.active and lesson.published
      and lesson.flashcard_cards @> jsonb_build_array(jsonb_build_object('id', flashcard_reviews.card_id::text))
  )
)
with check (
  student_id = (select auth.uid()) and exists (
    select 1 from public.theory_lessons lesson
    where lesson.id = flashcard_reviews.theory_lesson_id
      and lesson.active and lesson.published
      and lesson.flashcard_cards @> jsonb_build_array(jsonb_build_object('id', flashcard_reviews.card_id::text))
  )
);

create trigger flashcard_reviews_updated_at before update on public.flashcard_reviews
for each row execute function public.set_updated_at();
