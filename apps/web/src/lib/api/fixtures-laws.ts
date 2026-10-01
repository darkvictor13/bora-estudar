import type { LawDocument, LawEntry, LawExamMaps, LawLibrary, LawMark, LawsApi, SaveLawMarksInput } from "./laws.ts";
import type { Result } from "./contract.ts";
import { diffLawMarks } from "../domain/law-markings.ts";

/**
 * O Vade Mecum da implementação `fixtures`, lido dos mesmos arquivos que a
 * carga leva ao banco (spec 40). Import DINÂMICO, como a biblioteca de
 * flashcards (spec 39, R-BIB-32): os arquivos viram chunks à parte, baixados
 * só quando a `fixtures` os pede.
 */

interface IndexEntry extends Omit<LawEntry, "articleCount"> { readonly articleCount: number }

let library: Promise<LawLibrary> | null = null;
let maps: Promise<LawExamMaps> | null = null;
const marks = new Map<string, LawMark[]>();

function loadIndex(): Promise<LawLibrary> {
  library ??= import("../../data/laws/index.json", { with: { type: "json" } }).then(({ default: index }) => {
    const laws = index as readonly IndexEntry[];
    return { laws, subjects: [...new Set(laws.map((law) => law.subject))] };
  });
  return library;
}

export function resetFixtureLawMarks(): void {
  marks.clear();
}

export function createLawFixtures(later: <T>(value: T) => Promise<T>, once: <T>(requestId: string, run: () => Result<T>) => Result<T>): LawsApi {
  return {
    loadLawLibrary: async () => later(await loadIndex()),
    loadLawDocument: async (lawId: string) => {
      if (!(await loadIndex()).laws.some((law) => law.id === lawId)) return later(null);
      const { default: document } = await import(`../../data/laws/text/${lawId}.json`, { with: { type: "json" } }) as { default: LawDocument };
      return later(document);
    },
    loadExamMaps: async () => {
      maps ??= import("../../data/laws/exam-maps.json", { with: { type: "json" } }).then(({ default: file }) => file as LawExamMaps);
      return later(await maps);
    },
    loadLawMarks: (lawId: string) => later([...(marks.get(lawId) ?? [])]),
    saveLawMarks: (input: SaveLawMarksInput) => later(once(input.requestId, () => {
      const diff = diffLawMarks(input.previous, input.next);
      const current = new Map((marks.get(input.lawId) ?? []).map((mark) => [mark.id, mark]));
      for (const id of diff.remove) current.delete(id);
      for (const mark of [...diff.insert, ...diff.update]) current.set(mark.id, mark);
      marks.set(input.lawId, [...current.values()]);
      return { ok: true, data: null } as const;
    })),
  };
}
