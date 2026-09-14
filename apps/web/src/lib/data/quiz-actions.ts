import { supabase } from "@/lib/supabase/client";
import { requireStudentAccess } from "@/lib/auth/session";
import { parseDuration } from "@/lib/domain/goals";
import { ROUTES } from "@/lib/routes";
import type { FormState } from "@/lib/auth/actions";

/**
 * Traduz o erro que sobe do banco.
 *
 * `raise exception` é escrito para quem lê log: minúsculo, sem acento e com o
 * vocabulário do schema. Sem esta camada o aluno lia "ja existe uma bateria
 * aberta neste planejamento" na tela. Mesmo espírito do `translateAuthError`.
 */
function translateQuizError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("ja existe uma bateria aberta")) {
    return "Você já tem uma bateria aberta. Termine ou cancele antes de começar outra.";
  }
  if (m.includes("ja utilizado com outro payload")) {
    return "Este envio já foi usado com outro resultado. Atualize a página para ver o estado atual da bateria.";
  }
  if (m.includes("bateria ja finalizada")) {
    return "Esta bateria já foi finalizada. Atualize a página para ver o estado atual.";
  }
  if (m.includes("bateria nao esta aguardando tempo")) {
    return "Esta bateria não está aguardando o tempo. Atualize a página para ver o estado atual.";
  }
  if (m.includes("bateria nao encontrada")) return "Bateria não encontrada.";
  if (m.includes("planejamento nao esta active")) {
    return "Seu planejamento não está ativo. Fale com seu professor.";
  }
  if (m.includes("meta nao e uma meta de questoes pendente")) {
    return "Esta meta não está pendente. Atualize a página para ver o estado atual.";
  }
  if (m.includes("bloco invalido ou indisponivel")) {
    return "Este bloco não está disponível no seu planejamento.";
  }
  if (m.includes("somente o aluno")) return "Esta bateria não é sua.";
  if (m.includes("entre 1 e") && m.includes("questoes principais")) {
    return "A bateria precisa ter pelo menos uma questão principal respondida.";
  }
  return message;
}

export async function registerQuizTime(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const quizSessionId = String(data.get("quizSessionId") ?? "");
  // parseDuration entende "80" e "1:20" — que é o que a mensagem de erro
  // sempre prometeu. Antes daqui passava um Number() cru, e "1:20" virava NaN.
  const minutes = parseDuration(String(data.get("minutes") ?? ""));
  if (!quizSessionId) return { error: "Sessão não identificada." };
  if (minutes === null || minutes <= 0) {
    return { error: "Informe o tempo em minutos ou no formato hora:minuto. Ex.: 80 ou 1:20." };
  }
  if (minutes > 1440) return { error: "O tempo de uma bateria não passa de 24 horas." };

  const { error } = await supabase.rpc("record_quiz_session_time", {
    p_quiz_session_id: quizSessionId,
    // Gerado aqui, uma vez por submissão. Um duplo clique reenvia o mesmo
    // formulário, mas o React desabilita o botão enquanto a action roda.
    p_request_id: crypto.randomUUID(),
    p_duration_minutes: minutes,
  });

  if (error) return { error: translateQuizError(error.message) };

  // A confirmação NÃO pode voltar como `success` desta action: a revalidação
  // re-renderiza a tela, o cartão da bateria some — que é o efeito desejado — e
  // leva junto o formulário dono do useActionState. A mensagem ficaria sem onde
  // ser renderizada. Quem sobrevive é a página de destino, então é ela que
  // anuncia, lendo `?feito=` da URL.
  return { redirectTo: `${ROUTES.student.overview}?feito=tempo` };
}

/** Cancela a sessão aberta. */
export async function cancelQuizSession(_prev: FormState, data: FormData): Promise<FormState> {
  await requireStudentAccess();

  const quizSessionId = String(data.get("quizSessionId") ?? "");
  if (!quizSessionId) return { error: "Sessão não identificada." };

  const { error } = await supabase.rpc("finish_quiz_session", {
    p_quiz_session_id: quizSessionId,
    p_request_id: crypto.randomUUID(),
    p_outcomes: [],
    p_cancel: true,
  });

  if (error) return { error: translateQuizError(error.message) };

  // Mesmo motivo do registro de tempo: o formulário some com a revalidação.
  return { redirectTo: `${ROUTES.student.overview}?feito=cancelada` };
}
