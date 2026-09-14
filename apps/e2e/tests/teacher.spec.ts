/**
 * §4 do `docs/fluxos-e2e.md` — telas do professor.
 */
import { expect, test } from "../fixtures/index.ts";
import {
  addBlocks,
  addWeek,
  createScenario,
  createUser,
  deleteUser,
  goalCount,
  goalStatus,
  planWeeks,
  setAccess,
  setSpacing,
} from "../fixtures/scenario.ts";
import { completeQuiz } from "../fixtures/battery.ts";
import { asUser, count, one, query } from "../fixtures/db.ts";
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
    await expect(row.locator("td.acesso .badge")).toHaveText("Acesso ativo");
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
      await expect(row.locator("td.acesso .badge")).toHaveText(label);
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
    await expect(row.locator("td.acesso .badge")).toHaveText("Acesso ativo");
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

  /**
   * Sem status 404, porque a SPA não tem como devolver um.
   *
   * O servidor entrega o mesmo index.html para qualquer caminho — é o que
   * permite o roteamento no cliente — e não teria como decidir de outra forma:
   * saber se ESTE professor pode ver ESTE aluno depende de autenticação e da
   * RLS, que só acontecem depois de a página carregar. Antes, com o
   * `notFound()` do Next, o 404 vinha do servidor.
   *
   * O que a asserção verifica passa a ser o que de fato importa, e é mais
   * forte que o código de status: a tela de "não encontrado" aparece E o nome
   * do aluno alheio não vaza para o HTML.
   */
  for (const [label, id] of [
    ["id inexistente", "a1000000-0000-4000-8000-000000009999"],
    ["id malformado", "nao-e-um-uuid"],
  ] as const) {
    test(`${label} não encontra o aluno`, async ({ teacherPage }) => {
      await teacherPage.goto(studentPageOf(id));
      await expect(
        teacherPage.getByRole("heading", { name: "Não encontrado", level: 1 }),
      ).toBeVisible();
    });
  }

  test("aluno de outro professor não é encontrado", async ({ teacherPage, scenario }) => {
    // Um segundo par, criado à parte: o professor deste cenário não tem
    // vínculo nenhum com o aluno de lá. É a mesma regra do §5, vista pela
    // tela em vez de pela RLS.
    const outro = await createScenario({ withGoals: false });
    expect(outro.student.id).not.toBe(scenario.student.id);

    await teacherPage.goto(studentPageOf(outro.student.id));
    await expect(
      teacherPage.getByRole("heading", { name: "Não encontrado", level: 1 }),
    ).toBeVisible();
    await expect(teacherPage.locator("body")).not.toContainText(outro.student.name);
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
    // `.all()` NÃO espera por nada: devolve o que casa naquele instante. Numa
    // SPA o formulário só existe depois de os loaders da rota resolverem, o
    // que é depois do evento `load` que o `goto` aguarda — sem esta espera a
    // lista voltava vazia, nada era desmarcado, e o teste falhava dizendo que
    // faltou a mensagem de erro quando na verdade o lote foi criado.
    await expect(teacherPage.locator("input[name=weekdays]").first()).toBeVisible();
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
    // Mesma razão do teste acima: `.all()` não espera.
    await expect(teacherPage.locator("input[name=blocks]").first()).toBeVisible();
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

  test("bateria aberta na semana bloqueia replace", async ({ teacherPage, scenario }) => {
    // A bateria abre pela RPC real, impersonando o aluno: desde que a extensão
    // saiu, a tela não tem mais por onde abrir uma. O que este teste verifica é
    // o lado do professor, e esse não mudou.
    await asUser(scenario.student.id, (client) =>
      client.query("select public.start_quiz_session($1::uuid, $2::uuid, $3::uuid)", [
        scenario.planId,
        scenario.quizGoal.blockId,
        scenario.quizGoal.id,
      ]),
    );

    const page = teacherPage;
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

// ---------------------------------------------------------------------------
// §4 — vínculo e liberação de acesso.
// Spec docs/specs/13-vinculo-e-liberacao-de-acesso.md
// ---------------------------------------------------------------------------

/**
 * Um candidato: aluno com linha na lista de espera e sem professor nenhum.
 *
 * É exatamente o estado de quem acabou de se cadastrar pelo site — o cadastro
 * cria `auth.users` e `profiles`, a tela de lista de espera cria a linha, e
 * nada mais acontece.
 */
async function createCandidate(name: string) {
  const person = await createUser("student", name, "candidato");
  await query(
    `insert into public.waitlist (student_id, name, email, whatsapp, interest_area, focus_exam)
     values ($1, $2, $3, '41999990000', 'Policial', 'PCPR — Investigador')`,
    [person.id, person.name, person.email],
  );
  return person;
}

const candidateRow = (page: import("@playwright/test").Page, name: string) =>
  cardByTitle(page, "Candidatos").locator("tbody tr", { hasText: name });

test.describe("F-VINC-01 · o candidato aparece na fila", () => {
  test("quem se cadastrou e não tem professor é visível para o professor", async ({
    teacherPage,
  }) => {
    const candidate = await createCandidate("Candidata Helena");
    try {
      await teacherPage.goto("/professor");

      const row = candidateRow(teacherPage, candidate.name);
      await expect(row).toContainText(candidate.email);
      await expect(row).toContainText("PCPR — Investigador");
      await expect(row.getByRole("button", { name: "Vincular a mim" })).toBeVisible();
    } finally {
      await deleteUser(candidate.id);
    }
  });

  test("aluno que já tem professor não entra na fila", async ({ teacherPage, scenario }) => {
    // O aluno do cenário já é vinculado; ele não pode aparecer como candidato.
    await teacherPage.goto("/professor");
    await expect(
      cardByTitle(teacherPage, "Candidatos").locator("tbody tr", { hasText: scenario.student.name }),
    ).toHaveCount(0);
  });
});

test.describe("F-VINC-02 · vincular", () => {
  test("cria o vínculo, tira da fila e o aluno aparece em Meus alunos", async ({
    teacherPage,
    scenario,
  }) => {
    const candidate = await createCandidate("Candidato Igor");
    try {
      await teacherPage.goto("/professor");
      await candidateRow(teacherPage, candidate.name)
        .getByRole("button", { name: "Vincular a mim" })
        .click();

      // Some da fila e passa a constar na lista, ainda sem acesso.
      await expect(cardByTitle(teacherPage, "Candidatos").locator("tbody tr", {
        hasText: candidate.name,
      })).toHaveCount(0);

      const row = teacherPage.locator("tbody tr", { hasText: candidate.name });
      await expect(row.locator("td.acesso .badge")).toHaveText("Aguardando liberação");

      const link = await one<{ teacher_id: string; ended_at: string | null }>(
        "select teacher_id, ended_at from public.student_teacher_links where student_id = $1",
        [candidate.id],
      );
      expect(link.teacher_id).toBe(scenario.teacher.id);
      expect(link.ended_at).toBeNull();

      // A linha da lista de espera foi reivindicada.
      expect(
        await count(
          "select count(*) from public.waitlist where student_id = $1 and teacher_id = $2",
          [candidate.id, scenario.teacher.id],
        ),
      ).toBe(1);
    } finally {
      await query("delete from public.student_teacher_links where student_id = $1", [candidate.id]);
      await deleteUser(candidate.id);
    }
  });
});

test.describe("F-VINC-03 · candidato reivindicado sai da fila dos outros", () => {
  test("outro professor não o enxerga mais", async ({ page, teacherPage, scenario, signIn }) => {
    const candidate = await createCandidate("Candidata Joana");
    const outro = await createUser("teacher", "Professor Vizinho", "prof");
    try {
      await teacherPage.goto("/professor");
      await candidateRow(teacherPage, candidate.name)
        .getByRole("button", { name: "Vincular a mim" })
        .click();
      await expect(
        cardByTitle(teacherPage, "Candidatos").locator("tbody tr", { hasText: candidate.name }),
      ).toHaveCount(0);

      await signIn(outro);
      await page.goto("/professor");
      // Sem candidatos, o cartão inteiro não é renderizado.
      await expect(page.locator("tbody tr", { hasText: candidate.name })).toHaveCount(0);
    } finally {
      await query("delete from public.student_teacher_links where student_id = $1", [candidate.id]);
      await deleteUser(candidate.id);
      await deleteUser(outro.id);
      void scenario;
    }
  });
});

test.describe("F-VINC-04 · liberar acesso", () => {
  test.use({ scenarioOptions: { access: "none" } });

  test("cria a assinatura e o aluno passa a abrir as telas de estudo", async ({
    page,
    teacherPage,
    scenario,
    signIn,
  }) => {
    // Sem assinatura, o aluno é empurrado para a lista de espera.
    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(page).toHaveURL(/\/aluno\/lista-espera$/);

    await signIn(scenario.teacher);
    await page.goto(studentPageOf(scenario.student.id));
    await expect(cardByTitle(page, "Acesso")).toContainText("nunca teve acesso liberado");

    await cardByTitle(page, "Acesso").locator('select[name="months"]').selectOption("3");
    await cardByTitle(page, "Acesso").getByRole("button", { name: "Liberar acesso" }).click();

    await expect(page.locator(".alert--success")).toHaveText("Acesso liberado por 3 meses.");
    await expect(cardByTitle(page, "Acesso")).toContainText("Ativo · vigência");

    const sub = await one<{ status: string; validity: string }>(
      "select status::text, validity::text from public.subscriptions where student_id = $1",
      [scenario.student.id],
    );
    expect(sub.status).toBe("active");
    // Fechado no início, aberto no fim, e três meses de janela.
    expect(sub.validity).toMatch(/^\[\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}\)$/);

    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(page).toHaveURL(/\/aluno$/);
    await expect(page.locator("h1")).toHaveText("Visão geral");

    void teacherPage;
  });
});

test.describe("F-VINC-05 · liberar de novo estende a mesma linha", () => {
  test("não cria uma segunda assinatura ativa", async ({ teacherPage, scenario }) => {
    await teacherPage.goto(studentPageOf(scenario.student.id));

    await cardByTitle(teacherPage, "Acesso").locator('select[name="months"]').selectOption("12");
    await cardByTitle(teacherPage, "Acesso")
      .getByRole("button", { name: "Estender acesso" })
      .click();

    await expect(teacherPage.locator(".alert--success")).toHaveText("Acesso estendido por 12 meses.");

    // O índice active_subscription_uidx recusaria uma segunda ativa; a action
    // atualiza a existente justamente por isso.
    expect(
      await count(
        "select count(*) from public.subscriptions where student_id = $1 and status = 'active'",
        [scenario.student.id],
      ),
    ).toBe(1);
  });
});

test.describe("F-VINC-06 · suspender", () => {
  test("troca o badge, preserva a vigência e devolve o aluno à lista de espera", async ({
    page,
    teacherPage,
    scenario,
    signIn,
  }) => {
    const antes = await one<{ validity: string }>(
      "select validity::text from public.subscriptions where student_id = $1 and status = 'active'",
      [scenario.student.id],
    );

    await teacherPage.goto(studentPageOf(scenario.student.id));
    await cardByTitle(teacherPage, "Acesso")
      .getByRole("button", { name: "Suspender acesso" })
      .click();

    // Filho direto de `.content`: a confirmação é do nível da página, porque o
    // formulário de suspender some quando o acesso deixa de estar ativo.
    await expect(teacherPage.locator(".content > .alert--success")).toHaveText(
      "Acesso suspenso. O aluno volta para a lista de espera.",
    );

    const depois = await one<{ status: string; validity: string }>(
      "select status::text, validity::text from public.subscriptions where student_id = $1",
      [scenario.student.id],
    );
    expect(depois.status).toBe("suspended");
    // R-VINC-18: a vigência é preservada, para reativar sem redigitar e para
    // continuar auditável até quando o acesso valia.
    expect(depois.validity).toBe(antes.validity);

    await teacherPage.goto("/professor");
    await expect(
      teacherPage
        .locator("tbody tr", { hasText: scenario.student.name })
        .locator("td.acesso .badge"),
    ).toHaveText("Suspenso");

    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(page).toHaveURL(/\/aluno\/lista-espera$/);
  });
});

test.describe("F-VINC-07 · vincular duas vezes", () => {
  test("o duplo clique devolve o mesmo vínculo, sem segunda linha", async ({
    teacherPage,
    scenario,
  }) => {
    const candidate = await createCandidate("Candidato Kaio");
    try {
      await teacherPage.goto("/professor");
      const button = candidateRow(teacherPage, candidate.name).getByRole("button", {
        name: "Vincular a mim",
      });

      // Dois cliques em sequência: o segundo encontra a tela já revalidada, e o
      // caminho que ele exercita é o de vincular quem já é aluno — que a RPC
      // devolve em vez de recusar.
      await button.click();
      // Esperar o candidato SAIR da fila, e não uma linha que já estava na
      // tela: `tbody tr` com o nome dele também casa a linha da própria fila,
      // então a asserção passaria de imediato e a contagem abaixo rodaria antes
      // de a action terminar.
      await expect(
        cardByTitle(teacherPage, "Candidatos").locator("tbody tr", { hasText: candidate.name }),
      ).toHaveCount(0);

      expect(
        await count("select count(*) from public.student_teacher_links where student_id = $1", [
          candidate.id,
        ]),
      ).toBe(1);

      // E chamar a RPC de novo, com request_id novo, continua devolvendo o
      // vínculo existente em vez de esbarrar no índice active_link_uidx.
      await asUser(scenario.teacher.id, (client) =>
        client.query("select public.link_student($1::uuid, gen_random_uuid())", [candidate.id]),
      );
      expect(
        await count("select count(*) from public.student_teacher_links where student_id = $1", [
          candidate.id,
        ]),
      ).toBe(1);
    } finally {
      await query("delete from public.student_teacher_links where student_id = $1", [candidate.id]);
      await deleteUser(candidate.id);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — gestão do planejamento. Spec docs/specs/14-gestao-do-planejamento.md
// ---------------------------------------------------------------------------

const newPlanCard = (page: import("@playwright/test").Page) =>
  cardByTitle(page, "Novo planejamento");

/** Preenche e envia o formulário de criação. */
async function createPlan(
  page: import("@playwright/test").Page,
  { name, catalog = "pcpr26" }: { name: string; catalog?: string },
) {
  const card = newPlanCard(page);
  await card.locator("#field-catalogKey").selectOption(catalog);
  await card.locator("#field-name").fill(name);
  await card.locator("#field-targetExam").fill("PCPR — Investigador");
  await card.getByRole("button", { name: "Criar planejamento" }).click();
}

test.describe("F-GPLAN-01 · criar planejamento", () => {
  test("nasce rascunho e materializa os blocos do catálogo", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto("/professor/planejamentos");
    await createPlan(teacherPage, { name: `Plano novo ${scenario.planId.slice(0, 8)}` });

    await expect(newPlanCard(teacherPage).locator(".alert--success")).toContainText(
      "criado como rascunho",
    );

    const plan = await one<{ id: string; status: string }>(
      `select id, status::text from public.study_plans
        where student_id = $1 and name like 'Plano novo%' and deleted_at is null`,
      [scenario.student.id],
    );
    expect(plan.status).toBe("draft");

    // Os blocos vieram do catálogo, com subject_order/block_order coerentes.
    const blocks = await query<{ subject_name: string; subject_order: number; block_order: number }>(
      `select subject_name, subject_order, block_order from public.study_plan_blocks
        where study_plan_id = $1 order by subject_order, block_order`,
      [plan.id],
    );
    expect(blocks.length).toBeGreaterThan(0);
    // Uma disciplina por subject_order, e block_order começa em 0 em cada uma.
    const porDisciplina = new Map<string, number[]>();
    for (const b of blocks) {
      porDisciplina.set(b.subject_name, [...(porDisciplina.get(b.subject_name) ?? []), b.block_order]);
    }
    for (const ordens of porDisciplina.values()) {
      expect(ordens).toEqual(ordens.map((_, i) => i));
    }
  });
});

test.describe("F-GPLAN-02 · o rascunho não é visível para o aluno", () => {
  test.use({ scenarioOptions: { withPlan: false } });

  test("o aluno continua no estado vazio até alguém ativar", async ({
    page,
    scenario,
    signIn,
  }) => {
    await signIn(scenario.teacher);
    await page.goto("/professor/planejamentos");
    await createPlan(page, { name: "Plano em rascunho" });
    await expect(newPlanCard(page).locator(".alert--success")).toBeVisible();

    await expect(page.locator("tbody tr", { hasText: "Plano em rascunho" }).locator(".badge"))
      .toHaveText("Rascunho");

    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(page.locator(".alert")).toContainText("Nenhum planejamento ativo");
  });
});

test.describe("F-GPLAN-03 · ativar", () => {
  test("arquiva o anterior do mesmo aluno e o aluno passa a ver o novo", async ({
    page,
    scenario,
    signIn,
  }) => {
    await signIn(scenario.teacher);
    await page.goto("/professor/planejamentos");
    await createPlan(page, { name: "Plano da virada" });
    await expect(newPlanCard(page).locator(".alert--success")).toBeVisible();

    await page
      .locator("tbody tr", { hasText: "Plano da virada" })
      .getByRole("button", { name: "Ativar" })
      .click();

    // Filho direto de `.content`: o alerta do formulário de criação continua na
    // tela, dentro do cartão, e `.alert--success` sozinho casaria os dois.
    await expect(page.locator(".content > .alert--success")).toContainText("Planejamento ativado");

    // active_study_plan_uidx torna "dois ativos" inexprimível; a asserção prova
    // que a troca aconteceu na mesma transação, sem passar por zero ativos.
    const ativos = await query<{ name: string }>(
      `select name from public.study_plans
        where student_id = $1 and status = 'active' and deleted_at is null`,
      [scenario.student.id],
    );
    expect(ativos.map((p) => p.name)).toEqual(["Plano da virada"]);

    // E o de antes ficou arquivado, não apagado.
    expect(
      await count(
        `select count(*) from public.study_plans
          where id = $1 and status = 'archived' and deleted_at is null`,
        [scenario.planId],
      ),
    ).toBe(1);

    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(page.locator(".content__header p")).toContainText("Plano da virada");
  });
});

test.describe("F-GPLAN-04 · gerar metas usa os blocos materializados", () => {
  test.use({ scenarioOptions: { withPlan: false } });

  test("depois de ativar, /professor/metas aceita gerar a semana", async ({
    teacherPage,
  }) => {
    await teacherPage.goto("/professor/planejamentos");
    await createPlan(teacherPage, { name: "Plano para metas" });
    await expect(newPlanCard(teacherPage).locator(".alert--success")).toBeVisible();

    await teacherPage
      .locator("tbody tr", { hasText: "Plano para metas" })
      .getByRole("button", { name: "Ativar" })
      .click();
    await expect(teacherPage.locator(".content > .alert--success")).toContainText(
      "Planejamento ativado",
    );

    await teacherPage.goto("/professor/metas");
    // Sem blocos materializados a tela diria "não tem blocos ativos".
    await expect(teacherPage.locator(".content")).not.toContainText("não tem blocos ativos");
    await expect(teacherPage.locator('.content input[name="blocks"]').first()).toBeVisible();
  });
});

test.describe("F-GPLAN-05 · arquivar", () => {
  test("preserva metas e baterias, e o aluno volta ao estado vazio", async ({
    page,
    scenario,
    signIn,
  }) => {
    const metasAntes = await goalCount(scenario.planId);

    await signIn(scenario.teacher);
    await page.goto("/professor/planejamentos");
    await page
      .locator("tbody tr", { hasText: scenario.planName })
      .getByRole("button", { name: "Arquivar" })
      .click();

    await expect(page.locator(".content > .alert--success")).toContainText("Planejamento arquivado");
    expect(await goalCount(scenario.planId)).toBe(metasAntes);

    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(page.locator(".alert")).toContainText("Nenhum planejamento ativo");
  });
});

test.describe("F-GPLAN-06 · nome repetido", () => {
  test("é recusado com mensagem em português e nada é gravado", async ({
    teacherPage,
    scenario,
  }) => {
    const antes = await count(
      "select count(*) from public.study_plans where student_id = $1 and deleted_at is null",
      [scenario.student.id],
    );

    await teacherPage.goto("/professor/planejamentos");
    await createPlan(teacherPage, { name: scenario.planName });

    await expect(newPlanCard(teacherPage).locator(".alert--error")).toHaveText(
      "Este aluno já tem um planejamento com esse nome. Escolha outro.",
    );
    expect(
      await count(
        "select count(*) from public.study_plans where student_id = $1 and deleted_at is null",
        [scenario.student.id],
      ),
    ).toBe(antes);
  });
});

test.describe("F-GPLAN-07 · professor sem aluno vinculado", () => {
  test("a tela explica em vez de mostrar um formulário inútil", async ({ page, signIn }) => {
    const sozinho = await createUser("teacher", "Professor Sem Aluno", "prof");
    try {
      await signIn(sozinho);
      await page.goto("/professor/planejamentos");

      await expect(newPlanCard(page)).toContainText("Vincule um aluno a você");
      await expect(newPlanCard(page).locator("#field-studentId")).toHaveCount(0);
    } finally {
      await deleteUser(sozinho.id);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — cadernos do planejamento.
// Spec docs/specs/15-cadernos-do-planejamento.md
// ---------------------------------------------------------------------------

const blockRow = (page: import("@playwright/test").Page, name: string) =>
  page.locator("tbody tr", { hasText: name });

test.describe("F-CAD-01 · desativar tira do rodízio sem mexer no histórico", () => {
  test("some de /professor/metas e o desempenho já registrado não muda", async ({
    teacherPage,
    scenario,
  }) => {
    // Uma bateria concluída dá o número que não pode se mover.
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}`);
    await blockRow(teacherPage, block.name).getByRole("button", { name: "Desativar" }).click();

    await expect(teacherPage.locator(".alert--success")).toContainText(
      "Metas concluídas e estatísticas antigas foram preservadas",
    );
    // O bloco SAI do recorte "Ativos" — é o efeito desejado —, então o badge só
    // pode ser conferido em outro recorte.
    await expect(blockRow(teacherPage, block.name)).toHaveCount(0);
    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}&ver=desativados`);
    await expect(blockRow(teacherPage, block.name).locator(".badge")).toHaveText("Desativado");

    // Saiu da geração...
    await teacherPage.goto(`/professor/metas?plano=${scenario.planId}`);
    await expect(teacherPage.locator(".content")).not.toContainText(block.name);

    // ...e o ledger continua inteiro.
    expect(
      await count(
        `select count(*) from public.quiz_session_questions q
           join public.quiz_sessions s on s.id = q.quiz_session_id
          where s.block_id = $1`,
        [block.id],
      ),
    ).toBe(15);
  });
});

test.describe("F-CAD-02 · bloco desativado não abre bateria", () => {
  test("a RPC recusa e a meta continua pendente", async ({ teacherPage, scenario }) => {
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}`);
    await blockRow(teacherPage, block.name).getByRole("button", { name: "Desativar" }).click();
    await expect(teacherPage.locator(".alert--success")).toBeVisible();

    // O desligamento é pela tela do professor, que é o que este fluxo cobre. A
    // recusa é verificada na RPC: `start_quiz_session` exige `active and
    // deleted_at is null`, e desde que a extensão saiu não há tela que a chame.
    await expect(
      asUser(scenario.student.id, (client) =>
        client.query("select public.start_quiz_session($1::uuid, $2::uuid, $3::uuid)", [
          scenario.planId,
          scenario.quizGoal.blockId,
          scenario.quizGoal.id,
        ]),
      ),
    ).rejects.toThrow(/bloco invalido ou indisponivel/);

    expect(await goalStatus(scenario.quizGoal.id)).toBe("pending");
  });
});

test.describe("F-CAD-03 · editar vale só para este planejamento", () => {
  test("o catálogo de origem fica intacto", async ({ teacherPage, scenario }) => {
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;
    const catalogAntes = await one<{ name: string }>(
      "select name from public.catalog_blocks where id = $1",
      [block.catalogBlockId],
    );

    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}`);
    const row = blockRow(teacherPage, block.name);
    await row.getByRole("button", { name: "Editar" }).click();
    await row.locator('input[name="name"]').fill("Caderno renomeado E2E");
    await row.locator('input[name="subjectTarget"]').fill("65");
    await row.getByRole("button", { name: "Salvar" }).click();

    await expect(teacherPage.locator(".alert--success")).toContainText(
      "vale só para este planejamento",
    );
    await expect(blockRow(teacherPage, "Caderno renomeado E2E")).toContainText("65%");

    // O bloco do catálogo, compartilhado entre alunos, não mudou.
    const catalogDepois = await one<{ name: string }>(
      "select name from public.catalog_blocks where id = $1",
      [block.catalogBlockId],
    );
    expect(catalogDepois.name).toBe(catalogAntes.name);
  });
});

test.describe("F-CAD-04 · excluir e restaurar", () => {
  test.use({ scenarioOptions: { withGoals: false } });

  test("sai para Excluídos e volta com block_order recalculado", async ({
    teacherPage,
    scenario,
  }) => {
    const [primeiro, segundo] = scenario.blocks;

    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}`);
    await blockRow(teacherPage, primeiro!.name).getByRole("button", { name: "Excluir" }).click();
    await expect(teacherPage.locator(".alert--success")).toContainText("pode ser restaurado");

    // Sumiu de Ativos e aparece em Excluídos.
    await expect(blockRow(teacherPage, primeiro!.name)).toHaveCount(0);
    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}&ver=excluidos`);
    await expect(blockRow(teacherPage, primeiro!.name).locator(".badge")).toHaveText("Excluído");

    await blockRow(teacherPage, primeiro!.name).getByRole("button", { name: "Restaurar" }).click();
    await expect(teacherPage.locator(".alert--success")).toContainText("restaurado e ativado");

    // R-CAD-05: a ordem foi recalculada, e o índice parcial continua satisfeito.
    const restored = await one<{ deleted_at: string | null; active: boolean }>(
      "select deleted_at, active from public.study_plan_blocks where id = $1",
      [primeiro!.id],
    );
    expect(restored.deleted_at).toBeNull();
    expect(restored.active).toBe(true);
    expect(
      await count(
        `select count(*) from public.study_plan_blocks
          where study_plan_id = $1 and deleted_at is null`,
        [scenario.planId],
      ),
    ).toBe(2);
    void segundo;
  });
});

test.describe("F-CAD-05 · bloco com meta não oferece excluir", () => {
  test("mostra a contagem de metas no lugar do botão", async ({ teacherPage, scenario }) => {
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}`);
    const row = blockRow(teacherPage, block.name);

    await expect(row.getByRole("button", { name: "Excluir" })).toHaveCount(0);
    await expect(row).toContainText("meta(s)");
  });
});

test.describe("F-CAD-06 · caderno avulso", () => {
  test("nasce sem catalog_block_id e passa a ser oferecido na geração", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/cadernos?plano=${scenario.planId}`);

    const card = cardByTitle(teacherPage, "Caderno avulso");
    await card.locator('input[name="subjectName"]').fill("Material próprio");
    await card.locator('input[name="name"]').fill("Apostila do aluno");
    await card.locator('input[name="questionCount"]').fill("40");
    await card.getByRole("button", { name: "Adicionar caderno" }).click();

    // A confirmação é do nível da página: as ações desta tela devolvem
    // redirectTo com ?feito=, porque excluir e restaurar movem a linha entre
    // recortes e o formulário some na revalidação.
    await expect(teacherPage.locator(".alert--success")).toHaveText("Caderno avulso criado.");

    const criado = await one<{ catalog_block_id: string | null; active: boolean }>(
      "select catalog_block_id, active from public.study_plan_blocks where name = $1 and study_plan_id = $2",
      ["Apostila do aluno", scenario.planId],
    );
    expect(criado.catalog_block_id).toBeNull();
    expect(criado.active).toBe(true);

    await teacherPage.goto(`/professor/metas?plano=${scenario.planId}`);
    await expect(teacherPage.locator(".content")).toContainText("Apostila do aluno");
  });
});

// ---------------------------------------------------------------------------
// §4 — histórico de baterias e anulação.
// Spec docs/specs/16-historico-e-anulacao-de-bateria.md
// ---------------------------------------------------------------------------

const sessionsCard = (page: import("@playwright/test").Page) => cardByTitle(page, "Baterias");

test.describe("F-ANUL-01 · a ficha lista as baterias do aluno", () => {
  test("bloco, número, desempenho oficial e situação", async ({ teacherPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const block = scenario.blocks.find((b) => b.id === scenario.quizGoal.blockId)!;

    await teacherPage.goto(studentPageOf(scenario.student.id));
    const row = sessionsCard(teacherPage).locator("tbody tr").first();

    await expect(row).toContainText(block.subjectName);
    await expect(row).toContainText("11/15");
    await expect(row).toContainText("73%");
    await expect(row).toContainText("1h25");
    await expect(row.locator(".badge")).toHaveText("Concluída");
  });
});

test.describe("F-ANUL-02 · anular preserva o ledger", () => {
  test("a situação vira Anulada, o motivo aparece, e as linhas continuam", async ({
    teacherPage,
    scenario,
  }) => {
    const done = await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const antes = await count(
      "select count(*) from public.quiz_session_questions where quiz_session_id = $1",
      [done.sessionId],
    );
    expect(antes).toBe(15);

    await teacherPage.goto(studentPageOf(scenario.student.id));
    await sessionsCard(teacherPage).getByRole("button", { name: "Anular" }).click();
    await sessionsCard(teacherPage).locator('input[name="reason"]').fill("Aluno abriu por engano");
    await sessionsCard(teacherPage)
      .getByRole("button", { name: "Anular", exact: true })
      .click();

    await expect(teacherPage.locator(".content > .alert--success")).toContainText(
      "Bateria anulada",
    );
    const row = sessionsCard(teacherPage).locator("tbody tr").first();
    await expect(row.locator(".badge")).toHaveText("Anulada");
    await expect(row).toContainText("Aluno abriu por engano");

    // R-ANUL-05: o ledger fica intacto. O que muda é o status.
    expect(
      await count("select count(*) from public.quiz_session_questions where quiz_session_id = $1", [
        done.sessionId,
      ]),
    ).toBe(15);
  });
});

test.describe("F-ANUL-03 · o desempenho desce e a meta volta", () => {
  test("os números derivados acompanham, e o aluno vê a meta pendente", async ({
    page,
    scenario,
    signIn,
  }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });

    await signIn(scenario.teacher);
    await page.goto(studentPageOf(scenario.student.id));
    await expect(cardByTitle(page, "Desempenho oficial")).toContainText("73%");

    await sessionsCard(page).getByRole("button", { name: "Anular" }).click();
    await sessionsCard(page).getByRole("button", { name: "Anular", exact: true }).click();
    await expect(page.locator(".content > .alert--success")).toBeVisible();

    // vw_quiz_session_performance filtra status='completed': o número some.
    await expect(cardByTitle(page, "Desempenho oficial")).toContainText("—");
    expect(await goalStatus(scenario.quizGoal.id)).toBe("pending");

    await signIn(scenario.student);
    await page.goto("/aluno");
    await expect(
      page.locator("tbody tr", { hasText: scenario.quizGoal.title }).locator(".badge"),
    ).toHaveText("Pendente");
  });
});

test.describe("F-ANUL-04 · as questões voltam a ser inéditas", () => {
  test("a bateria seguinte pode escolher as mesmas questões", async ({
    teacherPage,
    scenario,
  }) => {
    const primeira = await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });

    await teacherPage.goto(studentPageOf(scenario.student.id));
    await sessionsCard(teacherPage).getByRole("button", { name: "Anular" }).click();
    await sessionsCard(teacherPage).getByRole("button", { name: "Anular", exact: true }).click();
    await expect(teacherPage.locator(".content > .alert--success")).toBeVisible();

    // vw_seen_questions também filtra completed: nada foi visto.
    expect(
      await count(
        `select count(*) from public.vw_seen_questions
          where study_plan_id = $1 and block_id = $2`,
        [scenario.planId, scenario.quizGoal.blockId],
      ),
    ).toBe(0);

    // E a meta, de volta a pendente, produz uma bateria com a MESMA fila.
    const segunda = await completeQuiz(scenario, scenario.quizGoal, { correct: 15, minutes: 60 });
    expect(segunda.queue).toEqual(primeira.queue);
  });
});

test.describe("F-ANUL-05 · o que não é anulável", () => {
  test("bateria em andamento não oferece o botão", async ({ teacherPage, scenario }) => {
    await asUser(scenario.student.id, (client) =>
      client.query("select public.start_quiz_session($1::uuid, $2::uuid, $3::uuid)", [
        scenario.planId,
        scenario.quizGoal.blockId,
        scenario.quizGoal.id,
      ]),
    );

    const page = teacherPage;
    await page.goto(studentPageOf(scenario.student.id));

    const row = sessionsCard(page).locator("tbody tr").first();
    await expect(row.locator(".badge")).toHaveText("Em andamento");
    await expect(row.getByRole("button", { name: "Anular" })).toHaveCount(0);
  });

  test("motivo vazio grava o padrão", async ({ teacherPage, scenario }) => {
    const done = await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });

    await teacherPage.goto(studentPageOf(scenario.student.id));
    await sessionsCard(teacherPage).getByRole("button", { name: "Anular" }).click();
    await sessionsCard(teacherPage)
      .getByRole("button", { name: "Anular", exact: true })
      .click();
    await expect(teacherPage.locator(".content > .alert--success")).toBeVisible();

    const voided = await one<{ void_reason: string; status: string }>(
      "select void_reason, status::text from public.quiz_sessions where id = $1",
      [done.sessionId],
    );
    expect(voided).toMatchObject({ status: "voided", void_reason: "Anulação administrativa" });
  });
});

// ---------------------------------------------------------------------------
// §4 — ficha da turma. Spec docs/specs/17-ficha-da-turma.md
// ---------------------------------------------------------------------------

const studentRow = (page: import("@playwright/test").Page, name: string) =>
  page.locator("tbody tr", { hasText: name });

test.describe("F-TURMA-01 · a lista mostra o diagnóstico", () => {
  test("progresso, desempenho e faixa, com o resumo batendo", async ({
    teacherPage,
    scenario,
  }) => {
    // 1 de 5 metas concluídas = 0,20 de progresso → atrasado.
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });

    await teacherPage.goto("/professor");

    const row = studentRow(teacherPage, scenario.student.name);
    await expect(row).toContainText("1/5");
    await expect(row).toContainText("73%");
    await expect(row.locator("td.situacao .badge")).toHaveText("Atrasado");

    await expect(cardByTitle(teacherPage, "Alunos")).toContainText("1");
    await expect(cardByTitle(teacherPage, "Precisam de atenção")).toContainText("1");
    await expect(cardByTitle(teacherPage, "Questões da turma")).toContainText("15");
    await expect(cardByTitle(teacherPage, "Questões da turma")).toContainText("73% de acerto");
  });
});

test.describe("F-TURMA-02 · o limiar de desempenho decide a faixa", () => {
  test("abaixo de 70% é Atenção; acima, Em ritmo", async ({ teacherPage, scenario }) => {
    // Todas as metas fechadas tira o progresso da conta; sobra o desempenho.
    for (const goal of scenario.goals.filter((g) => g.type !== "question_block")) {
      await asUser(scenario.student.id, (client) =>
        client.query("select public.complete_goal($1::uuid, gen_random_uuid(), 45, null)", [
          goal.id,
        ]),
      );
    }
    const baterias = scenario.goals.filter((g) => g.type === "question_block");
    // 10 de 15 = 67% → abaixo do limiar.
    await completeQuiz(scenario, baterias[0]!, { correct: 10, minutes: 60 });

    await teacherPage.goto("/professor");
    await expect(
      studentRow(teacherPage, scenario.student.name).locator("td.situacao .badge"),
    ).toHaveText("Atenção");

    // A segunda bateria, com 15 de 15, leva o acumulado para 83%.
    await completeQuiz(scenario, baterias[1]!, { correct: 15, minutes: 60 });
    await teacherPage.goto("/professor");
    await expect(
      studentRow(teacherPage, scenario.student.name).locator("td.situacao .badge"),
    ).toHaveText("Em ritmo");
  });
});

test.describe("F-TURMA-03 · busca e filtros na query string", () => {
  test("busca casa nome e e-mail, sem acento", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor?busca=aluno");
    await expect(studentRow(teacherPage, scenario.student.name)).toBeVisible();

    // O e-mail do cenário começa com "aluno-"; buscar por ele também casa.
    await teacherPage.goto(`/professor?busca=${scenario.student.email.split("@")[0]}`);
    await expect(studentRow(teacherPage, scenario.student.name)).toBeVisible();

    await teacherPage.goto("/professor?busca=ninguem-com-esse-nome");
    await expect(teacherPage.locator(".empty")).toContainText("Nenhum aluno neste filtro");
  });

  test("situação e plano filtram", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor?situacao=ritmo");
    // O aluno do cenário tem 0 de 5 metas: está atrasado, não em ritmo.
    await expect(studentRow(teacherPage, scenario.student.name)).toHaveCount(0);

    await teacherPage.goto("/professor?situacao=atrasado");
    await expect(studentRow(teacherPage, scenario.student.name)).toBeVisible();

    await teacherPage.goto(`/professor?plano=${encodeURIComponent(scenario.planName)}`);
    await expect(studentRow(teacherPage, scenario.student.name)).toBeVisible();
  });
});

test.describe("F-TURMA-04 · filtro inválido não quebra", () => {
  for (const [label, query] of [
    ["situação inexistente", "situacao=abacaxi"],
    ["plano inexistente", "plano=Plano%20que%20nao%20existe"],
    ["os dois", "situacao=&plano="],
  ] as const) {
    test(`${label} devolve a lista inteira`, async ({ teacherPage, scenario, consoleErrors }) => {
      await teacherPage.goto(`/professor?${query}`);

      await expect(studentRow(teacherPage, scenario.student.name)).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe("F-TURMA-05 · quem precisa de atenção vem primeiro", () => {
  test.use({ scenarioOptions: { withGoals: false } });

  test("a ordenação é por urgência, depois por nome", async ({
    teacherPage,
    scenario,
  }) => {
    // Um segundo aluno, vinculado ao mesmo professor e sem nada: "Sem dados".
    const outro = await createUser("student", "Zulmira Sem Dados", "aluno");
    try {
      await asUser(scenario.teacher.id, (client) =>
        client.query("select public.link_student($1::uuid, gen_random_uuid())", [outro.id]),
      );
      // O aluno do cenário tem planejamento sem metas e sem questões: também
      // "Sem dados". Damos metas a ele para virar "Atrasado".
      await addWeek(scenario, 1);

      await teacherPage.goto("/professor");
      // `allTextContents()` NÃO espera por nada — devolve o que casa naquele
      // instante. O site é uma SPA: a tabela só existe depois de os loaders da
      // rota resolverem, o que é DEPOIS do `load` que o `goto` aguarda. Sem uma
      // asserção que espere antes, a lista volta vazia e o teste falha
      // acusando outra coisa.
      await expect(studentRow(teacherPage, outro.name)).toBeVisible();
      const nomes = await teacherPage.locator("tbody tr td:first-child strong").allTextContents();
      const doCenario = nomes.indexOf(scenario.student.name);
      const semDados = nomes.indexOf(outro.name);

      expect(doCenario).toBeGreaterThanOrEqual(0);
      expect(semDados).toBeGreaterThanOrEqual(0);
      // Atrasado (rank 0) antes de Sem dados (rank 2).
      expect(doCenario).toBeLessThan(semDados);
    } finally {
      await query("delete from public.student_teacher_links where student_id = $1", [outro.id]);
      await deleteUser(outro.id);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — prévia e distribuição por peso.
// Spec docs/specs/18-previa-e-distribuicao-da-semana.md
// ---------------------------------------------------------------------------

const previewSection = (page: import("@playwright/test").Page) => page.locator(".preview");

test.describe("F-PREV-01 · a prévia não grava nada", () => {
  test("mostra as metas por dia e o total", async ({ teacherPage, scenario }) => {
    const antes = await goalCount(scenario.planId);

    await teacherPage.goto("/professor/metas");
    await teacherPage.click('button:has-text("Gerar prévia")');

    // 2 blocos com teoria ligada: 4 metas.
    await expect(previewSection(teacherPage).locator("h3")).toContainText("4 meta(s)");
    await expect(previewSection(teacherPage)).toContainText("nada foi gravado ainda");
    await expect(previewSection(teacherPage)).toContainText("Segunda");

    expect(await goalCount(scenario.planId)).toBe(antes);
  });
});

test.describe("F-PREV-02 · o que a prévia mostrou é o que a semana recebe", () => {
  test("os títulos batem", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor/metas");
    await teacherPage.click('button:has-text("Gerar prévia")');

    const daPrevia = await previewSection(teacherPage).locator("li").allTextContents();
    expect(daPrevia.length).toBe(4);

    await teacherPage.click('button:has-text("Gerar metas da semana")');
    await expect(teacherPage.locator(".alert--success")).toContainText("4 meta(s) criada(s)");

    const gravadas = await query<{ title: string }>(
      "select title from public.goals where study_plan_id = $1 and week_number = 2 and deleted_at is null",
      [scenario.planId],
    );
    expect(new Set(gravadas.map((g) => g.title))).toEqual(new Set(daPrevia));
  });
});

test.describe("F-PREV-03 · peso maior gera mais metas", () => {
  test("a disciplina de peso 3 recebe mais que a de peso 1", async ({
    teacherPage,
    scenario,
  }) => {
    const [primeira, segunda] = scenario.blocks;

    await teacherPage.goto("/professor/metas");
    await teacherPage.uncheck("input[name=withTheory]");
    await teacherPage.fill("#total", "8");
    await teacherPage.fill(`input[name="peso:${primeira!.subjectName}"]`, "3");
    await teacherPage.fill(`input[name="peso:${segunda!.subjectName}"]`, "1");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--success")).toContainText("8 meta(s) criada(s)");

    const daPrimeira = await count(
      "select count(*) from public.goals where study_plan_id = $1 and week_number = 2 and block_id = $2 and deleted_at is null",
      [scenario.planId, primeira!.id],
    );
    const daSegunda = await count(
      "select count(*) from public.goals where study_plan_id = $1 and week_number = 2 and block_id = $2 and deleted_at is null",
      [scenario.planId, segunda!.id],
    );

    expect(daPrimeira).toBe(6);
    expect(daSegunda).toBe(2);
  });
});

test.describe("F-PREV-04 · peso 0 tira a disciplina da semana", () => {
  test("nenhuma meta da disciplina zerada é criada", async ({ teacherPage, scenario }) => {
    const [primeira, segunda] = scenario.blocks;

    await teacherPage.goto("/professor/metas");
    await teacherPage.uncheck("input[name=withTheory]");
    await teacherPage.fill("#total", "4");
    await teacherPage.fill(`input[name="peso:${segunda!.subjectName}"]`, "0");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--success")).toContainText("4 meta(s) criada(s)");

    expect(
      await count(
        "select count(*) from public.goals where study_plan_id = $1 and week_number = 2 and block_id = $2 and deleted_at is null",
        [scenario.planId, segunda!.id],
      ),
    ).toBe(0);
    expect(
      await count(
        "select count(*) from public.goals where study_plan_id = $1 and week_number = 2 and block_id = $2 and deleted_at is null",
        [scenario.planId, primeira!.id],
      ),
    ).toBe(4);
  });
});

test.describe("F-PREV-05 · validação do total e do peso", () => {
  test("total acima de 80 é recusado e nada é gravado", async ({ teacherPage, scenario }) => {
    const antes = await goalCount(scenario.planId);

    await teacherPage.goto("/professor/metas");
    await teacherPage.fill("#total", "81");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--error")).toHaveText(
      "O total de metas precisa ficar entre 1 e 80.",
    );
    expect(await goalCount(scenario.planId)).toBe(antes);
  });

  test("peso acima de 20 é recusado", async ({ teacherPage, scenario }) => {
    const antes = await goalCount(scenario.planId);

    await teacherPage.goto("/professor/metas");
    await teacherPage.fill(`input[name="peso:${scenario.blocks[0]!.subjectName}"]`, "21");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--error")).toContainText("entre 0 e 20");
    expect(await goalCount(scenario.planId)).toBe(antes);
  });
});

test.describe("F-PREV-06 · mudar um peso não é replay", () => {
  test("o batch_id acompanha o peso, então a semana muda", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor/metas");
    await teacherPage.uncheck("input[name=withTheory]");
    await teacherPage.fill("#total", "4");
    await teacherPage.click('button:has-text("Gerar metas da semana")');
    await expect(teacherPage.locator(".alert--success")).toContainText("4 meta(s) criada(s)");

    // Mesma semana, mesmo total, PESO diferente. Se o peso não entrasse no
    // hash, isto voltaria como "Este lote já tinha sido aplicado".
    await teacherPage.fill("#week", "2");
    await teacherPage.fill(`input[name="peso:${scenario.blocks[1]!.subjectName}"]`, "0");
    await teacherPage.click('button:has-text("Gerar metas da semana")');

    await expect(teacherPage.locator(".alert--success")).toContainText("4 meta(s) criada(s)");
    await expect(teacherPage.locator(".alert--success")).not.toContainText("já tinha sido aplicado");
  });
});

// ---------------------------------------------------------------------------
// §4 — dificuldades por tópico.
// Spec docs/specs/23-dificuldades-por-topico.md
// ---------------------------------------------------------------------------

const difficultyCard = (page: import("@playwright/test").Page) =>
  cardByTitle(page, "Dificuldades por tópico");

/**
 * Duas baterias no mesmo bloco, errando tópicos escolhidos.
 *
 * "Local de crime" erra nas duas → recorrente. "Cadeia de custódia" erra numa
 * só → pontual. "Perícia papiloscópica" não erra → não deve aparecer.
 */
async function twoBatteriesWithTopicErrors(scenario: import("../fixtures/scenario.ts").Scenario) {
  const block = scenario.blocks[0]!;
  const primeira = scenario.goals.find((goal) => goal.blockId === block.id)!;
  await completeQuiz(scenario, primeira, {
    incorrectTopics: ["Local de crime", "Cadeia de custódia"],
  });
  const semana2 = await addWeek(scenario, 2);
  await completeQuiz(scenario, semana2.find((g) => g.blockId === block.id)!, {
    incorrectTopics: ["Local de crime"],
  });
  return block;
}

test.describe("F-DIFI-01 · a ficha mostra os tópicos com erro", () => {
  test("ordenados por mais erros, com o bloco de origem", async ({ teacherPage, scenario }) => {
    const block = await twoBatteriesWithTopicErrors(scenario);

    await teacherPage.goto(studentPageOf(scenario.student.id));

    const card = difficultyCard(teacherPage);
    // Espera a tabela existir antes de ler: `allTextContents()` devolve o que
    // casa naquele instante, e o loader da rota resolve depois do `load`.
    await expect(card.locator("tbody tr")).toHaveCount(2);
    const topicos = await card.locator("tbody tr td:first-child").allTextContents();
    expect(topicos).toEqual(["Local de crime", "Cadeia de custódia"]);

    const linha = card.locator("tbody tr", { hasText: "Local de crime" });
    await expect(linha).toContainText(block.name);
  });
});

test.describe("F-DIFI-02 · erro em duas baterias é recorrente", () => {
  test("erro numa bateria só não é", async ({ teacherPage, scenario }) => {
    await twoBatteriesWithTopicErrors(scenario);

    await teacherPage.goto(studentPageOf(scenario.student.id));

    const card = difficultyCard(teacherPage);
    await expect(card.locator("tbody tr", { hasText: "Local de crime" })).toContainText(
      "Recorrente",
    );
    await expect(card.locator("tbody tr", { hasText: "Local de crime" })).toContainText(
      "em 2 bateria(s)",
    );
    const pontual = card.locator("tbody tr", { hasText: "Cadeia de custódia" });
    await expect(pontual).not.toContainText("Recorrente");
    await expect(pontual).toContainText("em 1 bateria(s)");
  });
});

test.describe("F-DIFI-03 · tópico sem erro não aparece", () => {
  test("e a bateria toda certa deixa o cartão vazio", async ({ teacherPage, scenario }) => {
    await twoBatteriesWithTopicErrors(scenario);

    await teacherPage.goto(studentPageOf(scenario.student.id));

    const card = difficultyCard(teacherPage);
    await expect(card.locator("tbody tr")).toHaveCount(2);
    // O aluno respondeu esse tópico e acertou tudo: ele não é problema.
    await expect(card).not.toContainText("Perícia papiloscópica");
  });
});

test.describe("F-DIFI-03 · sem erro nenhum, o cartão explica", () => {
  test("bateria inteira certa não gera linha", async ({ teacherPage, scenario }) => {
    const block = scenario.blocks[0]!;
    const goal = scenario.goals.find((g) => g.blockId === block.id)!;
    await completeQuiz(scenario, goal, { incorrectTopics: [] });

    await teacherPage.goto(studentPageOf(scenario.student.id));

    await expect(difficultyCard(teacherPage)).toContainText("Nenhum erro registrado");
  });
});

// ---------------------------------------------------------------------------
// §4 — revisão espaçada.
// Spec docs/specs/24-revisao-espacada.md
// ---------------------------------------------------------------------------

const SUBJECT = "Ciências Forenses";

test.describe("F-REVE-01 · o professor define o espaçamento", () => {
  // `teacherPage` e `studentPage` embrulham a MESMA Page: pedir os dois no
  // mesmo teste faz o segundo login sobrescrever o primeiro, e a tela do
  // professor abre como aluno. Troca de identidade é `signIn`, explícita.
  test("a grade do aluno passa a mostrar as revisões", async ({
    teacherPage,
    signIn,
    scenario,
  }) => {
    // 5 cadernos na disciplina: com 1ª = 2, a partir do segundo há o que revisar.
    await addBlocks(scenario, SUBJECT, 4);

    await teacherPage.goto(studentPageOf(scenario.student.id));

    const card = cardByTitle(teacherPage, "Revisão espaçada");
    const linha = card.locator("tbody tr", { hasText: SUBJECT });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText("sem revisão programada");

    await linha.locator('input[name="firstInterval"]').fill("2");
    await linha.locator('input[name="secondInterval"]').fill("3");
    await linha.getByRole("button", { name: "Salvar" }).click();

    await expect(teacherPage.locator(".content > .alert--success")).toContainText(
      "Espaçamento salvo",
    );

    // E o aluno vê a grade que isso produz.
    await signIn(scenario.student);
    await teacherPage.goto("/aluno/revisoes");
    const grade = cardByTitle(teacherPage, SUBJECT);
    await expect(grade).toContainText("1ª revisão a cada 2 caderno(s)");
    // 5 cadernos: a linha do 2º revisa o 1º, e assim por diante.
    await expect(grade.locator("tbody tr")).toHaveCount(5);
  });
});

test.describe("F-REVE-04 · disciplina sem espaçamento", () => {
  test("não entra na grade do aluno e aparece zerada na do professor", async ({
    studentPage,
    signIn,
    scenario,
  }) => {
    await addBlocks(scenario, SUBJECT, 3);
    await setSpacing(scenario, SUBJECT, 2, 0);

    await studentPage.goto("/aluno/revisoes");
    await expect(cardByTitle(studentPage, SUBJECT)).toBeVisible();
    // A outra disciplina do cenário tem cadernos e nenhum espaçamento.
    await expect(cardByTitle(studentPage, "Direito Penal")).toHaveCount(0);

    await signIn(scenario.teacher);
    const teacherPage = studentPage;
    await teacherPage.goto(studentPageOf(scenario.student.id));
    const card = cardByTitle(teacherPage, "Revisão espaçada");
    await expect(card.locator("tbody tr", { hasText: "Direito Penal" })).toContainText(
      "sem revisão programada",
    );
  });
});

test.describe("F-REVE-05 · espaçamento fora da faixa", () => {
  test("é recusado com mensagem, e nada é gravado", async ({ teacherPage, scenario }) => {
    await addBlocks(scenario, SUBJECT, 2);

    await teacherPage.goto(studentPageOf(scenario.student.id));
    const linha = cardByTitle(teacherPage, "Revisão espaçada").locator("tbody tr", {
      hasText: SUBJECT,
    });

    // 61 passa pelo navegador porque o formulário é `noValidate`: a validação
    // nativa BLOQUEARIA o submit e a action nunca rodaria, deixando a tela muda.
    await linha.locator('input[name="firstInterval"]').fill("61");
    await linha.getByRole("button", { name: "Salvar" }).click();

    await expect(linha.locator(".field__error")).toContainText("entre 0 e 60");
    expect(
      await count("select count(*) from public.review_spacings where study_plan_id = $1", [
        scenario.planId,
      ]),
    ).toBe(0);
  });
});

test.describe("F-REVE-07 · isolamento do espaçamento", () => {
  test("professor sem vínculo não chega à ficha nem ao espaçamento", async ({
    page,
    signIn,
    scenario,
  }) => {
    await addBlocks(scenario, SUBJECT, 3);
    await setSpacing(scenario, SUBJECT, 2, 0);

    // O outro professor tem aluno próprio, e nenhum vínculo com este.
    const outro = await createScenario();
    await signIn(outro.teacher);

    // Não existe status 404 neste servidor: o que se verifica é a TELA e a
    // ausência do dado no HTML. A garantia de RLS está em
    // supabase/tests/11_review_spacing.sql, que roda como `authenticated` —
    // `asUser` do e2e conecta como superusuário e não exerce policy nenhuma.
    await page.goto(studentPageOf(scenario.student.id));
    await expect(page.locator("body")).not.toContainText(SUBJECT);
    await expect(page.locator("body")).not.toContainText(scenario.student.name);
  });
});

// ---------------------------------------------------------------------------
// §4 — tempo de estudo na ficha do aluno.
// Spec docs/specs/25-tempo-de-estudo-e-series.md
// ---------------------------------------------------------------------------

test.describe("F-TEMP-06 · o professor vê as três leituras", () => {
  test("tempo, sequência e série na ficha do aluno", async ({ teacherPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 12, minutes: 85 });
    await addWeek(scenario, 2);

    await teacherPage.goto(studentPageOf(scenario.student.id));

    await expect(
      cardByTitle(teacherPage, "Tempo de estudo").locator(".study-total"),
    ).toContainText("1h25");
    await expect(
      cardByTitle(teacherPage, "Sequência").locator(".streak-value strong"),
    ).toHaveText("1");

    const serie = cardByTitle(teacherPage, "Semana a semana");
    await expect(serie.locator("tbody tr")).toHaveCount(2);
    await expect(serie.locator("tbody tr", { hasText: "Semana 1" })).toContainText("80%");
  });
});

// ---------------------------------------------------------------------------
// §4 — resumo por tópicos da bateria, na ficha.
// Spec docs/specs/26-topicos-do-bloco-e-da-bateria.md
// ---------------------------------------------------------------------------

test.describe("F-RESU-06 · o professor vê o resumo da bateria", () => {
  test("do cartão Baterias, com as três fases", async ({ teacherPage, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, {
      incorrectTopics: ["Cadeia de custódia"],
      minutes: 85,
    });

    await teacherPage.goto(studentPageOf(scenario.student.id));

    const lista = cardByTitle(teacherPage, "Baterias");
    await expect(lista.locator("tbody tr")).toHaveCount(1);
    await lista.getByRole("link", { name: "Ver tópicos" }).click();

    const resumo = cardByTitle(teacherPage, "Tópicos desta bateria");
    await expect(resumo.locator("tbody tr")).toHaveCount(3);
    await expect(resumo.locator("tbody tr", { hasText: "Cadeia de custódia" })).toContainText(
      "erro(s)",
    );
  });
});

// ---------------------------------------------------------------------------
// §4 — dados do próprio professor.
// Spec docs/specs/27-dados-do-professor.md
// ---------------------------------------------------------------------------

test.describe("F-CONTA-01 · o professor vê os próprios dados", () => {
  test("a mesma tela do aluno, com o texto do papel dele", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto("/professor/conta");

    await expect(teacherPage.locator("h1")).toHaveText("Meus dados");
    await expect(teacherPage.locator('input[name="name"]')).toHaveValue(scenario.teacher.name);
    await expect(teacherPage.locator(".content")).toContainText("aparecem para os seus alunos");
  });
});

test.describe("F-CONTA-02 · salvar um nome novo", () => {
  test("o nome muda na sidebar sem recarregar", async ({ teacherPage, scenario }) => {
    const novo = `${scenario.teacher.name} Editado`;

    await teacherPage.goto("/professor/conta");
    await teacherPage.locator('input[name="name"]').fill(novo);
    await teacherPage.locator(".content button[type=submit]").click();

    await expect(teacherPage.locator(".alert--success")).toContainText("Dados atualizados");
    // A revalidação re-roda o loader do layout, que é quem alimenta a sidebar.
    await expect(teacherPage.locator(".sidebar")).toContainText(novo);
  });
});

test.describe("F-CONTA-03 · nome curto demais", () => {
  test("é recusado com mensagem, e nada é gravado", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor/conta");
    await teacherPage.locator('input[name="name"]').fill("An");
    await teacherPage.locator(".content button[type=submit]").click();

    await expect(teacherPage.locator(".alert--error")).toContainText("nome completo");
    await expect(teacherPage.locator(".sidebar")).toContainText(scenario.teacher.name);
  });
});

test.describe("F-CONTA-04 · o e-mail é bloqueado", () => {
  test("nas duas telas, e o texto muda com o papel", async ({
    teacherPage,
    signIn,
    scenario,
  }) => {
    await teacherPage.goto("/professor/conta");
    const emailProf = teacherPage.locator("#field-contactEmail");
    await expect(emailProf).toBeDisabled();
    await expect(teacherPage.locator(".content")).toContainText("não muda por aqui");

    await signIn(scenario.student);
    await teacherPage.goto("/aluno/conta");
    await expect(teacherPage.locator("#field-contactEmail")).toBeDisabled();
    await expect(teacherPage.locator(".content")).toContainText("fale com o professor");
  });
});
