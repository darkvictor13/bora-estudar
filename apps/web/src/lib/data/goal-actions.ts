import { supabase } from "@/lib/supabase/client";
import { requireStudentAccess } from "@/lib/auth/session";
import { EXTRA_ACTIVITIES, parseDuration } from "@/lib/domain/goals";
import type { Enum } from "@bora/database";
import { ROUTES } from "@/lib/routes";
import type { FormState } from "@/lib/auth/actions";

/**
 * Volta para a semana que o aluno estava vendo.
 *
 * Sem isto, concluir uma meta da semana 3 devolveria o aluno à semana padrão —
 * a primeira com meta pendente —, e ele perderia o lugar a cada conclusão.
 */
function backTo(data: FormData, done: string): string {
  const week = Number(data.get("week"));
  const semana = Number.isInteger(week) && week > 0 ? `semana=${week}&` : "";
  return `${ROUTES.student.overview}?${semana}feito=${done}`;
}

/**
 * Teto de tempo de uma meta sem bateria, em minutos.
 *
 * É o valor da v96 (`interpretarTempoRegistro`), e o mesmo que a constraint
 * `goal_spent_minutes_range` impõe. `record_quiz_session_time` continua
 * aceitando até 1440 para bateria — os dois divergem de propósito, e alinhá-los
 * é mudança na spec 05. Ver R-CONC-10.
 */
export const MAX_GOAL_MINUTES = 240;

/** Mesmo teto de `goal_student_note_length`. */
const MAX_NOTE = 2000;

/**
 * Traduz o erro que sobe do banco.
 *
 * `raise exception` é escrito para quem lê log: minúsculo, sem acento e com o
 * vocabulário do schema. Mesmo espírito de `translateQuizError`.
 */
function translateGoalError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("meta de bateria conclui-se pela bateria")) {
    return "Esta meta é de bateria: ela conclui quando você registra o tempo da bateria.";
  }
  if (m.includes("meta de bateria reabre-se") || m.includes("bateria registrada reabre-se")) {
    return "Esta meta tem bateria registrada. Só o professor pode reabri-la, anulando a bateria.";
  }
  if (m.includes("meta nao esta pendente")) {
    return "Esta meta não está mais pendente. Atualize a página para ver o estado atual.";
  }
  if (m.includes("meta nao esta concluida")) {
    return "Esta meta não está concluída. Atualize a página para ver o estado atual.";
  }
  if (m.includes("planejamento nao esta active")) {
    return "Seu planejamento não está ativo. Fale com seu professor.";
  }
  if (m.includes("meta nao encontrada")) return "Meta não encontrada.";
  if (m.includes("somente o aluno")) return "Esta meta não é sua.";
  if (m.includes("ja utilizado com outro payload")) {
    return "Este envio já foi usado com outros dados. Atualize a página para ver o estado atual.";
  }
  if (m.includes("tempo em minutos deve estar entre")) {
    return `Informe um tempo entre 1 e ${MAX_GOAL_MINUTES} minutos.`;
  }
  if (m.includes("observacao passa de")) {
    return `A observação passa de ${MAX_NOTE} caracteres.`;
  }
  return message;
}

/**
 * Conclui uma meta que não seja de bateria.
 *
 * O `requestId` é gerado **uma vez por submissão**, aqui, e é o que torna o
 * duplo clique inofensivo: a segunda chamada chega ao banco com o mesmo id e o
 * mesmo payload, e `reserve_operation` devolve o estado sem regravar. Gerá-lo
 * dentro da RPC, ou a cada retentativa, transformaria a proteção do servidor em
 * decoração — a terceira ordenação do CLAUDE.md.
 */
export async function completeGoal(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const goalId = String(data.get("goalId") ?? "");
  if (!goalId) return { error: "Meta não identificada." };

  // parseDuration entende "80" e "1:20", igual ao registro de tempo da bateria.
  const minutes = parseDuration(String(data.get("minutes") ?? ""));
  if (minutes === null || minutes <= 0) {
    return { error: "Informe o tempo em minutos ou no formato hora:minuto. Ex.: 80 ou 1:20." };
  }
  if (minutes > MAX_GOAL_MINUTES) {
    return { error: `O tempo de uma meta não passa de ${MAX_GOAL_MINUTES} minutos (4 horas).` };
  }

  const note = String(data.get("note") ?? "").trim();
  if (note.length > MAX_NOTE) {
    return { error: `A observação passa de ${MAX_NOTE} caracteres.` };
  }

  // A chave `p_note` só entra quando há observação. Passá-la como `undefined`
  // não compila sob `exactOptionalPropertyTypes`, e omiti-la é o que faz o
  // PostgREST usar o `default null` da função.
  const { error } = await supabase.rpc("complete_goal", {
    p_goal_id: goalId,
    p_request_id: crypto.randomUUID(),
    p_spent_minutes: minutes,
    ...(note ? { p_note: note } : {}),
  });

  if (error) return { error: translateGoalError(error.message) };

  // A confirmação NÃO pode voltar como `success` desta action: a revalidação
  // re-renderiza a linha, o formulário some — que é o efeito desejado — e leva
  // junto o `useActionState` que renderizaria a mensagem. Quem sobrevive é a
  // página, então é ela que anuncia, lendo `?feito=` da URL. Mesmo motivo de
  // `registerQuizTime`.
  return { redirectTo: backTo(data, "meta") };
}

/** Devolve a meta a pendente. Preserva a observação do aluno (R-CONC-13). */
export async function reopenGoal(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const goalId = String(data.get("goalId") ?? "");
  if (!goalId) return { error: "Meta não identificada." };

  const { error } = await supabase.rpc("reopen_goal", {
    p_goal_id: goalId,
    p_request_id: crypto.randomUUID(),
  });

  if (error) return { error: translateGoalError(error.message) };

  return { redirectTo: backTo(data, "reaberta") };
}

// ---------------------------------------------------------------------------
// Estudo extra avulso — spec docs/specs/19-estudo-extra-avulso.md
// ---------------------------------------------------------------------------

function translateExtraError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("ainda nao tem metas neste planejamento")) {
    return "Esta semana ainda não foi montada pelo seu professor.";
  }
  if (m.includes("planejamento nao esta active")) {
    return "Seu planejamento não está ativo. Fale com seu professor.";
  }
  if (m.includes("somente o aluno")) return "Este planejamento não é seu.";
  if (m.includes("planejada pelo professor")) {
    return "Esta meta foi planejada pelo seu professor. Use Desfazer para reabri-la.";
  }
  if (m.includes("so registro de estudo extra")) {
    return "Só um registro de estudo extra pode ser removido.";
  }
  if (m.includes("tempo em minutos deve estar entre")) {
    return `Informe um tempo entre 1 e ${MAX_GOAL_MINUTES} minutos.`;
  }
  return translateGoalError(message);
}

/** Registra o que o aluno estudou fora da semana montada pelo professor. */
export async function recordExtraStudy(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const studyPlanId = String(data.get("studyPlanId") ?? "");
  const week = Number(data.get("week"));
  const weekday = Number(data.get("weekday"));
  const activity = String(data.get("activity") ?? "") as Enum<"extra_activity_kind">;
  if (!studyPlanId) return { error: "Planejamento não identificado." };
  if (!Number.isInteger(week) || week < 1) return { error: "Semana inválida." };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { error: "Escolha o dia do estudo." };
  }
  if (!EXTRA_ACTIVITIES.includes(activity)) return { error: "Escolha o tipo de estudo." };

  const minutes = parseDuration(String(data.get("minutes") ?? ""));
  if (minutes === null || minutes <= 0) {
    return { error: "Informe o tempo em minutos ou no formato hora:minuto. Ex.: 45 ou 1:20." };
  }
  if (minutes > MAX_GOAL_MINUTES) {
    return { error: `O tempo de um estudo não passa de ${MAX_GOAL_MINUTES} minutos (4 horas).` };
  }

  const note = String(data.get("note") ?? "").trim();

  const { error } = await supabase.rpc("record_extra_study", {
    p_study_plan_id: studyPlanId,
    p_request_id: crypto.randomUUID(),
    p_week: week,
    p_weekday: weekday,
    p_activity: activity,
    p_spent_minutes: minutes,
    ...(note ? { p_note: note } : {}),
  });

  if (error) return { error: translateExtraError(error.message) };

  return { redirectTo: backTo(data, "extra") };
}

/** Remove um registro que o próprio aluno criou. */
export async function deleteExtraStudy(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const goalId = String(data.get("goalId") ?? "");
  if (!goalId) return { error: "Registro não identificado." };

  const { error } = await supabase.rpc("delete_extra_study", {
    p_goal_id: goalId,
    p_request_id: crypto.randomUUID(),
  });

  if (error) return { error: translateExtraError(error.message) };

  return { redirectTo: backTo(data, "extra-removido") };
}

// ---------------------------------------------------------------------------
// Reforço de ciclo — spec docs/specs/20-execucao-do-reforco.md
// ---------------------------------------------------------------------------

/** URL da questão no TEC. É o mesmo host que a extensão conhece. */
export const TEC_QUESTION_URL = "https://www.tecconcursos.com.br/questoes";

/**
 * Grava o reforço do ciclo.
 *
 * O `requestId` vem do formulário, gerado **uma vez quando o aluno abriu o
 * reforço** — não a cada submissão. Reenviar devolve o reforço já gravado em vez
 * de recusar por `unique(quiz_session_id)` em `reinforcement_sessions`.
 *
 * Nenhuma verificação da RPC é repetida aqui: quem confere as três baterias, o
 * acumulado abaixo de 80% e a cobertura completa dos erros é
 * `record_reinforcement`. A tela evita oferecer o que o banco recusaria.
 */
export async function recordReinforcement(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const studyPlanId = String(data.get("studyPlanId") ?? "");
  const blockId = String(data.get("blockId") ?? "");
  const requestId = String(data.get("requestId") ?? "");
  const sessionIds = String(data.get("sessionIds") ?? "").split(",").filter(Boolean);
  if (!studyPlanId || !blockId || !requestId) return { error: "Reforço não identificado." };
  if (sessionIds.length !== 3) return { error: "O ciclo precisa de exatamente 3 baterias." };

  const questions = data.getAll("question").map(String);
  const outcomes: { question_id: number; phase: string; outcome: string; topic: string | null }[] =
    [];

  for (const raw of questions) {
    const [id, topic] = raw.split("|");
    const answer = String(data.get(`outcome:${id}`) ?? "");
    if (answer !== "correct" && answer !== "incorrect") {
      // A mesma contagem que a RPC daria, antes de o aluno perder o trabalho.
      const faltam = questions.filter(
        (q) => !["correct", "incorrect"].includes(String(data.get(`outcome:${q.split("|")[0]}`))),
      ).length;
      return {
        error: `Marque acertei ou errei em todas as questões — faltam ${faltam}.`,
      };
    }
    outcomes.push({
      question_id: Number(id),
      // A fase é a do erro original, e é por ela que o EXCEPT da RPC casa.
      phase: "main",
      outcome: answer,
      topic: topic || null,
    });
  }

  if (!outcomes.length) return { error: "Este ciclo não tem erro a revisar." };

  const { error } = await supabase.rpc("record_reinforcement", {
    p_study_plan_id: studyPlanId,
    p_block_id: blockId,
    p_quiz_session_ids: sessionIds,
    p_request_id: requestId,
    p_outcomes: outcomes,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("atingiu 80")) {
      return { error: "Este ciclo já atingiu 80% e não exige mais reforço." };
    }
    if (m.includes("precisa revisar as")) {
      return { error: "Marque acertei ou errei em todas as questões antes de enviar." };
    }
    if (m.includes("exige exatamente 3")) {
      return { error: "O ciclo precisa de exatamente 3 baterias concluídas." };
    }
    if (m.includes("planejamento invalido")) return { error: "Este planejamento não é seu." };
    return { error: error.message };
  }

  return { redirectTo: `${ROUTES.student.reviews}?feito=reforco` };
}

// ---------------------------------------------------------------------------
// Revisão espaçada — spec docs/specs/24-revisao-espacada.md
// ---------------------------------------------------------------------------

/**
 * Marca ou desmarca uma revisão.
 *
 * Não gera `request_id`: `set_review_done` é idempotente por natureza — leva o
 * par (bloco, ordinal) a um estado e não acumula. Ver R-REVE-13.
 *
 * A action serve aluno e professor, e por isso não chama `requireRole`: quem
 * decide é a RPC, que aceita o aluno dono ou o professor com vínculo vigente e
 * recusa qualquer outro com `42501`.
 */
export async function setReviewDone(_prev: FormState, data: FormData): Promise<FormState> {
  const studyPlanId = String(data.get("studyPlanId") ?? "");
  const blockId = String(data.get("blockId") ?? "");
  const ordinal = Number(data.get("ordinal") ?? 0);
  const done = String(data.get("done") ?? "") === "true";
  const redirectTo = String(data.get("redirectTo") ?? "");

  if (!studyPlanId || !blockId) return { error: "Revisão não identificada." };
  if (ordinal !== 1 && ordinal !== 2) return { error: "Revisão inválida." };

  const { error } = await supabase.rpc("set_review_done", {
    p_study_plan_id: studyPlanId,
    p_block_id: blockId,
    p_ordinal: ordinal,
    p_done: done,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("sem permissao")) return { error: "Esta revisão é de outro aluno." };
    if (m.includes("bloco nao encontrado")) {
      return { error: "Este caderno saiu do planejamento." };
    }
    return { error: error.message };
  }

  // A célula troca de estado com a revalidação e leva junto o formulário dono
  // da mensagem. Quem anuncia é a página.
  return redirectTo
    ? { redirectTo: `${redirectTo}?feito=${done ? "revisao" : "revisao-desfeita"}` }
    : { success: done ? "Revisão marcada." : "Revisão desmarcada." };
}
