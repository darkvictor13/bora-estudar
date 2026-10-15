import test from "node:test";
import assert from "node:assert/strict";
import { summaryShortcut, isSummaryRangeBold } from "./summary-shortcuts.ts";
import { MARK_COLORS } from "./text-markings.ts";
import type { SummaryNote } from "../api/summaries.ts";

test("N e 1 a 7 correspondem às ferramentas de seleção", () => {
  assert.equal(summaryShortcut("n")?.style, "bold");
  assert.equal(summaryShortcut("N")?.style, "bold");
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(key => summaryShortcut(String(key))?.color), Object.values(MARK_COLORS));
  assert.equal(summaryShortcut("8"), null);
  assert.equal(summaryShortcut("!"), null);
});
test("negrito é removido apenas quando cobre toda a seleção", () => {
  const note: SummaryNote = { id: "1", path: "0", start: 0, end: 5, quote: "texto", style: "bold", color: "#146a4a", comment: "" };
  assert.equal(isSummaryRangeBold({ path: "0", start: 1, end: 3 }, [note]), true);
  assert.equal(isSummaryRangeBold({ path: "0", start: 1, end: 7 }, [note]), false);
  assert.equal(isSummaryRangeBold({ path: "outro", start: 1, end: 3 }, [note]), false);
});
