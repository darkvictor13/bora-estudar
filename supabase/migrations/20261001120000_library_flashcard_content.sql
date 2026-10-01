-- Conteúdo da biblioteca PF 2029 no banco (spec 38).
--
-- Até aqui o banco guardava só a CHAVE de cada deck; matéria, título e os
-- 5.108 cartões moravam num JSON publicado com o site. Esta migration cria o
-- lugar do conteúdo, e `scripts/load-library-flashcards.mjs` o preenche.
--
-- O QUE FICA DE FORA, DE PROPÓSITO: a FK de `library_flashcard_reviews` para o
-- cartão. Aqui ela recusaria toda revisão entre o `db push` e a carga, com o
-- bundle no ar revisando. Vai na spec 39, e a carga já falha hoje se houver
-- revisão órfã (R-BIB-21) — é o que garante que, lá, ela valida.

-- ---------------------------------------------------------------------------
-- Referência: origem e status declarados no material
-- ---------------------------------------------------------------------------

-- O aviso que o aluno vê durante o estudo. Antes era uma expressão regular
-- sobre o texto do status (`/conferir|verificar|revisar/`): status novo com
-- outra grafia perdia o aviso em silêncio. A frase continua no front.
create type public.library_flashcard_notice as enum
  ('revoked', 'pending_check', 'future_effect', 'version_caveat');

create table public.library_flashcard_origins (
  id text primary key check (id ~ '^[A-Za-z0-9_]+$')
);

create table public.library_flashcard_statuses (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  editorial_notice public.library_flashcard_notice
);

insert into public.library_flashcard_origins (id) values
  ('nao_informada'), ('resumo_pf_2029'), ('resumo'), ('correcao'), ('correcao_tecnica'),
  ('correcao_legal_2026'), ('auditoria_tecnica_2026'), ('auditoria_gramatical'),
  ('NIST_SP_800_63B_4'), ('Microsoft_Lifecycle'), ('Adobe_EoL'),
  ('MRPR_3ed_2018'), ('MRPR_3ed_2018_e_Decreto_9758_2019'), ('Decreto_9758_2019'),
  ('planalto_lei_15384_2026'), ('planalto_lei_15397_2026'), ('planalto_lei_15358_2026'),
  ('planalto_cpp_compilado_2026'), ('verificacao_externa_planalto'),
  ('verificacao_externa_ohchr'), ('verificacao_externa_onu'), ('verificacao_externa_cfc'),
  ('verificacao_externa_cpc'), ('verificacao_externa_cpc_cvm'), ('verificacao_legal_2026');

insert into public.library_flashcard_statuses (id, editorial_notice) values
  ('historico_revogado', 'revoked'),
  ('conferir_vigencia', 'pending_check'),
  ('conferir_legislacao', 'pending_check'),
  ('jurisprudencia_verificar', 'pending_check'),
  ('fonte_resumo_revisar', 'pending_check'),
  ('atualizacao_futura_2027', 'future_effect'),
  ('alerta_versionamento', 'version_caveat'),
  ('manual_2018_com_ressalva_normativa', 'version_caveat'),
  ('mantido_v1', null), ('fonte_resumo', null), ('conceitual', null),
  ('texto_do_resumo', null), ('texto_legal', null), ('texto_cf', null),
  ('complemento_auditoria', null), ('lacuna_corrigida_v2', null),
  ('correcao_legal_2026', null), ('texto_constitucional', null), ('correcao_tecnica', null),
  ('texto_lei_8112', null), ('lacuna_preenchida_auditoria', null), ('texto_lei_14133', null),
  ('doutrinario', null), ('correcao_normativa_2026', null), ('texto_lei_9784', null),
  ('auditoria_externa_2026', null), ('correcao_tecnica_v2', null),
  ('verificacao_externa_planalto', null), ('verificacao_externa', null),
  ('expansao_didatica', null), ('auditoria_tecnica_2026', null),
  ('verificacao_legal', null), ('correcao_legal', null);

-- ---------------------------------------------------------------------------
-- Matéria → deck → cartão
-- ---------------------------------------------------------------------------

create table public.library_flashcard_subjects (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  source_file text not null,
  audit_label text not null,
  audit_partial boolean not null default false,
  position smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nulas e com default: as 101 linhas de hoje e o bundle no ar continuam
-- válidos antes da primeira carga (R-BIB-11).
alter table public.library_flashcard_decks
  add column subject_id text references public.library_flashcard_subjects(id) on delete restrict,
  add column number text,
  add column title text check (title is null or length(trim(title)) > 0),
  add column historical boolean not null default false,
  add column position smallint,
  add column updated_at timestamptz not null default now();

create index library_flashcard_decks_subject_idx on public.library_flashcard_decks(subject_id);

create table public.library_flashcards (
  id uuid primary key,
  deck_id text not null references public.library_flashcard_decks(id) on delete restrict,
  topic text not null check (length(trim(topic)) > 0),
  front text not null check (length(trim(front)) > 0),
  back text not null check (length(trim(back)) > 0),
  origin_id text not null references public.library_flashcard_origins(id) on delete restrict,
  status_id text references public.library_flashcard_statuses(id) on delete restrict,
  source_number text,
  position integer not null check (position >= 0),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Alvo da FK composta que a spec 39 cria a partir das revisões (R-BIB-03).
  constraint library_flashcards_deck_card_key unique (deck_id, id)
);

create index library_flashcards_active_deck_idx on public.library_flashcards(deck_id, position)
  where retired_at is null;

-- Mover cartão de deck desamarra a revisão do aluno, que é guardada por
-- `(deck_id, card_id)`. Mover é retirar, criar e registrar alias (R-BIB-04).
-- Vale para todo papel, inclusive o da carga.
create or replace function app_private.forbid_library_card_move() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.deck_id is distinct from old.deck_id then
    raise exception 'O cartão % não pode mudar do deck % para %: retire-o e crie um novo com alias.',
      old.id, old.deck_id, new.deck_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.forbid_library_card_move() from public;

create trigger library_flashcards_forbid_move before update of deck_id on public.library_flashcards
for each row execute function app_private.forbid_library_card_move();

-- `previousReviews` saindo do JSON: a revisão guardada no par antigo vale para
-- o cartão atual (R-BIB-08). As duas pontas são cartão de verdade, por FK.
create table public.library_flashcard_aliases (
  old_deck_id text not null,
  old_card_id uuid not null,
  deck_id text not null,
  card_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (old_deck_id, old_card_id),
  foreign key (old_deck_id, old_card_id)
    references public.library_flashcards(deck_id, id) on delete restrict,
  foreign key (deck_id, card_id)
    references public.library_flashcards(deck_id, id) on delete restrict,
  check ((old_deck_id, old_card_id) is distinct from (deck_id, card_id))
);

create index library_flashcard_aliases_target_idx on public.library_flashcard_aliases(deck_id, card_id);

-- Origem retirada, destino ativo. Conferido no fim da transação, e não por
-- linha: a carga retira o antigo e grava o alias na mesma transação, em
-- qualquer ordem.
create or replace function app_private.check_library_flashcard_alias() returns trigger
  language plpgsql set search_path = '' as $$
declare
  v_alias record;
begin
  for v_alias in
    select a.old_deck_id, a.old_card_id, a.deck_id, a.card_id
      from public.library_flashcard_aliases a
      join public.library_flashcards o on o.deck_id = a.old_deck_id and o.id = a.old_card_id
      join public.library_flashcards t on t.deck_id = a.deck_id and t.id = a.card_id
     where o.retired_at is null or t.retired_at is not null
  loop
    raise exception 'O alias %/% → %/% exige o cartão antigo retirado e o novo ativo.',
      v_alias.old_deck_id, v_alias.old_card_id, v_alias.deck_id, v_alias.card_id
      using errcode = '23514';
  end loop;
  return null;
end;
$$;
revoke execute on function app_private.check_library_flashcard_alias() from public;

create constraint trigger library_flashcard_aliases_endpoints
  after insert or update on public.library_flashcard_aliases
  deferrable initially deferred
  for each row execute function app_private.check_library_flashcard_alias();

-- O mesmo conferido do outro lado: retirar o destino ou reativar a origem de
-- um alias também quebra a regra.
create constraint trigger library_flashcards_alias_endpoints
  after update of retired_at on public.library_flashcards
  deferrable initially deferred
  for each row execute function app_private.check_library_flashcard_alias();

create trigger library_flashcard_subjects_updated_at before update on public.library_flashcard_subjects
for each row execute function public.set_updated_at();
create trigger library_flashcard_decks_updated_at before update on public.library_flashcard_decks
for each row execute function public.set_updated_at();
create trigger library_flashcards_updated_at before update on public.library_flashcards
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contagem: nenhum contador guardado (R-BIB-10)
-- ---------------------------------------------------------------------------

-- `security_invoker`: a contagem passa pela policy de `library_flashcards`, e
-- quem não lê cartão vê zero.
create view public.vw_library_flashcard_decks with (security_invoker = true) as
select d.id as deck_id,
       d.subject_id,
       d.number,
       d.title,
       d.historical,
       d.position,
       (select count(*) from public.library_flashcards c
         where c.deck_id = d.id and c.retired_at is null)::integer as active_cards
  from public.library_flashcard_decks d;

-- ---------------------------------------------------------------------------
-- Grants e RLS: só leitura para autenticado (R-BIB-12 a R-BIB-15)
-- ---------------------------------------------------------------------------

alter table public.library_flashcard_origins enable row level security;
alter table public.library_flashcard_statuses enable row level security;
alter table public.library_flashcard_subjects enable row level security;
alter table public.library_flashcards enable row level security;
alter table public.library_flashcard_aliases enable row level security;

revoke all on public.library_flashcard_origins, public.library_flashcard_statuses,
  public.library_flashcard_subjects, public.library_flashcards,
  public.library_flashcard_aliases, public.vw_library_flashcard_decks
  from anon, authenticated;

grant select on public.library_flashcard_origins, public.library_flashcard_statuses,
  public.library_flashcard_subjects, public.library_flashcards,
  public.library_flashcard_aliases, public.vw_library_flashcard_decks
  to authenticated;

grant all on public.library_flashcard_origins, public.library_flashcard_statuses,
  public.library_flashcard_subjects, public.library_flashcards,
  public.library_flashcard_aliases, public.vw_library_flashcard_decks
  to service_role;

create policy library_flashcard_origins_select on public.library_flashcard_origins
  for select to authenticated using (true);
create policy library_flashcard_statuses_select on public.library_flashcard_statuses
  for select to authenticated using (true);
create policy library_flashcard_subjects_select on public.library_flashcard_subjects
  for select to authenticated using (true);
create policy library_flashcard_aliases_select on public.library_flashcard_aliases
  for select to authenticated using (true);

-- O texto é o conteúdo pago: acesso vigente ou professor (R-BIB-13). O
-- histórico do aluno vencido continua em `library_flashcard_reviews_select`,
-- que não muda.
create policy library_flashcards_select on public.library_flashcards
  for select to authenticated
  using ((select public.has_active_access()) or (select public.is_teacher()));
