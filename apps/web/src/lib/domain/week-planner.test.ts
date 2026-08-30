import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWeek,
  distributeByWeight,
  groupIntoSubjects,
  type PlannerBlock,
  type PlannerSubject,
} from "./week-planner.ts";

const bloco = (n: number, materia = `Matéria ${n}`): PlannerBlock => ({
  id: `bloco-${n}`,
  name: `Bloco ${n}`,
  subject_name: materia,
});

/** Uma disciplina de um bloco só, peso 1, rodízio no começo. */
const uma = (n: number, weight = 1, used = 0): PlannerSubject => ({
  name: `Matéria ${n}`,
  blocks: [bloco(n)],
  weight,
  used,
});

describe("distributeByWeight", () => {
  it("reparte proporcional ao peso", () => {
    // Total 10, pesos 3 e 2 → 6 e 4.
    const alloc = distributeByWeight(
      [
        { name: "A", weight: 3 },
        { name: "B", weight: 2 },
      ],
      10,
    );
    assert.deepEqual([...alloc], [["A", 6], ["B", 4]]);
  });

  it("dá o resto para o maior resto fracionário", () => {
    // Total 10, pesos 1/1/1 → ideal 3,33 cada; piso 3; sobram 1.
    const alloc = distributeByWeight(
      [
        { name: "A", weight: 1 },
        { name: "B", weight: 1 },
        { name: "C", weight: 1 },
      ],
      10,
    );
    assert.equal([...alloc.values()].reduce((a, b) => a + b, 0), 10);
    // Empate no resto resolve pela ordem: a primeira leva.
    assert.deepEqual([...alloc], [["A", 4], ["B", 3], ["C", 3]]);
  });

  it("garante pelo menos 1 por disciplina quando o total comporta", () => {
    // Peso 100 contra 1: sem o mínimo, B ficaria com zero.
    const alloc = distributeByWeight(
      [
        { name: "A", weight: 100 },
        { name: "B", weight: 1 },
      ],
      5,
    );
    assert.equal(alloc.get("B"), 1);
    assert.equal(alloc.get("A"), 4);
  });

  it("não força o mínimo quando o total não comporta", () => {
    const alloc = distributeByWeight(
      [
        { name: "A", weight: 1 },
        { name: "B", weight: 1 },
        { name: "C", weight: 1 },
      ],
      2,
    );
    assert.equal([...alloc.values()].reduce((a, b) => a + b, 0), 2);
  });

  it("peso 0 tira a disciplina da semana, e o mínimo não a resgata", () => {
    const alloc = distributeByWeight(
      [
        { name: "A", weight: 2 },
        { name: "Fora", weight: 0 },
        { name: "B", weight: 1 },
      ],
      6,
    );
    assert.equal(alloc.get("Fora"), 0);
    assert.equal(alloc.get("A")! + alloc.get("B")!, 6);
  });

  it("com todos os pesos zerados, reparte em rodízio simples", () => {
    const alloc = distributeByWeight(
      [
        { name: "A", weight: 0 },
        { name: "B", weight: 0 },
      ],
      3,
    );
    assert.deepEqual([...alloc], [["A", 2], ["B", 1]]);
  });

  it("total zero ou negativo não reparte nada", () => {
    const alloc = distributeByWeight([{ name: "A", weight: 1 }], 0);
    assert.equal(alloc.get("A"), 0);
    assert.equal(distributeByWeight([{ name: "A", weight: 1 }], -5).get("A"), 0);
  });

  it("a soma sempre bate com o total pedido", () => {
    for (const total of [1, 4, 7, 13, 41, 80]) {
      const alloc = distributeByWeight(
        [
          { name: "PT", weight: 6 },
          { name: "TI", weight: 6 },
          { name: "CF", weight: 4 },
          { name: "RLM", weight: 3 },
          { name: "DH", weight: 2 },
        ],
        total,
      );
      assert.equal(
        [...alloc.values()].reduce((a, b) => a + b, 0),
        total,
        `total ${total} não bateu`,
      );
    }
  });
});

describe("buildWeek", () => {
  it("com pesos iguais e total igual ao nº de blocos, é uma meta por bloco", () => {
    // É o comportamento anterior à spec 18, preservado como caso particular.
    const week = buildWeek([uma(1), uma(2), uma(3)], [1, 3], 60, false, 3);
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
    const week = buildWeek([uma(1)], [2], 45, true, 1);
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
    const week = buildWeek([uma(1), uma(2), uma(3), uma(4)], [5], 60, true, 4);
    const chaves = week.map((g) => `${g.weekday}:${g.position}`);
    assert.equal(new Set(chaves).size, chaves.length, `posições repetidas: ${chaves.join(", ")}`);
    assert.equal(week.length, 8);
  });

  it("aplica o tempo previsto a todas as metas", () => {
    const week = buildWeek([uma(1), uma(2)], [1, 2], 90, true, 2);
    assert.ok(week.every((g) => g.planned_minutes === 90));
  });

  it("devolve vazio sem disciplina ou sem dia", () => {
    assert.deepEqual(buildWeek([], [1, 2], 60, true, 5), []);
    assert.deepEqual(buildWeek([uma(1)], [], 60, true, 5), []);
  });

  it("ordena os dias conforme recebidos, sem reordenar por conta própria", () => {
    const week = buildWeek([uma(1), uma(2)], [5, 1], 60, false, 2);
    assert.deepEqual(week.map((g) => g.weekday), [5, 1]);
  });

  it("peso maior gera mais metas da disciplina", () => {
    const pesada: PlannerSubject = {
      name: "Pesada",
      blocks: [bloco(1, "Pesada"), bloco(2, "Pesada")],
      weight: 3,
      used: 0,
    };
    const leve: PlannerSubject = {
      name: "Leve",
      blocks: [bloco(3, "Leve")],
      weight: 1,
      used: 0,
    };

    const week = buildWeek([pesada, leve], [1, 2, 3, 4], 60, false, 8);
    const porTitulo = week.filter((g) => g.type === "question_block");
    const daPesada = porTitulo.filter((g) => g.block_id !== "bloco-3").length;
    const daLeve = porTitulo.filter((g) => g.block_id === "bloco-3").length;

    assert.equal(daPesada + daLeve, 8);
    assert.equal(daPesada, 6);
    assert.equal(daLeve, 2);
  });

  it("roda os blocos da disciplina em B1 → B2 → B1", () => {
    const materia: PlannerSubject = {
      name: "Rodízio",
      blocks: [bloco(1, "Rodízio"), bloco(2, "Rodízio")],
      weight: 1,
      used: 0,
    };
    const week = buildWeek([materia], [1], 60, false, 3);
    assert.deepEqual(week.map((g) => g.block_id), ["bloco-1", "bloco-2", "bloco-1"]);
  });

  it("continua o rodízio de onde a semana anterior parou", () => {
    // A disciplina já tem 1 meta: a próxima começa no bloco 2, não no 1.
    const materia: PlannerSubject = {
      name: "Rodízio",
      blocks: [bloco(1, "Rodízio"), bloco(2, "Rodízio")],
      weight: 1,
      used: 1,
    };
    const week = buildWeek([materia], [1], 60, false, 2);
    assert.deepEqual(week.map((g) => g.block_id), ["bloco-2", "bloco-1"]);
  });

  it("disciplina sem bloco marcado fica de fora", () => {
    const vazia: PlannerSubject = { name: "Vazia", blocks: [], weight: 10, used: 0 };
    const week = buildWeek([vazia, uma(1)], [1], 60, false, 4);
    assert.ok(week.every((g) => g.block_id === "bloco-1"));
    assert.equal(week.length, 4);
  });
});

describe("groupIntoSubjects", () => {
  it("agrupa preservando a ordem em que os blocos vieram", () => {
    const subjects = groupIntoSubjects(
      [bloco(1, "B"), bloco(2, "A"), bloco(3, "B")],
      () => 1,
      () => 0,
    );
    assert.deepEqual(subjects.map((s) => s.name), ["B", "A"]);
    assert.deepEqual(subjects[0]?.blocks.map((b) => b.id), ["bloco-1", "bloco-3"]);
  });

  it("soma o `used` de todos os blocos da disciplina", () => {
    const subjects = groupIntoSubjects(
      [bloco(1, "A"), bloco(2, "A")],
      () => 1,
      (id) => (id === "bloco-1" ? 2 : 3),
    );
    assert.equal(subjects[0]?.used, 5);
  });
});
