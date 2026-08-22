/**
 * §5 do `docs/fluxos-e2e.md` — isolamento entre contextos, pelo lado das telas.
 *
 * A RLS, os grants e as RPCs já são cobertos sem navegador por
 * `supabase/tests/02_rls.sql` e `05_teacher_writes.sql`. O que falta, e é o que
 * está aqui, é a pergunta que só a interface responde: *a tela mostra o dado do
 * outro?* Uma policy correta com um `select` mal escrito na página vaza do mesmo
 * jeito.
 *
 * Cada teste monta DOIS pares professor/aluno completos e navega com as duas
 * identidades na mesma aba, uma depois da outra.
 */
import { expect, test } from "../fixtures/index.ts";
import { createScenario } from "../fixtures/scenario.ts";
import { completeQuiz } from "../fixtures/battery.ts";
import { STUDENT_STUDY_ROUTES, studentPageOf } from "../support/routes.ts";
import { cardByTitle } from "../support/ui.ts";

test.describe("F-ISO-01 · leitura", () => {
  test("o aluno 2 não vê nada do aluno 1", async ({ page, signIn, scenario }) => {
    // O aluno 1 tem planejamento, metas e uma bateria concluída.
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const outro = await createScenario({ withPlan: false });

    await signIn(outro.student);

    await page.goto("/aluno");
    await expect(page.locator(".alert--info")).toContainText("Nenhum planejamento ativo");
    await expect(page.locator("body")).not.toContainText(scenario.planName);
    await expect(page.locator("body")).not.toContainText(scenario.quizGoal.title);

    for (const route of STUDENT_STUDY_ROUTES.slice(1)) {
      await page.goto(route);
      await expect(page.locator(".alert--info")).toContainText("Nenhum planejamento ativo");
      await expect(page.locator("body")).not.toContainText(scenario.planName);
    }
  });

  test("o aluno 2 com planejamento próprio vê só o próprio", async ({
    page,
    signIn,
    scenario,
  }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const outro = await createScenario();

    await signIn(outro.student);
    await page.goto("/aluno");

    await expect(page.locator(".content__header p")).toContainText(outro.planName);
    await expect(page.locator("body")).not.toContainText(scenario.planName);

    // Nenhuma meta do vizinho, e nenhum número dele.
    await expect(page.locator("tbody tr", { hasText: scenario.quizGoal.title })).toHaveCount(0);
    await page.goto("/aluno/estatisticas");
    await expect(cardByTitle(page, "Desempenho oficial")).toContainText("—");
  });

  test("o professor 2 não vê o aluno 1 em nenhuma tela", async ({ page, signIn, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 10, minutes: 85 });
    const outro = await createScenario({ withLink: false, withPlan: false });

    await signIn(outro.teacher);

    await page.goto("/professor");
    await expect(page.locator(".empty")).toContainText("Nenhum aluno vinculado ainda.");
    await expect(page.locator("body")).not.toContainText(scenario.student.name);

    for (const route of ["/professor/planejamentos", "/professor/cadernos", "/professor/metas"]) {
      await page.goto(route);
      await expect(page.locator("body")).not.toContainText(scenario.student.name);
      await expect(page.locator("body")).not.toContainText(scenario.planName);
    }

    await page.goto("/professor/revisoes");
    await expect(page.locator(".empty")).toContainText("Nenhum aluno vinculado.");
  });

  test("a ficha do aluno 1 dá 404 para o professor 2", async ({ page, signIn, scenario }) => {
    const outro = await createScenario({ withPlan: false });
    await signIn(outro.teacher);

    const response = await page.goto(studentPageOf(scenario.student.id));
    expect(response?.status()).toBe(404);
  });
});

test.describe("F-ISO-01 · a query string não é uma porta", () => {
  test("planejamento alheio em ?plano= é ignorado", async ({ page, signIn, scenario }) => {
    const outro = await createScenario();
    await signIn(outro.teacher);

    for (const route of ["/professor/metas", "/professor/cadernos"]) {
      await page.goto(`${route}?plano=${scenario.planId}`);

      // Cai no planejamento próprio, sem vazar o nome do alheio.
      await expect(page.locator(".content")).toContainText(outro.planName);
      await expect(page.locator("body")).not.toContainText(scenario.planName);
    }
  });

  test("bloco alheio em ?bloco= é ignorado", async ({ page, signIn, scenario }) => {
    await completeQuiz(scenario, scenario.quizGoal, { correct: 11, minutes: 85 });
    const outro = await createScenario();

    await signIn(outro.student);
    await page.goto(`/aluno/revisoes?bloco=${scenario.blocks[0]!.id}`);

    // Nenhum cartão de erros abre para um bloco que não é do planejamento.
    await expect(page.locator(".card", { hasText: "Erros —" })).toHaveCount(0);
  });
});
