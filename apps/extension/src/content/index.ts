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
import {
  answersForResult,
  appendExtraRound,
  canAnswer,
  nextUnanswered,
  pickCorrelate,
  pickQuestions,
  progressOf,
  type QueueItem,
  topicSummary,
} from "./engine.ts";
import {
  currentQuestionId,
  detectOutcome,
  goToQuestion,
  isAnswerControl,
  watchForAnswer,
} from "./tec-page.ts";
import { loadPanelPlacement, renderPanel } from "./panel.ts";

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

/**
 * Grava a resposta e, se foi erro, acrescenta a correlata.
 *
 * A correlata entra no FIM da fila, com `phase = "reinforcement"` e a questão
 * errada em `sourceQuestionId`. Combinada com `canAnswer`, isso produz o efeito
 * de produto: as principais primeiro, os reforços depois.
 */
async function recordAnswer(
  session: QuizSessionState,
  item: QueueItem,
  outcome: "correct" | "incorrect",
): Promise<QuizSessionState> {
  const answer: QuestionAnswer = {
    questionId: item.id,
    executionOrder: Object.keys(session.answers).length + 1,
    round: item.round,
    phase: item.phase,
    outcome,
    topic: item.topic,
    sourceQuestionId: item.sourceQuestionId,
    answeredAt: new Date().toISOString(),
  };

  const answers = { ...session.answers, [String(item.id)]: answer };
  const correlate = outcome === "incorrect" ? pickCorrelate(session.start, item, session.queue) : null;

  const updated: QuizSessionState = {
    ...session,
    queue: correlate ? [...session.queue, correlate] : session.queue,
    answers,
  };
  await writeSession(updated);
  return updated;
}

/** Acrescenta uma rodada de 5 extras. Tudo ou nada. */
async function addExtraRound(session: QuizSessionState): Promise<QuizSessionState | null> {
  const extras = appendExtraRound(session.start, session.queue);
  if (!extras) return null;
  const updated: QuizSessionState = { ...session, queue: [...session.queue, ...extras] };
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
    // Na finalização antecipada, tudo que não é principal é DESCARTADO. Sem
    // isso, quem para com 7 de 15 tendo gerado uma correlata teria a bateria
    // inteira recusada por finish_quiz_session, e perderia uma hora de estudo
    // por causa de uma questão que o motor acrescentou sozinho. R-FASE-18.
    answers: answersForResult(finished.answers, finished.start.mainTarget),
  };

  location.assign(buildResultUrl(body, finished.start.returnUrl));
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

/**
 * Painel de uma bateria que já foi entregue ao site.
 *
 * A sessão NÃO é apagada ao enviar: ela continua sendo a única cópia do
 * resultado se a gravação tiver falhado, e apagá-la sozinha reintroduziria a
 * perda silenciosa que a ordenação "persistir antes de limpar" existe para
 * evitar. O que muda é a oferta: sem "Finalizar e enviar", que reenviava o
 * mesmo requestId em cima de uma sessão já em outro estado e jogava o aluno de
 * volta ao site com o resultado de uma bateria encerrada.
 */
async function paintDelivered(session: QuizSessionState): Promise<void> {
  renderPanel({
    sessionNumber: session.start.sessionNumber,
    progress: progressOf(session.queue, session.answers, session.start.mainTarget),
    topics: topicSummary(session.answers, session.start.mainTarget),
    delivered: true,
    onResend: () => void sendResult(session),
    onDiscard: () => {
      if (!confirm("Descartar esta bateria da extensão?\n\nUse só depois de confirmar que o resultado apareceu no painel do aluno.")) return;
      void (async () => {
        await clearSession();
        renderPanel({ error: "Bateria descartada. Inicie outra pelo painel do aluno." });
      })();
    },
  });
}

async function paint(session: QuizSessionState): Promise<void> {
  const progress = progressOf(session.queue, session.answers, session.start.mainTarget);
  const pending = nextUnanswered(session.queue, session.answers);
  const current = currentQuestionId();

  renderPanel({
    sessionNumber: session.start.sessionNumber,
    progress,
    topics: topicSummary(session.answers, session.start.mainTarget),
    // Durante a bateria o que importa é quantas faltam; terminada a fila, o
    // resumo abre sozinho, que é quando ele importa (R-PAIN-12).
    topicsOpen: pending === null,
    historyComplete: session.start.historyComplete,
    currentIsInQueue: current !== null && session.queue.some((item) => item.id === current),
    onGoToPending: pending === null ? null : () => goToQuestion(pending),
    onFinish: pending !== null ? null : () => void sendResult(session),
    // Só com TODAS as principais respondidas: é o que finish_quiz_session
    // exige, e oferecer antes seria oferecer o que o banco recusa.
    onExtraRound:
      pending === null && progress.main >= progress.mainTarget
        ? () => {
            void (async () => {
              const updated = await addExtraRound(session);
              if (!updated) {
                alert(
                  "Não há 5 questões inéditas suficientes neste bloco para acrescentar uma rodada extra.",
                );
                return;
              }
              await paint(updated);
              const next = nextUnanswered(updated.queue, updated.answers);
              if (next !== null) goToQuestion(next);
            })();
          }
        : null,
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

  // Antes de qualquer render: o painel precisa nascer onde o aluno o deixou.
  await loadPanelPlacement();

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

  // Bateria já entregue: mostra o painel de reenvio e para por aqui. Sem isto,
  // reabrir o TEC ressuscitava a bateria antiga com "Finalizar e enviar".
  if (session.requestId) {
    await paintDelivered(session);
    return;
  }

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

      const item = fresh.queue.find((candidate) => candidate.id === questionId);
      if (!item) return;
      if (fresh.answers[String(questionId)]) return;
      // Correlata e extra só depois das principais; correlata de rodada N só
      // depois das extras daquela rodada. A guarda vale ANTES de o aluno perder
      // o trabalho — o banco recusaria a bateria inteira no fim.
      if (!canAnswer(item, fresh.queue, fresh.answers)) return;

      const outcome = detectOutcome();
      if (!outcome) return;

      const updated = await recordAnswer(fresh, item, outcome);
      await paint(updated);
    })();
  });
}

void boot();

export { clearSession };
