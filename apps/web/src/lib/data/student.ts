import { supabase } from "@/lib/supabase/client";

/**
 * Consultas de leitura do aluno.
 *
 * O argumento de `.select()` precisa ser um literal de string. Concatenar com
 * `+` alarga o tipo para `string`, e a inferência do supabase-js desiste: a
 * linha inteira vira `GenericStringError` e o erro aparece longe daqui, no
 * componente que lê o campo.
 *
 * Todas filtradas por RLS: o `student_id` não precisa ser passado, porque a
 * policy já restringe ao dono. Passá-lo mesmo assim seria uma falsa sensação
 * de segurança — quem protege é o banco.
 */

export async function getActiveStudyPlan() {
  const { data } = await supabase
    .from("study_plans")
    .select("id,name,area,target_exam,stage,study_model,weekly_goals,start_date")
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function getWeekGoals(studyPlanId: string, week: number) {
  const { data, error } = await supabase
    .from("goals")
    // Sem embed de study_plan_blocks: a FK é composta, e o supabase-js não
    // infere o tipo desse caso (o PostgREST resolve, mas o TS vira
    // GenericStringError). Os blocos são poucos por planejamento, então sai
    // mais barato buscá-los uma vez e casar por id em memória.
    .select(
      "id,week_number,weekday,day_order,type,status,title,teacher_note,student_note,external_link,planned_minutes,spent_minutes,completed_at,block_id,created_by,extra_activity",
    )
    .eq("study_plan_id", studyPlanId)
    .eq("week_number", week)
    .is("deleted_at", null)
    .order("weekday")
    .order("day_order");
  if (error) throw error;
  return data ?? [];
}

/** Semanas que têm alguma meta, para o seletor. */
export async function getPlanWeeks(studyPlanId: string): Promise<number[]> {
  const { data } = await supabase
    .from("goals")
    .select("week_number")
    .eq("study_plan_id", studyPlanId)
    .is("deleted_at", null)
    .order("week_number");
  return [...new Set((data ?? []).map((r) => r.week_number))];
}

/** Sessão aberta do planejamento, se houver. Só pode existir uma. */
export async function getOpenQuizSession(studyPlanId: string) {
  const { data } = await supabase
    .from("quiz_sessions")
    .select("id,goal_id,block_id,session_number,main_target,status,started_at")
    .eq("study_plan_id", studyPlanId)
    .in("status", ["in_progress", "awaiting_time"])
    .maybeSingle();
  return data;
}

export async function getGoalPerformance(studyPlanId: string) {
  const { data } = await supabase
    .from("vw_goal_performance")
    .select("goal_id,questions_answered,correct_answers,minutes_spent")
    .eq("study_plan_id", studyPlanId);
  return new Map((data ?? []).map((r) => [r.goal_id as string, r]));
}

export async function getBlockPerformance(studyPlanId: string) {
  const { data } = await supabase
    .from("vw_block_performance")
    .select(
      "block_id,session_count,main_count,main_correct,main_incorrect,extra_count,extra_correct,extra_incorrect,reinforcement_count,reinforcement_correct,reinforcement_incorrect,total_count,total_correct,total_incorrect,official_score_pct,total_score_pct",
    )
    .eq("study_plan_id", studyPlanId);
  return data ?? [];
}

export async function getStudyPlanBlocks(studyPlanId: string) {
  const { data } = await supabase
    .from("study_plan_blocks")
    .select("id,name,subject_name,subject_color,subject_target,question_count,link,active,block_order")
    .eq("study_plan_id", studyPlanId)
    .is("deleted_at", null)
    .order("subject_order")
    .order("block_order");
  return data ?? [];
}

export async function getBlockErrors(studyPlanId: string, blockId: string) {
  const { data } = await supabase
    .from("vw_block_errors")
    .select(
      "question_id,topic,error_count,main_errors,extra_errors,reinforcement_errors,last_error_at,last_error_phase",
    )
    .eq("study_plan_id", studyPlanId)
    .eq("block_id", blockId)
    .order("last_error_at", { ascending: false });
  return data ?? [];
}

export async function getReviewCycles(blockIds: readonly string[]) {
  if (!blockIds.length) return [];
  const { data } = await supabase
    .from("review_cycles")
    .select("id,block_id,cutoff,completed_at,reinforcement_id")
    .in("block_id", blockIds)
    .order("completed_at", { ascending: false });
  return data ?? [];
}

export async function getWaitlistEntry() {
  const { data } = await supabase
    .from("waitlist")
    .select("student_id,name,email,whatsapp,interest_area,focus_exam,timezone,birth_date,status")
    .maybeSingle();
  return data;
}

/**
 * Baterias concluídas de um bloco, para formar os ciclos de reforço — spec 20.
 *
 * O desempenho vem de `vw_quiz_session_performance`, nunca recalculado aqui.
 */
export async function getCompletedSessions(studyPlanId: string, blockId: string) {
  const { data: sessions } = await supabase
    .from("quiz_sessions")
    .select("id,completed_at")
    .eq("study_plan_id", studyPlanId)
    .eq("block_id", blockId)
    .eq("status", "completed")
    .order("completed_at");

  const list = sessions ?? [];
  if (!list.length) return [];

  const { data: performance } = await supabase
    .from("vw_quiz_session_performance")
    .select("quiz_session_id,main_count,main_correct")
    .in("quiz_session_id", list.map((s) => s.id));

  const perfById = new Map((performance ?? []).map((p) => [p.quiz_session_id, p]));

  return list.map((session) => ({
    id: session.id,
    completedAt: session.completed_at ?? "",
    mainCount: perfById.get(session.id)?.main_count ?? 0,
    mainCorrect: perfById.get(session.id)?.main_correct ?? 0,
  }));
}

/** Baterias já ligadas a um reforço. `unique(quiz_session_id)` garante uma só. */
export async function getUsedSessions(blockIds: readonly string[]): Promise<Set<string>> {
  if (!blockIds.length) return new Set();
  const { data } = await supabase
    .from("reinforcements")
    .select("id,block_id,reinforcement_sessions(quiz_session_id)")
    .in("block_id", blockIds);

  const used = new Set<string>();
  for (const reinforcement of data ?? []) {
    for (const link of reinforcement.reinforcement_sessions ?? []) used.add(link.quiz_session_id);
  }
  return used;
}

/**
 * Os erros principais únicos de um conjunto de baterias.
 *
 * Só `phase = 'main'`: o ciclo avalia somente as principais, como
 * `record_reinforcement` impõe pelo `EXCEPT`. Erro em extra ou em reforço
 * anterior não entra.
 */
export async function getCycleErrors(quizSessionIds: readonly string[]) {
  if (!quizSessionIds.length) return [];
  const { data } = await supabase
    .from("quiz_session_questions")
    .select("question_id,topic,answered_at")
    .in("quiz_session_id", quizSessionIds)
    .eq("phase", "main")
    .eq("outcome", "incorrect")
    .order("question_id");

  const byQuestion = new Map<number, { questionId: number; topic: string | null }>();
  for (const row of data ?? []) {
    const questionId = Number(row.question_id);
    if (!byQuestion.has(questionId)) byQuestion.set(questionId, { questionId, topic: row.topic });
  }
  return [...byQuestion.values()];
}

/** Abaixo disto de acerto no tópico, a linha é destacada. É a faixa do produto. */
export const TOPIC_ATTENTION_PCT = 75;
/** Erro em duas baterias distintas é "não sabe a matéria", não "leu mal". */
export const RECURRENT_SESSIONS = 2;
/** Teto de linhas na tela. É o da v96, e existe para 92 blocos não virarem parede. */
export const TOPIC_ROWS_LIMIT = 60;

/**
 * Dificuldades por tópico — spec 23.
 *
 * Só tópicos **com erro**: a tela responde "onde está o problema", e um tópico
 * com 100% não é problema (R-DIFI-07). Quem esconde é aqui, não a view: a view
 * descreve, a tela decide o que mostrar.
 */
export async function getTopicDifficulty(studyPlanId: string) {
  const { data } = await supabase
    .from("vw_topic_difficulty")
    .select("block_id,topic,answered,correct,incorrect,distinct_wrong,sessions_with_error,score_pct")
    .eq("study_plan_id", studyPlanId)
    .gt("incorrect", 0)
    .order("incorrect", { ascending: false })
    .limit(TOPIC_ROWS_LIMIT);

  return (data ?? []).map((row) => ({
    ...row,
    recurrent: (row.sessions_with_error ?? 0) >= RECURRENT_SESSIONS,
  }));
}

// ---------------------------------------------------------------------------
// Revisão espaçada — spec docs/specs/24-revisao-espacada.md
// ---------------------------------------------------------------------------

/** O espaçamento por disciplina, definido pelo professor. */
export async function getReviewSpacings(studyPlanId: string) {
  const { data } = await supabase
    .from("review_spacings")
    .select("id,subject_name,first_interval,second_interval")
    .eq("study_plan_id", studyPlanId)
    .is("deleted_at", null)
    .order("subject_name");
  return data ?? [];
}

/**
 * As marcações vivas, na forma que a grade consome.
 *
 * Só as vivas: desmarcar escreve `deleted_at`, e a linha morta é histórico do
 * `audit_log`, não estado da tela.
 */
export async function getReviewCompletions(studyPlanId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("review_completions")
    .select("study_plan_block_id,ordinal")
    .eq("study_plan_id", studyPlanId)
    .is("deleted_at", null);

  return new Set((data ?? []).map((row) => `${row.study_plan_block_id}:${row.ordinal}`));
}
