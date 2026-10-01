import catalog from "@/data/laws/index.json";

export interface LawEntry {
  readonly id: string;
  readonly title: string;
  readonly norm: string;
  readonly subject: string;
  readonly officialUrl: string;
  readonly articleCount: number;
  readonly contentPath: string;
  readonly sourceDate: string | null;
}

export interface LawArticle {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly paragraphs: readonly string[];
}

export interface LawDocument {
  readonly id: string;
  readonly articles: readonly LawArticle[];
}

export const LAW_LIBRARY: readonly LawEntry[] = catalog;

export const LAW_SUBJECTS = [
  "Legislação Penal Especial",
  "Direitos Humanos e Proteção",
  "Direito Processual Penal",
  "Direito Administrativo e Transparência",
] as const;

export function searchLaws(query: string, subject?: string): LawEntry[] {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return LAW_LIBRARY.filter((law) =>
    (!subject || law.subject === subject) &&
    (!normalized || `${law.norm} ${law.title} ${law.subject}`.toLocaleLowerCase("pt-BR").includes(normalized)),
  );
}

export async function loadLawDocument(entry: LawEntry): Promise<LawDocument> {
  const response = await fetch(entry.contentPath);
  if (!response.ok) throw new Error(`Não foi possível carregar ${entry.title}.`);
  const data = await response.json() as LawDocument;
  if (data.id !== entry.id || !Array.isArray(data.articles)) {
    throw new Error(`O texto de ${entry.title} está incompleto.`);
  }
  return data;
}
