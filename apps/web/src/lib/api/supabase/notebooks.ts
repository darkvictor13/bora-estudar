/**
 * Os cadernos TEC do planejamento.
 *
 * Servem às DUAS áreas: o aluno os abre para responder, o professor os edita.
 * A separação é de policy, não de consulta — `study_plan_notebooks` é legível
 * pelos dois e escrevível só pelo professor —, então a leitura mora aqui uma
 * vez e cada tela decide o que oferecer.
 */
import { supabase } from "@/lib/supabase/client";

import type { Notebook, RequestId, Result, Uuid } from "../contract.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";

const NOTEBOOK_COLUMNS =
  "block_id,subject_key,subject_name,subject_color,subject_target,notebook_key," +
  "notebook_name,notebook_link,total_questions,subject_position,notebook_position,active,deleted";

interface NotebookRow {
  block_id: string;
  subject_key: string;
  subject_name: string;
  subject_color: string;
  subject_target: number;
  notebook_key: string;
  notebook_name: string;
  notebook_link: string;
  total_questions: number;
  subject_position: number;
  notebook_position: number;
  active: boolean;
  deleted: boolean;
}

export function toNotebook(row: NotebookRow): Notebook {
  return {
    blockId: row.block_id,
    subjectKey: row.subject_key,
    subjectName: row.subject_name,
    subjectColor: row.subject_color,
    subjectTarget: row.subject_target,
    notebookKey: row.notebook_key,
    notebookName: row.notebook_name,
    notebookLink: row.notebook_link,
    totalQuestions: row.total_questions,
    subjectPosition: row.subject_position,
    notebookPosition: row.notebook_position,
    active: row.active,
    deleted: row.deleted,
  };
}

export async function listNotebooks(studyPlanId: Uuid): Promise<readonly Notebook[]> {
  const { data, error } = await supabase
    .from("study_plan_notebooks")
    .select(NOTEBOOK_COLUMNS)
    .eq("study_plan_id", studyPlanId);

  if (error) throwDb(error);

  // A ordem é a que o professor montou: disciplina, depois caderno. O nome
  // desempata para a lista não trocar de ordem entre duas leituras.
  return ((data ?? []) as unknown as NotebookRow[])
    .map(toNotebook)
    .sort(
      (a, b) =>
        a.subjectPosition - b.subjectPosition ||
        a.subjectName.localeCompare(b.subjectName, "pt-BR") ||
        a.notebookPosition - b.notebookPosition ||
        a.notebookName.localeCompare(b.notebookName, "pt-BR"),
    );
}

/* ------------------------------------------------------------------ *
 * Escrita — só o professor
 * ------------------------------------------------------------------ */

/**
 * As colunas que o GRANT UPDATE concede.
 *
 * `block_id` fica de fora: é a IDENTIDADE do caderno, e o gatilho
 * `protect_notebook_identity` a congela. As metas de bateria apontam para ela
 * por FK composta — mudá-la moveria o histórico de um caderno para outro.
 */
interface NotebookWrite {
  subject_key?: string;
  subject_name?: string;
  subject_color?: string;
  subject_target?: number;
  notebook_key?: string;
  notebook_name?: string;
  notebook_link?: string;
  total_questions?: number;
  subject_position?: number;
  notebook_position?: number;
  active?: boolean;
  deleted?: boolean;
}

async function writeNotebook(
  blockId: Uuid,
  values: NotebookWrite,
): Promise<Result<Notebook>> {
  const { data, error } = await supabase
    .from("study_plan_notebooks")
    .update(values)
    .eq("block_id", blockId)
    .select(NOTEBOOK_COLUMNS)
    .maybeSingle();

  if (error) return failure(translateDbError(error));
  if (!data) return fail("not_found", "Caderno não encontrado.");
  return done(toNotebook(data as unknown as NotebookRow));
}

export function saveNotebook(
  studyPlanId: Uuid,
  notebook: Notebook,
  requestId: RequestId,
): Promise<Result<Notebook>> {
  return once(requestId, async () => {
    if (!notebook.notebookName.trim()) {
      return fail<Notebook>("validation", "Dê um nome ao caderno.", "notebookName");
    }
    if (notebook.totalQuestions < 0) {
      return fail<Notebook>("validation", "O total de questões não pode ser negativo.", "totalQuestions");
    }

    const values: NotebookWrite = {
      subject_key: notebook.subjectKey,
      subject_name: notebook.subjectName,
      subject_color: notebook.subjectColor,
      subject_target: notebook.subjectTarget,
      notebook_key: notebook.notebookKey,
      notebook_name: notebook.notebookName.trim(),
      notebook_link: notebook.notebookLink,
      total_questions: notebook.totalQuestions,
      subject_position: notebook.subjectPosition,
      notebook_position: notebook.notebookPosition,
      active: notebook.active,
    };

    const { data: existing } = await supabase
      .from("study_plan_notebooks")
      .select("block_id")
      .eq("block_id", notebook.blockId)
      .maybeSingle();

    if (existing) return writeNotebook(notebook.blockId, values);

    const { data: plan, error: planError } = await supabase
      .from("study_plans")
      .select("teacher_id,student_id")
      .eq("id", studyPlanId)
      .maybeSingle();

    if (planError) return failure<Notebook>(translateDbError(planError));
    if (!plan) return fail<Notebook>("not_found", "Planejamento não encontrado.");

    const { data, error } = await supabase
      .from("study_plan_notebooks")
      .insert({
        ...values,
        block_id: notebook.blockId,
        study_plan_id: studyPlanId,
        teacher_id: plan.teacher_id,
        student_id: plan.student_id,
        notebook_name: values.notebook_name!,
        notebook_key: values.notebook_key!,
        notebook_link: values.notebook_link!,
        subject_key: values.subject_key!,
        subject_name: values.subject_name!,
        subject_color: values.subject_color!,
      })
      .select(NOTEBOOK_COLUMNS)
      .maybeSingle();

    if (error) return failure<Notebook>(translateDbError(error));
    if (!data) return fail<Notebook>("unknown", "O caderno não foi criado.");
    return done(toNotebook(data as unknown as NotebookRow));
  });
}

export function setNotebookActive(
  blockId: Uuid,
  active: boolean,
  requestId: RequestId,
): Promise<Result<Notebook>> {
  return once(requestId, () => writeNotebook(blockId, { active }));
}

/**
 * REMOVER É MARCAR, NÃO APAGAR.
 *
 * `deleted = true` em vez de DELETE, e não é preciosismo: a meta de bateria
 * aponta para o caderno por FK com `ON DELETE RESTRICT`, e um caderno apagado
 * levaria junto o histórico — ou, pior, seria recusado pelo banco no meio de um
 * gesto que a tela prometeu. `restoreNotebook` desfaz.
 */
export function deleteNotebook(blockId: Uuid, requestId: RequestId): Promise<Result<Notebook>> {
  return once(requestId, () => writeNotebook(blockId, { deleted: true, active: false }));
}

export function restoreNotebook(blockId: Uuid, requestId: RequestId): Promise<Result<Notebook>> {
  return once(requestId, () => writeNotebook(blockId, { deleted: false }));
}
