/**
 * Marcação de leitura sobre texto, sem saber de onde o texto vem.
 *
 * A lei seca (spec 40) e o cartão (spec 42) marcam do mesmo jeito: um trecho
 * de um texto, com estilo, cor e a âncora por trecho. O que muda entre os dois
 * é só QUAL texto — parágrafo de um artigo, lado de um cartão —, e é isso que
 * cada um diz a estas funções por um `sameText`.
 */
import type { LawMarkColor, LawMarkStyle } from "../api/laws.ts";

export type MarkStyle = LawMarkStyle;
export type MarkColor = LawMarkColor;

export const MARK_COLORS: Readonly<Record<MarkColor, string>> = {
  yellow: "#fff19a",
  mint: "#b9efd4",
  blue: "#bedcf7",
  pink: "#f7c7df",
  lilac: "#ded0fa",
  peach: "#ffd9b8",
  salmon: "#f2bbb7",
};

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * A âncora por trecho — o `TextQuoteSelector` da W3C Web Annotation. A posição
 * sozinha não sobrevive a uma correção do texto: uma vírgula a mais no começo
 * desloca todos os grifos dali em diante.
 */
export interface TextQuote {
  readonly quote: string;
  readonly prefix: string;
  readonly suffix: string;
}

export interface TextMark extends TextSpan, TextQuote {
  readonly id: string;
  readonly style: MarkStyle;
  readonly color: MarkColor;
}

export function eraseRanges<M extends TextMark, R extends TextSpan>(
  marks: readonly M[],
  ranges: readonly R[],
  sameText: (mark: M, range: R) => boolean,
): M[] {
  let result = [...marks];
  for (const range of ranges) {
    result = result.flatMap((mark) => {
      if (!sameText(mark, range) || mark.end <= range.start || mark.start >= range.end) return [mark];
      const parts: M[] = [];
      if (mark.start < range.start) parts.push({ ...mark, end: range.start });
      if (mark.end > range.end) parts.push({ ...mark, id: crypto.randomUUID(), start: range.end });
      return parts;
    });
  }
  return result;
}

/** A âncora fica vazia: quem a preenche é quem conhece o texto. */
export function blankMark(style: MarkStyle, color: MarkColor): Omit<TextMark, "start" | "end"> {
  return { id: crypto.randomUUID(), style, color, quote: "", prefix: "", suffix: "" };
}

export interface TextSegment<M> {
  readonly text: string;
  readonly mark: M | null;
}

export function segmentText<M extends TextSpan>(text: string, marks: readonly M[]): TextSegment<M>[] {
  const boundaries = [...new Set([0, text.length, ...marks.flatMap((mark) => [mark.start, mark.end])])]
    .filter((value) => value >= 0 && value <= text.length)
    .sort((a, b) => a - b);
  const segments: TextSegment<M>[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === undefined || end === undefined || start === end) continue;
    const mark = [...marks].reverse().find((item) => item.start <= start && item.end >= end) ?? null;
    segments.push({ text: text.slice(start, end), mark });
  }
  return segments;
}

const CONTEXT = 32;

/** O trecho que a posição aponta no texto atual, com o contexto dos dois lados. */
export function quoteAt(text: string, span: TextSpan): TextQuote {
  return {
    quote: text.slice(span.start, span.end),
    prefix: text.slice(Math.max(0, span.start - CONTEXT), span.start),
    suffix: text.slice(span.end, span.end + CONTEXT),
  };
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

export interface TextPlace {
  /** Qual dos `texts`. */
  readonly index: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Reencontra uma marcação entre `texts` (R-LEI-12, R-GRIFO-12).
 *
 * No lugar gravado, se o trecho ainda está lá. Senão, entre as ocorrências do
 * trecho, a de contexto mais parecido com o gravado, desempatando pela mais
 * próxima da posição antiga. Empate sem contexto, ou empate em contexto e em
 * distância, é ambiguidade: `null` — pintar o trecho errado é pior do que
 * avisar.
 */
export function findQuote(mark: TextSpan & TextQuote, texts: readonly string[], index: number): TextPlace | null {
  if (!mark.quote) return null;
  if (texts[index]?.slice(mark.start, mark.end) === mark.quote) return { index, start: mark.start, end: mark.end };

  const candidates: { index: number; start: number; score: number; distance: number }[] = [];
  texts.forEach((text, textIndex) => {
    for (let start = text.indexOf(mark.quote); start >= 0; start = text.indexOf(mark.quote, start + 1)) {
      const end = start + mark.quote.length;
      const score = sharedSuffix(text.slice(Math.max(0, start - CONTEXT), start), mark.prefix)
        + sharedPrefix(text.slice(end, end + CONTEXT), mark.suffix);
      candidates.push({ index: textIndex, start, score, distance: Math.abs(textIndex - index) * 100_000 + Math.abs(start - mark.start) });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
  const [best, second] = candidates;
  if (!best || (second && second.score === best.score && best.score === 0)) return null;
  if (second && second.score === best.score && second.distance === best.distance) return null;
  return { index: best.index, start: best.start, end: best.start + mark.quote.length };
}

export interface MarksDiff<M> {
  readonly insert: M[];
  readonly update: M[];
  readonly remove: string[];
}

/** O que gravar para ir de uma lista à outra, por id (R-LEI-15, R-GRIFO-17). */
export function diffMarks<M extends { readonly id: string }>(
  previous: readonly M[],
  next: readonly M[],
  same: (a: M, b: M) => boolean,
): MarksDiff<M> {
  const before = new Map(previous.map((mark) => [mark.id, mark]));
  const after = new Set(next.map((mark) => mark.id));
  return {
    insert: next.filter((mark) => !before.has(mark.id)),
    update: next.filter((mark) => { const old = before.get(mark.id); return old !== undefined && !same(old, mark); }),
    remove: previous.filter((mark) => !after.has(mark.id)).map((mark) => mark.id),
  };
}

export function sameTextMark(a: TextMark, b: TextMark): boolean {
  return a.start === b.start && a.end === b.end && a.style === b.style && a.color === b.color
    && a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix;
}
