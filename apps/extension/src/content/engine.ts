import type { AvailableQuestion, QuestionAnswer, QuizStart, SeenQuestion } from "@bora/protocol";

/**
 * Profundidade máxima da cadeia de reforço correlato.
 *
 * A principal errada gera uma correlata; errar a correlata gera mais uma; errar
 * essa não gera mais nada. Sem o teto, uma sequência de erros produz fila
 * infinita. É o `MAX_REINFORCEMENT_DEPTH` da versão anterior.
 */
export const MAX_CORRELATE_DEPTH = 2;

/** Quantas questões cada rodada extra acrescenta. O banco exige múltiplo de 5. */
export const EXTRA_ROUND_SIZE = 5;

/**
 * Um item da fila da bateria.
 *
 * Antes do protocolo 2 a fila era `number[]`. Ela passou a carregar fase,
 * rodada e origem porque é a extensão quem decide as três — o banco só valida.
 */
export interface QueueItem {
  readonly id: number;
  readonly topic: string | null;
  readonly phase: QuestionAnswer["phase"];
  /** 0 são as principais; 1 é a primeira leva de extras, e assim por diante. */
  readonly round: number;
  /** Preenchido se e só se `phase` é `reinforcement`. */
  readonly sourceQuestionId: number | null;
  /** Quantos passos de correlata separam este item de uma principal. */
  readonly depth: number;
}

/**
 * Ordem de prioridade da seleção, do mais para o menos importante:
 *
 *   1. inédita — questão nunca vista vem antes de qualquer revisão;
 *   2. mais erros — entre as vistas, a que o aluno mais errou;
 *   3. vista há mais tempo — espaçamento;
 *   4. vista menos vezes.
 *
 * O desempate final é o id, para a fila ser determinística: a mesma entrada
 * produz sempre a mesma ordem, o que torna o comportamento reproduzível.
 */
function rankOf(questionId: number, history: Map<number, SeenQuestion>): readonly number[] {
  const seen = history.get(questionId);
  if (!seen) return [0, 0, 0, 0];
  return [1, -seen.incorrectAnswers, Date.parse(seen.lastSeenAt) || 0, seen.timesSeen];
}

function compare(a: number, b: number, history: Map<number, SeenQuestion>): number {
  const ra = rankOf(a, history);
  const rb = rankOf(b, history);
  for (let i = 0; i < ra.length; i += 1) {
    if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
  }
  return a - b;
}

function historyOf(start: QuizStart): Map<number, SeenQuestion> {
  return new Map(start.history.map((h) => [h.questionId, h]));
}

/** Ordena as candidatas pelo mesmo critério, e devolve as `count` primeiras. */
function best(
  available: readonly AvailableQuestion[],
  history: Map<number, SeenQuestion>,
  exclude: ReadonlySet<number>,
  count: number,
): AvailableQuestion[] {
  return [...available]
    .filter((question) => !exclude.has(question.id))
    .sort((a, b) => compare(a.id, b.id, history))
    .slice(0, count);
}

/** As `mainTarget` questões principais da bateria. */
export function pickQuestions(start: QuizStart): QueueItem[] {
  const history = historyOf(start);
  return best(start.availableQuestions, history, new Set(), start.mainTarget).map((question) => ({
    id: question.id,
    topic: question.topic,
    phase: "main" as const,
    round: 0,
    sourceQuestionId: null,
    depth: 0,
  }));
}

/**
 * A correlata de uma questão errada.
 *
 * Tenta primeiro o **mesmo tópico**; esgotado o tópico, cai para qualquer uma,
 * pelo mesmo critério de `pickQuestions`. Devolve `null` quando a profundidade
 * estourou ou quando o bloco não tem mais questão inédita na fila — nenhuma das
 * duas é erro, a bateria simplesmente segue.
 *
 * A correlata **herda a rodada** da origem: a correlata de uma extra da rodada 1
 * fica na rodada 1.
 */
export function pickCorrelate(
  start: QuizStart,
  source: QueueItem,
  queue: readonly QueueItem[],
): QueueItem | null {
  if (source.depth >= MAX_CORRELATE_DEPTH) return null;

  const history = historyOf(start);
  const exclude = new Set(queue.map((item) => item.id));

  const sameTopic = source.topic
    ? best(
        start.availableQuestions.filter((q) => q.topic === source.topic),
        history,
        exclude,
        1,
      )[0]
    : undefined;
  const chosen = sameTopic ?? best(start.availableQuestions, history, exclude, 1)[0];
  if (!chosen) return null;

  return {
    id: chosen.id,
    topic: chosen.topic,
    phase: "reinforcement",
    round: source.round,
    sourceQuestionId: source.id,
    depth: source.depth + 1,
  };
}

/**
 * Mais uma rodada de 5 extras.
 *
 * **Tudo ou nada**: sem 5 questões inéditas, devolve `null` e nada é
 * acrescentado. O banco exige `mod(extras, 5) = 0`, então uma leva de 3 seria
 * recusada na gravação — e o aluno perderia o trabalho no fim, não no começo.
 */
export function appendExtraRound(
  start: QuizStart,
  queue: readonly QueueItem[],
): QueueItem[] | null {
  const history = historyOf(start);
  const exclude = new Set(queue.map((item) => item.id));
  const chosen = best(start.availableQuestions, history, exclude, EXTRA_ROUND_SIZE);
  if (chosen.length < EXTRA_ROUND_SIZE) return null;

  const round = Math.max(0, ...queue.map((item) => item.round)) + 1;
  return chosen.map((question) => ({
    id: question.id,
    topic: question.topic,
    phase: "extra" as const,
    round,
    sourceQuestionId: null,
    depth: 0,
  }));
}

/** Próxima questão da fila ainda sem resposta. */
export function nextUnanswered(
  queue: readonly QueueItem[],
  answers: Readonly<Record<string, QuestionAnswer>>,
): number | null {
  return queue.find((item) => !answers[String(item.id)])?.id ?? null;
}

/**
 * A questão pode ser respondida AGORA?
 *
 * Duas ordens que o banco impõe e que precisam valer antes de o aluno perder o
 * trabalho:
 *
 *  - correlata e extra só depois de **todas as principais** — é o
 *    `reinforcements/extras so podem existir depois de todas as principais` de
 *    `finish_quiz_session`;
 *  - correlata de rodada `N > 0` só depois de **todas as extras daquela
 *    rodada**, que é a ordem "extras primeiro, reforços no fim" dentro da leva.
 */
export function canAnswer(
  item: QueueItem,
  queue: readonly QueueItem[],
  answers: Readonly<Record<string, QuestionAnswer>>,
): boolean {
  const answered = (candidate: QueueItem) => !!answers[String(candidate.id)];
  if (item.phase === "main") return true;

  const mainsPending = queue.some((q) => q.phase === "main" && !answered(q));
  if (mainsPending) return false;

  if (item.phase === "reinforcement" && item.round > 0) {
    return !queue.some((q) => q.phase === "extra" && q.round === item.round && !answered(q));
  }
  return true;
}

export interface Progress {
  readonly answered: number;
  readonly total: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly main: number;
  readonly mainTarget: number;
  readonly reinforcement: number;
  readonly extra: number;
}

export function progressOf(
  queue: readonly QueueItem[],
  answers: Readonly<Record<string, QuestionAnswer>>,
  mainTarget: number,
): Progress {
  const list = Object.values(answers);
  return {
    answered: list.length,
    total: queue.length,
    correct: list.filter((a) => a.outcome === "correct").length,
    incorrect: list.filter((a) => a.outcome === "incorrect").length,
    main: list.filter((a) => a.phase === "main").length,
    mainTarget,
    reinforcement: list.filter((a) => a.phase === "reinforcement").length,
    extra: list.filter((a) => a.phase === "extra").length,
  };
}

/**
 * As respostas que de fato vão no resultado.
 *
 * **Na finalização antecipada, tudo que não é `main` é descartado.** Sem isto,
 * quem para com 7 de 15 tendo gerado uma correlata teria a bateria INTEIRA
 * recusada por `finish_quiz_session` — o aluno perderia uma hora de estudo por
 * causa de uma questão que o motor acrescentou sozinho. É a regra mais
 * importante da spec 21.
 */
export function answersForResult(
  answers: Readonly<Record<string, QuestionAnswer>>,
  mainTarget: number,
): QuestionAnswer[] {
  const list = Object.values(answers);
  const mains = list.filter((a) => a.phase === "main");
  if (mains.length >= mainTarget) return list;
  return mains;
}
