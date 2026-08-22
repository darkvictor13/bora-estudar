import {
  HASH_KEYS,
  ProtocolError,
  buildResultUrl,
  hashHasPayload,
  parseStartHash,
  type QuestionAnswer,
  type QuizResult,
} from "@bora/protocol";

import { readSession, writeSession, clearSession, type QuizSessionState } from "../shared/session.ts";
import { nextUnanswered, pickQuestions, progressOf } from "./engine.ts";
import {
  currentQuestionId,
  detectOutcome,
  goToQuestion,
  isAnswerControl,
  watchForAnswer,
} from "./tec-page.ts";
import { renderPanel } from "./panel.ts";

// ---------------------------------------------------------------------------
// Importação do payload de início
// ---------------------------------------------------------------------------

async function importStartFromUrl(): Promise<QuizSessionState | null> {
  if (!hashHasPayload(location.hash, HASH_KEYS.start)) return null;

  const { body } = parseStartHash(location.hash);

  const session: QuizSessionState = {
    start: body,
    queue: pickQuestions(body),
    answers: {},
    requestId: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  // Persistir ANTES de limpar a hash. Se a ordem se inverter e a gravação
  // falhar, o payload some da URL e não há de onde recuperá-lo.
  await writeSession(session);
  history.replaceState(null, "", location.pathname + location.search);

  return session;
}

// ---------------------------------------------------------------------------
// Registro das respostas
// ---------------------------------------------------------------------------

async function recordAnswer(
  session: QuizSessionState,
  questionId: number,
  outcome: "correct" | "incorrect",
): Promise<QuizSessionState> {
  const answer: QuestionAnswer = {
    questionId,
    executionOrder: Object.keys(session.answers).length + 1,
    round: 0,
    phase: "main",
    outcome,
    topic: null,
    sourceQuestionId: null,
    answeredAt: new Date().toISOString(),
  };

  const updated: QuizSessionState = {
    ...session,
    answers: { ...session.answers, [String(questionId)]: answer },
  };
  await writeSession(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Envio do resultado
// ---------------------------------------------------------------------------

/**
 * Devolve o resultado ao site.
 *
 * O `await` antes de navegar não é opcional: `location.assign` derruba o
 * content script, e um `storage.set` pendente se perde junto com o requestId.
 * Sem o requestId, a retentativa chega ao banco como operação nova.
 */
async function sendResult(session: QuizSessionState, cancel = false): Promise<void> {
  const finished: QuizSessionState = {
    ...session,
    requestId: session.requestId ?? crypto.randomUUID(),
    finishedAt: session.finishedAt ?? new Date().toISOString(),
  };
  await writeSession(finished);

  const body: QuizResult = {
    quizSessionId: finished.start.quizSessionId,
    requestId: finished.requestId!,
    cancel,
    answers: Object.values(finished.answers),
  };

  location.assign(buildResultUrl(body, finished.start.returnUrl));
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

async function paint(session: QuizSessionState): Promise<void> {
  const progress = progressOf(session.queue, session.answers);
  const pending = nextUnanswered(session.queue, session.answers);
  const current = currentQuestionId();

  renderPanel({
    sessionNumber: session.start.sessionNumber,
    progress,
    historyComplete: session.start.historyComplete,
    currentIsInQueue: current !== null && session.queue.includes(current),
    onGoToPending: pending === null ? null : () => goToQuestion(pending),
    onFinish: pending !== null ? null : () => void sendResult(session),
    onFinishEarly:
      pending !== null && progress.answered > 0
        ? () => {
            const faltam = progress.total - progress.answered;
            const texto =
              `Finalizar com ${progress.answered} de ${progress.total} questões?\n\n` +
              `As ${faltam} não respondidas não viram erro nem questão vista, e continuam ` +
              `disponíveis para as próximas baterias.`;
            if (confirm(texto)) void sendResult(session);
          }
        : null,
    onCancel: () => {
      const texto =
        "Cancelar esta bateria?\n\n" +
        "Ela não conta no desempenho nem como questão vista. As respostas dadas até aqui " +
        "ficam apenas para auditoria.";
      if (confirm(texto)) void sendResult(session, true);
    },
  });
}

async function boot(): Promise<void> {
  let session: QuizSessionState | null;

  try {
    session = (await importStartFromUrl()) ?? (await readSession());
  } catch (error) {
    if (error instanceof ProtocolError) {
      renderPanel({
        error:
          error.code === "incompatible_version"
            ? "Atualize a extensão: o site enviou uma bateria em formato mais novo."
            : `Não foi possível ler a bateria (${error.code}).`,
      });
      return;
    }
    throw error;
  }

  if (!session) return;
  await paint(session);

  const first = nextUnanswered(session.queue, session.answers);
  const current = currentQuestionId();
  if (first !== null && current !== first) {
    goToQuestion(first);
    return;
  }

  /**
   * Guarda de abertura.
   *
   * Ao carregar uma questão que o aluno já resolveu antes, fora desta bateria,
   * o TEC mostra o resultado de imediato. Sem esta trava, esse resultado
   * antigo seria registrado como se tivesse acabado de acontecer.
   *
   * A trava cai no primeiro clique em um controle de resposta: aí o aluno está
   * respondendo agora, e o que aparecer depois é dele.
   */
  let guardedId = detectOutcome() ? currentQuestionId() : null;
  document.addEventListener(
    "click",
    (event) => {
      if (isAnswerControl(event.target)) guardedId = null;
    },
    true,
  );

  const stop = watchForAnswer(() => {
    void (async () => {
      const fresh = await readSession();
      if (!fresh) {
        stop();
        return;
      }

      const questionId = currentQuestionId();
      if (questionId === null) return;
      if (questionId === guardedId) return;
      if (!fresh.queue.includes(questionId)) return;
      if (fresh.answers[String(questionId)]) return;

      const outcome = detectOutcome();
      if (!outcome) return;

      const updated = await recordAnswer(fresh, questionId, outcome);
      await paint(updated);
    })();
  });
}

void boot();

export { clearSession };
