import assert from "node:assert/strict";
import { test } from "node:test";

import type { Goal, StudyEntry, Weekday } from "@/lib/api";
import {
  addDays,
  dateOfWeekday,
  daysBetween,
  formatMinutes,
  groupIntoDays,
  statusFromEntries,
  streakDays,
  summarizeWeek,
  weekBounds,
  weekNumberOf,
} from "./week.ts";

function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    type: "theory",
    status: "pending",
    weekday: 1,
    dayPosition: 1,
    subject: "Direito Penal",
    title: "Meta",
    description: null,
    lesson: null,
    block: null,
    plannedMinutes: 60,
    dueOn: null,
    completedAt: null,
    spentMinutes: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    entries: [],
    theory: null,
    ...over,
  };
}

function entry(over: Partial<StudyEntry> & { id: string }): StudyEntry {
  return {
    goalId: "g1",
    minutes: 0,
    questions: 0,
    correctAnswers: 0,
    score: 0,
    note: null,
    theoryStage: null,
    manualLesson: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    ...over,
  };
}

test("a aritmética de data não escorrega no horário de verão", () => {
  // Em UTC, e não com `new Date(y, m, d)`: no fuso local, somar 24h numa
  // virada de horário de verão devolve o mesmo dia ou pula dois.
  assert.equal(addDays("2026-10-17", 1), "2026-10-18");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(daysBetween("2026-09-14", "2026-09-21"), 7);
  assert.equal(daysBetween("2026-09-21", "2026-09-14"), -7);
});

test("a semana 1 começa no início do planejamento, não na segunda do calendário", () => {
  // 16/09/2026 é uma quarta-feira.
  assert.deepEqual(weekBounds("2026-09-16", 1), {
    startsOn: "2026-09-16",
    endsOn: "2026-09-22",
  });
  assert.deepEqual(weekBounds("2026-09-16", 3), {
    startsOn: "2026-09-30",
    endsOn: "2026-10-06",
  });
});

test("a semana de uma data, e o piso em 1 para quem chega antes de começar", () => {
  assert.equal(weekNumberOf("2026-09-16", "2026-09-16"), 1);
  assert.equal(weekNumberOf("2026-09-16", "2026-09-22"), 1);
  assert.equal(weekNumberOf("2026-09-16", "2026-09-23"), 2);
  // Antes do início a resposta é a primeira semana: tela vazia seria pior.
  assert.equal(weekNumberOf("2026-09-16", "2026-09-01"), 1);
});

test("o dia da semana cai na data certa mesmo quando a semana começa no meio", () => {
  // Semana que começa numa quarta (16/09): a segunda-feira dela é 21/09.
  assert.equal(dateOfWeekday("2026-09-16", 3), "2026-09-16"); // quarta
  assert.equal(dateOfWeekday("2026-09-16", 5), "2026-09-18"); // sexta
  assert.equal(dateOfWeekday("2026-09-16", 1), "2026-09-21"); // segunda seguinte
  assert.equal(dateOfWeekday("2026-09-16", 2), "2026-09-22"); // terça seguinte
});

test("as metas do dia saem na ordem da posição, e o título desempata", () => {
  const dias = groupIntoDays(
    [
      goal({ id: "b", weekday: 3, dayPosition: 2, title: "Bateria" }),
      goal({ id: "a", weekday: 3, dayPosition: 1, title: "Teoria" }),
      // Mesma posição: sem desempate estável, as duas trocariam de lugar entre
      // leituras, e quem clicou na segunda concluiria a primeira.
      goal({ id: "z", weekday: 5, dayPosition: 1, title: "Zeta" }),
      goal({ id: "m", weekday: 5, dayPosition: 1, title: "Alfa" }),
    ],
    "2026-09-16",
  );

  assert.deepEqual(
    dias.map((d) => [d.weekday, d.date, d.goals.map((g) => g.id)]),
    [
      [3, "2026-09-16", ["a", "b"]],
      [5, "2026-09-18", ["m", "z"]],
    ],
  );
});

test("dia sem meta não vira cartão vazio", () => {
  const dias = groupIntoDays([goal({ id: "a", weekday: 4 as Weekday })], "2026-09-16");
  assert.equal(dias.length, 1);
});

test("hoje sem registro não zera a sequência, porque o dia não acabou", () => {
  // Estudou ontem e anteontem, ainda não estudou hoje: a sequência é 2.
  assert.equal(streakDays(["2026-09-13", "2026-09-12"], "2026-09-14"), 2);
  // Estudou hoje também: 3.
  assert.equal(streakDays(["2026-09-14", "2026-09-13", "2026-09-12"], "2026-09-14"), 3);
  // Um dia de buraco quebra.
  assert.equal(streakDays(["2026-09-12", "2026-09-10"], "2026-09-14"), 0);
  assert.equal(streakDays([], "2026-09-14"), 0);
});

test("o desempenho da semana sai dos REGISTROS, não dos contadores da meta", () => {
  // A meta diz 100 questões; o ledger diz 10. Vale o ledger — é o que sobra
  // correto quando alguém apaga um registro.
  const resumo = summarizeWeek(
    [
      goal({ id: "a", status: "completed", questionsAnswered: 100, correctAnswers: 100 }),
      goal({ id: "b" }),
    ],
    [
      entry({ id: "e1", minutes: 60, questions: 6, correctAnswers: 3 }),
      entry({ id: "e2", minutes: 30, questions: 4, correctAnswers: 2 }),
    ],
    "2026-09-14",
    ["2026-09-14"],
  );

  assert.deepEqual(resumo, {
    score: 50,
    studiedMinutes: 90,
    questionsAnswered: 10,
    correctAnswers: 5,
    streakDays: 1,
    goalsTotal: 2,
    goalsCompleted: 1,
  });
});

test("semana sem questão respondida tem desempenho nulo, e não zero", () => {
  // Zero por cento é uma afirmação — "errou tudo". Ausência de resposta não é.
  const resumo = summarizeWeek([goal({ id: "a" })], [entry({ id: "e1", minutes: 40 })], "2026-09-14", [
    "2026-09-14",
  ]);
  assert.equal(resumo.score, null);
  assert.equal(resumo.studiedMinutes, 40);
});

test("desfazer a conclusão devolve a meta ao estado que os registros justificam", () => {
  assert.equal(statusFromEntries(0), "pending");
  assert.equal(statusFromEntries(2), "in_progress");
});

test("o tempo é escrito como a v2 escreve", () => {
  assert.equal(formatMinutes(0), "0min");
  assert.equal(formatMinutes(45), "45min");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(135), "2h15");
  assert.equal(formatMinutes(605), "10h05");
});
