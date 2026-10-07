import type { DayGroup, Goal, Week, Weekday } from "../api/contract.ts";
import { localDateOf } from "./dates.ts";
import { addDays } from "./week.ts";

export type ScheduleFilter = "all" | "pending" | "completed" | "reviews";

/** Inclui dias livres e preserva o início da semana definido pelo planejamento. */
export function calendarDays(week: Pick<Week, "startsOn" | "days">): readonly DayGroup[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(week.startsOn, offset);
    return week.days.find((day) => day.date === date) ?? {
      date,
      weekday: (new Date(`${date}T00:00:00Z`).getUTCDay() || 7) as Weekday,
      goals: [],
    };
  });
}

export function matchesSchedule(goal: Goal, filter: ScheduleFilter, subject: string): boolean {
  if (subject && goal.subject !== subject) return false;
  switch (filter) {
    case "pending": return goal.status === "pending" || goal.status === "in_progress";
    case "completed": return goal.status === "completed";
    case "reviews": return goal.type === "review" || goal.type === "reinforcement";
    default: return true;
  }
}

export function scheduleFilter(value: string | null): ScheduleFilter {
  return value === "pending" || value === "completed" || value === "reviews" ? value : "all";
}

/** Hoje no fuso do aluno, sem converter a data local para UTC. */
export function localDate(now = new Date()): string {
  return localDateOf(now);
}

/**
 * O dia de um registro (N-07, R-EXTRA-28): o dia estudado, quando o estudo extra o
 * guardou, senão o dia LOCAL em que foi lançado.
 *
 * É a única função que calcula o dia de um registro. Série, sequência, calendário
 * e desempenho do dia leem por aqui; ler `createdAt` direto contaria o extra de
 * ontem como estudo de hoje.
 */
export function entryDay(entry: {
  readonly studiedOn?: string | null;
  readonly createdAt: string;
}): string {
  return entry.studiedOn ?? localDate(new Date(entry.createdAt));
}

/** Mede o estudo no dia em que ele aconteceu (`entryDay`), não na data da meta. */
export function dailyQuestionPerformance(week: Pick<Week, "days">, date: string) {
  const entries = week.days.flatMap((day) => day.goals.flatMap((goal) => goal.entries));
  const answeredToday = entries.filter((entry) => entryDay(entry) === date);
  const questions = answeredToday.reduce((total, entry) => total + entry.questions, 0);
  const correct = answeredToday.reduce((total, entry) => total + entry.correctAnswers, 0);
  return {
    questions,
    correct,
    wrong: questions - correct,
    score: questions > 0 ? Math.round((correct / questions) * 1000) / 10 : null,
  };
}
