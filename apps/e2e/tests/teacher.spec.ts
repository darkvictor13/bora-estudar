/**
 * §4 do `docs/fluxos-e2e.md` — telas do professor.
 */
import { expect, test } from "../fixtures/index.ts";
import {
  addWeek,
  createScenario,
  createUser,
  deleteUser,
  goalCount,
  planWeeks,
  setAccess,
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
      await expect(row.locator(".badge")).toHaveText("Aguardando liberação");

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

    await expect(teacherPage.locator(".alert--success")).toHaveText(
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
      teacherPage.locator("tbody tr", { hasText: scenario.student.name }).locator(".badge"),
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
