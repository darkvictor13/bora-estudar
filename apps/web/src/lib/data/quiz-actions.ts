"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildStartUrl, type QuizResult, type QuizStart } from "@bora/protocol";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStudentAccess } from "@/lib/auth/session";
import { getBlockQuestions, getQuestionHistory } from "@/lib/data/quiz";
import { ROUTES } from "@/lib/routes";
import type { FormState } from "@/lib/auth/actions";

const TEC_QUESTIONS_URL = "https://www.tecconcursos.com.br/questoes";

export interface StartResult {
  readonly error?: string;
  /** URL do TEC com o payload no fragmento. O cliente navega para cá. */
  readonly url?: string;
}

/**
 * Abre a sessão e monta o payload para a extensão.
 *
 * A RPC é chamada antes de montar o payload porque é ela que decide o número
 * da sessão e retoma uma sessão já aberta em vez de criar outra.
 */
export async function startQuizSession(goalId: string, returnUrl: string): Promise<StartResult> {
  await requireStudentAccess();
  const supabase = await createServerSupabaseClient();

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id,study_plan_id,block_id,type")
    .eq("id", goalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (goalError) return { error: goalError.message };
  if (!goal) return { error: "Meta não encontrada." };
  if (goal.type !== "question_block" || !goal.block_id) {
    return { error: "Esta meta não é uma bateria de questões." };
  }

  const { data: session, error: rpcError } = await supabase.rpc("start_quiz_session", {
    p_study_plan_id: goal.study_plan_id,
    p_block_id: goal.block_id,
    p_goal_id: goal.id,
  });
  if (rpcError) return { error: rpcError.message };

  const opened = Array.isArray(session) ? session[0] : session;
  if (!opened) return { error: "A abertura da sessão não retornou nada." };

  const { data: block } = await supabase
    .from("study_plan_blocks")
    .select("catalog_block_id")
    .eq("id", goal.block_id)
    .maybeSingle();

  if (!block?.catalog_block_id) {
    return { error: "Este bloco não está ligado a um bloco do catálogo." };
  }

  const [available, history] = await Promise.all([
    getBlockQuestions(block.catalog_block_id),
    getQuestionHistory(goal.study_plan_id, goal.block_id),
  ]);

  if (!available.length) return { error: "O bloco do catálogo não tem questões cadastradas." };

  const payload: QuizStart = {
    returnUrl,
    quizSessionId: opened.id,
    goalId: goal.id,
    studyPlanId: goal.study_plan_id,
    blockId: goal.block_id,
    sessionNumber: opened.session_number ?? 1,
    mainTarget: opened.main_target,
    availableQuestions: available,
    history: history.items,
    historyComplete: history.complete,
  };

  revalidatePath(ROUTES.student.overview);
  return { url: buildStartUrl(TEC_QUESTIONS_URL, payload) };
}

/**
 * Grava o resultado devolvido pela extensão.
 *
 * O `requestId` vem no payload e é reusado em toda retentativa: quem o gera é
 * a extensão, uma vez, antes de navegar. Reenviar o mesmo resultado devolve o
 * estado anterior em vez de duplicar.
 */
export async function submitQuizResult(result: QuizResult): Promise<FormState> {
  await requireStudentAccess();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("finish_quiz_session", {
    p_quiz_session_id: result.quizSessionId,
    p_request_id: result.requestId,
    p_outcomes: result.answers.map((answer) => ({
      question_id: answer.questionId,
      execution_order: answer.executionOrder,
      round: answer.round,
      phase: answer.phase,
      outcome: answer.outcome,
      topic: answer.topic,
      source_question_id: answer.sourceQuestionId,
      answered_at: answer.answeredAt,
    })),
    p_cancel: result.cancel,
  });

  if (error) return { error: error.message };

  revalidatePath(ROUTES.student.overview);
  revalidatePath(ROUTES.student.statistics);
  return {
    success: result.cancel
      ? "Bateria cancelada. Ela não conta no desempenho nem como questão vista."
      : "Resultado gravado. Falta registrar o tempo para concluir a meta.",
  };
}

export async function registerQuizTime(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const quizSessionId = String(data.get("quizSessionId") ?? "");
  const minutes = Number(data.get("minutes"));
  if (!quizSessionId) return { error: "Sessão não identificada." };
  if (!Number.isInteger(minutes) || minutes <= 0) {
    return { error: "Informe o tempo em minutos ou no formato hora:minuto. Ex.: 80 ou 1:20." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("record_quiz_session_time", {
    p_quiz_session_id: quizSessionId,
    // Gerado aqui, uma vez por submissão. Um duplo clique reenvia o mesmo
    // formulário, mas o React desabilita o botão enquanto a action roda.
    p_request_id: randomUUID(),
    p_duration_minutes: minutes,
  });

  if (error) return { error: error.message };

  revalidatePath(ROUTES.student.overview);
  revalidatePath(ROUTES.student.statistics);
  return { success: "Tempo registrado. Meta concluída." };
}

/** Cancela a sessão aberta sem passar pela extensão. */
export async function cancelQuizSession(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const quizSessionId = String(data.get("quizSessionId") ?? "");
  if (!quizSessionId) return { error: "Sessão não identificada." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("finish_quiz_session", {
    p_quiz_session_id: quizSessionId,
    p_request_id: randomUUID(),
    p_outcomes: [],
    p_cancel: true,
  });

  if (error) return { error: error.message };

  revalidatePath(ROUTES.student.overview);
  return { success: "Bateria cancelada. Você pode refazê-la depois." };
}
