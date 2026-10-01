-- A revisão da biblioteca passa a apontar para um cartão de verdade (spec 39).
--
-- `not valid` DE PROPÓSITO (R-BIB-25): esta migration e a da 38 chegam juntas
-- a staging e produção, e no momento do `db push` o banco de lá tem revisões e
-- nenhum cartão — a carga só roda depois. Validar aqui falharia. Uma FK
-- `not valid` já confere toda linha nova; as antigas são conferidas por
-- `scripts/load-library-flashcards.mjs`, que a valida no fim da carga.
alter table public.library_flashcard_reviews
  add constraint library_flashcard_reviews_card_fk foreign key (deck_id, card_id)
  references public.library_flashcards(deck_id, id) on delete restrict
  not valid;

-- O índice do lado que referencia, na ordem das colunas da FK. O de `deck_id`
-- sozinho vira prefixo dele e sai.
create index library_flashcard_reviews_card_idx on public.library_flashcard_reviews(deck_id, card_id);
drop index public.library_flashcard_reviews_deck_idx;

-- Cartão retirado não aceita revisão (R-BIB-26). O USING não muda: a revisão
-- antiga continua legível, e quem venceu continua lendo o próprio histórico.
drop policy library_flashcard_reviews_insert on public.library_flashcard_reviews;
drop policy library_flashcard_reviews_update on public.library_flashcard_reviews;

create policy library_flashcard_reviews_insert on public.library_flashcard_reviews
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.has_active_access())
    and exists (select 1 from public.library_flashcards c
                 where c.deck_id = library_flashcard_reviews.deck_id
                   and c.id = library_flashcard_reviews.card_id
                   and c.retired_at is null)
  );
create policy library_flashcard_reviews_update on public.library_flashcard_reviews
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (
    student_id = (select auth.uid())
    and (select public.has_active_access())
    and exists (select 1 from public.library_flashcards c
                 where c.deck_id = library_flashcard_reviews.deck_id
                   and c.id = library_flashcard_reviews.card_id
                   and c.retired_at is null)
  );

-- A lista de decks sem o texto (R-BIB-28): os ids, para o progresso, e os
-- tópicos, para a busca. No fim da view — `create or replace` só acrescenta.
create or replace view public.vw_library_flashcard_decks with (security_invoker = true) as
select d.id as deck_id,
       d.subject_id,
       d.number,
       d.title,
       d.historical,
       d.position,
       (select count(*) from public.library_flashcards c
         where c.deck_id = d.id and c.retired_at is null)::integer as active_cards,
       coalesce((select array_agg(c.id order by c.position) from public.library_flashcards c
         where c.deck_id = d.id and c.retired_at is null), '{}') as card_ids,
       coalesce((select array_agg(distinct c.topic order by c.topic) from public.library_flashcards c
         where c.deck_id = d.id and c.retired_at is null), '{}') as topics
  from public.library_flashcard_decks d;
