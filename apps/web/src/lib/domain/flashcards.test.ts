import assert from "node:assert/strict";
import test from "node:test";

import { flashcardDeckProgress, flashcardRecallProbability, flashcardSessionQueue, flashcardStudyStats, isFlashcardDue, readFlashcardCards, scheduleFlashcardReview, validateFlashcardCards } from "./flashcards.ts";

const lessonId = "55555555-5555-4555-8555-000000000002";
const cardId = "88888888-8888-4888-8888-000000000001";
const now = new Date("2026-09-26T12:00:00.000Z");

test("a avaliação agenda a revisão do aluno sem marcar desempenho de questões", () => {
  const first = scheduleFlashcardReview(lessonId, cardId, "good", undefined, now);
  assert.equal(first.intervalMinutes, 10);
  assert.equal(first.dueAt, "2026-09-26T12:10:00.000Z");
  assert.equal(first.state, "learning");
  assert.equal(first.step, 1);
  assert.equal(isFlashcardDue(first, now), false);
  assert.equal(isFlashcardDue(first, new Date("2026-09-26T12:10:00.000Z")), true);

  const second = scheduleFlashcardReview(lessonId, cardId, "good", first, new Date("2026-09-26T12:10:00.000Z"));
  assert.equal(second.state, "review");
  assert.ok(second.intervalMinutes >= 1440);
  assert.equal(second.reviewCount, 2);
  const again = scheduleFlashcardReview(lessonId, cardId, "again", second, new Date(second.dueAt));
  assert.equal(again.state, "relearning");
  assert.equal(again.intervalMinutes, 10);
  assert.equal(again.lapses, 1);
  const recovered = scheduleFlashcardReview(lessonId, cardId, "good", again, new Date(again.dueAt));
  assert.equal(recovered.state, "review");
  assert.ok(recovered.intervalMinutes >= 1440);
});

test("acerto com dúvida cresce menos; lembrança estimada cai com o tempo", () => {
  const first = scheduleFlashcardReview(lessonId, cardId, "good", undefined, now);
  const second = scheduleFlashcardReview(lessonId, cardId, "good", first, new Date(first.dueAt));
  const later = new Date(second.dueAt);
  const hard = scheduleFlashcardReview(lessonId, cardId, "hard", second, later);
  const good = scheduleFlashcardReview(lessonId, cardId, "good", second, later);
  assert.ok(hard.intervalMinutes <= good.intervalMinutes);
  assert.ok(flashcardRecallProbability(second, new Date(second.lastReviewedAt)) > flashcardRecallProbability(second, later));
});

test("cartões inválidos ou duplicados não entram no baralho", () => {
  const valid = { id: cardId, topic: "PRF", front: "Pergunta", back: "Resposta" };
  assert.equal(validateFlashcardCards([valid]), null);
  assert.match(validateFlashcardCards([valid, valid]) ?? "", /identificador único/);
  assert.match(validateFlashcardCards([{ ...valid, back: " " }]) ?? "", /frente e a resposta/);
  assert.deepEqual(readFlashcardCards([{ ...valid, front: " Pergunta " }, { ...valid, id: "inválido" }]), [valid]);
});

test("progresso do deck conta cartões vistos e revisões vencidas da própria aula", () => {
  const secondCardId = "88888888-8888-4888-8888-000000000002";
  const cards = [
    { id: cardId, topic: "Estado", front: "A", back: "B" },
    { id: secondCardId, topic: "Estado", front: "C", back: "D" },
  ];
  const futureReview = scheduleFlashcardReview(lessonId, cardId, "easy", undefined, now);
  const removedCard = scheduleFlashcardReview(lessonId, "88888888-8888-4888-8888-000000000003", "again", undefined, now);
  assert.deepEqual(flashcardDeckProgress(cards, [futureReview, removedCard], now), {
    total: 2,
    studied: 1,
    due: 0,
    progressPercent: 50,
  });
});

test("fila prioriza vencidos, limita novos e identifica cartões consolidados", () => {
  const cards = Array.from({ length: 25 }, (_, index) => ({ id: `88888888-8888-4888-8888-${String(index).padStart(12, "0")}`, topic: "T", front: "A", back: "B" }));
  const due = scheduleFlashcardReview(lessonId, cards[24]!.id, "again", undefined, new Date(now.getTime() - 2 * 60_000));
  assert.equal(flashcardSessionQueue(cards, [due], now).length, 21);
  assert.equal(flashcardSessionQueue(cards, [due], now)[0], cards[24]!.id);
  assert.deepEqual(flashcardStudyStats(cards, [due], now), { fresh: 24, learning: 1, due: 1, consolidated: 0 });
});
