-- Estado de memória por cartão para revisão espaçada FSRS-6.
-- Linhas criadas antes desta migração recebem uma aproximação a partir do intervalo já agendado.
alter table public.flashcard_reviews
  add column state text not null default 'review' check (state in ('learning', 'review', 'relearning')),
  add column step integer not null default 0 check (step between 0 and 1),
  add column stability double precision not null default 1 check (stability between 0.01 and 3650),
  add column difficulty double precision not null default 5 check (difficulty between 1 and 10),
  add column lapses integer not null default 0 check (lapses between 0 and 100000),
  add column last_reviewed_at timestamptz not null default now();

alter table public.library_flashcard_reviews
  add column state text not null default 'review' check (state in ('learning', 'review', 'relearning')),
  add column step integer not null default 0 check (step between 0 and 1),
  add column stability double precision not null default 1 check (stability between 0.01 and 3650),
  add column difficulty double precision not null default 5 check (difficulty between 1 and 10),
  add column lapses integer not null default 0 check (lapses between 0 and 100000),
  add column last_reviewed_at timestamptz not null default now();

update public.flashcard_reviews set
  state = case when interval_minutes < 1440 then 'learning' else 'review' end,
  step = case when interval_minutes between 7 and 1439 then 1 else 0 end,
  stability = greatest(0.01, least(3650, interval_minutes / 1440.0)),
  last_reviewed_at = updated_at;
update public.library_flashcard_reviews set
  state = case when interval_minutes < 1440 then 'learning' else 'review' end,
  step = case when interval_minutes between 7 and 1439 then 1 else 0 end,
  stability = greatest(0.01, least(3650, interval_minutes / 1440.0)),
  last_reviewed_at = updated_at;

grant insert (state, step, stability, difficulty, lapses, last_reviewed_at)
  on public.flashcard_reviews to authenticated;
grant update (state, step, stability, difficulty, lapses, last_reviewed_at)
  on public.flashcard_reviews to authenticated;
grant insert (state, step, stability, difficulty, lapses, last_reviewed_at)
  on public.library_flashcard_reviews to authenticated;
grant update (state, step, stability, difficulty, lapses, last_reviewed_at)
  on public.library_flashcard_reviews to authenticated;
