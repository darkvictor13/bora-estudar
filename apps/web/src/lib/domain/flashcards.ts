import type { FlashcardCard, FlashcardGrade, FlashcardReview, FlashcardState } from "../api/contract.ts";

const CARD_LIMIT = 200;
const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
const DAY = DAY_MINUTES * MINUTE;
const MAX_DAYS = 3650;
export const FLASHCARD_TARGET_RETENTION = 0.9;

/** Parâmetros padrão do FSRS-6 (sem ajuste individual por histórico). */
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542] as const;
const GRADE_VALUE: Record<FlashcardGrade, number> = { again: 1, hard: 2, good: 3, easy: 4 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const initialDifficulty = (grade: number) => clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
const nextDifficulty = (difficulty: number, grade: number) => {
  const damped = difficulty - W[6] * (grade - 3) * (10 - difficulty) / 9;
  return clamp(W[7] * initialDifficulty(4) + (1 - W[7]) * damped, 1, 10);
};

/** Probabilidade estimada de lembrar agora; estabilidade é o intervalo de 90%. */
export function flashcardRecallProbability(review: FlashcardReview, now = new Date()): number {
  if (review.state !== "review" || review.stability <= 0) return 0;
  const days = Math.max(0, (now.getTime() - Date.parse(review.lastReviewedAt)) / DAY);
  const factor = Math.pow(FLASHCARD_TARGET_RETENTION, -1 / W[20]) - 1;
  return clamp(Math.pow(1 + factor * days / review.stability, -W[20]), 0, 1);
}

export function flashcardStudyStats(cards: readonly Pick<FlashcardCard, "id">[], reviews: readonly FlashcardReview[], now = new Date()) {
  const byCard = new Map(reviews.map((review) => [review.cardId, review]));
  let fresh = 0; let learning = 0; let due = 0; let consolidated = 0;
  for (const card of cards) {
    const review = byCard.get(card.id);
    if (!review) { fresh++; continue; }
    if (review.state !== "review") learning++;
    if (isFlashcardDue(review, now)) due++;
    if (review.state === "review" && review.stability >= 21 && flashcardRecallProbability(review, now) >= 0.85) consolidated++;
  }
  return { fresh, learning, due, consolidated };
}

/** JSON do banco é tratado como entrada não confiável antes de chegar à interface. */
export function readFlashcardCards(raw: unknown): readonly FlashcardCard[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const cards: FlashcardCard[] = [];
  for (const value of raw.slice(0, CARD_LIMIT)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.front !== "string" || typeof item.back !== "string") continue;
    const front = item.front.trim();
    const back = item.back.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) || !front || !back || ids.has(item.id)) continue;
    ids.add(item.id);
    cards.push({ id: item.id, topic: typeof item.topic === "string" ? item.topic.trim() : "", front, back });
  }
  return cards;
}

export function validateFlashcardCards(cards: readonly FlashcardCard[]): string | null {
  if (cards.length > CARD_LIMIT) return `A aula aceita até ${CARD_LIMIT} cartões.`;
  const ids = new Set<string>();
  for (const card of cards) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(card.id) || ids.has(card.id)) return "Cada cartão precisa de um identificador único.";
    ids.add(card.id);
    if (!card.front.trim() || !card.back.trim()) return "Preencha a frente e a resposta de todos os cartões.";
    if (card.front.length > 2000 || card.back.length > 4000 || card.topic.length > 160) return "Um cartão ultrapassou o limite de texto.";
  }
  return null;
}

export function scheduleFlashcardReview(
  lessonId: string,
  cardId: string,
  grade: FlashcardGrade,
  previous: FlashcardReview | undefined,
  now = new Date(),
): FlashcardReview {
  const rating = GRADE_VALUE[grade];
  const oldStability = previous?.stability ?? 0;
  const difficulty = previous ? nextDifficulty(previous.difficulty, rating) : initialDifficulty(rating);
  const elapsedDays = previous ? Math.max(0, (now.getTime() - Date.parse(previous.lastReviewedAt)) / DAY) : 0;
  const recall = previous?.state === "review" ? flashcardRecallProbability(previous, now) : 1;
  let stability = previous ? oldStability : W[rating - 1]!;
  if (previous?.state === "review") {
    if (grade === "again") {
      stability = W[11] * Math.pow(difficulty, -W[12]) * (Math.pow(oldStability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - recall));
    } else if (elapsedDays < 1) {
      stability = oldStability * Math.exp(W[17] * (rating - 3 + W[18])) * Math.pow(oldStability, -W[19]);
    } else {
      const gradeFactor = grade === "hard" ? W[15] : grade === "easy" ? W[16] : 1;
      stability = oldStability * (1 + Math.exp(W[8]) * (11 - difficulty) * Math.pow(oldStability, -W[9]) * (Math.exp(W[10] * (1 - recall)) - 1) * gradeFactor);
    }
  } else if (previous) {
    stability = oldStability * Math.exp(W[17] * (rating - 3 + W[18])) * Math.pow(oldStability, -W[19]);
    if (grade === "again") stability = Math.min(stability, oldStability);
  }
  if (previous && grade !== "again") stability = Math.max(oldStability, stability);
  stability = clamp(stability, 0.01, MAX_DAYS);

  let state: FlashcardState;
  let step = 0;
  let intervalMinutes: number;
  if (grade === "again") {
    state = previous?.state === "review" || previous?.state === "relearning" ? "relearning" : "learning";
    intervalMinutes = state === "relearning" ? 10 : 1;
  } else if (grade === "hard" && previous?.state !== "review") {
    state = previous?.state ?? "learning";
    step = previous?.step ?? 0;
    intervalMinutes = step === 0 && state === "learning" ? 6 : 10;
  } else if (grade === "good" && (!previous || previous.state === "learning") && (previous?.step ?? 0) === 0) {
    state = "learning";
    step = 1;
    intervalMinutes = 10;
  } else {
    state = "review";
    intervalMinutes = clamp(Math.round(stability * DAY_MINUTES), DAY_MINUTES, MAX_DAYS * DAY_MINUTES);
  }
  return {
    lessonId,
    cardId,
    dueAt: new Date(now.getTime() + intervalMinutes * MINUTE).toISOString(),
    intervalMinutes,
    reviewCount: (previous?.reviewCount ?? 0) + 1,
    lastGrade: grade,
    state,
    step,
    stability,
    difficulty,
    lapses: (previous?.lapses ?? 0) + (grade === "again" && previous?.state === "review" ? 1 : 0),
    lastReviewedAt: now.toISOString(),
  };
}

export function isFlashcardDue(review: FlashcardReview | undefined, now = new Date()): boolean {
  return !review || Date.parse(review.dueAt) <= now.getTime();
}

/** Revisões vencidas primeiro; depois um lote limitado de cartões novos. */
export function flashcardSessionQueue(cards: readonly Pick<FlashcardCard, "id">[], reviews: readonly FlashcardReview[], now = new Date(), newLimit = 20): string[] {
  const byCard = new Map(reviews.map((review) => [review.cardId, review]));
  const due = cards.filter((card) => {
    const review = byCard.get(card.id);
    return review && isFlashcardDue(review, now);
  }).sort((a, b) => Date.parse(byCard.get(a.id)!.dueAt) - Date.parse(byCard.get(b.id)!.dueAt));
  const fresh = cards.filter((card) => !byCard.has(card.id)).slice(0, newLimit);
  return [...due, ...fresh].map((card) => card.id);
}

export function flashcardDeckProgress(
  cards: readonly Pick<FlashcardCard, "id">[],
  reviews: readonly FlashcardReview[],
  now = new Date(),
): { total: number; studied: number; due: number; progressPercent: number } {
  const byCard = new Map(reviews.map((review) => [review.cardId, review]));
  const studied = cards.filter((card) => byCard.has(card.id)).length;
  const due = cards.filter((card) => {
    const review = byCard.get(card.id);
    return review && isFlashcardDue(review, now);
  }).length;
  return {
    total: cards.length,
    studied,
    due,
    progressPercent: cards.length ? Math.round(studied / cards.length * 100) : 0,
  };
}

export function flashcardIntervalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (24 * 60))} dias`;
}
