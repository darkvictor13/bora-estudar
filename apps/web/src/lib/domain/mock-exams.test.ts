import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMockExamStatistics, rankMockExam, validScore, validateMockExam } from "./mock-exams.ts";

test("ranking preserva empate, pula colocação e inclui zero sem incluir ausente", () => {
  const rows = [
    { studentId: "b", studentName: "Bruno", score: 80 },
    { studentId: "a", studentName: "Ana", score: 80 },
    { studentId: "c", studentName: "Carla", score: 0 },
    { studentId: "d", studentName: "Davi", score: null },
  ];
  assert.deepEqual(rankMockExam(rows).map((r) => [r.studentId, r.rank]), [["a", 1], ["b", 1], ["c", 3]]);
  assert.equal(rows[0]?.studentId, "b", "não altera a lista de origem");
});

test("notas aceitam limites e recusam decimais excedentes e valores não finitos", () => {
  assert.equal(validScore(0, 100), true);
  assert.equal(validScore(100, 100), true);
  assert.equal(validScore(89.45, 100), true);
  for (const value of [-1, 101, NaN, Infinity, 1.234]) assert.equal(validScore(value, 100), false);
});

test("cadastro recusa data impossível e pontuação máxima inválida", () => {
  const input = { id: "exam", classId: "class", title: "Simulado", examDate: "2026-09-24", maxScore: 100 };
  assert.equal(validateMockExam(input), null);
  assert.ok(validateMockExam({ ...input, examDate: "2026-02-30" }));
  assert.ok(validateMockExam({ ...input, maxScore: 0 }));
  assert.ok(validateMockExam({ ...input, title: " " }));
});

test("estatísticas do simulado calculam média, mediana e percentil do aluno", () => {
  const rows = [
    { studentId: "a", studentName: "Ana", score: 50 },
    { studentId: "b", studentName: "Bruno", score: 70 },
    { studentId: "c", studentName: "Carla", score: 80 },
    { studentId: "d", studentName: "Davi", score: 90 },
    { studentId: "e", studentName: "Eva", score: null },
  ];
  assert.deepEqual(calculateMockExamStatistics(rows, 100, "c"), {
    participants: 4,
    averageScore: 72.5,
    averagePercent: 72.5,
    medianScore: 75,
    medianPercent: 75,
    highestScore: 90,
    highestPercent: 90,
    percentages: [50, 70, 80, 90],
    mine: { score: 80, percent: 80, rank: 2, percentile: 50 },
  });
  assert.equal(calculateMockExamStatistics(rows, 0), null);
});
