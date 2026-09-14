/**
 * §2 do `docs/fluxos-e2e.md` — revisão, análise e conta.
 *
 * Nasceu na Fase 5. Cobre o que a reescrita das telas de `/aluno/revisoes`,
 * `/aluno/estatisticas`, `/aluno/conta`, `/aluno/lista-espera` e
 * `/aluno/cadernos` promete.
 *
 * DUAS COISAS QUE ESTE BANCO AINDA NÃO PERMITE, e que estão marcadas `fixme`
 * em vez de apagadas: resgatar cupom (`coupons` está sem policy e sem grant, de
 * propósito — o resgate precisa nascer como RPC) e executar reforço (o motor de
 * baterias saiu com a extensão).
 */
import { expect, test } from "../fixtures/index.ts";
import { one, query } from "../fixtures/db.ts";
import { addTheoryCatalog, addTheoryGoal, setAccess } from "../fixtures/scenario.ts";
import { alert, content, field, testId } from "../support/ui.ts";

test.describe("F-EST-01 · os números vêm do ledger", () => {
  test("registro na tela aparece nos KPIs e nas séries", async ({ studentPage, scenario }) => {
    const goal = scenario.goals.find((candidate) => candidate.type === "theory")!;

    // Dois registros em dias diferentes, para a série ter mais de um ponto.
    await query(
      `insert into public.goal_entries
         (goal_id, student_id, teacher_id, minutes, questions, correct_answers, created_at)
       values ($1, $2, $3, 60, 20, 15, now() - interval '3 days'),
              ($1, $2, $3, 30, 10, 9,  now())`,
      [goal.id, scenario.student.id, scenario.teacher.id],
    );

    await studentPage.goto("/aluno/estatisticas");
    await expect(studentPage.locator("h1")).toHaveText("Estatísticas");

    // 24 de 30 é 80%.
    await expect(content(studentPage)).toContainText("80%");
    await expect(content(studentPage)).toContainText("24/30 acertos");
    await expect(content(studentPage)).toContainText("1h30");

    // Dois dias com registro: o gráfico de tempo por dia tem duas colunas.
    await expect(testId(studentPage, "chart-minutes-day").locator('[data-testid="chart-bar"]')).toHaveCount(2);
  });

  test("toda figura traz a tabela dos números", async ({ studentPage, scenario }) => {
    const goal = scenario.goals.find((candidate) => candidate.type === "theory")!;
    await query(
      `insert into public.goal_entries
         (goal_id, student_id, teacher_id, minutes, questions, correct_answers, created_at)
       values ($1, $2, $3, 60, 20, 15, now() - interval '2 days'),
              ($1, $2, $3, 30, 10, 9,  now())`,
      [goal.id, scenario.student.id, scenario.teacher.id],
    );

    await studentPage.goto("/aluno/estatisticas");
    // ESPERA ANTES DE CONTAR. `count()` devolve o que casa NAQUELE instante, e
    // o conteúdo só existe depois de os loaders da rota resolverem — que é
    // depois do `load` que o `goto` aguarda. Sem esta linha o contador lê zero
    // e o teste acusa "sem tabela" quando o que faltou foi esperar.
    await expect(testId(studentPage, "chart-minutes-day")).toBeVisible();

    // É o que sustenta leitor de tela, impressão em preto e branco, e quem só
    // quer o número sem passar o ponteiro por doze barras.
    const tabelas = testId(studentPage, "chart-table");
    expect(await tabelas.count()).toBeGreaterThan(0);
    await expect(tabelas.first()).toContainText("min");
  });

  test("um ponto só vira número, e não um gráfico de uma barra", async ({
    studentPage,
    scenario,
  }) => {
    const goal = scenario.goals.find((candidate) => candidate.type === "theory")!;
    await query(
      `insert into public.goal_entries
         (goal_id, student_id, teacher_id, minutes, questions, correct_answers)
       values ($1, $2, $3, 45, 10, 7)`,
      [goal.id, scenario.student.id, scenario.teacher.id],
    );

    await studentPage.goto("/aluno/estatisticas");

    // Uma barra sozinha ocupa a largura inteira e não compara nada com nada.
    const porDia = testId(studentPage, "chart-minutes-day");
    await expect(porDia).toHaveAttribute("data-single", "true");
    await expect(porDia.locator('[data-testid="chart-single-value"]')).toHaveText("45min");
  });

  test("sem registro, a tela diz isso em vez de desenhar zeros", async ({ studentPage }) => {
    await studentPage.goto("/aluno/estatisticas");

    // Zero por cento é uma afirmação; ausência de resposta não é.
    await expect(content(studentPage)).toContainText("—");
    await expect(testId(studentPage, "empty")).toContainText("Nenhum registro");
  });
});

test.describe("F-REV-01 · a grade de revisão", () => {
  test("mostra o espaçamento do professor, e o aluno não o edita", async ({
    studentPage,
    scenario,
  }) => {
    await addTheoryCatalog(scenario, { reviewSpacing: 3 });

    await studentPage.goto("/aluno/revisoes");
    await expect(studentPage.locator("h1")).toHaveText("Controle de revisões");
    await expect(content(studentPage)).toContainText("Revisão a cada 3 aulas");

    // Quem configura é o professor: `theory_review_rules` exige
    // `teacher_id = auth.uid()`. Campo editável aqui seria promessa recusada.
    await expect(content(studentPage).locator('input[name="lessonSpacing"]')).toHaveCount(0);
  });

  test("a revisão vencida aparece marcada, e o aluno a registra", async ({
    studentPage,
    scenario,
  }) => {
    const catalog = await addTheoryCatalog(scenario, {
      initialQuestions: 5,
      reviewSpacing: 1,
    });
    const goalId = await addTheoryGoal(scenario, catalog.subject);

    // Fecha duas aulas para a revisão da primeira vencer.
    for (const [index, lesson] of catalog.lessons.slice(0, 2).entries()) {
      await query(
        `insert into public.theory_progress
           (study_plan_id, student_id, theory_lesson_id, current_page, theory_done,
            initial_questions_done, initial_questions_complete, lesson_done)
         values ($1, $2, $3, $4, true, 5, true, true)`,
        [scenario.planId, scenario.student.id, lesson.id, 17 + index * 12],
      );
      await query(
        `insert into public.theory_reviews
           (study_plan_id, student_id, theory_lesson_id, review_number, minimum_questions)
         values ($1, $2, $3, 1, 10)`,
        [scenario.planId, scenario.student.id, lesson.id],
      );
    }
    expect(goalId).toBeTruthy();

    await studentPage.goto("/aluno/revisoes");

    const vencida = studentPage.locator('[data-testid="review-row"][data-due="true"]');
    await expect(vencida).toHaveCount(1);

    await vencida.getByRole("button", { name: "Registrar" }).click();
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("8");
    await vencida.getByRole("button", { name: "Salvar" }).click();

    await expect(
      studentPage.locator('[data-testid="review-row"][data-status="completed"]'),
    ).toHaveCount(1);
  });

  test("o reforço tem lugar próprio, e o vazio dele é a resposta certa", async ({
    studentPage,
    scenario,
  }) => {
    await addTheoryCatalog(scenario);

    await studentPage.goto("/aluno/revisoes");

    // Revisão é calendário; reforço é reação a desempenho baixo. Numa lista só,
    // o aluno não sabe por que cada linha está ali.
    await expect(content(studentPage)).toContainText("Reforços");
    await expect(content(studentPage)).toContainText("execução de baterias está sendo reescrita");
    await expect(studentPage.locator('[data-testid="reinforcement-row"]')).toHaveCount(0);
  });
});

test.describe("F-CONTA-01 · meus dados", () => {
  test("o nome salva; o resto é contexto e não tem campo", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno/conta");

    await field(studentPage, "name").fill("Aluno Renomeado E2E");
    await testId(studentPage, "account-form").getByRole("button", { name: "Salvar" }).click();

    await expect(alert(studentPage, "success")).toContainText("Dados salvos");
    // O nome do rodapé vem do loader do layout: a revalidação o alcança.
    await expect(testId(studentPage, "user-chip")).toContainText("Aluno Renomeado E2E");

    expect(
      (await one<{ name: string }>("select name from public.profiles where id = $1", [
        scenario.student.id,
      ])).name,
    ).toBe("Aluno Renomeado E2E");

    // `profiles` concede UPDATE só em `name`. Papel e acesso são contexto, e
    // oferecer campo para eles seria promessa que o banco recusa.
    await expect(testId(studentPage, "account-form").locator('input[name="role"]')).toHaveCount(0);
    await expect(testId(studentPage, "account-form").locator('input[name="accessStatus"]')).toHaveCount(0);
    await expect(field(studentPage, "email")).toBeDisabled();
  });

  test("nome curto é recusado, com o campo marcado", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");

    await field(studentPage, "name").fill("Jo");
    await testId(studentPage, "account-form").getByRole("button", { name: "Salvar" }).click();

    await expect(alert(studentPage, "error")).toHaveText("Informe seu nome completo.");
  });
});

test.describe("F-ESP-01 · lista de espera", () => {
  test.use({ scenarioOptions: { access: "pending", withPlan: false } });

  test("quem não tem acesso é mandado para cá, e a inscrição grava", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage).toHaveURL(/\/aluno\/lista-espera$/);
    await expect(alert(studentPage, "warning")).toContainText("ainda não foi liberado");

    await field(studentPage, "name").fill("Candidata E2E");
    // O e-mail NÃO é digitado: a policy `waitlist_insert_student` compara com
    // o do JWT, então a tela o mostra travado no e-mail da conta.
    await expect(field(studentPage, "email")).toBeDisabled();
    await expect(field(studentPage, "email")).toHaveValue(scenario.student.email);
    await field(studentPage, "whatsapp").fill("(11) 90000-0000");
    await field(studentPage, "interestArea").fill("Fiscal");
    await field(studentPage, "targetExam").fill("Receita Federal");
    await testId(studentPage, "waitlist-form").getByRole("button").click();

    await expect(alert(studentPage, "success")).toContainText("Inscrição enviada");

    const saved = await one<{ name: string; status: string; teacher_id: string }>(
      "select name, status::text, teacher_id from public.waitlist where student_id = $1",
      [scenario.student.id],
    );
    expect(saved).toMatchObject({
      name: "Candidata E2E",
      status: "waiting",
      teacher_id: scenario.teacher.id,
    });
  });

  test("a inscrição pode ser corrigida enquanto o professor não responde", async ({
    studentPage,
  }) => {
    await studentPage.goto("/aluno/lista-espera");
    await field(studentPage, "name").fill("Primeiro Nome E2E");
    await field(studentPage, "whatsapp").fill("(11) 90000-0000");
    await field(studentPage, "interestArea").fill("Fiscal");
    await field(studentPage, "targetExam").fill("Receita");
    await testId(studentPage, "waitlist-form").getByRole("button").click();
    await expect(alert(studentPage, "success")).toBeVisible();

    await studentPage.reload();
    await expect(field(studentPage, "name")).toHaveValue("Primeiro Nome E2E");

    await field(studentPage, "name").fill("Nome Corrigido E2E");
    await testId(studentPage, "waitlist-form").getByRole("button").click();
    await expect(alert(studentPage, "success")).toBeVisible();

    await studentPage.reload();
    await expect(field(studentPage, "name")).toHaveValue("Nome Corrigido E2E");
  });

  /*
   * SUSPENSO ATÉ O RESGATE NASCER COMO RPC.
   *
   * `coupons` está com RLS ligada, ZERO policy e ZERO grant — de propósito:
   * validar o código no cliente entregaria a lista de códigos a quem pedir. A
   * tela diz isso em vez de oferecer o campo e culpar quem digitou certo.
   */
  test.fixme("resgatar cupom libera o acesso", async ({ studentPage }) => {
    await studentPage.goto("/aluno/lista-espera");
    await field(studentPage, "coupon").fill("CUPOM-E2E");
    await studentPage.getByRole("button", { name: "Resgatar" }).click();
    await expect(alert(studentPage, "success")).toContainText("Acesso liberado");
  });

  test("com acesso liberado a tela deixa de avisar", async ({ studentPage, scenario }) => {
    await setAccess(scenario.student.id, "active");

    await studentPage.goto("/aluno/lista-espera");
    await expect(alert(studentPage, "warning")).toHaveCount(0);
  });
});

test.describe("F-CAD-01 · cadernos TEC do aluno", () => {
  test("lista por disciplina, com link e sem botão de bateria", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno/cadernos");
    await expect(studentPage.locator("h1")).toHaveText("Cadernos TEC");

    const linhas = studentPage.locator('[data-testid="notebook-row"]');
    await expect(linhas).toHaveCount(scenario.blocks.length);
    await expect(linhas.first().getByRole("link", { name: "Abrir no TEC" })).toBeVisible();

    // A execução da bateria saiu com a extensão. Um botão aqui abriria sessão
    // sem ter onde respondê-la, e sessão travada é pior do que botão ausente.
    await expect(content(studentPage).getByRole("button", { name: /bateria/i })).toHaveCount(0);
  });

  test("caderno desativado continua visível, apagado", async ({ studentPage, scenario }) => {
    await query(
      "update public.study_plan_notebooks set active = false where block_id = $1",
      [scenario.blocks[0]!.id],
    );

    await studentPage.goto("/aluno/cadernos");

    // Sumir faria o aluno procurar o que o professor tirou do ar de propósito.
    const desativado = studentPage.locator('[data-testid="notebook-row"][data-active="false"]');
    await expect(desativado).toHaveCount(1);
    await expect(desativado).toContainText("desativado pelo professor");
    await expect(desativado.getByRole("link")).toHaveCount(0);
  });
});
