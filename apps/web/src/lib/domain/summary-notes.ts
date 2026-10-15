import type { SummaryNote } from "../api/summaries.ts";

export function validSummaryNotes(value: unknown): value is SummaryNote[] {
  return Array.isArray(value) && value.length <= 2000 && value.every(note => note &&
    typeof note.id === "string" && typeof note.path === "string" &&
    Number.isInteger(note.start) && Number.isInteger(note.end) && note.start >= 0 && note.end > note.start &&
    typeof note.quote === "string" && typeof note.comment === "string" && note.comment.length <= 2000 &&
    ["highlight", "bold", "color", "underline", "strike", "outline", "comment"].includes(note.style) &&
    typeof note.color === "string" && /^#[0-9a-f]{6}$/i.test(note.color));
}

/** Sobreposições combinam negrito, cor e destaque sem alterar o texto. */
export function summarySegments(text: string, path: string, notes: readonly SummaryNote[]) {
  const matching = notes.filter(note => note.path === path && note.end <= text.length && text.slice(note.start, note.end) === note.quote);
  const cuts = [...new Set([0, text.length, ...matching.flatMap(note => [note.start, note.end])])].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((start, i) => {
    const end = cuts[i + 1]!;
    return { text: text.slice(start, end), notes: matching.filter(note => note.start <= start && note.end >= end) };
  });
}

export function eraseSummaryRanges(notes: readonly SummaryNote[], ranges: readonly { path: string; start: number; end: number }[]): SummaryNote[] {
  return notes.flatMap(note => {
    let pieces = [note];
    for (const range of ranges) {
      if (range.path !== note.path) continue;
      pieces = pieces.flatMap(piece => {
        if (range.end <= piece.start || range.start >= piece.end) return [piece];
        if (piece.style === "comment") return [];
        const result: SummaryNote[] = [];
        if (range.start > piece.start) result.push({ ...piece, end: range.start, quote: piece.quote.slice(0, range.start - piece.start) });
        if (range.end < piece.end) result.push({ ...piece, id: `${piece.id}-r`, start: range.end, quote: piece.quote.slice(range.end - piece.start) });
        return result;
      });
    }
    return pieces;
  });
}
