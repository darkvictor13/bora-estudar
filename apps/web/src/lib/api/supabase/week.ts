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
 *    por ninguém.
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
import { normalizeSubjectKey } from "@/lib/domain/theory";
import { WEEKDAY_NAMES } from "@bora/ui";

import type {
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
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { theoryRefsBySubject } from "./theory.ts";
import { once } from "./idempotency.ts";
import { requireSession, today } from "./session.ts";

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

const ENTRY_COLUMNS =
  "id,goal_id,minutes,questions,correct_answers,score,note,manual_lesson,theory_stage,created_at";

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
     * A meta diz a DISCIPLINA; a aula atual é a primeira daquela disciplina
     * que o aluno ainda não concluiu, no catálogo vinculado ao planejamento.
     * É como a v108.2 funciona ("a aula atual e o caderno TEC são carregados
     * automaticamente do catálogo vinculado"), e é o que faz a meta da semana
     * seguinte continuar de onde a anterior parou sem o professor reescrever
     * nada.
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
    .select("created_at")
    .eq("student_id", studentId)
    .gte("created_at", since);

  if (error) throwDb(error);
  return (data ?? []).map((row) => row.created_at.slice(0, 10));
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

export function recordStudy(input: RecordStudyInput): Promise<Result<Goal>> {
  return once(input.requestId, async () => {
    if (input.correctAnswers > input.questions) {
      return fail<Goal>(
        "validation",
        "Os acertos não podem passar do total de questões.",
        "correctAnswers",
      );
    }
    if (input.minutes <= 0 && input.questions <= 0) {
      return fail<Goal>("validation", "Informe o tempo estudado ou as questões feitas.", "minutes");
    }

    const context = await goalContext(input.goalId);
    if (!context) return fail<Goal>("not_found", "Meta não encontrada.");
    if (isQuizGoal(context)) return fail<Goal>("conflict", QUIZ_GOAL_REFUSAL);

    const { error } = await supabase.from("goal_entries").insert({
      goal_id: input.goalId,
      student_id: context.student_id,
      teacher_id: context.teacher_id,
      minutes: input.minutes,
      questions: input.questions,
      correct_answers: input.correctAnswers,
      ...(input.note ? { note: input.note } : {}),
      ...(input.manualLesson ? { manual_lesson: input.manualLesson } : {}),
      ...(input.theoryStage ? { theory_stage: input.theoryStage } : {}),
    });
    if (error) return failure<Goal>(translateDbError(error));

    // REGISTRAR NÃO CONCLUI. Uma meta pode receber vários registros antes de
    // fechar, e é a separação que o `registro-modal` da v2 tem. O que muda é
    // só "pendente" virar "em andamento".
    if (context.status === "pending") {
      const { error: statusError } = await supabase
        .from("goals")
        .update({ status: "in_progress" })
        .eq("id", input.goalId);
      if (statusError) return failure<Goal>(translateDbError(statusError));
    }

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

    const { error: deleteError } = await supabase.from("goal_entries").delete().eq("id", entryId);
    if (deleteError) return failure<Goal>(translateDbError(deleteError));

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

/** Os cinco tipos de estudo extra da v2, no título que a meta recebe. */
const EXTRA_TITLES: Record<ExtraStudyInput["kind"], string> = {
  dry_law: "Lei seca",
  anki: "Anki",
  mock_exam: "Simulado",
  review: "Revisão",
  extra_questions: "Questões extras",
};

export function recordExtraStudy(input: ExtraStudyInput): Promise<Result<Goal>> {
  return once(input.requestId, async () => {
    if (input.correctAnswers > input.questions) {
      return fail<Goal>(
        "validation",
        "Os acertos não podem passar do total de questões.",
        "correctAnswers",
      );
    }
    if (!input.subject.trim()) {
      return fail<Goal>("validation", "Informe a matéria.", "subject");
    }

    const session = await requireSession();
    const { data: plan, error: planError } = await supabase
      .from("study_plans")
      .select("id,teacher_id,starts_on")
      .eq("id", input.studyPlanId)
      .maybeSingle();

    if (planError) return failure<Goal>(translateDbError(planError));
    if (!plan) return fail<Goal>("not_found", "Planejamento não encontrado.");

    const weekNumber = weekNumberOf(plan.starts_on, input.date);
    // `getUTCDay()` é 0 = domingo; aqui 7 = domingo, como `Weekday`.
    const weekday = (new Date(`${input.date}T00:00:00Z`).getUTCDay() || 7) as Weekday;

    // O tipo é `extra` porque é o único, junto de `reinforcement`, que a RLS
    // deixa o ALUNO criar — e é ele que governa quem pode apagar depois.
    const { data: created, error } = await supabase
      .from("goals")
      .insert({
        study_plan_id: plan.id,
        teacher_id: plan.teacher_id,
        student_id: session.profileId,
        week_number: weekNumber,
        weekday,
        weekday_name: WEEKDAY_NAMES[weekday - 1]!,
        // Depois de tudo que já existe no dia: estudo extra é acréscimo, e
        // entra no fim da lista em vez de empurrar o que o professor planejou.
        day_position: 99,
        type: "extra",
        subject: input.subject.trim(),
        title: EXTRA_TITLES[input.kind],
        planned_minutes: input.minutes,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (error) return failure<Goal>(translateDbError(error));
    if (!created) return fail<Goal>("unknown", "A meta não foi criada.");

    const { error: entryError } = await supabase.from("goal_entries").insert({
      goal_id: created.id,
      student_id: session.profileId,
      teacher_id: plan.teacher_id,
      minutes: input.minutes,
      questions: input.questions,
      correct_answers: input.correctAnswers,
      ...(input.note ? { note: input.note } : {}),
    });

    if (entryError) {
      // A meta sem o registro é lixo que a tela mostraria como estudo de zero
      // minuto. Desfazer é possível porque o aluno pode apagar as do tipo
      // `extra` — é a mesma policy que sustenta o botão de remover.
      await supabase.from("goals").delete().eq("id", created.id);
      return failure<Goal>(translateDbError(entryError));
    }

    return reloadGoal(created.id);
  });
}
