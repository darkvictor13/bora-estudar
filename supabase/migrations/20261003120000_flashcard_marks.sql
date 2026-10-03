-- Grifo nos flashcards (spec 42).
--
-- A marcação de cartão é a mesma ideia da `law_marks` (spec 40): uma linha por
-- trecho, do próprio aluno, escrita direto com RLS e ancorada pelo trecho além
-- da posição. O que muda é o alvo — três tipos de cartão em três tabelas —, e
-- por isso o cartão é dito por `card_kind` mais um par de colunas por tipo.
--
-- Uma tabela, e não três como as revisões: a regra de grifo é uma só, e três
-- tabelas seriam três cópias da mesma policy para derivar.
--
-- Nada aqui substitui o que o bundle no ar usa: é tabela nova.

create type public.flashcard_card_kind as enum ('library', 'lesson', 'personal');
create type public.flashcard_side as enum ('front', 'back');

create table public.flashcard_marks (
  id uuid primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  card_kind public.flashcard_card_kind not null,
  library_deck_id text,
  library_card_id uuid,
  lesson_id uuid,
  lesson_card_id uuid,
  personal_deck_id uuid,
  personal_card_id uuid,
  side public.flashcard_side not null,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null,
  quote text not null,
  prefix text not null default '' check (length(prefix) <= 32),
  suffix text not null default '' check (length(suffix) <= 32),
  -- R-GRIFO-06: a paleta é a da lei, uma só para as duas telas.
  style public.law_mark_style not null,
  color public.law_mark_color not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_offset > start_offset),
  -- R-GRIFO-05: a âncora é o trecho que a posição aponta, e não outro.
  check (length(quote) = end_offset - start_offset),
  -- R-GRIFO-02: o par do tipo, e nulos nos outros dois. Sem isso uma linha
  -- apontaria para dois cartões, e a FK de MATCH SIMPLE pularia o par
  -- incompleto sem reclamar.
  constraint flashcard_marks_card_ref_check check (
    case card_kind
      when 'library' then num_nonnulls(library_deck_id, library_card_id) = 2
        and num_nulls(lesson_id, lesson_card_id, personal_deck_id, personal_card_id) = 4
      when 'lesson' then num_nonnulls(lesson_id, lesson_card_id) = 2
        and num_nulls(library_deck_id, library_card_id, personal_deck_id, personal_card_id) = 4
      when 'personal' then num_nonnulls(personal_deck_id, personal_card_id) = 2
        and num_nulls(library_deck_id, library_card_id, lesson_id, lesson_card_id) = 4
      else false
    end
  ),
  -- R-GRIFO-03 e R-GRIFO-14: cartão da biblioteca e de aula não se apagam pela
  -- tela (saem por `retired_at` e por `deleted`), e a marcação os segura como
  -- a revisão segura.
  constraint flashcard_marks_library_card_fk foreign key (library_deck_id, library_card_id)
    references public.library_flashcards(deck_id, id) on delete restrict,
  constraint flashcard_marks_lesson_card_fk foreign key (lesson_card_id, lesson_id)
    references public.theory_lesson_flashcards(id, theory_lesson_id) on delete restrict,
  -- R-GRIFO-03 e R-GRIFO-15: com `student_id` na chave, o cartão pessoal
  -- grifado é do próprio aluno; apagado o cartão, o grifo vai junto.
  constraint flashcard_marks_personal_card_fk foreign key (personal_card_id, personal_deck_id, student_id)
    references public.personal_flashcards(id, deck_id, student_id) on delete cascade
);

-- A leitura é por deck; as três servem também à verificação das FKs.
create index flashcard_marks_library_idx on public.flashcard_marks(library_deck_id, library_card_id);
create index flashcard_marks_lesson_idx on public.flashcard_marks(lesson_id, lesson_card_id);
create index flashcard_marks_personal_idx on public.flashcard_marks(personal_deck_id, personal_card_id);
create index flashcard_marks_student_idx on public.flashcard_marks(student_id);

create trigger flashcard_marks_updated_at before update on public.flashcard_marks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------

alter table public.flashcard_marks enable row level security;
revoke all on public.flashcard_marks from anon, authenticated;
grant all on public.flashcard_marks to service_role;

-- R-GRIFO-10: o cartão, o lado e o dono ficam fora do grant de UPDATE — a RLS
-- decide qual linha, nunca qual coluna. Mudar de cartão é apagar e criar.
grant select, delete on public.flashcard_marks to authenticated;
grant insert (id, student_id, card_kind, library_deck_id, library_card_id, lesson_id, lesson_card_id,
              personal_deck_id, personal_card_id, side, start_offset, end_offset,
              quote, prefix, suffix, style, color)
  on public.flashcard_marks to authenticated;
grant update (start_offset, end_offset, quote, prefix, suffix, style, color)
  on public.flashcard_marks to authenticated;

-- R-GRIFO-07 e R-GRIFO-11: só o próprio aluno lê, também com o acesso vencido.
-- O professor não lê grifo de aluno nenhum.
create policy flashcard_marks_select on public.flashcard_marks
  for select to authenticated using (student_id = (select auth.uid()));

-- R-GRIFO-08 e R-GRIFO-09: criar exige acesso vigente e um cartão vivo que o
-- aluno enxerga. As subconsultas herdam a RLS das tabelas de cartão e de aula;
-- o cartão pessoal é garantido pela FK com `student_id`.
create policy flashcard_marks_insert on public.flashcard_marks
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.has_active_access())
    and case card_kind
      when 'library' then exists (
        select 1 from public.library_flashcards card
         where card.deck_id = flashcard_marks.library_deck_id
           and card.id = flashcard_marks.library_card_id
           and card.retired_at is null)
      when 'lesson' then exists (
        select 1 from public.theory_lesson_flashcards card
          join public.theory_lessons lesson on lesson.id = card.theory_lesson_id
         where card.id = flashcard_marks.lesson_card_id
           and card.theory_lesson_id = flashcard_marks.lesson_id
           and not card.deleted and lesson.active and lesson.published)
      when 'personal' then true
      else false
    end
  );

create policy flashcard_marks_update on public.flashcard_marks
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and (select public.has_active_access()));

-- Apagar também exige acesso vigente (R-GRIFO-08) — ao contrário da lei. Sem
-- `WITH CHECK` no DELETE, quem venceu simplesmente apaga zero linhas.
create policy flashcard_marks_delete on public.flashcard_marks
  for delete to authenticated
  using (student_id = (select auth.uid()) and (select public.has_active_access()));
