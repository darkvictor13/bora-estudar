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

/** Chave do grupo. Questão sem tópico forma um grupo próprio (R-TOPI-05). */
const groupKey = (question: AvailableQuestion) => question.topic ?? "";

/**
 * Escolhe `count` questões em **rodízio por tópico**.
 *
 * A cada vaga, o tópico **menos coberto** é o que cede a questão. Cobertura é
 * `(vistas + já escolhidas nesta bateria) ÷ total do tópico`, então o rodízio
 * respeita o histórico em vez de recomeçar do zero a cada bateria.
 *
 * Empate na cobertura resolve por **menos escolhidas**; persistindo, pelo
 * **tópico maior** — que tem mais a cobrir, e deixá-lo para depois é o que
 * produz o desequilíbrio no fim da fila.
 *
 * Dentro do tópico vencedor a escolha é a de sempre (`best`). Esta função muda
 * QUAL TÓPICO, nunca qual questão dentro dele. Ver docs/specs/22-rodizio-por-topico.md.
 */
function pickBalanced(
  available: readonly AvailableQuestion[],
  history: Map<number, SeenQuestion>,
  exclude: ReadonlySet<number>,
  count: number,
): AvailableQuestion[] {
  const groups = new Map<string, AvailableQuestion[]>();
  const order: string[] = [];
  for (const question of available) {
    const key = groupKey(question);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(question);
  }

  const taken = new Set(exclude);
  const picked = new Map<string, number>();
  const chosen: AvailableQuestion[] = [];

  while (chosen.length < count) {
    // Só tópicos que ainda têm candidata.
    const disponiveis = order.filter((key) =>
      groups.get(key)!.some((question) => !taken.has(question.id)),
    );
    if (!disponiveis.length) break;

    const winner = disponiveis
      .map((key) => {
        const questions = groups.get(key)!;
        const total = Math.max(1, questions.length);
        const seen = questions.filter((question) => history.has(question.id)).length;
        const already = picked.get(key) ?? 0;
        return { key, coverage: (seen + already) / total, already, total };
      })
      .sort(
        (a, b) =>
          a.coverage - b.coverage || a.already - b.already || b.total - a.total,
      )[0]!;

    const question = best(groups.get(winner.key)!, history, taken, 1)[0]!;
    chosen.push(question);
    taken.add(question.id);
    picked.set(winner.key, (picked.get(winner.key) ?? 0) + 1);
  }

  return chosen;
}

/**
 * As `mainTarget` questões principais da bateria, em rodízio por tópico.
 *
 * Sem o rodízio, uma bateria de 15 num bloco de 30 com três assuntos podia sair
 * inteira do mesmo — o que não é revisão do bloco, é treino de um tópico.
 */
export function pickQuestions(start: QuizStart): QueueItem[] {
  const history = historyOf(start);
  return pickBalanced(start.availableQuestions, history, new Set(), start.mainTarget).map((question) => ({
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
  // A rodada extra também respeita o rodízio (R-TOPI-07).
  const chosen = pickBalanced(start.availableQuestions, history, exclude, EXTRA_ROUND_SIZE);
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

/** Rótulo único das três telas que agrupam por tópico. */
export const UNKNOWN_TOPIC = "Tópico não identificado";

export interface TopicTally {
  readonly topic: string;
  readonly answered: number;
  readonly correct: number;
  readonly incorrect: number;
}

/**
 * Resumo por tópico do que SERÁ ENVIADO — spec 28.
 *
 * Passa por `answersForResult` de propósito: numa finalização antecipada,
 * correlata e extra são descartadas do resultado (R-FASE-18), e mostrá-las aqui
 * prometeria ao aluno um número que o site não vai receber.
 *
 * O tópico sai da própria resposta, que o trouxe do item da fila — o painel não
 * consulta nada, pela mesma razão pela qual a extensão não fala com o Supabase.
 */
export function topicSummary(
  answers: Readonly<Record<string, QuestionAnswer>>,
  mainTarget: number,
): TopicTally[] {
  const tally = new Map<string, { topic: string; answered: number; correct: number; incorrect: number }>();

  for (const answer of answersForResult(answers, mainTarget)) {
    const topic = answer.topic?.trim() || UNKNOWN_TOPIC;
    const row = tally.get(topic) ?? { topic, answered: 0, correct: 0, incorrect: 0 };
    row.answered += 1;
    if (answer.outcome === "correct") row.correct += 1;
    else row.incorrect += 1;
    tally.set(topic, row);
  }

  return [...tally.values()].sort(
    (a, b) => b.answered - a.answered || a.topic.localeCompare(b.topic, "pt-BR"),
  );
}
