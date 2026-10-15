import test from "node:test";
import assert from "node:assert/strict";
import { summarySegments, eraseSummaryRanges, validSummaryNotes } from "./summary-notes.ts";
import type { SummaryNote } from "../api/summaries.ts";

const bold: SummaryNote = { id: "bold", path: "0", start: 0, end: 5, quote: "texto", style: "bold", color: "#146a4a", comment: "" };
test("marcações combinam estilos e mantêm o texto original", () => {
  const notes: SummaryNote[] = [bold, { ...bold, id: "color", start: 2, end: 5, quote: "xto", style: "color" }];
  const segments = summarySegments("texto inteiro", "0", notes);
  assert.equal(segments.map(segment => segment.text).join(""), "texto inteiro");
  assert.equal(segments[1]?.notes.length, 2);
  assert.equal(summarySegments("mudou inteiro", "0", notes)[0]?.notes.length, 0);
  assert.equal(summarySegments("texto inteiro", "outro", notes)[0]?.notes.length, 0);
});
test("apagar parte de uma marcação preserva suas extremidades", () => {
  const result = eraseSummaryRanges([bold], [{ path: "0", start: 1, end: 4 }]);
  assert.deepEqual(result.map(note => [note.start, note.end, note.quote]), [[0, 1, "t"], [4, 5, "o"]]);
});
test("anotações recusam cores e comentários inválidos", () => {
  assert.ok(validSummaryNotes([bold]));
  assert.equal(validSummaryNotes([{ ...bold, color: "url(javascript:evil)" }]), false);
  assert.equal(validSummaryNotes([{ ...bold, comment: "x".repeat(2001) }]), false);
});
