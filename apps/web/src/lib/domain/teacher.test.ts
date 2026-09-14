import assert from "node:assert/strict";
import { test } from "node:test";

import type { Weekday } from "@/lib/api";
import { classifyPace, planWeek, progressUntil, shareByWeight } from "./teacher.ts";

test("quem não tem nada devido está EM RITMO, e não atrasado", () => {
  // Um planejamento que começa amanhã não produz aluno vermelho hoje. Pintar de
  // vermelho no primeiro dia é a forma mais rápida de o professor parar de
  // olhar a cor.
  assert.equal(classifyPace(0, 0), "on_track");
  assert.equal(classifyPace(8, 10), "on_track");
  assert.equal(classifyPace(5, 10), "attention");
  assert.equal(classifyPace(4, 10), "behind");
  assert.equal(classifyPace(0, 10), "behind");
});

test("o denominador são as metas DEVIDAS até hoje, não a semana inteira", () => {
  // Plano começa numa segunda (14/09/2026); hoje é quarta (16/09).
  const goals = [
    { weekNumber: 1, weekday: 1 as Weekday, status: "completed" as const },
    { weekNumber: 1, weekday: 2 as Weekday, status: "completed" as const },
    { weekNumber: 1, weekday: 3 as Weekday, status: "pending" as const },
    // Sexta ainda não chegou: não conta contra o aluno.
    { weekNumber: 1, weekday: 5 as Weekday, status: "pending" as const },
    // Semana que vem, muito menos.
    { weekNumber: 2, weekday: 1 as Weekday, status: "pending" as const },
  ];

  assert.deepEqual(progressUntil(goals, "2026-09-14", "2026-09-16"), {
    completed: 2,
    due: 3,
    percent: 67,
  });
});

test("meta pulada conta como devida e não concluída", () => {
  // Pular é decisão legítima, mas o conteúdo não foi coberto — e sem isso
  // pular viraria a forma de ficar verde sem estudar.
  const goals = [
    { weekNumber: 1, weekday: 1 as Weekday, status: "completed" as const },
    { weekNumber: 1, weekday: 1 as Weekday, status: "skipped" as const },
  ];
  assert.deepEqual(progressUntil(goals, "2026-09-14", "2026-09-16"), {
    completed: 1,
    due: 2,
    percent: 50,
  });
});

test("a repartição por peso não perde meta no arredondamento", () => {
  const pesos = [
    { subject: "Constitucional", weight: 5 },
    { subject: "Administrativo", weight: 4 },
    { subject: "Português", weight: 3 },
    { subject: "RLM", weight: 2 },
  ];

  const doze = shareByWeight(pesos, 12);
  // `Math.floor` de cada fração daria 4+3+2+1 = 10, e duas metas sumiriam.
  assert.equal([...doze.values()].reduce((a, b) => a + b, 0), 12);
  // O maior peso continua com a maior fatia.
  assert.equal(doze.get("Constitucional")! >= doze.get("RLM")!, true);
});

test("toda disciplina com peso ganha pelo menos uma meta", () => {
  const pesos = [
    { subject: "Constitucional", weight: 20 },
    { subject: "RLM", weight: 1 },
  ];
  const oito = shareByWeight(pesos, 8);

  // Uma disciplina do ciclo que não aparece na semana é pior do que uma semana
  // desbalanceada: o professor vai procurar o erro no lugar errado.
  assert.equal(oito.get("RLM"), 1);
  assert.equal([...oito.values()].reduce((a, b) => a + b, 0), 8);
});

test("menos metas do que disciplinas: entram as de maior peso", () => {
  const pesos = [
    { subject: "A", weight: 5 },
    { subject: "B", weight: 3 },
    { subject: "C", weight: 1 },
  ];
  const duas = shareByWeight(pesos, 2);
  assert.deepEqual([...duas.entries()].sort(), [
    ["A", 1],
    ["B", 1],
  ]);
});

test("peso zero não entra, e total zero não gera nada", () => {
  assert.equal(shareByWeight([{ subject: "A", weight: 0 }], 5).size, 0);
  assert.equal(shareByWeight([{ subject: "A", weight: 5 }], 0).size, 0);
});

test("a semana espalha em rodízio, em vez de empilhar na segunda", () => {
  const pesos = [
    { subject: "A", weight: 3 },
    { subject: "B", weight: 3 },
  ];
  const dias: Weekday[] = [1, 3, 5];
  const semana = planWeek(pesos, 6, dias);

  assert.equal(semana.length, 6);
  // Duas por dia, nos três dias — e não seis na segunda.
  const porDia = new Map<number, number>();
  for (const meta of semana) porDia.set(meta.weekday, (porDia.get(meta.weekday) ?? 0) + 1);
  assert.deepEqual([...porDia.entries()].sort(), [
    [1, 2],
    [3, 2],
    [5, 2],
  ]);

  // A posição dentro do dia começa em 1 e não repete.
  for (const dia of dias) {
    const posicoes = semana.filter((m) => m.weekday === dia).map((m) => m.dayPosition);
    assert.deepEqual([...posicoes].sort(), [1, 2]);
  }
});

test("a semana sai ordenada por dia e posição", () => {
  const semana = planWeek([{ subject: "A", weight: 1 }], 4, [5, 1, 3]);
  const chaves = semana.map((m) => `${m.weekday}.${m.dayPosition}`);
  assert.deepEqual(chaves, [...chaves].sort());
});

test("sem dia escolhido não há semana", () => {
  assert.deepEqual(planWeek([{ subject: "A", weight: 1 }], 4, []), []);
});
