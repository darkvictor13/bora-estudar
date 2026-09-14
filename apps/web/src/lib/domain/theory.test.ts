/**
 * O motor da teoria, contra os OITO PASSOS do piloto da v108.2.
 *
 * O LEIA-ME recomenda conferir em Português: abrir a meta, confirmar a aula e o
 * caderno, salvar uma página intermediária, reabrir e conferir a continuidade,
 * concluir a teoria, registrar questões iniciais, atingir o mínimo e ver a aula
 * seguinte liberada, e conferir a criação da revisão. Os passos 1 e 2 são de
 * tela; os outros seis são regra, e estão aqui.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampPage,
  currentLesson,
  diagnose,
  dueReviews,
  isLessonComplete,
  isTheoryDone,
  lessonProgressPercent,
  nextPage,
  normalizeSubjectKey,
  sameSubject,
  type EngineLesson,
  type EngineProgress,
  type ReviewRule,
} from "./theory.ts";

function lesson(over: Partial<EngineLesson> & { id: string }): EngineLesson {
  return {
    subjectKey: "portugues",
    position: 1,
    lessonCode: "A00",
    hasTheory: true,
    theoryStartPage: 1,
    theoryEndPage: 20,
    ...over,
  };
}

function progress(over: Partial<EngineProgress> & { lessonId: string }): EngineProgress {
  return {
    currentPage: 0,
    theoryDone: false,
    initialQuestionsDone: 0,
    lessonDone: false,
    ...over,
  };
}

const rule = (over: Partial<ReviewRule> = {}): ReviewRule => ({
  reviewNumber: 1,
  lessonSpacing: 3,
  minimumQuestions: 15,
  ...over,
});

/* ------------------------------------------------------------------ *
 * Nome de disciplina
 * ------------------------------------------------------------------ */

test("os apelidos do time viram uma chave só", () => {
  assert.equal(normalizeSubjectKey("Língua Portuguesa"), "portugues");
  assert.equal(normalizeSubjectKey("Português"), "portugues");
  assert.equal(normalizeSubjectKey("AFO"), "afo");
  assert.equal(normalizeSubjectKey("Administração Financeira e Orçamentária"), "afo");
  assert.equal(normalizeSubjectKey("RLM"), "rlm");
  assert.equal(normalizeSubjectKey("LTE Geral Part I"), "lte");
  // O prefixo "Teoria — " e a numeração do título somem antes da comparação.
  assert.equal(normalizeSubjectKey("Teoria — 03. Português"), "portugues");
});

test('"ti" não casa dentro de "administrativo"', () => {
  // A comparação é EXATA depois de normalizar. Com `includes`, a abreviação de
  // Tecnologia da Informação casaria em "adminisTIativo" e a aula iria para a
  // disciplina errada.
  assert.equal(sameSubject("TI", "Direito Administrativo"), false);
  assert.equal(sameSubject("Tecnologia da Informação", "TI"), true);
  // Nome vazio não casa com nada, nem com outro vazio.
  assert.equal(sameSubject("", ""), false);
});

/* ------------------------------------------------------------------ *
 * Passo 3 e 4 — salvar uma página intermediária e reabrir
 * ------------------------------------------------------------------ */

test("passo 3/4 · quem não começou está uma página ANTES da primeira", () => {
  const aula = lesson({ id: "l1", theoryStartPage: 5, theoryEndPage: 24 });

  // Zero por cento, e não 5%: abrir a aula não pode marcar uma página lida.
  assert.equal(lessonProgressPercent(aula, null), 0);
  assert.equal(lessonProgressPercent(aula, progress({ lessonId: "l1", currentPage: 4 })), 0);

  // Parou na 14: leu 10 das 20 páginas.
  assert.equal(lessonProgressPercent(aula, progress({ lessonId: "l1", currentPage: 14 })), 50);
  assert.equal(lessonProgressPercent(aula, progress({ lessonId: "l1", currentPage: 24 })), 100);
});

test("passo 4 · reabrir continua da página seguinte à última lida", () => {
  const aula = lesson({ id: "l1", theoryStartPage: 5, theoryEndPage: 24 });

  assert.equal(nextPage(aula, null), 5);
  assert.equal(nextPage(aula, progress({ lessonId: "l1", currentPage: 14 })), 15);
  // No fim, continua no fim: não existe página 25 de teoria.
  assert.equal(nextPage(aula, progress({ lessonId: "l1", currentPage: 24 })), 24);
});

test("a página salva é presa ao intervalo auditado", () => {
  const aula = lesson({ id: "l1", theoryStartPage: 5, theoryEndPage: 24 });

  assert.equal(clampPage(aula, 99), 24);
  assert.equal(clampPage(aula, -3), 4);
  assert.equal(clampPage(aula, 12), 12);
  // Aula sem teoria não tem página nenhuma para prender.
  assert.equal(clampPage(lesson({ id: "l2", hasTheory: false }), 10), null);
});

/* ------------------------------------------------------------------ *
 * Passo 5 — concluir a teoria
 * ------------------------------------------------------------------ */

test("passo 5 · a teoria acaba na última página, e não antes", () => {
  const aula = lesson({ id: "l1", theoryStartPage: 5, theoryEndPage: 24 });

  assert.equal(isTheoryDone(aula, 23), false);
  assert.equal(isTheoryDone(aula, 24), true);
  // Aula sem teoria já nasce com a teoria "lida": não há o que ler.
  assert.equal(isTheoryDone(lesson({ id: "l2", hasTheory: false }), 0), true);
});

/* ------------------------------------------------------------------ *
 * Passo 6 e 7 — questões iniciais e liberação da próxima aula
 * ------------------------------------------------------------------ */

test("passo 6/7 · a aula só fecha com teoria lida E o mínimo de questões", () => {
  const aula = lesson({ id: "l1" });

  // Teoria lida, questões faltando: não fecha.
  assert.equal(
    isLessonComplete(aula, progress({ lessonId: "l1", theoryDone: true, initialQuestionsDone: 14 }), 15),
    false,
  );
  // Questões feitas, teoria faltando: também não fecha. É a metade que se
  // perde ao reescrever — encerrar a sessão não conclui a aula.
  assert.equal(
    isLessonComplete(aula, progress({ lessonId: "l1", theoryDone: false, initialQuestionsDone: 20 }), 15),
    false,
  );
  // As duas coisas: fecha.
  assert.equal(
    isLessonComplete(aula, progress({ lessonId: "l1", theoryDone: true, initialQuestionsDone: 15 }), 15),
    true,
  );
  // Aula sem teoria depende só das questões.
  assert.equal(
    isLessonComplete(
      lesson({ id: "l2", hasTheory: false }),
      progress({ lessonId: "l2", initialQuestionsDone: 15 }),
      15,
    ),
    true,
  );
});

test("passo 7 · a aula atual é a primeira não concluída", () => {
  const aulas = [
    lesson({ id: "a0", position: 1, lessonCode: "A00" }),
    lesson({ id: "a1", position: 2, lessonCode: "A01" }),
    lesson({ id: "a2", position: 3, lessonCode: "A02" }),
  ];

  const nenhuma = currentLesson(aulas, new Map());
  assert.equal(nenhuma?.lesson.id, "a0");
  assert.equal(nenhuma?.courseFinished, false);

  const primeiraFeita = new Map([["a0", progress({ lessonId: "a0", lessonDone: true })]]);
  assert.equal(currentLesson(aulas, primeiraFeita)?.lesson.id, "a1");

  // Todas concluídas: devolve a ÚLTIMA com `courseFinished`, e não `null` —
  // "sem aula" é o oposto do que aconteceu com quem terminou a disciplina.
  const todas = new Map(aulas.map((a) => [a.id, progress({ lessonId: a.id, lessonDone: true })]));
  const fim = currentLesson(aulas, todas);
  assert.equal(fim?.lesson.id, "a2");
  assert.equal(fim?.courseFinished, true);

  assert.equal(currentLesson([], new Map()), null);
});

test("a ordem das aulas é a do catálogo, não a da consulta", () => {
  const aulas = [
    lesson({ id: "a2", position: 3, lessonCode: "A02" }),
    lesson({ id: "a0", position: 1, lessonCode: "A00" }),
    lesson({ id: "a1", position: 2, lessonCode: "A01" }),
  ];
  assert.equal(currentLesson(aulas, new Map())?.lesson.id, "a0");
});

/* ------------------------------------------------------------------ *
 * Passo 8 — a revisão nasce pela regra
 * ------------------------------------------------------------------ */

test("passo 8 · o espaçamento conta AULAS CONCLUÍDAS, não dias", () => {
  const aulas = [0, 1, 2, 3, 4].map((i) =>
    lesson({ id: `a${i}`, position: i + 1, lessonCode: `A0${i}` }),
  );
  const feitas = (ids: readonly string[]) =>
    new Map(ids.map((id) => [id, progress({ lessonId: id, lessonDone: true })]));

  // Só a primeira concluída: a revisão de espaçamento 3 ainda não venceu.
  assert.deepEqual(dueReviews(aulas, feitas(["a0"]), [rule()]), []);

  // Concluiu até a a3 — três aulas depois da a0: venceu a revisão da a0.
  const venceu = dueReviews(aulas, feitas(["a0", "a1", "a2", "a3"]), [rule()]);
  assert.deepEqual(
    venceu.map((d) => [d.lesson.id, d.rule.reviewNumber]),
    [["a0", 1]],
  );
});

test("passo 8 · duas regras na mesma aula viram duas revisões", () => {
  const aulas = [0, 1, 2, 3, 4, 5].map((i) =>
    lesson({ id: `a${i}`, position: i + 1, lessonCode: `A0${i}` }),
  );
  const feitas = new Map(
    ["a0", "a1", "a2", "a3", "a4", "a5"].map((id) => [
      id,
      progress({ lessonId: id, lessonDone: true }),
    ]),
  );

  const due = dueReviews(aulas, feitas, [
    rule({ reviewNumber: 1, lessonSpacing: 3 }),
    rule({ reviewNumber: 2, lessonSpacing: 5 }),
  ]);

  // Disciplina inteira concluída: TODAS as revisões vencem juntas, senão a
  // matéria nunca fecharia — não há aula nova para empurrá-las.
  assert.equal(due.length, 12);
  assert.deepEqual(
    due.filter((d) => d.lesson.id === "a0").map((d) => d.rule.reviewNumber),
    [1, 2],
  );
});

test("aula não concluída não gera revisão, mesmo com a disciplina avançada", () => {
  const aulas = [0, 1, 2, 3, 4].map((i) =>
    lesson({ id: `a${i}`, position: i + 1, lessonCode: `A0${i}` }),
  );
  // Pulou a a1: ela não tem revisão, e as outras têm.
  const feitas = new Map(
    ["a0", "a2", "a3", "a4"].map((id) => [id, progress({ lessonId: id, lessonDone: true })]),
  );

  const due = dueReviews(aulas, feitas, [rule({ lessonSpacing: 1 })]);
  assert.equal(
    due.some((d) => d.lesson.id === "a1"),
    false,
  );
  assert.equal(
    due.some((d) => d.lesson.id === "a0"),
    true,
  );
});

test("sem regra configurada não nasce revisão nenhuma", () => {
  const aulas = [lesson({ id: "a0" })];
  const feitas = new Map([["a0", progress({ lessonId: "a0", lessonDone: true })]]);
  assert.deepEqual(dueReviews(aulas, feitas, []), []);
});

/* ------------------------------------------------------------------ *
 * Diagnóstico
 * ------------------------------------------------------------------ */

test("disciplina sem página auditada recebe DIAGNÓSTICO, não página inventada", () => {
  const semTeoria = [
    lesson({ id: "m1", hasTheory: false, theoryStartPage: null, theoryEndPage: null }),
    lesson({ id: "m2", hasTheory: false, theoryStartPage: null, theoryEndPage: null }),
  ];

  assert.deepEqual(diagnose("Matemática Financeira", semTeoria, semTeoria[0]!, true, "Aula 1"), {
    kind: "subject_not_audited",
    subject: "Matemática Financeira",
  });

  // A falta é descoberta pelo DADO. No dia em que a auditoria cobrir a
  // disciplina, o diagnóstico vira `ok` sozinho — não há lista a editar.
  const comTeoria = [lesson({ id: "m1" })];
  assert.deepEqual(diagnose("Matemática Financeira", comTeoria, comTeoria[0]!, true, "Aula 1"), {
    kind: "ok",
  });
});

test("os outros dois diagnósticos", () => {
  const aulas = [lesson({ id: "a0" })];

  assert.deepEqual(diagnose("Português", aulas, aulas[0]!, false, "Aula 0"), {
    kind: "no_catalog_linked",
  });
  assert.deepEqual(diagnose("Português", [], null, true, ""), {
    kind: "subject_not_audited",
    subject: "Português",
  });

  const semPagina = [lesson({ id: "a0", theoryEndPage: null }), lesson({ id: "a1" })];
  assert.deepEqual(diagnose("Português", semPagina, semPagina[0]!, true, "Aula 00"), {
    kind: "lesson_without_pages",
    lesson: "Aula 00",
  });
});
