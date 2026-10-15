/**
 * Nível Crítico — fluxo 6: semana do aluno (registrar, concluir, reabrir, pular, estudo extra).
 */
import type { Page } from "@playwright/test";

import { expect, go, query, test, type Scenario } from "../qa.ts";
import { reload } from "../qa.ts";

const row = (page: Page, goalId: string) => page.locator(`[data-testid="goal-row"][data-goal-id="${goalId}"]`);
const dialog = (page: Page) => page.locator('[data-testid="record-study-dialog"]');

async function openRecord(page: Page, goalId: string) {
  await row(page, goalId).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

async function fillRecord(page: Page, v: { minutes?: string; questions?: string; correct?: string; note?: string }) {
  const d = dialog(page);
  if (v.minutes !== undefined) await d.locator('[name="minutes"]').fill(v.minutes);
  if (v.questions !== undefined) await d.locator('[name="questions"]').fill(v.questions);
  if (v.correct !== undefined) await d.locator('[name="correctAnswers"]').fill(v.correct);
  if (v.note !== undefined) await d.locator('[name="note"]').fill(v.note);
}

async function entries(goalId: string) {
  return query<{ minutes: number; questions: number; correct_answers: number; note: string | null }>(
    "select minutes, questions, correct_answers, note from goal_entries where goal_id=$1 order by created_at",
    [goalId],
  );
}

function extraGoal(s: Scenario) {
  return s.goals.find((g) => g.type === "extra")!;
}

test.describe("F6 · registrar estudo", () => {
  test("F6.1 caminho feliz: registra, cabeçalho soma, persiste depois do F5", async ({ studentPage: page, scenario, shot }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    await openRecord(page, goal.id);
    await fillRecord(page, { minutes: "45", questions: "10", correct: "8", note: "Revisei 🎯 artigos 5º e 37 — \"ok\" <b>negrito</b>" });
    await dialog(page).getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().click();
    await expect(dialog(page)).toHaveCount(0);
    const e = await entries(goal.id);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ minutes: 45, questions: 10, correct_answers: 8 });
    await reload(page);
    await page.waitForLoadState("networkidle");
    const stats = await page.locator('[data-testid="week-stat"]').allTextContents();
    await shot(page, "F6.1 semana depois de registrar 45min 10q 8a");
    expect.soft(stats.join(" | ")).toMatch(/45\s*min/);
    expect.soft(stats.join(" | ")).toMatch(/8\/10|80\s*%/);
  });

  test("F6.2 validações do registro", async ({ studentPage: page, scenario, finding, shot }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    const cases: Array<{ label: string; v: { minutes: string; questions: string; correct: string } ; accept: boolean }> = [
      { label: "tudo zero", v: { minutes: "0", questions: "0", correct: "0" }, accept: false },
      { label: "acertos > questões", v: { minutes: "30", questions: "5", correct: "6" }, accept: false },
      { label: "minutos negativos com questões", v: { minutes: "-30", questions: "5", correct: "2" }, accept: false },
      { label: "questões e acertos negativos", v: { minutes: "30", questions: "-5", correct: "-10" }, accept: false },
      { label: "minutos fracionados", v: { minutes: "1.5", questions: "0", correct: "0" }, accept: false },
      { label: "minutos absurdos (10 dias)", v: { minutes: "14400", questions: "0", correct: "0" }, accept: false },
      { label: "minutos estouram int", v: { minutes: "99999999999", questions: "0", correct: "0" }, accept: false },
      { label: "notação científica", v: { minutes: "1e3", questions: "0", correct: "0" }, accept: false },
    ];
    for (const c of cases) {
      const before = (await entries(goal.id)).length;
      await openRecord(page, goal.id);
      await fillRecord(page, c.v);
      await dialog(page).getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().click();
      await page.waitForTimeout(1500);
      const after = await entries(goal.id);
      const msg = (await dialog(page).locator('[data-testid="alert"]').allTextContents()).join(" | ");
      const accepted = after.length > before;
      if (accepted !== c.accept || /[a-z]+ [a-z]+ (for|of) type|invalid input|out of range|violates/i.test(msg)) {
        await shot(page, `F6.2 registro ${c.label}`);
        finding({
          severity: accepted ? "Médio" : "Baixo",
          title: accepted ? `Registro de estudo aceita ${c.label}` : `Registro com ${c.label} recusado com mensagem técnica`,
          detail: `entrada ${JSON.stringify(c.v)} → ${accepted ? `gravou ${JSON.stringify(after.at(-1))}` : `recusou: "${msg}"`}`,
        });
      }
      if (await dialog(page).count()) await dialog(page).getByRole("button", { name: "Cancelar" }).click();
    }
  });

  test("F6.3 duplo clique em registrar grava UM registro", async ({ studentPage: page, scenario }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    await openRecord(page, goal.id);
    await fillRecord(page, { minutes: "20" });
    await dialog(page).getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().dblclick();
    await page.waitForTimeout(2000);
    expect((await entries(goal.id)).length).toBe(1);
  });

  test("F6.4 servidor grava, resposta se perde, aluno tenta de novo", async ({ studentPage: page, scenario, shot, finding }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    await openRecord(page, goal.id);
    await fillRecord(page, { minutes: "25" });
    let lost = false;
    await page.route("**/rest/v1/goal_entries**", async (route) => {
      if (!lost && route.request().method() === "POST") {
        lost = true;
        await route.fetch();
        return route.abort("internetdisconnected");
      }
      return route.continue();
    });
    await dialog(page).getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().click();
    await page.waitForTimeout(1500);
    const msg = (await dialog(page).locator('[data-testid="alert"]').allTextContents()).join(" | ");
    await shot(page, "F6.4 registro com resposta perdida");
    if (/TypeError|Failed to fetch/.test(msg)) {
      finding({ severity: "Médio", title: "Falha de rede ao registrar estudo mostra 'TypeError: Failed to fetch'", detail: msg });
    }
    await dialog(page).getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().click();
    await page.waitForTimeout(2000);
    const n = (await entries(goal.id)).length;
    if (n > 1) {
      finding({ severity: "Alto", title: "Registro de estudo duplica quando a resposta se perde e o aluno tenta de novo", detail: `${n} registros de 25 min para um envio. goal_entries não guarda request_id; once() esquece o id na falha.` });
    }
    expect.soft(n, "um envio, um registro").toBe(1);
  });
});

test.describe("F6 · concluir, reabrir, pular", () => {
  test("F6.5 concluir → reabrir → pular, e cada estado sobrevive ao F5", async ({ studentPage: page, scenario }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    const r = () => row(page, goal.id);
    await r().getByRole("button", { name: /^Concluir/ }).click();
    await expect(r()).toHaveAttribute("data-status", "completed");
    await reload(page);
    await expect(r()).toHaveAttribute("data-status", "completed");
    await r().getByRole("button", { name: /^Reabrir/ }).click();
    await expect(r()).not.toHaveAttribute("data-status", "completed");
    await r().getByRole("button", { name: /^Mais ações/ }).click();
    await page.getByRole("menuitem", { name: "Pular meta" }).click();
    await expect(r()).toHaveAttribute("data-status", "skipped");
    await reload(page);
    await expect(r()).toHaveAttribute("data-status", "skipped");
    const db = await query<{ status: string }>("select status from goals where id=$1", [goal.id]);
    expect(db[0]!.status).toBe("skipped");
  });

  test("F6.6 concluir duas vezes rápido (duplo clique no check)", async ({ studentPage: page, scenario }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    await row(page, goal.id).getByRole("button", { name: /^Concluir/ }).dblclick();
    await page.waitForTimeout(2000);
    const db = await query<{ status: string }>("select status from goals where id=$1", [goal.id]);
    // Duplo clique = concluir; não pode virar concluir + reabrir.
    expect.soft(db[0]!.status).toBe("completed");
  });

  test("F6.7 meta concluída noutra aba: a tela não mente", async ({ studentPage: page, scenario, shot }) => {
    const goal = extraGoal(scenario);
    await go(page, "/aluno?dia=todos");
    const other = await page.context().newPage();
    await go(other, "/aluno?dia=todos");
    await row(other, goal.id).getByRole("button", { name: /^Concluir/ }).click();
    await expect(row(other, goal.id)).toHaveAttribute("data-status", "completed");
    // A primeira aba ainda acha que está pendente e clica em concluir.
    await row(page, goal.id).getByRole("button", { name: /^Concluir/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, "F6.7 concluir meta ja concluida em outra aba");
    const db = await query<{ status: string }>("select status from goals where id=$1", [goal.id]);
    expect.soft(db[0]!.status, "não pode reabrir sozinho").toBe("completed");
  });
});

test.describe("F6 · estudo extra e semana na URL", () => {
  test("F6.8 estudo extra: cria meta e registro; datas fora do plano", async ({ studentPage: page, scenario, shot, finding }) => {
    await go(page, "/aluno?dia=todos");
    const goalsBefore = await query<{ n: number }>("select count(*)::int n from goals where study_plan_id=$1", [scenario.planId]);
    await page.getByRole("button", { name: "Estudo extra" }).click();
    const d = page.locator('[data-testid="extra-study-dialog"]');
    await expect(d).toBeVisible();
    await d.locator('[name="subject"]').fill("Direito Penal");
    await d.locator('[name="minutes"]').fill("35");
    await d.getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().click();
    await expect(d).toHaveCount(0);
    const goalsAfter = await query<{ n: number }>("select count(*)::int n from goals where study_plan_id=$1", [scenario.planId]);
    expect(goalsAfter[0]!.n).toBe(goalsBefore[0]!.n + 1);

    for (const date of ["2031-01-01", "2020-01-01"]) {
      const before = (await query<{ n: number }>("select count(*)::int n from goals where study_plan_id=$1", [scenario.planId]))[0]!.n;
      await page.getByRole("button", { name: "Estudo extra" }).click();
      await d.locator('[name="subject"]').fill("Direito Penal");
      await d.locator('[name="date"]').fill(date);
      await d.locator('[name="minutes"]').fill("15");
      await d.getByRole("button", { name: /Registrar|Salvar|Lançar/ }).last().click();
      await page.waitForTimeout(1500);
      const created = await query<{ week_number: number; weekday: number }>("select week_number, weekday from goals where study_plan_id=$1 and type='extra' order by created_at desc limit 1", [scenario.planId]);
      const after = (await query<{ n: number }>("select count(*)::int n from goals where study_plan_id=$1", [scenario.planId]))[0]!.n;
      const msg = (await d.locator('[data-testid="alert"]').allTextContents()).join(" | ");
      await shot(page, `F6.8 estudo extra em ${date}`);
      if (after > before) {
        finding({ severity: "Médio", title: `Estudo extra aceita data ${date === "2031-01-01" ? "no futuro" : "antes do início do plano"}`, detail: `gravou semana ${created[0]?.week_number}, dia ${created[0]?.weekday}` });
      } else if (!msg) {
        finding({ severity: "Baixo", title: `Estudo extra em ${date} não grava e não explica`, detail: "sem alerta" });
      }
      if (await d.count()) await d.getByRole("button", { name: "Cancelar" }).click();
    }
  });

  test("F6.9 ?semana inválida e voltar/avançar", async ({ studentPage: page, scenario, shot, finding }) => {
    for (const q of ["99", "0", "-1", "abc", "1.5", "1e9"]) {
      await go(page, `/aluno?semana=${q}`);
      const h1 = await page.locator("h1").allTextContents();
      const errorCode = await page.locator('[data-testid="error-code"]').count();
      if (!h1.includes("Minha semana")) {
        await shot(page, `F6.9 semana=${q}`);
        finding({ severity: "Baixo", title: `?semana=${q} quebra a tela da semana`, detail: `h1=${JSON.stringify(h1)} error-code=${errorCode}` });
      }
    }
    void scenario;
  });
});
