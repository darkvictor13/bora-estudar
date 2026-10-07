import type { DailyQuestionPerformance } from "../api/contract.ts";
import { entryDay } from "./schedule.ts";

interface QuestionEntry {
  readonly createdAt: string;
  readonly studiedOn?: string | null;
  readonly questions: number;
  readonly correctAnswers: number;
}

/** Percentuais calculados sobre respostas, nunca sobre tempo ou leitura. */
export function questionAccuracy(questions: number, correctAnswers: number) {
  const total = Math.max(0, questions);
  const correct = Math.min(total, Math.max(0, correctAnswers));
  const wrong = total - correct;
  return {
    questions: total,
    correctAnswers: correct,
    wrongAnswers: wrong,
    correctPercent: total ? Math.round((correct / total) * 1000) / 10 : null,
    wrongPercent: total ? Math.round((wrong / total) * 1000) / 10 : null,
  };
}

/** Só respostas entram no indicador de conhecimento; minutos de leitura não entram. */
export function questionsByDay(
  entries: readonly QuestionEntry[],
  fromDate?: string,
): readonly DailyQuestionPerformance[] {
  const totals = new Map<string, { questions: number; correct: number }>();
  for (const entry of entries) {
    if (entry.questions <= 0) continue;
    const date = entryDay(entry);
    if (fromDate && date < fromDate) continue;
    const current = totals.get(date) ?? { questions: 0, correct: 0 };
    totals.set(date, {
      questions: current.questions + entry.questions,
      correct: current.correct + entry.correctAnswers,
    });
  }
  return [...totals.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, total]) => ({
      date,
      questions: total.questions,
      correctAnswers: total.correct,
      wrongAnswers: total.questions - total.correct,
      score: Math.round((total.correct / total.questions) * 1000) / 10,
    }));
}
