/**
 * O grifo no cartão (spec 42). As regras são as da lei seca, por
 * `text-markings.ts`; o que muda é o texto: um lado de um cartão, e não um
 * parágrafo de um artigo.
 */
import type { LibraryFlashcardAlias } from "../api/contract.ts";
import type { FlashcardCardRef, FlashcardMark, FlashcardSide, FlashcardTextRange } from "../api/flashcard-marks.ts";
import type { LawMarkColor, LawMarkStyle } from "../api/laws.ts";
import { blankMark, diffMarks, eraseRanges, findQuote, quoteAt, sameTextMark, type MarksDiff } from "./text-markings.ts";

export type { FlashcardMark, FlashcardSide, FlashcardTextRange } from "../api/flashcard-marks.ts";

/** O que a marcação precisa do cartão: o id e o texto dos dois lados. */
export interface MarkableCard {
  readonly id: string;
  readonly front: string;
  readonly back: string;
}

export function sameCard(a: FlashcardCardRef, b: FlashcardCardRef): boolean {
  return a.kind === b.kind && a.deckId === b.deckId && a.cardId === b.cardId;
}

/** O mesmo texto é o mesmo lado do mesmo cartão (R-GRIFO-21). */
const sameSide = (mark: FlashcardTextRange, range: FlashcardTextRange) =>
  mark.side === range.side && sameCard(mark.card, range.card);

export function eraseFlashcardRanges(marks: readonly FlashcardMark[], ranges: readonly FlashcardTextRange[]): FlashcardMark[] {
  return eraseRanges(marks, ranges, sameSide);
}

export function paintFlashcardRanges(
  marks: readonly FlashcardMark[],
  ranges: readonly FlashcardTextRange[],
  style: LawMarkStyle,
  color: LawMarkColor,
): FlashcardMark[] {
  return [
    ...eraseFlashcardRanges(marks, ranges),
    // A âncora é preenchida por `withFlashcardQuotes`, que precisa do texto.
    ...ranges.map((range) => ({ ...range, ...blankMark(style, color) })),
  ];
}

function sideText(card: MarkableCard, side: FlashcardSide): string {
  return side === "front" ? card.front : card.back;
}

/** Recalcula `quote`, `prefix` e `suffix` a partir da posição, no texto atual. */
export function withFlashcardQuotes(marks: readonly FlashcardMark[], cards: readonly MarkableCard[]): FlashcardMark[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return marks.map((mark) => {
    const card = byId.get(mark.card.cardId);
    return card ? { ...mark, ...quoteAt(sideText(card, mark.side), mark) } : mark;
  });
}

export interface AnchoredFlashcardMarks {
  /** As que têm lugar no texto atual, já na posição em que devem ser pintadas. */
  readonly placed: FlashcardMark[];
  /**
   * As que perderam o trecho, por cartão: continuam gravadas, não são
   * pintadas e o cartão as conta (R-GRIFO-13). Marcação de cartão que não está
   * no deck — retirado, apagado — não entra: não há cartão onde avisar.
   */
  readonly lost: ReadonlyMap<string, number>;
}

/**
 * Reencontra cada marcação no lado gravado do cartão (R-GRIFO-12). Nunca no
 * outro lado: o mesmo termo costuma aparecer na pergunta e na resposta, e
 * pintar no lado errado é pior do que avisar.
 */
export function anchorFlashcardMarks(marks: readonly FlashcardMark[], cards: readonly MarkableCard[]): AnchoredFlashcardMarks {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const placed: FlashcardMark[] = [];
  const lost = new Map<string, number>();
  for (const mark of marks) {
    const card = byId.get(mark.card.cardId);
    if (!card) continue;
    const place = findQuote(mark, [sideText(card, mark.side)], 0);
    if (place) placed.push({ ...mark, start: place.start, end: place.end });
    else lost.set(card.id, (lost.get(card.id) ?? 0) + 1);
  }
  return { placed, lost };
}

/** O que gravar para ir de uma lista à outra, por id (R-GRIFO-17). */
export function diffFlashcardMarks(previous: readonly FlashcardMark[], next: readonly FlashcardMark[]): MarksDiff<FlashcardMark> {
  return diffMarks(previous, next, (a, b) => sameSide(a, b) && sameTextMark(a, b));
}

/**
 * A marcação gravada num cartão da biblioteca que mudou de deck aparece no
 * substituto (R-GRIFO-16), como a revisão (R-BIB-08).
 */
export function resolveFlashcardMarkAliases(marks: readonly FlashcardMark[], aliases: readonly LibraryFlashcardAlias[]): FlashcardMark[] {
  const targets = new Map(aliases.map((alias) => [`${alias.oldDeckId}:${alias.oldCardId}`, alias] as const));
  return marks.map((mark) => {
    if (mark.card.kind !== "library") return mark;
    const alias = targets.get(`${mark.card.deckId}:${mark.card.cardId}`);
    return alias ? { ...mark, card: { kind: "library", deckId: alias.deckId, cardId: alias.cardId } } : mark;
  });
}

/** Os decks da biblioteca onde moram as marcações que aparecem em `deckId`. */
export function libraryMarkDeckIds(deckId: string, aliases: readonly LibraryFlashcardAlias[]): string[] {
  return [...new Set([deckId, ...aliases.filter((alias) => alias.deckId === deckId).map((alias) => alias.oldDeckId)])];
}
