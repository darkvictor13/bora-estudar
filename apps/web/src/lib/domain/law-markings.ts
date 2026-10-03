import type { LawDocument, LawMark, LawMarkColor, LawMarkStyle, LawTextRange } from "../api/laws.ts";
import {
  MARK_COLORS,
  blankMark,
  diffMarks,
  eraseRanges,
  findQuote,
  quoteAt,
  sameTextMark,
  segmentText,
  type MarksDiff,
  type TextSegment,
} from "./text-markings.ts";

export type { LawMark, LawMarkColor, LawMarkStyle, LawTextRange } from "../api/laws.ts";

/** O mesmo texto é o mesmo parágrafo do mesmo artigo. */
const sameParagraph = (mark: LawTextRange, range: LawTextRange) =>
  mark.articleId === range.articleId && mark.paragraphIndex === range.paragraphIndex;

export const LAW_MARK_COLORS = MARK_COLORS;

export function eraseLawRanges(marks: readonly LawMark[], ranges: readonly LawTextRange[]): LawMark[] {
  return eraseRanges(marks, ranges, sameParagraph);
}

export function paintLawRanges(
  marks: readonly LawMark[],
  ranges: readonly LawTextRange[],
  style: LawMarkStyle,
  color: LawMarkColor,
): LawMark[] {
  return [
    ...eraseLawRanges(marks, ranges),
    // A âncora é preenchida por `withLawQuotes`, que precisa do texto.
    ...ranges.map((range) => ({ ...range, ...blankMark(style, color) })),
  ];
}

export type LawTextSegment = TextSegment<LawMark>;

export function segmentLawText(text: string, marks: readonly LawMark[]): LawTextSegment[] {
  return segmentText(text, marks);
}

/* ------------------------------------------------------------------ *
 * Âncora por trecho (spec 40, R-LEI-11 a R-LEI-13)
 *
 * A posição de caractere sozinha não sobrevive a uma correção do texto: uma
 * vírgula a mais no começo do parágrafo desloca todos os grifos dele. Cada
 * marcação guarda também o trecho exato e um pouco do que vem antes e depois,
 * e é por ele que se reencontra — ver `lib/domain/text-markings.ts`.
 * ------------------------------------------------------------------ */

/** Recalcula `quote`, `prefix` e `suffix` a partir da posição, no texto atual. */
export function withLawQuotes(marks: readonly LawMark[], document: LawDocument): LawMark[] {
  const articles = new Map(document.articles.map((article) => [article.id, article]));
  return marks.map((mark) => {
    const paragraph = articles.get(mark.articleId)?.paragraphs[mark.paragraphIndex];
    return paragraph === undefined ? mark : { ...mark, ...quoteAt(paragraph, mark) };
  });
}

export interface AnchoredLawMarks {
  /** As que têm lugar no texto atual, já na posição em que devem ser pintadas. */
  readonly placed: LawMark[];
  /** As que perderam o trecho: continuam gravadas, e não são pintadas. */
  readonly lost: LawMark[];
}

/**
 * Reencontra cada marcação no texto atual (R-LEI-12), entre os parágrafos do
 * MESMO artigo: a mesma frase aparece em artigos diferentes da mesma lei, e
 * pintar no artigo errado é pior do que avisar.
 */
export function anchorLawMarks(marks: readonly LawMark[], document: LawDocument): AnchoredLawMarks {
  const articles = new Map(document.articles.map((article) => [article.id, article]));
  const placed: LawMark[] = [];
  const lost: LawMark[] = [];
  for (const mark of marks) {
    const article = articles.get(mark.articleId);
    const place = article ? findQuote(mark, article.paragraphs, mark.paragraphIndex) : null;
    if (!place) { lost.push(mark); continue; }
    placed.push({ ...mark, paragraphIndex: place.index, start: place.start, end: place.end });
  }
  return { placed, lost };
}

export type LawMarksDiff = MarksDiff<LawMark>;

/** O que gravar para ir de uma lista à outra, por id (R-LEI-15). */
export function diffLawMarks(previous: readonly LawMark[], next: readonly LawMark[]): LawMarksDiff {
  return diffMarks(previous, next, (a, b) => sameParagraph(a, b) && sameTextMark(a, b));
}
