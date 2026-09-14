/**
 * §5 do `docs/fluxos-e2e.md` — isolamento entre contextos, pelo lado das telas.
 *
 * A RLS e os grants já são cobertos sem navegador por `supabase/tests/`. O que
 * falta, e é o que está aqui, é a pergunta que só a interface responde: *a tela
 * mostra o dado do outro?* Uma policy correta com um `select` mal escrito na
 * página vaza do mesmo jeito.
 *
 * Cada teste monta DOIS pares professor/aluno completos e navega com as duas
 * identidades na mesma aba, uma depois da outra — `teacherPage` e `studentPage`
 * derivam do mesmo `page`, então trocar de papel é `signIn`, nunca pedir as
 * duas fixtures.
 *
 * REESCRITO NA FASE 6. A parte que dependia de bateria concluída saiu com o
 * motor; o que a substitui é registro de estudo, que é o que existe hoje e
 * produz exatamente o mesmo tipo de vazamento se a consulta errar.
 */
import { expect, test } from "../fixtures/index.ts";
import { query } from "../fixtures/db.ts";
import { addTheoryCatalog, createScenario } from "../fixtures/scenario.ts";
import { STUDENT_STUDY_ROUTES, studentPageOf } from "../support/routes.ts";
import { alert, content, testId } from "../support/ui.ts";

/** Dá ao aluno do cenário um registro de estudo reconhecível. */
async function study(
  scenario: Awaited<ReturnType<typeof createScenario>>,
  minutes: number,
): Promise<void> {
  await query(
    `insert into public.goal_entries (goal_id, student_id, teacher_id, minutes, questions, correct_answers)
     values ($1, $2, $3, $4, 20, 16)`,
    [scenario.goals[0]!.id, scenario.student.id, scenario.teacher.id, minutes],
  );
}

test.describe("F-ISO-01 · leitura", () => {
  test("o aluno 2 não vê nada do aluno 1", async ({ page, signIn, scenario }) => {
    await study(scenario, 85);
    const outro = await createScenario({ withPlan: false });

    await signIn(outro.student);

    await page.goto("/aluno");
    await expect(alert(page, "info")).toContainText("Nenhum planejamento ativo");
    await expect(page.locator("body")).not.toContainText(scenario.planName);
    await expect(page.locator("body")).not.toContainText(scenario.goals[0]!.title);

    for (const route of STUDENT_STUDY_ROUTES.slice(1)) {
      await page.goto(route);
      await expect(page.locator("body")).not.toContainText(scenario.planName);
      await expect(page.locator("body")).not.toContainText(scenario.goals[0]!.title);
    }
  });

  test("o aluno 2 com planejamento próprio vê só o próprio", async ({
    page,
    signIn,
    scenario,
  }) => {
    await study(scenario, 85);
    const outro = await createScenario();

    await signIn(outro.student);
    await page.goto("/aluno");

    await expect(content(page)).toContainText(outro.planName);
    await expect(page.locator("body")).not.toContainText(scenario.planName);

    // Nenhuma meta do vizinho, e nenhum número dele.
    await expect(page.locator("body")).not.toContainText(scenario.goals[0]!.title);
    await page.goto("/aluno/estatisticas");
    // 1h25 é o tempo do vizinho. Zero é o próprio.
    await expect(content(page)).not.toContainText("1h25");
  });

  test("o professor 2 não vê o aluno 1 em nenhuma tela", async ({ page, signIn, scenario }) => {
    await study(scenario, 85);
    const outro = await createScenario();

    await signIn(outro.teacher);

    await page.goto("/professor");
    await expect(testId(page, "student-card")).toHaveCount(1);
    await expect(content(page)).toContainText(outro.student.name);
    await expect(page.locator("body")).not.toContainText(scenario.student.name);

    for (const route of ["/professor/planejamentos", "/professor/cadernos", "/professor/metas"]) {
      await page.goto(route);
      await expect(page.locator("body")).not.toContainText(scenario.planName);
      await expect(page.locator("body")).not.toContainText(scenario.student.name);
    }
  });

  test("a ficha do aluno 1 não é encontrada pelo professor 2", async ({
    page,
    signIn,
    scenario,
  }) => {
    const outro = await createScenario();
    await signIn(outro.teacher);

    await page.goto(studentPageOf(scenario.student.id));

    // Não existe status 404 neste servidor: o teste verifica a TELA, e a
    // ausência do dado nela.
    await expect(content(page)).toContainText("Aluno não encontrado");
    await expect(page.locator("body")).not.toContainText(scenario.student.name);
  });
});

test.describe("F-ISO-02 · a query string não é uma porta", () => {
  test("planejamento alheio em ?plano= é ignorado", async ({ page, signIn, scenario }) => {
    const outro = await createScenario();
    await signIn(outro.teacher);

    // A RLS esconde a linha; a tela precisa cair no planejamento DELE em vez de
    // mostrar uma tela vazia que parece defeito.
    await page.goto(`/professor/metas?plano=${scenario.planId}`);
    await expect(page.locator("body")).not.toContainText(scenario.planName);

    await page.goto(`/professor/cadernos?plano=${scenario.planId}`);
    await expect(page.locator("body")).not.toContainText(scenario.blocks[0]!.name);
  });

  test("catálogo alheio em ?catalogo= é ignorado", async ({ page, signIn, scenario }) => {
    const catalog = await addTheoryCatalog(scenario);
    const outro = await createScenario();
    await signIn(outro.teacher);

    await page.goto(`/professor/teoria?catalogo=${catalog.id}`);
    await expect(page.locator('[data-testid="lesson-row"]')).toHaveCount(0);
  });

  test("semana alheia não vaza pelo seletor do aluno", async ({ page, signIn, scenario }) => {
    await study(scenario, 85);
    const outro = await createScenario();

    await signIn(outro.student);
    await page.goto("/aluno?semana=1");

    await expect(page.locator("body")).not.toContainText(scenario.goals[0]!.title);
  });
});
