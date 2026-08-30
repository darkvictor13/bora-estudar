import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BANDS, classifyStudent, normalize, officialPctOf, progressOf } from "./students.ts";

const base = { goalCount: 0, completed: 0, mainCount: 0, mainCorrect: 0 };

describe("classifyStudent", () => {
  it("sem meta e sem questão é 'sem dados'", () => {
    assert.equal(classifyStudent(base), "sem-dados");
  });

  it("progresso abaixo de 0,30 é 'atrasado'", () => {
    // 2 de 10 = 0,20
    assert.equal(classifyStudent({ ...base, goalCount: 10, completed: 2 }), "atrasado");
  });

  it("exatamente 0,30 NÃO é atrasado — o limiar é estrito", () => {
    // 3 de 10 = 0,30, e 0,30 < 0,55 então cai em atenção.
    assert.equal(classifyStudent({ ...base, goalCount: 10, completed: 3 }), "atencao");
  });

  it("progresso entre 0,30 e 0,55 é 'atenção'", () => {
    assert.equal(classifyStudent({ ...base, goalCount: 10, completed: 5 }), "atencao");
  });

  it("desempenho abaixo de 70% é 'atenção', mesmo com progresso bom", () => {
    assert.equal(
      classifyStudent({ goalCount: 10, completed: 9, mainCount: 15, mainCorrect: 10 }),
      "atencao",
    );
  });

  it("exatamente 70% NÃO é atenção", () => {
    // 7 de 10 = 70%, e o progresso de 0,90 está acima de 0,55.
    assert.equal(
      classifyStudent({ goalCount: 10, completed: 9, mainCount: 10, mainCorrect: 7 }),
      "ritmo",
    );
  });

  it("progresso e desempenho bons é 'em ritmo'", () => {
    assert.equal(
      classifyStudent({ goalCount: 10, completed: 8, mainCount: 15, mainCorrect: 12 }),
      "ritmo",
    );
  });

  it("atrasado ganha de atenção: a ordem das checagens é parte da regra", () => {
    // Progresso 0,10 e desempenho 50% — as duas faixas casariam.
    assert.equal(
      classifyStudent({ goalCount: 10, completed: 1, mainCount: 10, mainCorrect: 5 }),
      "atrasado",
    );
  });

  it("questão sem meta não vira atrasado por divisão por zero", () => {
    assert.equal(classifyStudent({ ...base, mainCount: 15, mainCorrect: 14 }), "ritmo");
  });

  it("os limiares são os da v96", () => {
    assert.deepEqual(BANDS, { atrasado: 0.3, atencao: 0.55, desempenho: 70 });
  });
});

describe("progressOf e officialPctOf", () => {
  it("devolvem null quando não há base para o cálculo", () => {
    assert.equal(progressOf(base), null);
    assert.equal(officialPctOf(base), null);
  });

  it("arredondam o percentual como o resto do produto", () => {
    // 11 de 15 = 73,33…
    assert.equal(officialPctOf({ ...base, mainCount: 15, mainCorrect: 11 }), 73);
  });
});

describe("normalize", () => {
  it("tira acento e caixa, para a busca casar o que a pessoa digita", () => {
    assert.equal(normalize("  Fábio JÚNIOR "), "fabio junior");
  });
});
