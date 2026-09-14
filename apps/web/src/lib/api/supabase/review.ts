/**
 * A grade de revisão espaçada, e a lista de reforços.
 *
 * REVISÃO E REFORÇO SÃO COISAS DIFERENTES, e as duas telas continuam separadas:
 * revisão é CALENDÁRIO — relê o que foi estudado, no espaçamento configurado,
 * independentemente de ter ido bem. Reforço é REAÇÃO — nasce de desempenho
 * baixo numa bateria. Juntá-los já foi tentado e produziu uma lista em que o
 * aluno não sabia por que cada linha estava ali.
 *
 * ## Quem configura o espaçamento é o PROFESSOR
 *
 * `theory_review_rules` tem policy de escrita `teacher_id = auth.uid()`. Do
 * lado do aluno a grade é leitura: ele registra as questões da revisão, não
 * muda de quantas em quantas aulas ela vence. `saveReviewSpacing` e
 * `setSelectedSubjects` são da tela do professor.
 */
import { supabase } from "@/lib/supabase/client";
import { normalizeSubjectKey } from "@/lib/domain/theory";

import type {
  Reinforcement,
  Result,
  ReviewGridRow,
  SaveReviewSpacingInput,
  TheoryReview,
  Uuid,
} from "../contract.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { requireSession } from "./session.ts";
import { loadTheoryContext } from "./theory.ts";
import { loadDueReviews } from "./theory.ts";

export async function loadReviewGrid(studyPlanId: Uuid): Promise<readonly ReviewGridRow[]> {
  const context = await loadTheoryContext(studyPlanId);
  if (context.catalogId === null) return [];

  const due = await loadDueReviews(studyPlanId);

  const { data, error } = await supabase
    .from("theory_reviews")
    .select("id,theory_lesson_id,review_number,minimum_questions,questions_answered,status")
    .eq("study_plan_id", studyPlanId);

  if (error) throwDb(error);

  const dueIds = new Set(due.map((review) => review.id));
  const lessonById = new Map(context.lessons.map((lesson) => [lesson.id, lesson]));

  const bySubject = new Map<string, TheoryReview[]>();
  for (const row of data ?? []) {
    const lesson = lessonById.get(row.theory_lesson_id);
    if (!lesson) continue;

    const key = normalizeSubjectKey(lesson.subjectKey);
    const list = bySubject.get(key) ?? [];
    list.push({
      id: row.id,
      lessonId: row.theory_lesson_id,
      lessonTitle: lesson.title,
      subject: lesson.subject,
      reviewNumber: row.review_number,
      minimumQuestions: row.minimum_questions,
      questionsAnswered: row.questions_answered,
      status: row.status,
      due: dueIds.has(row.id),
    });
    bySubject.set(key, list);
  }

  const subjectKeys = [
    ...new Set(context.lessons.map((lesson) => normalizeSubjectKey(lesson.subjectKey))),
  ];

  return subjectKeys
    .map((subjectKey) => {
      const lesson = context.lessons.find(
        (candidate) => normalizeSubjectKey(candidate.subjectKey) === subjectKey,
      );
      const rules = context.reviewRules.get(subjectKey) ?? [];
      const reviews = (bySubject.get(subjectKey) ?? []).sort(
        (a, b) =>
          Number(b.due) - Number(a.due) ||
          a.reviewNumber - b.reviewNumber ||
          a.lessonTitle.localeCompare(b.lessonTitle, "pt-BR"),
      );

      return {
        subject: lesson?.subject ?? subjectKey,
        subjectKey,
        // A primeira regra é a que governa o ritmo; as outras são múltiplos
        // dela, e a tela do professor mostra todas.
        lessonSpacing: rules[0]?.lessonSpacing ?? 0,
        minimumQuestions: rules[0]?.minimumQuestions ?? 0,
        reviews,
        // `selected` não tem onde morar neste schema: a v2 guardava as
        // "matérias do ciclo atual" numa tabela própria, que não foi portada.
        // Toda disciplina com regra configurada conta como selecionada.
        selected: rules.length > 0,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject, "pt-BR"));
}

/**
 * Os reforços já feitos.
 *
 * `reinforcement_cycles` é SELECT e nada mais — quem escreve é o motor de
 * baterias, que saiu com a extensão. Enquanto ele não voltar, esta lista só tem
 * o que o banco antigo trouxe: nada, num banco novo. A tela existe assim mesmo,
 * porque o vazio dela é a resposta certa e não um defeito.
 */
export async function listReinforcements(studyPlanId: Uuid): Promise<readonly Reinforcement[]> {
  const { data, error } = await supabase
    .from("reinforcement_cycles")
    .select("id,subject_key,source_score,source_errors,unique_questions,completed_at,block_id")
    .eq("study_plan_id", studyPlanId)
    .order("completed_at", { ascending: false });

  if (error) throwDb(error);

  const { data: notebooks } = await supabase
    .from("study_plan_notebooks")
    .select("block_id,subject_name,notebook_name")
    .eq("study_plan_id", studyPlanId);

  const byBlock = new Map((notebooks ?? []).map((row) => [row.block_id, row]));

  return (data ?? []).map((row) => {
    const notebook = byBlock.get(row.block_id);
    return {
      id: row.id,
      subject: notebook?.subject_name ?? row.subject_key,
      blockName: notebook?.notebook_name ?? "—",
      sourceScore: row.source_score,
      sourceErrors: row.source_errors,
      uniqueQuestions: row.unique_questions,
      completedAt: row.completed_at,
    };
  });
}

/**
 * O espaçamento de uma revisão — ESCRITA DO PROFESSOR.
 *
 * `theory_review_rules` tem policy `teacher_id = auth.uid()`: o aluno lê a
 * grade e registra as questões, mas não muda de quantas em quantas aulas a
 * matéria volta. É o professor quem decide o ritmo.
 */
export async function saveReviewSpacing(
  input: SaveReviewSpacingInput,
): Promise<Result<ReviewGridRow>> {
  if (input.lessonSpacing < 1 || input.lessonSpacing > 200) {
    return fail("validation", "O espaçamento fica entre 1 e 200 aulas.", "lessonSpacing");
  }
  if (input.minimumQuestions < 1 || input.minimumQuestions > 200) {
    return fail("validation", "O mínimo de questões fica entre 1 e 200.", "minimumQuestions");
  }

  const session = await requireSession();

  const { data: link, error: linkError } = await supabase
    .from("study_plan_theory_catalogs")
    .select("catalog_id")
    .eq("study_plan_id", input.studyPlanId)
    .maybeSingle();

  if (linkError) return failure(translateDbError(linkError));
  if (!link) {
    return fail("conflict", "Este planejamento não tem catálogo de teoria vinculado.");
  }

  const { data: lesson } = await supabase
    .from("theory_lessons")
    .select("subject")
    .eq("catalog_id", link.catalog_id)
    .eq("subject_key", input.subjectKey)
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("theory_review_rules").upsert(
    {
      catalog_id: link.catalog_id,
      teacher_id: session.profileId,
      subject: lesson?.subject ?? input.subjectKey,
      subject_key: input.subjectKey,
      review_number: input.reviewNumber,
      lesson_spacing: input.lessonSpacing,
      minimum_questions: input.minimumQuestions,
    },
    { onConflict: "catalog_id,subject_key,review_number" },
  );

  if (error) return failure(translateDbError(error));

  const fresh = (await loadReviewGrid(input.studyPlanId)).find(
    (row) => row.subjectKey === input.subjectKey,
  );
  return fresh ? done(fresh) : fail("unknown", "A regra não foi gravada.");
}

/**
 * As ações rápidas da v2 — "Selecionar 6 básicas", "Matérias do ciclo atual".
 *
 * NÃO HÁ ONDE GUARDAR A SELEÇÃO neste schema: a v2 tinha uma tabela própria
 * para as matérias do ciclo, e ela não foi portada. Hoje "estar no ciclo"
 * equivale a ter regra de revisão configurada, o que é derivado — e derivado
 * não se escreve.
 *
 * Lança em vez de recusar educadamente pelo mesmo motivo de `redeemCoupon`:
 * não é erro de uso, é operação que não existe. Uma recusa faria a tela
 * oferecer o botão e culpar quem clicou.
 */
export function setSelectedSubjects(): Promise<Result<void>> {
  throw new Error(
    "Selecionar matérias do ciclo precisa de uma tabela que o schema de 14/09/2026 não " +
      "tem. Hoje a seleção é derivada: está no ciclo a disciplina com regra de revisão " +
      "configurada. Ver docs/de-para-schema.md.",
  );
}
