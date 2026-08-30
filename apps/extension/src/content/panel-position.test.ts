import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PLACEMENT,
  clampPlacement,
  readPlacement,
} from "./panel-position.ts";

const VIEWPORT = { width: 1000, height: 800, panelWidth: 274 };

describe("prender o painel à janela", () => {
  it("deixa passar a posição que já está dentro", () => {
    assert.deepEqual(clampPlacement(300, 200, VIEWPORT), { left: 300, top: 200 });
  });

  it("prende à esquerda e ao topo", () => {
    assert.deepEqual(clampPlacement(-500, -50, VIEWPORT), { left: 0, top: 0 });
  });

  it("prende à direita, descontando a largura do painel", () => {
    // 1000 − 274: o painel inteiro continua visível.
    assert.deepEqual(clampPlacement(9999, 100, VIEWPORT).left, 726);
  });

  it("deixa uma faixa visível embaixo, e não o painel inteiro", () => {
    // A altura do painel muda com o conteúdo; prender pela altura faria o
    // painel saltar ao crescer. 50px de faixa bastam para achar a alça.
    assert.deepEqual(clampPlacement(100, 9999, VIEWPORT).top, 750);
  });

  it("janela menor que o painel não produz posição negativa", () => {
    const apertada = { width: 200, height: 30, panelWidth: 274 };
    assert.deepEqual(clampPlacement(50, 50, apertada), { left: 0, top: 0 });
  });
});

describe("ler o que veio do storage", () => {
  it("aceita o formato esperado", () => {
    assert.deepEqual(readPlacement({ left: 120, top: 60, minimized: false }), {
      left: 120,
      top: 60,
      minimized: false,
    });
  });

  it("cai no padrão com nulo, string ou número", () => {
    for (const lixo of [null, undefined, "left:10", 42, []]) {
      assert.deepEqual(readPlacement(lixo), DEFAULT_PLACEMENT);
    }
  });

  it("cai no padrão com NaN e com coordenada que não é número", () => {
    assert.deepEqual(readPlacement({ left: Number.NaN, top: 10 }), DEFAULT_PLACEMENT);
    assert.deepEqual(readPlacement({ left: "10", top: 10 }), DEFAULT_PLACEMENT);
    assert.deepEqual(readPlacement({ left: 10 }), DEFAULT_PLACEMENT);
  });

  it("mantém o minimizado mesmo quando a posição é inválida", () => {
    // Quem minimizou não quer o painel de volta só porque a coordenada
    // apodreceu.
    assert.deepEqual(readPlacement({ left: "x", minimized: true }), {
      left: null,
      top: null,
      minimized: true,
    });
  });

  it("prende a posição salva à janela ATUAL", () => {
    // Gravada num monitor grande, lida num pequeno: sem isto o painel
    // restauraria fora da tela, com a alça junto.
    assert.deepEqual(readPlacement({ left: 3000, top: 2000 }, VIEWPORT), {
      left: 726,
      top: 750,
      minimized: false,
    });
  });

  it("sem janela informada, não prende — é o caso do teste puro", () => {
    assert.deepEqual(readPlacement({ left: 3000, top: 2000 }), {
      left: 3000,
      top: 2000,
      minimized: false,
    });
  });
});
