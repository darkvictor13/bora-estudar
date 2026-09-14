/**
 * §2 do `docs/fluxos-e2e.md` — o fluxo inteligente da teoria.
 *
 * Nasceu na Fase 4, e segue os OITO PASSOS do piloto da v108.2:
 *
 *   1. abrir a meta;  2. confirmar a aula e o caderno;
 *   3. salvar uma página intermediária;  4. fechar/reabrir e conferir;
 *   5. concluir a teoria;  6. registrar questões iniciais;
 *   7. atingir o mínimo e ver a próxima aula liberada;
 *   8. conferir a criação da revisão conforme a regra.
 *
 * As regras puras têm teste sem navegador em `lib/domain/theory.test.ts`. Aqui
 * é o caminho completo: tela, contrato e banco.
 */
import { expect, test } from "../fixtures/index.ts";
import { count, maybeOne, one } from "../fixtures/db.ts";
import {
  addTheoryCatalog,
  addTheoryGoal,
  type Scenario,
  type TheoryCatalog,
} from "../fixtures/scenario.ts";
import { alert, field, goalRow, testId } from "../support/ui.ts";

type Page = import("@playwright/test").Page;

async function openTheory(page: Page, goalId: string): Promise<void> {
  await page.goto("/aluno");
  await goalRow(page, goalId).locator('[data-testid="goal-theory"]').click();
  await expect(testId(page, "theory-dialog")).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await testId(page, "theory-dialog").getByRole("button", { name: "Fechar" }).click();
  await expect(testId(page, "theory-dialog")).toHaveCount(0);
}

async function savePage(page: Page, value: string): Promise<void> {
  await field(page, "currentPage").fill(value);
  await testId(page, "theory-save-continue").click();
}

async function tab(page: Page, name: string): Promise<void> {
  await testId(page, "theory-tabs").getByRole("tab", { name: new RegExp(name) }).click();
}

/** Cenário com catálogo e uma meta de teoria na disciplina auditada. */
async function withCatalog(
  scenario: Scenario,
  options?: Parameters<typeof addTheoryCatalog>[1],
): Promise<{ catalog: TheoryCatalog; goalId: string }> {
  const catalog = await addTheoryCatalog(scenario, options);
  return { catalog, goalId: await addTheoryGoal(scenario, catalog.subject) };
}

test.describe("F-TEO-01 · passos 1 e 2 · abrir a meta e confirmar a aula", () => {
  test("o modal abre na primeira aula não concluída, com as três abas", async ({
    studentPage,
    scenario,
  }) => {
    const { catalog, goalId } = await withCatalog(scenario);

    await openTheory(studentPage, goalId);

    const dialog = testId(studentPage, "theory-dialog");
    await expect(dialog).toContainText(catalog.lessons[0]!.title);
    await expect(dialog).toContainText("A01");
    // O intervalo auditado aparece: é ele que o aluno abre no PDF.
    await expect(dialog).toContainText("páginas 5 a 17");
    await expect(testId(studentPage, "theory-percent")).toHaveText("0% lido");

    const tabs = testId(studentPage, "theory-tabs").getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveText("Teoria");
    await expect(tabs.nth(1)).toHaveText("Questões iniciais");
  });

  test("meta de disciplina fora do catálogo não abre o fluxo", async ({
    studentPage,
    scenario,
  }) => {
    await addTheoryCatalog(scenario);
    const goalId = await addTheoryGoal(scenario, "Disciplina Que Ninguém Cadastrou");

    await studentPage.goto("/aluno");
    // Sem aula resolvida não há o que abrir: a linha cai no registro comum.
    await expect(goalRow(studentPage, goalId).locator('[data-testid="goal-theory"]')).toHaveCount(0);
    await expect(goalRow(studentPage, goalId).getByRole("button", { name: "Registrar" })).toBeVisible();
  });
});

test.describe("F-TEO-02 · passos 3 e 4 · salvar a página e reabrir", () => {
  test("o progresso é por página, e continua de onde parou", async ({
    studentPage,
    scenario,
  }) => {
    const { catalog, goalId } = await withCatalog(scenario);

    await openTheory(studentPage, goalId);
    // Teoria de 5 a 17: a página 11 é 7 das 13 páginas.
    await savePage(studentPage, "11");
    await expect(testId(studentPage, "theory-percent")).toHaveText("54% lido");

    await closeDialog(studentPage);
    await openTheory(studentPage, goalId);

    await expect(testId(studentPage, "theory-percent")).toHaveText("54% lido");
    // Reabrir sugere a PRÓXIMA página, não a que já foi lida.
    await expect(field(studentPage, "currentPage")).toHaveValue("12");

    const saved = await one<{ current_page: number; theory_done: boolean }>(
      "select current_page, theory_done from public.theory_progress where theory_lesson_id = $1",
      [catalog.lessons[0]!.id],
    );
    expect(saved).toMatchObject({ current_page: 11, theory_done: false });
  });

  test("a página é presa ao intervalo auditado", async ({ studentPage, scenario }) => {
    const { catalog, goalId } = await withCatalog(scenario);

    await openTheory(studentPage, goalId);
    await savePage(studentPage, "999");

    // 17 é o fim da teoria da aula 1. Aceitar 999 gravaria um progresso que
    // nenhuma tela consegue explicar.
    await expect(testId(studentPage, "theory-percent")).toContainText("100% lido");
    const saved = await one<{ current_page: number }>(
      "select current_page from public.theory_progress where theory_lesson_id = $1",
      [catalog.lessons[0]!.id],
    );
    expect(saved.current_page).toBe(17);
  });
});

test.describe("F-TEO-03 · encerrar a sessão NÃO conclui a aula", () => {
  /*
   * É a distinção que a v108.2 introduziu e a que mais se perde ao reescrever.
   * Encerrar guarda a página e fecha o modal; concluir exige a teoria lida E o
   * mínimo de questões iniciais.
   */
  test("o botão de encerrar grava a página e fecha, e a aula segue aberta", async ({
    studentPage,
    scenario,
  }) => {
    const { catalog, goalId } = await withCatalog(scenario);

    await openTheory(studentPage, goalId);
    await field(studentPage, "currentPage").fill("17");
    await testId(studentPage, "theory-save-end").click();

    await expect(testId(studentPage, "theory-dialog")).toHaveCount(0);

    // `expect.poll` porque ENCERRAR NÃO DEIXA SINAL NA TELA: o modal fecha
    // antes de a gravação voltar, de propósito — quem encerrou já foi embora.
    // Asserção única aqui leria o banco antes da escrita chegar.
    await expect
      .poll(() =>
        maybeOne<{ current_page: number; theory_done: boolean; lesson_done: boolean }>(
          `select current_page, theory_done, lesson_done
             from public.theory_progress where theory_lesson_id = $1`,
          [catalog.lessons[0]!.id],
        ),
      )
      // Teoria lida, aula ABERTA: faltam as questões iniciais.
      .toMatchObject({ current_page: 17, theory_done: true, lesson_done: false });
  });
});

test.describe("F-TEO-04 · passos 5 a 7 · questões iniciais liberam a próxima aula", () => {
  test("abaixo do mínimo a aula não fecha; no mínimo, fecha e avança", async ({
    studentPage,
    scenario,
  }) => {
    const { catalog, goalId } = await withCatalog(scenario, { initialQuestions: 15 });

    await openTheory(studentPage, goalId);
    await savePage(studentPage, "17");
    await expect(testId(studentPage, "theory-percent")).toContainText("teoria concluída");

    await tab(studentPage, "Questões iniciais");
    await expect(testId(studentPage, "initial-questions-count")).toHaveText("0/15");

    // Passo 6: dez questões — abaixo do mínimo.
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("8");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();

    await tab(studentPage, "Questões iniciais");
    await expect(testId(studentPage, "initial-questions-count")).toHaveText("10/15");
    expect(
      (
        await one<{ lesson_done: boolean }>(
          "select lesson_done from public.theory_progress where theory_lesson_id = $1",
          [catalog.lessons[0]!.id],
        )
      ).lesson_done,
    ).toBe(false);

    // Passo 7: as cinco que faltavam. A aula fecha e o modal passa à seguinte.
    await field(studentPage, "questions").fill("5");
    await field(studentPage, "correctAnswers").fill("4");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();

    // O modal AVISA que trocou de aula: sem isso a Aula 02 aparece do nada e a
    // pessoa acha que perdeu o que fez.
    await expect(alert(testId(studentPage, "theory-dialog"), "success")).toContainText(
      "Aula concluída",
    );
    await expect(testId(studentPage, "theory-dialog")).toContainText(catalog.lessons[1]!.title);

    const done = await one<{ lesson_done: boolean; initial_questions_done: number }>(
      `select lesson_done, initial_questions_done
         from public.theory_progress where theory_lesson_id = $1`,
      [catalog.lessons[0]!.id],
    );
    expect(done).toMatchObject({ lesson_done: true, initial_questions_done: 15 });
  });

  test("as questões iniciais entram no ledger da meta", async ({ studentPage, scenario }) => {
    const { goalId } = await withCatalog(scenario);

    await openTheory(studentPage, goalId);
    await tab(studentPage, "Questões iniciais");
    await field(studentPage, "questions").fill("12");
    await field(studentPage, "correctAnswers").fill("9");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();

    // O desempenho da semana conta as questões iniciais como qualquer outro
    // estudo: elas são estudo.
    await expect
      .poll(() =>
        maybeOne<{ questions: number; correct_answers: number; theory_stage: string }>(
          `select questions, correct_answers, theory_stage::text
             from public.goal_entries where goal_id = $1`,
          [goalId],
        ),
      )
      .toMatchObject({ questions: 12, correct_answers: 9, theory_stage: "questions_in_progress" });
  });

  test("acertos acima do total são recusados", async ({ studentPage, scenario }) => {
    const { goalId } = await withCatalog(scenario);

    await openTheory(studentPage, goalId);
    await tab(studentPage, "Questões iniciais");
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("30");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();

    await expect(alert(studentPage, "error")).toContainText(
      "Os acertos não podem passar do total de questões",
    );
  });
});

test.describe("F-TEO-05 · passo 8 · a revisão nasce pela regra", () => {
  test("uma revisão por regra ativa, e a fila não bloqueia o avanço", async ({
    studentPage,
    scenario,
  }) => {
    const { catalog, goalId } = await withCatalog(scenario, {
      initialQuestions: 5,
      reviewSpacing: 1,
    });

    // Fecha a primeira aula.
    await openTheory(studentPage, goalId);
    await savePage(studentPage, "17");
    await tab(studentPage, "Questões iniciais");
    await field(studentPage, "questions").fill("5");
    await field(studentPage, "correctAnswers").fill("5");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();
    await expect(alert(testId(studentPage, "theory-dialog"), "success")).toBeVisible();

    expect(
      await count("select count(*) from public.theory_reviews where theory_lesson_id = $1", [
        catalog.lessons[0]!.id,
      ]),
    ).toBe(1);

    // Fecha a segunda: agora a revisão da primeira VENCEU (espaçamento 1).
    // O modal já trocou de aula, mas continua na aba de questões — voltar à
    // Teoria é o que a pessoa faria, e é o que o teste faz.
    await tab(studentPage, "Teoria");
    await savePage(studentPage, "29");
    await tab(studentPage, "Questões iniciais");
    await field(studentPage, "questions").fill("5");
    await field(studentPage, "correctAnswers").fill("5");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();

    await tab(studentPage, "Revisões");
    const vencida = studentPage.locator('[data-testid="theory-review"][data-due="true"]');
    await expect(vencida).toHaveCount(1);
    await expect(vencida).toContainText(catalog.lessons[0]!.title);

    // E mesmo vencida, a terceira aula está aberta: fila, não muro.
    await tab(studentPage, "Teoria");
    await expect(testId(studentPage, "theory-dialog")).toContainText(catalog.lessons[2]!.title);
  });

  test("registrar a revisão fecha quando atinge o mínimo", async ({ studentPage, scenario }) => {
    const { catalog, goalId } = await withCatalog(scenario, {
      initialQuestions: 5,
      reviewSpacing: 1,
    });

    await openTheory(studentPage, goalId);
    await savePage(studentPage, "17");
    await tab(studentPage, "Questões iniciais");
    await field(studentPage, "questions").fill("5");
    await field(studentPage, "correctAnswers").fill("5");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();
    await expect(alert(testId(studentPage, "theory-dialog"), "success")).toBeVisible();

    await tab(studentPage, "Revisões");
    await testId(studentPage, "theory-review").getByRole("button", { name: "Registrar" }).click();
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("8");
    await testId(studentPage, "theory-review").getByRole("button", { name: "Salvar" }).click();

    await expect(
      studentPage.locator('[data-testid="theory-review"][data-status="completed"]'),
    ).toHaveCount(1);

    const saved = await one<{ status: string; questions_answered: number }>(
      "select status::text, questions_answered from public.theory_reviews where theory_lesson_id = $1",
      [catalog.lessons[0]!.id],
    );
    expect(saved).toMatchObject({ status: "completed", questions_answered: 10 });
  });
});

test.describe("F-TEO-06 · disciplina fora do catálogo auditado", () => {
  /*
   * Matemática Financeira e TI ficaram de fora da auditoria da v108.5. A v2
   * RECUSA inventar número de página e mostra o diagnóstico. Inventar faz o
   * aluno ler o PDF errado e achar que a culpa é dele.
   */
  test("o modal mostra o diagnóstico em vez do controle por página", async ({
    studentPage,
    scenario,
  }) => {
    const catalog = await addTheoryCatalog(scenario, { withUnaudited: true });
    const goalId = await addTheoryGoal(scenario, catalog.unauditedSubject);

    await openTheory(studentPage, goalId);

    await expect(alert(testId(studentPage, "theory-dialog"), "warning")).toContainText(
      "ainda não está no catálogo auditado",
    );
    // Sem abas e sem campo de página: não há progresso por página a oferecer.
    await expect(testId(studentPage, "theory-tabs")).toHaveCount(0);
    await expect(field(studentPage, "currentPage")).toHaveCount(0);
  });

  test("a tela de controle marca a disciplina, e não a esconde", async ({
    studentPage,
    scenario,
  }) => {
    await addTheoryCatalog(scenario, { withUnaudited: true });

    await studentPage.goto("/aluno/teoria");
    await expect(studentPage.locator("h1")).toHaveText("Estudo da teoria");

    const naoAuditada = studentPage.locator(
      '[data-testid="theory-subject"][data-diagnosis="subject_not_audited"]',
    );
    await expect(naoAuditada).toHaveCount(1);
    await expect(alert(studentPage, "warning")).toContainText("Fora do catálogo auditado");
  });
});

test.describe("F-TEO-07 · o controle por disciplina", () => {
  test("aula atual, progresso e revisões vencidas, por matéria", async ({
    studentPage,
    scenario,
  }) => {
    const { catalog, goalId } = await withCatalog(scenario, {
      initialQuestions: 5,
      reviewSpacing: 1,
    });

    await studentPage.goto("/aluno/teoria");
    await expect(studentPage.locator('[data-testid="theory-subject"]')).toHaveCount(1);
    await expect(studentPage.locator('[data-testid="card"]').first()).toContainText(
      catalog.lessons[0]!.title,
    );

    // Fecha uma aula e a tela acompanha.
    await openTheory(studentPage, goalId);
    await savePage(studentPage, "17");
    await tab(studentPage, "Questões iniciais");
    await field(studentPage, "questions").fill("5");
    await field(studentPage, "correctAnswers").fill("5");
    await testId(studentPage, "initial-questions-form").getByRole("button").click();
    await expect(alert(testId(studentPage, "theory-dialog"), "success")).toBeVisible();

    await studentPage.goto("/aluno/teoria");
    await expect(studentPage.locator('[data-testid="theory-subject"]')).toContainText("1/4");
    await expect(studentPage.locator('[data-testid="card"]').first()).toContainText(
      catalog.lessons[1]!.title,
    );
  });

  test("sem catálogo vinculado, a tela explica em vez de ficar vazia", async ({ studentPage }) => {
    await studentPage.goto("/aluno/teoria");
    await expect(testId(studentPage, "empty")).toContainText("catálogo de teoria");
  });
});
