/**
 * §2 do `docs/fluxos-e2e.md` — telas do aluno.
 */
import { expect, test } from "../fixtures/index.ts";
import { addWeek, goalCount, goalStatus, type Scenario } from "../fixtures/scenario.ts";
import { completeQuiz } from "../fixtures/battery.ts";
import { asUser, count, one, query } from "../fixtures/db.ts";
import { PAGE_TITLES, STUDENT_ROUTES, STUDENT_STUDY_ROUTES } from "../support/routes.ts";
import { cardByTitle } from "../support/ui.ts";

test.describe("F-ALU-01 · todas as telas renderizam", () => {
  for (const route of STUDENT_ROUTES) {
    test(`${route} abre sem erro de console`, async ({ studentPage, consoleErrors }) => {
      await studentPage.goto(route);

      await expect(studentPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      expect(consoleErrors, `erros de console em ${route}`).toEqual([]);
    });
  }
});

test.describe("F-ALU-02 · seletor de semana", () => {
  test("mostra a semana pedida e navega entre elas", async ({ studentPage, scenario }) => {
    await addWeek(scenario, 2);

    await studentPage.goto("/aluno");
    await expect(studentPage.locator(".card__header", { hasText: "Semana 1" })).toBeVisible();

    // A navegação de semanas só aparece com mais de uma semana planejada.
    await studentPage.click('nav[aria-label="Semanas"] >> text="2"');
    await expect(studentPage).toHaveURL(/\?semana=2$/);
    await expect(studentPage.locator(".card__header", { hasText: "Semana 2" })).toBeVisible();
  });

  for (const [label, value] of [
    ["semana inexistente", "99"],
    ["texto", "abacaxi"],
    ["negativo", "-3"],
  ] as const) {
    test(`${label} cai na primeira semana com metas, sem quebrar`, async ({
      studentPage,
      consoleErrors,
    }) => {
      await studentPage.goto(`/aluno?semana=${value}`);

      await expect(studentPage.locator(".card__header", { hasText: "Semana 1" })).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe("F-ALU-03 · caderno de erros por bloco", () => {
  test("Ver erros lista as questões erradas do bloco", async ({ studentPage, scenario }) => {
    // 11 de 15 certas deixa 4 erros no caderno.
    const done = await completeQuiz(scenario, scenario.quizGoal, { correct: 11 });
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    await studentPage
      .locator("tr", { hasText: block.subjectName })
      .locator('a:has-text("Ver erros")')
      .click();

    await expect(studentPage).toHaveURL(new RegExp(`\\?bloco=${block.id}$`));
    const errorsCard = cardByTitle(studentPage, `Erros — ${block.name}`);
    await expect(errorsCard.locator(".card__sub")).toContainText("4 questão(ões)");
    await expect(errorsCard.locator("tbody tr")).toHaveCount(done.answered - done.correct);
  });

  test("bloco de outro planejamento é ignorado", async ({ studentPage, consoleErrors }) => {
    await studentPage.goto("/aluno/revisoes?bloco=bbbb0000-0000-4000-8000-000000009999");

    await expect(studentPage.locator("h1")).toHaveText("Revisões");
    await expect(studentPage.locator(".card", { hasText: "Erros —" })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("F-ALU-04 · editar os próprios dados", () => {
  test("salva, aparece na sidebar e persiste", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno/conta");

    await expect(studentPage.locator("#field-contactEmail")).toHaveAttribute("readonly", "");

    await studentPage.fill("#field-name", "Aluno Renomeado E2E");
    await studentPage.fill("#field-phone", "(41) 99999-1234");
    // Escopado em .content: `button[type=submit]` casaria o "Sair" da sidebar.
    await studentPage.click(".content button[type=submit]");

    await expect(studentPage.locator(".alert--success")).toHaveText("Dados atualizados.");
    await expect(studentPage.locator(".sidebar__user")).toContainText("Aluno Renomeado E2E");

    await studentPage.reload();
    await expect(studentPage.locator("#field-name")).toHaveValue("Aluno Renomeado E2E");
    await expect(studentPage.locator("#field-phone")).toHaveValue("(41) 99999-1234");

    const profile = await one<{ name: string; phone: string }>(
      "select name, phone from public.profiles where id = $1",
      [scenario.student.id],
    );
    expect(profile).toMatchObject({ name: "Aluno Renomeado E2E", phone: "(41) 99999-1234" });
  });

  test("nome curto é recusado", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");
    await studentPage.fill("#field-name", "Jo");
    await studentPage.click(".content button[type=submit]");

    await expect(studentPage.locator(".alert--error")).toHaveText("Informe seu nome completo.");
  });

  test("o campo de e-mail tem rótulo associado", async ({ studentPage }) => {
    // BUG-13: era um <span> solto, que leitor de tela não anuncia.
    await studentPage.goto("/aluno/conta");

    await expect(
      studentPage.locator('label[for="field-contactEmail"]'),
    ).toHaveText("E-mail de acesso");
  });
});

test.describe("F-ALU-05 · lista de espera", () => {
  test.use({ scenarioOptions: { access: "pending" } });

  test("salva, é upsert e não duplica", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno/lista-espera");

    await studentPage.fill("#field-whatsapp", "(41) 98888-0000");
    await studentPage.fill("#field-interestArea", "Policial");
    await studentPage.fill("#field-focusExam", "PCPR — Investigador");
    await studentPage.fill("#field-birthDate", "1995-04-20");
    await studentPage.fill("#field-timezone", "America/Sao_Paulo");
    await studentPage.click(".content button[type=submit]");

    await expect(studentPage.locator(".alert--success")).toHaveText(
      "Cadastro salvo. Você está na lista de espera.",
    );

    // Salvar de novo é upsert por student_id: uma linha, não duas.
    await studentPage.click(".content button[type=submit]");
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    expect(
      await count("select count(*) from public.waitlist where student_id = $1", [
        scenario.student.id,
      ]),
    ).toBe(1);
  });

  test("os três campos obrigatórios são validados na action", async ({ studentPage }) => {
    await studentPage.goto("/aluno/lista-espera");
    await studentPage.fill("#field-whatsapp", "(41) 98888-0000");
    await studentPage.click(".content button[type=submit]");

    await expect(studentPage.locator(".alert--error")).toHaveText(
      "Informe WhatsApp, área de interesse e concurso em foco.",
    );
  });
});

test.describe("F-ALU-05 · com acesso liberado a tela avisa", () => {
  test("mostra que o acesso já está liberado", async ({ studentPage }) => {
    await studentPage.goto("/aluno/lista-espera");

    await expect(studentPage.locator(".alert--success")).toContainText(
      "Seu acesso já está liberado",
    );
  });
});

test.describe("F-ALU-06 · aluno sem planejamento", () => {
  test.use({ scenarioOptions: { withPlan: false } });

  for (const route of STUDENT_STUDY_ROUTES) {
    test(`${route} avisa que não há planejamento ativo`, async ({
      studentPage,
      consoleErrors,
    }) => {
      await studentPage.goto(route);

      await expect(studentPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      await expect(studentPage.locator(".alert--info")).toContainText("Nenhum planejamento ativo");
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe("F-ALU-06 · planejamento em rascunho não é visto pelo aluno", () => {
  test.use({ scenarioOptions: { planStatus: "draft" } });

  test("o aluno vê a área vazia, não o rascunho do professor", async ({ studentPage }) => {
    await studentPage.goto("/aluno");

    await expect(studentPage.locator(".alert--info")).toContainText("Nenhum planejamento ativo");
  });
});

test.describe("F-ALU-07 · aluno sem assinatura ativa", () => {
  test.use({ scenarioOptions: { access: "suspended" } });

  for (const route of STUDENT_STUDY_ROUTES) {
    test(`${route} redireciona para a lista de espera`, async ({ studentPage }) => {
      await studentPage.goto(route);
      await expect(studentPage).toHaveURL(/\/aluno\/lista-espera$/);
    });
  }

  test("as telas livres continuam abrindo", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");
    await expect(studentPage.locator("h1")).toHaveText("Meus dados");

    await studentPage.goto("/aluno/lista-espera");
    await expect(studentPage.locator("h1")).toHaveText("Lista de espera");
  });

  test("os itens de estudo da sidebar ficam inertes e sem destino", async ({ studentPage }) => {
    // BUG-12: eram <Link> com aria-disabled, e o clique navegava, o servidor
    // devolvia, e a pessoa dava a volta inteira para não sair do lugar.
    await studentPage.goto("/aluno/conta");

    const disabled = studentPage.locator('.sidebar__link[aria-disabled="true"]');
    await expect(disabled).toHaveCount(STUDENT_STUDY_ROUTES.length);
    for (const item of await disabled.all()) {
      expect(await item.evaluate((node) => node.tagName)).toBe("SPAN");
    }
  });

  test("o aviso de acesso não liberado aparece no topo", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");

    await expect(studentPage.locator(".alert--warning")).toContainText(
      "Seu acesso ainda não foi liberado",
    );
  });
});

test.describe("F-BAT-14 · os números chegam a todas as telas", () => {
  test("11 de 15 aparece como 73% em cada tela", async ({ studentPage, scenario }) => {
    const done = await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno");
    const row = studentPage.locator("tr", { hasText: scenario.quizGoal.title });
    await expect(row).toContainText("11/15");
    await expect(row).toContainText("73%");
    await expect(row.locator(".badge")).toHaveText("Concluída");

    await studentPage.goto("/aluno/estatisticas");
    const official = cardByTitle(studentPage, "Desempenho oficial");
    await expect(official).toContainText("73%");
    await expect(official).toContainText("11 acertos em 15 principais");

    await studentPage.goto("/aluno/disciplinas");
    const subject = studentPage.locator("tr", { hasText: block.subjectName });
    await expect(subject).toContainText("73%");
    await expect(subject.locator(".badge")).toHaveText("Abaixo");

    await studentPage.goto("/aluno/cadernos");
    await expect(studentPage.locator("tr", { hasText: block.name })).toContainText("73%");

    await studentPage.goto(`/aluno/revisoes?bloco=${block.id}`);
    const errors = cardByTitle(studentPage, `Erros — ${block.name}`);
    await expect(errors.locator("tbody tr")).toHaveCount(4);
    await expect(errors.locator("tbody tr").first()).toContainText("principal");

    expect(done.correct).toBe(11);
  });

  test("bateria abaixo da meta três vezes vira reforço recomendado", async ({
    studentPage,
    scenario,
  }) => {
    // Mesma regra do reforço automático: três baterias válidas no bloco e
    // acumulado abaixo de 80% nas principais.
    const block = scenario.blocks[0]!;
    const firstGoal = scenario.goals.find((goal) => goal.blockId === block.id)!;
    await completeQuiz(scenario, firstGoal, { correct: 10 });

    for (const week of [2, 3]) {
      const goals = await addWeek(scenario, week);
      const goal = goals.find((candidate) => candidate.blockId === block.id)!;
      await completeQuiz(scenario, goal, { correct: 10 });
    }

    await studentPage.goto("/aluno/revisoes");
    const row = studentPage.locator("tr", { hasText: block.subjectName });
    await expect(row).toContainText("3");
    await expect(row.locator(".badge")).toHaveText("Reforço recomendado");
  });
});

test.describe("F-ALU-01 · o badge compara com a meta do professor", () => {
  // A meta é por disciplina e quem a define é o professor. Com 60% em vez dos
  // 80% do seed, o MESMO desempenho de 73% muda de lado — o que prova que a
  // tela compara com `subject_target`, e não com um número fixo no código.
  test.use({ scenarioOptions: { subjectTarget: 60 } });

  test("73% fica 'Na meta' quando a meta é 60%", async ({ studentPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/disciplinas");
    const row = studentPage.locator("tbody tr", { hasText: block.subjectName });
    await expect(row).toContainText("60%");
    await expect(row).toContainText("73%");
    await expect(row.locator(".badge")).toHaveText("Na meta");

    await studentPage.goto("/aluno/cadernos");
    await expect(
      studentPage.locator("tbody tr", { hasText: block.name }).locator(".badge"),
    ).toHaveText("Na meta");
  });
});

// ---------------------------------------------------------------------------
// §2 — conclusão de meta sem bateria. Spec docs/specs/12-conclusao-de-meta.md
// ---------------------------------------------------------------------------

/**
 * A meta de teoria da semana 1 do cenário, que é a primeira do dia 1.
 *
 * `createScenario` monta a semana pela RPC real, então o título carrega o
 * sufixo do planejamento — casar por `type` é o que sobrevive a isso.
 */
function theoryGoalOf(scenario: { goals: readonly { type: string; title: string; id: string }[] }) {
  const goal = scenario.goals.find((g) => g.type === "theory");
  if (!goal) throw new Error("este cenário não tem meta de teoria");
  return goal;
}

/** Linha da tabela da semana, pela meta. */
function goalRow(page: import("@playwright/test").Page, title: string) {
  return page.locator("tbody tr", { hasText: title });
}

test.describe("F-CONC-01 · concluir meta de teoria", () => {
  test("grava status, tempo e observação, e a linha vira Concluída", async ({
    studentPage,
    scenario,
  }) => {
    const goal = theoryGoalOf(scenario);

    await studentPage.goto("/aluno");
    const row = goalRow(studentPage, goal.title);
    await expect(row.locator(".badge")).toHaveText("Pendente");

    await row.getByRole("button", { name: "Concluir" }).click();
    await row.locator('input[name="minutes"]').fill("45");
    await row.locator('textarea[name="note"]').fill("Li o capítulo 1.");
    await row.getByRole("button", { name: "Concluir meta" }).click();

    await expect(studentPage.locator(".alert--success")).toHaveText("Meta concluída.");
    await expect(goalRow(studentPage, goal.title).locator(".badge")).toHaveText("Concluída");
    await expect(goalRow(studentPage, goal.title)).toContainText("Você anotou:");
    await expect(goalRow(studentPage, goal.title)).toContainText("45min");

    const saved = await one<{
      status: string;
      spent_minutes: number;
      student_note: string;
      completed_at: string | null;
    }>(
      "select status::text, spent_minutes, student_note, completed_at from public.goals where id = $1",
      [goal.id],
    );
    expect(saved).toMatchObject({
      status: "completed",
      spent_minutes: 45,
      student_note: "Li o capítulo 1.",
    });
    expect(saved.completed_at).not.toBeNull();
  });
});

test.describe("F-CONC-02 · a contagem da semana e a ficha do professor sobem junto", () => {
  test("nenhum dos dois números é escrito à mão", async ({ studentPage, page, scenario, signIn }) => {
    const goal = theoryGoalOf(scenario);

    await studentPage.goto("/aluno");
    // O cenário tem 5 metas na semana 1 e nenhuma concluída.
    await expect(studentPage.locator(".card__sub").first()).toHaveText("0 de 5 metas concluídas");

    await goalRow(studentPage, goal.title).getByRole("button", { name: "Concluir" }).click();
    await goalRow(studentPage, goal.title).locator('input[name="minutes"]').fill("1:20");
    await goalRow(studentPage, goal.title)
      .getByRole("button", { name: "Concluir meta" })
      .click();

    await expect(studentPage.locator(".card__sub").first()).toHaveText("1 de 5 metas concluídas");
    // "1:20" é 80 minutos — o mesmo parseDuration do registro de tempo.
    await expect(goalRow(studentPage, goal.title)).toContainText("1h20");

    // O mesmo número, do outro lado: a ficha do professor lê goals.status.
    await signIn(scenario.teacher);
    await page.goto(`/professor/alunos/${scenario.student.id}`);
    await expect(cardByTitle(page, "Metas").locator("p:not(.card__sub)").first()).toHaveText("1 / 5");
  });
});

test.describe("F-CONC-03 · validação do tempo", () => {
  for (const [label, value, message] of [
    ["vazio de números", "abacaxi", "Informe o tempo em minutos ou no formato hora:minuto. Ex.: 80 ou 1:20."],
    ["zero", "0", "Informe o tempo em minutos ou no formato hora:minuto. Ex.: 80 ou 1:20."],
    ["acima do teto", "241", "O tempo de uma meta não passa de 240 minutos (4 horas)."],
  ] as const) {
    test(`${label} é recusado e nada é gravado`, async ({ studentPage, scenario }) => {
      const goal = theoryGoalOf(scenario);

      await studentPage.goto("/aluno");
      const row = goalRow(studentPage, goal.title);
      await row.getByRole("button", { name: "Concluir" }).click();
      await row.locator('input[name="minutes"]').fill(value);
      await row.getByRole("button", { name: "Concluir meta" }).click();

      await expect(row.locator(".alert--error")).toHaveText(message);

      const saved = await one<{ status: string; spent_minutes: number | null }>(
        "select status::text, spent_minutes from public.goals where id = $1",
        [goal.id],
      );
      expect(saved).toMatchObject({ status: "pending", spent_minutes: null });
    });
  }
});

test.describe("F-CONC-04 · a observação sobrevive a desfazer", () => {
  test("o que o aluno escreveu continua valendo", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);

    await studentPage.goto("/aluno");
    let row = goalRow(studentPage, goal.title);
    await row.getByRole("button", { name: "Concluir" }).click();
    await row.locator('input[name="minutes"]').fill("30");
    await row.locator('textarea[name="note"]').fill("Anotação que sobrevive.");
    await row.getByRole("button", { name: "Concluir meta" }).click();

    await expect(goalRow(studentPage, goal.title)).toContainText("Anotação que sobrevive.");

    row = goalRow(studentPage, goal.title);
    await row.getByRole("button", { name: "Desfazer" }).click();

    // R-CONC-13: reabrir zera o tempo e PRESERVA a observação.
    await expect(goalRow(studentPage, goal.title).locator(".badge")).toHaveText("Pendente");
    await expect(goalRow(studentPage, goal.title)).toContainText("Anotação que sobrevive.");

    const saved = await one<{ spent_minutes: number | null; student_note: string }>(
      "select spent_minutes, student_note from public.goals where id = $1",
      [goal.id],
    );
    expect(saved).toMatchObject({ spent_minutes: null, student_note: "Anotação que sobrevive." });
  });
});

test.describe("F-CONC-05 · desfazer derruba a contagem", () => {
  test("volta a pendente e o número da semana desce", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);

    await studentPage.goto("/aluno");
    const row = goalRow(studentPage, goal.title);
    await row.getByRole("button", { name: "Concluir" }).click();
    await row.locator('input[name="minutes"]').fill("45");
    await row.getByRole("button", { name: "Concluir meta" }).click();
    await expect(studentPage.locator(".card__sub").first()).toHaveText("1 de 5 metas concluídas");

    await goalRow(studentPage, goal.title).getByRole("button", { name: "Desfazer" }).click();

    await expect(studentPage.locator(".alert--success")).toHaveText(
      "Meta reaberta. Ela voltou para pendente.",
    );
    await expect(studentPage.locator(".card__sub").first()).toHaveText("0 de 5 metas concluídas");
    expect(await goalStatus(goal.id)).toBe("pending");
  });
});

test.describe("F-CONC-06 · meta de bateria não conclui por aqui", () => {
  test("a linha oferece a bateria, não o formulário de conclusão", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    const row = goalRow(studentPage, scenario.quizGoal.title);

    await expect(row.getByRole("button", { name: "Iniciar bateria" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Concluir", exact: true })).toHaveCount(0);
  });

  test("a RPC recusa a meta de bateria mesmo chamada direto", async ({ scenario }) => {
    // A tela nunca oferece este caminho; a asserção prova que a regra mora no
    // banco, e não na ausência do botão.
    await expect(
      asUser(scenario.student.id, (client) =>
        client.query("select public.complete_goal($1::uuid, gen_random_uuid(), 60, null)", [
          scenario.quizGoal.id,
        ]),
      ),
    ).rejects.toThrow(/meta de bateria conclui-se pela bateria/);

    expect(await goalStatus(scenario.quizGoal.id)).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// §2 — estudo extra avulso. Spec docs/specs/19-estudo-extra-avulso.md
// ---------------------------------------------------------------------------

/** Abre e preenche o formulário de estudo extra. */
async function registerExtra(
  page: import("@playwright/test").Page,
  { activity = "flashcards", minutes = "45", note = "" }: {
    activity?: string;
    minutes?: string;
    note?: string;
  } = {},
) {
  await page.getByRole("button", { name: "Registrar estudo extra" }).click();
  await page.locator("#extra-activity").selectOption(activity);
  await page.locator("#extra-minutes").fill(minutes);
  if (note) await page.locator("#extra-note").fill(note);
  await page.locator(".content").getByRole("button", { name: "Registrar", exact: true }).click();
}

test.describe("F-EXTRA-01 · registrar estudo extra", () => {
  test("cria a meta já concluída, com título derivado do tipo", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await registerExtra(studentPage, { activity: "flashcards", minutes: "45", note: "Baralho de penal" });

    await expect(studentPage.locator(".alert--success")).toHaveText("Estudo extra registrado.");

    const row = studentPage.locator("tbody tr", { hasText: "Estudo extra — Anki" });
    await expect(row.locator(".badge")).toHaveText("Concluída");
    await expect(row).toContainText("Baralho de penal");
    await expect(row).toContainText("45min");

    const saved = await one<{
      status: string;
      extra_activity: string;
      spent_minutes: number;
      created_by: string;
      block_id: string | null;
    }>(
      `select status::text, extra_activity::text, spent_minutes, created_by, block_id
         from public.goals where study_plan_id = $1 and title = 'Estudo extra — Anki'`,
      [scenario.planId],
    );
    expect(saved).toMatchObject({
      status: "completed",
      extra_activity: "flashcards",
      spent_minutes: 45,
      created_by: scenario.student.id,
      block_id: null,
    });
  });
});

test.describe("F-EXTRA-02 · entra no tempo, não no desempenho", () => {
  test("a contagem da semana sobe dos dois lados e nenhum acerto muda", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator(".card__sub").first()).toHaveText("0 de 5 metas concluídas");

    await registerExtra(studentPage, { minutes: "1:20" });

    // A meta nasce concluída: sobe o numerador E o denominador.
    await expect(studentPage.locator(".card__sub").first()).toHaveText("1 de 6 metas concluídas");
    await expect(studentPage.locator("tbody tr", { hasText: "Estudo extra — Anki" })).toContainText(
      "1h20",
    );

    // Nenhum número de acerto: estudo extra tem tempo, não tem acerto.
    const perf = await one<{ questions_answered: string; minutes_spent: string }>(
      `select questions_answered, minutes_spent from public.vw_goal_performance
        where goal_id = (select id from public.goals
                          where study_plan_id = $1 and title = 'Estudo extra — Anki')`,
      [scenario.planId],
    );
    expect(Number(perf.questions_answered)).toBe(0);
    expect(Number(perf.minutes_spent)).toBe(80);
  });
});

test.describe("F-EXTRA-03 · os sete tipos", () => {
  test("são oferecidos e gravam o valor em inglês", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno");
    await studentPage.getByRole("button", { name: "Registrar estudo extra" }).click();

    const options = await studentPage.locator("#extra-activity option").allTextContents();
    expect(options).toEqual([
      "Lei seca",
      "Anki",
      "Simulado",
      "Revisão",
      "Questões extras",
      "Videoaula",
      "Outro",
    ]);

    await studentPage.locator("#extra-activity").selectOption("mock_exam");
    await studentPage.locator("#extra-minutes").fill("120");
    await studentPage.locator(".content").getByRole("button", { name: "Registrar", exact: true }).click();

    await expect(studentPage.locator("tbody tr", { hasText: "Estudo extra — Simulado" })).toBeVisible();
    expect(
      await count(
        "select count(*) from public.goals where study_plan_id = $1 and extra_activity = 'mock_exam'",
        [scenario.planId],
      ),
    ).toBe(1);
  });
});

test.describe("F-EXTRA-04 · remover", () => {
  test("marca deleted_at e a linha some da semana", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno");
    await registerExtra(studentPage);
    await expect(studentPage.locator("tbody tr", { hasText: "Estudo extra — Anki" })).toBeVisible();

    await studentPage
      .locator("tbody tr", { hasText: "Estudo extra — Anki" })
      .getByRole("button", { name: "Remover" })
      .click();

    await expect(studentPage.locator(".alert--success")).toHaveText("Registro removido.");
    await expect(studentPage.locator("tbody tr", { hasText: "Estudo extra — Anki" })).toHaveCount(0);

    // deleted_at, nunca DELETE: a linha continua no banco.
    const saved = await one<{ deleted_at: string | null }>(
      "select deleted_at from public.goals where study_plan_id = $1 and title = 'Estudo extra — Anki'",
      [scenario.planId],
    );
    expect(saved.deleted_at).not.toBeNull();
  });
});

test.describe("F-EXTRA-05 · a meta do professor não é removível pelo aluno", () => {
  test("a linha planejada não oferece Remover", async ({ studentPage, scenario }) => {
    // O cenário traz uma meta extra_study criada pelo PROFESSOR.
    const doProfessor = scenario.goals.find((g) => g.type === "extra_study")!;

    await studentPage.goto("/aluno");
    const row = studentPage.locator("tbody tr", { hasText: doProfessor.title });

    // Ela está pendente, então oferece Concluir — e nunca Remover.
    await expect(row.getByRole("button", { name: "Remover" })).toHaveCount(0);

    // E a RPC recusa mesmo chamada direto: created_by é do professor.
    await expect(
      asUser(scenario.student.id, (client) =>
        client.query("select public.delete_extra_study($1::uuid, gen_random_uuid())", [
          doProfessor.id,
        ]),
      ),
    ).rejects.toThrow(/planejada pelo professor/);
  });
});

test.describe("F-EXTRA-06 · validação do tempo", () => {
  for (const [label, value] of [
    ["acima do teto", "241"],
    ["texto", "abacaxi"],
  ] as const) {
    test(`${label} é recusado e nada é gravado`, async ({ studentPage, scenario }) => {
      const antes = await goalCount(scenario.planId);

      await studentPage.goto("/aluno");
      await registerExtra(studentPage, { minutes: value });

      await expect(studentPage.locator(".alert--error")).toBeVisible();
      expect(await goalCount(scenario.planId)).toBe(antes);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — execução do reforço de ciclo.
// Spec docs/specs/20-execucao-do-reforco.md
// ---------------------------------------------------------------------------

/** Três baterias abaixo de 80% no mesmo bloco: um ciclo aberto. */
async function openCycle(scenario: Scenario, correct = 8) {
  const goal = scenario.quizGoal;
  const done = [await completeQuiz(scenario, goal, { correct, minutes: 60 })];
  for (const week of [2, 3]) {
    const [novaGoal] = await addWeek(scenario, week);
    // addWeek cria uma bateria por bloco; a primeira é do mesmo bloco do quizGoal.
    const mesmoBloco = (await addWeekGoalsOf(scenario, week)).find(
      (g) => g.blockId === goal.blockId,
    )!;
    done.push(await completeQuiz(scenario, mesmoBloco, { correct, minutes: 60 }));
    void novaGoal;
  }
  return done;
}

/** As metas de uma semana já criada, na ordem. */
async function addWeekGoalsOf(scenario: Scenario, week: number) {
  const rows = await query<{ id: string; type: string; title: string; weekday: number; block_id: string | null }>(
    `select id, type::text, title, weekday, block_id from public.goals
      where study_plan_id = $1 and week_number = $2 and deleted_at is null
      order by weekday, day_order`,
    [scenario.planId, week],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type as "theory" | "question_block" | "extra_study" | "reinforcement",
    title: r.title,
    weekday: r.weekday,
    blockId: r.block_id,
  }));
}

const cycleCard = (page: import("@playwright/test").Page, blockName: string) =>
  cardByTitle(page, `Reforço — ${blockName}`);

test.describe("F-RCIC-01 · o ciclo aberto aparece com os erros", () => {
  test("três baterias abaixo de 80% oferecem o reforço", async ({ studentPage, scenario }) => {
    await openCycle(scenario, 8);
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    const card = cycleCard(studentPage, block.name);

    // 24 de 45 = 53% → abaixo de 75, prioridade alta.
    await expect(card).toContainText("53% nas principais");
    await expect(card.locator(".badge")).toHaveText("Prioridade alta");
    // 7 erradas por bateria, mas o bloco do catálogo tem 30 questões: a
    // terceira bateria já repete o que a primeira viu, então os ERROS ÚNICOS
    // do ciclo são 15, não 21. É `getCycleErrors` deduplicando por questão.
    await expect(card).toContainText("15 questão(ões) a revisar");
    await expect(card.locator("tbody tr")).toHaveCount(15);
  });
});

test.describe("F-RCIC-02 · concluir o reforço", () => {
  test("grava e o ciclo some da lista", async ({ studentPage, scenario }) => {
    await openCycle(scenario, 8);
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    const card = cycleCard(studentPage, block.name);

    // `.all()` NÃO espera por nada. Numa SPA a tabela só existe depois de os
    // loaders da rota resolverem, o que é DEPOIS do `load` que o `goto`
    // aguarda — sem esta asserção a lista volta vazia, nenhum radio é marcado,
    // e o teste falha dizendo que faltaram 15 quando na verdade nada foi lido.
    await expect(card.locator("tbody tr")).toHaveCount(15);
    for (const radio of await card.locator('input[value="correct"]').all()) {
      await radio.check();
    }
    await card.getByRole("button", { name: "Concluir reforço" }).click();

    await expect(studentPage.locator(".alert--success")).toContainText("Reforço concluído");
    await expect(cycleCard(studentPage, block.name)).toHaveCount(0);

    // O reforço e as três baterias ficaram ligados, e as questões foram gravadas.
    expect(
      await count("select count(*) from public.reinforcements where block_id = $1", [block.id]),
    ).toBe(1);
    expect(
      await count(
        `select count(*) from public.reinforcement_sessions rs
           join public.reinforcements r on r.id = rs.reinforcement_id
          where r.block_id = $1`,
        [block.id],
      ),
    ).toBe(3);
    expect(
      await count(
        `select count(*) from public.reinforcement_questions rq
           join public.reinforcements r on r.id = rq.reinforcement_id
          where r.block_id = $1`,
        [block.id],
      ),
    ).toBe(15);
  });
});

test.describe("F-RCIC-03 · faltando marcar", () => {
  test("o envio é impedido, com a contagem do que falta", async ({ studentPage, scenario }) => {
    await openCycle(scenario, 8);
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    const card = cycleCard(studentPage, block.name);

    // Mesma razão do teste acima: `.all()` não espera.
    await expect(card.locator("tbody tr")).toHaveCount(15);
    // Marca todas menos duas.
    const radios = await card.locator('input[value="correct"]').all();
    for (const radio of radios.slice(0, radios.length - 2)) await radio.check();
    await card.getByRole("button", { name: "Concluir reforço" }).click();

    await expect(card.locator(".alert--error")).toContainText("faltam 2");
    expect(
      await count("select count(*) from public.reinforcements where block_id = $1", [block.id]),
    ).toBe(0);
  });
});

test.describe("F-RCIC-04 · o que muda depois", () => {
  test("Ciclos revisados sobe e o desempenho das baterias não muda", async ({
    studentPage,
    scenario,
  }) => {
    await openCycle(scenario, 8);
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    const linha = studentPage.locator("tbody tr", { hasText: block.name });
    await expect(linha).toContainText("53%");

    const card = cycleCard(studentPage, block.name);
    await expect(card.locator("tbody tr")).toHaveCount(15);
    for (const radio of await card.locator('input[value="incorrect"]').all()) await radio.check();
    await card.getByRole("button", { name: "Concluir reforço" }).click();
    await expect(studentPage.locator(".alert--success")).toBeVisible();

    // Reforço não anula bateria: o desempenho oficial continua o mesmo.
    const depois = studentPage.locator("tbody tr", { hasText: block.name });
    await expect(depois).toContainText("53%");
    // E "Ciclos revisados" passou de 0 para 1.
    await expect(depois).toContainText("1");
  });
});

test.describe("F-RCIC-05 · quando não há reforço a fazer", () => {
  test("com menos de três baterias não aparece ciclo", async ({ studentPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 8, minutes: 60 });
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    await expect(cycleCard(studentPage, block.name)).toHaveCount(0);
  });

  test("com o acumulado em 80% ou mais, o ciclo se fecha sozinho", async ({
    studentPage,
    scenario,
  }) => {
    // 12 de 15 em cada = 80% exatos.
    await openCycle(scenario, 12);
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await studentPage.goto("/aluno/revisoes");
    await expect(cycleCard(studentPage, block.name)).toHaveCount(0);
  });
});

test.describe("F-RCIC-06 · o professor vê, e não executa", () => {
  test("a prioridade aparece na tela dele, sem botão de concluir", async ({
    page,
    scenario,
    signIn,
  }) => {
    await openCycle(scenario, 8);

    await signIn(scenario.teacher);
    await page.goto("/professor/revisoes");

    await expect(page.locator("tbody tr", { hasText: scenario.blocks[0]!.subjectName })).toBeVisible();
    await expect(page.getByRole("button", { name: "Concluir reforço" })).toHaveCount(0);
  });
});
