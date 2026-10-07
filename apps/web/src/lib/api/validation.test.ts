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

import type { Notebook, WaitlistInput } from "./contract.ts";
import {
  checkClass,
  checkClassName,
  checkCredentials,
  checkExtraStudy,
  checkExtraStudyDate,
  checkLink,
  checkNotebook,
  checkPersonalDeck,
  checkPlan,
  checkQuestionRecord,
  checkStudyEntry,
  checkGenerateWeek,
  checkName,
  checkPassword,
  checkSignUp,
  checkWaitlist,
  checkWeekNumber,
  CLASS_NAME_TAKEN,
  DECK_TAKEN,
  PLAN_NAME_TAKEN,
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

test("QA-18 · senha só de espaços é recusada no cadastro e na redefinição, e o login não a recusa", () => {
  const erro = checkPassword("        ");
  assert.equal(erro?.field, "password");
  assert.equal(erro?.message, "A senha não pode ser formada só por espaços.");
  assert.equal(checkSignUp({ name: "Maria Silva", email: "a@b.com", password: "        " })?.field, "password");
  // A conta criada antes da regra continua entrando.
  assert.equal(checkCredentials({ email: "a@b.com", password: "        " }), null);
  // Espaço no meio é senha; o comprimento vem antes da regra do espaço.
  assert.equal(checkPassword("ab cd ef"), null);
  assert.match(checkPassword("     ")!.message, /pelo menos 6 caracteres/);
});

test("QA-15 · o nome tem teto de 120, medido sem as pontas", () => {
  assert.equal(checkName("a".repeat(120)), null);
  assert.equal(checkName(` ${"a".repeat(120)} `), null);
  const erro = checkName("a".repeat(121));
  assert.equal(erro?.field, "name");
  assert.equal(erro?.message, "O nome pode ter até 120 caracteres.");
  assert.equal(checkSignUp({ name: "a".repeat(121), email: "a@b.com", password: "123456" })?.field, "name");
});

test("QA-15 · turma: nome de 3 a 120 e descrição até 2000", () => {
  assert.equal(checkClassName("a".repeat(121))?.message, "O nome da turma pode ter até 120 caracteres.");
  assert.equal(checkClass({ name: "Turma A", description: "d".repeat(2000) }), null);
  const descricao = checkClass({ name: "Turma A", description: "d".repeat(2001) });
  assert.equal(descricao?.field, "description");
  assert.equal(descricao?.message, "A descrição pode ter até 2000 caracteres.");
  assert.equal(checkClass({ name: "ab" })?.field, "name");
});

test("QA-15 · planejamento: nome, área, fase e modelo até 120, concurso até 200", () => {
  assert.equal(checkPlan({ name: "a".repeat(120), area: "b".repeat(120), targetExam: "c".repeat(200) }), null);
  assert.equal(checkPlan({ name: "ab" })?.message, "Dê um nome ao planejamento.");
  assert.equal(checkPlan({ name: "a".repeat(121) })?.field, "name");
  assert.equal(checkPlan({ area: "a".repeat(121) })?.field, "area");
  assert.equal(checkPlan({ stage: "a".repeat(121) })?.field, "stage");
  assert.equal(checkPlan({ studyModel: "a".repeat(121) })?.field, "studyModel");
  assert.equal(checkPlan({ targetExam: "a".repeat(201) })?.field, "targetExam");
  // As regras que vieram do adaptador continuam as mesmas.
  assert.equal(checkPlan({ weeklyGoals: 61 })?.field, "weeklyGoals");
  assert.equal(checkPlan({ startsOn: "2026-09-14", examDate: "2026-09-01" })?.field, "examDate");
});

test("QA-19 · WhatsApp: só dígitos, espaço, ()+-, com 10 a 13 dígitos", () => {
  const base: WaitlistInput = {
    name: "Maria Silva",
    email: "a@b.com",
    whatsapp: "(41) 99999-0000",
    interestArea: "Fiscal",
    targetExam: "Receita Federal",
    timezone: "America/Sao_Paulo",
  };
  const hoje = "2026-09-14";
  assert.equal(checkWaitlist(base, hoje), null);
  for (const aceito of ["+55 41 99999-0000", "41999990000", "4133334444"]) {
    assert.equal(checkWaitlist({ ...base, whatsapp: aceito }, hoje), null, aceito);
  }
  for (const recusado of ["abcdefgh", "419999999", "41999990000123", "(41) 9999-ab00"]) {
    const erro = checkWaitlist({ ...base, whatsapp: recusado }, hoje);
    assert.equal(erro?.field, "whatsapp", recusado);
    assert.equal(erro?.message, "Informe o WhatsApp com DDD, como (11) 90000-0000.", recusado);
  }
  assert.equal(
    checkWaitlist({ ...base, whatsapp: "  " }, hoje)?.message,
    "Informe um WhatsApp para o professor falar com você.",
  );
});

test("QA-19 · área e concurso de 2 a 120 e de 2 a 200; nascimento de 1900 até hoje", () => {
  const base: WaitlistInput = {
    name: "Maria Silva",
    email: "a@b.com",
    whatsapp: "41999990000",
    interestArea: "Fiscal",
    targetExam: "Receita Federal",
    timezone: "America/Sao_Paulo",
  };
  const hoje = "2026-09-14";
  assert.equal(checkWaitlist({ ...base, interestArea: " " }, hoje)?.message, "Informe sua área de interesse.");
  assert.equal(checkWaitlist({ ...base, interestArea: "a".repeat(121) }, hoje)?.field, "interestArea");
  assert.equal(checkWaitlist({ ...base, targetExam: "x" }, hoje)?.message, "Informe para qual concurso você estuda.");
  assert.equal(checkWaitlist({ ...base, targetExam: "a".repeat(201) }, hoje)?.field, "targetExam");

  assert.equal(checkWaitlist({ ...base, birthDate: hoje }, hoje), null);
  assert.equal(checkWaitlist({ ...base, birthDate: "1900-01-01" }, hoje), null);
  for (const recusado of ["2026-09-15", "1899-12-31", "2026-02-30", "x"]) {
    const erro = checkWaitlist({ ...base, birthDate: recusado }, hoje);
    assert.equal(erro?.field, "birthDate", recusado);
    assert.equal(erro?.message, "A data de nascimento precisa ser entre 01/01/1900 e hoje.", recusado);
  }
});

test("QA-24 · o link é vazio ou https sem espaço", () => {
  assert.equal(checkLink("", "notebookLink"), null);
  assert.equal(checkLink("https://www.tecconcursos.com.br/", "notebookLink"), null);
  assert.equal(checkLink("https://outro.example/caderno?id=1", "notebookLink"), null);
  for (const recusado of [
    "javascript:alert(1)",
    "http://x.com",
    "ftp://x.com/y",
    "https://x.com/a b",
    "https://user:senha@x.com",
    "x.com",
    `https://x.com/${"a".repeat(2048)}`,
  ]) {
    const erro = checkLink(recusado, "notebookLink");
    assert.equal(erro?.field, "notebookLink", recusado);
    assert.match(erro!.message, /^Informe um link HTTPS válido/, recusado);
  }
});

test("o caderno: nome até 200, link, questões e a meta de 0 a 100", () => {
  const caderno: Notebook = {
    blockId: "b",
    subjectKey: "k",
    subjectName: "Matéria",
    subjectColor: "#5B6B85",
    subjectTarget: 80,
    notebookKey: "n",
    notebookName: "Caderno 1",
    notebookLink: "https://www.tecconcursos.com.br/",
    totalQuestions: 10,
    subjectPosition: 0,
    notebookPosition: 0,
    active: true,
    deleted: false,
  };
  assert.equal(checkNotebook(caderno), null);
  assert.equal(checkNotebook({ ...caderno, notebookLink: "" }), null);
  assert.equal(checkNotebook({ ...caderno, notebookName: "  " })?.message, "Dê um nome ao caderno.");
  assert.equal(checkNotebook({ ...caderno, notebookName: "a".repeat(201) })?.field, "notebookName");
  assert.equal(checkNotebook({ ...caderno, notebookLink: "javascript:alert(1)" })?.field, "notebookLink");
  assert.equal(checkNotebook({ ...caderno, totalQuestions: -1 })?.field, "totalQuestions");
  for (const meta of [150, -1, 80.5]) {
    const erro = checkNotebook({ ...caderno, subjectTarget: meta });
    assert.equal(erro?.field, "subjectTarget", String(meta));
    assert.equal(erro?.message, "A meta de acerto vai de 0 a 100%.");
  }
  assert.equal(checkNotebook({ ...caderno, subjectTarget: 0 }), null);
  assert.equal(checkNotebook({ ...caderno, subjectTarget: 100 }), null);
});

test("o deck pessoal: disciplina de 2 a 120 e assunto de 2 a 160", () => {
  assert.equal(checkPersonalDeck({ subject: "a".repeat(120), title: "b".repeat(160) }), null);
  assert.equal(checkPersonalDeck({ subject: "a", title: "Assunto" })?.message, "Informe a disciplina.");
  assert.equal(checkPersonalDeck({ subject: "a".repeat(121), title: "Assunto" })?.field, "subject");
  assert.equal(checkPersonalDeck({ subject: "Direito", title: "a" })?.message, "Informe o assunto do deck.");
  assert.equal(checkPersonalDeck({ subject: "Direito", title: "a".repeat(161) })?.field, "title");
});

test("o registro de estudo recusa observação acima de 2000 e a matéria acima de 120", () => {
  const numeros = { minutes: 10, questions: 0, correctAnswers: 0 };
  assert.equal(checkStudyEntry({ ...numeros, note: "n".repeat(2000) }), null);
  const nota = checkStudyEntry({ ...numeros, note: "n".repeat(2001) });
  assert.equal(nota?.field, "note");
  assert.equal(nota?.message, "A observação pode ter até 2000 caracteres.");
  assert.equal(checkStudyEntry({ ...numeros, manualLesson: "a".repeat(201) })?.field, "manualLesson");

  const extra = { subject: "a".repeat(121), date: "2026-09-10", ...numeros };
  const materia = checkExtraStudy(extra, "2026-09-01", "2026-09-14");
  assert.equal(materia?.field, "subject");
  assert.equal(materia?.message, "A matéria pode ter até 120 caracteres.");
  assert.equal(checkExtraStudy({ ...extra, subject: "Direito", note: "n".repeat(2001) }, "2026-09-01", "2026-09-14")?.field, "note");
});

test("as três recusas de nome repetido são conflito, com a frase e o campo", () => {
  assert.deepEqual(PLAN_NAME_TAKEN, {
    code: "conflict",
    message: "Este aluno já tem um planejamento com esse nome.",
    field: "name",
  });
  assert.deepEqual(CLASS_NAME_TAKEN, {
    code: "conflict",
    message: "Você já tem uma turma com esse nome.",
    field: "name",
  });
  assert.deepEqual(DECK_TAKEN, {
    code: "conflict",
    message: "Você já tem um deck com essa disciplina e esse assunto.",
    field: "title",
  });
});
