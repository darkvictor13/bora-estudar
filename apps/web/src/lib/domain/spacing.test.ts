import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blocksOfSubject,
  buildGrid,
  buildSubjectGrid,
  doneKey,
  gridProgress,
  reviewIndex,
  type SpacingBlock,
} from "./spacing.ts";

function bloco(order: number, extra: Partial<SpacingBlock> = {}): SpacingBlock {
  return {
    id: `b${order}`,
    name: `Aula ${order + 1}`,
    subject_name: "Português",
    block_order: order,
    ...extra,
  };
}

const dez = Array.from({ length: 10 }, (_, i) => bloco(i));

describe("as fórmulas da v96", () => {
  it("conta de forma inclusiva: com r1 = 3, a Aula 3 revisa a Aula 1", () => {
    // i = 2 é a terceira aula; 2 − (3 − 1) = 0, que é a primeira.
    assert.equal(reviewIndex(2, 3), 0);
  });

  it("r1 = 1 revisa o próprio bloco", () => {
    assert.equal(reviewIndex(4, 1), 4);
  });

  it("devolve -1 quando ainda não há bloco anterior suficiente", () => {
    assert.equal(reviewIndex(1, 5), -1);
  });

  it("intervalo zero desliga em vez de apontar para o futuro", () => {
    // Sem a guarda, 3 − (0 − 1) = 4: um bloco que o aluno ainda não estudou.
    assert.equal(reviewIndex(3, 0), -1);
    assert.equal(reviewIndex(3, -2), -1);
  });
});

describe("a grade de uma disciplina", () => {
  it("monta as duas colunas com os offsets somados", () => {
    const grid = buildSubjectGrid(
      { subject_name: "Português", first_interval: 2, second_interval: 3 },
      dez,
      new Set(),
    );

    assert.equal(grid.rows.length, 10);
    // Bloco 5 (i = 5): 1ª em 5 − 1 = 4; 2ª em 5 − (2 + 3 − 1) = 1.
    assert.equal(grid.rows[5]!.first!.block.id, "b4");
    assert.equal(grid.rows[5]!.second!.block.id, "b1");
  });

  it("deixa a célula vazia enquanto não há o que revisar", () => {
    const grid = buildSubjectGrid(
      { subject_name: "Português", first_interval: 3, second_interval: 3 },
      dez,
      new Set(),
    );

    assert.equal(grid.rows[0]!.first, null);
    assert.equal(grid.rows[1]!.first, null);
    assert.equal(grid.rows[2]!.first!.block.id, "b0");
    // A segunda só aparece a partir de i = 5.
    assert.equal(grid.rows[4]!.second, null);
    assert.equal(grid.rows[5]!.second!.block.id, "b0");
  });

  it("segunda em zero desliga só a segunda coluna", () => {
    const grid = buildSubjectGrid(
      { subject_name: "Português", first_interval: 2, second_interval: 0 },
      dez,
      new Set(),
    );

    assert.ok(grid.rows[9]!.first);
    assert.equal(grid.rows.every((row) => row.second === null), true);
  });

  it("marca a célula cuja revisão foi feita, por bloco e ordinal", () => {
    const done = new Set([doneKey("b4", 1)]);
    const grid = buildSubjectGrid(
      { subject_name: "Português", first_interval: 2, second_interval: 3 },
      dez,
      done,
    );

    assert.equal(grid.rows[5]!.first!.done, true);
    // O mesmo bloco na segunda coluna NÃO herda a marcação da primeira.
    const segunda = grid.rows.find((row) => row.second?.block.id === "b4");
    assert.equal(segunda!.second!.done, false);
  });
});

describe("quais blocos entram", () => {
  it("ordena por block_order, não pela ordem de chegada", () => {
    const fora = [bloco(2), bloco(0), bloco(1)];
    assert.deepEqual(
      blocksOfSubject(fora, "Português").map((b) => b.block_order),
      [0, 1, 2],
    );
  });

  it("deixa de fora o bloco excluído e o inativo", () => {
    const blocos = [
      bloco(0),
      bloco(1, { deleted_at: "2026-08-30T00:00:00Z" }),
      bloco(2, { active: false }),
      bloco(3),
    ];

    assert.deepEqual(
      blocksOfSubject(blocos, "Português").map((b) => b.id),
      ["b0", "b3"],
    );
  });

  it("não mistura disciplinas", () => {
    const blocos = [bloco(0), bloco(1, { subject_name: "Direito" }), bloco(2)];
    assert.equal(blocksOfSubject(blocos, "Português").length, 2);
  });

  it("a exclusão reindexa a grade, e é o que se espera", () => {
    // Tirar um bloco do meio aproxima a revisão: com 4 blocos e r1 = 2, o
    // último revisa o penúltimo — e "penúltimo" mudou.
    const blocos = [bloco(0), bloco(1, { deleted_at: "2026-08-30T00:00:00Z" }), bloco(2), bloco(3)];
    const grid = buildSubjectGrid(
      { subject_name: "Português", first_interval: 2, second_interval: 0 },
      blocos,
      new Set(),
    );

    assert.deepEqual(grid.rows.map((row) => row.current.id), ["b0", "b2", "b3"]);
    assert.equal(grid.rows[2]!.first!.block.id, "b2");
  });
});

describe("a grade inteira", () => {
  const blocos = [
    ...dez.slice(0, 4),
    bloco(0, { id: "d0", subject_name: "Direito" }),
    bloco(1, { id: "d1", subject_name: "Direito" }),
    bloco(2, { id: "d2", subject_name: "Direito" }),
  ];

  it("deixa de fora a disciplina sem espaçamento", () => {
    const grid = buildGrid(
      [
        { subject_name: "Português", first_interval: 2, second_interval: 0 },
        { subject_name: "Direito", first_interval: 0, second_interval: 0 },
      ],
      blocos,
      new Set(),
    );

    assert.deepEqual(grid.map((g) => g.subject), ["Português"]);
  });

  it("deixa de fora a disciplina cujo bloco não existe mais", () => {
    const grid = buildGrid(
      [{ subject_name: "Sumida", first_interval: 2, second_interval: 0 }],
      blocos,
      new Set(),
    );

    assert.deepEqual(grid, []);
  });

  it("mantém a ordem das disciplinas no planejamento", () => {
    const grid = buildGrid(
      [
        { subject_name: "Direito", first_interval: 2, second_interval: 0 },
        { subject_name: "Português", first_interval: 2, second_interval: 0 },
      ],
      blocos,
      new Set(),
    );

    // Português vem primeiro nos blocos, então vem primeiro na grade.
    assert.deepEqual(grid.map((g) => g.subject), ["Português", "Direito"]);
  });

  it("conta o que está feito sobre o que está disponível", () => {
    const done = new Set([doneKey("b0", 1), doneKey("b1", 1)]);
    const [portugues] = buildGrid(
      [{ subject_name: "Português", first_interval: 2, second_interval: 0 }],
      blocos,
      done,
    );

    // 4 blocos, r1 = 2: as linhas 1, 2 e 3 têm revisão; a linha 0 não.
    assert.deepEqual(gridProgress(portugues!), { done: 2, available: 3 });
  });
});
