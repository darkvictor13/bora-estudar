/**
 * O planejamento e as disciplinas, do lado do aluno — leitura e nada mais.
 *
 * As DISCIPLINAS SÃO DO PROFESSOR, não do planejamento: `subjects.teacher_id`
 * é a dona, e a RLS as abre para quem tem vínculo com aquele professor
 * (`can_access_teacher`). É por isso que `loadSubjects` recebe o planejamento e
 * começa perguntando de quem ele é — o aluno não conhece o professor pelo id,
 * conhece pelo plano que está estudando.
 */
import { supabase } from "@/lib/supabase/client";

import type { StudyPlanSummary, Subject, SubjectBlock, Uuid } from "../contract.ts";
import { readFailure, throwDb } from "./errors.ts";
import { activePlanOf, PLAN_COLUMNS, requireSession, toPlan, type PlanRow } from "./session.ts";

export async function loadActivePlan(): Promise<StudyPlanSummary> {
  const session = await requireSession();
  const plan = await activePlanOf(session.profileId);
  if (!plan) {
    // Lança, e não devolve `null`: o contrato promete o planejamento ativo, e
    // uma tela que precisa dele não tem o que desenhar sem ele. Quem quer
    // tratar a ausência chama `loadActivePlanOrNull`.
    readFailure("Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.");
  }
  return plan;
}

/** A mesma coisa, para a tela que SABE desenhar o estado vazio. */
export async function loadActivePlanOrNull(): Promise<StudyPlanSummary | null> {
  const session = await requireSession();
  return activePlanOf(session.profileId);
}

export async function loadPlan(studyPlanId: Uuid): Promise<StudyPlanSummary> {
  const { data, error } = await supabase
    .from("study_plans")
    .select(PLAN_COLUMNS)
    .eq("id", studyPlanId)
    .maybeSingle();

  if (error) throwDb(error);
  if (!data) readFailure("Planejamento não encontrado.");
  return toPlan(data as PlanRow);
}

interface ItemRow {
  id: string;
  name: string;
  position: number | null;
  link: string | null;
}

function toItems(rows: readonly ItemRow[]): readonly SubjectBlock[] {
  return [...rows]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, "pt-BR"))
    .map((row) => ({ id: row.id, name: row.name, position: row.position ?? 0, link: row.link }));
}

export async function loadSubjects(studyPlanId: Uuid): Promise<readonly Subject[]> {
  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .select("teacher_id")
    .eq("id", studyPlanId)
    .maybeSingle();

  if (planError) throwDb(planError);
  if (!plan) readFailure("Planejamento não encontrado.");

  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id,name,color,weight,target_score,active," +
        "subject_blocks(id,name,position,link)," +
        "subject_lessons(id,name,position,link)",
    )
    .eq("teacher_id", plan.teacher_id)
    .eq("active", true);

  if (error) throwDb(error);

  interface SubjectRow {
    id: string;
    name: string;
    color: string | null;
    weight: number;
    target_score: number;
    subject_blocks: ItemRow[] | null;
    subject_lessons: ItemRow[] | null;
  }

  return ((data ?? []) as unknown as SubjectRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      // O default da coluna é azul-claro, mas ela é nullable: uma disciplina
      // sem cor fica com a listra invisível, e a tela usa a listra para
      // distinguir uma da outra.
      color: row.color ?? "#38bdf8",
      weight: row.weight,
      targetScore: row.target_score,
      blocks: toItems(row.subject_blocks ?? []),
      lessons: toItems(row.subject_lessons ?? []),
    }))
    // Peso maior primeiro — é a ordem em que o professor quer que se estude —,
    // e o nome desempata para a lista não dançar entre duas leituras.
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "pt-BR"));
}
