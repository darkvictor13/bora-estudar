import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NARROW_WIDTH, initialCollapsed } from "./sidebar-state.ts";

describe("o estado inicial da sidebar", () => {
  it("o guardado vence a largura, nos dois sentidos", () => {
    assert.equal(initialCollapsed("1", 1920), true);
    assert.equal(initialCollapsed("0", 320), false);
  });

  it("sem nada guardado, decide pela largura", () => {
    assert.equal(initialCollapsed(null, 1440), false);
    assert.equal(initialCollapsed(null, 600), true);
  });

  it("o limiar é inclusivo: 700 já recolhe", () => {
    assert.equal(initialCollapsed(null, NARROW_WIDTH), true);
    assert.equal(initialCollapsed(null, NARROW_WIDTH + 1), false);
  });

  it("valor de outro formato cai no padrão por largura", () => {
    // O `localStorage` guarda o que versões anteriores deixaram lá.
    for (const lixo of ["true", "", "collapsed", "2"]) {
      assert.equal(initialCollapsed(lixo, 1440), false);
      assert.equal(initialCollapsed(lixo, 500), true);
    }
  });
});
