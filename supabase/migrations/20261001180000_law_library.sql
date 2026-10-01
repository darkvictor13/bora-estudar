-- Vade Mecum no banco: normas, textos, mapas de edital e marcações (spec 40).
--
-- "Uma norma = um canonical_id; editais armazenam apenas vínculos/recortes"
-- (content/laws/vade-mecum-base-v1/04_LISTA_MESTRA_INICIAL.json). Por isso a
-- norma, o texto que a biblioteca tem dela e o recorte que cada edital cobra
-- são três tabelas, e não três cópias do mesmo título.
--
-- O conteúdo é carregado por `scripts/load-law-library.mjs`, no deploy, como a
-- biblioteca de flashcards. A única escrita de usuário é `law_marks`.

create type public.legal_norm_sphere as enum ('constitutional', 'federal', 'state');
-- Um valor só, porque é o único que a lista mestra declara hoje. Status novo
-- entra por migration, e não como texto livre.
create type public.legal_norm_verification as enum ('pending_official_source');
create type public.law_mark_style as enum ('highlight', 'underline', 'strike', 'outline');
create type public.law_mark_color as enum ('yellow', 'mint', 'blue', 'pink', 'lilac', 'peach', 'salmon');

-- ---------------------------------------------------------------------------
-- Normas e textos
-- ---------------------------------------------------------------------------

create table public.law_subjects (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique check (length(trim(name)) > 0),
  position smallint not null,
  created_at timestamptz not null default now()
);

-- R-LEI-01. `sphere` e `verification_status` nulos para as normas que só os
-- mapas de edital citam: a lista mestra não diz nada sobre elas.
create table public.legal_norms (
  canonical_id text primary key check (canonical_id ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  title text not null check (length(trim(title)) > 0),
  sphere public.legal_norm_sphere,
  verification_status public.legal_norm_verification,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- R-LEI-02: a edição de uma norma na biblioteca. O id é o curto que a URL já
-- usa (`?lei=ld`), e a norma tem no máximo uma edição.
create table public.laws (
  id text primary key check (id ~ '^[a-z0-9]+$'),
  norm_id text not null unique references public.legal_norms(canonical_id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  norm_label text not null check (length(trim(norm_label)) > 0),
  subject_id text not null references public.law_subjects(id) on delete restrict,
  official_url text not null check (official_url ~ '^https://'),
  source_date date,
  position smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index laws_subject_idx on public.laws(subject_id);

-- R-LEI-03. Retirado por marca, nunca apagado: a marcação do aluno aponta para
-- o artigo, e `on delete restrict` em `law_marks` segura o resto.
create table public.law_articles (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  law_id text not null references public.laws(id) on delete restrict,
  position integer not null check (position >= 0),
  label text not null check (length(trim(label)) > 0),
  section text not null,
  paragraphs text[] not null check (cardinality(paragraphs) > 0),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Alvo da FK composta de `law_marks` (R-LEI-14).
  constraint law_articles_law_article_key unique (law_id, id)
);

create index law_articles_active_law_idx on public.law_articles(law_id, position)
  where retired_at is null;

-- ---------------------------------------------------------------------------
-- Mapas de edital: só vínculo e recorte (R-LEI-05)
-- ---------------------------------------------------------------------------

create table public.exam_notices (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  canonical_id text not null unique check (canonical_id ~ '^EDITAL-[A-Z0-9]+(-[A-Z0-9]+)*$'),
  short_name text not null,
  title text not null,
  accent text not null,
  base_date date not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_notice_sections (
  notice_id text not null references public.exam_notices(id) on delete cascade,
  position smallint not null check (position >= 0),
  title text not null check (length(trim(title)) > 0),
  primary key (notice_id, position)
);

-- O título do item é o da norma: o arquivo o repetia, e as duas cópias
-- podiam divergir. "Tem texto" é haver `laws` para a norma.
create table public.exam_notice_items (
  notice_id text not null,
  section_position smallint not null,
  position smallint not null check (position >= 0),
  norm_id text not null references public.legal_norms(canonical_id) on delete restrict,
  scope text not null,
  primary key (notice_id, section_position, position),
  foreign key (notice_id, section_position)
    references public.exam_notice_sections(notice_id, position) on delete cascade
);

create index exam_notice_items_norm_idx on public.exam_notice_items(norm_id);

-- ---------------------------------------------------------------------------
-- Marcações do aluno (R-LEI-09 a R-LEI-17)
-- ---------------------------------------------------------------------------

-- `quote`, `prefix` e `suffix` são a âncora por trecho (o TextQuoteSelector da
-- W3C Web Annotation): é o que deixa a marcação reencontrar o lugar quando o
-- texto da lei é corrigido e as posições de caractere deixam de valer.
create table public.law_marks (
  id uuid primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  law_id text not null,
  article_id text not null,
  paragraph_index integer not null check (paragraph_index >= 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null,
  quote text not null,
  prefix text not null default '' check (length(prefix) <= 32),
  suffix text not null default '' check (length(suffix) <= 32),
  style public.law_mark_style not null,
  color public.law_mark_color not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_offset > start_offset),
  -- R-LEI-17: a âncora é o trecho que a posição aponta, e não outro.
  check (length(quote) = end_offset - start_offset),
  -- R-LEI-14: o artigo é da lei que a linha diz.
  foreign key (law_id, article_id) references public.law_articles(law_id, id) on delete restrict
);

create index law_marks_student_law_idx on public.law_marks(student_id, law_id);
create index law_marks_law_article_idx on public.law_marks(law_id, article_id);

create trigger legal_norms_updated_at before update on public.legal_norms
for each row execute function public.set_updated_at();
create trigger laws_updated_at before update on public.laws
for each row execute function public.set_updated_at();
create trigger law_articles_updated_at before update on public.law_articles
for each row execute function public.set_updated_at();
create trigger exam_notices_updated_at before update on public.exam_notices
for each row execute function public.set_updated_at();
create trigger law_marks_updated_at before update on public.law_marks
for each row execute function public.set_updated_at();

-- O número de artigos não é guardado (R-LEI-06). `security_invoker`: a
-- contagem passa pela policy de `law_articles`.
create view public.vw_law_library with (security_invoker = true) as
select l.id as law_id,
       l.norm_id,
       l.title,
       l.norm_label,
       l.subject_id,
       l.official_url,
       l.source_date,
       l.position,
       (select count(*) from public.law_articles a
         where a.law_id = l.id and a.retired_at is null)::integer as article_count
  from public.laws l;

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------

alter table public.law_subjects enable row level security;
alter table public.legal_norms enable row level security;
alter table public.laws enable row level security;
alter table public.law_articles enable row level security;
alter table public.exam_notices enable row level security;
alter table public.exam_notice_sections enable row level security;
alter table public.exam_notice_items enable row level security;
alter table public.law_marks enable row level security;

revoke all on public.law_subjects, public.legal_norms, public.laws, public.law_articles,
  public.exam_notices, public.exam_notice_sections, public.exam_notice_items,
  public.law_marks, public.vw_law_library
  from anon, authenticated;

-- Conteúdo: só leitura (R-LEI-08).
grant select on public.law_subjects, public.legal_norms, public.laws, public.law_articles,
  public.exam_notices, public.exam_notice_sections, public.exam_notice_items,
  public.vw_law_library
  to authenticated;
grant all on public.law_subjects, public.legal_norms, public.laws, public.law_articles,
  public.exam_notices, public.exam_notice_sections, public.exam_notice_items,
  public.law_marks, public.vw_law_library
  to service_role;

create policy law_subjects_select on public.law_subjects for select to authenticated using (true);
create policy legal_norms_select on public.legal_norms for select to authenticated using (true);
create policy laws_select on public.laws for select to authenticated using (true);
create policy exam_notices_select on public.exam_notices for select to authenticated using (true);
create policy exam_notice_sections_select on public.exam_notice_sections for select to authenticated using (true);
create policy exam_notice_items_select on public.exam_notice_items for select to authenticated using (true);

-- O texto: acesso vigente ou professor (R-LEI-07), como os cartões.
create policy law_articles_select on public.law_articles
  for select to authenticated
  using ((select public.has_active_access()) or (select public.is_teacher()));

-- Marcações: do próprio aluno (R-LEI-10). As colunas de contexto ficam fora do
-- grant de UPDATE — a RLS decide qual linha, nunca qual coluna.
grant select, delete on public.law_marks to authenticated;
grant insert (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset,
              quote, prefix, suffix, style, color)
  on public.law_marks to authenticated;
grant update (paragraph_index, start_offset, end_offset, quote, prefix, suffix, style, color)
  on public.law_marks to authenticated;

-- Ler o que é seu não exige acesso vigente: quem venceu continua vendo os
-- próprios grifos. Criar e alterar, sim — e só em artigo ativo.
create policy law_marks_select on public.law_marks
  for select to authenticated using (student_id = (select auth.uid()));
create policy law_marks_insert on public.law_marks
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.has_active_access())
    and exists (select 1 from public.law_articles a
                 where a.law_id = law_marks.law_id and a.id = law_marks.article_id
                   and a.retired_at is null)
  );
create policy law_marks_update on public.law_marks
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));
create policy law_marks_delete on public.law_marks
  for delete to authenticated using (student_id = (select auth.uid()));
