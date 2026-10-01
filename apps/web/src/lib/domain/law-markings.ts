import type { LawDocument, LawMark, LawMarkColor, LawMarkStyle, LawTextRange } from "../api/laws.ts";

export type { LawMark, LawMarkColor, LawMarkStyle, LawTextRange } from "../api/laws.ts";

export const LAW_MARK_COLORS: Readonly<Record<LawMarkColor, string>> = {
  yellow: "#fff19a",
  mint: "#b9efd4",
  blue: "#bedcf7",
  pink: "#f7c7df",
  lilac: "#ded0fa",
  peach: "#ffd9b8",
  salmon: "#f2bbb7",
};

export function eraseLawRanges(marks: readonly LawMark[], ranges: readonly LawTextRange[]): LawMark[] {
  let result = [...marks];
  for (const range of ranges) {
    result = result.flatMap((mark) => {
      if (mark.articleId !== range.articleId || mark.paragraphIndex !== range.paragraphIndex ||
          mark.end <= range.start || mark.start >= range.end) return [mark];
      const parts: LawMark[] = [];
      if (mark.start < range.start) parts.push({ ...mark, end: range.start });
      if (mark.end > range.end) parts.push({ ...mark, id: crypto.randomUUID(), start: range.end });
      return parts;
    });
  }
  return result;
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
    ...ranges.map((range) => ({ ...range, id: crypto.randomUUID(), style, color, quote: "", prefix: "", suffix: "" })),
  ];
}

export interface LawTextSegment {
  readonly text: string;
  readonly mark: LawMark | null;
}

export function segmentLawText(text: string, marks: readonly LawMark[]): LawTextSegment[] {
  const boundaries = [...new Set([0, text.length, ...marks.flatMap((mark) => [mark.start, mark.end])])]
    .filter((value) => value >= 0 && value <= text.length)
    .sort((a, b) => a - b);
  const segments: LawTextSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === undefined || end === undefined || start === end) continue;
    const mark = [...marks].reverse().find((item) => item.start <= start && item.end >= end) ?? null;
    segments.push({ text: text.slice(start, end), mark });
  }
  return segments;
}

/* ------------------------------------------------------------------ *
 * Âncora por trecho (spec 40, R-LEI-11 a R-LEI-13)
 *
 * A posição de caractere sozinha não sobrevive a uma correção do texto: uma
 * vírgula a mais no começo do parágrafo desloca todos os grifos dele. Cada
 * marcação guarda também o trecho exato e um pouco do que vem antes e depois
 * — o `TextQuoteSelector` da W3C Web Annotation — e é por ele que se reencontra.
 * ------------------------------------------------------------------ */

const CONTEXT = 32;

/** Recalcula `quote`, `prefix` e `suffix` a partir da posição, no texto atual. */
export function withLawQuotes(marks: readonly LawMark[], document: LawDocument): LawMark[] {
  const articles = new Map(document.articles.map((article) => [article.id, article]));
  return marks.map((mark) => {
    const paragraph = articles.get(mark.articleId)?.paragraphs[mark.paragraphIndex];
    if (paragraph === undefined) return mark;
    return {
      ...mark,
      quote: paragraph.slice(mark.start, mark.end),
      prefix: paragraph.slice(Math.max(0, mark.start - CONTEXT), mark.start),
      suffix: paragraph.slice(mark.end, mark.end + CONTEXT),
    };
  });
}

function sharedSuffix(a: string, b: string): number {
  let count = 0;
  while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
  return count;
}

function sharedPrefix(a: string, b: string): number {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
}

export interface AnchoredLawMarks {
  /** As que têm lugar no texto atual, já na posição em que devem ser pintadas. */
  readonly placed: LawMark[];
  /** As que perderam o trecho: continuam gravadas, e não são pintadas. */
  readonly lost: LawMark[];
}

/**
 * Reencontra cada marcação no texto atual (R-LEI-12).
 *
 * No lugar gravado, se o trecho ainda está lá. Senão, entre as ocorrências do
 * trecho nos parágrafos do MESMO artigo, a de contexto mais parecido com o
 * gravado; empate de contexto entre duas ocorrências é ambiguidade, e a
 * marcação é dada como perdida — pintar o trecho errado é pior do que avisar.
 */
export function anchorLawMarks(marks: readonly LawMark[], document: LawDocument): AnchoredLawMarks {
  const articles = new Map(document.articles.map((article) => [article.id, article]));
  const placed: LawMark[] = [];
  const lost: LawMark[] = [];
  for (const mark of marks) {
    const article = articles.get(mark.articleId);
    if (!article || !mark.quote) { lost.push(mark); continue; }
    if (article.paragraphs[mark.paragraphIndex]?.slice(mark.start, mark.end) === mark.quote) { placed.push(mark); continue; }

    const candidates: { paragraphIndex: number; start: number; score: number; distance: number }[] = [];
    article.paragraphs.forEach((paragraph, paragraphIndex) => {
      for (let start = paragraph.indexOf(mark.quote); start >= 0; start = paragraph.indexOf(mark.quote, start + 1)) {
        const end = start + mark.quote.length;
        const score = sharedSuffix(paragraph.slice(Math.max(0, start - CONTEXT), start), mark.prefix)
          + sharedPrefix(paragraph.slice(end, end + CONTEXT), mark.suffix);
        candidates.push({ paragraphIndex, start, score, distance: Math.abs(paragraphIndex - mark.paragraphIndex) * 100_000 + Math.abs(start - mark.start) });
      }
    });
    candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
    const [best, second] = candidates;
    if (!best || (second && second.score === best.score && best.score === 0)) { lost.push(mark); continue; }
    if (second && second.score === best.score && second.distance === best.distance) { lost.push(mark); continue; }
    placed.push({ ...mark, paragraphIndex: best.paragraphIndex, start: best.start, end: best.start + mark.quote.length });
  }
  return { placed, lost };
}

export interface LawMarksDiff {
  readonly insert: LawMark[];
  readonly update: LawMark[];
  readonly remove: string[];
}

function sameMark(a: LawMark, b: LawMark): boolean {
  return a.articleId === b.articleId && a.paragraphIndex === b.paragraphIndex && a.start === b.start && a.end === b.end
    && a.style === b.style && a.color === b.color && a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix;
}

/** O que gravar para ir de uma lista à outra, por id (R-LEI-15). */
export function diffLawMarks(previous: readonly LawMark[], next: readonly LawMark[]): LawMarksDiff {
  const before = new Map(previous.map((mark) => [mark.id, mark]));
  const after = new Set(next.map((mark) => mark.id));
  return {
    insert: next.filter((mark) => !before.has(mark.id)),
    update: next.filter((mark) => { const old = before.get(mark.id); return old !== undefined && !sameMark(old, mark); }),
    remove: previous.filter((mark) => !after.has(mark.id)).map((mark) => mark.id),
  };
}
