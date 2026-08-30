import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCycles, type CycleSession } from "./reinforcement.ts";

/** Uma bateria concluída, com o desempenho pedido. */
const bat = (n: number, correct: number, count = 15): CycleSession => ({
  id: `s${n}`,
  completedAt: `2026-08-${String(n).padStart(2, "0")}T10:00:00.000Z`,
  mainCount: count,
  mainCorrect: correct,
});

const vazio = new Set<string>();

describe("buildCycles", () => {
  it("não forma ciclo com menos de três baterias", () => {
    assert.deepEqual(buildCycles([bat(1, 5), bat(2, 5)], vazio), []);
  });

  it("forma um ciclo com três abaixo de 80%", () => {
    // 15 de 45 = 33%.
    const cycles = buildCycles([bat(1, 5), bat(2, 5), bat(3, 5)], vazio);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0]?.score, 33);
    assert.deepEqual(cycles[0]?.sessions.map((s) => s.id), ["s1", "s2", "s3"]);
  });

  it("não forma ciclo quando o acumulado atinge 80%", () => {
    // 36 de 45 = 80%.
    assert.deepEqual(buildCycles([bat(1, 12), bat(2, 12), bat(3, 12)], vazio), []);
  });

  it("79% ainda exige reforço — o limiar é estrito", () => {
    // 35 de 45 = 77,8% → 78.
    const cycles = buildCycles([bat(1, 12), bat(2, 12), bat(3, 11)], vazio);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0]?.score, 78);
  });

  it("abaixo de 75% é prioridade alta; entre 75 e 79 não é", () => {
    // 33 de 45 = 73,3% → 73.
    const alta = buildCycles([bat(1, 11), bat(2, 11), bat(3, 11)], vazio);
    assert.equal(alta[0]?.highPriority, true);

    // 35 de 45 = 78.
    const normal = buildCycles([bat(1, 12), bat(2, 12), bat(3, 11)], vazio);
    assert.equal(normal[0]?.highPriority, false);
  });

  it("os grupos são fechados: a quarta e a quinta esperam a sexta", () => {
    const cinco = [bat(1, 5), bat(2, 5), bat(3, 5), bat(4, 5), bat(5, 5)];
    const cycles = buildCycles(cinco, vazio);
    assert.equal(cycles.length, 1);
    assert.deepEqual(cycles[0]?.sessions.map((s) => s.id), ["s1", "s2", "s3"]);

    const seis = [...cinco, bat(6, 5)];
    assert.equal(buildCycles(seis, vazio).length, 2);
  });

  it("ignora as baterias já usadas em outro ciclo", () => {
    const seis = [bat(1, 5), bat(2, 5), bat(3, 5), bat(4, 5), bat(5, 5), bat(6, 5)];
    const cycles = buildCycles(seis, new Set(["s1", "s2", "s3"]));
    assert.equal(cycles.length, 1);
    assert.deepEqual(cycles[0]?.sessions.map((s) => s.id), ["s4", "s5", "s6"]);
  });

  it("ordena por conclusão, não pela ordem em que vieram", () => {
    const cycles = buildCycles([bat(3, 5), bat(1, 5), bat(2, 5)], vazio);
    assert.deepEqual(cycles[0]?.sessions.map((s) => s.id), ["s1", "s2", "s3"]);
  });

  it("ciclo sem questão principal não vira ciclo", () => {
    const cycles = buildCycles([bat(1, 0, 0), bat(2, 0, 0), bat(3, 0, 0)], vazio);
    assert.deepEqual(cycles, []);
  });

  it("soma as principais dos três, e não presume 15 cada", () => {
    // Finalização antecipada: 7, 15 e 15 principais.
    const cycles = buildCycles([bat(1, 2, 7), bat(2, 8, 15), bat(3, 8, 15)], vazio);
    assert.equal(cycles[0]?.mainCount, 37);
    assert.equal(cycles[0]?.mainCorrect, 18);
    assert.equal(cycles[0]?.score, 49);
  });
});
