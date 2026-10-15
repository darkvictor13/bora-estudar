import { MARK_COLORS } from "./text-markings.ts";
import type { SummaryNote } from "../api/summaries.ts";

/** Verifica cobertura contínua, inclusive quando há várias marcações adjacentes. */
export function isSummaryRangeBold(range: { path: string; start: number; end: number }, notes: readonly SummaryNote[]) {
  let covered = range.start;
  const bold = notes.filter(note => note.style === "bold" && note.path === range.path && note.end > range.start && note.start < range.end).sort((a, b) => a.start - b.start);
  for (const note of bold) {
    if (note.start > covered) return false;
    covered = Math.max(covered, note.end);
    if (covered >= range.end) return true;
  }
  return false;
}

export const SUMMARY_HIGHLIGHT_KEYS = ["yellow", "mint", "blue", "pink", "lilac", "peach", "salmon"] as const;

export function summaryShortcut(key: string) {
  if (key.toLowerCase() === "n") return { style: "bold" as const, color: "#146a4a" };
  if (!/^[1-7]$/.test(key)) return null;
  return { style: "highlight" as const, color: MARK_COLORS[SUMMARY_HIGHLIGHT_KEYS[Number(key) - 1]!] };
}
