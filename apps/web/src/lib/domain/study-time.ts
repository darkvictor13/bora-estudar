/**
 * Tempo de estudo, série semanal e sequência de dias — spec 25.
 * docs/specs/25-tempo-de-estudo-e-series.md
 *
 * Tudo aqui é função pura sobre as linhas de `vw_study_time`. O período é
 * escolhido na tela e nunca vai para o banco: a view devolve o planejamento
 * inteiro, e filtrar é trabalho testável sem Docker — que é onde os casos de
 * borda de calendário se escondem.
 *
 * As datas chegam como `YYYY-MM-DD`, já convertidas para o fuso do produto pela
 * view. Trabalhar com a string evita reconverter no cliente, que é onde o fuso
 * do navegador entraria e desfaria a conversão.
 */
// Relativo com extensão, e não pelo alias `@/`: o runner nativo do Node não
// resolve o alias do Vite, e um módulo de domínio precisa rodar sem bundler.
import { EXTRA_ACTIVITY_LABEL } from "./goals.ts";

export type Period = "hoje" | "semana" | "mes" | "ano" | "total";

export const PERIODS: readonly { id: Period; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
  { id: "total", label: "Total" },
];

/** Teto da série, como na v96: 40 semanas viram uma parede ilegível. */
export const MAX_SERIES_WEEKS = 12;

export interface StudyRow {
  readonly goal_id: string;
  readonly week_number: number;
  readonly goal_type: string;
  readonly extra_activity: string | null;
  readonly subject_name: string | null;
  /** `YYYY-MM-DD`, no fuso do produto. */
  readonly completed_on: string;
  readonly minutes_spent: number | null;
  readonly questions_answered: number;
  readonly correct_answers: number;
}

/** `YYYY-MM-DD` de uma data, sem passar pelo fuso do navegador. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Primeiro dia do período, inclusivo. `null` significa "sem limite".
 *
 * "Semana" é a semana CORRENTE começando na segunda, e não os últimos sete
 * dias: é o que `filtrarMetasPorPeriodoTempo` faz (aluno.js:1201). A diferença
 * aparece toda segunda-feira, quando a v96 zera e "últimos 7 dias" não zeraria.
 */
export function periodStart(period: Period, today: Date): string | null {
  if (period === "total") return null;
  if (period === "hoje") return dayKey(today);

  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === "ano") {
    start.setMonth(0, 1);
  } else if (period === "mes") {
    start.setDate(1);
  } else {
    // Segunda como início: getDay() devolve 0 para domingo, e (dia + 6) % 7
    // transforma domingo em 6 — o último dia da semana, não o primeiro.
    const weekday = (today.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
  }
  return dayKey(start);
}

export function inPeriod(row: StudyRow, period: Period, today: Date): boolean {
  const start = periodStart(period, today);
  if (start === null) return true;
  return row.completed_on >= start && row.completed_on <= dayKey(today);
}

export interface TimeGroup {
  readonly label: string;
  readonly kind: "subject" | "activity";
  readonly minutes: number;
  readonly goals: number;
}

export interface TimeSummary {
  readonly period: Period;
  readonly total: number;
  readonly goals: number;
  readonly groups: readonly TimeGroup[];
}

/**
 * Como a linha é rotulada na divisão do tempo.
 *
 * Meta COM bloco vai pela disciplina; meta sem bloco, pela atividade. Nunca
 * pelos dois: a v96 divide por um ou por outro, e misturar os eixos produziria
 * uma fatia "Direito Penal" e outra "Questões extras" que se sobrepõem.
 */
export function groupOf(row: StudyRow): { label: string; kind: "subject" | "activity" } {
  if (row.subject_name) return { label: row.subject_name, kind: "subject" };
  if (row.extra_activity) {
    const label =
      EXTRA_ACTIVITY_LABEL[row.extra_activity as keyof typeof EXTRA_ACTIVITY_LABEL] ??
      row.extra_activity;
    return { label, kind: "activity" };
  }
  return { label: row.goal_type === "theory" ? "Teoria" : "Estudo extra", kind: "activity" };
}

export function summarize(
  rows: readonly StudyRow[],
  period: Period,
  today: Date,
): TimeSummary {
  const groups = new Map<string, { label: string; kind: "subject" | "activity"; minutes: number; goals: number }>();
  let total = 0;
  let goals = 0;

  for (const row of rows) {
    if (!inPeriod(row, period, today)) continue;
    const { label, kind } = groupOf(row);
    const key = `${kind}:${label}`;
    const current = groups.get(key) ?? { label, kind, minutes: 0, goals: 0 };
    current.minutes += row.minutes_spent ?? 0;
    current.goals += 1;
    groups.set(key, current);
    total += row.minutes_spent ?? 0;
    goals += 1;
  }

  return {
    period,
    total,
    goals,
    groups: [...groups.values()].sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label)),
  };
}

export interface WeekPoint {
  readonly week: number;
  readonly goals: number;
  readonly questions: number;
  readonly correct: number;
  readonly minutes: number;
  readonly score: number | null;
}

/**
 * Série por semana do PLANEJAMENTO, não do calendário.
 *
 * `plannedWeeks` entra para que a semana planejada e parada apareça com zeros:
 * sumir esconderia justamente a semana em que o aluno parou (R-TEMP-13).
 */
export function weeklySeries(
  rows: readonly StudyRow[],
  plannedWeeks: readonly number[],
): readonly WeekPoint[] {
  const byWeek = new Map<number, { goals: number; questions: number; correct: number; minutes: number }>();
  for (const week of plannedWeeks) {
    byWeek.set(week, { goals: 0, questions: 0, correct: 0, minutes: 0 });
  }

  for (const row of rows) {
    const current = byWeek.get(row.week_number) ?? { goals: 0, questions: 0, correct: 0, minutes: 0 };
    current.goals += 1;
    current.minutes += row.minutes_spent ?? 0;
    // Só meta de bateria tem questão. Somar teoria e extra aqui diluiria o
    // percentual com metas que nunca tiveram como acertar nada.
    current.questions += row.questions_answered;
    current.correct += row.correct_answers;
    byWeek.set(row.week_number, current);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-MAX_SERIES_WEEKS)
    .map(([week, value]) => ({
      week,
      ...value,
      score: value.questions > 0 ? Math.round((value.correct / value.questions) * 100) : null,
    }));
}

/**
 * Dias seguidos com pelo menos uma meta concluída.
 *
 * Conta para trás a partir de hoje. **Hoje vazio tenta ontem**, e só então
 * zera: é a regra da v96 (`calcularSequenciaEstudos`, aluno.js:1162), e é o que
 * impede a sequência de zerar à meia-noite de quem estudou ontem à noite e
 * ainda não começou hoje.
 *
 * Duas metas no mesmo dia contam um dia.
 */
export function streak(rows: readonly StudyRow[], today: Date): number {
  const days = new Set(rows.map((row) => row.completed_on));
  if (days.size === 0) return 0;

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }

  let total = 0;
  while (days.has(dayKey(cursor))) {
    total += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return total;
}

/** "2h30" / "45min" — o formato da v96 (`fmtHoras`). */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}
