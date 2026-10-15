import type { SummaryBlock } from "../api/summaries.ts";

/** Agrupa para leitura sem mudar a posição original usada nas anotações. */
export function summarySections(blocks: readonly SummaryBlock[]) {
  const sections: { start: number; title: string; blocks: SummaryBlock[] }[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "heading" || !sections.length) {
      sections.push({ start: index, title: block.type === "heading" ? block.text : "Visão geral", blocks: [] });
    }
    sections.at(-1)!.blocks.push(block);
  });
  return sections;
}
