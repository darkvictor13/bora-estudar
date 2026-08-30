import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMinutes,
  oldestPendingGoalOf,
  parseDuration,
  scorePercent,
  weekdayName,
  type PendingGoal,
} from "./goals.ts";

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

describe("meta pendente do bloco", () => {
  const meta = (over: Partial<PendingGoal> = {}): PendingGoal => ({
    id: `g${Math.random()}`,
    block_id: "bloco-1",
    type: "question_block",
    status: "pending",
    week_number: 1,
    weekday: 1,
    day_order: 1,
    ...over,
  });

  it("escolhe a mais antiga: semana, depois dia, depois ordem no dia", () => {
    const alvo = meta({ id: "alvo", week_number: 1, weekday: 2, day_order: 1 });
    const lista = [
      meta({ week_number: 3, weekday: 1, day_order: 1 }),
      meta({ week_number: 1, weekday: 2, day_order: 2 }),
      alvo,
      meta({ week_number: 1, weekday: 5, day_order: 1 }),
    ];

    assert.equal(oldestPendingGoalOf(lista, "bloco-1")!.id, "alvo");
  });

  it("ignora meta de outro bloco", () => {
    const lista = [meta({ block_id: "outro" }), meta({ id: "certo", weekday: 9 })];
    assert.equal(oldestPendingGoalOf(lista, "bloco-1")!.id, "certo");
  });

  it("ignora meta que não é de bateria", () => {
    const lista = [meta({ type: "theory" }), meta({ type: "extra_study" })];
    assert.equal(oldestPendingGoalOf(lista, "bloco-1"), null);
  });

  it("ignora meta já concluída ou em andamento", () => {
    // `in_progress` significa que a bateria já está aberta: quem oferece a
    // continuação é a regra da sessão aberta, não esta.
    const lista = [meta({ status: "completed" }), meta({ status: "in_progress" })];
    assert.equal(oldestPendingGoalOf(lista, "bloco-1"), null);
  });

  it("bloco sem meta nenhuma devolve nulo", () => {
    assert.equal(oldestPendingGoalOf([], "bloco-1"), null);
  });

  it("não altera a lista recebida", () => {
    const lista = [meta({ id: "b", week_number: 2 }), meta({ id: "a", week_number: 1 })];
    oldestPendingGoalOf(lista, "bloco-1");
    assert.deepEqual(lista.map((g) => g.id), ["b", "a"]);
  });
});
