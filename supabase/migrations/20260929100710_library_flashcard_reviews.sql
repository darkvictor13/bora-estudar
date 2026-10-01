-- Revisões pessoais dos decks editoriais da biblioteca PF 2029.
--
-- O conteúdo dos decks mora no front (`apps/web/src/data/`); o banco guarda
-- só a CHAVE de cada um, numa tabela, para que a revisão aponte para ela por
-- FK. Deck novo é linha nova numa migration — e não a lista inteira de um
-- CHECK reescrita a cada lote, que é dado de domínio dentro de uma expressão.
create table public.library_flashcard_decks (
  id text primary key check (id ~ '^pf2029-[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

-- Como `catalog_blocks`: leitura para autenticado — são só as chaves, que o
-- bundle já publica — e carga por migration ou `service_role`.
alter table public.library_flashcard_decks enable row level security;
revoke all on public.library_flashcard_decks from anon, authenticated;
grant select on public.library_flashcard_decks to authenticated;
grant all on public.library_flashcard_decks to service_role;
create policy library_flashcard_decks_select on public.library_flashcard_decks
  for select to authenticated using (true);

insert into public.library_flashcard_decks (id) values
  ('pf2029-informatica-01'), ('pf2029-informatica-02'), ('pf2029-informatica-03'),
  ('pf2029-informatica-04'), ('pf2029-informatica-05'), ('pf2029-informatica-06'),
  ('pf2029-informatica-08'), ('pf2029-informatica-09'), ('pf2029-informatica-10');

create table public.library_flashcard_reviews (
  student_id uuid not null references public.profiles(id) on delete cascade,
  deck_id text not null references public.library_flashcard_decks(id) on delete restrict,
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

-- Ler o próprio histórico não exige acesso vigente; escrever, sim. Com
-- `has_active_access()` no USING, quem venceu via o histórico sumir em silêncio.
create policy library_flashcard_reviews_select on public.library_flashcard_reviews
  for select to authenticated using (student_id = (select auth.uid()));
create policy library_flashcard_reviews_insert on public.library_flashcard_reviews
  for insert to authenticated with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy library_flashcard_reviews_update on public.library_flashcard_reviews
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));

create trigger library_flashcard_reviews_updated_at before update on public.library_flashcard_reviews
for each row execute function public.set_updated_at();
