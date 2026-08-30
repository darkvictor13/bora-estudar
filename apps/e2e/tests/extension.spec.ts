/**
 * §3 do `docs/fluxos-e2e.md` pelo lado da EXTENSÃO, num Chromium com ela
 * instalada e o domínio do TEC interceptado.
 *
 * Nenhuma requisição sai para tecconcursos.com.br. A página é a mínima que
 * `tec-page.ts` sabe ler, e o resultado é revelado alternando `display` — que é
 * o que dispara `detectOutcome()`, porque a detecção é por visibilidade e não
 * por presença.
 *
 * A maior parte dos testes injeta o payload direto no fragmento, com
 * `mainTarget` 3: a extensão só consome o protocolo, e responder 3 questões em
 * vez de 15 corta o tempo sem trocar nenhum caminho de código. O último teste
 * do arquivo é a volta completa de verdade — site → extensão → site.
 */
import { expect, test } from "../fixtures/extension.ts";
import { pickQuestions } from "../../extension/src/content/engine.ts";
import {
  readResultPayload,
  startUrlFor,
  syntheticStart,
} from "../fixtures/quiz.ts";
import { MAIN_TARGET, goalStatus, ledgerCount, openSessionOf } from "../fixtures/scenario.ts";
import { count } from "../fixtures/db.ts";
import { questionUrl } from "../fixtures/tec.ts";
import { STUDENT_RETURN_URL } from "../support/app.ts";

const PANEL = "#bora-panel";

/** Espera o painel aparecer: o content script roda em `document_idle`. */
async function waitForPanel(page: import("@playwright/test").Page) {
  await expect(page.locator(PANEL)).toBeVisible({ timeout: 15_000 });
}

test.describe("F-BAT-03/05 · importar a bateria e desenhar o painel", () => {
  test("persiste a sessão, limpa a hash e vai para a primeira da fila", async ({ extPage }) => {
    const start = syntheticStart();
    const queue = pickQuestions(start);

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);

    // Ao abrir, a extensão navega para a primeira pendente da fila.
    await expect(extPage).toHaveURL(questionUrl(queue[0]!.id));

    // A hash foi consumida. Ela era a única cópia do payload nesta aba, então
    // ter sido limpa só é aceitável porque a sessão já está no storage — o que
    // o recarregamento abaixo comprova: sem hash nenhuma, o painel volta com a
    // mesma bateria e a mesma fila.
    expect(extPage.url()).not.toContain("boraQuizStart");

    const panel = extPage.locator(PANEL);
    await expect(panel).toContainText("Bateria 1");
    await expect(panel).toContainText(`0 de ${start.mainTarget} respondidas`);

    await extPage.reload();
    await waitForPanel(extPage);
    await expect(extPage.locator(PANEL)).toContainText(`0 de ${start.mainTarget} respondidas`);
  });

  test("payload em formato desconhecido mostra erro acionável", async ({ extPage }) => {
    const envelope = Buffer.from(
      JSON.stringify({ protocol: 99, kind: "quiz.start", body: {} }),
    ).toString("base64url");

    await extPage.goto(`https://www.tecconcursos.com.br/questoes#boraQuizStart=${envelope}`);
    await waitForPanel(extPage);

    await expect(extPage.locator(PANEL)).toContainText(
      "Atualize a extensão: o site enviou uma bateria em formato mais novo.",
    );
  });

  test("histórico incompleto é avisado no painel", async ({ extPage }) => {
    await extPage.goto(startUrlFor(syntheticStart({ historyComplete: false })));
    await waitForPanel(extPage);

    await expect(extPage.locator(PANEL)).toContainText(
      "Histórico incompleto: pode repetir questão.",
    );
  });
});

test.describe("F-BAT-06 · registrar as respostas", () => {
  test("cada resposta entra na contagem e a fila avança", async ({ extPage, tec }) => {
    const start = syntheticStart();
    const queue = pickQuestions(start);

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);

    // Desde a spec 21 cada ERRO acrescenta uma correlata ao fim da fila, então
    // o total cresce enquanto se responde. Aqui: 1 certa e 2 erradas nas
    // principais → mais 2 correlatas, total 5.
    for (const [index, item] of queue.entries()) {
      await expect(extPage).toHaveURL(questionUrl(item.id));

      await tec.answer(extPage, index === 0 ? "correct" : "incorrect");
      const erros = Math.max(0, index);
      await expect(extPage.locator(PANEL)).toContainText(
        `${index + 1} de ${queue.length + erros} respondidas`,
      );

      await extPage.locator(PANEL).getByRole("button", { name: "Ir para a próxima" }).click();
      await waitForPanel(extPage);
    }

    const panel = extPage.locator(PANEL);
    await expect(panel).toContainText("1 acertos · 2 erros");
    await expect(panel).toContainText("3 principais · 0 reforços · 0 extras");

    // As duas correlatas, e só então a fila fecha.
    for (let index = 0; index < 2; index += 1) {
      await tec.answer(extPage, "correct");
      if (index < 1) {
        await panel.getByRole("button", { name: "Ir para a próxima" }).click();
        await waitForPanel(extPage);
      }
    }

    await expect(panel).toContainText("5 de 5 respondidas");
    await expect(panel.getByRole("button", { name: "Finalizar e enviar" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ir para a próxima" })).toHaveCount(0);
  });

  test("F-BAT-07 · resultado já na tela não conta antes do primeiro clique", async ({
    extPage,
    tec,
  }) => {
    const start = syntheticStart();
    const queue = pickQuestions(start);

    // O TEC mostra o resultado na carga quando o aluno já resolveu a questão
    // antes, FORA desta bateria. Sem a guarda de abertura, esse resultado
    // antigo seria registrado como se tivesse acabado de acontecer.
    tec.preAnswer(queue[0]!.id, "correct");

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await expect(extPage).toHaveURL(questionUrl(queue[0]!.id));

    // A sondagem do watcher roda a cada 900 ms; esperar mais do que isso é o
    // que dá sentido à afirmação "não foi registrado".
    await extPage.waitForTimeout(1500);
    await expect(extPage.locator(PANEL)).toContainText(`0 de ${queue.length} respondidas`);

    // O primeiro clique num controle de resposta derruba a guarda. Como a
    // resposta é errada, a correlata entra na fila e o total sobe em 1.
    await tec.answer(extPage, "incorrect");
    await expect(extPage.locator(PANEL)).toContainText(
      `1 de ${queue.length + 1} respondidas`,
    );
  });
});

test.describe("F-BAT-08/19 · finalizar, reenviar e não ressuscitar", () => {
  test("gera o requestId uma vez e o reusa em todo reenvio", async ({ extPage, tec }) => {
    const start = syntheticStart({ mainTarget: 1 });
    const queue = pickQuestions(start);

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await tec.answer(extPage, "correct");
    await expect(extPage.locator(PANEL)).toContainText("1 de 1 respondidas");

    await extPage.locator(PANEL).getByRole("button", { name: "Finalizar e enviar" }).click();
    await extPage.waitForURL(/boraQuizResult=/);

    const primeiro = readResultPayload(extPage.url());
    expect(primeiro).toMatchObject({ quizSessionId: start.quizSessionId, cancel: false });
    expect(primeiro.answers.map((answer) => answer.questionId)).toEqual([queue[0]!.id]);
    expect(primeiro.requestId).toMatch(/^[0-9a-f-]{36}$/);

    // BUG-08: reabrir o TEC sem payload novo ressuscitava a bateria antiga e
    // voltava a oferecer "Finalizar e enviar". Agora o painel é outro.
    await extPage.goto("https://www.tecconcursos.com.br/questoes");
    await waitForPanel(extPage);
    const panel = extPage.locator(PANEL);
    await expect(panel).toContainText("Já enviada ao site");
    await expect(panel.getByRole("button", { name: "Finalizar e enviar" })).toHaveCount(0);

    // O reenvio é deliberado e carrega o MESMO requestId: é isso que faz o
    // servidor devolver o resultado anterior em vez de gravar de novo.
    await panel.getByRole("button", { name: "Reenviar ao site" }).click();
    await extPage.waitForURL(/boraQuizResult=/);
    expect(readResultPayload(extPage.url()).requestId).toBe(primeiro.requestId);
  });

  test("F-BAT-16 · cancelar volta com cancel:true e sem respostas", async ({ extPage }) => {
    const start = syntheticStart();

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);

    extPage.once("dialog", (dialog) => void dialog.accept());
    await extPage.locator(PANEL).getByRole("button", { name: "Cancelar bateria" }).click();
    await extPage.waitForURL(/boraQuizResult=/);

    expect(readResultPayload(extPage.url())).toMatchObject({
      quizSessionId: start.quizSessionId,
      cancel: true,
      answers: [],
    });
  });

  test("finalizar antes do fim só conta o que foi respondido", async ({ extPage, tec }) => {
    const start = syntheticStart();

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await tec.answer(extPage, "correct");
    await expect(extPage.locator(PANEL)).toContainText("1 de 3 respondidas");

    extPage.once("dialog", (dialog) => void dialog.accept());
    await extPage.locator(PANEL).getByRole("button", { name: "Finalizar agora" }).click();
    await extPage.waitForURL(/boraQuizResult=/);

    const result = readResultPayload(extPage.url());
    expect(result.cancel).toBe(false);
    expect(result.answers).toHaveLength(1);
  });
});

test("volta completa · site → extensão → site, sem atalho nenhum", async ({
  extPage,
  scenario,
  signIn,
  tec,
}) => {
  test.slow();

  await signIn(scenario.student);

  // 1. O site abre a sessão e manda o aluno ao TEC.
  await extPage.goto("/aluno");
  await extPage
    .locator("tbody tr", { hasText: scenario.quizGoal.title })
    .locator('button:has-text("Iniciar bateria")')
    .click();
  await extPage.waitForURL(/tecconcursos\.com\.br/);
  await waitForPanel(extPage);

  expect((await openSessionOf(scenario.planId))?.status).toBe("in_progress");

  // 2. O aluno responde as 15 principais pela extensão: 11 certas, 4 erradas.
  //
  // Desde a spec 21, CADA ERRO acrescenta uma correlata do mesmo tópico ao fim
  // da fila. O total cresce junto — é por isso que a asserção soma os erros já
  // cometidos em vez de comparar com MAIN_TARGET fixo.
  const panel = extPage.locator(PANEL);
  for (let index = 0; index < MAIN_TARGET; index += 1) {
    const errosAntes = Math.max(0, index - 10);
    await tec.answer(extPage, index < 11 ? "correct" : "incorrect");
    const errosDepois = Math.max(0, index + 1 - 11);
    await expect(panel).toContainText(
      `${index + 1} de ${MAIN_TARGET + errosDepois} respondidas`,
    );
    void errosAntes;

    await panel.getByRole("button", { name: "Ir para a próxima" }).click();
    await waitForPanel(extPage);
  }
  await expect(panel).toContainText("11 acertos · 4 erros");
  await expect(panel).toContainText("15 principais · 0 reforços · 0 extras");

  // 2b. E as 4 correlatas, que a fila ganhou sozinha.
  for (let index = 0; index < 4; index += 1) {
    await tec.answer(extPage, "correct");
    if (index < 3) {
      await panel.getByRole("button", { name: "Ir para a próxima" }).click();
      await waitForPanel(extPage);
    }
  }
  await expect(panel).toContainText("19 de 19 respondidas");
  await expect(panel).toContainText("15 principais · 4 reforços · 0 extras");

  // 3. Finaliza: a extensão devolve o resultado ao site.
  await panel.getByRole("button", { name: "Finalizar e enviar" }).click();
  await extPage.waitForURL((url) => url.href.startsWith(STUDENT_RETURN_URL));

  // 4. O site grava e só então limpa a hash.
  await expect(extPage.locator(".alert--success")).toHaveText(
    "Resultado gravado. Falta registrar o tempo para concluir a meta.",
  );
  await expect(extPage).toHaveURL(STUDENT_RETURN_URL);

  const session = await openSessionOf(scenario.planId);
  expect(session?.status).toBe("awaiting_time");
  // F-FASE-06: o ledger recebe as DUAS fases — 15 principais e 4 reforços.
  expect(await ledgerCount(session!.id)).toBe(MAIN_TARGET + 4);
  expect(
    await count(
      "select count(*) from public.quiz_session_questions where quiz_session_id = $1 and phase = 'reinforcement'",
      [session!.id],
    ),
  ).toBe(4);
  // E toda correlata carrega a questão de origem, como reinforcement_has_source exige.
  expect(
    await count(
      `select count(*) from public.quiz_session_questions
        where quiz_session_id = $1 and phase = 'reinforcement' and source_question_id is null`,
      [session!.id],
    ),
  ).toBe(0);

  // 5. O tempo conclui a meta.
  await extPage.fill("#minutes", "85");
  await extPage.click('button:has-text("Registrar tempo")');
  await expect(extPage).toHaveURL(/\/aluno\?feito=tempo$/);

  expect((await openSessionOf(scenario.planId))?.status).toBe("completed");
  expect(await goalStatus(scenario.quizGoal.id)).toBe("completed");

  // 6. E o número chega à tela. A NOTA é só das principais: 11 de 15, mesmo
  // com as 4 correlatas certas — é `vw_goal_performance` contando só `main`.
  await expect(
    extPage.locator("tbody tr", { hasText: scenario.quizGoal.title }),
  ).toContainText("11/15");

  // As estatísticas passam a mostrar a composição com reforços diferentes de zero.
  await extPage.goto("/aluno/estatisticas");
  await expect(extPage.locator("tbody tr").first()).toContainText("4 reforços");
});

// ---------------------------------------------------------------------------
// §3 — reforço correlato e rodada extra.
// Spec docs/specs/21-fases-na-extensao.md
// ---------------------------------------------------------------------------

/**
 * Catálogo sintético com tópico, e questões de sobra para uma rodada extra.
 *
 * `mainTarget` 2 mantém o teste curto; os 10 ids garantem que sempre exista
 * candidata para a correlata e para os 5 extras.
 */
const withTopics = () =>
  syntheticStart({
    mainTarget: 2,
    availableQuestions: [
      { id: 100001, topic: "Local de crime" },
      { id: 100002, topic: "Cadeia de custódia" },
      { id: 100003, topic: "Local de crime" },
      { id: 100004, topic: "Cadeia de custódia" },
      { id: 100005, topic: "Perícia papiloscópica" },
      { id: 100006, topic: "Perícia papiloscópica" },
      { id: 100007, topic: "Local de crime" },
      { id: 100008, topic: "Cadeia de custódia" },
      { id: 100009, topic: "Perícia papiloscópica" },
      { id: 100010, topic: "Local de crime" },
    ],
  });

test.describe("F-FASE-01 · reforço correlato", () => {
  test("errar põe uma questão do mesmo tópico no fim da fila", async ({ extPage, tec }) => {
    const start = withTopics();
    const queue = pickQuestions(start);

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await expect(extPage.locator(PANEL)).toContainText("0 de 2 respondidas");

    // Erra a primeira: a fila cresce de 2 para 3.
    await tec.answer(extPage, "incorrect");
    await expect(extPage.locator(PANEL)).toContainText("1 de 3 respondidas");
    await expect(extPage.locator(PANEL)).toContainText("1 principais · 0 reforços · 0 extras");

    void queue;
  });
});

test.describe("F-FASE-02 · a correlata é gravada com fase e origem", () => {
  test("phase reinforcement e sourceQuestionId da errada", async ({ extPage, tec }) => {
    const start = withTopics();
    const queue = pickQuestions(start);

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);

    // Erra as duas principais: cada uma gera uma correlata.
    await tec.answer(extPage, "incorrect");
    await extPage.locator(`${PANEL} button:has-text("Ir para a próxima")`).click();
    await tec.answer(extPage, "incorrect");

    // Agora as duas correlatas, na ordem.
    for (let i = 0; i < 2; i += 1) {
      await extPage.locator(`${PANEL} button:has-text("Ir para a próxima")`).click();
      await tec.answer(extPage, "correct");
    }

    await expect(extPage.locator(PANEL)).toContainText("4 de 4 respondidas");
    await expect(extPage.locator(PANEL)).toContainText("2 principais · 2 reforços · 0 extras");

    await extPage.locator(`${PANEL} button:has-text("Finalizar e enviar")`).click();
    await extPage.waitForURL(/boraQuizResult=/);

    const result = readResultPayload(extPage.url());
    const reforcos = result.answers.filter((a) => a.phase === "reinforcement");
    expect(reforcos).toHaveLength(2);
    // A origem é uma das principais erradas, e o tópico casa.
    for (const reforco of reforcos) {
      expect(queue.map((q) => q.id)).toContain(reforco.sourceQuestionId);
      const origem = queue.find((q) => q.id === reforco.sourceQuestionId)!;
      expect(reforco.topic).toBe(origem.topic);
    }
  });
});

test.describe("F-FASE-03 · rodada extra", () => {
  test("com todas as principais feitas, +5 acrescenta 5 na rodada 1", async ({
    extPage,
    tec,
  }) => {
    const start = withTopics();

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);

    // Acerta as duas: nenhuma correlata, fila fecha em 2.
    await tec.answer(extPage, "correct");
    await extPage.locator(`${PANEL} button:has-text("Ir para a próxima")`).click();
    await tec.answer(extPage, "correct");
    await expect(extPage.locator(PANEL)).toContainText("2 de 2 respondidas");

    await extPage.locator(`${PANEL} button:has-text("+ 5 questões extras")`).click();
    await expect(extPage.locator(PANEL)).toContainText("2 de 7 respondidas");

    // Responde as 5 extras.
    for (let i = 0; i < 5; i += 1) {
      await tec.answer(extPage, "correct");
      if (i < 4) await extPage.locator(`${PANEL} button:has-text("Ir para a próxima")`).click();
    }
    await expect(extPage.locator(PANEL)).toContainText("2 principais · 0 reforços · 5 extras");

    await extPage.locator(`${PANEL} button:has-text("Finalizar e enviar")`).click();
    await extPage.waitForURL(/boraQuizResult=/);

    const extras = readResultPayload(extPage.url()).answers.filter((a) => a.phase === "extra");
    expect(extras).toHaveLength(5);
    expect(extras.every((e) => e.round === 1)).toBe(true);
  });

  test("o botão não aparece com principal pendente", async ({ extPage }) => {
    await extPage.goto(startUrlFor(withTopics()));
    await waitForPanel(extPage);

    await expect(
      extPage.locator(`${PANEL} button:has-text("+ 5 questões extras")`),
    ).toHaveCount(0);
  });
});

test.describe("F-FASE-04 · tudo ou nada", () => {
  test("sem 5 inéditas, nada é acrescentado e a extensão avisa", async ({ extPage, tec }) => {
    // 4 questões no catálogo, 2 principais: sobram 2, menos que os 5 exigidos.
    const start = syntheticStart({
      mainTarget: 2,
      availableQuestions: [
        { id: 100001, topic: "A" },
        { id: 100002, topic: "A" },
        { id: 100003, topic: "B" },
        { id: 100004, topic: "B" },
      ],
    });

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await tec.answer(extPage, "correct");
    await extPage.locator(`${PANEL} button:has-text("Ir para a próxima")`).click();
    await tec.answer(extPage, "correct");

    extPage.on("dialog", (dialog) => {
      expect(dialog.message()).toContain("Não há 5 questões inéditas");
      void dialog.accept();
    });
    await extPage.locator(`${PANEL} button:has-text("+ 5 questões extras")`).click();

    // A fila continua com 2.
    await expect(extPage.locator(PANEL)).toContainText("2 de 2 respondidas");
  });
});

test.describe("F-FASE-05 · finalização antecipada descarta o que não é principal", () => {
  test("a correlata gerada não vai no resultado", async ({ extPage, tec }) => {
    // mainTarget 3, mas o aluno responde só 1 — e erra, gerando uma correlata.
    const start = syntheticStart({
      mainTarget: 3,
      availableQuestions: [
        { id: 100001, topic: "A" },
        { id: 100002, topic: "A" },
        { id: 100003, topic: "B" },
        { id: 100004, topic: "B" },
      ],
    });

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await tec.answer(extPage, "incorrect");
    await expect(extPage.locator(PANEL)).toContainText("1 de 4 respondidas");

    extPage.on("dialog", (dialog) => void dialog.accept());
    await extPage.locator(`${PANEL} button:has-text("Finalizar agora")`).click();
    await extPage.waitForURL(/boraQuizResult=/);

    const result = readResultPayload(extPage.url());
    // Só a principal respondida. Sem o descarte, finish_quiz_session recusaria
    // a bateria inteira por "reinforcements/extras so podem existir depois de
    // todas as principais".
    expect(result.answers).toHaveLength(1);
    expect(result.answers[0]?.phase).toBe("main");
  });
});
