/**
 * Classificação do aluno na lista do professor — spec 17.
 *
 * Função pura, com teste próprio: são quatro faixas, cinco limiares e uma ordem
 * de avaliação que importa. Os valores vêm da v96 (`classificarAluno`,
 * professor.js:3274-3281) e ficam aqui, não espalhados pela tela.
 */

export type StudentBand = "atrasado" | "atencao" | "sem-dados" | "ritmo";

/** Os cinco limiares. Mudá-los é mudar o produto, então ficam nomeados. */
export const BANDS = {
  /** Abaixo disto de progresso de metas, o aluno está atrasado. */
  atrasado: 0.3,
  /** Abaixo disto de progresso, pede atenção. */
  atencao: 0.55,
  /** Abaixo disto de desempenho oficial, pede atenção. */
  desempenho: 70,
} as const;

export interface StudentProgress {
  readonly goalCount: number;
  readonly completed: number;
  readonly mainCount: number;
  readonly mainCorrect: number;
}

/** Progresso de metas, entre 0 e 1. Sem meta, não há progresso. */
export function progressOf(p: StudentProgress): number | null {
  return p.goalCount > 0 ? p.completed / p.goalCount : null;
}

/** Desempenho oficial em pontos percentuais. Sem questão, não há desempenho. */
export function officialPctOf(p: StudentProgress): number | null {
  return p.mainCount > 0 ? Math.round((p.mainCorrect / p.mainCount) * 100) : null;
}

/**
 * A faixa do aluno.
 *
 * A ORDEM das checagens é parte da regra: "sem dados" vem antes de tudo, senão
 * quem acabou de ser vinculado apareceria como atrasado; e "atrasado" vem antes
 * de "atenção", senão a faixa mais grave nunca seria alcançada.
 */
export function classifyStudent(p: StudentProgress): StudentBand {
  if (p.mainCount === 0 && p.goalCount === 0) return "sem-dados";

  const progress = progressOf(p);
  if (progress !== null && progress < BANDS.atrasado) return "atrasado";

  const pct = officialPctOf(p);
  if (pct !== null && pct < BANDS.desempenho) return "atencao";
  if (progress !== null && progress < BANDS.atencao) return "atencao";

  return "ritmo";
}

export const BAND_LABEL: Record<StudentBand, string> = {
  atrasado: "Atrasado",
  atencao: "Atenção",
  "sem-dados": "Sem dados",
  ritmo: "Em ritmo",
};

export const BAND_TONE: Record<StudentBand, "red" | "amber" | "neutral" | "green"> = {
  atrasado: "red",
  atencao: "amber",
  "sem-dados": "neutral",
  ritmo: "green",
};

/**
 * Quem precisa de atenção primeiro. É a ordenação que transforma a lista em
 * diagnóstico (R-TURMA-11).
 */
const BAND_RANK: Record<StudentBand, number> = {
  atrasado: 0,
  atencao: 1,
  "sem-dados": 2,
  ritmo: 3,
};

export function bandRank(band: StudentBand): number {
  return BAND_RANK[band];
}

/** Sem acento e sem caixa, para a busca casar "Fabio" com "Fábio". */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
