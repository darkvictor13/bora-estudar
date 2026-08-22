import type { Enum } from "@bora/database";

export interface PlannerBlock {
  readonly id: string;
  readonly name: string;
  readonly subject_name: string;
}

/**
 * Rascunho de meta no formato que `apply_study_plan_batch` espera.
 *
 * A assinatura de índice existe para o tipo casar com `Json` do supabase-js,
 * que é o tipo do parâmetro `p_goals` da RPC.
 */
export interface GoalDraft {
  [key: string]: string | number | null;
  weekday: number;
  position: number;
  type: Enum<"goal_type">;
  block_id: string | null;
  title: string;
  planned_minutes: number;
  teacher_note: string | null;
  extra_activity: string | null;
}

/**
 * Distribui os blocos escolhidos pelos dias marcados, em rodízio.
 *
 * Cada bloco de questões pode vir acompanhado de uma meta de teoria no mesmo
 * dia e imediatamente antes, espelhando o "gerar ciclo da semana" do painel
 * antigo.
 *
 * `position` é relativa dentro do dia e começa em 1. A RPC soma o maior
 * `day_order` sobrevivente daquele dia antes de gravar, então gerar duas vezes
 * a mesma semana no modo "acrescentar" não colide — quem resolve a ordem final
 * é o banco, nunca o cliente.
 */
export function buildWeek(
  blocks: readonly PlannerBlock[],
  weekdays: readonly number[],
  minutesPerGoal: number,
  withTheory: boolean,
): GoalDraft[] {
  if (!blocks.length || !weekdays.length) return [];

  const drafts: GoalDraft[] = [];
  const nextPosition = new Map<number, number>();
  const take = (weekday: number) => {
    const position = (nextPosition.get(weekday) ?? 0) + 1;
    nextPosition.set(weekday, position);
    return position;
  };

  blocks.forEach((block, index) => {
    const weekday = weekdays[index % weekdays.length]!;

    if (withTheory) {
      drafts.push({
        weekday,
        position: take(weekday),
        type: "theory",
        block_id: null,
        title: `Teoria — ${block.subject_name}`,
        planned_minutes: minutesPerGoal,
        teacher_note: null,
        extra_activity: null,
      });
    }

    drafts.push({
      weekday,
      position: take(weekday),
      type: "question_block",
      block_id: block.id,
      title: `Bateria — ${block.name}`,
      planned_minutes: minutesPerGoal,
      teacher_note: null,
      extra_activity: null,
    });
  });

  return drafts;
}
