import assert from "node:assert/strict";
import test from "node:test";

import {
  anchorFlashcardMarks,
  diffFlashcardMarks,
  eraseFlashcardRanges,
  libraryMarkDeckIds,
  paintFlashcardRanges,
  resolveFlashcardMarkAliases,
  withFlashcardQuotes,
  type FlashcardMark,
  type FlashcardSide,
  type MarkableCard,
} from "./flashcard-markings.ts";

const ref = { kind: "lesson", deckId: "aula-1", cardId: "cartao-1" } as const;
const card = (front: string, back: string): MarkableCard => ({ id: "cartao-1", front, back });

/** Uma marcação no `side` de `text`, na ocorrência pedida de `quote`, já com âncora. */
function mark(text: MarkableCard, side: FlashcardSide, quote: string, occurrence = 0): FlashcardMark {
  const source = side === "front" ? text.front : text.back;
  let start = -1;
  for (let index = 0; index <= occurrence; index += 1) start = source.indexOf(quote, start + 1);
  const [anchored] = withFlashcardQuotes(
    paintFlashcardRanges([], [{ card: ref, side, start, end: start + quote.length }], "highlight", "yellow"),
    [text],
  );
  return anchored!;
}

// Spec 42, CA-06.
test("trecho no lugar pinta no lugar", () => {
  const text = card("Qual o prazo do inquérito?", "Dez dias, se o indiciado estiver preso.");
  const result = anchorFlashcardMarks([mark(text, "back", "Dez dias")], [text]);
  assert.equal(result.lost.size, 0);
  assert.deepEqual([result.placed[0]?.start, result.placed[0]?.end], [0, 8]);
});

test("trecho deslocado pela correção pinta no lugar novo", () => {
  const before = card("Qual o prazo do inquérito?", "Dez dias, se o indiciado estiver preso.");
  const after = card("Qual o prazo do inquérito?", "Em regra, dez dias, se o indiciado estiver preso.");
  const result = anchorFlashcardMarks([mark(before, "back", "estiver preso")], [after]);
  assert.equal(result.placed[0]?.start, after.back.indexOf("estiver preso"));
});

test("trecho repetido escolhe a ocorrência pelo contexto", () => {
  const before = card("?", "o prazo do preso e o prazo do solto");
  const target = mark(before, "back", "o prazo", 1); // a segunda: "o prazo do solto"
  const after = card("?", "Atenção: o prazo do preso e o prazo do solto");
  const result = anchorFlashcardMarks([target], [after]);
  assert.equal(result.placed[0]?.start, after.back.lastIndexOf("o prazo"));
});

test("trecho que sumiu não pinta e é contado no cartão", () => {
  const before = card("Qual o prazo?", "Dez dias, se preso.");
  const result = anchorFlashcardMarks([mark(before, "back", "Dez dias")], [card("Qual o prazo?", "Quinze dias, se preso.")]);
  assert.equal(result.placed.length, 0);
  assert.equal(result.lost.get("cartao-1"), 1);
});

test("o grifo do verso nunca se reancora na frente", () => {
  const before = card("O prazo é de dez dias?", "Dez dias, se preso.");
  const after = card("O prazo é de dez dias?", "Quinze dias, se preso.");
  // "dias" continua existindo na frente, mas a marcação era do verso.
  const result = anchorFlashcardMarks([{ ...mark(before, "back", "Dez dias"), quote: "dias" }], [after]);
  assert.ok(result.placed.every((item) => item.side === "back"));
  assert.equal(result.placed[0]?.start, after.back.indexOf("dias"));
});

test("marcação de cartão que não está no deck não pinta nem é contada", () => {
  const text = card("Pergunta", "Resposta");
  const result = anchorFlashcardMarks([mark(text, "front", "Pergunta")], [{ ...text, id: "outro" }]);
  assert.deepEqual([result.placed.length, result.lost.size], [0, 0]);
});

test("apagar e pintar valem só no mesmo lado do mesmo cartão", () => {
  const text = card("abcdefghij", "abcdefghij");
  const front = mark(text, "front", "bcdefghi");
  const back = mark(text, "back", "bcdefghi");
  const erased = eraseFlashcardRanges([front, back], [{ card: ref, side: "front", start: 3, end: 6 }]);
  assert.deepEqual(erased.filter((item) => item.side === "front").map(({ start, end }) => [start, end]), [[1, 3], [6, 9]]);
  assert.deepEqual(erased.filter((item) => item.side === "back").map(({ start, end }) => [start, end]), [[1, 9]]);
  const otherCard = eraseFlashcardRanges([front], [{ card: { ...ref, cardId: "outro" }, side: "front", start: 3, end: 6 }]);
  assert.deepEqual(otherCard, [front]);
});

test("o diff é criar, alterar e apagar por id", () => {
  const text = card("abcdefghij", "x");
  const base = mark(text, "front", "bcd");
  const kept = { ...base, id: "fica" };
  const changed = { ...base, id: "muda" };
  const gone = { ...base, id: "sai" };
  const added = { ...base, id: "entra" };
  const diff = diffFlashcardMarks([kept, changed, gone], [kept, { ...changed, color: "mint" }, added]);
  assert.deepEqual(diff.insert.map((item) => item.id), ["entra"]);
  assert.deepEqual(diff.update.map((item) => [item.id, item.color]), [["muda", "mint"]]);
  assert.deepEqual(diff.remove, ["sai"]);
  assert.deepEqual(diffFlashcardMarks([kept], [kept]), { insert: [], update: [], remove: [] });
});

// Spec 42, CA-07.
test("a marcação do cartão antigo da biblioteca aparece no cartão do alias", () => {
  const aliases = [{ oldDeckId: "deck-velho", oldCardId: "c-velho", deckId: "deck-novo", cardId: "c-novo" }];
  const stored: FlashcardMark = {
    ...mark(card("Pergunta", "Resposta"), "front", "Pergunta"),
    card: { kind: "library", deckId: "deck-velho", cardId: "c-velho" },
  };
  const [resolved] = resolveFlashcardMarkAliases([stored], aliases);
  assert.deepEqual(resolved?.card, { kind: "library", deckId: "deck-novo", cardId: "c-novo" });
  assert.deepEqual(libraryMarkDeckIds("deck-novo", aliases), ["deck-novo", "deck-velho"]);
  // Cartão de aula com o mesmo par não é cartão da biblioteca.
  const lesson = { ...stored, card: { kind: "lesson", deckId: "deck-velho", cardId: "c-velho" } } as const;
  assert.deepEqual(resolveFlashcardMarkAliases([lesson], aliases), [lesson]);
});
