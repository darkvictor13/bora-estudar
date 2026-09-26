/**
 * GERAR A SEMANA — e a substituição segura do LEIA-ME v108.3.
 *
 * É a operação mais cara de desfazer do produto: uma geração descuidada apaga
 * o que o aluno já estudou. Três coisas a protegem, e as três são de produto,
 * não de implementação:
 *
 * 1. **A prévia vem antes da escrita.** `previewWeek` monta exatamente o que
 *    `generateWeek` faria e não grava nada. A tela mostra, o professor confere.
 * 2. **O modo `safe` preserva o que o aluno ESTUDOU** — meta concluída ou com
 *    registro de estudo, com os registros dela. É o padrão. Meta em andamento
 *    tem registro por definição, e antes saía junto: o tempo que o aluno
 *    lançou sumia das estatísticas dele.
 * 3. **`full` é caminho separado** — "Replanejar semana inteira" —, e a tela
 *    exige confirmação antes de chegar aqui. Um `boolean force` não serviria:
 *    quem lê a chamada precisa ver qual dos dois caminhos está sendo tomado.
 *
 * Quem garante é o banco: `replace_week_goals` apaga e insere numa transação
 * só, calcula a posição das metas novas depois das que sobreviveram, e guarda o
 * `request_id` em `week_batches`. Antes eram duas requisições daqui, e um
 * INSERT que falhava depois do DELETE deixava a semana vazia.
 *
 * O que continua aqui é a MONTAGEM das metas (a distribuição por peso, a cópia
 * de outra semana) e a prévia, que precisa repetir a regra de preservação para
 * contar o que vai ficar.
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
import { done, fail, failure, readFailure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { loadWeek } from "./week.ts";

/** Os dias em que a v2 distribui: segunda a sábado. Domingo fica de folga. */
const DEFAULT_WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6];

/**
 * Meta que o modo `safe` PRESERVA: concluída, ou com registro de estudo.
 *
 * É a mesma regra do DELETE de `replace_week_goals`, repetida aqui só para a
 * prévia contar. Quem decide o que sai é o banco.
 */
function isPreserved(goal: ExistingGoal): boolean {
  return goal.status === "completed" || goal.entries > 0;
}

interface ExistingGoal {
  id: string;
  status: string;
  subject: string;
  weekday: number;
  entries: number;
}

interface Context {
  studyPlanId: Uuid;
  teacherId: Uuid;
  studentId: Uuid;
  startsOn: string;
  weeklyGoals: number;
  subjects: readonly SubjectWeight[];
  existing: readonly ExistingGoal[];
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

  const { data: existing, error: existingError } = await supabase
    .from("goals")
    .select("id,status,subject,weekday,goal_entries(id)")
    .eq("study_plan_id", input.studyPlanId)
    .eq("week_number", input.weekNumber);

  if (existingError) throwDb(existingError);

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
    existing: (existing ?? []).map((goal) => ({
      id: goal.id,
      status: goal.status,
      subject: goal.subject,
      weekday: goal.weekday,
      entries: goal.goal_entries.length,
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
  const ctx = await context(input);
  const rows = await build(input, ctx);

  const preserved =
    input.mode === "safe" ? ctx.existing.filter((goal) => isPreserved(goal)).length : 0;
  const replaced = ctx.existing.length - preserved;

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

/**
 * Substitui a semana pela RPC. `mode` vira `p_keep_studied`: o modo seguro
 * preserva o que o aluno estudou, o completo apaga tudo — menos meta com
 * bateria, que o banco nunca apaga.
 */
function replaceWeek(
  studyPlanId: Uuid,
  weekNumber: number,
  keepStudied: boolean,
  rows: readonly PlannedRow[],
  requestId: RequestId,
) {
  const goals = rows.map((row) => ({
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
  })) satisfies Json;

  return supabase.rpc("replace_week_goals", {
    p_study_plan_id: studyPlanId,
    p_week_number: weekNumber,
    p_keep_studied: keepStudied,
    p_goals: goals,
    p_request_id: requestId,
  });
}

export function generateWeek(input: GenerateWeekInput): Promise<Result<Week>> {
  return once(input.requestId, async () => {
    const ctx = await context(input);
    const rows = await build(input, ctx);

    if (rows.length === 0) {
      return fail<Week>(
        "validation",
        "Nenhuma disciplina com peso. Cadastre as disciplinas antes de gerar a semana.",
      );
    }

    const { error } = await replaceWeek(
      ctx.studyPlanId,
      input.weekNumber,
      input.mode === "safe",
      rows,
      input.requestId,
    );
    if (error) return failure<Week>(translateDbError(error));

    return done(await loadWeek(ctx.studyPlanId, input.weekNumber));
  });
}

/**
 * Limpa as metas PENDENTES da semana.
 *
 * Nunca toca no que o aluno estudou — é o mesmo princípio da substituição
 * segura, e é por isso que esta operação existe separada de "replanejar": o
 * professor que quer esvaziar a semana quase sempre quer manter o que o aluno
 * já fez. É a mesma RPC, com a lista de metas novas vazia.
 */
export function clearPendingGoals(
  studyPlanId: Uuid,
  weekNumber: number,
  requestId: RequestId,
): Promise<Result<Week>> {
  return once(requestId, async () => {
    const { error } = await replaceWeek(studyPlanId, weekNumber, true, [], requestId);
    if (error) return failure<Week>(translateDbError(error));

    return done(await loadWeek(studyPlanId, weekNumber));
  });
}
