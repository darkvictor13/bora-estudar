/**
 * A SEMANA DO ALUNO, CONTRA O BANCO.
 *
 * Duas decisões governam este arquivo, e as duas vêm do CLAUDE.md:
 *
 * 1. **O ledger é a fonte do número.** `goal_entries` é onde o estudo é
 *    registrado, e é dele que saem tempo, questões e acertos — nunca das
 *    colunas `spent_minutes`/`questions_answered`/`correct_answers` da meta.
 *    Aquelas colunas existem e até estão no grant, mas mantê-las à mão criaria
 *    o segundo caminho escrevendo o mesmo número, que é exatamente o defeito
 *    que a versão anterior tinha. Aqui elas são lidas por ninguém e escritas
 *    por ninguém — e `protect_goal_planning_fields` congela as três para o
 *    aluno (QA-28), então nem uma chamada direta pela API as escreve.
 * 2. **Meta de bateria é intocável.** O gatilho `protect_goal_quiz_result`
 *    recusa mudança de resultado e de estado em meta com `notebook_block_id`,
 *    e só o motor de baterias — que ainda não existe — pode alterá-la. A tela
 *    precisa saber disso ANTES de oferecer o botão, e é `isQuizGoal` que
 *    responde.
 */
import { supabase } from "@/lib/supabase/client";
import {
  groupIntoDays,
  statusFromEntries,
  summarizeWeek,
  weekBounds,
  weekNumberOf,
} from "@/lib/domain/week";
import { entryDay } from "@/lib/domain/schedule";
import { normalizeSubjectKey } from "@/lib/domain/theory";

import type {
  ApiError,
  ExtraStudyInput,
  Goal,
  GoalStatus,
  IsoDate,
  RecordStudyInput,
  RequestId,
  Result,
  StudyEntry,
  Uuid,
  Week,
  WeekOption,
  Weekday,
} from "../contract.ts";
import { checkExtraStudy, checkStudyEntry, STUDY_REPLAY_CONFLICT } from "../validation.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { theoryRefsBySubject } from "./theory.ts";
import { once } from "./idempotency.ts";
import { requireSession, today } from "./session.ts";

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

const ENTRY_COLUMNS =
  "id,goal_id,minutes,questions,correct_answers,score,note,manual_lesson,theory_stage,created_at,studied_on";

const GOAL_COLUMNS =
  "id,type,status,weekday,day_position,subject,title,description,lesson,block," +
  "planned_minutes,due_on,completed_at,notebook_block_id,week_number";

const GOAL_WITH_ENTRIES = `${GOAL_COLUMNS},goal_entries(${ENTRY_COLUMNS})`;

interface EntryRow {
  id: string;
  goal_id: string;
  minutes: number;
  questions: number;
  correct_answers: number;
  score: number | null;
  note: string | null;
  manual_lesson: string | null;
  theory_stage: StudyEntry["theoryStage"];
  created_at: string;
  studied_on: string | null;
}

interface GoalRow {
  id: string;
  type: Goal["type"];
  status: GoalStatus;
  weekday: number;
  day_position: number;
  subject: string;
  title: string;
  description: string | null;
  lesson: string | null;
  block: string | null;
  planned_minutes: number;
  due_on: string | null;
  completed_at: string | null;
  notebook_block_id: string | null;
  week_number: number;
  goal_entries?: EntryRow[] | null;
}

function toEntry(row: EntryRow): StudyEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    minutes: row.minutes,
    questions: row.questions,
    correctAnswers: row.correct_answers,
    // `score` é coluna GERADA no banco, e vem nula quando não houve questão.
    // Zero aqui não é chute: sem questão respondida a coluna de porcentagem
    // mostra 0 e a tela já distingue pelo total.
    score: row.score ?? 0,
    note: row.note,
    theoryStage: row.theory_stage,
    manualLesson: row.manual_lesson,
    createdAt: row.created_at,
    studiedOn: row.studied_on,
  };
}

function toGoal(row: GoalRow): Goal {
  const entries = (row.goal_entries ?? [])
    .map(toEntry)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    weekday: row.weekday as Weekday,
    dayPosition: row.day_position,
    subject: row.subject,
    title: row.title,
    description: row.description,
    lesson: row.lesson,
    block: row.block,
    plannedMinutes: row.planned_minutes,
    dueOn: row.due_on,
    completedAt: row.completed_at,
    spentMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
    questionsAnswered: entries.reduce((sum, entry) => sum + entry.questions, 0),
    correctAnswers: entries.reduce((sum, entry) => sum + entry.correctAnswers, 0),
    entries,
    /**
     * QUEM ESCOLHE A AULA É O MOTOR, NÃO A META — e por isso `goals` não tem
     * coluna apontando para `theory_lessons`, nem precisa de uma.
     *
     * A meta diz a DISCIPLINA; a aula atual é a mais recente que o professor
     * publicou no catálogo vinculado ao planejamento.
     *
     * Preenchido por `attachTheory`, que resolve o catálogo uma vez por semana
     * em vez de uma vez por meta.
     */
    theory: null,
  };
}

/** Meta de bateria: o resultado dela é do motor, e o motor não existe ainda. */
export function isQuizGoal(row: { notebook_block_id: string | null }): boolean {
  return row.notebook_block_id !== null;
}

async function planStartsOn(studyPlanId: Uuid): Promise<IsoDate> {
  const { data, error } = await supabase
    .from("study_plans")
    .select("starts_on")
    .eq("id", studyPlanId)
    .maybeSingle();

  if (error) throwDb(error);
  if (!data) throw new Error("Planejamento não encontrado.");
  return data.starts_on;
}

/**
 * As datas em que houve registro, para a sequência de dias.
 *
 * Vai ALÉM DA SEMANA de propósito: "dias seguidos até hoje" atravessa a virada
 * de semana, e limitar a consulta à semana exibida faria a sequência cair para
 * zero toda segunda-feira. Noventa dias é folga suficiente para qualquer
 * sequência que valha mostrar.
 */
async function entryDates(studentId: Uuid): Promise<readonly IsoDate[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("goal_entries")
    .select("created_at,studied_on")
    .eq("student_id", studentId)
    // Um extra é sempre de antes do lançamento: o corte por `created_at` não
    // perde nenhum dia estudado dentro da janela.
    .gte("created_at", since);

  if (error) throwDb(error);
  return (data ?? []).map((row) => entryDay({ createdAt: row.created_at, studiedOn: row.studied_on }));
}

export async function listWeeks(studyPlanId: Uuid): Promise<readonly WeekOption[]> {
  const startsOn = await planStartsOn(studyPlanId);

  const { data, error } = await supabase
    .from("goals")
    .select("week_number")
    .eq("study_plan_id", studyPlanId);

  if (error) throwDb(error);

  const current = weekNumberOf(startsOn, today());
  // A semana corrente entra na lista mesmo sem meta nenhuma: é para ela que o
  // seletor abre, e uma lista que não a contém abriria numa semana passada.
  const numbers = new Set<number>([current, ...(data ?? []).map((row) => row.week_number)]);

  return [...numbers]
    .sort((a, b) => a - b)
    .map((weekNumber) => ({
      weekNumber,
      ...weekBounds(startsOn, weekNumber),
      isCurrent: weekNumber === current,
    }));
}

export async function loadWeek(studyPlanId: Uuid, weekNumber?: number): Promise<Week> {
  const session = await requireSession();
  const startsOn = await planStartsOn(studyPlanId);
  const number = weekNumber ?? weekNumberOf(startsOn, today());
  const bounds = weekBounds(startsOn, number);

  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_WITH_ENTRIES)
    .eq("study_plan_id", studyPlanId)
    .eq("week_number", number);

  if (error) throwDb(error);

  const goals = await attachTheory(studyPlanId, ((data ?? []) as unknown as GoalRow[]).map(toGoal));
  const entries = goals.flatMap((goal) => goal.entries);

  return {
    studyPlanId,
    weekNumber: number,
    startsOn: bounds.startsOn,
    endsOn: bounds.endsOn,
    summary: summarizeWeek(goals, entries, today(), await entryDates(session.profileId)),
    days: groupIntoDays(goals, bounds.startsOn),
  };
}

/**
 * Liga cada meta de TEORIA à aula em que o aluno está.
 *
 * Uma consulta de catálogo para a semana inteira, e não uma por meta: são
 * quatro idas ao servidor fixas em vez de quatro por linha da tela. Meta de
 * disciplina que o catálogo não cobre fica com `theory: null`, e o modal mostra
 * o diagnóstico em vez de inventar aula.
 */
async function attachTheory(studyPlanId: Uuid, goals: readonly Goal[]): Promise<readonly Goal[]> {
  if (!goals.some((goal) => goal.type === "theory")) return goals;

  const refs = await theoryRefsBySubject(studyPlanId);
  if (refs.size === 0) return goals;

  return goals.map((goal) =>
    goal.type === "theory"
      ? { ...goal, theory: refs.get(normalizeSubjectKey(goal.subject)) ?? null }
      : goal,
  );
}

/** Relê uma meta inteira depois de escrever nela. */
async function reloadGoal(goalId: Uuid): Promise<Result<Goal>> {
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_WITH_ENTRIES)
    .eq("id", goalId)
    .maybeSingle();

  if (error) return failure(translateDbError(error));
  if (!data) return fail("not_found", "Meta não encontrada.");
  return done(toGoal(data as unknown as GoalRow));
}

/* ------------------------------------------------------------------ *
 * Escrita
 * ------------------------------------------------------------------ */

interface GoalContext {
  id: string;
  student_id: string;
  teacher_id: string;
  status: GoalStatus;
  notebook_block_id: string | null;
  entries: number;
}

async function goalContext(goalId: Uuid): Promise<GoalContext | null> {
  const { data, error } = await supabase
    .from("goals")
    .select("id,student_id,teacher_id,status,notebook_block_id,goal_entries(id)")
    .eq("id", goalId)
    .maybeSingle();

  if (error) throwDb(error);
  if (!data) return null;

  const row = data as unknown as GoalContext & { goal_entries: { id: string }[] | null };
  return { ...row, entries: (row.goal_entries ?? []).length };
}

/** A recusa que a tela mostra quando a meta é de bateria. */
const QUIZ_GOAL_REFUSAL =
  "O resultado de uma meta de bateria vem do motor de baterias, que ainda está sendo " +
  "reescrito. Por enquanto ela não pode ser registrada nem concluída pela tela.";

/**
 * O erro de uma das duas RPCs de estudo.
 *
 * `23505` aqui é a mesma chave com outra carga (`goal_entries_request_uidx`), e a
 * frase genérica de `23505` mandaria a pessoa tentar de novo com a mesma chave. A
 * outra fonte, rara, é o professor gerando a semana no mesmo instante: também
 * chega aqui, e a frase de "outros valores" é aceita nesse caso.
 */
function studyWriteError(error: { code?: string | null; message: string }): ApiError {
  if (error.code === "23505") return { code: "conflict", message: STUDY_REPLAY_CONFLICT };
  return translateDbError(error);
}

export function recordStudy(input: RecordStudyInput): Promise<Result<Goal>> {
  // Fora do `once`: recusa de formulário não ocupa a chave nem gasta uma viagem.
  const invalid = checkStudyEntry(input);
  if (invalid) return Promise.resolve(failure<Goal>(invalid));

  // O `once` só junta o clique duplo. A garantia é `goal_entries_request_uidx`,
  // dentro da RPC: a resposta que se perde e a nova tentativa gravam uma vez.
  return once(input.requestId, async () => {
    const { error } = await supabase.rpc("record_goal_entry", {
      p_request_id: input.requestId,
      p_goal_id: input.goalId,
      p_minutes: input.minutes,
      p_questions: input.questions,
      p_correct_answers: input.correctAnswers,
      ...(input.note ? { p_note: input.note } : {}),
      ...(input.manualLesson ? { p_manual_lesson: input.manualLesson } : {}),
      ...(input.theoryStage ? { p_theory_stage: input.theoryStage } : {}),
    });
    if (error) {
      // `23514` não chega aqui: `checkStudyEntry` cobre cada CHECK. A meta de
      // bateria é a RPC recusando em português (P0001), e a tela já não a oferece.
      return failure<Goal>(studyWriteError(error));
    }

    // A meta é RELIDA, e não montada: registrar também move `pending` para
    // `in_progress`, e a tela precisa do estado que o banco gravou.
    return reloadGoal(input.goalId);
  });
}

export function removeStudyEntry(entryId: Uuid, requestId: RequestId): Promise<Result<Goal>> {
  return once(requestId, async () => {
    const { data, error } = await supabase
      .from("goal_entries")
      .select("goal_id")
      .eq("id", entryId)
      .maybeSingle();

    if (error) return failure<Goal>(translateDbError(error));
    if (!data) return fail<Goal>("not_found", "Registro não encontrado.");

    // O DELETE barrado pela policy FILTRA EM SILÊNCIO: sem contar, a tela
    // fingiria sucesso com o acesso vencido (N-05).
    const { error: deleteError, count } = await supabase
      .from("goal_entries")
      .delete({ count: "exact" })
      .eq("id", entryId);
    if (deleteError) return failure<Goal>(translateDbError(deleteError));
    if (count === 0) {
      return fail<Goal>(
        "forbidden",
        "Você não tem permissão para esta operação, ou seu acesso venceu.",
      );
    }

    // O estado da meta acompanha o que SOBROU: apagar o último registro de uma
    // meta em andamento devolve "pendente", senão a tela mostra "em andamento"
    // numa linha sem nada registrado.
    const context = await goalContext(data.goal_id);
    if (context && context.status === "in_progress") {
      await supabase
        .from("goals")
        .update({ status: statusFromEntries(context.entries) })
        .eq("id", data.goal_id);
    }

    return reloadGoal(data.goal_id);
  });
}

function changeStatus(
  goalId: Uuid,
  requestId: RequestId,
  decide: (context: GoalContext) => Result<{ status: GoalStatus; completed_at: string | null }>,
): Promise<Result<Goal>> {
  return once(requestId, async () => {
    const context = await goalContext(goalId);
    if (!context) return fail<Goal>("not_found", "Meta não encontrada.");
    if (isQuizGoal(context)) return fail<Goal>("conflict", QUIZ_GOAL_REFUSAL);

    const decision = decide(context);
    if (!decision.ok) return decision as Result<Goal>;

    const { error } = await supabase.from("goals").update(decision.data).eq("id", goalId);
    if (error) return failure<Goal>(translateDbError(error));

    return reloadGoal(goalId);
  });
}

export function completeGoal(goalId: Uuid, requestId: RequestId): Promise<Result<Goal>> {
  return changeStatus(goalId, requestId, (context) =>
    // Concluir duas vezes é CONFLITO, e não um segundo sucesso: quase sempre é
    // outra aba que já fechou a meta, e dizer "pronto" esconderia isso.
    context.status === "completed"
      ? fail("conflict", "Esta meta já está concluída.")
      : done({ status: "completed" as const, completed_at: new Date().toISOString() }),
  );
}

export function reopenGoal(goalId: Uuid, requestId: RequestId): Promise<Result<Goal>> {
  return changeStatus(goalId, requestId, (context) =>
    context.status !== "completed"
      ? fail("conflict", "Esta meta não está concluída.")
      : done({ status: statusFromEntries(context.entries), completed_at: null }),
  );
}

export function skipGoal(goalId: Uuid, requestId: RequestId): Promise<Result<Goal>> {
  return changeStatus(goalId, requestId, (context) =>
    context.status === "completed"
      ? fail("conflict", "Uma meta concluída não pode ser pulada. Reabra antes.")
      : done({ status: "skipped" as const, completed_at: null }),
  );
}

export function recordExtraStudy(input: ExtraStudyInput): Promise<Result<Goal>> {
  return once(input.requestId, async () => {
    // O piso é o `starts_on` do planejamento, e quem o lê é o adaptador: a regra
    // de `validation.ts` recebe a data como dado, igual nas duas implementações.
    const { data: plan, error: planError } = await supabase
      .from("study_plans")
      .select("starts_on")
      .eq("id", input.studyPlanId)
      .maybeSingle();
    if (planError) return failure<Goal>(translateDbError(planError));
    if (!plan) return fail<Goal>("not_found", "Planejamento não encontrado.");

    const invalid = checkExtraStudy(input, plan.starts_on, today());
    if (invalid) return failure<Goal>(invalid);

    // Meta e registro numa transação, com a posição depois da maior do dia (N-02)
    // e a semana derivada da data. O tipo vive no título, e quem o monta é a RPC.
    const { data: goalId, error } = await supabase.rpc("record_extra_study", {
      p_request_id: input.requestId,
      p_study_plan_id: input.studyPlanId,
      p_kind: input.kind,
      p_subject: input.subject.trim(),
      p_date: input.date,
      p_minutes: input.minutes,
      p_questions: input.questions,
      p_correct_answers: input.correctAnswers,
      ...(input.note ? { p_note: input.note } : {}),
    });
    if (error) return failure<Goal>(studyWriteError(error));

    return reloadGoal(goalId);
  });
}
