/**
 * O contrato do Vade Mecum: biblioteca, texto, mapas de edital e marcações
 * (spec 40). Tipos da INTERFACE — os nomes que as telas já usavam quando o
 * conteúdo vinha de arquivo.
 */
import type { RequestId, Result } from "./contract.ts";

/** Uma lei da biblioteca, sem o texto. `id` é o curto da URL (`?lei=ld`). */
export interface LawEntry {
  readonly id: string;
  readonly canonicalId: string;
  readonly title: string;
  readonly norm: string;
  readonly subject: string;
  readonly officialUrl: string;
  readonly sourceDate: string | null;
  readonly articleCount: number;
}

export interface LawLibrary {
  readonly laws: readonly LawEntry[];
  /** As matérias, na ordem da biblioteca. */
  readonly subjects: readonly string[];
}

export interface LawArticle {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly paragraphs: readonly string[];
}

export interface LawDocument {
  readonly id: string;
  readonly articles: readonly LawArticle[];
}

export interface LawExamMapItem {
  readonly canonicalId: string;
  readonly title: string;
  readonly scope: string;
  /** A lei da biblioteca que tem o texto desta norma, quando há. */
  readonly libraryId: string | null;
  readonly available: boolean;
}

export interface LawExamMapSection {
  readonly title: string;
  readonly items: readonly LawExamMapItem[];
}

export interface LawExamMap {
  readonly id: string;
  readonly shortName: string;
  readonly title: string;
  readonly accent: string;
  readonly canonicalId: string;
  readonly sections: readonly LawExamMapSection[];
}

export interface LawExamMaps {
  readonly baseDate: string;
  readonly maps: readonly LawExamMap[];
}

export type LawMarkStyle = "highlight" | "underline" | "strike" | "outline";
export type LawMarkColor = "yellow" | "mint" | "blue" | "pink" | "lilac" | "peach" | "salmon";

export interface LawTextRange {
  readonly articleId: string;
  readonly paragraphIndex: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Uma marcação de leitura. `quote`, `prefix` e `suffix` são a âncora por
 * trecho (R-LEI-11): é por eles que a marcação reencontra o lugar quando o
 * texto da lei muda.
 */
export interface LawMark extends LawTextRange {
  readonly id: string;
  readonly style: LawMarkStyle;
  readonly color: LawMarkColor;
  readonly quote: string;
  readonly prefix: string;
  readonly suffix: string;
}

/**
 * O antes e o depois de UMA ação na tela. Quem cumpre o contrato grava a
 * diferença, por id (R-LEI-15).
 */
export interface SaveLawMarksInput {
  readonly lawId: string;
  readonly previous: readonly LawMark[];
  readonly next: readonly LawMark[];
  readonly requestId: RequestId;
}

export interface LawsApi {
  loadLawLibrary(): Promise<LawLibrary>;
  /** Os artigos ativos da lei, na ordem; `null` quando a lei não existe. */
  loadLawDocument(lawId: string): Promise<LawDocument | null>;
  loadExamMaps(): Promise<LawExamMaps>;
  /** As marcações do aluno nesta lei, como foram gravadas — sem reancorar. */
  loadLawMarks(lawId: string): Promise<readonly LawMark[]>;
  saveLawMarks(input: SaveLawMarksInput): Promise<Result<null>>;
}
