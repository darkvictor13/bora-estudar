/**
 * O catálogo de teoria, do lado do professor.
 *
 * O MASTER NÃO ENTRA NO BUNDLE. São 1,9 MB de JSON; ele chega como arquivo
 * escolhido no `<input type="file">` e é achatado aqui, pelo mesmo motor puro
 * que a v2 usava. Importar do site faria todo aluno baixar o catálogo inteiro
 * para abrir a tela de metas.
 */
import { supabase } from "@/lib/supabase/client";
import { normalizeSubjectKey } from "@/lib/domain/theory";

import type {
  ImportMasterInput,
  ImportMasterResult,
  RequestId,
  Result,
  TheoryCatalog,
  TheoryLesson,
  TheorySubjectRule,
  Uuid,
} from "../contract.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

export async function listCatalogs(): Promise<readonly TheoryCatalog[]> {
  const session = await requireSession();

  const { data, error } = await supabase
    .from("theory_catalogs")
    .select("id,name,key,description,active,theory_lessons(id,subject_key)")
    .eq("teacher_id", session.profileId);

  if (error) throwDb(error);

  interface Row {
    id: string;
    name: string;
    key: string;
    description: string | null;
    active: boolean;
    theory_lessons: { id: string; subject_key: string }[] | null;
  }

  return ((data ?? []) as unknown as Row[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      key: row.key,
      description: row.description,
      active: row.active,
      lessonCount: (row.theory_lessons ?? []).length,
      subjectCount: new Set((row.theory_lessons ?? []).map((lesson) => lesson.subject_key)).size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const LESSON_COLUMNS =
  "id,subject,subject_key,lesson_code,position,title,pdf_file,theory_start_page," +
  "theory_end_page,pdf_total_pages,final_questions_start,has_theory,note";

interface LessonRow {
  id: string;
  subject: string;
  subject_key: string;
  lesson_code: string;
  position: number;
  title: string;
  pdf_file: string;
  theory_start_page: number | null;
  theory_end_page: number | null;
  pdf_total_pages: number | null;
  final_questions_start: number | null;
  has_theory: boolean;
  note: string | null;
}

function toLesson(row: LessonRow): TheoryLesson {
  return {
    id: row.id,
    subject: row.subject,
    subjectKey: row.subject_key,
    lessonCode: row.lesson_code,
    position: row.position,
    title: row.title,
    pdfFile: row.pdf_file,
    theoryStartPage: row.theory_start_page,
    theoryEndPage: row.theory_end_page,
    pdfTotalPages: row.pdf_total_pages,
    finalQuestionsStart: row.final_questions_start,
    hasTheory: row.has_theory,
    note: row.note,
  };
}

export async function loadCatalogLessons(catalogId: Uuid): Promise<readonly TheoryLesson[]> {
  const { data, error } = await supabase
    .from("theory_lessons")
    .select(LESSON_COLUMNS)
    .eq("catalog_id", catalogId);

  if (error) throwDb(error);

  return ((data ?? []) as unknown as LessonRow[])
    .map(toLesson)
    .sort(
      (a, b) =>
        a.subject.localeCompare(b.subject, "pt-BR") ||
        a.position - b.position ||
        a.lessonCode.localeCompare(b.lessonCode, "pt-BR"),
    );
}

export async function loadSubjectRules(catalogId: Uuid): Promise<readonly TheorySubjectRule[]> {
  const [subjects, rules, lessons] = await Promise.all([
    supabase
      .from("theory_catalog_subject_rules")
      .select("subject,subject_key,initial_questions,active")
      .eq("catalog_id", catalogId),
    supabase
      .from("theory_review_rules")
      .select("subject_key,review_number,lesson_spacing,minimum_questions,active")
      .eq("catalog_id", catalogId),
    supabase.from("theory_lessons").select("subject,subject_key").eq("catalog_id", catalogId),
  ]);

  if (subjects.error) throwDb(subjects.error);
  if (rules.error) throwDb(rules.error);
  if (lessons.error) throwDb(lessons.error);

  // TODA DISCIPLINA DO CATÁLOGO APARECE, mesmo sem regra configurada: a tela
  // existe para configurar, e uma disciplina que só aparece depois de
  // configurada é impossível de configurar.
  const known = new Map<string, string>();
  for (const lesson of lessons.data ?? []) known.set(lesson.subject_key, lesson.subject);
  for (const subject of subjects.data ?? []) known.set(subject.subject_key, subject.subject);

  const configured = new Map((subjects.data ?? []).map((row) => [row.subject_key, row]));

  return [...known.entries()]
    .map(([subjectKey, subject]) => ({
      subject,
      subjectKey,
      initialQuestions: configured.get(subjectKey)?.initial_questions ?? 15,
      active: configured.get(subjectKey)?.active ?? true,
      reviews: (rules.data ?? [])
        .filter((rule) => rule.subject_key === subjectKey)
        .map((rule) => ({
          reviewNumber: rule.review_number,
          lessonSpacing: rule.lesson_spacing,
          minimumQuestions: rule.minimum_questions,
          active: rule.active,
        }))
        .sort((a, b) => a.reviewNumber - b.reviewNumber),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, "pt-BR"));
}

/** Até cinco revisões por disciplina — o teto da v108. */
const MAX_REVIEWS = 5;

export function saveSubjectRule(
  catalogId: Uuid,
  rule: TheorySubjectRule,
  requestId: RequestId,
): Promise<Result<TheorySubjectRule>> {
  return once(requestId, async () => {
    if (rule.initialQuestions < 1 || rule.initialQuestions > 200) {
      return fail<TheorySubjectRule>(
        "validation",
        "As questões iniciais ficam entre 1 e 200.",
        "initialQuestions",
      );
    }
    if (rule.reviews.length > MAX_REVIEWS) {
      return fail<TheorySubjectRule>(
        "validation",
        `São no máximo ${MAX_REVIEWS} revisões por disciplina.`,
      );
    }

    const session = await requireSession();

    const { error } = await supabase.from("theory_catalog_subject_rules").upsert(
      {
        catalog_id: catalogId,
        teacher_id: session.profileId,
        subject: rule.subject,
        subject_key: rule.subjectKey,
        initial_questions: rule.initialQuestions,
        active: rule.active,
      },
      { onConflict: "catalog_id,subject_key" },
    );
    if (error) return failure<TheorySubjectRule>(translateDbError(error));

    // As revisões são substituídas por inteiro: a tela manda a lista completa,
    // e casar uma a uma deixaria órfã a que o professor removeu.
    const { error: clearError } = await supabase
      .from("theory_review_rules")
      .delete()
      .eq("catalog_id", catalogId)
      .eq("subject_key", rule.subjectKey);
    if (clearError) return failure<TheorySubjectRule>(translateDbError(clearError));

    if (rule.reviews.length > 0) {
      const { error: insertError } = await supabase.from("theory_review_rules").insert(
        rule.reviews.map((review) => ({
          catalog_id: catalogId,
          teacher_id: session.profileId,
          subject: rule.subject,
          subject_key: rule.subjectKey,
          review_number: review.reviewNumber,
          lesson_spacing: review.lessonSpacing,
          minimum_questions: review.minimumQuestions,
          active: review.active,
        })),
      );
      if (insertError) return failure<TheorySubjectRule>(translateDbError(insertError));
    }

    const fresh = (await loadSubjectRules(catalogId)).find(
      (candidate) => candidate.subjectKey === rule.subjectKey,
    );
    return fresh ? done(fresh) : fail<TheorySubjectRule>("unknown", "A regra não foi gravada.");
  });
}

export function saveLessonOrder(
  _catalogId: Uuid,
  lessonIds: readonly Uuid[],
  requestId: RequestId,
): Promise<Result<void>> {
  return once(requestId, async () => {
    // Uma escrita por aula, e não um `upsert` em lote: `theory_lessons` tem
    // grant de UPDATE por tabela, mas o lote exigiria mandar todas as colunas
    // de cada linha — e a posição é a única coisa que mudou.
    for (const [index, id] of lessonIds.entries()) {
      const { error } = await supabase
        .from("theory_lessons")
        .update({ position: index + 1 })
        .eq("id", id);
      if (error) return failure<void>(translateDbError(error));
    }
    return done(undefined);
  });
}

export function saveLesson(
  lesson: TheoryLesson,
  requestId: RequestId,
): Promise<Result<TheoryLesson>> {
  return once(requestId, async () => {
    if (
      lesson.hasTheory &&
      lesson.theoryStartPage !== null &&
      lesson.theoryEndPage !== null &&
      lesson.theoryEndPage < lesson.theoryStartPage
    ) {
      return fail<TheoryLesson>(
        "validation",
        "O fim da teoria não pode vir antes do início.",
        "theoryEndPage",
      );
    }
    if (
      lesson.theoryEndPage !== null &&
      lesson.pdfTotalPages !== null &&
      lesson.theoryEndPage > lesson.pdfTotalPages
    ) {
      return fail<TheoryLesson>(
        "validation",
        "O fim da teoria passa do total de páginas do PDF.",
        "theoryEndPage",
      );
    }

    const { data, error } = await supabase
      .from("theory_lessons")
      .update({
        title: lesson.title,
        lesson_code: lesson.lessonCode,
        position: lesson.position,
        pdf_file: lesson.pdfFile,
        theory_start_page: lesson.theoryStartPage,
        theory_end_page: lesson.theoryEndPage,
        pdf_total_pages: lesson.pdfTotalPages,
        final_questions_start: lesson.finalQuestionsStart,
        has_theory: lesson.hasTheory,
        note: lesson.note,
      })
      .eq("id", lesson.id)
      .select(LESSON_COLUMNS)
      .maybeSingle();

    if (error) return failure<TheoryLesson>(translateDbError(error));
    if (!data) return fail<TheoryLesson>("not_found", "Aula não encontrada.");
    return done(toLesson(data as unknown as LessonRow));
  });
}

export function linkCatalogToPlan(
  studyPlanId: Uuid,
  catalogId: Uuid,
  requestId: RequestId,
): Promise<Result<void>> {
  return once(requestId, async () => {
    const { data: plan, error } = await supabase
      .from("study_plans")
      .select("id,teacher_id,student_id")
      .eq("id", studyPlanId)
      .maybeSingle();

    if (error) return failure<void>(translateDbError(error));
    if (!plan) return fail<void>("not_found", "Planejamento não encontrado.");

    const { data: existing } = await supabase
      .from("study_plan_theory_catalogs")
      .select("id")
      .eq("study_plan_id", studyPlanId)
      .maybeSingle();

    // UM CATÁLOGO POR PLANEJAMENTO — `study_plan_id` é único na tabela. Trocar
    // é UPDATE; o `upsert` mandaria as colunas de contexto, que ficam fora do
    // grant.
    const { error: writeError } = existing
      ? await supabase
          .from("study_plan_theory_catalogs")
          .update({ catalog_id: catalogId })
          .eq("study_plan_id", studyPlanId)
      : await supabase.from("study_plan_theory_catalogs").insert({
          study_plan_id: studyPlanId,
          catalog_id: catalogId,
          teacher_id: plan.teacher_id,
          student_id: plan.student_id,
        });

    if (writeError) return failure<void>(translateDbError(writeError));
    return done(undefined);
  });
}

/* ------------------------------------------------------------------ *
 * Importação do MASTER
 * ------------------------------------------------------------------ */

interface MasterRecord {
  arquivo?: string;
  arquivo_pdf?: string;
  aula?: string;
  codigo_aula?: string;
  titulo?: string;
  ordem?: number;
  disciplina?: string;
  pagina_inicio_teoria?: number | null;
  fim_teoria_regra_simplificada?: number | null;
  total_paginas_pdf?: number | null;
  inicio_questoes_finais?: number | null;
  tem_teoria?: boolean;
  observacao?: string;
}

/**
 * Achata o JSON do MASTER em linhas de aula.
 *
 * É o `flattenMapping` da v2, e as regras dele são as mesmas: sem arquivo não
 * há aula; `tem_teoria` só vale com fim de teoria maior que zero; e o código da
 * aula sai do campo, do nome do arquivo ou de um número sequencial — nessa
 * ordem, porque o MASTER v16 tem as três formas.
 */
export function flattenMaster(master: unknown): readonly Omit<LessonRow, "id">[] {
  if (!master || typeof master !== "object") {
    throw new Error("O arquivo não é um JSON de mapeamento válido.");
  }
  const subjects = (master as { disciplinas?: unknown }).disciplinas;
  if (!subjects || typeof subjects !== "object") {
    throw new Error('O JSON precisa conter o objeto "disciplinas".');
  }

  const rows: Omit<LessonRow, "id">[] = [];

  for (const [subjectName, items] of Object.entries(subjects as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;

    items.forEach((raw, index) => {
      const record = raw as MasterRecord;
      const file = String(record.arquivo ?? record.arquivo_pdf ?? "").trim();
      if (!file) return;

      const code =
        String(record.aula ?? record.codigo_aula ?? "").trim() ||
        `ITEM-${String(index + 1).padStart(3, "0")}`;

      const end = record.fim_teoria_regra_simplificada ?? null;
      const start = record.pagina_inicio_teoria ?? 1;
      const hasTheory = record.tem_teoria !== false && Number(end ?? 0) > 0;
      const subject = String(record.disciplina ?? subjectName).trim();

      rows.push({
        subject,
        subject_key: normalizeSubjectKey(subject),
        lesson_code: code,
        position: Number.isInteger(record.ordem) ? Number(record.ordem) : index + 1,
        title: String(record.titulo ?? "").trim() || `Aula ${code}`,
        pdf_file: file,
        theory_start_page: hasTheory ? Math.max(1, Number(start) || 1) : null,
        theory_end_page: hasTheory ? Number(end) : null,
        pdf_total_pages: record.total_paginas_pdf ?? null,
        final_questions_start: record.inicio_questoes_finais ?? null,
        has_theory: hasTheory,
        note: String(record.observacao ?? "").trim() || null,
      });
    });
  }

  return rows;
}

export function importMaster(input: ImportMasterInput): Promise<Result<ImportMasterResult>> {
  return once(input.requestId, async () => {
    let rows: readonly Omit<LessonRow, "id">[];
    try {
      rows = flattenMaster(input.master);
    } catch (failureReason) {
      return fail<ImportMasterResult>(
        "validation",
        failureReason instanceof Error ? failureReason.message : "Arquivo inválido.",
      );
    }
    if (rows.length === 0) {
      return fail<ImportMasterResult>("validation", "Nenhuma aula encontrada no arquivo.");
    }

    const session = await requireSession();

    const { data: existing, error } = await supabase
      .from("theory_lessons")
      .select("id,subject_key,pdf_file")
      .eq("catalog_id", input.catalogId);

    if (error) return failure<ImportMasterResult>(translateDbError(error));

    // A CHAVE DE IDENTIDADE É (disciplina, arquivo), como na v2: o mesmo PDF na
    // mesma disciplina é a mesma aula, e reimportar o MASTER corrigido tem de
    // ATUALIZAR as páginas em vez de duplicar a aula — e o progresso do aluno
    // aponta para o id, que precisa sobreviver.
    const byKey = new Map(
      (existing ?? []).map((row) => [`${row.subject_key}|${row.pdf_file}`, row.id]),
    );

    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const id = byKey.get(`${row.subject_key}|${row.pdf_file}`);
      if (id) {
        const { error: updateError } = await supabase
          .from("theory_lessons")
          .update(row)
          .eq("id", id);
        if (updateError) return failure<ImportMasterResult>(translateDbError(updateError));
        updated += 1;
      } else {
        const { error: insertError } = await supabase
          .from("theory_lessons")
          .insert({ ...row, catalog_id: input.catalogId, teacher_id: session.profileId });
        if (insertError) return failure<ImportMasterResult>(translateDbError(insertError));
        created += 1;
      }
    }

    // AS DISCIPLINAS SEM PÁGINA SÃO RELATADAS, não escondidas. É o que faz o
    // professor saber que Matemática Financeira e TI ficaram de fora da
    // auditoria antes de o aluno descobrir sozinho.
    const withoutPages = [
      ...new Set(
        rows
          .filter((row) => !row.has_theory)
          .map((row) => row.subject),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));

    return done({
      lessonsCreated: created,
      lessonsUpdated: updated,
      subjectsWithoutPages: withoutPages,
    });
  });
}
