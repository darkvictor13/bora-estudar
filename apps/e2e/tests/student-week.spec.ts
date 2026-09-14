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
import { one, maybeOne } from "../fixtures/db.ts";
import { addWeek, type Scenario, type ScenarioGoal } from "../fixtures/scenario.ts";
import { alert, content, field, goalRow, testId } from "../support/ui.ts";

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
    await studentPage.goto("/aluno");
    await expect(testId(studentPage, "week-hero")).toBeVisible();

    const valores = testId(studentPage, "week-stat-value");
    // Semana nova: nenhum registro, e desempenho é TRAÇO, não zero — zero por
    // cento é uma afirmação, e ausência de resposta não é.
    await expect(valores.nth(0)).toHaveText("—");
    await expect(valores.nth(2)).toHaveText("0");

    await record(studentPage, theoryGoalOf(scenario).id, {
      minutes: "40",
      questions: "10",
      correct: "8",
    });

    await expect(valores.nth(0)).toHaveText("80%");
    await expect(valores.nth(1)).toHaveText("40min");
    await expect(valores.nth(2)).toHaveText("10");
    // Registrar não conclui: a contagem de metas não se mexe.
    await expect(testId(studentPage, "week-stat").nth(2)).toContainText("0/5 metas");
  });
});

test.describe("F-META-02 · a semana escolhida mora na URL", () => {
  test("navega, sobrevive ao recarregar e o botão voltar funciona", async ({
    studentPage,
    scenario,
  }) => {
    // O seletor só tem para onde ir com mais de uma semana planejada.
    await addWeek(scenario, 2);

    await studentPage.goto("/aluno");
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
  ] as const) {
    test(`${label} na query string não quebra a tela`, async ({ studentPage, consoleErrors }) => {
      await studentPage.goto(`/aluno?semana=${value}`);

      await expect(testId(studentPage, "week-hero")).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });
  }

  test("semana sem meta mostra o vazio, e não uma tela quebrada", async ({ studentPage }) => {
    await studentPage.goto("/aluno?semana=40");

    await expect(testId(studentPage, "week-hero")).toContainText("Semana 40");
    await expect(testId(studentPage, "empty")).toContainText("Nenhuma meta para esta semana");
  });
});

test.describe("F-META-03 · registrar estudo", () => {
  test("o registro entra no ledger e NÃO conclui a meta", async ({ studentPage, scenario }) => {
    const goal = theoryGoalOf(scenario);

    await studentPage.goto("/aluno");
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

  test("dois registros na mesma meta somam, em vez de substituir", async ({
    studentPage,
    scenario,
  }) => {
    const goal = theoryGoalOf(scenario);
    await studentPage.goto("/aluno");

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
    await studentPage.goto("/aluno");

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
    await studentPage.goto("/aluno");

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
    await studentPage.goto("/aluno");

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
    await studentPage.goto("/aluno");
    await expect(testId(studentPage, "week-stat").nth(2)).toContainText("0/5 metas");

    await goalRow(studentPage, theoryGoalOf(scenario).id)
      .locator('[data-testid="goal-check"]')
      .click();

    await expect(testId(studentPage, "week-stat").nth(2)).toContainText("1/5 metas");
    await expect(testId(studentPage, "week-hero")).toContainText("20%");
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
    await studentPage.goto("/aluno");

    const row = goalRow(studentPage, quiz.id);
    await expect(row).toHaveAttribute("data-type", "question_block");
    await expect(row.locator('[data-testid="goal-check"]')).toBeDisabled();
    await expect(row.getByRole("button", { name: "Registrar" })).toHaveCount(0);
    await expect(row.locator('[data-testid="goal-blocked"]')).toContainText("Bateria indisponível");
  });
});

test.describe("F-EXTRA-01 · estudo fora das metas", () => {
  test("cria a meta e o registro numa operação só", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno");

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

  test("entra no tempo e no desempenho da semana", async ({ studentPage }) => {
    await studentPage.goto("/aluno");
    const valores = testId(studentPage, "week-stat-value");

    await content(studentPage).getByRole("button", { name: "Estudo extra" }).first().click();
    await field(studentPage, "subject").fill("Direito Tributário");
    await field(studentPage, "minutes").fill("50");
    await field(studentPage, "questions").fill("10");
    await field(studentPage, "correctAnswers").fill("10");
    await testId(studentPage, "extra-study-dialog")
      .getByRole("button", { name: "Lançar estudo" })
      .click();

    await expect(valores.nth(1)).toHaveText("50min");
    await expect(valores.nth(0)).toHaveText("100%");
  });

  test("matéria vazia é recusada", async ({ studentPage }) => {
    await studentPage.goto("/aluno");

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
    await studentPage.goto("/aluno");
    await expect(alert(studentPage, "info")).toContainText("Nenhum planejamento ativo");
  });
});

test.describe("F-PLAN-01 · o planejamento, como o aluno o vê", () => {
  test("identidade, números e ciclo por peso", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno/planejamento");

    await expect(studentPage.locator("h1")).toHaveText("Planejamento");
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
