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
import { PMPR_SOLDADO_2025 } from "@/lib/domain/pmpr-soldado";
import { readLessonMaterialBlocks, validateLessonMaterialBlocks, validateLessonResources } from "@/lib/domain/lesson-resources";
import { readFlashcardCards, validateFlashcardCards } from "@/lib/domain/flashcards";
import type { Json } from "@bora/database";

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

/** O catálogo é único por professor. Repetir a ação completa regras ausentes. */
export function ensurePmprPilotCatalog(requestId: RequestId): Promise<Result<Uuid>> {
  return once(requestId, async () => {
    const session = await requireSession();
    const find = () => supabase
      .from("theory_catalogs")
      .select("id")
      .eq("teacher_id", session.profileId)
      .eq("key", PMPR_SOLDADO_2025.key)
      .maybeSingle();

    const current = await find();
    if (current.error) return failure<Uuid>(translateDbError(current.error));
    let catalogId = current.data?.id;

    if (!catalogId) {
      const created = await supabase.from("theory_catalogs").insert({
        teacher_id: session.profileId,
        key: PMPR_SOLDADO_2025.key,
        name: PMPR_SOLDADO_2025.name,
        description: `${PMPR_SOLDADO_2025.reference} · aulas presenciais publicadas pelo professor`,
      }).select("id").single();
      if (created.error && created.error.code !== "23505") {
        return failure<Uuid>(translateDbError(created.error));
      }
      if (created.error) {
        const raced = await find();
        if (raced.error) return failure<Uuid>(translateDbError(raced.error));
        catalogId = raced.data?.id;
      } else {
        catalogId = created.data.id;
      }
    }

    if (!catalogId) return fail<Uuid>("unknown", "Não foi possível localizar o catálogo PMPR.");

    const { error } = await supabase.from("theory_catalog_subject_rules").upsert(
      PMPR_SOLDADO_2025.subjects.map((subject) => ({
        catalog_id: catalogId,
        teacher_id: session.profileId,
        subject: subject.name,
        subject_key: normalizeSubjectKey(subject.name),
        initial_questions: 15,
        active: true,
      })),
      { onConflict: "catalog_id,subject_key", ignoreDuplicates: true },
    );
    if (error) return failure<Uuid>(translateDbError(error));
    return done(catalogId);
  });
}

const LESSON_COLUMNS =
  "id,subject,subject_key,lesson_code,position,title,pdf_file,theory_start_page," +
  "theory_end_page,pdf_total_pages,final_questions_start,has_theory,note,published," +
  "pdf_url,flashcards_url,flash_summary_url,tec_questions_url,qc_questions_url,material_blocks,flashcard_cards";

interface LessonRow {
  id: string;
  published: boolean;
  subject: string;
  subject_key: string;
  lesson_code: string;
  position: number;
  title: string;
  pdf_file: string;
  pdf_url: string | null;
  flashcards_url: string | null;
  flash_summary_url: string | null;
  tec_questions_url: string | null;
  qc_questions_url: string | null;
  material_blocks: unknown;
  flashcard_cards: unknown;
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
    published: row.published,
    subject: row.subject,
    subjectKey: row.subject_key,
    lessonCode: row.lesson_code,
    position: row.position,
    title: row.title,
    pdfFile: row.pdf_file,
    resources: {
      pdf: row.pdf_url,
      flashcards: row.flashcards_url,
      flashSummary: row.flash_summary_url,
      tecQuestions: row.tec_questions_url,
      qcQuestions: row.qc_questions_url,
    },
    materialBlocks: readLessonMaterialBlocks(row.material_blocks),
    flashcardCards: readFlashcardCards(row.flashcard_cards),
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

/** A aula começa sem material e invisível ao aluno; o professor a edita antes de publicar. */
export function createDraftLesson(
  catalogId: Uuid,
  subject: string,
  title: string,
  requestId: RequestId,
): Promise<Result<TheoryLesson>> {
  return once(requestId, async () => {
    const cleanSubject = subject.trim();
    const cleanTitle = title.trim();
    if (!cleanSubject || cleanTitle.length < 3 || cleanTitle.length > 180) {
      return fail<TheoryLesson>("validation", "Informe a matéria e um título de 3 a 180 caracteres.");
    }
    const session = await requireSession();
    const { data: catalog, error: catalogError } = await supabase
      .from("theory_catalogs")
      .select("id,key")
      .eq("id", catalogId)
      .eq("teacher_id", session.profileId)
      .maybeSingle();
    if (catalogError) return failure<TheoryLesson>(translateDbError(catalogError));
    if (!catalog) return fail<TheoryLesson>("not_found", "Catálogo não encontrado.");
    if (
      catalog.key === PMPR_SOLDADO_2025.key &&
      !PMPR_SOLDADO_2025.subjects.some((candidate) => candidate.name === cleanSubject)
    ) {
      return fail<TheoryLesson>("validation", "Escolha uma matéria do edital de Soldado PMPR.");
    }

    const subjectKey = normalizeSubjectKey(cleanSubject);
    const latest = await supabase.from("theory_lessons")
      .select("position")
      .eq("catalog_id", catalogId)
      .eq("subject_key", subjectKey)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) return failure<TheoryLesson>(translateDbError(latest.error));

    const created = await supabase.from("theory_lessons").insert({
      id: requestId,
      teacher_id: session.profileId,
      catalog_id: catalogId,
      subject: cleanSubject,
      subject_key: subjectKey,
      lesson_code: `AULA-${requestId.slice(0, 8).toUpperCase()}`,
      position: (latest.data?.position ?? 0) + 1,
      title: cleanTitle,
      pdf_file: `manual/${requestId}`,
      has_theory: false,
      published: false,
    }).select(LESSON_COLUMNS).single();
    if (created.error?.code === "23505") {
      const existing = await supabase.from("theory_lessons")
        .select(LESSON_COLUMNS)
        .eq("id", requestId)
        .eq("catalog_id", catalogId)
        .maybeSingle();
      if (existing.error) return failure<TheoryLesson>(translateDbError(existing.error));
      if (existing.data) return done(toLesson(existing.data as unknown as LessonRow));
    }
    if (created.error) return failure<TheoryLesson>(translateDbError(created.error));
    return done(toLesson(created.data as unknown as LessonRow));
  });
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
    const invalidResource = validateLessonResources(lesson.resources);
    if (invalidResource) {
      return fail<TheoryLesson>("validation", invalidResource.message, invalidResource.field);
    }
    const invalidBlock = validateLessonMaterialBlocks(lesson.materialBlocks);
    if (invalidBlock) return fail<TheoryLesson>("validation", invalidBlock, "materialBlocks");
    const invalidCards = validateFlashcardCards(lesson.flashcardCards ?? []);
    if (invalidCards) return fail<TheoryLesson>("validation", invalidCards, "flashcardCards");
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
        pdf_url: lesson.resources.pdf,
        flashcards_url: lesson.resources.flashcards,
        flash_summary_url: lesson.resources.flashSummary,
        tec_questions_url: lesson.resources.tecQuestions,
        qc_questions_url: lesson.resources.qcQuestions,
        material_blocks: lesson.materialBlocks as unknown as Json,
        flashcard_cards: (lesson.flashcardCards ?? []) as unknown as Json,
        theory_start_page: lesson.theoryStartPage,
        theory_end_page: lesson.theoryEndPage,
        pdf_total_pages: lesson.pdfTotalPages,
        final_questions_start: lesson.finalQuestionsStart,
        has_theory: lesson.hasTheory,
        note: lesson.note,
        published: lesson.published,
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

type MasterLessonRow = Omit<LessonRow,
  "id" | "published" | "pdf_url" | "flashcards_url" | "flash_summary_url" |
  "tec_questions_url" | "qc_questions_url" | "material_blocks" | "flashcard_cards"
>;

/**
 * Achata o JSON do MASTER em linhas de aula.
 *
 * É o `flattenMapping` da v2, e as regras dele são as mesmas: sem arquivo não
 * há aula; `tem_teoria` só vale com fim de teoria maior que zero; e o código da
 * aula sai do campo, do nome do arquivo ou de um número sequencial — nessa
 * ordem, porque o MASTER v16 tem as três formas.
 */
export function flattenMaster(master: unknown): readonly MasterLessonRow[] {
  if (!master || typeof master !== "object") {
    throw new Error("O arquivo não é um JSON de mapeamento válido.");
  }
  const subjects = (master as { disciplinas?: unknown }).disciplinas;
  if (!subjects || typeof subjects !== "object") {
    throw new Error('O JSON precisa conter o objeto "disciplinas".');
  }

  const rows: MasterLessonRow[] = [];

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
    let rows: readonly MasterLessonRow[];
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
