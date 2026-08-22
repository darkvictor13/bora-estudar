import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildWeek, type PlannerBlock } from "./week-planner.ts";

const bloco = (n: number): PlannerBlock => ({
  id: `bloco-${n}`,
  name: `Bloco ${n}`,
  subject_name: `Matéria ${n}`,
});

describe("buildWeek", () => {
  it("distribui em rodízio pelos dias marcados", () => {
    const week = buildWeek([bloco(1), bloco(2), bloco(3)], [1, 3], 60, false);
    assert.deepEqual(
      week.map((g) => [g.weekday, g.position, g.block_id]),
      [
        [1, 1, "bloco-1"],
        [3, 1, "bloco-2"],
        [1, 2, "bloco-3"],
      ],
    );
  });

  it("põe a teoria imediatamente antes da bateria, no mesmo dia", () => {
    const week = buildWeek([bloco(1)], [2], 45, true);
    assert.equal(week.length, 2);
    assert.deepEqual(
      week.map((g) => [g.weekday, g.position, g.type]),
      [
        [2, 1, "theory"],
        [2, 2, "question_block"],
      ],
    );
    assert.equal(week[0]?.block_id, null, "teoria não aponta para bloco");
    assert.equal(week[1]?.block_id, "bloco-1");
  });

  it("nunca repete posição dentro do mesmo dia", () => {
    const week = buildWeek([bloco(1), bloco(2), bloco(3), bloco(4)], [5], 60, true);
    const chaves = week.map((g) => `${g.weekday}:${g.position}`);
    assert.equal(new Set(chaves).size, chaves.length, `posições repetidas: ${chaves.join(", ")}`);
    assert.equal(week.length, 8);
  });

  it("aplica o tempo previsto a todas as metas", () => {
    const week = buildWeek([bloco(1), bloco(2)], [1, 2], 90, true);
    assert.ok(week.every((g) => g.planned_minutes === 90));
  });

  it("devolve vazio sem bloco ou sem dia", () => {
    assert.deepEqual(buildWeek([], [1, 2], 60, true), []);
    assert.deepEqual(buildWeek([bloco(1)], [], 60, true), []);
  });

  it("ordena os dias conforme recebidos, sem reordenar por conta própria", () => {
    // Quem ordena é o chamador. Mudar isso aqui quebraria a expectativa de que
    // o primeiro bloco cai no primeiro dia informado.
    const week = buildWeek([bloco(1), bloco(2)], [5, 1], 60, false);
    assert.deepEqual(week.map((g) => g.weekday), [5, 1]);
  });
});
