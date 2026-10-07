/**
 * §2 do `docs/fluxos-e2e.md` — a semana do aluno.
 *
 * Nasceu na Fase 3, quando `/aluno` foi reescrita a partir do `p-dashboard` da
 * v2. NÃO é a conversão dos testes antigos: o fluxo mudou de forma, e a v2 é
 * quem decide.
 *
 * O que era: um formulário embutido na linha, com "Concluir" pedindo tempo e
 * observação no mesmo gesto, e o tempo aceito como "1:20".
 * O que é: REGISTRAR e CONCLUIR são dois gestos. O modal de registro recebe
 * tempo, questões, acertos e observação — uma meta recebe vários registros ao
 * longo da semana —, e a caixa de seleção fecha a meta. Fechar no primeiro
 * registro obrigaria a reabrir para lançar o segundo.
 */
import { expect, test } from "../fixtures/index.ts";
import { count, maybeOne, one, query } from "../fixtures/db.ts";
import { addWeek, setAccess, type Scenario, type ScenarioGoal } from "../fixtures/scenario.ts";
import { STUDENT_WEEK_ALL_DAYS } from "../support/routes.ts";
import { alert, content, field, goalRow, testId } from "../support/ui.ts";

/** `AAAA-MM-DD` de hoje no fuso do navegador do projeto: é o `timezoneId` do Playwright. */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Faz de hoje o quarto dia da semana 1. Com o `starts_on` do cenário (a segunda
 * do banco, em UTC) a sugestão "hoje" e a sugestão "primeiro dia" coincidem em
 * metade dos dias; três dias de folga as distingue em qualquer um.
 */
async function startPlanThreeDaysAgo(planId: string): Promise<string> {
  const today = todayInSaoPaulo();
  await query("update public.study_plans set starts_on = $2::date where id = $1", [
    planId,
    addDays(today, -3),
  ]);
  return today;
}

function theoryGoalOf(scenario: Scenario): ScenarioGoal {
  const goal = scenario.goals.find((candidate) => candidate.type === "theory");
  if (!goal) throw new Error("o cenário não tem meta de teoria");
  return goal;
}

/** Abre o modal de registro de uma meta e preenche os três números. */
async function record(
  page: import("@playwright/test").Page,
  goalId: string,
  values: { minutes: string; questions?: string; correct?: string; note?: string },
): Promise<void> {
  await goalRow(page, goalId).getByRole("button", { name: "Registrar" }).click();
  const dialog = testId(page, "record-study-dialog");
  await expect(dialog).toBeVisible();

  await field(page, "minutes").fill(values.minutes);
  if (values.questions) await field(page, "questions").fill(values.questions);
  if (values.correct) await field(page, "correctAnswers").fill(values.correct);
  if (values.note) await dialog.locator('textarea[name="note"]').fill(values.note);

  await dialog.getByRole("button", { name: "Registrar" }).click();
}

test.describe("F-META-01 · o cabeçalho da semana", () => {
  test("os quatro números saem dos registros, não das metas", async ({ studentPage, scenario }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await expect(testId(studentPage, "week-hero")).toBeVisible();

    const cartoes = testId(studentPage, "week-stat");
    const valores = testId(studentPage, "week-stat-value");
    // Semana nova: nenhum registro, e o aproveitamento não vira porcentagem —
    // zero por cento é uma afirmação, e ausência de resposta não é.
    await expect(valores.nth(0)).toHaveText("0/0");
    await expect(cartoes.nth(0)).toContainText("Ainda sem questões");
    await expect(valores.nth(1)).toHaveText("0");

    await record(studentPage, theoryGoalOf(scenario).id, {
      minutes: "40",
      questions: "10",
      correct: "8",
    });

    await expect(valores.nth(0)).toHaveText("8/10");
    await expect(cartoes.nth(0)).toContainText("80% de aproveitamento");
    await expect(valores.nth(1)).toHaveText("10");
    await expect(valores.nth(2)).toHaveText("40min");
    // Registrar não conclui: a contagem de metas não se mexe.
    await expect(testId(studentPage, "week-hero")).toContainText("0 de 5 atividades");
  });
});

test.describe("F-META-02 · a semana escolhida mora na URL (QA-13)", () => {
  test("navega, sobrevive ao recarregar e o botão voltar funciona", async ({
    studentPage,
    scenario,
  }) => {
    // O seletor só tem para onde ir com mais de uma semana planejada.
    await addWeek(scenario, 2);

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await expect(testId(studentPage, "week-hero")).toContainText("Semana 1");

    // O `data-testid` fica no input escondido do Select; quem abre o menu é o
    // combobox ao lado dele, que é o que o teclado e o mouse alcançam.
    await studentPage.getByRole("combobox", { name: "Semana" }).click();
    await studentPage.getByRole("option", { name: /Semana 2/ }).click();

    await expect(studentPage).toHaveURL(/\?semana=2$/);
    await expect(testId(studentPage, "week-hero")).toContainText("Semana 2");

    await studentPage.reload();
    await expect(testId(studentPage, "week-hero")).toContainText("Semana 2");

    await studentPage.goBack();
    await expect(testId(studentPage, "week-hero")).toContainText("Semana 1");
  });

  for (const [label, value] of [
    ["texto", "abacaxi"],
    ["negativo", "-3"],
    // QA-13: o número chegava ao `Date` e derrubava a tela.
    ["fora do alcance", "1e9"],
  ] as const) {
    test(`${label} na query string não quebra a tela`, async ({ studentPage, consoleErrors }) => {
      await studentPage.goto(`/aluno?semana=${value}`);

      await expect(testId(studentPage, "week-hero")).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });
  }

  test("semana fora do seletor cai na CORRENTE, e não abre 'Semana 40' — QA-13", async ({
    studentPage,
    consoleErrors,
  }) => {
    await studentPage.goto("/aluno?semana=40");

    // A que o seletor oferece e abre: a corrente, e não a que a URL inventou.
    await expect(testId(studentPage, "week-hero")).toContainText("Semana 1");
    await expect(studentPage.getByRole("combobox", { name: "Semana" })).toContainText("Semana 1");
    await expect(testId(studentPage, "week-hero")).not.toContainText("Semana 40");
    expect(consoleErrors).toEqual([]);
  });

  test.describe("sem nenhuma meta", () => {
    test.use({ scenarioOptions: { withGoals: false } });

    test("a semana corrente mostra o vazio, e não uma tela quebrada", async ({ studentPage }) => {
      await studentPage.goto("/aluno");

      await expect(testId(studentPage, "week-hero")).toContainText("Semana 1");
      // A tela abre num dia só; um dia sem meta é "dia livre", não erro.
      await expect(testId(studentPage, "empty")).toContainText("Dia livre");
    });
  });
});

test.describe("F-META-03 · registrar estudo", () => {
  test("o registro entra no ledger e NÃO conclui a meta", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "pending");

    await record(studentPage, goal.id, {
      minutes: "45",
      questions: "20",
      correct: "16",
      note: "Li o capítulo 1.",
    });

    // "Em andamento", e não "Concluída": são dois gestos.
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "in_progress");
    await expect(goalRow(studentPage, goal.id)).toContainText("45min");
    await expect(goalRow(studentPage, goal.id)).toContainText("80% de acerto");

    const saved = await one<{
      minutes: number;
      questions: number;
      correct_answers: number;
      note: string;
      score: number;
    }>(
      `select minutes, questions, correct_answers, note, score
         from public.goal_entries where goal_id = $1`,
      [goal.id],
    );
    expect(saved).toMatchObject({
      minutes: 45,
      questions: 20,
      correct_answers: 16,
      note: "Li o capítulo 1.",
    });
    // `score` é coluna GERADA: quem a calcula é o banco, não a tela.
    expect(Number(saved.score)).toBe(80);
  });

  test("rede caindo ao gravar: a frase é 'Sem conexão', e a retentativa grava uma vez — QA-06", async ({
    studentPage,
    scenario,
    consoleErrors,
  }) => {
    const goal = theoryGoalOf(scenario);

    // Só a RPC de gravar: derrubar a leitura da meta mataria o `reloadGoal`, que é
    // outro caminho. Aqui o erro é o do `fetch` que falhou, direto do PostgREST.
    let caindo = true;
    await studentPage.route("**/rest/v1/rpc/record_goal_entry", (route) =>
      caindo ? route.abort("internetdisconnected") : route.fallback(),
    );

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await record(studentPage, goal.id, { minutes: "30" });

    const dialog = testId(studentPage, "record-study-dialog");
    await expect(alert(dialog, "error")).toHaveText("Sem conexão. Verifique a rede e tente de novo.");
    await expect(dialog).not.toContainText("TypeError");

    // O MESMO diálogo, o mesmo `requestId`: a retentativa grava.
    caindo = false;
    await dialog.getByRole("button", { name: "Registrar" }).click();
    await expect(dialog).toHaveCount(0);

    const gravados = await one<{ n: string }>(
      "select count(*) as n from public.goal_entries where goal_id = $1",
      [goal.id],
    );
    expect(Number(gravados.n)).toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  test("a resposta que se perde grava um registro só — QA-04", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);

    // O PIOR CASO da retentativa: o servidor grava e o navegador nunca recebe a
    // resposta. Antes, eram dois INSERTs soltos e a nova tentativa gravava de novo.
    await studentPage.route(
      "**/rest/v1/rpc/record_goal_entry",
      async (route) => {
        await route.fetch();
        await route.abort();
      },
      { times: 1 },
    );

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await record(studentPage, goal.id, { minutes: "25" });

    const dialog = testId(studentPage, "record-study-dialog");
    await expect(alert(dialog, "error")).toBeVisible();

    // O MESMO diálogo, a mesma chave: o banco devolve o que já gravou.
    await dialog.getByRole("button", { name: "Registrar" }).click();
    await expect(dialog).toHaveCount(0);

    expect(
      await count("select count(*) from public.goal_entries where goal_id = $1", [goal.id]),
    ).toBe(1);
    await expect(goalRow(studentPage, goal.id)).toContainText("25min");
  });

  test("número inválido é recusado, e nada é gravado — QA-10", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    for (const minutes of ["-30", "241", "1.5"]) {
      // Espera o diálogo anterior fechar antes de abrir o seguinte: o botão
      // "Registrar" da linha só existe com o diálogo fechado.
      await goalRow(studentPage, goal.id).getByRole("button", { name: "Registrar" }).click();
      const dialog = testId(studentPage, "record-study-dialog");
      await expect(dialog).toBeVisible();
      await field(studentPage, "minutes").fill(minutes);
      await dialog.getByRole("button", { name: "Registrar" }).click();

      await expect(alert(dialog, "error")).toContainText("minutos inteiros, de 0 a 240");
      expect(
        await maybeOne("select id from public.goal_entries where goal_id = $1", [goal.id]),
        minutes,
      ).toBeNull();
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialog).toHaveCount(0);
    }
  });

  test("dois registros na mesma meta somam, em vez de substituir", async ({
    studentPage,
    scenario,
  }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    await record(studentPage, goal.id, { minutes: "30", questions: "10", correct: "5" });
    await expect(goalRow(studentPage, goal.id)).toContainText("30min");

    await record(studentPage, goal.id, { minutes: "20", questions: "10", correct: "9" });

    // 50 minutos e 14 de 20 — é por isso que registrar não pode concluir.
    await expect(goalRow(studentPage, goal.id)).toContainText("50min");
    await expect(goalRow(studentPage, goal.id)).toContainText("70% de acerto");
  });

  test("acertos acima do total são recusados, com o campo marcado", async ({
    studentPage,
    scenario,
  }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    await record(studentPage, goal.id, { minutes: "30", questions: "10", correct: "30" });

    const dialog = testId(studentPage, "record-study-dialog");
    await expect(alert(dialog, "error")).toHaveText("Os acertos não podem passar do total de questões.");
    // O modal continua aberto: recusar e fechar perderia o que foi digitado.
    await expect(dialog).toBeVisible();

    expect(
      await maybeOne("select id from public.goal_entries where goal_id = $1", [goal.id]),
    ).toBeNull();
  });

  test("sem tempo e sem questão não é registro nenhum", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    await record(studentPage, goal.id, { minutes: "0", questions: "0", correct: "0" });

    await expect(
      alert(testId(studentPage, "record-study-dialog"), "error"),
    ).toContainText("Informe o tempo estudado ou as questões feitas");
  });
});

test.describe("F-META-04 · concluir e reabrir", () => {
  test("a caixa conclui, e reabrir devolve o estado que os registros justificam", async ({
    studentPage,
    scenario,
  }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    // Sem registro: concluir e reabrir volta a PENDENTE.
    await goalRow(studentPage, goal.id).locator('[data-testid="goal-check"]').click();
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "completed");
    await goalRow(studentPage, goal.id).locator('[data-testid="goal-check"]').click();
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "pending");

    // Com registro: reabrir volta a EM ANDAMENTO, senão a tela diria
    // "pendente" numa linha que mostra 45 minutos estudados.
    await record(studentPage, goal.id, { minutes: "45" });
    await goalRow(studentPage, goal.id).locator('[data-testid="goal-check"]').click();
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "completed");
    await goalRow(studentPage, goal.id).locator('[data-testid="goal-check"]').click();
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "in_progress");

    const saved = await one<{ status: string; completed_at: string | null }>(
      "select status::text, completed_at from public.goals where id = $1",
      [goal.id],
    );
    expect(saved).toMatchObject({ status: "in_progress", completed_at: null });
  });

  test("concluir muda a contagem da semana", async ({ studentPage, scenario }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await expect(testId(studentPage, "week-hero")).toContainText("0 de 5 atividades · 0%");

    await goalRow(studentPage, theoryGoalOf(scenario).id)
      .locator('[data-testid="goal-check"]')
      .click();

    await expect(testId(studentPage, "week-hero")).toContainText("1 de 5 atividades · 20%");
  });
});

test.describe("F-META-05 · meta de bateria não se mexe pela tela", () => {
  /*
   * O motor de baterias saiu com a extensão e ainda não voltou, e o gatilho
   * `protect_goal_quiz_result` recusa a escrita no banco. A tela precisa saber
   * disso ANTES de oferecer o botão: oferecer e falhar depois seria pior do que
   * explicar antes.
   */
  test("sem botão de registrar, e a caixa desabilitada", async ({ studentPage, scenario }) => {
    const quiz = scenario.quizGoal;
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    const row = goalRow(studentPage, quiz.id);
    await expect(row).toHaveAttribute("data-type", "question_block");
    await expect(row.locator('[data-testid="goal-check"]')).toBeDisabled();
    await expect(row.getByRole("button", { name: "Registrar" })).toHaveCount(0);
    await expect(row.locator('[data-testid="goal-blocked"]')).toContainText("Bateria indisponível");
  });
});

test.describe("F-META-08 · sem acesso vigente, a semana não muda — QA-07", () => {
  test("concluir e registrar recusam, e o banco continua como estava", async ({
    studentPage,
    scenario,
  }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await expect(goalRow(studentPage, goal.id)).toHaveAttribute("data-status", "pending");

    // Depois de carregar: a tela foi aberta com acesso, e o acesso acabou
    // enquanto ela estava aberta. É o que a policy precisa segurar.
    await setAccess(scenario.student.id, "suspended");

    await goalRow(studentPage, goal.id).locator('[data-testid="goal-check"]').click();
    await expect(alert(content(studentPage), "error")).toContainText("acesso venceu");
    const saved = await one<{ status: string }>(
      "select status::text from public.goals where id = $1",
      [goal.id],
    );
    expect(saved.status).toBe("pending");

    await goalRow(studentPage, goal.id).getByRole("button", { name: "Registrar" }).click();
    const dialog = testId(studentPage, "record-study-dialog");
    await field(studentPage, "minutes").fill("30");
    await dialog.getByRole("button", { name: "Registrar" }).click();
    await expect(alert(dialog, "error")).toContainText("acesso venceu");
    expect(
      await maybeOne("select id from public.goal_entries where goal_id = $1", [goal.id]),
    ).toBeNull();
  });
});

test.describe("F-EXTRA-01 · estudo fora das metas", () => {
  test("cria a meta e o registro numa operação só", async ({ studentPage, scenario }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    const dialog = testId(studentPage, "extra-study-dialog");
    await expect(dialog).toBeVisible();

    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "minutes").fill("50");
    await field(studentPage, "questions").fill("12");
    await field(studentPage, "correctAnswers").fill("9");
    await dialog.getByRole("button", { name: "Lançar estudo" }).click();

    await expect(dialog).toHaveCount(0);

    const created = await one<{ id: string; type: string; status: string; title: string }>(
      `select id, type::text, status::text, title from public.goals
        where study_plan_id = $1 and type = 'extra' and subject = 'Direito Tributário'`,
      [scenario.planId],
    );
    // Nasce `extra` e nasce CONCLUÍDA: o estudo já aconteceu, e é o que o
    // aluno está lançando. `extra` também é o único tipo, junto de
    // `reinforcement`, que a RLS deixa o aluno criar e apagar.
    expect(created).toMatchObject({ type: "extra", status: "completed", title: "Lei seca" });

    await expect(goalRow(studentPage, created.id)).toContainText("Direito Tributário");
    await expect(goalRow(studentPage, created.id)).toContainText("50min");

    const entry = await one<{ minutes: number; questions: number }>(
      "select minutes, questions from public.goal_entries where goal_id = $1",
      [created.id],
    );
    expect(entry).toMatchObject({ minutes: 50, questions: 12 });
  });

  test("falha na leitura do plano não prende o diálogo — N-01", async ({
    studentPage,
    scenario,
    consoleErrors,
  }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    const dialog = testId(studentPage, "extra-study-dialog");
    await expect(dialog).toBeVisible();

    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "minutes").fill("50");

    // O adaptador LÊ o `starts_on` do plano antes de gravar (a regra da data é do
    // contrato, e quem a alimenta é ele). Derrubar essa leitura é o que sobrou de
    // "o passo anterior à gravação falha": desde o PR 5a a escrita não chama mais
    // `requireSession`, então o THROW de dentro do `once()` que o N-01 consertou
    // deixou de ter caminho nesta tela — quem o segura, agora, é
    // `request-memory.test.ts`. Aqui fica o que a tela promete: erro legível, botão
    // de volta, e a retentativa grava uma vez.
    //
    // Derruba ENQUANTO `caindo`, e não "uma vez": o postgrest-js repete o GET que
    // falha por rede (três vezes, com espera de 1, 2 e 4 s), e abortar só a
    // primeira tentativa não derrubaria nada.
    let caindo = true;
    await studentPage.route(
      (url) => url.pathname.endsWith("/rest/v1/study_plans"),
      (route) => (caindo ? route.abort("internetdisconnected") : route.fallback()),
    );

    const lancar = dialog.getByRole("button", { name: "Lançar estudo" });
    await lancar.click();
    await expect(alert(dialog, "error")).toContainText("Sem conexão", { timeout: 20_000 });
    await expect(lancar).toBeEnabled();

    caindo = false;
    await lancar.click();
    await expect(dialog).toHaveCount(0);

    const extras = await one<{ n: string }>(
      `select count(*) as n from public.goals
        where study_plan_id = $1 and type = 'extra' and subject = 'Direito Tributário'`,
      [scenario.planId],
    );
    expect(Number(extras.n)).toBe(1);
    // O `ExtraStudyDialog` já não escreve durante o render (QA-27): o console
    // inteiro precisa estar limpo, e não só os `pageerror`.
    expect(consoleErrors).toEqual([]);
  });

  test("a resposta que se perde cria uma meta só, com um registro — QA-04", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.route(
      "**/rest/v1/rpc/record_extra_study",
      async (route) => {
        await route.fetch();
        await route.abort();
      },
      { times: 1 },
    );

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    const dialog = testId(studentPage, "extra-study-dialog");
    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "minutes").fill("50");

    const lancar = dialog.getByRole("button", { name: "Lançar estudo" });
    await lancar.click();
    await expect(alert(dialog, "error")).toBeVisible();

    await lancar.click();
    await expect(dialog).toHaveCount(0);

    expect(
      await count(
        `select count(*) from public.goals
          where study_plan_id = $1 and type = 'extra' and subject = 'Direito Tributário'`,
        [scenario.planId],
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*) from public.goal_entries e join public.goals g on g.id = e.goal_id
          where g.study_plan_id = $1 and g.type = 'extra'`,
        [scenario.planId],
      ),
    ).toBe(1);
  });

  test("dois extras no mesmo dia cabem, em posições diferentes — N-02", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    for (const subject of ["Matéria N02 A", "Matéria N02 B"]) {
      await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
      const dialog = testId(studentPage, "extra-study-dialog");
      await field(studentPage, "subject").fill(subject);
      await field(studentPage, "minutes").fill("20");
      await dialog.getByRole("button", { name: "Lançar estudo" }).click();
      await expect(dialog).toHaveCount(0);
    }

    const extras = await query<{ id: string; day_position: number }>(
      `select id, day_position from public.goals
        where study_plan_id = $1 and type = 'extra'
          and subject in ('Matéria N02 A', 'Matéria N02 B')
        order by day_position`,
      [scenario.planId],
    );
    expect(extras).toHaveLength(2);
    expect(extras[0]!.day_position).not.toBe(extras[1]!.day_position);
    for (const extra of extras) {
      await expect(goalRow(studentPage, extra.id)).toBeVisible();
    }
  });

  test("a data fora do intervalo é recusada, e nenhuma meta nasce — QA-11", async ({
    studentPage,
    scenario,
  }) => {
    const { starts_on: startsOn } = await one<{ starts_on: string }>(
      "select starts_on::text from public.study_plans where id = $1",
      [scenario.planId],
    );
    const today = todayInSaoPaulo();

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    const dialog = testId(studentPage, "extra-study-dialog");
    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "minutes").fill("20");

    for (const date of [addDays(startsOn, -1), addDays(today, 1)]) {
      await field(studentPage, "date").fill(date);
      await dialog.getByRole("button", { name: "Lançar estudo" }).click();
      await expect(alert(dialog, "error")).toContainText("entre o início do planejamento e hoje");
    }

    expect(
      await count(
        `select count(*) from public.goals
          where study_plan_id = $1 and type = 'extra' and subject = 'Direito Tributário'`,
        [scenario.planId],
      ),
    ).toBe(0);
  });

  test("com 'Semana inteira' a data sugerida é hoje, e não a segunda — QA-14", async ({
    studentPage,
    scenario,
  }) => {
    const today = await startPlanThreeDaysAgo(scenario.planId);

    // Sem `page.clock`: adiantar o relógio do navegador além do real faz o
    // supabase-js tratar o token como vencido. Mover o `starts_on` basta.
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    await expect(testId(studentPage, "extra-study-dialog")).toBeVisible();
    await expect(field(studentPage, "date")).toHaveValue(today);
  });

  test("o extra lançado para ontem conta ontem, na semana — N-07", async ({
    studentPage,
    scenario,
  }) => {
    const today = await startPlanThreeDaysAgo(scenario.planId);
    const yesterday = addDays(today, -1);

    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    const dialog = testId(studentPage, "extra-study-dialog");
    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "date").fill(yesterday);
    await field(studentPage, "minutes").fill("20");
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("8");
    await dialog.getByRole("button", { name: "Lançar estudo" }).click();
    await expect(dialog).toHaveCount(0);

    const ontem = studentPage.locator(`[data-testid="day-group"][data-date="${yesterday}"]`);
    await expect(testId(ontem, "day-question-performance")).toContainText("10 questões");
    const hoje = studentPage.locator(`[data-testid="day-group"][data-date="${today}"]`);
    await expect(hoje).toBeVisible();
    await expect(testId(hoje, "day-question-performance")).toHaveCount(0);

    const entry = await one<{ studied_on: string }>(
      `select e.studied_on::text from public.goal_entries e join public.goals g on g.id = e.goal_id
        where g.study_plan_id = $1 and g.type = 'extra' and g.subject = 'Direito Tributário'`,
      [scenario.planId],
    );
    expect(entry.studied_on).toBe(yesterday);
  });

  test.describe("o cronômetro corrido — QA-27 e D-16", () => {
    test.beforeEach(async ({ studentPage }) => {
      // Um cronômetro `running` iniciado há 12 minutos, só se a chave estiver
      // vazia: o script roda a cada navegação, e sem a guarda recriaria o
      // cronômetro depois do Cancelar.
      await studentPage.addInitScript(() => {
        try {
          const key = "fronteira.study-timer.v1";
          if (window.localStorage.getItem(key) !== null) return;
          window.localStorage.setItem(
            key,
            JSON.stringify({
              elapsedMs: 0,
              startedAt: Date.now() - 12 * 60_000,
              running: true,
              mode: "stopwatch",
              phase: "focus",
              focusMinutes: 25,
              targetMs: 25 * 60_000,
              pomodorosCompleted: 0,
            }),
          );
        } catch {
          // Sem localStorage o teste não tem cronômetro: a asserção seguinte acusa.
        }
      });
    });

    test("abrir pausa sem escrever no render, e Cancelar retoma", async ({
      studentPage,
      consoleErrors,
    }) => {
      await studentPage.goto("/aluno?dia=todos");
      const pausar = studentPage.locator('[aria-label="Pausar cronômetro"]');
      await expect(pausar).toHaveCount(1);

      await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
      const dialog = testId(studentPage, "extra-study-dialog");
      await expect(alert(dialog, "info")).toContainText("Cronômetro pausado");
      // A barra fica atrás do diálogo (aria-hidden): casa pelo atributo, e não pelo papel.
      await expect(studentPage.locator('[aria-label="Iniciar cronômetro"]')).toHaveCount(1);

      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(studentPage.locator('[aria-label="Pausar cronômetro"]')).toHaveCount(1);
      expect(consoleErrors).toEqual([]);
    });

    test("o caminho do cronômetro abre em hoje, sem erro no console", async ({
      studentPage,
      consoleErrors,
    }) => {
      await studentPage.goto("/aluno?estudoExtra=cronometro");

      await expect(testId(studentPage, "extra-study-dialog")).toBeVisible();
      await expect(field(studentPage, "date")).toHaveValue(todayInSaoPaulo());
      expect(consoleErrors).toEqual([]);
    });
  });

  test("entra no tempo e no desempenho da semana", async ({ studentPage }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    const valores = testId(studentPage, "week-stat-value");

    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "minutes").fill("50");
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("10");
    await testId(studentPage, "extra-study-dialog")
      .getByRole("button", { name: "Lançar estudo" })
      .click();

    await expect(valores.nth(2)).toHaveText("50min");
    await expect(valores.nth(0)).toHaveText("10/10");
    await expect(testId(studentPage, "week-stat").nth(0)).toContainText("100% de aproveitamento");
  });

  test("matéria vazia é recusada", async ({ studentPage }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);

    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    const dialog = testId(studentPage, "extra-study-dialog");
    await field(studentPage, "minutes").fill("30");
    await dialog.getByRole("button", { name: "Lançar estudo" }).click();

    await expect(alert(dialog, "error")).toHaveText("Informe a matéria.");
  });
});

test.describe("F-META-06 · aluno sem planejamento ativo", () => {
  test.use({ scenarioOptions: { withPlan: false } });

  test("as três telas de estudo explicam, em vez de quebrar", async ({ studentPage }) => {
    for (const route of ["/aluno", "/aluno/planejamento", "/aluno/disciplinas"]) {
      await studentPage.goto(route);
      await expect(alert(studentPage, "info")).toContainText("Nenhum planejamento ativo");
    }
  });
});

test.describe("F-META-07 · planejamento em rascunho não é visto pelo aluno", () => {
  test.use({ scenarioOptions: { planStatus: "paused" } });

  test("um planejamento não ativo é o mesmo que nenhum", async ({ studentPage }) => {
    await studentPage.goto(STUDENT_WEEK_ALL_DAYS);
    await expect(alert(studentPage, "info")).toContainText("Nenhum planejamento ativo");
  });
});

test.describe("F-PLAN-01 · o planejamento, como o aluno o vê", () => {
  test("identidade, números e ciclo por peso", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno/planejamento");

    await expect(studentPage.locator("h1")).toHaveText("Meu curso");
    await expect(content(studentPage)).toContainText(scenario.planName);
    await expect(content(studentPage)).toContainText("PCPR — Investigador");
    await expect(content(studentPage)).toContainText("Avanço progressivo");
  });
});

test.describe("F-DISC-01 · disciplinas e blocos, só leitura", () => {
  test("sem nenhum controle de escrita na tela", async ({ studentPage }) => {
    await studentPage.goto("/aluno/disciplinas");
    await expect(studentPage.locator("h1")).toHaveText("Disciplinas");

    // O professor é quem cadastra. Um botão aqui seria promessa que a RLS
    // recusa: `subjects_insert` exige `is_teacher()`.
    await expect(content(studentPage).locator('input:not([type="hidden"])')).toHaveCount(0);
    await expect(content(studentPage).getByRole("button", { name: /Salvar|Adicionar/ })).toHaveCount(0);
  });
});
