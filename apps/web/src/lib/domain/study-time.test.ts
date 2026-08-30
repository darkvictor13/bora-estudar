import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dayKey,
  formatMinutes,
  groupOf,
  inPeriod,
  periodStart,
  streak,
  summarize,
  weeklySeries,
  type StudyRow,
} from "./study-time.ts";

function linha(over: Partial<StudyRow> = {}): StudyRow {
  return {
    goal_id: `g${Math.random()}`,
    week_number: 1,
    goal_type: "question_block",
    extra_activity: null,
    subject_name: "Português",
    completed_on: "2026-08-30",
    minutes_spent: 60,
    questions_answered: 15,
    correct_answers: 12,
    ...over,
  };
}

/** Domingo, 30/08/2026. Escolhido de propósito: é o pior dia para a semana. */
const DOMINGO = new Date(2026, 7, 30);

describe("os cinco períodos", () => {
  it("hoje é só o dia corrente", () => {
    assert.equal(periodStart("hoje", DOMINGO), "2026-08-30");
  });

  it("semana começa na SEGUNDA, e domingo é o último dia dela", () => {
    // Se a semana começasse no domingo, este start seria 30/08. Começando na
    // segunda, o domingo pertence à semana que abriu em 24/08.
    assert.equal(periodStart("semana", DOMINGO), "2026-08-24");
  });

  it("segunda-feira é o próprio início da semana", () => {
    assert.equal(periodStart("semana", new Date(2026, 7, 31)), "2026-08-31");
  });

  it("mês e ano começam no primeiro dia", () => {
    assert.equal(periodStart("mes", DOMINGO), "2026-08-01");
    assert.equal(periodStart("ano", DOMINGO), "2026-01-01");
  });

  it("total não tem limite", () => {
    assert.equal(periodStart("total", DOMINGO), null);
  });

  it("não inclui o futuro", () => {
    const amanha = linha({ completed_on: "2026-08-31" });
    assert.equal(inPeriod(amanha, "mes", DOMINGO), false);
    assert.equal(inPeriod(amanha, "total", DOMINGO), true);
  });

  it("a virada do mês tira do mês e mantém no ano", () => {
    const julho = linha({ completed_on: "2026-07-31" });
    assert.equal(inPeriod(julho, "mes", DOMINGO), false);
    assert.equal(inPeriod(julho, "ano", DOMINGO), true);
  });
});

describe("a divisão do tempo", () => {
  it("agrupa meta com bloco pela disciplina", () => {
    assert.deepEqual(groupOf(linha()), { label: "Português", kind: "subject" });
  });

  it("agrupa meta sem bloco pela atividade, com o rótulo em português", () => {
    const extra = linha({ subject_name: null, goal_type: "extra_study", extra_activity: "flashcards" });
    assert.equal(groupOf(extra).kind, "activity");
    assert.notEqual(groupOf(extra).label, "flashcards");
  });

  it("teoria sem atividade cai num grupo próprio", () => {
    const teoria = linha({ subject_name: null, goal_type: "theory", extra_activity: null });
    assert.deepEqual(groupOf(teoria), { label: "Teoria", kind: "activity" });
  });

  it("soma por grupo e ordena do maior para o menor", () => {
    const resumo = summarize(
      [
        linha({ subject_name: "Português", minutes_spent: 30 }),
        linha({ subject_name: "Direito", minutes_spent: 90 }),
        linha({ subject_name: "Português", minutes_spent: 45 }),
      ],
      "total",
      DOMINGO,
    );

    assert.equal(resumo.total, 165);
    assert.equal(resumo.goals, 3);
    assert.deepEqual(
      resumo.groups.map((g) => [g.label, g.minutes]),
      [
        ["Direito", 90],
        ["Português", 75],
      ],
    );
  });

  it("o período filtra antes de somar", () => {
    const rows = [
      linha({ completed_on: "2026-08-30", minutes_spent: 60 }),
      linha({ completed_on: "2026-08-20", minutes_spent: 100 }),
    ];

    assert.equal(summarize(rows, "hoje", DOMINGO).total, 60);
    assert.equal(summarize(rows, "mes", DOMINGO).total, 160);
  });

  it("período sem nada devolve zero e nenhum grupo", () => {
    const resumo = summarize([linha({ completed_on: "2026-01-05" })], "mes", DOMINGO);
    assert.equal(resumo.total, 0);
    assert.deepEqual(resumo.groups, []);
  });
});

describe("a série por semana", () => {
  it("traz uma linha por semana planejada, com a parada em zero", () => {
    const serie = weeklySeries(
      [linha({ week_number: 1 }), linha({ week_number: 3, minutes_spent: 30 })],
      [1, 2, 3],
    );

    assert.deepEqual(serie.map((p) => [p.week, p.goals, p.minutes]), [
      [1, 1, 60],
      [2, 0, 0],
      [3, 1, 30],
    ]);
  });

  it("o percentual é nulo na semana sem questão, e não zero", () => {
    // Zero por cento e "não respondeu nada" são coisas diferentes: a primeira
    // é um resultado ruim, a segunda é ausência de resultado.
    const serie = weeklySeries([linha({ week_number: 2, questions_answered: 0, correct_answers: 0 })], [2]);
    assert.equal(serie[0]!.score, null);
  });

  it("calcula o percentual sobre as questões da semana", () => {
    const serie = weeklySeries(
      [
        linha({ week_number: 1, questions_answered: 15, correct_answers: 12 }),
        linha({ week_number: 1, questions_answered: 15, correct_answers: 9 }),
      ],
      [1],
    );
    assert.equal(serie[0]!.score, 70);
  });

  it("mostra no máximo 12 semanas, as últimas", () => {
    const semanas = Array.from({ length: 20 }, (_, i) => i + 1);
    const serie = weeklySeries([], semanas);
    assert.equal(serie.length, 12);
    assert.equal(serie[0]!.week, 9);
    assert.equal(serie.at(-1)!.week, 20);
  });

  it("semana com meta e sem plano ainda aparece", () => {
    // Meta de uma semana que saiu do planejamento não pode sumir da série.
    const serie = weeklySeries([linha({ week_number: 7 })], [1]);
    assert.deepEqual(serie.map((p) => p.week), [1, 7]);
  });
});

describe("a sequência de dias", () => {
  it("conta dias seguidos para trás", () => {
    const rows = ["2026-08-30", "2026-08-29", "2026-08-28"].map((d) => linha({ completed_on: d }));
    assert.equal(streak(rows, DOMINGO), 3);
  });

  it("duas metas no mesmo dia contam um dia", () => {
    const rows = [linha({ completed_on: "2026-08-30" }), linha({ completed_on: "2026-08-30" })];
    assert.equal(streak(rows, DOMINGO), 1);
  });

  it("hoje vazio ainda conta, se ontem tem", () => {
    // É o que impede a sequência de zerar às 00h01 de quem estudou ontem.
    const rows = ["2026-08-29", "2026-08-28"].map((d) => linha({ completed_on: d }));
    assert.equal(streak(rows, DOMINGO), 2);
  });

  it("hoje e ontem vazios zeram", () => {
    const rows = ["2026-08-28", "2026-08-27"].map((d) => linha({ completed_on: d }));
    assert.equal(streak(rows, DOMINGO), 0);
  });

  it("buraco no meio interrompe", () => {
    const rows = ["2026-08-30", "2026-08-29", "2026-08-27"].map((d) => linha({ completed_on: d }));
    assert.equal(streak(rows, DOMINGO), 2);
  });

  it("sem nada, zero", () => {
    assert.equal(streak([], DOMINGO), 0);
  });

  it("atravessa a virada do mês", () => {
    const primeiro = new Date(2026, 8, 1);
    const rows = ["2026-09-01", "2026-08-31", "2026-08-30"].map((d) => linha({ completed_on: d }));
    assert.equal(streak(rows, primeiro), 3);
  });

  it("dayKey não escorrega para o dia anterior no fim do dia", () => {
    // Um Date às 23h em fuso negativo viraria o dia seguinte se passasse por
    // toISOString(). `dayKey` lê os campos locais e não converte.
    assert.equal(dayKey(new Date(2026, 7, 30, 23, 30)), "2026-08-30");
    assert.equal(dayKey(new Date(2026, 7, 30, 0, 30)), "2026-08-30");
  });
});

describe("o formato do tempo", () => {
  it("mostra minutos abaixo de uma hora", () => {
    assert.equal(formatMinutes(45), "45min");
  });

  it("mostra hora cheia sem minuto", () => {
    assert.equal(formatMinutes(120), "2h");
  });

  it("mostra hora e minuto com dois dígitos", () => {
    assert.equal(formatMinutes(150), "2h30");
    assert.equal(formatMinutes(65), "1h05");
  });

  it("zero e negativo são zero", () => {
    assert.equal(formatMinutes(0), "0min");
    assert.equal(formatMinutes(-5), "0min");
  });
});
