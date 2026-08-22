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
    await expect(extPage).toHaveURL(questionUrl(queue[0]!));

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

    for (const [index, questionId] of queue.entries()) {
      await expect(extPage).toHaveURL(questionUrl(questionId));

      await tec.answer(extPage, index === 0 ? "correct" : "incorrect");
      await expect(extPage.locator(PANEL)).toContainText(
        `${index + 1} de ${queue.length} respondidas`,
      );

      if (index < queue.length - 1) {
        await extPage.locator(PANEL).getByRole("button", { name: "Ir para a próxima" }).click();
        await waitForPanel(extPage);
      }
    }

    // Fila inteira respondida: some "Ir para a próxima", aparece "Finalizar".
    const panel = extPage.locator(PANEL);
    await expect(panel).toContainText("1 acertos · 2 erros");
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
    tec.preAnswer(queue[0]!, "correct");

    await extPage.goto(startUrlFor(start));
    await waitForPanel(extPage);
    await expect(extPage).toHaveURL(questionUrl(queue[0]!));

    // A sondagem do watcher roda a cada 900 ms; esperar mais do que isso é o
    // que dá sentido à afirmação "não foi registrado".
    await extPage.waitForTimeout(1500);
    await expect(extPage.locator(PANEL)).toContainText(`0 de ${queue.length} respondidas`);

    // O primeiro clique num controle de resposta derruba a guarda.
    await tec.answer(extPage, "incorrect");
    await expect(extPage.locator(PANEL)).toContainText(`1 de ${queue.length} respondidas`);
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
    expect(primeiro.answers.map((answer) => answer.questionId)).toEqual([queue[0]]);
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
  const panel = extPage.locator(PANEL);
  for (let index = 0; index < MAIN_TARGET; index += 1) {
    await tec.answer(extPage, index < 11 ? "correct" : "incorrect");
    await expect(panel).toContainText(`${index + 1} de ${MAIN_TARGET} respondidas`);

    if (index < MAIN_TARGET - 1) {
      await panel.getByRole("button", { name: "Ir para a próxima" }).click();
      await waitForPanel(extPage);
    }
  }
  await expect(panel).toContainText("11 acertos · 4 erros");

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
  expect(await ledgerCount(session!.id)).toBe(MAIN_TARGET);

  // 5. O tempo conclui a meta.
  await extPage.fill("#minutes", "85");
  await extPage.click('button:has-text("Registrar tempo")');
  await expect(extPage).toHaveURL(/\/aluno\?feito=tempo$/);

  expect((await openSessionOf(scenario.planId))?.status).toBe("completed");
  expect(await goalStatus(scenario.quizGoal.id)).toBe("completed");

  // 6. E o número chega à tela.
  await expect(
    extPage.locator("tbody tr", { hasText: scenario.quizGoal.title }),
  ).toContainText("11/15");
});
