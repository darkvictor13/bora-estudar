/**
 * AS REGRAS DO PROFESSOR, PURAS.
 *
 * Duas famílias, e as duas moram fora do adaptador pelo mesmo motivo: são
 * decisões de PRODUTO que precisam de teste, não consultas.
 *
 * 1. **Classificar o aluno.** "Em ritmo", "atenção" e "atrasado" saem de uma
 *    razão, e a razão precisa de um denominador honesto — metas DEVIDAS até
 *    hoje, não metas da semana inteira. Contra a semana inteira, todo aluno é
 *    atrasado na segunda-feira.
 * 2. **Distribuir a semana.** Quantas metas de cada disciplina, em que dia. É
 *    a operação mais cara de desfazer do produto, e é por isso que a tela
 *    mostra uma prévia antes de escrever.
 */
import type { GoalStatus, StudentPace, Weekday } from "@/lib/api";
import { dateOfWeekday } from "./week.ts";

/* ------------------------------------------------------------------ *
 * Classificação
 * ------------------------------------------------------------------ */

/** O piso de cada faixa, em porcentagem de metas devidas já concluídas. */
export const PACE_THRESHOLDS = { onTrack: 80, attention: 50 } as const;

/**
 * Em ritmo, atenção ou atrasado.
 *
 * Os cortes são os da v2. O que importa aqui é que quem NÃO TEM NADA DEVIDO
 * conta como em ritmo: um aluno cujo planejamento começa amanhã não está
 * atrasado, e pintá-lo de vermelho no primeiro dia é a forma mais rápida de o
 * professor parar de olhar a cor.
 */
export function classifyPace(completed: number, due: number): StudentPace {
  if (due <= 0) return "on_track";
  const ratio = (completed / due) * 100;
  if (ratio >= PACE_THRESHOLDS.onTrack) return "on_track";
  if (ratio >= PACE_THRESHOLDS.attention) return "attention";
  return "behind";
}

export interface PaceInput {
  readonly weekNumber: number;
  readonly weekday: Weekday;
  readonly status: GoalStatus;
}

/**
 * Quantas metas já eram DEVIDAS, e quantas foram concluídas.
 *
 * Devida é a meta cujo dia já passou — inclusive hoje. Contar as de amanhã
 * transformaria o progresso numa contagem regressiva em que ninguém nunca está
 * em dia.
 *
 * META PULADA CONTA COMO DEVIDA E NÃO CONCLUÍDA. Pular é decisão legítima de
 * quem estuda, mas o professor precisa ver que o conteúdo não foi coberto —
 * senão pular vira a forma de ficar verde sem estudar.
 */
export function progressUntil(
  goals: readonly PaceInput[],
  planStartsOn: string,
  todayDate: string,
): { completed: number; due: number; percent: number } {
  let completed = 0;
  let due = 0;

  for (const goal of goals) {
    const weekStart = addWeeks(planStartsOn, goal.weekNumber - 1);
    if (dateOfWeekday(weekStart, goal.weekday) > todayDate) continue;

    due += 1;
    if (goal.status === "completed") completed += 1;
  }

  return { completed, due, percent: due > 0 ? Math.round((completed / due) * 100) : 0 };
}

function addWeeks(date: string, weeks: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + weeks * 7);
  return base.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Distribuição da semana
 * ------------------------------------------------------------------ */

export interface SubjectWeight {
  readonly subject: string;
  readonly weight: number;
}

export interface PlannedGoal {
  readonly subject: string;
  readonly weekday: Weekday;
  readonly dayPosition: number;
}

/**
 * Quantas metas cada disciplina ganha, dado o total da semana.
 *
 * Reparte por peso e distribui o RESTO pelos maiores pesos, em ordem. Sem essa
 * segunda etapa, `Math.floor` de cada fração perde metas: 12 metas entre pesos
 * 5/4/3/2 dão 4+3+2+1 = 10, e duas somem sem ninguém notar.
 *
 * Toda disciplina com peso ganha PELO MENOS UMA. Uma disciplina que o professor
 * pôs no ciclo e que não aparece na semana é pior do que uma semana desbalanceada:
 * ele vai procurar o erro no lugar errado.
 */
export function shareByWeight(
  subjects: readonly SubjectWeight[],
  totalGoals: number,
): ReadonlyMap<string, number> {
  const active = subjects.filter((subject) => subject.weight > 0);
  const out = new Map<string, number>();
  if (active.length === 0 || totalGoals <= 0) return out;

  // Menos metas do que disciplinas: as de maior peso entram, uma cada.
  if (totalGoals <= active.length) {
    for (const subject of [...active].sort((a, b) => b.weight - a.weight).slice(0, totalGoals)) {
      out.set(subject.subject, 1);
    }
    return out;
  }

  const totalWeight = active.reduce((sum, subject) => sum + subject.weight, 0);
  let assigned = 0;

  for (const subject of active) {
    const share = Math.max(1, Math.floor((subject.weight / totalWeight) * totalGoals));
    out.set(subject.subject, share);
    assigned += share;
  }

  // Sobra vai para os maiores pesos; falta sai dos menores.
  const byWeight = [...active].sort((a, b) => b.weight - a.weight);
  let index = 0;
  while (assigned < totalGoals) {
    const subject = byWeight[index % byWeight.length]!.subject;
    out.set(subject, (out.get(subject) ?? 0) + 1);
    assigned += 1;
    index += 1;
  }
  while (assigned > totalGoals) {
    const subject = byWeight[byWeight.length - 1 - (index % byWeight.length)]!.subject;
    const current = out.get(subject) ?? 0;
    if (current > 1) {
      out.set(subject, current - 1);
      assigned -= 1;
    }
    index += 1;
  }

  return out;
}

/**
 * A semana montada: cada meta com dia e posição.
 *
 * Distribui em RODÍZIO pelos dias escolhidos, em vez de encher segunda e terça:
 * o estudo espalhado é o que o modelo de avanço progressivo pressupõe, e
 * empilhar quatro matérias numa segunda produz uma semana que ninguém cumpre.
 */
export function planWeek(
  subjects: readonly SubjectWeight[],
  totalGoals: number,
  weekdays: readonly Weekday[],
): readonly PlannedGoal[] {
  const shares = shareByWeight(subjects, totalGoals);
  if (shares.size === 0 || weekdays.length === 0) return [];

  // Maior peso primeiro: a disciplina mais importante cai nos primeiros dias,
  // que são os que sobram quando a semana aperta.
  const ordered = [...shares.entries()].sort(
    (a, b) =>
      (subjects.find((s) => s.subject === b[0])?.weight ?? 0) -
        (subjects.find((s) => s.subject === a[0])?.weight ?? 0) ||
      a[0].localeCompare(b[0], "pt-BR"),
  );

  const perDay = new Map<Weekday, number>();
  const planned: PlannedGoal[] = [];
  let slot = 0;

  for (const [subject, count] of ordered) {
    for (let i = 0; i < count; i += 1) {
      const weekday = weekdays[slot % weekdays.length]!;
      const position = (perDay.get(weekday) ?? 0) + 1;
      perDay.set(weekday, position);
      planned.push({ subject, weekday, dayPosition: position });
      slot += 1;
    }
  }

  return planned.sort((a, b) => a.weekday - b.weekday || a.dayPosition - b.dayPosition);
}
