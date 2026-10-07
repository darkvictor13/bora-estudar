import assert from "node:assert/strict";
import test from "node:test";

import { questionAccuracy, questionsByDay } from "./question-performance.ts";

test("percentuais de acerto e erro usam o total de questões como denominador", () => {
  assert.deepEqual(questionAccuracy(18, 14), {
    questions: 18, correctAnswers: 14, wrongAnswers: 4,
    correctPercent: 77.8, wrongPercent: 22.2,
  });
  assert.deepEqual(questionAccuracy(0, 0), {
    questions: 0, correctAnswers: 0, wrongAnswers: 0,
    correctPercent: null, wrongPercent: null,
  });
});

test("resultado diário soma acertos e erros das questões e ignora leitura", () => {
  const result = questionsByDay([
    { createdAt: "2026-09-15T12:00:00Z", questions: 10, correctAnswers: 7 },
    { createdAt: "2026-09-15T13:00:00Z", questions: 5, correctAnswers: 4 },
    { createdAt: "2026-09-15T14:00:00Z", questions: 0, correctAnswers: 0 },
  ]);
  assert.deepEqual(result, [{
    date: "2026-09-15", questions: 15, correctAnswers: 11,
    wrongAnswers: 4, score: 73.3,
  }]);
});

test("resultado diário agrupa pelo dia estudado quando o registro o guarda", () => {
  const result = questionsByDay([
    { createdAt: "2026-09-15T12:00:00Z", studiedOn: "2026-09-10", questions: 10, correctAnswers: 8 },
    { createdAt: "2026-09-15T13:00:00Z", studiedOn: null, questions: 5, correctAnswers: 4 },
  ]);
  assert.deepEqual(result.map((day) => [day.date, day.questions]), [
    ["2026-09-15", 5],
    ["2026-09-10", 10],
  ]);
});
