/**
 * §3 do `docs/fluxos-e2e.md` — a volta completa da bateria, pelo lado do site.
 *
 * É o fluxo mais caro do produto: cada bateria custa uma hora de estudo do
 * aluno e não pode ser recriada. As três ordenações do `docs/arquitetura.md`
 * são o que estes testes existem para provar — em especial a nº 1, "persistir
 * antes de limpar a hash", que aqui aparece como: a hash SÓ desaparece depois
 * de o servidor confirmar a gravação.
 *
 * O papel da extensão é feito por `fixtures/quiz.ts`, que produz exatamente o
 * mesmo payload usando o motor real. Quem prova o comportamento da extensão em
 * si é `extension.spec.ts`.
 */
import { expect, test } from "../fixtures/index.ts";
import {
  MAIN_TARGET,
  addWeek,
  catalogQuestions,
  goalPerformance,
  goalStatus,
  ledgerCount,
  openSessionOf,
} from "../fixtures/scenario.ts";
import { completeQuiz } from "../fixtures/battery.ts";
import {
  buildAnswers,
  readStartPayload,
  resultUrl,
  returnToSite,
  simulateExtension,
  startHashOf,
} from "../fixtures/quiz.ts";
import { STUDENT_RETURN_URL } from "../support/app.ts";
import { cardByTitle } from "../support/ui.ts";

/** Clica "Iniciar bateria" e espera a navegação para o TEC interceptado. */
async function startQuiz(page: import("@playwright/test").Page, goalTitle: string) {
  const row = page.locator("tbody tr", { hasText: goalTitle });
  await row.locator('button:has-text("Iniciar bateria")').click();
  await page.waitForURL(/tecconcursos\.com\.br/);
  return page.url();
}

test.describe("F-BAT-01 · abrir a bateria", () => {
  test("leva ao TEC com o payload no fragmento e abre a sessão", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    const url = await startQuiz(studentPage, scenario.quizGoal.title);

    // O fragmento nunca chega ao servidor: a URL do frame é a única fonte.
    expect(startHashOf(url)).not.toBeNull();
    expect(url.startsWith("https://www.tecconcursos.com.br/questoes#")).toBe(true);

    const session = await openSessionOf(scenario.planId);
    expect(session).toMatchObject({
      status: "in_progress",
      session_number: 1,
      main_target: MAIN_TARGET,
    });
    expect(await goalStatus(scenario.quizGoal.id)).toBe("in_progress");
  });

  test("o payload chega com tudo que a extensão precisa", async ({
    studentPage,
    scenario,
  }) => {
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno");
    const payload = readStartPayload(await startQuiz(studentPage, scenario.quizGoal.title));

    expect(payload).toMatchObject({
      returnUrl: STUDENT_RETURN_URL,
      goalId: scenario.quizGoal.id,
      studyPlanId: scenario.planId,
      blockId: block.id,
      sessionNumber: 1,
      mainTarget: MAIN_TARGET,
      historyComplete: true,
    });
    // Primeira bateria: nada visto ainda.
    expect(payload.history).toEqual([]);
    expect(payload.availableQuestions).toEqual(await catalogQuestions(block.catalogBlockId));
  });
});

test("F-BAT-02 · sessão aberta bloqueia abrir outra", async ({ studentPage, scenario }) => {
  await studentPage.goto("/aluno");
  await startQuiz(studentPage, scenario.quizGoal.title);

  await studentPage.goto("/aluno");
  const card = cardByTitle(studentPage, "Bateria 1");
  await expect(card.locator(".card__sub")).toContainText("Em andamento");
  await expect(card.locator('button:has-text("Continuar no TEC")')).toBeVisible();
  await expect(card.locator('button:has-text("Cancelar bateria")')).toBeVisible();

  // Nenhuma outra meta pode oferecer "Iniciar bateria" com sessão aberta.
  await expect(studentPage.locator('button:has-text("Iniciar bateria")')).toHaveCount(0);
});

test("F-BAT-09 · o site grava o resultado e só então limpa a hash", async ({
  studentPage,
  scenario,
}) => {
  await studentPage.goto("/aluno");
  const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
    correct: 11,
  });
  expect(run.queue).toHaveLength(MAIN_TARGET);

  await returnToSite(studentPage, run.returnUrl);

  await expect(studentPage.locator(".alert--success")).toHaveText(
    "Resultado gravado. Falta registrar o tempo para concluir a meta.",
  );
  // A hash só sai depois da confirmação — ordenação nº 1 do CLAUDE.md.
  await expect(studentPage).toHaveURL(STUDENT_RETURN_URL);

  const session = await openSessionOf(scenario.planId);
  expect(session?.status).toBe("awaiting_time");
  expect(await ledgerCount(session!.id)).toBe(MAIN_TARGET);
});

test("F-BAT-10 · falha na gravação preserva a hash", async ({ studentPage, scenario }) => {
  await studentPage.goto("/aluno");
  const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
    correct: 11,
  });

  // Sessão inexistente: a RPC recusa, e o site tem de manter a única cópia do
  // resultado que existe neste navegador.
  const perdido = resultUrl(
    { ...run.result, quizSessionId: "00000000-0000-4000-8000-000000000000" },
    STUDENT_RETURN_URL,
  );
  await returnToSite(studentPage, perdido);

  await expect(studentPage.locator(".alert--error")).toContainText(
    "Não refaça a bateria — atualize a página para tentar de novo.",
  );
  expect(studentPage.url()).toContain("#boraQuizResult=");
});

test.describe("F-BAT-11 · idempotência do reenvio", () => {
  test("mesmo requestId e mesmo payload é replay", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno");
    const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
      correct: 11,
    });

    await returnToSite(studentPage, run.returnUrl);
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    const session = await openSessionOf(scenario.planId);
    expect(await ledgerCount(session!.id)).toBe(MAIN_TARGET);

    // Reenvio idêntico: devolve o estado anterior, sem duplicar o ledger.
    await returnToSite(studentPage, run.returnUrl);
    await expect(studentPage.locator(".alert--success")).toBeVisible();
    expect(await ledgerCount(session!.id)).toBe(MAIN_TARGET);
    expect((await openSessionOf(scenario.planId))?.status).toBe("awaiting_time");
  });

  test("mesmo requestId com payload diferente é recusado", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
      correct: 11,
    });
    await returnToSite(studentPage, run.returnUrl);
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    const outro = resultUrl(
      { ...run.result, answers: buildAnswers(run.queue, { correct: 3 }) },
      STUDENT_RETURN_URL,
    );
    await returnToSite(studentPage, outro);

    // BUG-09: a mensagem crua do Postgres não chega mais à tela.
    await expect(studentPage.locator(".alert--error")).toContainText(
      "Este envio já foi usado com outro resultado",
    );
    expect(await ledgerCount((await openSessionOf(scenario.planId))!.id)).toBe(MAIN_TARGET);
  });
});

test.describe("F-BAT-12 · payload inválido na volta", () => {
  test("base64 que não carrega JSON dá mensagem de formato", async ({ studentPage }) => {
    const naoJson = Buffer.from("isto nao e json").toString("base64url");
    await studentPage.goto(`/aluno#boraQuizResult=${naoJson}`);

    await expect(studentPage.locator(".alert--error")).toContainText(
      "O resultado voltou da extensão em formato inválido.",
    );
  });

  test("protocolo diferente manda atualizar a extensão", async ({ studentPage }) => {
    const envelope = { protocol: 99, kind: "quiz.result", body: {} };
    const encoded = Buffer.from(JSON.stringify(envelope))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await studentPage.goto(`/aluno#boraQuizResult=${encoded}`);

    await expect(studentPage.locator(".alert--error")).toContainText(
      "Atualize a extensão: ela devolveu o resultado num formato que este site ainda não entende.",
    );
  });
});

test.describe("F-BAT-13 · registrar o tempo conclui a meta", () => {
  test("aceita minutos e conclui", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno");
    const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
      correct: 11,
    });
    await returnToSite(studentPage, run.returnUrl);
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    await studentPage.fill("#minutes", "85");
    await studentPage.click('button:has-text("Registrar tempo")');

    // BUG-04: a confirmação vem por POST-redirect-GET, porque o
    // revalidatePath desmonta o formulário que a mostraria.
    //
    // O alerta é procurado pelo texto, e não como "o único .alert--success":
    // a rota é a mesma, então o React preserva o QuizResultHandler e a
    // confirmação da gravação continua na tela ao lado desta.
    await expect(studentPage).toHaveURL(/\/aluno\?feito=tempo$/);
    await expect(
      studentPage.locator(".alert--success", { hasText: "Tempo registrado. Meta concluída." }),
    ).toBeVisible();

    const session = await openSessionOf(scenario.planId);
    expect(session).toMatchObject({ status: "completed", duration_minutes: 85 });
    expect(await goalStatus(scenario.quizGoal.id)).toBe("completed");
    expect(await goalPerformance(scenario.quizGoal.id)).toEqual({
      answered: 15,
      correct: 11,
      minutes: 85,
    });
  });

  test("aceita hora:minuto", async ({ studentPage, scenario }) => {
    // BUG-06: o campo era type="number" e o servidor fazia Number("1:20"),
    // que é NaN — enquanto a mensagem de erro prometia aceitar esse formato.
    await studentPage.goto("/aluno");
    const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
      correct: 11,
    });
    await returnToSite(studentPage, run.returnUrl);
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    await expect(studentPage.locator("#minutes")).toHaveAttribute("type", "text");
    await studentPage.fill("#minutes", "1:20");
    await studentPage.click('button:has-text("Registrar tempo")');

    await expect(studentPage).toHaveURL(/\/aluno\?feito=tempo$/);
    expect((await openSessionOf(scenario.planId))?.duration_minutes).toBe(80);
  });

  test("tempo inválido é recusado com a mensagem certa", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    const run = simulateExtension(await startQuiz(studentPage, scenario.quizGoal.title), {
      correct: 11,
    });
    await returnToSite(studentPage, run.returnUrl);
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    await studentPage.fill("#minutes", "abacaxi");
    await studentPage.click('button:has-text("Registrar tempo")');

    await expect(studentPage.locator(".alert--error")).toContainText(
      "Informe o tempo em minutos ou no formato hora:minuto",
    );
    expect((await openSessionOf(scenario.planId))?.status).toBe("awaiting_time");
  });
});

test.describe("F-BAT-15/16 · cancelar", () => {
  test("cancelar pelo site devolve a meta para pendente", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await startQuiz(studentPage, scenario.quizGoal.title);

    await studentPage.goto("/aluno");
    await studentPage.click('button:has-text("Cancelar bateria")');

    await expect(studentPage).toHaveURL(/\/aluno\?feito=cancelada$/);
    await expect(studentPage.locator(".alert--success")).toContainText("Bateria cancelada");

    expect((await openSessionOf(scenario.planId))?.status).toBe("cancelled");
    expect(await goalStatus(scenario.quizGoal.id)).toBe("pending");

    // O botão de iniciar volta, e a bateria cancelada não conta em nada.
    await expect(
      studentPage.locator("tbody tr", { hasText: scenario.quizGoal.title })
        .locator('button:has-text("Iniciar bateria")'),
    ).toBeVisible();

    await studentPage.goto("/aluno/estatisticas");
    await expect(cardByTitle(studentPage, "Desempenho oficial")).toContainText("—");
  });

  test("cancelar pela extensão volta com cancel:true e nenhuma resposta", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    const run = simulateExtension(
      await startQuiz(studentPage, scenario.quizGoal.title),
      { correct: 0 },
      { cancel: true },
    );
    expect(run.result.answers).toEqual([]);

    await returnToSite(studentPage, run.returnUrl);

    await expect(studentPage.locator(".alert--success")).toContainText("Bateria cancelada");
    expect((await openSessionOf(scenario.planId))?.status).toBe("cancelled");
    expect(await goalStatus(scenario.quizGoal.id)).toBe("pending");
  });
});

test("F-BAT-17 · a segunda bateria não repete questão", async ({
  studentPage,
  scenario,
}) => {
  const block = scenario.blocks[0]!;
  const primeira = scenario.goals.find((goal) => goal.blockId === block.id)!;
  const done = await completeQuiz(scenario, primeira, { correct: 11 });

  // Segunda bateria do MESMO bloco, agora pela interface.
  const semana2 = await addWeek(scenario, 2);
  const segunda = semana2.find((goal) => goal.blockId === block.id)!;

  await studentPage.goto("/aluno?semana=2");
  const payload = readStartPayload(await startQuiz(studentPage, segunda.title));

  // O histórico volta com as 15 já vistas…
  expect(payload.history).toHaveLength(MAIN_TARGET);
  expect(payload.historyComplete).toBe(true);
  expect(payload.sessionNumber).toBe(2);

  // …e o motor escolhe 15 inéditas: interseção vazia com a fila anterior.
  const run = simulateExtension(studentPage.url(), { correct: 15 });
  expect(run.queue).toHaveLength(MAIN_TARGET);
  expect(run.queue.filter((id) => done.queue.includes(id))).toEqual([]);
});
