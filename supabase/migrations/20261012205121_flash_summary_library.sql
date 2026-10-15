-- Biblioteca PF 2029: conteúdo importado, independente das aulas.
create table public.summary_topics (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subject text not null check (length(trim(subject)) > 0),
  title text not null check (length(trim(title)) > 0),
  position integer not null check (position >= 0),
  source_name text not null,
  source_hash text not null,
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  updated_at timestamptz not null default now()
);
create index summary_topics_position_idx on public.summary_topics(position);
alter table public.summary_topics enable row level security;
revoke all on public.summary_topics from anon, authenticated;
grant select on public.summary_topics to authenticated;
grant all on public.summary_topics to service_role;
create policy summary_topics_read on public.summary_topics for select to authenticated
  using ((select public.has_active_access()) or (select public.is_teacher()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('flash-summaries', 'flash-summaries', false, 67108864)
on conflict (id) do nothing;
create policy summary_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'flash-summaries' and
    ((select public.has_active_access()) or (select public.is_teacher())));
