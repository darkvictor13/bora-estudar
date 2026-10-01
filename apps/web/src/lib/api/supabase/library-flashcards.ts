import { libraryDeck, libraryReviewDeckIds, libraryReviewSources, normalizeLibraryReviews } from "@/lib/domain/library-flashcards";
import { scheduleFlashcardReview } from "@/lib/domain/flashcards";
import { supabase } from "@/lib/supabase/client";

import type { FlashcardGrade, FlashcardState, GradeLibraryFlashcardInput, LibraryFlashcardReview, Result } from "../contract.ts";
import { done, failure, throwDb, translateDbError } from "./errors.ts";
import { reviewValues, writeReview } from "./flashcards.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

const COLUMNS = "deck_id,card_id,due_at,interval_minutes,review_count,last_grade,state,step,stability,difficulty,lapses,last_reviewed_at";
interface Row {
  deck_id: string;
  card_id: string;
  due_at: string;
  interval_minutes: number;
  review_count: number;
  last_grade: string;
  state: string;
  step: number;
  stability: number;
  difficulty: number;
  lapses: number;
  last_reviewed_at: string;
}

function toReview(row: Row): LibraryFlashcardReview {
  return { deckId: row.deck_id, cardId: row.card_id, dueAt: row.due_at, intervalMinutes: row.interval_minutes, reviewCount: row.review_count, lastGrade: row.last_grade as FlashcardGrade, state: row.state as FlashcardState, step: row.step, stability: row.stability, difficulty: row.difficulty, lapses: row.lapses, lastReviewedAt: row.last_reviewed_at };
}

export async function loadLibraryFlashcardReviews(deckIds: readonly string[]): Promise<readonly LibraryFlashcardReview[]> {
  const ids = libraryReviewDeckIds(deckIds);
  if (ids.length === 0) return [];
  const session = await requireSession();
  const result: LibraryFlashcardReview[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("library_flashcard_reviews")
      .select(COLUMNS).eq("student_id", session.profileId).in("deck_id", ids)
      .order("deck_id").order("card_id").range(offset, offset + 999);
    if (error) throwDb(error);
    const rows = (data ?? []) as Row[];
    result.push(...rows.map(toReview));
    if (rows.length < 1000) break;
  }
  return normalizeLibraryReviews(result).filter((review) => deckIds.includes(review.deckId));
}

export function gradeLibraryFlashcard(input: GradeLibraryFlashcardInput): Promise<Result<LibraryFlashcardReview>> {
  return once(input.requestId, async () => {
    if (!libraryDeck(input.deckId)?.cards.some((card) => card.id === input.cardId)) {
      return failure<LibraryFlashcardReview>({ code: "not_found", message: "Cartão não encontrado neste deck." });
    }
    const session = await requireSession();
    const sources = libraryReviewSources(input.deckId, input.cardId);
    const { data: previous, error: readError } = await supabase.from("library_flashcard_reviews")
      .select(COLUMNS).eq("student_id", session.profileId).in("deck_id", [...new Set(sources.map((source) => source.deckId))]).in("card_id", sources.map((source) => source.cardId));
    if (readError) return failure<LibraryFlashcardReview>(translateDbError(readError));
    const previousReview = normalizeLibraryReviews(((previous ?? []) as Row[]).map(toReview)).find((review) => review.deckId === input.deckId && review.cardId === input.cardId);
    const next = scheduleFlashcardReview(input.deckId, input.cardId, input.grade, previousReview ? { ...previousReview, lessonId: input.deckId } : undefined);
    // A leitura acima traz também as fontes antigas do mesmo cartão; o que
    // decide entre INSERT e UPDATE é haver linha neste deck, com este id.
    const existed = ((previous ?? []) as Row[]).some((row) => row.deck_id === input.deckId && row.card_id === input.cardId);
    const values = reviewValues(next);
    const { data, error } = await writeReview(
      existed,
      () => supabase.from("library_flashcard_reviews")
        .insert({ student_id: session.profileId, deck_id: input.deckId, card_id: input.cardId, ...values })
        .select(COLUMNS).single(),
      () => supabase.from("library_flashcard_reviews").update(values)
        .eq("student_id", session.profileId).eq("deck_id", input.deckId).eq("card_id", input.cardId)
        .select(COLUMNS).single(),
    );
    if (error) return failure<LibraryFlashcardReview>(translateDbError(error));
    return done(toReview(data as Row));
  });
}
