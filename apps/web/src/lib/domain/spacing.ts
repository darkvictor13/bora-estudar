/**
 * Revisão espaçada — spec docs/specs/24-revisao-espacada.md
 *
 * A grade é DERIVADA, nunca gravada. O que o banco guarda é o espaçamento por
 * disciplina (`review_spacings`) e o que foi feito (`review_completions`); as
 * linhas saem daqui, das duas fórmulas da v96:
 *
 *   1ª revisão do bloco i → bloco i − (r1 − 1)
 *   2ª revisão do bloco i → bloco i − (r1 + r2 − 1)
 *
 * Contagem inclusiva: com r1 = 3, estudar a Aula 3 significa revisar a Aula 1.
 * Índice negativo é "ainda não há o que revisar", não erro — o aluno não estudou
 * blocos suficientes (R-REVE-08).
 */

/** Limites dos campos da v96. Zero desliga. */
export const MIN_INTERVAL = 0;
export const MAX_INTERVAL = 60;

export interface SpacingBlock {
  readonly id: string;
  readonly name: string;
  readonly subject_name: string;
  readonly block_order: number;
  readonly link?: string | null;
  readonly active?: boolean;
  readonly deleted_at?: string | null;
}

export interface Spacing {
  readonly subject_name: string;
  readonly first_interval: number;
  readonly second_interval: number;
}

export interface ReviewCell {
  readonly block: SpacingBlock;
  readonly done: boolean;
}

export interface ReviewRow {
  readonly current: SpacingBlock;
  /** `null` quando ainda não há bloco anterior suficiente, ou a coluna está desligada. */
  readonly first: ReviewCell | null;
  readonly second: ReviewCell | null;
}

export interface SubjectGrid {
  readonly subject: string;
  readonly firstInterval: number;
  readonly secondInterval: number;
  readonly rows: readonly ReviewRow[];
}

/** Marcações vivas, na forma `${blockId}:${ordinal}`. */
export type DoneSet = ReadonlySet<string>;

export function doneKey(blockId: string, ordinal: 1 | 2): string {
  return `${blockId}:${ordinal}`;
}

/**
 * Índice do bloco a revisar, ou -1.
 *
 * `interval` zero desliga a coluna: é o que os campos da v96 fazem, e o que
 * `R-REVE-04` diz. Sem isso, r1 = 0 daria `i + 1` — um bloco no FUTURO.
 */
export function reviewIndex(current: number, interval: number): number {
  if (interval <= 0) return -1;
  const index = current - (interval - 1);
  // -1 é o ÚNICO sentinela de "não há o que revisar". Devolver o índice bruto
  // negativo daria dois vocabulários para o mesmo fato, e quem lê passaria a
  // ter de saber que -3 também significa vazio.
  return index < 0 ? -1 : index;
}

/**
 * Blocos de uma disciplina, na ordem do planejamento.
 *
 * Bloco excluído e bloco inativo ficam de fora: revisar o que saiu do
 * planejamento é trabalho jogado fora (R-REVE-09).
 */
export function blocksOfSubject(
  blocks: readonly SpacingBlock[],
  subject: string,
): readonly SpacingBlock[] {
  return blocks
    .filter(
      (block) =>
        block.subject_name === subject &&
        !block.deleted_at &&
        block.active !== false,
    )
    .slice()
    .sort((a, b) => a.block_order - b.block_order);
}

/** A grade de uma disciplina. */
export function buildSubjectGrid(
  spacing: Spacing,
  blocks: readonly SpacingBlock[],
  done: DoneSet,
): SubjectGrid {
  const ordered = blocksOfSubject(blocks, spacing.subject_name);
  const r1 = spacing.first_interval;
  const r2 = spacing.second_interval;

  const cell = (index: number, ordinal: 1 | 2): ReviewCell | null => {
    const block = index >= 0 ? ordered[index] : undefined;
    if (!block) return null;
    return { block, done: done.has(doneKey(block.id, ordinal)) };
  };

  const rows = ordered.map((current, i) => ({
    current,
    first: cell(reviewIndex(i, r1), 1),
    // A segunda soma os dois intervalos, e só existe se as duas estiverem
    // ligadas: revisar pela segunda vez sem ter revisado pela primeira não é
    // um estado que a grade da v96 expresse.
    second: r1 > 0 && r2 > 0 ? cell(reviewIndex(i, r1 + r2), 2) : null,
  }));

  return { subject: spacing.subject_name, firstInterval: r1, secondInterval: r2, rows };
}

/**
 * A grade inteira do aluno.
 *
 * Disciplina sem espaçamento não entra: grade vazia com dez disciplinas
 * listadas seria ruído (R-REVE-19). A ordem é a das disciplinas no
 * planejamento, que é a ordem em que os blocos chegam.
 */
export function buildGrid(
  spacings: readonly Spacing[],
  blocks: readonly SpacingBlock[],
  done: DoneSet,
): readonly SubjectGrid[] {
  const order = new Map<string, number>();
  for (const block of blocks) {
    if (!order.has(block.subject_name)) order.set(block.subject_name, order.size);
  }

  return spacings
    .filter((spacing) => spacing.first_interval > 0)
    .slice()
    .sort(
      (a, b) =>
        (order.get(a.subject_name) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.subject_name) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((spacing) => buildSubjectGrid(spacing, blocks, done))
    .filter((grid) => grid.rows.length > 0);
}

/** Quantas revisões a disciplina já tem feitas, e quantas estão disponíveis. */
export function gridProgress(grid: SubjectGrid): { done: number; available: number } {
  let done = 0;
  let available = 0;
  for (const row of grid.rows) {
    for (const cell of [row.first, row.second]) {
      if (!cell) continue;
      available += 1;
      if (cell.done) done += 1;
    }
  }
  return { done, available };
}
