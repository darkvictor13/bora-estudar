import assert from "node:assert/strict";
import { describe, it } from "node:test";

// O fuso é fixado ANTES de importar o módulo: import estático é içado e rodaria
// antes da atribuição. O runner isola cada arquivo num processo, então o fuso não
// vaza para as outras suítes.
process.env.TZ = "America/Sao_Paulo";
const { formatDate, formatDayMonth, formatInstant, hasExpired, localDateOf, todayLocal } =
  await import("./dates.ts");

describe("lib/domain/dates", () => {
  it("formata um instante no fuso do aparelho, e não no dia UTC", () => {
    // 02:30 UTC de 07/10 é 23:30 de 06/10 em Brasília.
    assert.equal(formatInstant("2026-10-07T02:30:00Z"), "06/10/2026");
    assert.equal(formatInstant("2026-10-07T02:30:00Z", "dateTime"), "06/10/2026 23:30");
  });

  it("aceita o texto que o PostgREST devolve para timestamptz", () => {
    assert.equal(
      formatInstant("2027-01-06T18:37:06.167505+00:00", "dateTime"),
      "06/01/2027 15:37",
    );
  });

  it("devolve como veio o texto que não é data", () => {
    assert.equal(formatInstant("amanhã"), "amanhã");
  });

  it("formata uma data fatiando, sem fuso", () => {
    assert.equal(formatDate("2026-10-06"), "06/10/2026");
    assert.equal(formatDayMonth("2026-10-06"), "06/10");
  });

  it("calcula o dia local de um instante", () => {
    assert.equal(localDateOf("2026-10-07T02:30:00Z"), "2026-10-06");
    assert.equal(localDateOf(new Date("2026-10-07T03:00:00Z")), "2026-10-07");
  });

  it("hoje, às 23:30 em Brasília, ainda é o dia 6", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-07T02:30:00Z") });
    assert.equal(todayLocal(), "2026-10-06");
  });

  it("vence no instante exato, e não um milissegundo antes", () => {
    const limit = "2026-10-06T10:00:00+00:00";
    const at = Date.parse(limit);
    assert.equal(hasExpired(limit, at - 1), false);
    assert.equal(hasExpired(limit, at), true);
    assert.equal(hasExpired(limit, at + 1), true);
  });
});
