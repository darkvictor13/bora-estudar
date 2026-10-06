/**
 * A validação é do CONTRATO, não de quem o cumpre.
 *
 * Estes testes existem para que `fixtures` e `supabase` não possam divergir na
 * frase que a pessoa lê: a tela construída contra a fixture mostraria um texto
 * em desenvolvimento e outro em produção, e o teste que fixou o primeiro
 * passaria a mentir sem falhar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkCredentials,
  checkExtraStudy,
  checkExtraStudyDate,
  checkQuestionRecord,
  checkStudyEntry,
  checkGenerateWeek,
  checkName,
  checkPassword,
  checkSignUp,
  checkWeekNumber,
} from "./validation.ts";

test("entrar sem e-mail ou sem senha pede os dois, sem culpar um campo", () => {
  // Sem `field`: apontar o e-mail quando faltam os dois manda a pessoa
  // preencher metade e tentar de novo.
  assert.deepEqual(checkCredentials({ email: "", password: "" }), {
    code: "validation",
    message: "Informe e-mail e senha.",
  });
  assert.deepEqual(checkCredentials({ email: "  ", password: "x" })?.message, "Informe e-mail e senha.");
  assert.equal(checkCredentials({ email: "a@b.com", password: "x" }), null);
});

test("a senha curta é recusada com o campo, para a tela saber o que marcar", () => {
  const erro = checkPassword("12345");
  assert.equal(erro?.field, "password");
  assert.match(erro!.message, /pelo menos 6 caracteres/);
  assert.equal(checkPassword("123456"), null);
});

test("o cadastro recusa na ordem em que a pessoa preenche", () => {
  // Nome primeiro: reclamar da senha de quem nem digitou o nome faz a pessoa
  // corrigir de baixo para cima.
  const semNada = checkSignUp({ name: "Jo", email: "", password: "123" });
  assert.equal(semNada?.field, "name");

  const semEmail = checkSignUp({ name: "Maria Silva", email: " ", password: "123" });
  assert.equal(semEmail?.field, "email");

  const senhaCurta = checkSignUp({ name: "Maria Silva", email: "a@b.com", password: "123" });
  assert.equal(senhaCurta?.field, "password");

  assert.equal(checkSignUp({ name: "Maria Silva", email: "a@b.com", password: "123456" }), null);
});

test("o nome é medido sem os espaços em volta", () => {
  assert.equal(checkName("  Jo  ")?.field, "name");
  assert.equal(checkName("  Ana  "), null);
});

test("a semana é um inteiro de 1 a 520, e a frase diz isso", () => {
  assert.equal(checkWeekNumber(1), null);
  assert.equal(checkWeekNumber(520), null);
  for (const semana of [0, 521, -3, 1.5, Number.NaN]) {
    const erro = checkWeekNumber(semana);
    assert.equal(erro?.field, "weekNumber", `semana ${semana}`);
    assert.match(erro!.message, /1 a 520/);
  }
});

test("a semana a copiar aponta o campo dela", () => {
  const base = { studyPlanId: "plano", requestId: "req", weekNumber: 1 };
  assert.equal(checkGenerateWeek({ ...base, copyFromWeek: 2 }), null);
  const erro = checkGenerateWeek({ ...base, copyFromWeek: 0 });
  assert.equal(erro?.field, "copyFromWeek");
  assert.match(erro!.message, /semana a copiar/);
});

test("um registro de estudo vai de 0 a 240 minutos e de 0 a 500 questões, com a frase do campo", () => {
  assert.equal(checkStudyEntry({ minutes: 30, questions: 10, correctAnswers: 8 }), null);
  // Só questões (é a teoria) também é registro.
  assert.equal(checkStudyEntry({ minutes: 0, questions: 10, correctAnswers: 5 }), null);

  for (const minutes of [-30, 241, 1.5, Number.NaN]) {
    const error = checkStudyEntry({ minutes, questions: 0, correctAnswers: 0 });
    assert.equal(error?.field, "minutes", String(minutes));
    assert.match(error?.message ?? "", /minutos inteiros, de 0 a 240/);
  }
  const questions = checkStudyEntry({ minutes: 0, questions: 501, correctAnswers: 0 });
  assert.equal(questions?.field, "questions");
  assert.match(questions?.message ?? "", /de 0 a 500/);
  assert.equal(checkStudyEntry({ minutes: 10, questions: Number.NaN, correctAnswers: 0 })?.field, "questions");

  assert.equal(checkStudyEntry({ minutes: 10, questions: 5, correctAnswers: -1 })?.field, "correctAnswers");
  assert.equal(
    checkStudyEntry({ minutes: 10, questions: 5, correctAnswers: 6 })?.message,
    "Os acertos não podem passar do total de questões.",
  );
  assert.deepEqual(checkStudyEntry({ minutes: 0, questions: 0, correctAnswers: 0 }), {
    code: "validation",
    message: "Informe o tempo estudado ou as questões feitas.",
    field: "minutes",
  });
});

test("as questões da teoria vão de 1 a 500, e questão zero não é registro", () => {
  assert.equal(checkQuestionRecord({ questions: 10, correctAnswers: 8 }), null);
  assert.equal(checkQuestionRecord({ questions: 1, correctAnswers: 0 }), null);
  assert.equal(checkQuestionRecord({ questions: 500, correctAnswers: 500 }), null);

  assert.deepEqual(checkQuestionRecord({ questions: 0, correctAnswers: 0 }), {
    code: "validation",
    message: "Informe quantas questões você fez.",
    field: "questions",
  });
  for (const questions of [501, 1.5, Number.NaN]) {
    const error = checkQuestionRecord({ questions, correctAnswers: 0 });
    assert.equal(error?.field, "questions", String(questions));
    assert.match(error?.message ?? "", /número inteiro, de 0 a 500/, String(questions));
  }
  const negative = checkQuestionRecord({ questions: 5, correctAnswers: -1 });
  assert.equal(negative?.field, "correctAnswers");
  assert.match(negative?.message ?? "", /a partir de 0/);
  assert.equal(
    checkQuestionRecord({ questions: 5, correctAnswers: 6 })?.message,
    "Os acertos não podem passar do total de questões.",
  );
});

test("a data do estudo extra vai do início do planejamento até hoje", () => {
  const inicio = "2026-09-01";
  const hoje = "2026-09-14";
  assert.equal(checkExtraStudyDate(inicio, inicio, hoje), null);
  assert.equal(checkExtraStudyDate(hoje, inicio, hoje), null);
  for (const date of ["2026-08-31", "2026-09-15"]) {
    const error = checkExtraStudyDate(date, inicio, hoje);
    assert.equal(error?.field, "date");
    assert.match(error?.message ?? "", /entre o início do planejamento e hoje/);
  }
  for (const date of ["", "2026-02-30", "14/09/2026"]) {
    assert.equal(checkExtraStudyDate(date, inicio, hoje)?.message, "Informe a data do estudo.", date);
  }
});

test("o estudo extra valida na ordem dos campos: matéria, data, números", () => {
  const base = { subject: "Português", date: "2026-09-10", minutes: 20, questions: 0, correctAnswers: 0 };
  assert.equal(checkExtraStudy(base, "2026-09-01", "2026-09-14"), null);
  assert.equal(
    checkExtraStudy({ ...base, subject: "  ", date: "x", minutes: -1 }, "2026-09-01", "2026-09-14")?.field,
    "subject",
  );
  assert.equal(checkExtraStudy({ ...base, date: "2026-08-01", minutes: -1 }, "2026-09-01", "2026-09-14")?.field, "date");
  assert.equal(checkExtraStudy({ ...base, minutes: -1 }, "2026-09-01", "2026-09-14")?.field, "minutes");
});
