import assert from "node:assert/strict";
import test from "node:test";

import { eraseLawRanges, paintLawRanges, segmentLawText, validateLawMarks, type LawMark } from "./law-markings.ts";

const document = {
  id: "lei-teste",
  articles: [{ id: "art-1", label: "Art. 1º", section: "", paragraphs: ["abcdefghij"] }],
};

const original: LawMark = {
  id: "marca-1", articleId: "art-1", paragraphIndex: 0,
  start: 1, end: 9, style: "highlight", color: "yellow",
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

test("marcações salvas fora do texto ou com estilo inválido são descartadas", () => {
  assert.deepEqual(validateLawMarks([original, { ...original, end: 11 }, { ...original, style: "unknown" }], document), [original]);
});
