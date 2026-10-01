import type { LawDocument } from "./law-library";

export type LawMarkStyle = "highlight" | "underline" | "strike" | "outline";
export type LawMarkColor = "yellow" | "mint" | "blue" | "pink" | "lilac" | "peach" | "salmon";

export interface LawTextRange {
  readonly articleId: string;
  readonly paragraphIndex: number;
  readonly start: number;
  readonly end: number;
}

export interface LawMark extends LawTextRange {
  readonly id: string;
  readonly style: LawMarkStyle;
  readonly color: LawMarkColor;
}

export const LAW_MARK_COLORS: Readonly<Record<LawMarkColor, string>> = {
  yellow: "#fff19a",
  mint: "#b9efd4",
  blue: "#bedcf7",
  pink: "#f7c7df",
  lilac: "#ded0fa",
  peach: "#ffd9b8",
  salmon: "#f2bbb7",
};

const STYLES: readonly string[] = ["highlight", "underline", "strike", "outline"];

export function validateLawMarks(raw: unknown, document: LawDocument): LawMark[] {
  if (!Array.isArray(raw)) return [];
  const articles = new Map(document.articles.map((article) => [article.id, article]));
  return raw.slice(0, 5000).filter((value): value is LawMark => {
    if (!value || typeof value !== "object") return false;
    const mark = value as Partial<LawMark>;
    const article = articles.get(mark.articleId ?? "");
    const paragraph = article?.paragraphs[mark.paragraphIndex ?? -1];
    return typeof mark.id === "string" &&
      typeof mark.articleId === "string" &&
      Number.isInteger(mark.paragraphIndex) &&
      Number.isInteger(mark.start) &&
      Number.isInteger(mark.end) &&
      typeof paragraph === "string" &&
      (mark.start ?? -1) >= 0 &&
      (mark.end ?? 0) > (mark.start ?? -1) &&
      (mark.end ?? Infinity) <= paragraph.length &&
      STYLES.includes(mark.style ?? "") &&
      Object.hasOwn(LAW_MARK_COLORS, mark.color ?? "");
  });
}

export function eraseLawRanges(marks: readonly LawMark[], ranges: readonly LawTextRange[]): LawMark[] {
  let result = [...marks];
  for (const range of ranges) {
    result = result.flatMap((mark) => {
      if (mark.articleId !== range.articleId || mark.paragraphIndex !== range.paragraphIndex ||
          mark.end <= range.start || mark.start >= range.end) return [mark];
      const parts: LawMark[] = [];
      if (mark.start < range.start) parts.push({ ...mark, end: range.start });
      if (mark.end > range.end) parts.push({ ...mark, id: crypto.randomUUID(), start: range.end });
      return parts;
    });
  }
  return result;
}

export function paintLawRanges(
  marks: readonly LawMark[],
  ranges: readonly LawTextRange[],
  style: LawMarkStyle,
  color: LawMarkColor,
): LawMark[] {
  return [
    ...eraseLawRanges(marks, ranges),
    ...ranges.map((range) => ({ ...range, id: crypto.randomUUID(), style, color })),
  ];
}

export interface LawTextSegment {
  readonly text: string;
  readonly mark: LawMark | null;
}

export function segmentLawText(text: string, marks: readonly LawMark[]): LawTextSegment[] {
  const boundaries = [...new Set([0, text.length, ...marks.flatMap((mark) => [mark.start, mark.end])])]
    .filter((value) => value >= 0 && value <= text.length)
    .sort((a, b) => a - b);
  const segments: LawTextSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === undefined || end === undefined || start === end) continue;
    const mark = [...marks].reverse().find((item) => item.start <= start && item.end >= end) ?? null;
    segments.push({ text: text.slice(start, end), mark });
  }
  return segments;
}
