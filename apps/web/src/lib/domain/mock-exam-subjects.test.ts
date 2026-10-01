import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMockExamSubjects } from "./mock-exam-subjects.ts";

test("ranking por matéria usa apenas lançamentos, preserva empates e compara colegas sem incluir o próprio aluno", () => {
  const analyses = analyzeMockExamSubjects(
    [{ examId: "e", subject: "Português", questionCount: 10 }],
    [
      { studentId: "a", subject: "Português", correctAnswers: 7 },
      { studentId: "b", subject: "Português", correctAnswers: 8 },
      { studentId: "c", subject: "Português", correctAnswers: 8 },
      { studentId: "d", subject: "Português", correctAnswers: 0 },
    ],
    [{ studentId: "a", studentName: "Ana", score: 70 }, { studentId: "b", studentName: "Bruno", score: 80 },
      { studentId: "c", studentName: "Caio", score: 80 }, { studentId: "d", studentName: "Dora", score: null }],
    "a",
  );
  assert.deepEqual(analyses[0]?.ranking.map((row) => [row.studentId, row.rank]), [["b", 1], ["c", 1], ["a", 3]]);
  assert.deepEqual(analyses[0]?.mine, { correctAnswers: 7, percent: 70, rank: 3, peerAverage: 80, gap: -10 });
});
