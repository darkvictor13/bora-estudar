/**
 * §4 do `docs/fluxos-e2e.md` — telas do professor.
 */
import { expect, test } from "../fixtures/index.ts";
import { addWeek, createScenario, goalCount, planWeeks, setAccess } from "../fixtures/scenario.ts";
import { completeQuiz } from "../fixtures/battery.ts";
import { count, query } from "../fixtures/db.ts";
import { PAGE_TITLES, TEACHER_ROUTES, studentPageOf } from "../support/routes.ts";
import { cardByTitle } from "../support/ui.ts";

test.describe("F-PROF-01 · todas as telas renderizam", () => {
  for (const route of TEACHER_ROUTES) {
    test(`${route} abre sem erro de console`, async ({ teacherPage, consoleErrors }) => {
      await teacherPage.goto(route);

      await expect(teacherPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      expect(consoleErrors, `erros de console em ${route}`).toEqual([]);
    });
  }
});

test.describe("F-PROF-02 · lista de alunos", () => {
  test("uma linha por vínculo vigente, com contato e planejamento", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto("/professor");

    await expect(teacherPage.locator(".content__header p")).toContainText("1 aluno(s)");

    const row = teacherPage.locator("tbody tr", { hasText: scenario.student.name });
    await expect(row).toContainText(scenario.student.email);
    await expect(row).toContainText(scenario.planName);
    await expect(row.locator(".badge")).toHaveText("Acesso ativo");
  });

  for (const [status, label] of [
    ["pending", "Aguardando liberação"],
    ["suspended", "Suspenso"],
    ["expired", "Expirado"],
  ] as const) {
    test(`assinatura ${status} aparece como "${label}"`, async ({ teacherPage, scenario }) => {
      await setAccess(scenario.student.id, status);

      await teacherPage.goto("/professor");
      const row = teacherPage.locator("tbody tr", { hasText: scenario.student.name });
      await expect(row.locator(".badge")).toHaveText(label);
    });
  }

  test("assinatura antiga não esconde a ativa", async ({ teacherPage, scenario }) => {
    // BUG-07: getMyStudents montava um Map por student_id sem filtrar, e quem
    // sobrava era a última linha que o PostgREST devolveu — um aluno que
    // renovou aparecia como "Expirado" enquanto entrava no sistema
    // normalmente.
    await query(
      `insert into public.subscriptions (student_id, status, plan, validity)
       values ($1, 'expired', 'antiga', daterange('2020-01-01','2020-06-01','[)'))`,
      [scenario.student.id],
    );

    await teacherPage.goto("/professor");
    const row = teacherPage.locator("tbody tr", { hasText: scenario.student.name });
    await expect(row.locator(".badge")).toHaveText("Acesso ativo");
  });
});

test.describe("F-PROF-03 · ficha do aluno", () => {
  test("mostra planejamentos, metas, desempenho e semanas", async ({ teacherPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });

    await teacherPage.goto("/professor");
    await teacherPage
      .locator("tbody tr", { hasText: scenario.student.name })
      .locator('a:has-text("Abrir")')
      .click();

    await expect(teacherPage).toHaveURL(studentPageOf(scenario.student.id));
    await expect(teacherPage.locator("h1")).toHaveText(scenario.student.name);

    await expect(cardByTitle(teacherPage, "Planejamentos")).toContainText(scenario.planName);
    // 1 concluída de 5 metas na semana. O `p` do corpo, não o `.card__sub`,
    // que também é um `p` e vem antes na ordem do documento.
    await expect(
      cardByTitle(teacherPage, "Metas").locator("p:not(.card__sub)").first(),
    ).toHaveText("1 / 5");
    await expect(cardByTitle(teacherPage, "Desempenho oficial")).toContainText("73%");
    await expect(cardByTitle(teacherPage, "Semanas planejadas")).toContainText("semanas 1");
  });

  for (const [label, id] of [
    ["id inexistente", "a1000000-0000-4000-8000-000000009999"],
    ["id malformado", "nao-e-um-uuid"],
  ] as const) {
    test(`${label} dá 404`, async ({ teacherPage }) => {
      const response = await teacherPage.goto(studentPageOf(id));
      expect(response?.status()).toBe(404);
    });
  }

  test("aluno de outro professor dá 404", async ({ teacherPage, scenario }) => {
    // Um segundo par, criado à parte: o professor deste cenário não tem
    // vínculo nenhum com o aluno de lá. É a mesma regra do §5, vista pela
    // tela em vez de pela RLS.
    const outro = await createScenario({ withGoals: false });
    expect(outro.student.id).not.toBe(scenario.student.id);

    const response = await teacherPage.goto(studentPageOf(outro.student.id));
    expect(response?.status()).toBe(404);
  });
});

test.describe("F-PROF-04/05/06 · gerar metas da semana", () => {
  test("cria as metas e reenviar o mesmo lote é no-op", async ({ teacherPage, scenario }) => {
    const antes = await goalCount(scenario.planId);

    await teacherPage.goto("/professor/metas");

    // O padrão de #week é a última semana planejada + 1.
    await expect(teacherPage.locator("#week")).toHaveValue("2");
    await expect(teacherPage.locator("#minutes")).toHaveValue("60");
    await expect(teacherPage.locator("#mode")).toHaveValue("append");

    // Seg–sex marcados por padrão, todos os blocos marcados, teoria ligada.
    await expect(teacherPage.locator("input[name=weekdays]:checked")).toHaveCount(5);
    await expect(teacherPage.locator("input[name=blocks]:checked")).toHaveCount(
      scenario.blocks.length,
    );
    await expect(teacherPage.locator("input[name=withTheory]")).toBeChecked();

    await teacherPage.click('button:has-text("Gerar metas da semana")');

    // 2 blocos com teoria ligada: teoria + bateria para cada.
    await expect(teacherPage.locator(".alert--success")).toHaveText(
      "4 meta(s) criada(s) na semana 2.",
    );
    expect(await goalCount(scenario.planId)).toBe(antes + 4);
    expect(await planWeeks(scenario.planId)).toEqual([1, 2]);

    // Depois de gerar, o formulário já vem apontando para a semana seguinte:
    // `nextWeek` é recalculado no servidor e o `revalidatePath` da action o
    // traz de volta. Um segundo clique cego, portanto, planeja a semana 3 —
    // não duplica a 2.
    await expect(teacherPage.locator("#week")).toHaveValue("3");

    // BUG-05: o batch_id vinha de randomUUID() a cada submissão, então cada
    // reenvio chegava ao banco como lote inédito e as metas somavam de novo.
    // A tela promete literalmente que reenviar o mesmo lote não duplica; é o
    // que se verifica aqui, voltando o campo para a semana 2.
    await teacherPage.fill("#week", "2");
    await teacherPage.click('button:has-text("Gerar metas da semana")');
    await expect(teacherPage.locator(".alert--success")).toContainText(
      "Este lote já tinha sido aplicado",
    );
    expect(await goalCount(scenario.planId)).toBe(antes + 4);
  });

  test("sem teoria cria só as baterias", async ({ teacherPage, scenario }) => {
    const antes = await goalCount(scenario.planId);

    await teacherPage.goto("/professor/metas");
    await teacherPage.uncheck("input[name=withTheory]");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--success")).toHaveText(
      "2 meta(s) criada(s) na semana 2.",
    );
    expect(await goalCount(scenario.planId)).toBe(antes + 2);
  });

  test("sem dia escolhido é recusado", async ({ teacherPage }) => {
    await teacherPage.goto("/professor/metas");
    // Desmarca por posição, não pelo seletor `:checked`: a lista `:checked`
    // encurta a cada clique e os índices já obtidos deixam de casar.
    for (const day of await teacherPage.locator("input[name=weekdays]").all()) {
      await day.uncheck();
    }
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--error")).toHaveText(
      "Escolha pelo menos um dia de estudo.",
    );
  });

  test("sem bloco escolhido é recusado", async ({ teacherPage }) => {
    await teacherPage.goto("/professor/metas");
    for (const block of await teacherPage.locator("input[name=blocks]").all()) {
      await block.uncheck();
    }
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--error")).toHaveText(
      "Escolha pelo menos um bloco.",
    );
  });
});

test.describe("F-PROF-07 · modos replace e replan", () => {
  test("replace apaga as pendentes e recria a semana", async ({ teacherPage, scenario }) => {
    const pendentesAntes = await count(
      `select count(*) from public.goals
        where study_plan_id = $1 and week_number = 1 and deleted_at is null`,
      [scenario.planId],
    );
    expect(pendentesAntes).toBe(5);

    await teacherPage.goto("/professor/metas");
    await teacherPage.fill("#week", "1");
    await teacherPage.selectOption("#mode", "replace");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--success")).toHaveText(
      "4 meta(s) criada(s) na semana 1.",
    );
    // As 5 antigas saíram por deleted_at; sobraram as 4 novas.
    expect(
      await count(
        `select count(*) from public.goals
          where study_plan_id = $1 and week_number = 1 and deleted_at is null`,
        [scenario.planId],
      ),
    ).toBe(4);
    expect(
      await count(
        `select count(*) from public.goals
          where study_plan_id = $1 and week_number = 1 and deleted_at is not null`,
        [scenario.planId],
      ),
    ).toBe(5);
  });

  test("replan preserva a meta que já teve bateria concluída", async ({
    teacherPage,
    scenario,
  }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });

    await teacherPage.goto("/professor/metas");
    await teacherPage.fill("#week", "1");
    await teacherPage.selectOption("#mode", "replan");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--success")).toContainText("na semana 1.");

    // A meta concluída continua viva.
    expect(
      await count("select count(*) from public.goals where id = $1 and deleted_at is null", [
        scenario.quizGoal.id,
      ]),
    ).toBe(1);
  });

  test("bateria aberta na semana bloqueia replace", async ({ page, signIn, scenario }) => {
    // Duas identidades no mesmo teste, uma depois da outra na MESMA aba.
    // `studentPage` e `teacherPage` juntos brigariam pelos cookies do mesmo
    // contexto; `signIn` troca de identidade de forma explícita.
    await signIn(scenario.student);
    await page.goto("/aluno");
    await page
      .locator("tbody tr", { hasText: scenario.quizGoal.title })
      .locator('button:has-text("Iniciar bateria")')
      .click();
    await page.waitForURL(/tecconcursos\.com\.br/);

    await signIn(scenario.teacher);
    await page.goto("/professor/metas");
    await page.fill("#week", "1");
    await page.selectOption("#mode", "replace");
    await page.click('button:has-text("Gerar metas da semana")');

    await expect(page.locator(".alert--error")).toContainText("ha bateria aberta nesta semana");
  });
});

test.describe("F-PROF-08 · query string de planejamento", () => {
  for (const route of ["/professor/metas", "/professor/cadernos"] as const) {
    test(`${route} com plano válido seleciona aquele planejamento`, async ({
      teacherPage,
      scenario,
    }) => {
      await teacherPage.goto(`${route}?plano=${scenario.planId}`);

      await expect(teacherPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      await expect(teacherPage.locator(".content")).toContainText(scenario.planName);
    });

    test(`${route} com plano inválido não quebra`, async ({ teacherPage, consoleErrors }) => {
      await teacherPage.goto(`${route}?plano=nao-e-uuid`);

      await expect(teacherPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe("F-PROF-09 · revisões", () => {
  test("lista o bloco com três baterias abaixo de 80%", async ({ teacherPage, scenario }) => {
    const block = scenario.blocks[0]!;
    const primeira = scenario.goals.find((goal) => goal.blockId === block.id)!;
    await completeQuiz(scenario, primeira, { correct: 10 });
    for (const week of [2, 3]) {
      const goals = await addWeek(scenario, week);
      await completeQuiz(scenario, goals.find((g) => g.blockId === block.id)!, { correct: 10 });
    }

    await teacherPage.goto("/professor/revisoes");

    const card = cardByTitle(teacherPage, scenario.student.name);
    const row = card.locator("tbody tr", { hasText: block.subjectName });
    await expect(row).toContainText("3");
    await expect(row).toContainText("67%");
    await expect(row.locator(".badge")).toHaveText("Reforço recomendado");
  });

  test("sem bloco abaixo da meta, avisa que não há reforço", async ({ teacherPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 15, minutes: 85 });

    await teacherPage.goto("/professor/revisoes");
    await expect(teacherPage.locator(".empty")).toContainText(
      "Nenhum bloco exigindo reforço no momento.",
    );
  });
});

test.describe("F-PROF-01 · professor sem aluno vinculado", () => {
  test.use({ scenarioOptions: { withLink: false, withPlan: false } });

  test("as telas abrem vazias, sem erro", async ({ teacherPage, consoleErrors }) => {
    await teacherPage.goto("/professor");
    await expect(teacherPage.locator(".empty")).toContainText("Nenhum aluno vinculado ainda.");

    await teacherPage.goto("/professor/revisoes");
    await expect(teacherPage.locator(".empty")).toContainText("Nenhum aluno vinculado.");

    await teacherPage.goto("/professor/metas");
    await expect(teacherPage.locator(".empty")).toContainText("Nenhum planejamento criado.");

    expect(consoleErrors).toEqual([]);
  });
});
