/**
 * GERAR A SEMANA.
 *
 * É a operação mais cara de desfazer do produto: uma geração descuidada apaga
 * o que o aluno já estudou. O que a protege é de produto, e hoje o BANCO a
 * garante — este adaptador deixou de ser o único guardião (spec 04):
 *
 * 1. **A prévia vem antes da escrita.** `previewWeek` monta o que `generateWeek`
 *    faria e não grava nada. As contagens do que fica e do que sai vêm de
 *    `week_replacement_preview`, que usa o mesmo critério da geração.
 * 2. **Há um comportamento só.** Sai a meta pendente, a pulada e a em andamento
 *    sem registro; fica a concluída e a com estudo registrado ou bateria. O
 *    critério mora em `app_private.goal_is_preserved`, e não existe modo que
 *    apague mais.
 * 3. **`generate_week` é uma transação**, idempotente por `goal_batches.id` (o
 *    `requestId`), e `goal_entries_goal_fk` é `no action`: nem o `DELETE` direto
 *    leva o estudo registrado embora.
 */
import { supabase } from "@/lib/supabase/client";
import { groupIntoDays, weekBounds } from "@/lib/domain/week";
import { planWeek, type SubjectWeight } from "@/lib/domain/teacher";
import { WEEKDAY_NAMES } from "@bora/ui";
import type { Json } from "@bora/database";

import type {
  GenerateWeekInput,
  GenerateWeekPreview,
  Goal,
  RequestId,
  Result,
  Uuid,
  Week,
  Weekday,
} from "../contract.ts";
import { done, fail, failure, readFailure, throwDb, settle, translateDbError } from "./errors.ts";
import { checkGenerateWeek } from "../validation.ts";
import { once } from "./idempotency.ts";
import { loadWeek } from "./week.ts";

/** Os dias em que a v2 distribui: segunda a sábado. Domingo fica de folga. */
const DEFAULT_WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6];

interface Context {
  studyPlanId: Uuid;
  teacherId: Uuid;
  studentId: Uuid;
  startsOn: string;
  weeklyGoals: number;
  subjects: readonly SubjectWeight[];
}

async function context(input: GenerateWeekInput): Promise<Context> {
  const { data: plan, error } = await supabase
    .from("study_plans")
    .select("id,teacher_id,student_id,starts_on,weekly_goals")
    .eq("id", input.studyPlanId)
    .maybeSingle();

  if (error) throwDb(error);
  if (!plan) readFailure("Planejamento não encontrado.");

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("name,weight")
    .eq("teacher_id", plan.teacher_id)
    .eq("active", true);

  if (subjectsError) throwDb(subjectsError);

  return {
    studyPlanId: plan.id,
    teacherId: plan.teacher_id,
    studentId: plan.student_id,
    startsOn: plan.starts_on,
    weeklyGoals: plan.weekly_goals,
    subjects: (subjects ?? []).map((row) => ({
      subject: row.name,
      // O peso do professor, a não ser que a tela o tenha ajustado para esta
      // geração — é o "peso por matéria" da v2.
      weight: input.weights?.[row.name] ?? row.weight,
    })),
  };
}

/** As metas que a geração criaria, sem tocar no banco. */
async function build(input: GenerateWeekInput, ctx: Context): Promise<readonly PlannedRow[]> {
  if (input.copyFromWeek !== undefined) return copyFrom(input, ctx);

  return planWeek(ctx.subjects, ctx.weeklyGoals, DEFAULT_WEEKDAYS).map((planned) => ({
    subject: planned.subject,
    weekday: planned.weekday,
    day_position: planned.dayPosition,
    type: "theory" as const,
    title: `Teoria — ${planned.subject}`,
    planned_minutes: 60,
  }));
}

interface PlannedRow {
  subject: string;
  weekday: Weekday;
  day_position: number;
  type: "theory" | "question_block" | "review" | "reinforcement" | "mock_exam" | "extra";
  title: string;
  planned_minutes: number;
  lesson?: string | null;
  block?: string | null;
  notebook_block_id?: string | null;
}

/**
 * Copiar a semana anterior.
 *
 * Copia o PLANO, nunca o resultado: título, matéria, dia e minutos previstos
 * vão; estado, tempo gasto e registros ficam. Copiar o resultado daria ao aluno
 * uma semana que já nasce metade concluída.
 */
async function copyFrom(
  input: GenerateWeekInput,
  ctx: Context,
): Promise<readonly PlannedRow[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("subject,weekday,day_position,type,title,planned_minutes,lesson,block,notebook_block_id")
    .eq("study_plan_id", ctx.studyPlanId)
    .eq("week_number", input.copyFromWeek!);

  if (error) throwDb(error);

  return (data ?? []).map((row) => ({
    subject: row.subject,
    weekday: row.weekday as Weekday,
    day_position: row.day_position,
    type: row.type,
    title: row.title,
    planned_minutes: row.planned_minutes,
    lesson: row.lesson,
    block: row.block,
    notebook_block_id: row.notebook_block_id,
  }));
}

export async function previewWeek(input: GenerateWeekInput): Promise<GenerateWeekPreview> {
  const invalid = checkGenerateWeek(input);
  if (invalid) readFailure(invalid.message, "validation");

  const ctx = await context(input);
  const rows = await build(input, ctx);

  const { data: counts, error } = await supabase.rpc("week_replacement_preview", {
    p_study_plan_id: input.studyPlanId,
    p_week_number: input.weekNumber,
  });
  if (error) throwDb(error);
  const { goals_total: total, goals_preserved: preserved } = counts?.[0] ?? {
    goals_total: 0,
    goals_preserved: 0,
  };
  const replaced = total - preserved;

  const bounds = weekBounds(ctx.startsOn, input.weekNumber);

  // As metas da prévia recebem id sintético: elas ainda não existem, e a tela
  // precisa de chave estável para desenhar a lista.
  const goals: Goal[] = rows.map((row, index) => ({
    id: `preview-${index}`,
    type: row.type,
    status: "pending",
    weekday: row.weekday,
    dayPosition: row.day_position,
    subject: row.subject,
    title: row.title,
    description: null,
    lesson: row.lesson ?? null,
    block: row.block ?? null,
    plannedMinutes: row.planned_minutes,
    dueOn: null,
    completedAt: null,
    spentMinutes: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    entries: [],
    theory: null,
  }));

  return {
    weekNumber: input.weekNumber,
    days: groupIntoDays(goals, bounds.startsOn),
    goalsToCreate: rows.length,
    goalsToReplace: replaced,
    goalsPreserved: preserved,
  };
}

/** A meta no formato que `generate_week` lê. Ausente vai como `null`: `Json` não aceita `undefined`. */
function toPayload(row: PlannedRow): Json {
  return {
    weekday: row.weekday,
    weekday_name: WEEKDAY_NAMES[row.weekday - 1]!,
    day_position: row.day_position,
    type: row.type,
    subject: row.subject,
    title: row.title,
    planned_minutes: row.planned_minutes,
    lesson: row.lesson ?? null,
    block: row.block ?? null,
    notebook_block_id: row.notebook_block_id ?? null,
  };
}

/**
 * Gera a semana numa transação.
 *
 * A validação fica FORA do `once()`, como `grantAccess` faz: recusa não gasta
 * viagem nem prende o id. O `once()` cobre o clique duplo dentro da aba sem ida
 * ao servidor; quem garante de verdade é `goal_batches`, cuja PK é o
 * `requestId` — a tela o gera uma vez por prévia, e uma retentativa depois de a
 * resposta se perder volta como replay, sem tocar em `goals`.
 */
export function generateWeek(input: GenerateWeekInput): Promise<Result<Week>> {
  const invalid = checkGenerateWeek(input);
  if (invalid) return Promise.resolve(failure<Week>(invalid));

  return once(input.requestId, async () => {
    const ctx = await context(input);
    const rows = await build(input, ctx);

    if (rows.length === 0) {
      return fail<Week>(
        "validation",
        "Nenhuma disciplina com peso. Cadastre as disciplinas antes de gerar a semana.",
      );
    }

    const { error } = await supabase.rpc("generate_week", {
      p_request_id: input.requestId,
      p_study_plan_id: input.studyPlanId,
      p_week_number: input.weekNumber,
      p_goals: rows.map(toPayload),
    });
    if (error) return failure<Week>(translateDbError(error));
    return done(await loadWeek(ctx.studyPlanId, input.weekNumber));
  });
}

/**
 * Apaga o que Gerar substituiria — pendentes, puladas e em andamento sem
 * registro — e nada insere. Concluída e estudo registrado nunca saem.
 *
 * Sem `once()`, como `linkStudent`, e o `requestId` fica na assinatura do
 * contrato sem ir ao banco: a função é naturalmente idempotente, porque só
 * apaga, o critério é reavaliado contra o estado atual sob a trava do plano, e
 * o pior caso (corrida com um registro do aluno) é segurado por
 * `goal_entries_goal_fk`.
 */
export function clearPendingGoals(
  studyPlanId: Uuid,
  weekNumber: number,
  requestId: RequestId,
): Promise<Result<Week>> {
  return settle(async () => {
    void requestId;
    const { error } = await supabase.rpc("clear_pending_goals", {
      p_study_plan_id: studyPlanId,
      p_week_number: weekNumber,
    });
    if (error) return failure<Week>(translateDbError(error));
    return done(await loadWeek(studyPlanId, weekNumber));
  });
}
