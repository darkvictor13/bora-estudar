import catalog from "../../data/laws/exam-maps.json" with { type: "json" };

export interface LawExamMapItem {
  readonly canonicalId: string;
  readonly title: string;
  readonly scope: string;
  readonly libraryId: string | null;
  readonly available: boolean;
}

export interface LawExamMapSection {
  readonly title: string;
  readonly items: readonly LawExamMapItem[];
}

export interface LawExamMap {
  readonly id: string;
  readonly shortName: string;
  readonly title: string;
  readonly accent: string;
  readonly canonicalId: string;
  readonly sections: readonly LawExamMapSection[];
}

export interface LawExamMapStats {
  readonly total: number;
  readonly available: number;
  readonly pending: number;
  readonly coverage: number;
}

export const LAW_EXAM_MAPS: readonly LawExamMap[] = catalog.maps;
export const LAW_EXAM_MAP_BASE_DATE = catalog.baseDate;

export function getLawExamMap(id: string | null): LawExamMap {
  const fallback = LAW_EXAM_MAPS[0];
  if (!fallback) throw new Error("Nenhum mapa de edital foi cadastrado.");
  return LAW_EXAM_MAPS.find((map) => map.id === id) ?? fallback;
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
