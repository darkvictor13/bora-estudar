import assert from "node:assert/strict";
import test from "node:test";

import { anchorLawMarks, diffLawMarks, eraseLawRanges, paintLawRanges, segmentLawText, withLawQuotes, type LawMark } from "./law-markings.ts";

const document = {
  id: "lei-teste",
  articles: [{ id: "art-1", label: "Art. 1º", section: "", paragraphs: ["abcdefghij"] }],
};

const original: LawMark = {
  id: "marca-1", articleId: "art-1", paragraphIndex: 0,
  start: 1, end: 9, style: "highlight", color: "yellow", quote: "bcdefghi", prefix: "a", suffix: "j",
};

test("apagar apenas o trecho selecionado preserva as partes restantes", () => {
  const marks = eraseLawRanges([original], [{ articleId: "art-1", paragraphIndex: 0, start: 3, end: 6 }]);
  assert.deepEqual(marks.map(({ start, end }) => [start, end]), [[1, 3], [6, 9]]);
  assert.equal(segmentLawText("abcdefghij", marks).map((part) => part.text).join(""), "abcdefghij");
  assert.deepEqual(segmentLawText("abcdefghij", marks).filter((part) => part.mark).map((part) => part.text), ["bc", "ghi"]);
});

test("uma nova cor substitui a marcação somente no trecho escolhido", () => {
  const marks = paintLawRanges([original], [{ articleId: "art-1", paragraphIndex: 0, start: 3, end: 6 }], "underline", "mint");
  assert.deepEqual(marks.map(({ start, end, style, color }) => [start, end, style, color]), [
    [1, 3, "highlight", "yellow"], [6, 9, "highlight", "yellow"], [3, 6, "underline", "mint"],
  ]);
});

test("a âncora é o trecho da posição, com o contexto dos dois lados", () => {
  const [split] = withLawQuotes(eraseLawRanges([original], [{ articleId: "art-1", paragraphIndex: 0, start: 3, end: 6 }]), document);
  assert.deepEqual([split?.quote, split?.prefix, split?.suffix], ["bc", "a", "defghij"]);
});

// Spec 40, CA-07.
const law = (paragraphs: string[]) => ({ id: "lei", articles: [{ id: "art-1", label: "Art. 1º", section: "", paragraphs }] });
const mark = (text: string, quote: string, paragraphIndex = 0, occurrence = 0): LawMark => {
  let start = -1;
  for (let index = 0; index <= occurrence; index += 1) start = text.indexOf(quote, start + 1);
  const [anchored] = withLawQuotes([{ id: `m-${quote}`, articleId: "art-1", paragraphIndex, start, end: start + quote.length, style: "highlight", color: "yellow", quote: "", prefix: "", suffix: "" }], law([text]));
  return { ...anchored!, paragraphIndex };
};

test("trecho no lugar pinta no lugar", () => {
  const text = "É crime vender droga sem autorização.";
  const result = anchorLawMarks([mark(text, "vender droga")], law([text]));
  assert.equal(result.lost.length, 0);
  assert.equal(result.placed[0]?.start, text.indexOf("vender droga"));
});

test("trecho deslocado pela correção pinta no lugar novo", () => {
  const before = "É crime vender droga sem autorização.";
  const after = "Constitui crime, nos termos desta Lei, vender droga sem autorização.";
  const result = anchorLawMarks([mark(before, "vender droga")], law([after]));
  assert.equal(result.placed[0]?.start, after.indexOf("vender droga"));
});

test("parágrafo inserido antes leva o grifo para o parágrafo seguinte", () => {
  const text = "Parágrafo único. A pena é aumentada.";
  const result = anchorLawMarks([mark(text, "aumentada")], law(["Novo inciso acrescentado.", text]));
  assert.deepEqual([result.placed[0]?.paragraphIndex, result.placed[0]?.start], [1, text.indexOf("aumentada")]);
});

test("trecho repetido escolhe a ocorrência pelo contexto", () => {
  const before = "a pena de reclusão, e a pena de multa";
  const target = mark(before, "a pena", 0, 1); // a segunda: "e a pena de multa"
  const after = "Aplica-se a pena de reclusão, e a pena de multa";
  const result = anchorLawMarks([target], law([after]));
  assert.equal(result.placed[0]?.start, after.lastIndexOf("a pena"));
});

test("trecho que sumiu não pinta e é contado", () => {
  const before = "É crime vender droga sem autorização.";
  const result = anchorLawMarks([mark(before, "vender droga")], law(["É crime fornecer substância sem autorização."]));
  assert.equal(result.placed.length, 0);
  assert.equal(result.lost.length, 1);
});

test("artigo retirado deixa a marcação sem lugar", () => {
  const result = anchorLawMarks([{ ...original, articleId: "art-que-saiu" }], document);
  assert.equal(result.lost.length, 1);
});

// Spec 40, CA-08.
test("o diff é criar, alterar e apagar por id", () => {
  const kept = { ...original, id: "fica" };
  const changed = { ...original, id: "muda" };
  const gone = { ...original, id: "sai" };
  const added = { ...original, id: "entra" };
  const diff = diffLawMarks([kept, changed, gone], [kept, { ...changed, color: "mint" }, added]);
  assert.deepEqual(diff.insert.map((item) => item.id), ["entra"]);
  assert.deepEqual(diff.update.map((item) => [item.id, item.color]), [["muda", "mint"]]);
  assert.deepEqual(diff.remove, ["sai"]);
  assert.deepEqual(diffLawMarks([kept], [kept]), { insert: [], update: [], remove: [] });
});
