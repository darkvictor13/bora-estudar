/**
 * Formação dos ciclos de reforço — spec 20.
 *
 * Função pura, com teste próprio: são três regras de agrupamento com bordas —
 * menos de três baterias, sobra de uma ou duas, sessão já usada em outro ciclo —
 * e provar isso sem navegador é mais barato.
 */

/** Abaixo disto, o ciclo exige reforço. Também imposto por `record_reinforcement`. */
export const CYCLE_THRESHOLD = 80;
/** Abaixo disto, o ciclo é prioridade alta. É o limiar da v96. */
export const HIGH_PRIORITY_THRESHOLD = 75;

export interface CycleSession {
  readonly id: string;
  /** ISO 8601. Só bateria concluída tem. */
  readonly completedAt: string;
  readonly mainCount: number;
  readonly mainCorrect: number;
}

export interface Cycle {
  readonly sessions: readonly CycleSession[];
  readonly mainCount: number;
  readonly mainCorrect: number;
  /** Acumulado das principais, arredondado. */
  readonly score: number;
  readonly highPriority: boolean;
}

/**
 * Agrupa as baterias concluídas do bloco em ciclos abertos.
 *
 * Os grupos são formados **do mais antigo para o mais novo, de três em três, e
 * fechados**: a quarta e a quinta não formam ciclo, ficam esperando a sexta. É o
 * `i += 3` da v96, e é o que dá ao ciclo um significado estável em vez de uma
 * janela deslizante.
 *
 * `used` são as sessões já ligadas a um reforço. O banco garante que nenhuma
 * participe de dois — `reinforcement_sessions` tem `unique (quiz_session_id)` —,
 * e a tela não oferece o que já foi usado.
 *
 * Devolve só os ciclos que **exigem** reforço: em 80% ou mais o ciclo se fecha
 * sozinho, e a RPC recusaria gravá-lo de qualquer forma.
 */
export function buildCycles(
  sessions: readonly CycleSession[],
  used: ReadonlySet<string>,
): Cycle[] {
  const available = sessions
    .filter((session) => !used.has(session.id))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  const cycles: Cycle[] = [];
  for (let i = 0; i + 2 < available.length; i += 3) {
    const group = available.slice(i, i + 3);
    const mainCount = group.reduce((acc, s) => acc + s.mainCount, 0);
    const mainCorrect = group.reduce((acc, s) => acc + s.mainCorrect, 0);
    // Ciclo sem questão principal não é ciclo: a RPC recusa com
    // "ciclo sem questoes principais".
    if (mainCount <= 0) continue;

    const score = Math.round((100 * mainCorrect) / mainCount);
    if (score >= CYCLE_THRESHOLD) continue;

    cycles.push({
      sessions: group,
      mainCount,
      mainCorrect,
      score,
      highPriority: score < HIGH_PRIORITY_THRESHOLD,
    });
  }
  return cycles;
}
