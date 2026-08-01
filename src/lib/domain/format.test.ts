import assert from "node:assert/strict";
import test from "node:test";

import { currentDayInTimeZone, dayLabel, errorMessage, formatMinutes, statusLabel, statusTone } from "./format.ts";

test("traduz estados do domínio sem perder valores desconhecidos", () => {
  assert.equal(statusLabel("em_andamento"), "Em andamento");
  assert.equal(statusLabel("novo_estado"), "novo estado");
  assert.equal(statusTone("concluida"), "success");
  assert.equal(statusTone("bloqueado"), "danger");
});

test("formata duração e dias da agenda", () => {
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(125), "2h 5min");
  assert.equal(dayLabel(1), "Segunda");
  assert.equal(dayLabel(7), "Domingo");
  assert.ok(currentDayInTimeZone("America/Sao_Paulo") >= 1);
  assert.ok(currentDayInTimeZone("America/Sao_Paulo") <= 7);
});

test("separa erros de autorização, unicidade e conexão", () => {
  assert.match(errorMessage(new Error("permission denied")), /permissão/i);
  assert.match(errorMessage(new Error("duplicate key violates unique constraint")), /já existe/i);
  assert.match(errorMessage(new Error("Failed to fetch")), /conectar/i);
});
