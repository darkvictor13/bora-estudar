export type SummaryBlock =
  | { type: "paragraph" | "heading"; text: string }
  | { type: "image"; key: string; alt: string; url?: string }
  | { type: "table"; rows: SummaryBlock[][][] };

export interface SummaryTopic {
  id: string;
  subject: string;
  title: string;
}
export interface SummaryDocument extends SummaryTopic {
  sourceName: string;
  blocks: SummaryBlock[];
}

export type SummaryNoteStyle = "highlight" | "bold" | "color" | "underline" | "strike" | "outline" | "comment";
export interface SummaryNote {
  id: string;
  path: string;
  start: number;
  end: number;
  quote: string;
  style: SummaryNoteStyle;
  color: string;
  comment: string;
}
