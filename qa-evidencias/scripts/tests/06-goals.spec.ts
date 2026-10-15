/**
 * Nível Alto — fluxo 9: gerar metas.
 */
import type { Page } from "@playwright/test";

import { expect, go, query, test } from "../qa.ts";

async function studentRecords(page: Page, goalId: string, minutes: string) {
  await go(page, "/aluno?dia=todos");
  const row = page.locator(`[data-testid="goal-row"][data-goal-id="${goalId}"]`);
  const direct = row.getByRole("button", { name: "Registrar", exact: true });
  if (await direct.count()) await direct.click();
  else {
    await row.getByRole("button", { name: /^Mais ações/ }).click();
    await page.getByRole("menuitem", { name: "Registrar estudo" }).click();
  }
  const d = page.locator('[data-testid="record-study-dialog"]');
  await d.locator('[name="minutes"]').fill(minutes);
  await d.locator('[name="questions"]').fill("12");
  await d.locator('[name="correctAnswers"]').fill("9");
  await d.getByRole("button", { name: "Registrar" }).click();
  await expect(d).toHaveCount(0);
}

async function generate(page: Page, planId: string, week: string, mode?: "full") {
  await go(page, `/professor/metas?plano=${planId}`);
  await page.locator('[data-testid="goals-week"]').fill(week);
  if (mode === "full") {
    await page.locator('[data-testid="goals-mode"]').locator("..").click();
    await page.getByRole("option", { name: /Completa|Substituir tudo|tudo/i }).click();
  }
  await page.locator('[data-testid="goals-preview"]').click();
  await expect(page.locator('[data-testid="week-preview"]')).toBeVisible();
}

test.describe("F9 · gerar metas", () => {
  test("F9.1 substituição SEGURA apaga meta em andamento e os registros dela?", async ({ page, scenario, signIn, shot, finding }) => {
    const theory = scenario.goals.find((g) => g.type === "theory" && g.weekday === 3) ?? scenario.goals.find((g) => g.type === "theory")!;
    await signIn(scenario.student);
    await studentRecords(page, theory.id, "40");
    const before = await query<{ n: number; m: number }>("select count(*)::int n, coalesce(sum(minutes),0)::int m from goal_entries where student_id=$1", [scenario.student.id]);
    const st = await query<{ status: string }>("select status from goals where id=$1", [theory.id]);
    expect(before[0]!.n).toBe(1);

    await signIn(scenario.teacher);
    await generate(page, scenario.planId, "1");
    const previewText = await page.locator('[data-testid="week-preview"]').textContent();
    await shot(page, "F9.1 previa da substituicao segura com meta em andamento");
    await page.locator('[data-testid="goals-generate"]').click();
    const confirm = page.locator('[data-testid="goals-confirm"]');
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.locator('[data-testid="alert"][data-status="success"]')).toBeVisible();

    const after = await query<{ n: number; m: number }>("select count(*)::int n, coalesce(sum(minutes),0)::int m from goal_entries where student_id=$1", [scenario.student.id]);
    if (after[0]!.n < before[0]!.n) {
      finding({
        severity: "Crítico",
        title: "Regerar a semana no modo 'Segura' apaga o estudo registrado pelo aluno",
        detail: `meta '${theory.title}' estava '${st[0]!.status}' com ${before[0]!.m} min registrados; depois de gerar, goal_entries do aluno: ${after[0]!.n} (${after[0]!.m} min). Prévia mostrava: ${previewText?.slice(0, 160)}`,
      });
    }
    await signIn(scenario.student);
    await go(page, "/aluno?dia=todos", { hard: true });
    await shot(page, "F9.1 semana do aluno depois da regeracao segura");
    expect.soft(after[0]!.n, "registros do aluno sobrevivem à substituição segura").toBe(before[0]!.n);
  });

  test("F9.2 gerar com a inserção falhando: a semana fica vazia?", async ({ teacherPage: page, scenario, shot, finding }) => {
    const before = await query<{ n: number }>("select count(*)::int n from goals where study_plan_id=$1 and week_number=1", [scenario.planId]);
    await generate(page, scenario.planId, "1");
    await page.route("**/rest/v1/goals**", async (route) => {
      if (route.request().method() === "POST") return route.abort("internetdisconnected");
      return route.continue();
    });
    await page.locator('[data-testid="goals-generate"]').click();
    const confirm = page.locator('[data-testid="goals-confirm"]');
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForTimeout(2500);
    await shot(page, "F9.2 gerar semana com insercao falhando");
    const after = await query<{ n: number }>("select count(*)::int n from goals where study_plan_id=$1 and week_number=1", [scenario.planId]);
    if (after[0]!.n < before[0]!.n) {
      finding({ severity: "Alto", title: "Falha na gravação ao gerar a semana apaga as metas antigas e não cria as novas", detail: `metas da semana 1: ${before[0]!.n} → ${after[0]!.n}. generateWeek faz DELETE e depois INSERT, sem transação.` });
    }
  });

  test("F9.3 semana inválida no campo e na URL", async ({ teacherPage: page, scenario, shot, finding }) => {
    for (const week of ["0", "-3", "1.5", "99999"]) {
      await go(page, `/professor/metas?plano=${scenario.planId}`);
      await page.locator('[data-testid="goals-week"]').fill(week);
      await page.locator('[data-testid="goals-preview"]').click();
      await page.waitForTimeout(1500);
      const preview = await page.locator('[data-testid="week-preview"]').count();
      const alerts = (await page.locator('[data-testid="alert"]').allTextContents()).join(" | ");
      if (preview && week !== "99999") {
        await shot(page, `F9.3 previa para semana ${week}`);
        finding({ severity: "Baixo", title: `Gerar metas aceita semana ${week}`, detail: `prévia montada; alertas: ${alerts}` });
      }
      if (week === "99999" && preview) {
        await shot(page, "F9.3 previa para semana 99999");
        finding({ severity: "Baixo", title: "Gerar metas aceita semana 99999 (anos depois da prova)", detail: alerts });
      }
      if (/TypeError|invalid input|syntax/i.test(alerts)) finding({ severity: "Baixo", title: `Semana ${week} recusada com erro técnico`, detail: alerts });
    }
  });

  test("F9.4 copiar da própria semana e de semana inexistente", async ({ teacherPage: page, scenario, shot, finding }) => {
    for (const from of ["1", "40"]) {
      await go(page, `/professor/metas?plano=${scenario.planId}`);
      await page.locator('[data-testid="goals-week"]').fill("1");
      await page.locator('[data-testid="goals-copy-from"]').fill(from);
      await page.locator('[data-testid="goals-preview"]').click();
      await page.waitForTimeout(1500);
      const text = (await page.locator("main").textContent()) ?? "";
      await shot(page, `F9.4 copiar semana ${from} para semana 1`);
      if (from === "40" && /Metas a criar\s*0/.test(text) === false && !/nenhuma|não há|vazia/i.test(text)) {
        finding({ severity: "Baixo", title: "Copiar de semana inexistente não avisa", detail: text.slice(0, 200) });
      }
    }
  });
});
