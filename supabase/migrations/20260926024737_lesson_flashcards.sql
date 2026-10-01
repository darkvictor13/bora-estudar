-- Cartões nativos pertencem à aula, são escritos pelo professor e só aparecem
-- para alunos quando a aula está publicada.
--
-- TABELA, e não um array `jsonb` em `theory_lessons`. Com o array, a revisão do
-- aluno apontava para um id que morava dentro de um texto: o banco aceitava
-- dois cartões com o mesmo id, e regravar o array com ids novos deixava todo o
-- histórico de revisão órfão e invisível, sem erro nenhum.
--
-- Remover cartão é MARCA (`deleted`), como em `study_plan_notebooks`: revisão
-- antiga aponta para ele, e a FK com RESTRICT não deixa o cartão sumir por
-- baixo dela.
alter table public.theory_lessons
  add constraint theory_lessons_id_teacher_key unique (id, teacher_id);

create table public.theory_lesson_flashcards (
  id uuid primary key,
  theory_lesson_id uuid not null,
  teacher_id uuid not null,
  position integer not null check (position between 1 and 200),
  topic text not null default '' check (char_length(topic) <= 160),
  front text not null check (char_length(btrim(front)) between 1 and 2000),
  back text not null check (char_length(btrim(back)) between 1 and 4000),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Alvo da FK composta de flashcard_reviews.
  unique (id, theory_lesson_id),
  -- Composta: o cartão é da aula E do professor dela. Com `teacher_id` livre, um
  -- professor penduraria cartão na aula de outro.
  foreign key (theory_lesson_id, teacher_id)
    references public.theory_lessons (id, teacher_id) on delete cascade
);

create index theory_lesson_flashcards_lesson_idx
  on public.theory_lesson_flashcards (theory_lesson_id, position);

alter table public.theory_lesson_flashcards enable row level security;
revoke all on public.theory_lesson_flashcards from anon, authenticated;
grant select on public.theory_lesson_flashcards to authenticated;
grant insert (id, theory_lesson_id, teacher_id, position, topic, front, back)
  on public.theory_lesson_flashcards to authenticated;
grant update (position, topic, front, back, deleted)
  on public.theory_lesson_flashcards to authenticated;
grant all on public.theory_lesson_flashcards to service_role;

-- O aluno lê o cartão vivo de uma aula que ele já enxerga: a subconsulta herda
-- a RLS de `theory_lessons` (publicada, do professor dele).
create policy theory_lesson_flashcards_select on public.theory_lesson_flashcards
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (not deleted and exists (
      select 1 from public.theory_lessons lesson
       where lesson.id = theory_lesson_flashcards.theory_lesson_id
    ))
  );
create policy theory_lesson_flashcards_insert on public.theory_lesson_flashcards
  for insert to authenticated
  with check (teacher_id = (select auth.uid()) and public.is_teacher());
create policy theory_lesson_flashcards_update on public.theory_lesson_flashcards
  for update to authenticated
  using (teacher_id = (select auth.uid()) and public.is_teacher())
  with check (teacher_id = (select auth.uid()) and public.is_teacher());

create trigger theory_lesson_flashcards_updated_at before update on public.theory_lesson_flashcards
for each row execute function public.set_updated_at();

-- A repetição espaçada é pessoal e não integra os indicadores de questões.
--
-- RESTRICT a partir do cartão: com a remoção por marca, o cartão nunca é
-- apagado pela tela, e apagar a AULA (cascata para os cartões) para enquanto
-- algum aluno tiver histórico nela. Antes, o CASCADE levava o histórico junto.
create table public.flashcard_reviews (
  student_id uuid not null references public.profiles(id) on delete cascade,
  theory_lesson_id uuid not null,
  card_id uuid not null,
  due_at timestamptz not null,
  interval_minutes integer not null check (interval_minutes between 1 and 5256000),
  review_count integer not null check (review_count between 1 and 100000),
  last_grade text not null check (last_grade in ('again', 'hard', 'good', 'easy')),
  updated_at timestamptz not null default now(),
  primary key (student_id, theory_lesson_id, card_id),
  foreign key (card_id, theory_lesson_id)
    references public.theory_lesson_flashcards (id, theory_lesson_id) on delete restrict
);

create index flashcard_reviews_lesson_idx on public.flashcard_reviews(theory_lesson_id);
create index flashcard_reviews_card_idx on public.flashcard_reviews(card_id, theory_lesson_id);

alter table public.flashcard_reviews enable row level security;
revoke all on public.flashcard_reviews from anon, authenticated;
grant select on public.flashcard_reviews to authenticated;
grant insert (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  on public.flashcard_reviews to authenticated;
grant update (due_at, interval_minutes, review_count, last_grade)
  on public.flashcard_reviews to authenticated;
grant all on public.flashcard_reviews to service_role;

-- O aluno lê o PRÓPRIO histórico sempre — também depois de a aula sair do ar
-- ou de o acesso vencer, como no resto do schema.
create policy flashcard_reviews_select on public.flashcard_reviews for select to authenticated
using (student_id = (select auth.uid()));

-- Escrever exige acesso vigente e um cartão vivo de aula ativa e publicada que
-- ele enxerga (a subconsulta herda a RLS das duas tabelas).
create policy flashcard_reviews_insert on public.flashcard_reviews for insert to authenticated
with check (
  student_id = (select auth.uid()) and public.has_active_access() and exists (
    select 1 from public.theory_lesson_flashcards card
      join public.theory_lessons lesson on lesson.id = card.theory_lesson_id
     where card.id = flashcard_reviews.card_id
       and card.theory_lesson_id = flashcard_reviews.theory_lesson_id
       and not card.deleted and lesson.active and lesson.published
  )
);

create policy flashcard_reviews_update on public.flashcard_reviews for update to authenticated
using (student_id = (select auth.uid()))
with check (
  student_id = (select auth.uid()) and public.has_active_access() and exists (
    select 1 from public.theory_lesson_flashcards card
      join public.theory_lessons lesson on lesson.id = card.theory_lesson_id
     where card.id = flashcard_reviews.card_id
       and card.theory_lesson_id = flashcard_reviews.theory_lesson_id
       and not card.deleted and lesson.active and lesson.published
  )
);

create trigger flashcard_reviews_updated_at before update on public.flashcard_reviews
for each row execute function public.set_updated_at();
