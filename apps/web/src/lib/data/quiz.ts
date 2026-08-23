import type { SeenQuestion } from "@bora/protocol";

import { supabase } from "@/lib/supabase/client";

const PAGE_SIZE = 1000;
/** Teto de segurança: 50 páginas cobrem 50 mil questões distintas por bloco. */
const MAX_PAGES = 50;

export interface QuestionHistory {
  readonly items: readonly SeenQuestion[];
  /**
   * `false` quando o teto de páginas foi atingido e pode haver mais histórico.
   *
   * Vai no payload como `historyComplete`. A extensão avisa o aluno de que
   * pode haver repetição em vez de fingir que o histórico é autoritativo — foi
   * exatamente essa mentira que fez o motor anterior repetir questões em
   * silêncio depois de ~30 baterias no mesmo bloco.
   */
  readonly complete: boolean;
}

/**
 * Questões que o aluno já respondeu neste bloco, em sessões concluídas.
 *
 * Lê da view agregada: uma linha por questão distinta, e não uma por resposta.
 * Ainda assim pagina, porque o teto de linhas do PostgREST vale para qualquer
 * resposta e um bloco grande com histórico longo passa de mil questões.
 */
export async function getQuestionHistory(
  studyPlanId: string,
  blockId: string,
): Promise<QuestionHistory> {
  const items: SeenQuestion[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("vw_seen_questions")
      .select("question_id,times_seen,correct_answers,incorrect_answers,last_seen_at")
      .eq("study_plan_id", studyPlanId)
      .eq("block_id", blockId)
      .order("question_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data ?? [];

    for (const row of rows) {
      items.push({
        questionId: Number(row.question_id),
        timesSeen: Number(row.times_seen ?? 0),
        correctAnswers: Number(row.correct_answers ?? 0),
        incorrectAnswers: Number(row.incorrect_answers ?? 0),
        lastSeenAt: row.last_seen_at ?? new Date(0).toISOString(),
      });
    }

    if (rows.length < PAGE_SIZE) return { items, complete: true };
  }

  return { items, complete: false };
}

/**
 * Questões do bloco, na ordem do catálogo.
 *
 * Também paginada: um bloco do catálogo passa de mil questões com facilidade.
 */
export async function getBlockQuestions(catalogBlockId: string): Promise<number[]> {
  const ids: number[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("catalog_questions")
      .select("question_id")
      .eq("block_id", catalogBlockId)
      .order("position")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data ?? [];
    ids.push(...rows.map((r) => Number(r.question_id)));
    if (rows.length < PAGE_SIZE) break;
  }

  return ids;
}

export async function getQuizSession(quizSessionId: string) {
  const { data } = await supabase
    .from("quiz_sessions")
    .select("id,goal_id,block_id,study_plan_id,session_number,main_target,status,started_at,finished_at")
    .eq("id", quizSessionId)
    .maybeSingle();
  return data;
}
