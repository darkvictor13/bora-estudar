import { diffFlashcardMarks, libraryMarkDeckIds, resolveFlashcardMarkAliases } from "@/lib/domain/flashcard-markings";
import { supabase } from "@/lib/supabase/client";

import type { Result } from "../contract.ts";
import type { FlashcardCardKind, FlashcardCardRef, FlashcardDeckRef, FlashcardMark, FlashcardSide, SaveFlashcardMarksInput } from "../flashcard-marks.ts";
import type { LawMarkColor, LawMarkStyle } from "../laws.ts";
import { done, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { loadAliases } from "./library-flashcards.ts";
import { requireSession } from "./session.ts";

// O grifo nos flashcards (spec 42) mora em `flashcard_marks`, escrito direto
// com RLS como `law_marks`. O cartão é dito por `card_kind` mais o par de
// colunas do tipo; as outras duas ficam nulas, e é a CHECK que garante.

interface MarkRow {
  id: string; card_kind: FlashcardCardKind;
  library_deck_id: string | null; library_card_id: string | null;
  lesson_id: string | null; lesson_card_id: string | null;
  personal_deck_id: string | null; personal_card_id: string | null;
  side: FlashcardSide; start_offset: number; end_offset: number;
  style: LawMarkStyle; color: LawMarkColor; quote: string; prefix: string; suffix: string;
}

const MARK_COLUMNS = "id,card_kind,library_deck_id,library_card_id,lesson_id,lesson_card_id,personal_deck_id,personal_card_id,side,start_offset,end_offset,style,color,quote,prefix,suffix";

/** As colunas de referência de cada tipo de cartão. */
const REF_COLUMNS = {
  library: { deck: "library_deck_id", card: "library_card_id" },
  lesson: { deck: "lesson_id", card: "lesson_card_id" },
  personal: { deck: "personal_deck_id", card: "personal_card_id" },
} as const;

function cardOf(row: MarkRow): FlashcardCardRef {
  const columns = REF_COLUMNS[row.card_kind];
  return { kind: row.card_kind, deckId: row[columns.deck] ?? "", cardId: row[columns.card] ?? "" };
}

function refValues(card: FlashcardCardRef) {
  const columns = REF_COLUMNS[card.kind];
  return { card_kind: card.kind, [columns.deck]: card.deckId, [columns.card]: card.cardId };
}

function markValues(mark: FlashcardMark) {
  return {
    start_offset: mark.start, end_offset: mark.end,
    style: mark.style, color: mark.color, quote: mark.quote, prefix: mark.prefix, suffix: mark.suffix,
  };
}

export async function loadFlashcardMarks(deck: FlashcardDeckRef): Promise<readonly FlashcardMark[]> {
  const session = await requireSession();
  const columns = REF_COLUMNS[deck.kind];
  // Da biblioteca, também os decks de onde vieram os cartões deste por alias
  // (R-GRIFO-16): o grifo gravado no par antigo aparece no cartão novo.
  const aliases = deck.kind === "library" ? await loadAliases() : [];
  const deckIds = deck.kind === "library" ? libraryMarkDeckIds(deck.deckId, aliases) : [deck.deckId];
  const { data, error } = await supabase.from("flashcard_marks").select(MARK_COLUMNS)
    .eq("student_id", session.profileId).eq("card_kind", deck.kind).in(columns.deck, deckIds);
  if (error) throwDb(error);
  const marks = ((data ?? []) as MarkRow[]).map((row): FlashcardMark => ({
    id: row.id, card: cardOf(row), side: row.side, start: row.start_offset, end: row.end_offset,
    style: row.style, color: row.color, quote: row.quote, prefix: row.prefix, suffix: row.suffix,
  }));
  return resolveFlashcardMarkAliases(marks, aliases).filter((mark) => mark.card.deckId === deck.deckId);
}

/**
 * Grava a diferença entre o antes e o depois, por id (R-GRIFO-17). Repetir é
 * inofensivo — e é a PK `flashcard_marks_pkey` que garante: criar é `on
 * conflict do nothing` com o id que o navegador gerou, alterar grava valores
 * absolutos e apagar é por id. Nenhum dos dois toca o cartão da linha, e por
 * isso a marcação que chegou resolvida por alias se grava sem desfazê-lo.
 */
export function saveFlashcardMarks(input: SaveFlashcardMarksInput): Promise<Result<null>> {
  return once(input.requestId, async () => {
    const session = await requireSession();
    const diff = diffFlashcardMarks(input.previous, input.next);
    if (diff.remove.length > 0) {
      const { error } = await supabase.from("flashcard_marks").delete()
        .eq("student_id", session.profileId).in("id", diff.remove);
      if (error) return failure<null>(translateDbError(error));
    }
    if (diff.insert.length > 0) {
      const { error } = await supabase.from("flashcard_marks").upsert(
        diff.insert.map((mark) => ({ id: mark.id, student_id: session.profileId, ...refValues(mark.card), side: mark.side, ...markValues(mark) })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) return failure<null>(translateDbError(error));
    }
    for (const mark of diff.update) {
      const { error } = await supabase.from("flashcard_marks").update(markValues(mark))
        .eq("student_id", session.profileId).eq("id", mark.id);
      if (error) return failure<null>(translateDbError(error));
    }
    return done(null);
  });
}
