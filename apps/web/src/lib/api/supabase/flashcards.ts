import { supabase } from "@/lib/supabase/client";
import { scheduleFlashcardReview } from "@/lib/domain/flashcards";

import type { FlashcardGrade, FlashcardReview, FlashcardState, GradeFlashcardInput, Result, Uuid } from "../contract.ts";
import { done, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

const REVIEW_COLUMNS = "theory_lesson_id,card_id,due_at,interval_minutes,review_count,last_grade,state,step,stability,difficulty,lapses,last_reviewed_at";

interface ReviewRow {
  theory_lesson_id: string;
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

function toReview(row: ReviewRow): FlashcardReview {
  return {
    lessonId: row.theory_lesson_id,
    cardId: row.card_id,
    dueAt: row.due_at,
    intervalMinutes: row.interval_minutes,
    reviewCount: row.review_count,
    lastGrade: row.last_grade as FlashcardGrade,
    state: row.state as FlashcardState,
    step: row.step,
    stability: row.stability,
    difficulty: row.difficulty,
    lapses: row.lapses,
    lastReviewedAt: row.last_reviewed_at,
  };
}

export async function loadFlashcardReviews(lessonId: Uuid): Promise<readonly FlashcardReview[]> {
  return loadFlashcardReviewsForLessons([lessonId]);
}

export async function loadFlashcardReviewsForLessons(lessonIds: readonly Uuid[]): Promise<readonly FlashcardReview[]> {
  const ids = [...new Set(lessonIds)];
  if (ids.length === 0) return [];
  const session = await requireSession();
  const reviews: FlashcardReview[] = [];
  const pageSize = 1000;
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("flashcard_reviews")
        .select(REVIEW_COLUMNS)
        .eq("student_id", session.profileId)
        .in("theory_lesson_id", batch)
        .order("theory_lesson_id")
        .order("card_id")
        .range(offset, offset + pageSize - 1);
      if (error) throwDb(error);
      const rows = (data ?? []) as ReviewRow[];
      reviews.push(...rows.map(toReview));
      if (rows.length < pageSize) break;
    }
  }
  return reviews;
}

export function gradeFlashcard(input: GradeFlashcardInput): Promise<Result<FlashcardReview>> {
  return once(input.requestId, async () => {
    const session = await requireSession();
    const { data: previous, error: readError } = await supabase
      .from("flashcard_reviews")
      .select(REVIEW_COLUMNS)
      .eq("student_id", session.profileId)
      .eq("theory_lesson_id", input.lessonId)
      .eq("card_id", input.cardId)
      .maybeSingle();
    if (readError) return failure<FlashcardReview>(translateDbError(readError));

    const next = scheduleFlashcardReview(input.lessonId, input.cardId, input.grade, previous ? toReview(previous as ReviewRow) : undefined);
    const { data, error } = await supabase
      .from("flashcard_reviews")
      .upsert({
        student_id: session.profileId,
        theory_lesson_id: input.lessonId,
        card_id: input.cardId,
        due_at: next.dueAt,
        interval_minutes: next.intervalMinutes,
        review_count: next.reviewCount,
        last_grade: next.lastGrade,
        state: next.state,
        step: next.step,
        stability: next.stability,
        difficulty: next.difficulty,
        lapses: next.lapses,
        last_reviewed_at: next.lastReviewedAt,
      }, { onConflict: "student_id,theory_lesson_id,card_id" })
      .select(REVIEW_COLUMNS)
      .single();
    if (error) return failure<FlashcardReview>(translateDbError(error));
    return done(toReview(data as ReviewRow));
  });
}
