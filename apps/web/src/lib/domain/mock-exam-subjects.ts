import type { MockExamResult, MockExamSubject, MockExamSubjectResult } from "../api/mock-exams.ts";

export interface MockExamSubjectAnalysis {
  readonly subject: string;
  readonly questionCount: number;
  readonly ranking: readonly { studentId: string; studentName: string; correctAnswers: number; percent: number; rank: number }[];
  readonly classAverage: number;
  readonly mine: { correctAnswers: number; percent: number; rank: number; peerAverage: number | null; gap: number | null } | null;
}

const percent = (correct: number, total: number) => Math.round(correct / total * 1000) / 10;

/** Compara apenas respostas lançadas no mesmo simulado, sem tratar ausência como zero. */
export function analyzeMockExamSubjects(
  subjects: readonly MockExamSubject[],
  answers: readonly MockExamSubjectResult[],
  results: readonly MockExamResult[],
  profileId?: string,
): readonly MockExamSubjectAnalysis[] {
  const eligible = new Map(results.filter((row) => row.score !== null).map((row) => [row.studentId, row.studentName]));
  return subjects.filter((item) => Number.isInteger(item.questionCount) && item.questionCount > 0).map((item) => {
    const sorted = answers.filter((answer) => answer.subject === item.subject && eligible.has(answer.studentId)
      && Number.isInteger(answer.correctAnswers) && answer.correctAnswers >= 0 && answer.correctAnswers <= item.questionCount)
      .sort((a, b) => b.correctAnswers - a.correctAnswers || (eligible.get(a.studentId) ?? "").localeCompare(eligible.get(b.studentId) ?? "", "pt-BR"));
    let rank = 0;
    const ranking = sorted.map((row, index) => {
      if (index === 0 || row.correctAnswers !== sorted[index - 1]?.correctAnswers) rank = index + 1;
      return { studentId: row.studentId, studentName: eligible.get(row.studentId) ?? "Aluno",
        correctAnswers: row.correctAnswers, percent: percent(row.correctAnswers, item.questionCount), rank };
    });
    const mine = ranking.find((row) => row.studentId === profileId);
    const peers = ranking.filter((row) => row.studentId !== profileId);
    const peerAverage = peers.length ? Math.round(peers.reduce((sum, row) => sum + row.percent, 0) / peers.length * 10) / 10 : null;
    return {
      subject: item.subject, questionCount: item.questionCount, ranking,
      classAverage: ranking.length ? Math.round(ranking.reduce((sum, row) => sum + row.percent, 0) / ranking.length * 10) / 10 : 0,
      mine: mine ? { correctAnswers: mine.correctAnswers, percent: mine.percent, rank: mine.rank,
        peerAverage, gap: peerAverage === null ? null : Math.round((mine.percent - peerAverage) * 10) / 10 } : null,
    };
  });
}
