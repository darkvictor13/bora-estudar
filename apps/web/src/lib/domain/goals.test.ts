import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMinutes, parseDuration, scorePercent, weekdayName } from "./goals.ts";

describe("parseDuration", () => {
  it("aceita minutos puros", () => {
    assert.equal(parseDuration("80"), 80);
    assert.equal(parseDuration(" 45 "), 45);
  });

  it("aceita hora:minuto", () => {
    assert.equal(parseDuration("1:20"), 80);
    assert.equal(parseDuration("0:05"), 5);
    assert.equal(parseDuration("10:30"), 630);
  });

  it("recusa o que não dá para interpretar", () => {
    for (const input of ["", "abc", "1:60", "1:5", "-10", "1.5", "1h20"]) {
      assert.equal(parseDuration(input), null, `deveria recusar ${JSON.stringify(input)}`);
    }
  });
});

describe("formatMinutes", () => {
  it("formata", () => {
    assert.equal(formatMinutes(45), "45min");
    assert.equal(formatMinutes(60), "1h");
    assert.equal(formatMinutes(80), "1h20");
    assert.equal(formatMinutes(125), "2h05");
  });

  it("trata ausência de valor", () => {
    assert.equal(formatMinutes(0), "—");
    assert.equal(formatMinutes(null), "—");
    assert.equal(formatMinutes(undefined), "—");
  });
});

describe("scorePercent", () => {
  it("arredonda", () => {
    assert.equal(scorePercent(11, 15), 73);
    assert.equal(scorePercent(15, 24), 63);
    assert.equal(scorePercent(0, 10), 0);
  });

  it("não divide por zero", () => {
    assert.equal(scorePercent(0, 0), null);
  });
});

describe("weekdayName", () => {
  it("mapeia 0..6 a partir de domingo", () => {
    assert.equal(weekdayName(0), "Domingo");
    assert.equal(weekdayName(1), "Segunda");
    assert.equal(weekdayName(6), "Sábado");
  });

  it("não quebra fora do intervalo", () => {
    assert.equal(weekdayName(9), "—");
  });
});
