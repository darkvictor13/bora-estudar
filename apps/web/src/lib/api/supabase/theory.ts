/**
 * O FLUXO INTELIGENTE DA TEORIA, CONTRA O BANCO.
 *
 * O motor — quem decide qual aula é a atual, o que já venceu e o que libera a
 * próxima — é puro e mora em `lib/domain/theory.ts`. Aqui só há leitura,
 * escrita e a tradução entre o vocabulário do schema e o do contrato.
 *
 * A META NÃO APONTA PARA A AULA, e isso é o desenho, não uma falta. A meta diz
 * a DISCIPLINA; a aula atual é a primeira daquela disciplina que o aluno ainda
 * não concluiu no catálogo vinculado ao planejamento. É o que faz a meta da
 * semana seguinte continuar de onde a anterior parou sem o professor reescrever
 * nada — e é como a v108.2 descreve o comportamento.
 */
import { supabase } from "@/lib/supabase/client";
import {
  currentLesson,
  diagnose,
  dueReviews,
  isLessonComplete,
  isTheoryDone,
  clampPage,
  normalizeSubjectKey,
  sortLessons,
  type EngineLesson,
  type EngineProgress,
  type ReviewRule,
} from "@/lib/domain/theory";

import type {
  RecordInitialQuestionsInput,
  RecordReviewQuestionsInput,
  Result,
  SaveTheoryProgressInput,
  TheoryDiagnosis,
  TheoryGoal,
  TheoryLesson,
  TheoryProgress,
  TheoryReview,
  TheorySubjectControl,
  Uuid,
} from "../contract.ts";
import { done, fail, failure, readFailure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

/* ------------------------------------------------------------------ *
 * O catálogo do planejamento
 * ------------------------------------------------------------------ */

const LESSON_COLUMNS =
  "id,subject,subject_key,lesson_code,position,title,pdf_file,theory_start_page," +
  "theory_end_page,pdf_total_pages,final_questions_start,has_theory,note,active";

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

function toEngineLesson(lesson: TheoryLesson): EngineLesson {
  return {
    id: lesson.id,
    subjectKey: lesson.subjectKey,
    position: lesson.position,
    lessonCode: lesson.lessonCode,
    // Uma aula marcada com teoria mas SEM intervalo auditado não é teoria que
    // se possa acompanhar por página — é exatamente o caso que o diagnóstico
    // `lesson_without_pages` existe para nomear.
    hasTheory: lesson.hasTheory && lesson.theoryEndPage !== null,
    theoryStartPage: lesson.theoryStartPage,
    theoryEndPage: lesson.theoryEndPage,
  };
}

interface ProgressRow {
  theory_lesson_id: string;
  current_page: number;
  theory_done: boolean;
  initial_questions_done: number;
  initial_questions_complete: boolean;
  lesson_done: boolean;
}

function toEngineProgress(row: ProgressRow): EngineProgress {
  return {
    lessonId: row.theory_lesson_id,
    currentPage: row.current_page,
    theoryDone: row.theory_done,
    initialQuestionsDone: row.initial_questions_done,
    lessonDone: row.lesson_done,
  };
}

/** Tudo que o motor precisa de um planejamento, numa ida só ao servidor. */
export interface TheoryContext {
  readonly studyPlanId: Uuid;
  readonly studentId: Uuid;
  readonly teacherId: Uuid;
  readonly catalogId: Uuid | null;
  readonly lessons: readonly TheoryLesson[];
  readonly progress: ReadonlyMap<string, EngineProgress>;
  /** Questões iniciais exigidas, por `subject_key`. */
  readonly initialQuestions: ReadonlyMap<string, number>;
  /** Regras de revisão por `subject_key`, em ordem de número. */
  readonly reviewRules: ReadonlyMap<string, readonly ReviewRule[]>;
}

/** O mínimo de questões iniciais quando o professor não configurou a disciplina. */
const DEFAULT_INITIAL_QUESTIONS = 15;

export async function loadTheoryContext(studyPlanId: Uuid): Promise<TheoryContext> {
  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .select("id,student_id,teacher_id")
    .eq("id", studyPlanId)
    .maybeSingle();

  if (planError) throwDb(planError);
  if (!plan) readFailure("Planejamento não encontrado.");

  const { data: link, error: linkError } = await supabase
    .from("study_plan_theory_catalogs")
    .select("catalog_id")
    .eq("study_plan_id", studyPlanId)
    .maybeSingle();

  if (linkError) throwDb(linkError);
  const catalogId = link?.catalog_id ?? null;

  const base: Omit<TheoryContext, "lessons" | "progress" | "initialQuestions" | "reviewRules"> = {
    studyPlanId,
    studentId: plan.student_id,
    teacherId: plan.teacher_id,
    catalogId,
  };

  if (!catalogId) {
    return {
      ...base,
      lessons: [],
      progress: new Map(),
      initialQuestions: new Map(),
      reviewRules: new Map(),
    };
  }

  const [lessons, progress, subjectRules, reviewRules] = await Promise.all([
    supabase
      .from("theory_lessons")
      .select(LESSON_COLUMNS)
      .eq("catalog_id", catalogId)
      .eq("active", true),
    supabase
      .from("theory_progress")
      .select(
        "theory_lesson_id,current_page,theory_done,initial_questions_done," +
          "initial_questions_complete,lesson_done",
      )
      .eq("study_plan_id", studyPlanId),
    supabase
      .from("theory_catalog_subject_rules")
      .select("subject_key,initial_questions")
      .eq("catalog_id", catalogId)
      .eq("active", true),
    supabase
      .from("theory_review_rules")
      .select("subject_key,review_number,lesson_spacing,minimum_questions")
      .eq("catalog_id", catalogId)
      .eq("active", true),
  ]);

  if (lessons.error) throwDb(lessons.error);
  if (progress.error) throwDb(progress.error);
  if (subjectRules.error) throwDb(subjectRules.error);
  if (reviewRules.error) throwDb(reviewRules.error);

  const rulesBySubject = new Map<string, ReviewRule[]>();
  for (const row of reviewRules.data ?? []) {
    const list = rulesBySubject.get(row.subject_key) ?? [];
    list.push({
      reviewNumber: row.review_number,
      lessonSpacing: row.lesson_spacing,
      minimumQuestions: row.minimum_questions,
    });
    rulesBySubject.set(row.subject_key, list);
  }
  for (const list of rulesBySubject.values()) {
    list.sort((a, b) => a.reviewNumber - b.reviewNumber);
  }

  return {
    ...base,
    lessons: ((lessons.data ?? []) as unknown as LessonRow[]).map(toLesson),
    progress: new Map(
      ((progress.data ?? []) as unknown as ProgressRow[]).map((row) => [
        row.theory_lesson_id,
        toEngineProgress(row),
      ]),
    ),
    initialQuestions: new Map(
      (subjectRules.data ?? []).map((row) => [row.subject_key, row.initial_questions]),
    ),
    reviewRules: rulesBySubject,
  };
}

/**
 * As DUAS chaves pelas quais uma aula pode ser encontrada.
 *
 * O catálogo guarda `subject_key` — a chave canônica que o import do MASTER
 * escreveu — e `subject`, o nome que aparece na tela. A meta guarda só o NOME,
 * em texto livre que o professor digitou. Casar por uma das duas não basta:
 * uma aula com `subject_key = 'rlm'` e uma meta escrita "Raciocínio Lógico"
 * não se encontram pela chave, e uma aula cujo `subject` foi renomeado não se
 * encontra pelo nome.
 *
 * As duas continuam passando por `normalizeSubjectKey`, então a comparação
 * segue EXATA — nada de `includes`, que casaria "ti" dentro de "administrativo".
 */
function lessonKeys(lesson: TheoryLesson): readonly string[] {
  const byKey = normalizeSubjectKey(lesson.subjectKey);
  const byName = normalizeSubjectKey(lesson.subject);
  return byKey === byName ? [byKey] : [byKey, byName];
}

function lessonsOfSubject(
  context: TheoryContext,
  subjectKey: string,
): readonly TheoryLesson[] {
  return context.lessons.filter((lesson) => lessonKeys(lesson).includes(subjectKey));
}

function requiredQuestions(context: TheoryContext, subjectKey: string): number {
  return context.initialQuestions.get(subjectKey) ?? DEFAULT_INITIAL_QUESTIONS;
}

function toProgress(
  lessonId: Uuid,
  engine: EngineProgress | undefined,
  required: number,
): TheoryProgress {
  return {
    lessonId,
    currentPage: engine?.currentPage ?? 0,
    theoryDone: engine?.theoryDone ?? false,
    initialQuestionsDone: engine?.initialQuestionsDone ?? 0,
    initialQuestionsRequired: required,
    initialQuestionsComplete: (engine?.initialQuestionsDone ?? 0) >= required,
    lessonDone: engine?.lessonDone ?? false,
  };
}

/* ------------------------------------------------------------------ *
 * Revisões
 * ------------------------------------------------------------------ */

const REVIEW_COLUMNS =
  "id,theory_lesson_id,review_number,minimum_questions,questions_answered,status";

interface ReviewRow {
  id: string;
  theory_lesson_id: string;
  review_number: number;
  minimum_questions: number;
  questions_answered: number;
  status: TheoryReview["status"];
}

/**
 * As revisões do aluno, já classificadas em VENCIDA ou não.
 *
 * A linha em `theory_reviews` é o registro; quem diz se ela venceu é o motor,
 * pelo espaçamento em aulas concluídas. Guardar "vencida" como coluna criaria
 * um número mantido à mão que envelhece a cada aula nova.
 */
async function reviewsOf(
  context: TheoryContext,
  lessonIds?: readonly string[],
): Promise<readonly TheoryReview[]> {
  let query = supabase
    .from("theory_reviews")
    .select(REVIEW_COLUMNS)
    .eq("study_plan_id", context.studyPlanId);

  if (lessonIds) query = query.in("theory_lesson_id", lessonIds);

  const { data, error } = await query;
  if (error) throwDb(error);

  const byId = new Map(context.lessons.map((lesson) => [lesson.id, lesson]));

  // O conjunto do que venceu, por disciplina, calculado uma vez.
  const dueKeys = new Set<string>();
  for (const [subjectKey, rules] of context.reviewRules) {
    const lessons = lessonsOfSubject(context, subjectKey).map(toEngineLesson);
    for (const item of dueReviews(lessons, context.progress, rules)) {
      dueKeys.add(`${item.lesson.id}|${item.rule.reviewNumber}`);
    }
  }

  return ((data ?? []) as unknown as ReviewRow[])
    .map((row) => {
      const lesson = byId.get(row.theory_lesson_id);
      return {
        id: row.id,
        lessonId: row.theory_lesson_id,
        lessonTitle: lesson?.title ?? "Aula removida do catálogo",
        subject: lesson?.subject ?? "—",
        reviewNumber: row.review_number,
        minimumQuestions: row.minimum_questions,
        questionsAnswered: row.questions_answered,
        status: row.status,
        due:
          row.status !== "completed" &&
          dueKeys.has(`${row.theory_lesson_id}|${row.review_number}`),
      };
    })
    .sort(
      (a, b) => Number(b.due) - Number(a.due) || a.subject.localeCompare(b.subject, "pt-BR"),
    );
}

/**
 * Cria as revisões da aula que acabou de fechar.
 *
 * Uma linha por regra ativa da disciplina, em `pending`. `on conflict do
 * nothing` pela unicidade (aluno, plano, aula, número): concluir a mesma aula
 * duas vezes — reabrir e fechar de novo — não pode duplicar a fila.
 */
async function createReviewsFor(
  context: TheoryContext,
  lesson: TheoryLesson,
): Promise<void> {
  const rules = context.reviewRules.get(normalizeSubjectKey(lesson.subjectKey)) ?? [];
  if (rules.length === 0) return;

  await supabase.from("theory_reviews").upsert(
    // Sem `teacher_id`: `theory_reviews` não o carrega. O contexto dela vem da
    // FK composta com `study_plans`, que já amarra o trio.
    rules.map((rule) => ({
      study_plan_id: context.studyPlanId,
      student_id: context.studentId,
      theory_lesson_id: lesson.id,
      review_number: rule.reviewNumber,
      minimum_questions: rule.minimumQuestions,
    })),
    { onConflict: "student_id,study_plan_id,theory_lesson_id,review_number", ignoreDuplicates: true },
  );
}

/**
 * Grava o progresso da aula SEM `upsert`, e o motivo é o grant por coluna.
 *
 * `theory_progress` concede UPDATE só nas colunas de progresso: `student_id`,
 * `study_plan_id` e `theory_lesson_id` ficam de fora, porque são o CONTEXTO —
 * a RLS decide qual linha, nunca qual coluna, e sem o grant por coluna um
 * UPDATE legítimo carregaria junto a mudança de dono.
 *
 * O `upsert` do PostgREST manda todas as colunas no `ON CONFLICT DO UPDATE`,
 * inclusive as de contexto, e o Postgres recusa com `42501` mesmo quando os
 * valores são idênticos. Por isso: INSERT quando não existe, UPDATE só das
 * colunas de progresso quando existe.
 */
/** As colunas de PROGRESSO — as únicas que o grant deixa o aluno atualizar. */
interface ProgressWrite {
  current_page?: number;
  theory_done?: boolean;
  theory_done_at?: string;
  initial_questions_done?: number;
  initial_questions_complete?: boolean;
  initial_questions_complete_at?: string;
  lesson_done?: boolean;
  lesson_done_at?: string;
}

async function writeProgress(
  studyPlanId: Uuid,
  studentId: Uuid,
  lessonId: Uuid,
  exists: boolean,
  values: ProgressWrite,
): Promise<ReturnType<typeof translateDbError> | null> {
  if (exists) {
    const { error } = await supabase
      .from("theory_progress")
      .update(values)
      .eq("study_plan_id", studyPlanId)
      .eq("student_id", studentId)
      .eq("theory_lesson_id", lessonId);
    return error ? translateDbError(error) : null;
  }

  const { error } = await supabase.from("theory_progress").insert({
    study_plan_id: studyPlanId,
    student_id: studentId,
    theory_lesson_id: lessonId,
    ...values,
  });
  return error ? translateDbError(error) : null;
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

export async function loadTheoryControl(
  studyPlanId: Uuid,
): Promise<readonly TheorySubjectControl[]> {
  const context = await loadTheoryContext(studyPlanId);
  const reviews = await reviewsOf(context);

  const subjectKeys = [
    ...new Set(context.lessons.map((lesson) => normalizeSubjectKey(lesson.subjectKey))),
  ];

  return subjectKeys
    .map((subjectKey) => {
      const lessons = lessonsOfSubject(context, subjectKey);
      const engineLessons = lessons.map(toEngineLesson);
      const current = currentLesson(engineLessons, context.progress);
      const currentTheory = current
        ? (lessons.find((lesson) => lesson.id === current.lesson.id) ?? null)
        : null;

      const dueForSubject = reviews.filter(
        (review) =>
          review.due && lessons.some((lesson) => lesson.id === review.lessonId),
      ).length;

      return {
        subject: lessons[0]?.subject ?? subjectKey,
        subjectKey,
        diagnosis: diagnose(
          lessons[0]?.subject ?? subjectKey,
          engineLessons,
          current?.lesson ?? null,
          context.catalogId !== null,
          currentTheory?.title ?? "",
        ) as TheoryDiagnosis,
        lessonsTotal: lessons.length,
        lessonsDone: lessons.filter((lesson) => context.progress.get(lesson.id)?.lessonDone).length,
        currentLesson: currentTheory,
        reviewsDue: dueForSubject,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject, "pt-BR"));
}

export async function loadTheoryGoal(goalId: Uuid): Promise<TheoryGoal> {
  const { data: goal, error } = await supabase
    .from("goals")
    .select("id,study_plan_id,subject,type")
    .eq("id", goalId)
    .maybeSingle();

  if (error) throwDb(error);
  if (!goal) readFailure("Meta não encontrada.");

  const context = await loadTheoryContext(goal.study_plan_id);
  const subjectKey = normalizeSubjectKey(goal.subject);
  const lessons = lessonsOfSubject(context, subjectKey);
  const engineLessons = lessons.map(toEngineLesson);
  const current = currentLesson(engineLessons, context.progress);
  const lesson = current ? (lessons.find((l) => l.id === current.lesson.id) ?? null) : null;

  const diagnosis = diagnose(
    goal.subject,
    engineLessons,
    current?.lesson ?? null,
    context.catalogId !== null,
    lesson?.title ?? "",
  ) as TheoryDiagnosis;

  const required = requiredQuestions(context, subjectKey);
  const progress =
    lesson && diagnosis.kind === "ok"
      ? toProgress(lesson.id, context.progress.get(lesson.id), required)
      : null;

  return {
    goalId,
    diagnosis,
    lesson: diagnosis.kind === "ok" ? lesson : null,
    progress,
    reviews: await reviewsOf(context, lessons.map((l) => l.id)),
    // A PRÓXIMA AULA SÓ LIBERA depois do mínimo de questões iniciais desta.
    // Revisão vencida NÃO entra nesta conta: ela é fila, não muro.
    nextLessonUnlocked: Boolean(
      lesson && isLessonComplete(toEngineLesson(lesson), context.progress.get(lesson.id) ?? null, required),
    ),
  };
}

export async function loadDueReviews(studyPlanId: Uuid): Promise<readonly TheoryReview[]> {
  const context = await loadTheoryContext(studyPlanId);
  return (await reviewsOf(context)).filter((review) => review.due);
}

/* ------------------------------------------------------------------ *
 * Escrita
 * ------------------------------------------------------------------ */

/**
 * Guarda o ponto real da teoria.
 *
 * `endSession` NÃO aparece em lugar nenhum daqui, e a ausência é a regra: o
 * progresso gravado é o mesmo nos dois botões. "Salvar e encerrar sessão" só
 * muda o que a TELA faz depois — fecha o modal. Encerrar a sessão não conclui
 * a aula, e escrever `lesson_done` aqui seria exatamente o erro que a v108.2
 * separou.
 */
export function saveTheoryProgress(
  input: SaveTheoryProgressInput,
): Promise<Result<TheoryProgress>> {
  return once(input.requestId, async () => {
    const session = await requireSession();

    const { data: lessonRow, error: lessonError } = await supabase
      .from("theory_lessons")
      .select(LESSON_COLUMNS)
      .eq("id", input.lessonId)
      .maybeSingle();

    if (lessonError) return failure<TheoryProgress>(translateDbError(lessonError));
    if (!lessonRow) return fail<TheoryProgress>("not_found", "Aula não encontrada.");

    const lesson = toLesson(lessonRow as unknown as LessonRow);
    const engine = toEngineLesson(lesson);

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("study_plan_id,teacher_id,subject")
      .eq("id", input.goalId)
      .maybeSingle();

    if (goalError) return failure<TheoryProgress>(translateDbError(goalError));
    if (!goal) return fail<TheoryProgress>("not_found", "Meta não encontrada.");

    const page = clampPage(engine, input.currentPage) ?? 0;
    const theoryDone = isTheoryDone(engine, page);

    const existing = await loadTheoryContext(goal.study_plan_id);
    const writeError = await writeProgress(
      goal.study_plan_id,
      session.profileId,
      lesson.id,
      existing.progress.has(lesson.id),
      {
        current_page: page,
        theory_done: theoryDone,
        ...(theoryDone ? { theory_done_at: new Date().toISOString() } : {}),
      },
    );
    if (writeError) return failure<TheoryProgress>(writeError);

    const context = await loadTheoryContext(goal.study_plan_id);
    const required = requiredQuestions(context, normalizeSubjectKey(goal.subject));

    // A teoria pode ter acabado AGORA, e com as questões já feitas a aula fecha
    // neste mesmo gesto — é o "se a teoria terminar durante a sessão, o fluxo
    // passa para questões iniciais" da v108.2, visto do outro lado.
    await maybeCompleteLesson(context, lesson, required);

    const fresh = await loadTheoryContext(goal.study_plan_id);
    return done(toProgress(lesson.id, fresh.progress.get(lesson.id), required));
  });
}

/** Fecha a aula quando teoria e questões iniciais estiverem cumpridas. */
async function maybeCompleteLesson(
  context: TheoryContext,
  lesson: TheoryLesson,
  required: number,
): Promise<void> {
  const progress = context.progress.get(lesson.id) ?? null;
  const complete = isLessonComplete(toEngineLesson(lesson), progress, required);
  if (!complete || progress?.lessonDone) return;

  const now = new Date().toISOString();
  await supabase
    .from("theory_progress")
    .update({
      lesson_done: true,
      lesson_done_at: now,
      initial_questions_complete: true,
      initial_questions_complete_at: now,
    })
    .eq("study_plan_id", context.studyPlanId)
    .eq("theory_lesson_id", lesson.id);

  await createReviewsFor(context, lesson);
}

export function recordInitialQuestions(
  input: RecordInitialQuestionsInput,
): Promise<Result<TheoryProgress>> {
  return once(input.requestId, async () => {
    if (input.correctAnswers > input.questions) {
      return fail<TheoryProgress>(
        "validation",
        "Os acertos não podem passar do total de questões.",
        "correctAnswers",
      );
    }
    if (input.questions <= 0) {
      return fail<TheoryProgress>("validation", "Informe quantas questões você fez.", "questions");
    }

    const session = await requireSession();

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("study_plan_id,teacher_id,subject")
      .eq("id", input.goalId)
      .maybeSingle();

    if (goalError) return failure<TheoryProgress>(translateDbError(goalError));
    if (!goal) return fail<TheoryProgress>("not_found", "Meta não encontrada.");

    const context = await loadTheoryContext(goal.study_plan_id);
    const lesson = context.lessons.find((candidate) => candidate.id === input.lessonId);
    if (!lesson) return fail<TheoryProgress>("not_found", "Aula não encontrada no catálogo.");

    const before = context.progress.get(lesson.id);
    const writeError = await writeProgress(
      goal.study_plan_id,
      session.profileId,
      lesson.id,
      before !== undefined,
      {
        // SOMA, não substitui: as questões iniciais podem ser feitas em duas
        // sentadas, e substituir apagaria a primeira.
        initial_questions_done: (before?.initialQuestionsDone ?? 0) + input.questions,
      },
    );
    if (writeError) return failure<TheoryProgress>(writeError);

    // O estudo também entra no ledger da meta: o tempo e o desempenho da semana
    // contam as questões iniciais como qualquer outro estudo.
    await supabase.from("goal_entries").insert({
      goal_id: input.goalId,
      student_id: session.profileId,
      teacher_id: goal.teacher_id,
      minutes: 0,
      questions: input.questions,
      correct_answers: input.correctAnswers,
      theory_stage: "questions_in_progress",
      manual_lesson: lesson.title,
    });

    const required = requiredQuestions(context, normalizeSubjectKey(goal.subject));
    const after = await loadTheoryContext(goal.study_plan_id);
    await maybeCompleteLesson(after, lesson, required);

    const fresh = await loadTheoryContext(goal.study_plan_id);
    return done(toProgress(lesson.id, fresh.progress.get(lesson.id), required));
  });
}

export function recordReviewQuestions(
  input: RecordReviewQuestionsInput,
): Promise<Result<TheoryReview>> {
  return once(input.requestId, async () => {
    if (input.correctAnswers > input.questions) {
      return fail<TheoryReview>(
        "validation",
        "Os acertos não podem passar do total de questões.",
        "correctAnswers",
      );
    }

    const { data: row, error } = await supabase
      .from("theory_reviews")
      .select("id,study_plan_id,theory_lesson_id,minimum_questions,questions_answered,status")
      .eq("id", input.reviewId)
      .maybeSingle();

    if (error) return failure<TheoryReview>(translateDbError(error));
    if (!row) return fail<TheoryReview>("not_found", "Revisão não encontrada.");
    if (row.status === "completed") {
      return fail<TheoryReview>("conflict", "Esta revisão já foi concluída.");
    }

    const answered = row.questions_answered + input.questions;
    const complete = answered >= row.minimum_questions;
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("theory_reviews")
      .update({
        questions_answered: answered,
        status: complete ? "completed" : "in_progress",
        started_at: now,
        ...(complete ? { completed_at: now } : {}),
      })
      .eq("id", row.id);

    if (updateError) return failure<TheoryReview>(translateDbError(updateError));

    const context = await loadTheoryContext(row.study_plan_id);
    const fresh = (await reviewsOf(context)).find((review) => review.id === row.id);
    if (!fresh) return fail<TheoryReview>("not_found", "Revisão não encontrada.");
    return done(fresh);
  });
}

/**
 * A aula atual de cada disciplina, para as metas de teoria da semana.
 *
 * Resolve o catálogo UMA VEZ por semana, e não uma vez por meta: são quatro
 * consultas fixas em vez de quatro por linha da tela.
 */
export async function theoryRefsBySubject(
  studyPlanId: Uuid,
): Promise<ReadonlyMap<string, { lessonId: Uuid; subjectKey: string }>> {
  const context = await loadTheoryContext(studyPlanId);
  const out = new Map<string, { lessonId: Uuid; subjectKey: string }>();
  if (context.catalogId === null) return out;

  const subjectKeys = [
    ...new Set(context.lessons.map((lesson) => normalizeSubjectKey(lesson.subjectKey))),
  ];

  for (const subjectKey of subjectKeys) {
    const subjectLessons = lessonsOfSubject(context, subjectKey);
    const current = currentLesson(sortLessons(subjectLessons.map(toEngineLesson)), context.progress);
    if (!current) continue;

    // Indexado pelas duas chaves: a meta pode dizer "RLM" ou "Raciocínio
    // Lógico e Matemática", e as duas precisam achar a mesma aula.
    for (const key of new Set(subjectLessons.flatMap(lessonKeys))) {
      out.set(key, { lessonId: current.lesson.id, subjectKey });
    }
  }
  return out;
}
