import type { LawExamMap, LawExamMapSection } from "../api/laws.ts";

// Os mapas vêm do contrato (spec 40); o "tem texto" de cada item é calculado
// pelo banco a partir da biblioteca, e não escrito à mão (R-LEI-05).
export type { LawExamMap, LawExamMapItem, LawExamMapSection, LawExamMaps } from "../api/laws.ts";

export interface LawExamMapStats {
  readonly total: number;
  readonly available: number;
  readonly pending: number;
  readonly coverage: number;
}

export function getLawExamMap(maps: readonly LawExamMap[], id: string | null): LawExamMap {
  const fallback = maps[0];
  if (!fallback) throw new Error("Nenhum mapa de edital foi cadastrado.");
  return maps.find((map) => map.id === id) ?? fallback;
}

export function getLawExamMapStats(map: LawExamMap): LawExamMapStats {
  const items = map.sections.flatMap((section) => section.items);
  const unique = new Map(items.map((item) => [item.canonicalId, item]));
  const available = [...unique.values()].filter((item) => item.available).length;
  return {
    total: unique.size,
    available,
    pending: unique.size - available,
    coverage: unique.size === 0 ? 0 : Math.round((available / unique.size) * 100),
  };
}

export function filterLawExamMap(map: LawExamMap, query: string): LawExamMapSection[] {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  if (!normalized) return [...map.sections];
  return map.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        `${section.title} ${item.title} ${item.scope} ${item.canonicalId}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalized),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
