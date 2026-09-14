/**
 * O que estes testes seguram não é a fixture: é o CONTRATO.
 *
 * Cada asserção aqui é uma promessa que o adaptador do Supabase vai ter de
 * cumprir igual, e por isso a suíte é a especificação executável do que
 * `lib/api` significa. Quando a frente do banco entregar, rodar estes mesmos
 * casos contra a outra implementação diz se ela chegou compatível.
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { fixturesApi as api, resetFixtures } from "./fixtures.ts";

beforeEach(() => {
  resetFixtures();
});

/** Toda escrita precisa de uma chave, e ela é gerada uma vez, na origem. */
let counter = 0;
const requestId = () => `req-${(counter += 1)}`;

test("a semana chega agrupada por dia e ordenada dentro do dia", async () => {
  const week = await api.loadWeek("plano", 1);

  assert.equal(week.days.length, 7, "os sete dias vêm sempre, inclusive os vazios");
  assert.deepEqual(
    week.days.map((day) => day.weekday),
    [1, 2, 3, 4, 5, 6, 7],
  );

  const monday = week.days[0]!;
  assert.deepEqual(
    monday.goals.map((goal) => goal.dayPosition),
    [1, 2],
  );
});

test("o resumo da semana soma os registros, não as metas", async () => {
  const week = await api.loadWeek("plano", 1);

  // Só a meta de teoria concluída tem registro: 95 min, 18 questões, 14 acertos.
  assert.equal(week.summary.studiedMinutes, 95);
  assert.equal(week.summary.questionsAnswered, 18);
  assert.equal(week.summary.correctAnswers, 14);
  assert.equal(week.summary.score, 77.8);
  assert.equal(week.summary.goalsCompleted, 1);
});

test("registrar estudo NÃO conclui a meta", async () => {
  const before = await api.loadWeek("plano", 1);
  const pending = before.days[1]!.goals[0]!;
  assert.equal(pending.status, "pending");

  const saved = await api.recordStudy({
    goalId: pending.id,
    requestId: requestId(),
    minutes: 40,
    questions: 10,
    correctAnswers: 9,
  });

  assert.ok(saved.ok);
  assert.equal(saved.data.status, "in_progress", "sai de pendente, mas não conclui");
  assert.equal(saved.data.spentMinutes, 40);
  assert.equal(saved.data.entries.length, 1);
});

test("a leitura seguinte enxerga a escrita anterior", async () => {
  const before = await api.loadWeek("plano", 1);
  const target = before.days[1]!.goals[0]!;

  await api.recordStudy({
    goalId: target.id,
    requestId: requestId(),
    minutes: 40,
    questions: 10,
    correctAnswers: 9,
  });

  const after = await api.loadWeek("plano", 1);
  assert.equal(after.days[1]!.goals[0]!.spentMinutes, 40);
  assert.equal(after.summary.studiedMinutes, 135, "o resumo acompanha");
});

test("acertos acima do total de questões são recusados, com o campo", async () => {
  const week = await api.loadWeek("plano", 1);
  const target = week.days[1]!.goals[0]!;

  const refused = await api.recordStudy({
    goalId: target.id,
    requestId: requestId(),
    minutes: 10,
    questions: 5,
    correctAnswers: 9,
  });

  assert.ok(!refused.ok);
  assert.equal(refused.error.code, "validation");
  assert.equal(refused.error.field, "correctAnswers");
});

test("a mesma chave de retentativa não grava duas vezes", async () => {
  const week = await api.loadWeek("plano", 1);
  const target = week.days[1]!.goals[0]!;
  const key = requestId();

  const first = await api.recordStudy({
    goalId: target.id,
    requestId: key,
    minutes: 30,
    questions: 6,
    correctAnswers: 6,
  });
  const second = await api.recordStudy({
    goalId: target.id,
    requestId: key,
    minutes: 30,
    questions: 6,
    correctAnswers: 6,
  });

  assert.ok(first.ok);
  assert.ok(second.ok);
  assert.equal(second.data.entries.length, 1, "duas chamadas, um registro");
  assert.equal(second.data.spentMinutes, 30);
});

test("concluir duas vezes devolve conflito, não um segundo sucesso", async () => {
  const week = await api.loadWeek("plano", 1);
  const target = week.days[1]!.goals[0]!;

  const first = await api.completeGoal(target.id, requestId());
  assert.ok(first.ok);
  assert.equal(first.data.status, "completed");

  const second = await api.completeGoal(target.id, requestId());
  assert.ok(!second.ok);
  assert.equal(second.error.code, "conflict");
});

test("desfazer a conclusão devolve a meta ao estado que os registros justificam", async () => {
  const week = await api.loadWeek("plano", 1);
  const semRegistro = week.days[1]!.goals[0]!;

  await api.completeGoal(semRegistro.id, requestId());
  const reopened = await api.reopenGoal(semRegistro.id, requestId());
  assert.ok(reopened.ok);
  assert.equal(reopened.data.status, "pending", "sem registro, volta a pendente");

  const comRegistro = week.days[0]!.goals[0]!;
  const voltou = await api.reopenGoal(comRegistro.id, requestId());
  assert.ok(voltou.ok);
  assert.equal(voltou.data.status, "in_progress", "com registro, volta a em andamento");
  assert.equal(voltou.data.completedAt, null);
});

test("estudo extra cria a meta e o registro numa operação só", async () => {
  const antes = await api.loadWeek("plano", 1);

  const extra = await api.recordExtraStudy({
    studyPlanId: "plano",
    requestId: requestId(),
    kind: "anki",
    subject: "Português",
    date: "2026-09-16",
    minutes: 25,
    questions: 40,
    correctAnswers: 33,
  });

  assert.ok(extra.ok);
  assert.equal(extra.data.type, "extra");
  assert.equal(extra.data.title, "Anki");
  assert.equal(extra.data.status, "completed");
  assert.equal(extra.data.questionsAnswered, 40);

  const depois = await api.loadWeek("plano", 1);
  assert.equal(depois.summary.goalsTotal, antes.summary.goalsTotal + 1);
});

test("encerrar a sessão de teoria NÃO conclui a aula", async () => {
  const week = await api.loadWeek("plano", 1);
  // Terça: a aula de teoria que ainda não tem questões iniciais.
  const goal = week.days[1]!.goals[0]!;
  assert.ok(goal.theory);

  const saved = await api.saveTheoryProgress({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    currentPage: 55, // a última página de teoria da aula
    endSession: true,
  });

  assert.ok(saved.ok);
  assert.equal(saved.data.theoryDone, true, "o PDF acabou");
  assert.equal(saved.data.lessonDone, false, "mas a aula não, sem as questões iniciais");
});

test("a próxima aula só libera depois do mínimo de questões iniciais", async () => {
  const week = await api.loadWeek("plano", 1);
  const goal = week.days[1]!.goals[0]!;
  assert.ok(goal.theory);

  const antes = await api.loadTheoryGoal(goal.id);
  assert.equal(antes.nextLessonUnlocked, false);

  await api.saveTheoryProgress({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    currentPage: 55,
    endSession: false,
  });

  // Uma questão a menos que o mínimo: ainda trancado.
  await api.recordInitialQuestions({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    questions: 14,
    correctAnswers: 10,
  });
  const quase = await api.loadTheoryGoal(goal.id);
  assert.equal(quase.nextLessonUnlocked, false);
  assert.equal(quase.progress?.lessonDone, false);

  await api.recordInitialQuestions({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    questions: 1,
    correctAnswers: 1,
  });
  const liberado = await api.loadTheoryGoal(goal.id);
  assert.equal(liberado.nextLessonUnlocked, true);
  assert.equal(liberado.progress?.lessonDone, true, "teoria lida E questões iniciais");
});

test("disciplina fora do catálogo auditado recebe diagnóstico, não página inventada", async () => {
  const week = await api.loadWeek("plano", 1);
  // Quinta: Matemática Financeira, que a auditoria da v108.5 deixou de fora.
  const goal = week.days[3]!.goals[0]!;

  const theory = await api.loadTheoryGoal(goal.id);
  assert.equal(theory.diagnosis.kind, "subject_not_audited");
  assert.equal(theory.lesson, null, "sem aula, porque não há página confiável");
  assert.equal(theory.progress, null);
});

test("gerar semana no modo seguro preserva o que já foi concluído", async () => {
  const antes = await api.loadWeek("plano", 1);
  const concluidas = antes.days
    .flatMap((day) => day.goals)
    .filter((goal) => goal.status === "completed");
  assert.equal(concluidas.length, 1);

  const previa = await api.previewWeek({
    studyPlanId: "plano",
    requestId: requestId(),
    weekNumber: 1,
    mode: "safe",
  });
  assert.equal(previa.goalsPreserved, 1);

  const gerada = await api.generateWeek({
    studyPlanId: "plano",
    requestId: requestId(),
    weekNumber: 1,
    mode: "safe",
  });
  assert.ok(gerada.ok);

  const sobreviveu = gerada.data.days
    .flatMap((day) => day.goals)
    .find((goal) => goal.id === concluidas[0]!.id);
  assert.ok(sobreviveu, "a meta concluída continua lá, com o id dela");
  assert.equal(sobreviveu.spentMinutes, 95, "e com os registros dela");
});

test("replanejar a semana inteira é o caminho que apaga a concluída", async () => {
  const antes = await api.loadWeek("plano", 1);
  const concluida = antes.days.flatMap((day) => day.goals).find((g) => g.status === "completed")!;

  const previa = await api.previewWeek({
    studyPlanId: "plano",
    requestId: requestId(),
    weekNumber: 1,
    mode: "full",
  });
  assert.equal(previa.goalsPreserved, 0, "a prévia avisa antes de qualquer escrita");

  const gerada = await api.generateWeek({
    studyPlanId: "plano",
    requestId: requestId(),
    weekNumber: 1,
    mode: "full",
  });
  assert.ok(gerada.ok);
  assert.equal(
    gerada.data.days.flatMap((day) => day.goals).find((goal) => goal.id === concluida.id),
    undefined,
  );
});

test("o tema começa sem escolha, e a ausência não é o mesmo que claro", async () => {
  assert.equal(await api.loadThemePreference(), null);

  const saved = await api.saveThemePreference("dark");
  assert.ok(saved.ok);
  assert.equal(await api.loadThemePreference(), "dark");
});

test("sair esquece o tema da conta", async () => {
  await api.saveThemePreference("dark");
  await api.signOut();

  assert.equal(await api.loadSession(), null);
  assert.equal(await api.loadThemePreference(), null);
});

test("cupom inválido é recusado e não libera acesso", async () => {
  const refused = await api.redeemCoupon("NAOEXISTE");
  assert.ok(!refused.ok);
  assert.equal(refused.error.code, "not_found");
  assert.equal(refused.error.field, "code");

  const accepted = await api.redeemCoupon("bora3");
  assert.ok(accepted.ok);
  assert.equal(accepted.data.access, "active");
});

test("a busca de alunos casa nome e e-mail, e os filtros se somam", async () => {
  assert.equal((await api.listStudents({})).length, 3);
  assert.equal((await api.listStudents({ search: "atrasado" })).length, 1);
  assert.equal((await api.listStudents({ search: "EXEMPLO.COM" })).length, 3);
  assert.equal((await api.listStudents({ pace: "attention" })).length, 1);
  assert.equal((await api.listStudents({ pace: "behind", access: "active" })).length, 0);
});

test("anular bateria exige motivo", async () => {
  const semMotivo = await api.voidQuizSession({
    sessionId: "88888888-8888-4888-8888-000000000001",
    requestId: requestId(),
    reason: "   ",
  });
  assert.ok(!semMotivo.ok);
  assert.equal(semMotivo.error.code, "validation");

  const comMotivo = await api.voidQuizSession({
    sessionId: "88888888-8888-4888-8888-000000000001",
    requestId: requestId(),
    reason: "Questões repetidas.",
  });
  assert.ok(comMotivo.ok);
  assert.equal(comMotivo.data.status, "voided");
  assert.equal(comMotivo.data.score, null, "bateria anulada sai do desempenho");
});

test("remover caderno marca, não apaga — e restaurar traz de volta", async () => {
  const blockId = "99999999-9999-4999-8999-000000000001";

  const removed = await api.deleteNotebook(blockId, requestId());
  assert.ok(removed.ok);
  assert.equal(removed.data.deleted, true);
  assert.equal(removed.data.active, false);

  const restored = await api.restoreNotebook(blockId, requestId());
  assert.ok(restored.ok);
  assert.equal(restored.data.deleted, false);
});

test("importar o MASTER relata as disciplinas que ficaram sem página", async () => {
  const imported = await api.importMaster({
    catalogId: "catalogo",
    requestId: requestId(),
    master: {},
  });

  assert.ok(imported.ok);
  assert.deepEqual(imported.data.subjectsWithoutPages, [
    "Matemática Financeira",
    "Tecnologia da Informação",
  ]);
});
