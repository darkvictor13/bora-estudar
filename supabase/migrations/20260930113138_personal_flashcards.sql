-- Decks criados pelo próprio aluno. Mantidos separados do catálogo editorial
-- e dos cartões de aula para que nenhuma escrita pessoal altere conteúdo oficial.
create table public.personal_flashcard_decks (
  id uuid primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 2 and 120),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id)
);

create table public.personal_flashcards (
  id uuid primary key,
  deck_id uuid not null,
  student_id uuid not null,
  topic text not null default '' check (char_length(topic) <= 160),
  front text not null check (char_length(btrim(front)) between 1 and 2000),
  back text not null check (char_length(btrim(back)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, deck_id, student_id),
  foreign key (deck_id, student_id)
    references public.personal_flashcard_decks(id, student_id) on delete cascade
);

create table public.personal_flashcard_reviews (
  student_id uuid not null,
  deck_id uuid not null,
  card_id uuid not null,
  due_at timestamptz not null,
  interval_minutes integer not null check (interval_minutes between 1 and 5256000),
  review_count integer not null check (review_count between 1 and 100000),
  last_grade text not null check (last_grade in ('again', 'hard', 'good', 'easy')),
  state text not null default 'learning' check (state in ('learning', 'review', 'relearning')),
  step smallint not null default 0 check (step between 0 and 100),
  stability double precision not null default 0 check (stability between 0 and 3650),
  difficulty double precision not null default 5 check (difficulty between 1 and 10),
  lapses integer not null default 0 check (lapses between 0 and 100000),
  last_reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, deck_id, card_id),
  foreign key (card_id, deck_id, student_id)
    references public.personal_flashcards(id, deck_id, student_id) on delete cascade
);

create index personal_flashcard_decks_student_idx on public.personal_flashcard_decks(student_id, updated_at desc);
create index personal_flashcards_deck_idx on public.personal_flashcards(deck_id, created_at);
create index personal_flashcard_reviews_due_idx on public.personal_flashcard_reviews(student_id, due_at);

alter table public.personal_flashcard_decks enable row level security;
alter table public.personal_flashcards enable row level security;
alter table public.personal_flashcard_reviews enable row level security;

revoke all on public.personal_flashcard_decks, public.personal_flashcards, public.personal_flashcard_reviews from anon, authenticated;
grant select on public.personal_flashcard_decks, public.personal_flashcards, public.personal_flashcard_reviews to authenticated;
grant insert (id, student_id, subject, title) on public.personal_flashcard_decks to authenticated;
grant update (subject, title) on public.personal_flashcard_decks to authenticated;
grant delete on public.personal_flashcard_decks to authenticated;
grant insert (id, deck_id, student_id, topic, front, back) on public.personal_flashcards to authenticated;
grant update (topic, front, back) on public.personal_flashcards to authenticated;
grant delete on public.personal_flashcards to authenticated;
grant insert (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade, state, step, stability, difficulty, lapses, last_reviewed_at)
  on public.personal_flashcard_reviews to authenticated;
grant update (due_at, interval_minutes, review_count, last_grade, state, step, stability, difficulty, lapses, last_reviewed_at)
  on public.personal_flashcard_reviews to authenticated;
grant all on public.personal_flashcard_decks, public.personal_flashcards, public.personal_flashcard_reviews to service_role;

create policy personal_flashcard_decks_select on public.personal_flashcard_decks
  for select to authenticated using (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcard_decks_insert on public.personal_flashcard_decks
  for insert to authenticated with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcard_decks_update on public.personal_flashcard_decks
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.has_active_access()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcard_decks_delete on public.personal_flashcard_decks
  for delete to authenticated using (student_id = (select auth.uid()) and (select public.has_active_access()));

create policy personal_flashcards_select on public.personal_flashcards
  for select to authenticated using (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcards_insert on public.personal_flashcards
  for insert to authenticated with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcards_update on public.personal_flashcards
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.has_active_access()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcards_delete on public.personal_flashcards
  for delete to authenticated using (student_id = (select auth.uid()) and (select public.has_active_access()));

create policy personal_flashcard_reviews_select on public.personal_flashcard_reviews
  for select to authenticated using (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcard_reviews_insert on public.personal_flashcard_reviews
  for insert to authenticated with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy personal_flashcard_reviews_update on public.personal_flashcard_reviews
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.has_active_access()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));

create trigger personal_flashcard_decks_updated_at before update on public.personal_flashcard_decks
for each row execute function public.set_updated_at();
create trigger personal_flashcards_updated_at before update on public.personal_flashcards
for each row execute function public.set_updated_at();
create trigger personal_flashcard_reviews_updated_at before update on public.personal_flashcard_reviews
for each row execute function public.set_updated_at();
