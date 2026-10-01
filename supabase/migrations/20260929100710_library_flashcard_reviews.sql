-- Revisões pessoais dos decks editoriais da biblioteca PF 2029.
create table public.library_flashcard_reviews (
  student_id uuid not null references public.profiles(id) on delete cascade,
  deck_id text not null check (deck_id ~ '^pf2029-informatica-(01|02|03|04|05|06|08|09|10)$'),
  card_id uuid not null,
  due_at timestamptz not null,
  interval_minutes integer not null check (interval_minutes between 1 and 5256000),
  review_count integer not null check (review_count between 1 and 100000),
  last_grade text not null check (last_grade in ('again', 'hard', 'good', 'easy')),
  updated_at timestamptz not null default now(),
  primary key (student_id, deck_id, card_id)
);

create index library_flashcard_reviews_deck_idx on public.library_flashcard_reviews(deck_id);
alter table public.library_flashcard_reviews enable row level security;
revoke all on public.library_flashcard_reviews from anon, authenticated;
grant select on public.library_flashcard_reviews to authenticated;
grant insert (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade)
  on public.library_flashcard_reviews to authenticated;
grant update (due_at, interval_minutes, review_count, last_grade)
  on public.library_flashcard_reviews to authenticated;
grant all on public.library_flashcard_reviews to service_role;

create policy library_flashcard_reviews_select on public.library_flashcard_reviews
  for select to authenticated using (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy library_flashcard_reviews_insert on public.library_flashcard_reviews
  for insert to authenticated with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy library_flashcard_reviews_update on public.library_flashcard_reviews
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.has_active_access()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));

create trigger library_flashcard_reviews_updated_at before update on public.library_flashcard_reviews
for each row execute function public.set_updated_at();
