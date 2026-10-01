import { scheduleFlashcardReview } from "@/lib/domain/flashcards";
import { supabase } from "@/lib/supabase/client";

import type {
  CreatePersonalFlashcardDeckInput,
  CreatePersonalFlashcardInput,
  FlashcardCard,
  FlashcardGrade,
  FlashcardState,
  GradePersonalFlashcardInput,
  PersonalFlashcardDeck,
  PersonalFlashcardReview,
  Result,
} from "../contract.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { reviewValues, writeReview } from "./flashcards.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

const REVIEW_COLUMNS = "deck_id,card_id,due_at,interval_minutes,review_count,last_grade,state,step,stability,difficulty,lapses,last_reviewed_at";

interface ReviewRow {
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

function toReview(row: ReviewRow): PersonalFlashcardReview {
  return {
    deckId: row.deck_id,
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

export async function listPersonalFlashcardDecks(): Promise<readonly PersonalFlashcardDeck[]> {
  const session = await requireSession();
  const [{ data: decks, error: deckError }, { data: cards, error: cardError }] = await Promise.all([
    supabase.from("personal_flashcard_decks").select("id,subject,title,created_at,updated_at").eq("student_id", session.profileId).order("updated_at", { ascending: false }),
    supabase.from("personal_flashcards").select("id,deck_id,topic,front,back").eq("student_id", session.profileId).order("created_at"),
  ]);
  if (deckError) throwDb(deckError);
  if (cardError) throwDb(cardError);
  return (decks ?? []).map((deck) => ({
    id: deck.id,
    subject: deck.subject,
    title: deck.title,
    createdAt: deck.created_at,
    updatedAt: deck.updated_at,
    cards: (cards ?? []).filter((card) => card.deck_id === deck.id).map((card) => ({ id: card.id, topic: card.topic, front: card.front, back: card.back })),
  }));
}

export function createPersonalFlashcardDeck(input: CreatePersonalFlashcardDeckInput): Promise<Result<PersonalFlashcardDeck>> {
  return once(input.requestId, async () => {
    const subject = input.subject.trim();
    const title = input.title.trim();
    if (subject.length < 2) return fail("validation", "Informe a disciplina.", "subject");
    if (title.length < 2) return fail("validation", "Informe o assunto do deck.", "title");
    const session = await requireSession();
    const { data, error } = await supabase.from("personal_flashcard_decks")
      .insert({ id: input.id, student_id: session.profileId, subject, title })
      .select("id,subject,title,created_at,updated_at").single();
    if (error) return failure(translateDbError(error));
    return done({ id: data.id, subject: data.subject, title: data.title, cards: [], createdAt: data.created_at, updatedAt: data.updated_at });
  });
}

export function createPersonalFlashcard(input: CreatePersonalFlashcardInput): Promise<Result<FlashcardCard>> {
  return once(input.requestId, async () => {
    const front = input.front.trim();
    const back = input.back.trim();
    const topic = input.topic.trim();
    if (!front) return fail("validation", "Escreva a pergunta ou afirmação.", "front");
    if (!back) return fail("validation", "Escreva a resposta.", "back");
    const session = await requireSession();
    const { data, error } = await supabase.from("personal_flashcards")
      .insert({ id: input.id, deck_id: input.deckId, student_id: session.profileId, topic, front, back })
      .select("id,topic,front,back").single();
    if (error) return failure(translateDbError(error));
    return done({ id: data.id, topic: data.topic, front: data.front, back: data.back });
  });
}

export async function loadPersonalFlashcardReviews(deckIds: readonly string[]): Promise<readonly PersonalFlashcardReview[]> {
  if (deckIds.length === 0) return [];
  const session = await requireSession();
  const { data, error } = await supabase.from("personal_flashcard_reviews")
    .select(REVIEW_COLUMNS).eq("student_id", session.profileId).in("deck_id", [...deckIds]).order("deck_id").order("card_id");
  if (error) throwDb(error);
  return ((data ?? []) as ReviewRow[]).map(toReview);
}

export function gradePersonalFlashcard(input: GradePersonalFlashcardInput): Promise<Result<PersonalFlashcardReview>> {
  return once(input.requestId, async () => {
    const session = await requireSession();
    const { data: card, error: cardError } = await supabase.from("personal_flashcards")
      .select("id").eq("student_id", session.profileId).eq("deck_id", input.deckId).eq("id", input.cardId).maybeSingle();
    if (cardError) return failure(translateDbError(cardError));
    if (!card) return fail("not_found", "Cartão não encontrado neste deck.");

    const { data: previous, error: readError } = await supabase.from("personal_flashcard_reviews")
      .select(REVIEW_COLUMNS).eq("student_id", session.profileId).eq("deck_id", input.deckId).eq("card_id", input.cardId).maybeSingle();
    if (readError) return failure(translateDbError(readError));
    const previousReview = previous ? toReview(previous as ReviewRow) : undefined;
    const next = scheduleFlashcardReview(input.deckId, input.cardId, input.grade, previousReview ? { ...previousReview, lessonId: input.deckId } : undefined);
    const values = reviewValues(next);
    const { data, error } = await writeReview(
      previous !== null,
      () => supabase.from("personal_flashcard_reviews")
        .insert({ student_id: session.profileId, deck_id: input.deckId, card_id: input.cardId, ...values })
        .select(REVIEW_COLUMNS).single(),
      () => supabase.from("personal_flashcard_reviews").update(values)
        .eq("student_id", session.profileId).eq("deck_id", input.deckId).eq("card_id", input.cardId)
        .select(REVIEW_COLUMNS).single(),
    );
    if (error) return failure(translateDbError(error));
    return done(toReview(data as ReviewRow));
  });
}
