import type { ClassQuestionDistribution } from "../api/contract.ts";
import { questionAccuracy } from "./question-performance.ts";

interface QuestionRow {
  readonly studentId: string;
  readonly questions: number;
  readonly correctAnswers: number;
}

export const MINIMUM_BOX_PLOT_QUESTIONS = 10;

/** Cada aluno tem o mesmo peso no boxplot, independentemente do volume respondido. */
export function classQuestionDistribution(
  studentIds: readonly string[],
  rows: readonly QuestionRow[],
  activePlanStudentIds: readonly string[] = studentIds,
): ClassQuestionDistribution {
  const members = new Set(studentIds);
  const activeMembers = new Set(activePlanStudentIds.filter((studentId) => members.has(studentId)));
  const totals = new Map<string, { questions: number; correct: number }>();
  for (const row of rows) {
    if (!activeMembers.has(row.studentId) || row.questions <= 0) continue;
    const previous = totals.get(row.studentId) ?? { questions: 0, correct: 0 };
    totals.set(row.studentId, {
      questions: previous.questions + row.questions,
      correct: previous.correct + row.correctAnswers,
    });
  }

  return {
    enrolledStudents: members.size,
    studentsWithActivePlan: activeMembers.size,
    studentsWithQuestions: totals.size,
    minimumQuestions: MINIMUM_BOX_PLOT_QUESTIONS,
    scores: [...totals.values()]
      .filter((total) => total.questions >= MINIMUM_BOX_PLOT_QUESTIONS)
      .map((total) => questionAccuracy(total.questions, total.correct).correctPercent ?? 0),
  };
}
