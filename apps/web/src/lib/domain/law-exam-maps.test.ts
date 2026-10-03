import assert from "node:assert/strict";
import test from "node:test";

import { SAMPLE_EXAM_MAPS } from "../api/fixtures-content.ts";
import {
  filterLawExamMap,
  getLawExamMap,
  getLawExamMapStats,
  type LawExamMap,
} from "./law-exam-maps.ts";

// A amostra da `fixtures` (spec 41). Os três editais reais são afirmados pela
// carga (18_laws.sql); aqui importa só a regra.
const LAW_EXAM_MAPS: readonly LawExamMap[] = SAMPLE_EXAM_MAPS.maps;

test("an unknown id falls back to the first map", () => {
  assert.equal(getLawExamMap(LAW_EXAM_MAPS, "nao-existe").id, "amostra-2026");
  assert.equal(getLawExamMap(LAW_EXAM_MAPS, null).id, "amostra-2026");
  assert.throws(() => getLawExamMap([], null), /Nenhum mapa/);
});

test("reports library coverage without double counting repeated norms", () => {
  const map = getLawExamMap(LAW_EXAM_MAPS, "amostra-2026");
  const repeated: LawExamMap = { ...map, sections: [...map.sections, map.sections[0]!] };
  for (const subject of [map, repeated]) {
    assert.deepEqual(getLawExamMapStats(subject), { total: 3, available: 2, pending: 1, coverage: 67 });
  }
});

test("finds a law by title, scope or canonical id", () => {
  const map = getLawExamMap(LAW_EXAM_MAPS, "amostra-2026");
  const count = (query: string) => filterLawExamMap(map, query).flatMap((section) => section.items).length;
  assert.equal(count("Amostra Um"), 1);
  assert.equal(count("medidas protetivas"), 1);
  assert.equal(count("BR-AMOSTRA-LEI-2-2026"), 1);
  assert.equal(count("   "), 3);
  assert.equal(count("nada casa com isto"), 0);
});
