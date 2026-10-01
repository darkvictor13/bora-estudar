import assert from "node:assert/strict";
import test from "node:test";

import {
  LAW_EXAM_MAPS,
  filterLawExamMap,
  getLawExamMap,
  getLawExamMapStats,
} from "./law-exam-maps.ts";

test("provides PMPR, PPPR and PRF maps", () => {
  assert.deepEqual(LAW_EXAM_MAPS.map((map) => map.shortName), ["PMPR", "PPPR", "PRF"]);
  for (const map of LAW_EXAM_MAPS) {
    assert.ok(map.canonicalId.startsWith("EDITAL-"));
    assert.ok(map.sections.length > 0);
    assert.ok(map.sections.every((section) => section.items.length > 0));
  }
});

test("reports library coverage without double counting repeated norms", () => {
  const prf = getLawExamMap("prf-2021");
  const stats = getLawExamMapStats(prf);
  const unique = new Set(prf.sections.flatMap((section) => section.items.map((item) => item.canonicalId)));
  assert.equal(stats.total, unique.size);
  assert.equal(stats.pending, stats.total - stats.available);
  assert.ok(stats.coverage >= 0 && stats.coverage <= 100);
});

test("finds a law by title, scope or canonical id", () => {
  const pmpr = getLawExamMap("pmpr-2025");
  assert.equal(filterLawExamMap(pmpr, "Maria da Penha").flatMap((section) => section.items).length, 1);
  assert.equal(filterLawExamMap(pmpr, "medidas protetivas").flatMap((section) => section.items).length, 1);
  assert.equal(filterLawExamMap(pmpr, "BR-FED-LEI-8072-1990").flatMap((section) => section.items).length, 1);
});
