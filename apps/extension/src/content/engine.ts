import type { QuestionAnswer, QuizStart, SeenQuestion } from "@bora/protocol";

/**
 * Seleção das questões da sessão.
 *
 * Ordem de prioridade, do mais para o menos importante:
 *
 *   1. inédita — questão nunca vista vem antes de qualquer revisão;
 *   2. mais erros — entre as vistas, a que o aluno mais errou;
 *   3. vista há mais tempo — espaçamento;
 *   4. vista menos vezes.
 *
 * O desempate final é o id, para a fila ser determinística: a mesma entrada
 * produz sempre a mesma ordem, o que torna o comportamento reproduzível.
 */
export function pickQuestions(start: QuizStart): number[] {
  const history = new Map<number, SeenQuestion>(start.history.map((h) => [h.questionId, h]));

  const rank = (questionId: number): readonly number[] => {
    const seen = history.get(questionId);
    if (!seen) return [0, 0, 0, 0];
    return [1, -seen.incorrectAnswers, Date.parse(seen.lastSeenAt) || 0, seen.timesSeen];
  };

  return [...start.availableQuestions]
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i += 1) {
        if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
      }
      return a - b;
    })
    .slice(0, start.mainTarget);
}

/** Próxima questão da fila ainda sem resposta. */
export function nextUnanswered(
  queue: readonly number[],
  answers: Readonly<Record<string, QuestionAnswer>>,
): number | null {
  return queue.find((id) => !answers[String(id)]) ?? null;
}

export interface Progress {
  readonly answered: number;
  readonly total: number;
  readonly correct: number;
  readonly incorrect: number;
}

export function progressOf(
  queue: readonly number[],
  answers: Readonly<Record<string, QuestionAnswer>>,
): Progress {
  const list = Object.values(answers);
  return {
    answered: list.length,
    total: queue.length,
    correct: list.filter((a) => a.outcome === "correct").length,
    incorrect: list.filter((a) => a.outcome === "incorrect").length,
  };
}
