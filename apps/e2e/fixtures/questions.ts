/**
 * As formas de questão que a suíte usa, e o seletor da fila de pré-condição.
 *
 * Isto era `@bora/protocol` mais `pickQuestions`, do motor da extensão. Os dois
 * saíram junto com a extensão, e o que a suíte precisa deles é menos do que
 * parece: as pré-condições de `battery.ts` só dependem de a fila **não repetir
 * questão entre baterias do mesmo bloco** e de cada item carregar o tópico.
 *
 * Deliberadamente NÃO reimplementa o rodízio por tópico do motor antigo. Quando
 * existir um motor de seleção novo, ele é quem passa a ser exercitado aqui — e
 * este arquivo vira o adaptador, não a regra.
 */

/** Questão do catálogo, na ordem em que o bloco a expõe. */
export interface CatalogQuestion {
  readonly id: number;
  readonly topic: string | null;
}

/** Questão que o aluno já viu no bloco, agregada por `vw_seen_questions`. */
export interface SeenQuestion {
  readonly questionId: number;
  readonly timesSeen: number;
  readonly correctAnswers: number;
  readonly incorrectAnswers: number;
  readonly lastSeenAt: string;
}

/** Uma resposta, na forma que `finish_quiz_session` recebe no jsonb. */
export interface Answer {
  readonly questionId: number;
  readonly executionOrder: number;
  readonly round: number;
  readonly phase: "main" | "reinforcement" | "extra";
  readonly outcome: "correct" | "incorrect";
  readonly topic: string | null;
  readonly sourceQuestionId: number | null;
  readonly answeredAt: string;
}

/**
 * Ordem de prioridade, do mais para o menos importante:
 *
 *   1. inédita — questão nunca vista vem antes de qualquer revisão;
 *   2. mais erros — entre as vistas, a que o aluno mais errou;
 *   3. vista há mais tempo;
 *   4. vista menos vezes.
 *
 * O desempate final é o id, para a fila ser determinística: a mesma entrada
 * produz sempre a mesma ordem, e um teste que compare conjuntos de questões
 * entre duas baterias não fica dependendo de sorte.
 */
function rankOf(questionId: number, history: Map<number, SeenQuestion>): readonly number[] {
  const seen = history.get(questionId);
  if (!seen) return [0, 0, 0, 0];
  return [1, -seen.incorrectAnswers, Date.parse(seen.lastSeenAt) || 0, seen.timesSeen];
}

/** As `count` questões que uma bateria nova levaria, dado o histórico do bloco. */
export function pickQuestions(
  available: readonly CatalogQuestion[],
  history: readonly SeenQuestion[],
  count: number,
): CatalogQuestion[] {
  const byId = new Map(history.map((item) => [item.questionId, item]));

  return [...available]
    .sort((a, b) => {
      const ra = rankOf(a.id, byId);
      const rb = rankOf(b.id, byId);
      for (let i = 0; i < ra.length; i += 1) {
        if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
      }
      return a.id - b.id;
    })
    .slice(0, count);
}
