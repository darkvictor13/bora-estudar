/**
 * Planejamentos — criar, editar, ativar e arquivar.
 *
 * UM PLANEJAMENTO ATIVO POR ALUNO é invariante de banco: o índice único
 * parcial `study_plans_one_active_per_student_uidx` (migration
 * `20261006221607_one_active_study_plan`) garante que não existam dois.
 *
 * Ativar é a RPC `activate_study_plan`, que trava os planejamentos do aluno,
 * ARQUIVA o ativo anterior e ativa o novo numa transação. Eram duas requisições,
 * e a rede caindo entre elas deixava o aluno sem planejamento (QA-12); duas
 * abas intercaladas o deixavam com dois (QA-03). A RPC é naturalmente
 * idempotente: o índice garante o estado final e a trava serializa as chamadas.
 * Arquivar continua escrita direta.
 */
import { supabase } from "@/lib/supabase/client";

import type { RequestId, Result, StudyPlanInput, StudyPlanSummary, Uuid } from "../contract.ts";
import { checkPlan, PLAN_NAME_TAKEN } from "../validation.ts";
import { done, fail, failure, isUniqueViolation, translateDbError, throwDb } from "./errors.ts";
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

/**
 * O `23505` do NOME do planejamento: `study_plans_name_per_student_uidx`, único
 * por `(teacher_id, student_id, lower(btrim(name)))`. Casa o nome do índice
 * porque `study_plans` tem outro único, o de um ativo por aluno.
 */
const NAME_INDEX = "study_plans_name_per_student_uidx";

export function createPlan(
  input: StudyPlanInput,
  requestId: RequestId,
): Promise<Result<StudyPlanSummary>> {
  return once(requestId, async () => {
    const invalid = checkPlan(input);
    if (invalid) return failure<StudyPlanSummary>(invalid);

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

    if (error) {
      if (isUniqueViolation(error, NAME_INDEX)) return failure(PLAN_NAME_TAKEN);
      return failure(translateDbError(error));
    }
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
    const invalid = checkPlan(input);
    if (invalid) return failure<StudyPlanSummary>(invalid);

    const { data, error } = await supabase
      .from("study_plans")
      .update(toRow(input))
      .eq("id", planId)
      .select(PLAN_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error, NAME_INDEX)) return failure(PLAN_NAME_TAKEN);
      return failure(translateDbError(error));
    }
    if (!data) return fail("not_found", "Planejamento não encontrado.");
    return done(toPlan(data as PlanRow));
  });
}

export function activatePlan(
  planId: Uuid,
  requestId: RequestId,
): Promise<Result<StudyPlanSummary>> {
  // O `once` só junta o clique duplo. A garantia é da RPC: ativar o que já está
  // ativo devolve a linha sem escrever, e por isso a retentativa depois de uma
  // resposta perdida é sucesso, e não "já está ativo".
  return once(requestId, async () => {
    const { data, error } = await supabase.rpc("activate_study_plan", {
      p_study_plan_id: planId,
    });

    if (error) {
      // As duas recusas desta chamada têm origem única. `42501` é a RPC dizendo
      // "não existe ou não é seu". `23505` só vem do índice de um ativo por
      // aluno: a única coluna que ela escreve é `status`.
      if (error.code === "42501") {
        return fail("not_found", "Planejamento não encontrado, ou não é seu.");
      }
      if (error.code === "23505") {
        return fail(
          "conflict",
          "Este aluno já tem outro planejamento ativo. Atualize a página e tente de novo.",
        );
      }
      return failure(translateDbError(error));
    }
    return done(toPlan(data as unknown as PlanRow));
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
