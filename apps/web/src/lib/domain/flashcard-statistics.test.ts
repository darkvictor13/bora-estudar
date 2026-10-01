import assert from "node:assert/strict";
import test from "node:test";

import type { FlashcardReview } from "../api/contract.ts";
import { buildFlashcardStatistics } from "./flashcard-statistics.ts";

const review = (cardId: string, lastGrade: FlashcardReview["lastGrade"], reviewCount: number): FlashcardReview => ({
  lessonId: "deck-1", cardId, lastGrade, reviewCount, dueAt: "2026-10-01T00:00:00.000Z", intervalMinutes: 1440,
  state: "review", step: 0, stability: 2, difficulty: 5, lapses: 0, lastReviewedAt: "2026-09-29T00:00:00.000Z",
});

test("separa fontes e calcula retenção pela última resposta de cada cartão", () => {
  const stats = buildFlashcardStatistics([
    { id: "deck-1", source: "Biblioteca editorial", subject: "Informática", cards: [
      { id: "card-1", topic: "", front: "a", back: "b" },
      { id: "card-2", topic: "", front: "c", back: "d" },
    ], reviews: [review("card-1", "good", 3), review("card-2", "again", 1)] },
    { id: "deck-2", source: "Meus decks", subject: "Informática", cards: [], reviews: [] },
  ], new Date("2026-09-30T00:00:00.000Z"));
  assert.equal(stats.retention, 50);
  assert.equal(stats.totalReviews, 4);
  assert.equal(stats.bySource.find((item) => item.source === "Meus decks")?.decks, 1);
  assert.deepEqual(stats.answers, { correct: 1, doubt: 0, errors: 1 });
});
