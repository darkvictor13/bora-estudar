import assert from "node:assert/strict";
import test from "node:test";

import { classQuestionDistribution } from "./class-question-distribution.ts";

test("cada aluno pesa uma vez e acertos são ponderados pelas questões que respondeu", () => {
  const result = classQuestionDistribution(["a", "b", "c"], [
    { studentId: "a", questions: 10, correctAnswers: 10 },
    { studentId: "a", questions: 90, correctAnswers: 45 },
    { studentId: "b", questions: 20, correctAnswers: 16 },
    { studentId: "c", questions: 3, correctAnswers: 3 },
    { studentId: "fora-da-turma", questions: 100, correctAnswers: 0 },
  ]);
  assert.deepEqual(result, {
    enrolledStudents: 3, studentsWithActivePlan: 3, studentsWithQuestions: 3, minimumQuestions: 10,
    scores: [55, 80],
  });
});

test("ignora registros de alunos sem planejamento ativo no recorte", () => {
  const result = classQuestionDistribution(
    ["ativo", "arquivado"],
    [
      { studentId: "ativo", questions: 20, correctAnswers: 16 },
      { studentId: "arquivado", questions: 100, correctAnswers: 100 },
    ],
    ["ativo"],
  );

  assert.deepEqual(result, {
    enrolledStudents: 2,
    studentsWithActivePlan: 1,
    studentsWithQuestions: 1,
    minimumQuestions: 10,
    scores: [80],
  });
});
