import type { MockExamInput, MockExamResult } from "../api/mock-exams.ts";

export function validScore(score: number, maxScore: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= maxScore
    && Math.abs(score * 100 - Math.round(score * 100)) < 1e-7;
}

export function validateMockExam(input: MockExamInput): string | null {
  if (!input.title.trim() || input.title.trim().length > 160) return "Informe um título de até 160 caracteres.";
  if (!input.classId) return "Selecione a turma.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.examDate) || !Number.isFinite(Date.parse(input.examDate))
    || new Date(input.examDate).toISOString().slice(0, 10) !== input.examDate) return "Informe uma data válida.";
  if (input.maxScore <= 0 || !validScore(input.maxScore, 100000)) return "Informe uma pontuação máxima positiva, até 100.000, com até duas casas decimais.";
  return null;
}

/** Empate compartilha colocação: 1, 1, 3. Nome ordena, mas não desempata. */
export function rankMockExam(results: readonly MockExamResult[]) {
  const scored = results.filter((row): row is MockExamResult & { score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName, "pt-BR") || a.studentId.localeCompare(b.studentId));
  let rank = 0;
  return scored.map((row, index) => {
    if (index === 0 || row.score !== scored[index - 1]?.score) rank = index + 1;
    return { ...row, rank };
  });
}

export interface MockExamStatistics {
  readonly participants: number;
  readonly averageScore: number;
  readonly averagePercent: number;
  readonly medianScore: number;
  readonly medianPercent: number;
  readonly highestScore: number;
  readonly highestPercent: number;
  readonly percentages: readonly number[];
  readonly mine: null | {
    readonly score: number;
    readonly percent: number;
    readonly rank: number;
    readonly percentile: number;
  };
}

/** Estatísticas do mesmo simulado: todos fizeram a mesma prova e são comparáveis. */
export function calculateMockExamStatistics(
  results: readonly MockExamResult[],
  maxScore: number,
  profileId?: string,
): MockExamStatistics | null {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null;
  const ranking = rankMockExam(results);
  if (ranking.length === 0) return null;
  const scores = ranking.map((row) => row.score).sort((a, b) => a - b);
  const middle = Math.floor(scores.length / 2);
  const medianScore = scores.length % 2 === 0
    ? ((scores[middle - 1] ?? 0) + (scores[middle] ?? 0)) / 2
    : (scores[middle] ?? 0);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const highestScore = scores.at(-1) ?? 0;
  const mine = ranking.find((row) => row.studentId === profileId);
  const percentage = (score: number) => Math.round((score / maxScore) * 1000) / 10;
  return {
    participants: scores.length,
    averageScore,
    averagePercent: percentage(averageScore),
    medianScore,
    medianPercent: percentage(medianScore),
    highestScore,
    highestPercent: percentage(highestScore),
    percentages: scores.map(percentage),
    mine: mine ? {
      score: mine.score,
      percent: percentage(mine.score),
      rank: mine.rank,
      percentile: Math.round((scores.filter((score) => score < mine.score).length / scores.length) * 100),
    } : null,
  };
}
