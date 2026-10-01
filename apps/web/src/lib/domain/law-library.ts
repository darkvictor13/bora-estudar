import type { LawEntry } from "../api/laws.ts";

// O conteúdo vem do contrato, que lê do banco (spec 40). Aqui ficam só as
// regras sobre ele.
export type { LawArticle, LawDocument, LawEntry, LawLibrary } from "../api/laws.ts";

export function searchLaws(laws: readonly LawEntry[], query: string, subject?: string): LawEntry[] {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return laws.filter((law) =>
    (!subject || law.subject === subject) &&
    (!normalized || `${law.norm} ${law.title} ${law.subject}`.toLocaleLowerCase("pt-BR").includes(normalized)),
  );
}
