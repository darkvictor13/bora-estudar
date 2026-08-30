import type { Enum } from "@bora/database";

export const WEEKDAY_NAMES = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? "—";
}

export const GOAL_TYPE_LABEL: Record<Enum<"goal_type">, string> = {
  theory: "Teoria",
  question_block: "Bateria",
  reinforcement: "Reforço",
  extra_study: "Estudo extra",
};

export const GOAL_STATUS_LABEL: Record<Enum<"goal_status">, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
  skipped: "Pulada",
  cancelled: "Cancelada",
};

export const QUIZ_STATUS_LABEL: Record<Enum<"quiz_session_status">, string> = {
  in_progress: "Em andamento",
  awaiting_time: "Aguardando tempo",
  completed: "Concluída",
  cancelled: "Cancelada",
  voided: "Anulada",
};

export function goalStatusTone(status: Enum<"goal_status">) {
  if (status === "completed") return "green" as const;
  if (status === "in_progress") return "blue" as const;
  if (status === "cancelled" || status === "skipped") return "neutral" as const;
  return "amber" as const;
}

/** Formata minutos como "1h20" ou "45min". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}min`;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/**
 * Interpreta o tempo digitado pelo aluno: "80" ou "1:20".
 * Devolve minutos, ou `null` se não der para entender.
 */
export function parseDuration(input: string): number | null {
  const value = input.trim();
  if (!value) return null;

  const colon = value.match(/^(\d{1,3}):([0-5]\d)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  const plain = value.match(/^\d{1,4}$/);
  if (plain) return Number(value);

  return null;
}

export function scorePercent(correct: number, total: number): number | null {
  if (!total) return null;
  return Math.round((correct / total) * 100);
}

/**
 * Os sete tipos de estudo extra — spec 19.
 *
 * Identificador em inglês no banco, rótulo em português na tela. São os mesmos
 * sete do `<select id="extra-tipo">` da v96 (aluno.html:1067).
 */
export const EXTRA_ACTIVITY_LABEL: Record<Enum<"extra_activity_kind">, string> = {
  statute: "Lei seca",
  flashcards: "Anki",
  mock_exam: "Simulado",
  review: "Revisão",
  extra_questions: "Questões extras",
  video_lesson: "Videoaula",
  other: "Outro",
};

export const EXTRA_ACTIVITIES = Object.keys(EXTRA_ACTIVITY_LABEL) as Enum<"extra_activity_kind">[];

/**
 * Meta pendente de bateria de um bloco, a mais antiga primeiro.
 *
 * A ordenação é a de `metasPendentesSemanaDoBloco` da v96 — dia e ordem no dia
 * —, com a **semana na frente**: lá havia uma semana selecionada na tela, e
 * aqui não há. A lista de cadernos não tem seletor de semana, e exigir que o
 * aluno adivinhasse a semana da meta é o problema que a spec 31 resolve.
 */
export interface PendingGoal {
  readonly id: string;
  readonly block_id: string | null;
  readonly type: Enum<"goal_type">;
  readonly status: Enum<"goal_status">;
  readonly week_number: number;
  readonly weekday: number;
  readonly day_order: number;
}

export function oldestPendingGoalOf(
  goals: readonly PendingGoal[],
  blockId: string,
): PendingGoal | null {
  const candidates = goals.filter(
    (goal) =>
      goal.block_id === blockId && goal.type === "question_block" && goal.status === "pending",
  );

  if (candidates.length === 0) return null;

  return candidates
    .slice()
    .sort(
      (a, b) =>
        a.week_number - b.week_number || a.weekday - b.weekday || a.day_order - b.day_order,
    )[0]!;
}
