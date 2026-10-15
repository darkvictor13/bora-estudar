/**
 * Nível Alto — fluxo 8: planejamentos.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { authenticate, createScenario, expect, go, query, test } from "../qa.ts";
import { reload } from "../qa.ts";

const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const REST = "http://127.0.0.1:54321";
async function token(email: string, password: string) {
  const r = await fetch(`${REST}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return ((await r.json()) as { access_token: string }).access_token;
}

const planDialog = (page: Page) => page.locator('[data-testid="plan-dialog"]');

async function openNewPlan(page: Page) {
  await page.getByRole("button", { name: "Novo planejamento" }).click();
  await expect(planDialog(page)).toBeVisible();
}

async function addPausedPlan(s: Awaited<ReturnType<typeof createScenario>>, name: string): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into study_plans (id, teacher_id, student_id, name, area, stage, study_model, weekly_goals, starts_on, status)
     values ($1,$2,$3,$4,'Policial','Pré-edital','Avanço progressivo',12,current_date,'paused')`,
    [id, s.teacher.id, s.student.id, name],
  );
  return id;
}

test.describe("F8 · formulário de planejamento", () => {
  test("F8.1 validações: nome curto, prova antes do início, nome repetido, texto longo", async ({ teacherPage: page, scenario, shot, finding }) => {
    await go(page, "/professor/planejamentos");
    const cases: Array<{ label: string; name: string; starts?: string; exam?: string }> = [
      { label: "nome curto", name: "ab" },
      { label: "prova antes do início", name: "Plano QA Datas", starts: "2026-12-01", exam: "2026-11-01" },
      { label: "nome repetido do mesmo aluno", name: scenario.planName },
    ];
    for (const c of cases) {
      await openNewPlan(page);
      const d = planDialog(page);
      await d.locator('[name="name"]').fill(c.name);
      if (c.starts) await d.locator('[name="startsOn"]').fill(c.starts);
      if (c.exam) await d.locator('[name="examDate"]').fill(c.exam);
      await d.getByRole("button", { name: "Criar" }).click();
      await page.waitForTimeout(1500);
      const msg = (await d.locator('[data-testid="alert"]').allTextContents()).join(" | ");
      await shot(page, `F8.1 plano ${c.label}`);
      if (!msg) finding({ severity: "Médio", title: `Planejamento com ${c.label}: sem mensagem`, detail: "o diálogo não explicou" });
      else if (c.label.includes("repetido") && !/nome|já existe um planejamento/i.test(msg)) {
        finding({ severity: "Baixo", title: "Nome de planejamento repetido recusado com frase genérica", detail: msg });
      }
      if (await d.count()) await d.getByRole("button", { name: "Cancelar" }).click();
    }

    // Nome gigante e com emoji: o campo aceita? o banco aceita? a lista quebra?
    await openNewPlan(page);
    const d = planDialog(page);
    const long = `Plano 🚓 ${"Muito longo ".repeat(40)}`;
    await d.locator('[name="name"]').fill(long);
    await d.getByRole("button", { name: "Criar" }).click();
    await page.waitForTimeout(2000);
    const saved = await query<{ len: number }>("select length(name) len from study_plans where student_id=$1 and name like 'Plano 🚓%'", [scenario.student.id]);
    await shot(page, "F8.1 plano com nome de 490 caracteres");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (saved[0] && overflow) finding({ severity: "Baixo", title: "Nome longo de planejamento estoura a largura da página", detail: `${saved[0].len} caracteres` });
    if (saved[0] && saved[0].len > 200) finding({ severity: "Baixo", title: "Nome de planejamento sem limite de tamanho", detail: `gravou ${saved[0].len} caracteres` });
  });

  test("F8.2 editar planejamento persiste e o aluno vê o nome novo", async ({ teacherPage: page, scenario, signIn }) => {
    await go(page, "/professor/planejamentos");
    const card = page.locator(`[data-testid="plan-row"][data-plan-id="${scenario.planId}"]`);
    await card.getByRole("button", { name: "Editar" }).click();
    const d = planDialog(page);
    const newName = `Plano renomeado ${Date.now().toString(36)} – Ação & "PCPR"`;
    await d.locator('[name="name"]').fill(newName);
    await d.getByRole("button", { name: "Salvar" }).click();
    await expect(d).toHaveCount(0);
    await reload(page);
    await expect(page.getByText(newName)).toBeVisible();
    await signIn(scenario.student);
    await go(page, "/aluno", { hard: true });
    await expect.soft(page.getByText(newName)).toBeVisible();
  });
});

test.describe("F8 · um planejamento ativo por aluno", () => {
  test("F8.3 o banco aceita dois ativos? e a tela do aluno com dois ativos", async ({ page, shot, finding }) => {
    const s = await createScenario();
    const second = await addPausedPlan(s, `Segundo plano ${Date.now().toString(36)}`);
    const tok = await token(s.teacher.email, s.teacher.password);
    const r = await fetch(`${REST}/rest/v1/study_plans?id=eq.${second}`, {
      method: "PATCH",
      headers: { apikey: KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status: "active" }),
    });
    const active = await query<{ n: number }>("select count(*)::int n from study_plans where student_id=$1 and status='active'", [s.student.id]);
    if (active[0]!.n > 1) {
      finding({ severity: "Alto", title: "Banco aceita dois planejamentos ativos para o mesmo aluno", detail: `PATCH status=active respondeu ${r.status}; não existe o índice único parcial que CLAUDE.md e teacher-plans.ts afirmam existir` });
    }
    await authenticate(page.context(), s.student, "http://localhost:3000");
    for (const route of ["/aluno", "/aluno/teoria", "/aluno/estatisticas"]) {
      await go(page, route);
      const h1 = await page.locator("h1").allTextContents();
      if (h1.includes("Algo deu errado")) {
        await shot(page, `F8.3 aluno com dois planejamentos ativos ${route}`);
        finding({ severity: "Alto", title: `Com dois planejamentos ativos, ${route} cai em "Algo deu errado"`, detail: (await page.locator("main").textContent())?.slice(0, 200) ?? "" });
      }
    }
  });

  test("F8.4 ativar em duas abas ao mesmo tempo", async ({ browser, finding }) => {
    const s = await createScenario();
    const p2 = await addPausedPlan(s, `Plano aba A ${Date.now().toString(36)}`);
    const p3 = await addPausedPlan(s, `Plano aba B ${Date.now().toString(36)}`);
    const ctx = await browser.newContext();
    await authenticate(ctx, s.teacher, "http://localhost:3000");
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    await go(a, "/professor/planejamentos");
    await go(b, "/professor/planejamentos");
    await Promise.all([
      a.locator(`[data-testid="plan-row"][data-plan-id="${p2}"]`).locator('[data-testid="plan-activate"]').click(),
      b.locator(`[data-testid="plan-row"][data-plan-id="${p3}"]`).locator('[data-testid="plan-activate"]').click(),
    ]);
    await a.waitForTimeout(2500);
    const active = await query<{ name: string }>("select name from study_plans where student_id=$1 and status='active'", [s.student.id]);
    if (active.length !== 1) finding({ severity: "Alto", title: "Ativar planejamento em duas abas deixa o aluno com " + active.length + " ativos", detail: JSON.stringify(active) });
    await ctx.close();
  });

  test("F8.5 ativar com a rede caindo entre arquivar e ativar", async ({ teacherPage: page, scenario, shot, finding }) => {
    const p2 = await addPausedPlan(scenario, `Plano rede ${Date.now().toString(36)}`);
    await go(page, "/professor/planejamentos");
    let patches = 0;
    await page.route("**/rest/v1/study_plans**", async (route) => {
      if (route.request().method() === "PATCH") {
        patches += 1;
        if (patches === 2) return route.abort("internetdisconnected");
      }
      return route.continue();
    });
    await page.locator(`[data-testid="plan-row"][data-plan-id="${p2}"]`).locator('[data-testid="plan-activate"]').click();
    await page.waitForTimeout(2500);
    await shot(page, "F8.5 ativar plano com rede caindo no meio");
    const active = await query<{ n: number }>("select count(*)::int n from study_plans where student_id=$1 and status='active'", [scenario.student.id]);
    if (active[0]!.n === 0) {
      finding({ severity: "Médio", title: "Falha de rede no meio de 'Ativar' deixa o aluno sem planejamento ativo", detail: "activatePlan arquiva o ativo e depois ativa o novo em duas requisições; a segunda falhou e o anterior ficou arquivado" });
    }
  });
});
