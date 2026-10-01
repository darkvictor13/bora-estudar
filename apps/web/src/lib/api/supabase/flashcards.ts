import { supabase } from "@/lib/supabase/client";
import { scheduleFlashcardReview } from "@/lib/domain/flashcards";

import type { PostgrestError } from "@supabase/supabase-js";

import type { FlashcardCard, FlashcardGrade, FlashcardReview, FlashcardState, GradeFlashcardInput, Result, Uuid } from "../contract.ts";
import { done, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

/** A relação embutida que traz os cartões junto com a aula. */
export const LESSON_CARD_COLUMNS = "theory_lesson_flashcards(id,position,topic,front,back,deleted)";

export interface LessonCardRow {
  id: string;
  position: number;
  topic: string;
  front: string;
  back: string;
  deleted: boolean;
}

/** Os cartões vivos da aula, na ordem do professor. O removido fica de fora. */
export function toLessonCards(rows: readonly LessonCardRow[] | null): readonly FlashcardCard[] {
  return (rows ?? []).filter((row) => !row.deleted)
    .sort((a, b) => a.position - b.position)
    .map((row) => ({ id: row.id, topic: row.topic, front: row.front, back: row.back }));
}

/**
 * Grava a lista de cartões que a tela mandou, por diferença: cria o novo,
 * atualiza o que mudou e MARCA como removido o que saiu da lista.
 *
 * Por diferença, e não "apaga tudo e insere de novo", porque a revisão do
 * aluno aponta para o id do cartão — e não `upsert`, porque ele mandaria
 * `theory_lesson_id` e `teacher_id`, que ficam fora do grant de UPDATE. Repetir
 * a chamada com a mesma lista não muda nada, o que a torna segura a retentativa.
 */
export async function saveLessonCards(
  lessonId: Uuid,
  teacherId: Uuid,
  cards: readonly FlashcardCard[],
): Promise<PostgrestError | null> {
  const { data, error } = await supabase
    .from("theory_lesson_flashcards")
    .select("id,position,topic,front,back,deleted")
    .eq("theory_lesson_id", lessonId);
  if (error) return error;
  const existing = new Map((data ?? []).map((row) => [row.id, row]));
  const wanted = cards.map((card, index) => ({ ...card, position: index + 1 }));

  const fresh = wanted.filter((card) => !existing.has(card.id));
  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from("theory_lesson_flashcards").insert(
      fresh.map((card) => ({ id: card.id, theory_lesson_id: lessonId, teacher_id: teacherId,
        position: card.position, topic: card.topic, front: card.front, back: card.back })),
    );
    if (insertError) return insertError;
  }

  for (const card of wanted) {
    const before = existing.get(card.id);
    if (!before || (!before.deleted && before.position === card.position && before.topic === card.topic
      && before.front === card.front && before.back === card.back)) continue;
    const { error: updateError } = await supabase.from("theory_lesson_flashcards")
      .update({ position: card.position, topic: card.topic, front: card.front, back: card.back, deleted: false })
      .eq("id", card.id);
    if (updateError) return updateError;
  }

  const kept = new Set(wanted.map((card) => card.id));
  const removed = [...existing.values()].filter((row) => !row.deleted && !kept.has(row.id)).map((row) => row.id);
  if (removed.length > 0) {
    const { error: removeError } = await supabase.from("theory_lesson_flashcards")
      .update({ deleted: true }).in("id", removed);
    if (removeError) return removeError;
  }
  return null;
}

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

/**
 * As colunas que uma revisão nova grava — exatamente as que o grant de UPDATE
 * concede nas três tabelas de revisão (aula, biblioteca e deck pessoal).
 */
export function reviewValues(next: {
  dueAt: string; intervalMinutes: number; reviewCount: number; lastGrade: FlashcardGrade; state: FlashcardState;
  step: number; stability: number; difficulty: number; lapses: number; lastReviewedAt: string;
}) {
  return {
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
  };
}

/**
 * Grava a revisão SEM `upsert`, pelo mesmo motivo de `theory_progress`: o
 * `ON CONFLICT DO UPDATE` do PostgREST manda TODAS as colunas do payload,
 * inclusive as de identidade (`student_id`, o deck ou a aula, `card_id`), que
 * ficam fora do grant de UPDATE — e o Postgres recusa com `42501` mesmo quando
 * os valores são idênticos. Com `upsert`, nenhuma revisão era gravada.
 *
 * INSERT quando não havia linha, UPDATE quando havia. Se outra aba inseriu
 * entre a leitura e a escrita, o INSERT bate na PK e a escrita vira UPDATE.
 */
export async function writeReview(
  existed: boolean,
  insert: () => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  update: () => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  if (existed) return update();
  const inserted = await insert();
  return inserted.error?.code === "23505" ? update() : inserted;
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
    const values = reviewValues(next);
    const { data, error } = await writeReview(
      previous !== null,
      () => supabase.from("flashcard_reviews")
        .insert({ student_id: session.profileId, theory_lesson_id: input.lessonId, card_id: input.cardId, ...values })
        .select(REVIEW_COLUMNS).single(),
      () => supabase.from("flashcard_reviews").update(values)
        .eq("student_id", session.profileId).eq("theory_lesson_id", input.lessonId).eq("card_id", input.cardId)
        .select(REVIEW_COLUMNS).single(),
    );
    if (error) return failure<FlashcardReview>(translateDbError(error));
    return done(toReview(data as ReviewRow));
  });
}
