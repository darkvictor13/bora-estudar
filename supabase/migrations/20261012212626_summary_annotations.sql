-- Anotações pessoais: nunca alteram o material original.
create table public.summary_annotations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text not null references public.summary_topics(id) on delete cascade,
  notes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(notes) = 'array' and jsonb_array_length(notes) <= 2000 and octet_length(notes::text) <= 2097152),
  primary key (user_id, topic_id)
);
create index summary_annotations_topic_idx on public.summary_annotations(topic_id);
alter table public.summary_annotations enable row level security;
revoke all on public.summary_annotations from anon, authenticated;
grant select on public.summary_annotations to authenticated;
grant insert (user_id, topic_id, notes), update (notes) on public.summary_annotations to authenticated;
grant all on public.summary_annotations to service_role;
create policy summary_annotations_read on public.summary_annotations for select to authenticated
  using (user_id = (select auth.uid()));
create policy summary_annotations_insert on public.summary_annotations for insert to authenticated
  with check (user_id = (select auth.uid()) and ((select public.has_active_access()) or (select public.is_teacher())));
create policy summary_annotations_update on public.summary_annotations for update to authenticated
  using (user_id = (select auth.uid()) and ((select public.has_active_access()) or (select public.is_teacher())))
  with check (user_id = (select auth.uid()) and ((select public.has_active_access()) or (select public.is_teacher())));
