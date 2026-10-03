import type { LawLibrary, LawMark, LawsApi, SaveLawMarksInput } from "./laws.ts";
import type { Result } from "./contract.ts";
import { diffLawMarks } from "../domain/law-markings.ts";
import { SAMPLE_EXAM_MAPS, SAMPLE_LAW_INDEX, SAMPLE_LAW_TEXTS } from "./fixtures-content.ts";

/**
 * O Vade Mecum da implementação `fixtures`: duas leis inventadas e um edital,
 * de `fixtures-content.ts` (spec 41, R-PUB-05). O texto real chega ao site só
 * pelo banco.
 */

const library: LawLibrary = { laws: SAMPLE_LAW_INDEX, subjects: [...new Set(SAMPLE_LAW_INDEX.map((law) => law.subject))] };
const marks = new Map<string, LawMark[]>();

export function resetFixtureLawMarks(): void {
  marks.clear();
}

export function createLawFixtures(later: <T>(value: T) => Promise<T>, once: <T>(requestId: string, run: () => Result<T>) => Result<T>): LawsApi {
  return {
    loadLawLibrary: () => later(library),
    loadLawDocument: (lawId: string) => later(SAMPLE_LAW_TEXTS[lawId] ?? null),
    loadExamMaps: () => later(SAMPLE_EXAM_MAPS),
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
