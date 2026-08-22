import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextUnanswered, pickQuestions, progressOf } from "./engine.ts";
import type { QuestionAnswer, QuizStart, SeenQuestion } from "@bora/protocol";

const seen = (
  questionId: number,
  extra: Partial<SeenQuestion> = {},
): SeenQuestion => ({
  questionId,
  timesSeen: 1,
  correctAnswers: 1,
  incorrectAnswers: 0,
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const start = (over: Partial<QuizStart> = {}): QuizStart => ({
  returnUrl: "http://x.test/aluno",
  quizSessionId: "s",
  goalId: "g",
  studyPlanId: "p",
  blockId: "b",
  sessionNumber: 1,
  mainTarget: 3,
  availableQuestions: [1, 2, 3, 4, 5],
  history: [],
  historyComplete: true,
  ...over,
});

describe("pickQuestions", () => {
  it("respeita o alvo de principais", () => {
    assert.equal(pickQuestions(start()).length, 3);
    assert.equal(pickQuestions(start({ mainTarget: 10 })).length, 5);
  });

  it("põe as inéditas antes de qualquer vista", () => {
    const fila = pickQuestions(
      start({ mainTarget: 3, history: [seen(1), seen(2)] }),
    );
    assert.deepEqual(fila, [3, 4, 5]);
  });

  it("entre as vistas, prioriza a que tem mais erros", () => {
    const fila = pickQuestions(
      start({
        mainTarget: 2,
        availableQuestions: [1, 2, 3],
        history: [
          seen(1, { incorrectAnswers: 0 }),
          seen(2, { incorrectAnswers: 5 }),
          seen(3, { incorrectAnswers: 2 }),
        ],
      }),
    );
    assert.deepEqual(fila, [2, 3]);
  });

  it("desempata erros iguais pela vista há mais tempo", () => {
    const fila = pickQuestions(
      start({
        mainTarget: 2,
        availableQuestions: [1, 2, 3],
        history: [
          seen(1, { incorrectAnswers: 1, lastSeenAt: "2026-05-01T00:00:00.000Z" }),
          seen(2, { incorrectAnswers: 1, lastSeenAt: "2026-01-01T00:00:00.000Z" }),
          seen(3, { incorrectAnswers: 1, lastSeenAt: "2026-03-01T00:00:00.000Z" }),
        ],
      }),
    );
    assert.deepEqual(fila, [2, 3]);
  });

  it("é determinística: mesma entrada, mesma fila", () => {
    const entrada = start({
      mainTarget: 4,
      availableQuestions: [9, 4, 7, 1, 3],
      history: [seen(4), seen(7)],
    });
    assert.deepEqual(pickQuestions(entrada), pickQuestions(entrada));
  });

  it("não quebra com bloco menor que o alvo", () => {
    assert.deepEqual(pickQuestions(start({ availableQuestions: [7], mainTarget: 15 })), [7]);
  });
});

const answer = (questionId: number, outcome: "correct" | "incorrect"): QuestionAnswer => ({
  questionId,
  executionOrder: questionId,
  round: 0,
  phase: "main",
  outcome,
  topic: null,
  sourceQuestionId: null,
  answeredAt: "2026-08-22T10:00:00.000Z",
});

describe("nextUnanswered", () => {
  it("devolve a primeira sem resposta, respeitando a ordem da fila", () => {
    assert.equal(nextUnanswered([5, 6, 7], { "5": answer(5, "correct") }), 6);
  });

  it("devolve null quando tudo foi respondido", () => {
    assert.equal(
      nextUnanswered([5, 6], { "5": answer(5, "correct"), "6": answer(6, "incorrect") }),
      null,
    );
  });
});

describe("progressOf", () => {
  it("conta acertos e erros", () => {
    const p = progressOf([1, 2, 3], {
      "1": answer(1, "correct"),
      "2": answer(2, "incorrect"),
    });
    assert.deepEqual(p, { answered: 2, total: 3, correct: 1, incorrect: 1 });
  });
});
