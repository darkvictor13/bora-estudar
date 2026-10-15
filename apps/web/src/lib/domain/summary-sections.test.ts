import test from "node:test";
import assert from "node:assert/strict";
import { summarySections } from "./summary-sections.ts";
import { summarySegments } from "./summary-notes.ts";
import type { SummaryBlock } from "../api/summaries.ts";

test("separar subtópicos conserva conteúdo e posições das marcações", () => {
  const blocks: SummaryBlock[] = [
    { type: "paragraph", text: "Introdução" },
    { type: "heading", text: "Primeiro assunto" },
    { type: "paragraph", text: "texto marcado" },
    { type: "heading", text: "Segundo assunto" },
    { type: "image", key: "image.png", alt: "Imagem" },
  ];
  const sections = summarySections(blocks);
  assert.deepEqual(sections.flatMap(section => section.blocks), blocks);
  assert.deepEqual(sections.map(section => section.start), [0, 1, 3]);
  const path = String(sections[1]!.start + 1);
  assert.equal(path, "2");
  assert.equal(summarySegments("texto marcado", path, [{ id: "saved", path: "2", start: 0, end: 5, quote: "texto", style: "bold", color: "#146a4a", comment: "" }])[0]?.notes.length, 1);
});
