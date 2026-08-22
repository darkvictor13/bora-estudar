/**
 * §2 do `docs/fluxos-e2e.md` — telas do aluno.
 */
import { expect, test } from "../fixtures/index.ts";
import { addWeek } from "../fixtures/scenario.ts";
import { completeQuiz } from "../fixtures/battery.ts";
import { count, one } from "../fixtures/db.ts";
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
