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
