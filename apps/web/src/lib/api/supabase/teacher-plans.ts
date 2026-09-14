/**
 * Planejamentos — criar, editar, ativar e arquivar.
 *
 * UM PLANEJAMENTO ATIVO POR ALUNO é invariante de banco: um índice único
 * parcial garante que não existam dois. Por isso `activatePlan` arquiva o
 * anterior ANTES de ativar o novo — a ordem inversa bate no índice, e o erro
 * que chega à tela é "duplicate key", que não diz nada a ninguém.
 */
import { supabase } from "@/lib/supabase/client";

import type { RequestId, Result, StudyPlanInput, StudyPlanSummary, Uuid } from "../contract.ts";
import { done, fail, failure, translateDbError, throwDb } from "./errors.ts";
import { once } from "./idempotency.ts";
import { PLAN_COLUMNS, requireSession, toPlan, type PlanRow } from "./session.ts";

export async function listPlans(studentId?: Uuid): Promise<readonly StudyPlanSummary[]> {
  const session = await requireSession();

  let query = supabase.from("study_plans").select(PLAN_COLUMNS).eq("teacher_id", session.profileId);
  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error) throwDb(error);

  return ((data ?? []) as unknown as PlanRow[])
    .map(toPlan)
    // Ativo primeiro: é o que o professor procura, e ordem por nome o
    // esconderia atrás do alfabeto.
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.startsOn.localeCompare(a.startsOn),
    );
}

/**
 * Os campos que a tela edita — EXATAMENTE os que o GRANT UPDATE concede.
 *
 * `student_id` e `teacher_id` ficam de fora porque são o contexto: a RLS decide
 * qual linha e nunca qual coluna, e sem o grant por coluna um UPDATE legítimo
 * carregaria junto a mudança de dono.
 */
interface PlanWrite {
  name?: string;
  area?: string;
  target_exam?: string | null;
  stage?: string;
  study_model?: string;
  weekly_goals?: number;
  starts_on?: string;
  exam_date?: string | null;
  class_id?: string | null;
}

function toRow(input: Partial<StudyPlanInput>): PlanWrite {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row["name"] = input.name.trim();
  if (input.area !== undefined) row["area"] = input.area.trim();
  if (input.targetExam !== undefined) row["target_exam"] = input.targetExam.trim() || null;
  if (input.stage !== undefined) row["stage"] = input.stage.trim();
  if (input.studyModel !== undefined) row["study_model"] = input.studyModel.trim();
  if (input.weeklyGoals !== undefined) row["weekly_goals"] = input.weeklyGoals;
  if (input.startsOn !== undefined) row["starts_on"] = input.startsOn;
  if (input.examDate !== undefined) row["exam_date"] = input.examDate || null;
  if (input.classId !== undefined) row["class_id"] = input.classId || null;
  return row as PlanWrite;
}

function validate(input: Partial<StudyPlanInput>): ReturnType<typeof fail> | null {
  if (input.name !== undefined && input.name.trim().length < 3) {
    return fail("validation", "Dê um nome ao planejamento.", "name");
  }
  if (input.weeklyGoals !== undefined && (input.weeklyGoals < 1 || input.weeklyGoals > 60)) {
    return fail("validation", "As metas por semana ficam entre 1 e 60.", "weeklyGoals");
  }
  if (input.examDate && input.startsOn && input.examDate < input.startsOn) {
    return fail("validation", "A prova não pode ser antes do início.", "examDate");
  }
  return null;
}

export function createPlan(
  input: StudyPlanInput,
  requestId: RequestId,
): Promise<Result<StudyPlanSummary>> {
  return once(requestId, async () => {
    const invalid = validate(input);
    if (invalid) return invalid as Result<StudyPlanSummary>;

    const session = await requireSession();

    // NASCE PAUSADO. Ativar é gesto separado, e é o que dispara o arquivamento
    // do anterior: um planejamento que nasce ativo trocaria o do aluno no
    // instante em que o professor clicasse "salvar", antes de ele conferir.
    const { data, error } = await supabase
      .from("study_plans")
      .insert({
        name: input.name.trim(),
        area: input.area.trim(),
        stage: input.stage.trim(),
        study_model: input.studyModel.trim(),
        weekly_goals: input.weeklyGoals,
        starts_on: input.startsOn,
        target_exam: input.targetExam?.trim() || null,
        exam_date: input.examDate || null,
        class_id: input.classId || null,
        student_id: input.studentId,
        teacher_id: session.profileId,
        status: "paused",
      })
      .select(PLAN_COLUMNS)
      .maybeSingle();

    if (error) return failure(translateDbError(error));
    if (!data) return fail("unknown", "O planejamento não foi criado.");
    return done(toPlan(data as PlanRow));
  });
}

export function updatePlan(
  planId: Uuid,
  input: Partial<StudyPlanInput>,
  requestId: RequestId,
): Promise<Result<StudyPlanSummary>> {
  return once(requestId, async () => {
    const invalid = validate(input);
    if (invalid) return invalid as Result<StudyPlanSummary>;

    const { data, error } = await supabase
      .from("study_plans")
      .update(toRow(input))
      .eq("id", planId)
      .select(PLAN_COLUMNS)
      .maybeSingle();

    if (error) return failure(translateDbError(error));
    if (!data) return fail("not_found", "Planejamento não encontrado.");
    return done(toPlan(data as PlanRow));
  });
}

export function activatePlan(
  planId: Uuid,
  requestId: RequestId,
): Promise<Result<StudyPlanSummary>> {
  return once(requestId, async () => {
    const { data: plan, error } = await supabase
      .from("study_plans")
      .select("id,student_id,status")
      .eq("id", planId)
      .maybeSingle();

    if (error) return failure(translateDbError(error));
    if (!plan) return fail("not_found", "Planejamento não encontrado.");
    if (plan.status === "active") return fail("conflict", "Este planejamento já está ativo.");

    // ARQUIVA O ANTERIOR PRIMEIRO. O índice único parcial de "um ativo por
    // aluno" é o guardião; tentar ativar antes bate nele, e "duplicate key"
    // não diz nada a quem está na tela.
    const { error: archiveError } = await supabase
      .from("study_plans")
      .update({ status: "archived" })
      .eq("student_id", plan.student_id)
      .eq("status", "active");

    if (archiveError) return failure(translateDbError(archiveError));

    const { data, error: activateError } = await supabase
      .from("study_plans")
      .update({ status: "active" })
      .eq("id", planId)
      .select(PLAN_COLUMNS)
      .maybeSingle();

    if (activateError) return failure(translateDbError(activateError));
    if (!data) return fail("unknown", "O planejamento não foi ativado.");
    return done(toPlan(data as PlanRow));
  });
}

export function archivePlan(
  planId: Uuid,
  requestId: RequestId,
): Promise<Result<StudyPlanSummary>> {
  return once(requestId, async () => {
    const { data, error } = await supabase
      .from("study_plans")
      .update({ status: "archived" })
      .eq("id", planId)
      .select(PLAN_COLUMNS)
      .maybeSingle();

    if (error) return failure(translateDbError(error));
    if (!data) return fail("not_found", "Planejamento não encontrado.");
    return done(toPlan(data as PlanRow));
  });
}
