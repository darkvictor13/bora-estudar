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

import { fixturesApi as api, resetFixtures, setFixtureRole } from "./fixtures.ts";
import { FIXTURE_STATUS_NOTICES } from "./fixtures-library.ts";

beforeEach(() => {
  resetFixtures();
});

test("calendário de constância usa os dias com registro de estudo", async () => {
  assert.deepEqual(await api.loadStudyDays(2026), ["2026-09-14"]);
  assert.deepEqual(await api.loadStudyDays(2025), []);
});

/** Toda escrita precisa de uma chave, e ela é gerada uma vez, na origem. */
let counter = 0;
const requestId = () => `req-${(counter += 1)}`;

test("Informática V2 mantém nove decks e salva revisões por deck", async () => {
  const catalog = await api.loadLibraryFlashcardCatalog();
  const informatica = catalog.subjects.find((subject) => subject.id === "informatica")!;
  assert.equal(informatica.decks.length, 9);
  assert.equal(informatica.decks.reduce((sum, deck) => sum + deck.cardIds.length, 0), 1175);
  const [first, second] = informatica.decks;
  assert.ok(first && second);
  const firstCard = first.cardIds[0];
  assert.ok(firstCard);
  const invalid = await api.gradeLibraryFlashcard({ deckId: second.id, cardId: firstCard, grade: "good", requestId: requestId() });
  assert.equal(invalid.ok, false);
  const graded = await api.gradeLibraryFlashcard({ deckId: first.id, cardId: firstCard, grade: "good", requestId: requestId() });
  assert.ok(graded.ok);
  assert.equal(graded.data.reviewCount, 1);
  assert.equal((await api.loadLibraryFlashcardReviews([first.id])).length, 1);
  assert.equal((await api.loadLibraryFlashcardReviews([second.id])).length, 0);
});

test("cada uma das 14 matérias aceita avaliação sem misturar o histórico", async () => {
  const catalog = await api.loadLibraryFlashcardCatalog();
  assert.equal(catalog.subjects.length, 14);
  for (const subject of catalog.subjects) {
    const deck = subject.decks[0]!;
    const card = { id: deck.cardIds[0]! };
    const result = await api.gradeLibraryFlashcard({ deckId: deck.id, cardId: card.id, grade: "again", requestId: requestId() });
    assert.ok(result.ok, subject.name);
    const reviews = await api.loadLibraryFlashcardReviews([deck.id]);
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0]?.cardId, card.id);
    assert.equal(reviews[0]?.state, "learning");
  }
});

// Spec 39, CA-06: o catálogo chega sem texto, e o texto chega por deck.
test("o catálogo traz ids e tópicos; o deck traz o texto, com o aviso editorial", async () => {
  const catalog = await api.loadLibraryFlashcardCatalog();
  const summary = catalog.subjects.flatMap((subject) => subject.decks).find((deck) => deck.id === "pf2029-informatica-01")!;
  assert.ok(summary.cardIds.length > 0 && summary.topics.length > 0);
  assert.equal("cards" in summary, false);
  const deck = await api.loadLibraryFlashcardDeck(summary.id);
  assert.ok(deck);
  assert.deepEqual(deck.cards.map((card) => card.id), summary.cardIds);
  assert.equal(deck.subject.name, "Informática");
  assert.equal(await api.loadLibraryFlashcardDeck("pf2029-nao-existe"), null);
  const notices = new Set(Object.values(FIXTURE_STATUS_NOTICES));
  const flagged = (await Promise.all(catalog.subjects.flatMap((subject) => subject.decks).map((item) => api.loadLibraryFlashcardDeck(item.id))))
    .flatMap((item) => item?.cards ?? []).filter((card) => card.notice !== null);
  assert.ok(flagged.length > 0);
  assert.ok(flagged.every((card) => notices.has(card.notice!)));
});

test("o catálogo traz os oito aliases da consolidação de Informática", async () => {
  const { aliases } = await api.loadLibraryFlashcardCatalog();
  assert.equal(aliases.length, 8);
});

test("deck pessoal cria cartões e revisões sem alterar a biblioteca editorial", async () => {
  const before = await api.listPersonalFlashcardDecks();
  const deckId = "a8000000-0000-4000-8000-000000000001";
  const cardId = "a8000000-0000-4000-8000-000000000002";
  const deck = await api.createPersonalFlashcardDeck({ id: deckId, subject: "Criminologia", title: "Meus erros", requestId: requestId() });
  assert.ok(deck.ok);
  const card = await api.createPersonalFlashcard({ id: cardId, deckId, topic: "Controle social", front: "Pergunta", back: "Resposta", requestId: requestId() });
  assert.ok(card.ok);
  const grade = await api.gradePersonalFlashcard({ deckId, cardId, grade: "good", requestId: requestId() });
  assert.ok(grade.ok);
  assert.equal((await api.listPersonalFlashcardDecks()).length, before.length + 1);
  assert.equal((await api.loadPersonalFlashcardReviews([deckId])).length, 1);
  const catalog = await api.loadLibraryFlashcardCatalog();
  assert.equal((await api.loadLibraryFlashcardReviews(catalog.subjects.flatMap((subject) => subject.decks.map((item) => item.id)))).length, 0);
});

test("piloto PMPR cria um catálogo único e mantém aulas novas em rascunho", async () => {
  const first = await api.ensurePmprPilotCatalog(requestId());
  const repeated = await api.ensurePmprPilotCatalog(requestId());
  assert.ok(first.ok && repeated.ok);
  assert.equal(first.data, repeated.data);

  const catalogs = (await api.listCatalogs()).filter((catalog) => catalog.key === "pmpr-soldado-2025");
  assert.equal(catalogs.length, 1);
  const rules = await api.loadSubjectRules(first.data);
  assert.equal(rules.length, 9);

  const key = requestId();
  const draft = await api.createDraftLesson(first.data, "Língua Portuguesa", "Interpretação de textos", key);
  const retried = await api.createDraftLesson(first.data, "Língua Portuguesa", "Interpretação de textos", key);
  assert.ok(draft.ok && retried.ok);
  assert.equal(draft.data.id, retried.data.id);
  assert.equal(draft.data.published, false);
  assert.equal((await api.loadCatalogLessons(first.data)).length, 1);
});

test("catálogo da turma libera aula publicada ao aluno matriculado e acompanha sua mudança de turma", async () => {
  const catalog = await api.ensurePmprPilotCatalog(requestId());
  assert.ok(catalog.ok);
  const classroom = await api.createClass({ name: "Soldado PMPR · Turma piloto" }, requestId());
  assert.ok(classroom.ok);

  const draft = await api.createDraftLesson(catalog.data, "Língua Portuguesa", "Interpretação de textos", requestId());
  assert.ok(draft.ok);
  assert.ok((await api.setClassTheoryCatalog(classroom.data.id, catalog.data)).ok);
  assert.ok((await api.moveStudent(classroom.data.id, "22222222-2222-4222-8222-222222222222")).ok);
  assert.equal((await api.loadTheoryControl("plano")).length, 0, "rascunho ainda não aparece");

  assert.ok((await api.saveLesson({ ...draft.data, published: true }, requestId())).ok);
  const subjects = await api.loadTheoryControl("plano");
  assert.equal(subjects[0]?.lessons[0]?.title, "Interpretação de textos");

  const originalClass = (await api.listClasses()).find((item) => item.name === "PRF 2027 · Turma A");
  assert.ok(originalClass);
  assert.ok((await api.moveStudent(originalClass.id, "22222222-2222-4222-8222-222222222222")).ok);
  assert.equal((await api.loadTheoryControl("plano")).some((item) => item.subject === "Língua Portuguesa"), false);
});

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

test("trocar de semana avança as datas e respeita o intervalo do seletor", async () => {
  const options = await api.listWeeks("plano");
  const week = await api.loadWeek("plano", 2);
  assert.equal(week.startsOn, options[1]?.startsOn);
  assert.equal(week.endsOn, options[1]?.endsOn);
  assert.equal(week.days[0]?.date, week.startsOn);
  assert.equal(week.days[6]?.date, week.endsOn);
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

test("professor vincula recursos à aula e o aluno encontra os mesmos links", async () => {
  const lesson = (await api.loadCatalogLessons("catalogo")).find((item) => item.lessonCode === "DC-02");
  assert.ok(lesson);
  const pdf = "https://fronteira.example/materiais/prf/aula-01.pdf";
  const saved = await api.saveLesson({
    ...lesson,
    materialBlocks: [{ title: "Organização do Estado", pdf, tecQuestions: "https://www.tecconcursos.com.br/questoes/123", qcQuestions: null }],
  }, requestId());
  assert.ok(saved.ok);
  const week = await api.loadWeek("plano", 1);
  const goal = week.days[0]!.goals[0]!;
  const theory = await api.loadTheoryGoal(goal.id);
  assert.equal(theory.lesson?.materialBlocks[0]?.pdf, pdf);
  assert.equal(theory.lesson?.materialBlocks[0]?.tecQuestions, "https://www.tecconcursos.com.br/questoes/123");
});

test("professor cadastra cartões por aula e a revisão do aluno não altera o desempenho de questões", async () => {
  const lesson = (await api.loadCatalogLessons("catalogo")).find((item) => item.lessonCode === "DC-02");
  assert.ok(lesson);
  const card = { id: "88888888-8888-4888-8888-000000000001", topic: "Organização do Estado", front: "Pergunta de teste", back: "Explicação de teste" };
  assert.ok((await api.saveLesson({ ...lesson, flashcardCards: [card] }, requestId())).ok);
  const studentLesson = (await api.loadTheoryControl("plano")).flatMap((subject) => subject.lessons).find((item) => item.id === lesson.id);
  assert.deepEqual(studentLesson?.flashcardCards, [card]);

  const before = (await api.loadWeek("plano", 1)).summary;
  const graded = await api.gradeFlashcard({ lessonId: lesson.id, cardId: card.id, grade: "good", requestId: requestId() });
  assert.ok(graded.ok);
  assert.equal(graded.data.reviewCount, 1);
  assert.equal((await api.loadFlashcardReviews(lesson.id))[0]?.cardId, card.id);
  assert.deepEqual((await api.loadFlashcardReviewsForLessons([lesson.id, "aula-inexistente"]))[0], graded.data);
  const after = (await api.loadWeek("plano", 1)).summary;
  assert.equal(after.questionsAnswered, before.questionsAnswered);
  assert.equal(after.correctAnswers, before.correctAnswers);
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
  const lesson = (await api.loadCatalogLessons("catalogo")).find((item) => item.lessonCode === "DC-02");
  assert.ok(lesson);
  assert.ok((await api.saveLesson({
    ...lesson,
    theoryStartPage: 3,
    theoryEndPage: 55,
    pdfTotalPages: 104,
    finalQuestionsStart: 56,
  }, requestId())).ok);
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

test("questões cumprem a meta de prática sem liberar a próxima aula", async () => {
  const week = await api.loadWeek("plano", 1);
  const goal = week.days[1]!.goals[0]!;
  assert.ok(goal.theory);

  const antes = await api.loadTheoryGoal(goal.id);
  assert.equal(antes.progress?.initialQuestionsComplete, false);

  await api.saveTheoryProgress({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    currentPage: 55,
    endSession: false,
  });

  // Uma questão a menos que o mínimo: prática ainda incompleta.
  await api.recordInitialQuestions({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    questions: 14,
    correctAnswers: 10,
  });
  const quase = await api.loadTheoryGoal(goal.id);
  assert.equal(quase.progress?.initialQuestionsComplete, false);
  assert.equal(quase.progress?.lessonDone, false);

  await api.recordInitialQuestions({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    questions: 1,
    correctAnswers: 1,
  });
  const concluido = await api.loadTheoryGoal(goal.id);
  assert.equal(concluido.lesson?.id, antes.lesson?.id, "questões não alteram a aula publicada");
  assert.equal(concluido.progress?.lessonDone, true, "questões atingiram a meta de prática");
});

test("acertos e erros registrados atualizam o desempenho diário e geral", async () => {
  const before = await api.loadStatistics({ studyPlanId: "plano", year: 2026 });
  const week = await api.loadWeek("plano", 1);
  const goal = week.days[1]!.goals[0]!;
  assert.ok(goal.theory);

  const saved = await api.recordInitialQuestions({
    goalId: goal.id,
    lessonId: goal.theory.lessonId,
    requestId: requestId(),
    questions: 10,
    correctAnswers: 7,
  });
  assert.ok(saved.ok);

  const after = await api.loadStatistics({ studyPlanId: "plano", year: 2026 });
  assert.equal(after.questionsAnswered, before.questionsAnswered + 10);
  assert.equal(after.correctAnswers, before.correctAnswers + 7);
  assert.ok(after.dailyQuestions.some((day) => day.questions === 10 && day.correctAnswers === 7 && day.wrongAnswers === 3));
});

test("aula sem páginas mapeadas continua disponível para estudo e questões", async () => {
  const week = await api.loadWeek("plano", 1);
  // Quinta: Informática, cujo material ainda não tem páginas conferidas.
  const goal = week.days[3]!.goals[0]!;

  const theory = await api.loadTheoryGoal(goal.id);
  assert.equal(theory.diagnosis.kind, "ok");
  assert.equal(theory.lesson?.theoryEndPage, null);
  assert.ok(theory.progress);
});

test("professor controla a publicação sem depender das questões do aluno", async () => {
  const lessons = await api.loadCatalogLessons("catalogo");
  const second = lessons.find((lesson) => lesson.lessonCode === "DC-02");
  assert.ok(second);
  const week = await api.loadWeek("plano", 1);
  const goal = week.days[1]!.goals[0]!;
  assert.equal((await api.loadTheoryGoal(goal.id)).lesson?.id, second.id);

  assert.ok((await api.saveLesson({ ...second, published: false }, requestId())).ok);
  assert.equal((await api.loadTheoryGoal(goal.id)).lesson?.lessonCode, "DC-01");
  assert.ok((await api.saveLesson({ ...second, published: true }, requestId())).ok);
  assert.equal((await api.loadTheoryGoal(goal.id)).lesson?.id, second.id);
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
    "Informática",
    "Tecnologia da Informação",
  ]);
});

/* ------------------------------------------------------------------ *
 * Vínculo, acesso e turmas — spec 13
 * ------------------------------------------------------------------ */

test("a busca é pelo e-mail INTEIRO: prefixo não acha ninguém", async () => {
  const pedaco = await api.findStudentByEmail("candidata");
  assert.ok(!pedaco.ok, "sem `@`, é erro de formulário e não busca vazia");
  assert.equal(pedaco.error.code, "validation");
  assert.equal(pedaco.error.field, "email");

  // Um e-mail bem formado que não é de ninguém: `ok` com `null`. A tela precisa
  // separar "você digitou errado" de "esta pessoa não tem conta".
  const ninguem = await api.findStudentByEmail("nao.existe@exemplo.com.br");
  assert.ok(ninguem.ok);
  assert.equal(ninguem.data, null);

  const achada = await api.findStudentByEmail("  CANDIDATA@Exemplo.com.BR ");
  assert.ok(achada.ok, "espaço e caixa não fazem parte do endereço");
  assert.equal(achada.data?.hasTeacher, false);
  assert.equal(achada.data?.isMine, false);
});

test("quem já tem professor é ENCONTRADO, e a busca não diz de quem ele é", async () => {
  const alheio = await api.findStudentByEmail("de.outro@exemplo.com.br");
  assert.ok(alheio.ok);
  assert.equal(alheio.data?.hasTeacher, true);
  assert.equal(alheio.data?.isMine, false);

  // Dizer "não existe" faria a tela mentir para quem digitou o e-mail certo.
  assert.ok(alheio.data !== null);
  assert.equal(
    Object.hasOwn(alheio.data!, "teacherId"),
    false,
    "qual professor não vem: revelar seria um mapa de quem é aluno de quem",
  );

  const recusado = await api.linkStudent(alheio.data!.studentId);
  assert.ok(!recusado.ok);
  assert.equal(recusado.error.code, "conflict");
});

test("assumir cria o vínculo, e assumir de novo não é erro", async () => {
  const achada = await api.findStudentByEmail("candidata@exemplo.com.br");
  assert.ok(achada.ok);
  const studentId = achada.data!.studentId;

  const primeira = await api.linkStudent(studentId);
  assert.ok(primeira.ok);

  const lista = await api.listStudents({});
  assert.equal(lista.length, 4);
  const nova = lista.find((student) => student.studentId === studentId);
  // VINCULAR NÃO LIBERA ACESSO: são dois atos, e o aluno vinculado sem acesso
  // continua vendo a lista de espera.
  assert.equal(nova?.access, "pending");
  assert.equal(nova?.classId, null);

  // Duplo clique: o mesmo vínculo, sem segunda escrita e sem erro na tela.
  const segunda = await api.linkStudent(studentId);
  assert.ok(segunda.ok);
  assert.equal((await api.listStudents({})).length, 4);

  // E agora a busca a reconhece como sua.
  const denovo = await api.findStudentByEmail("candidata@exemplo.com.br");
  assert.ok(denovo.ok);
  assert.equal(denovo.data?.isMine, true);
});

test("liberar SOMA ao que ainda falta, e o mesmo request_id não soma duas vezes", async () => {
  const [aluna] = await api.listStudents({ access: "active" });
  const antes = aluna!.accessExpiresAt!;

  const chave = requestId();
  const primeira = await api.grantAccess({ studentId: aluna!.studentId, requestId: chave, months: 3 });
  assert.ok(primeira.ok);
  assert.ok(primeira.data.accessExpiresAt! > antes, "quem renova antes do fim não perde dia pago");

  const repetida = await api.grantAccess({ studentId: aluna!.studentId, requestId: chave, months: 3 });
  assert.ok(repetida.ok);
  assert.equal(repetida.data.accessExpiresAt, primeira.data.accessExpiresAt);

  // E a lista enxerga a mudança: um `Result` que não muta esconde revalidação
  // que não roda.
  const relida = (await api.listStudents({})).find(
    (student) => student.studentId === aluna!.studentId,
  );
  assert.equal(relida?.accessExpiresAt, primeira.data.accessExpiresAt);
});

test("a vigência é de 1, 3, 6 ou 12 meses — o resto é recusado", async () => {
  const [aluna] = await api.listStudents({});
  const recusada = await api.grantAccess({
    studentId: aluna!.studentId,
    requestId: requestId(),
    months: 5,
  });

  assert.ok(!recusada.ok);
  assert.equal(recusada.error.code, "validation");
  assert.equal(recusada.error.field, "months");
});

test("bloquear PRESERVA a vigência", async () => {
  const [aluna] = await api.listStudents({ access: "active" });
  const validade = aluna!.accessExpiresAt;

  const bloqueada = await api.revokeAccess(aluna!.studentId, requestId());
  assert.ok(bloqueada.ok);
  assert.equal(bloqueada.data.access, "suspended");
  // Apagar a data obrigaria a redigitá-la para reativar, e apagaria o registro
  // de até quando o acesso valia.
  assert.equal(bloqueada.data.accessExpiresAt, validade);
});

test("um aluno está em UMA turma, e mover é uma operação própria", async () => {
  const turmas = await api.listClasses();
  const [turmaA, turmaB] = turmas;
  assert.equal(turmaA!.studentCount, 2);
  assert.equal(turmaB!.studentCount, 0);

  const [semTurma] = await api.listStudents({ pace: "behind" });
  assert.equal(semTurma!.classId, null);

  assert.ok((await api.enrollStudent(turmaB!.id, semTurma!.studentId)).ok);

  // Matricular de novo é recusado: no banco quem recusa é o índice único.
  const denovo = await api.enrollStudent(turmaA!.id, semTurma!.studentId);
  assert.ok(!denovo.ok);
  assert.equal(denovo.error.code, "conflict");

  assert.ok((await api.moveStudent(turmaA!.id, semTurma!.studentId)).ok);
  const depois = (await api.listStudents({})).find(
    (student) => student.studentId === semTurma!.studentId,
  );
  assert.equal(depois?.classId, turmaA!.id);
  assert.equal(depois?.className, turmaA!.name);

  assert.equal((await api.listStudents({ classId: turmaA!.id })).length, 3);
  assert.equal((await api.listStudents({ classId: turmaB!.id })).length, 0);
});

test("apagar turma com aluno dentro é recusado; esvaziar e apagar funciona", async () => {
  const [turmaA] = await api.listClasses();

  const cheia = await api.deleteClass(turmaA!.id, requestId());
  assert.ok(!cheia.ok);
  assert.equal(cheia.error.code, "conflict");

  for (const student of await api.listStudents({ classId: turmaA!.id })) {
    assert.ok((await api.unenrollStudent(student.studentId)).ok);
  }

  assert.ok((await api.deleteClass(turmaA!.id, requestId())).ok);
  assert.equal((await api.listClasses()).length, 1);
});

test("renomear a turma aparece também na linha do aluno", async () => {
  const [turmaA] = await api.listClasses();

  const curto = await api.renameClass(turmaA!.id, { name: "Tu" }, requestId());
  assert.ok(!curto.ok);
  assert.equal(curto.error.field, "name");

  const salvo = await api.renameClass(turmaA!.id, { name: "Fiscal 2028" }, requestId());
  assert.ok(salvo.ok);
  assert.equal(salvo.data.studentCount, 2);

  const alunos = await api.listStudents({ classId: turmaA!.id });
  assert.deepEqual(new Set(alunos.map((student) => student.className)), new Set(["Fiscal 2028"]));
});

test("simulado: o professor vê os nomes, o aluno só o próprio e 'Colega'", async () => {
  setFixtureRole("teacher");
  const [exam] = await api.listMockExams();
  assert.ok(exam);
  const teacherView = await api.loadMockExamScores(exam.id);
  assert.ok(teacherView.results.length >= 2, "o cenário precisa de dois alunos na turma");
  const names = teacherView.results.map((row) => row.studentName);

  setFixtureRole("student");
  const studentView = await api.loadMockExamScores(exam.id);
  const own = studentView.results.filter((row) => row.studentName !== "Colega");
  assert.equal(own.length, 1, "só a própria linha tem nome");
  const others = new Set(teacherView.results.map((row) => row.studentId));
  const text = JSON.stringify(studentView);
  for (const name of names.filter((name) => name !== own[0]?.studentName)) assert.ok(!text.includes(name), `vazou ${name}`);
  for (const id of others) if (id !== own[0]?.studentId) assert.ok(!text.includes(id), `vazou o id ${id}`);
  assert.equal(studentView.results.length, teacherView.results.filter((row) => row.score !== null).length);
});

// Spec 40, CA-09: o contrato do Vade Mecum.
test("a biblioteca de leis traz 15 leis em 4 matérias, e o texto por lei", async () => {
  const library = await api.loadLawLibrary();
  assert.equal(library.laws.length, 15);
  assert.deepEqual(library.subjects, ["Legislação Penal Especial", "Direitos Humanos e Proteção", "Direito Processual Penal", "Direito Administrativo e Transparência"]);
  const drugs = library.laws.find((law) => law.id === "ld")!;
  assert.equal(drugs.canonicalId, "BR-FED-LEI-11343-2006");
  const document = await api.loadLawDocument("ld");
  assert.equal(document?.articles.length, drugs.articleCount);
  assert.equal(await api.loadLawDocument("nao-existe"), null);
});

test("os mapas de edital dizem quais normas têm texto na biblioteca", async () => {
  const { maps } = await api.loadExamMaps();
  assert.deepEqual(maps.map((map) => map.shortName), ["PMPR", "PPPR", "PRF"]);
  const library = new Set((await api.loadLawLibrary()).laws.map((law) => law.id));
  for (const item of maps.flatMap((map) => map.sections.flatMap((section) => section.items))) {
    assert.equal(item.available, item.libraryId !== null);
    if (item.libraryId) assert.ok(library.has(item.libraryId), item.libraryId);
  }
});

test("as marcações gravam a diferença, e repetir a mesma chave não muda nada", async () => {
  const mark = { id: "a9000000-0000-4000-8000-000000000001", articleId: "lai-art-1", paragraphIndex: 0, start: 8, end: 16, style: "highlight", color: "yellow", quote: "Esta Lei", prefix: "Art. 1º ", suffix: " dispõe sobre" } as const;
  const first = requestId();
  assert.ok((await api.saveLawMarks({ lawId: "lai", previous: [], next: [mark], requestId: first })).ok);
  assert.ok((await api.saveLawMarks({ lawId: "lai", previous: [], next: [mark], requestId: first })).ok);
  assert.deepEqual(await api.loadLawMarks("lai"), [mark]);
  const recolored = { ...mark, color: "mint" } as const;
  assert.ok((await api.saveLawMarks({ lawId: "lai", previous: [mark], next: [recolored], requestId: requestId() })).ok);
  assert.deepEqual((await api.loadLawMarks("lai")).map((item) => item.color), ["mint"]);
  assert.ok((await api.saveLawMarks({ lawId: "lai", previous: [recolored], next: [], requestId: requestId() })).ok);
  assert.deepEqual(await api.loadLawMarks("lai"), []);
  assert.deepEqual(await api.loadLawMarks("ld"), []);
});

// Spec 42, CA-08: o grifo nos flashcards grava a diferença, por deck.
test("as marcações de cartão gravam a diferença, e repetir a mesma chave não muda nada", async () => {
  const deck = { kind: "personal", deckId: "d1000000-0000-4000-8000-000000000001" } as const;
  const mark = {
    id: "a9100000-0000-4000-8000-000000000001", card: { ...deck, cardId: "d2000000-0000-4000-8000-000000000001" },
    side: "back", start: 0, end: 8, style: "highlight", color: "yellow", quote: "Dez dias", prefix: "", suffix: ", se preso.",
  } as const;
  const first = requestId();
  assert.ok((await api.saveFlashcardMarks({ deck, previous: [], next: [mark], requestId: first })).ok);
  assert.ok((await api.saveFlashcardMarks({ deck, previous: [], next: [mark], requestId: first })).ok);
  assert.deepEqual(await api.loadFlashcardMarks(deck), [mark]);
  const recolored = { ...mark, color: "mint" } as const;
  assert.ok((await api.saveFlashcardMarks({ deck, previous: [mark], next: [recolored], requestId: requestId() })).ok);
  assert.deepEqual((await api.loadFlashcardMarks(deck)).map((item) => item.color), ["mint"]);
  // O mesmo id de deck em outro tipo de cartão é outro deck.
  assert.deepEqual(await api.loadFlashcardMarks({ ...deck, kind: "lesson" }), []);
  assert.ok((await api.saveFlashcardMarks({ deck, previous: [recolored], next: [], requestId: requestId() })).ok);
  assert.deepEqual(await api.loadFlashcardMarks(deck), []);
});

// Spec 42, CA-07: lê o alias do catálogo, para valer com qualquer amostra.
test("a marcação do cartão antigo da biblioteca aparece no deck do cartão que o substituiu", async () => {
  const [alias] = (await api.loadLibraryFlashcardCatalog()).aliases;
  assert.ok(alias, "a biblioteca da fixture precisa de ao menos um alias");
  const oldDeck = { kind: "library", deckId: alias.oldDeckId } as const;
  const mark = {
    id: "a9100000-0000-4000-8000-000000000002", card: { ...oldDeck, cardId: alias.oldCardId },
    side: "front", start: 0, end: 1, style: "underline", color: "blue", quote: "x", prefix: "", suffix: "",
  } as const;
  assert.ok((await api.saveFlashcardMarks({ deck: oldDeck, previous: [], next: [mark], requestId: requestId() })).ok);
  const shown = await api.loadFlashcardMarks({ kind: "library", deckId: alias.deckId });
  assert.deepEqual(shown.map((item) => [item.id, item.card.deckId, item.card.cardId]), [[mark.id, alias.deckId, alias.cardId]]);
  // Alterar a marcação resolvida não a desamarra do par gravado.
  const recolored = { ...shown[0]!, color: "pink" } as const;
  assert.ok((await api.saveFlashcardMarks({ deck: { kind: "library", deckId: alias.deckId }, previous: shown, next: [recolored], requestId: requestId() })).ok);
  assert.deepEqual((await api.loadFlashcardMarks({ kind: "library", deckId: alias.deckId })).map((item) => item.color), ["pink"]);
});
