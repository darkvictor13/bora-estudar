/**
 * Nível Alto — fluxos 10 a 15: teoria, catálogo, turmas, cadernos, revisões, simulados.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { addTheoryCatalog, addTheoryGoal, authenticate, createScenario, expect, go, query, test } from "../qa.ts";

const testId = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`);
const alerts = async (page: Page) => (await page.locator('[data-testid="alert"]').allTextContents()).join(" | ");
const TECH = /TypeError|invalid input|out of range|violates|syntax for type|duplicate key|null value/i;

test.describe("F10 · teoria do aluno", () => {
  test("F10.1 página: negativa, zero, fracionada; questões iniciais inconsistentes", async ({ studentPage: page, scenario, shot, finding }) => {
    const catalog = await addTheoryCatalog(scenario);
    const goalId = await addTheoryGoal(scenario, catalog.subject);
    const lesson = catalog.lessons[0]!;
    await go(page, "/aluno?dia=todos");
    await page.locator(`[data-testid="goal-row"][data-goal-id="${goalId}"]`).locator('[data-testid="goal-theory"]').click();
    await expect(testId(page, "theory-dialog")).toBeVisible();
    for (const value of ["-5", "0", "7.5", "1e1"]) {
      await page.locator("#field-currentPage").fill(value);
      await testId(page, "theory-save-continue").click();
      await page.waitForTimeout(1200);
      const saved = await query<{ current_page: number }>("select current_page from theory_progress where theory_lesson_id=$1", [lesson.id]);
      const msg = await alerts(page);
      const cp = saved[0]?.current_page;
      if (TECH.test(msg)) finding({ severity: "Baixo", title: `Página ${value} na teoria recusada com erro técnico`, detail: msg });
      if (cp !== undefined && (cp < (lesson.theoryStartPage ?? 1) - 1 || cp > (lesson.theoryEndPage ?? 9999))) {
        await shot(page, `F10.1 pagina ${value}`);
        finding({ severity: "Médio", title: `Página ${value} grava fora do intervalo auditado`, detail: `current_page=${cp}, intervalo ${lesson.theoryStartPage}–${lesson.theoryEndPage}` });
      }
    }
  });
});

test.describe("F11 · catálogo de teoria e acessibilidade dos cartões", () => {
  test("F11.1 IDs duplicados e campos sem nome acessível nas telas com cartões repetidos", async ({ page, scenario, signIn, finding }) => {
    await addTheoryCatalog(scenario, { withUnaudited: true });
    await signIn(scenario.teacher);
    for (const route of ["/professor/teoria", "/professor/revisoes", "/professor/cadernos", "/professor/metas", "/professor/planejamentos"]) {
      await go(page, route);
      const report = await page.evaluate(() => {
        const ids = new Map<string, number>();
        for (const el of Array.from(document.querySelectorAll("[id]"))) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
        const dup = [...ids].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
        const unnamed = Array.from(document.querySelectorAll("input:not([type=hidden]), select, textarea"))
          .filter((el) => {
            const labelled = (el as HTMLInputElement).labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
            return !labelled && (el as HTMLElement).offsetParent !== null;
          }).length;
        return { dup, unnamed };
      });
      if (report.dup.length) finding({ severity: "Baixo", title: `IDs duplicados em ${route}`, detail: report.dup.slice(0, 8).join(", ") });
      if (report.unnamed) finding({ severity: "Baixo", title: `${report.unnamed} campo(s) sem rótulo em ${route}`, detail: "input visível sem <label> associado nem aria-label" });
    }
  });

  test("F11.2 regras por disciplina: zero, negativo e enorme", async ({ teacherPage: page, scenario, shot, finding }) => {
    const catalog = await addTheoryCatalog(scenario);
    await go(page, "/professor/teoria", { hard: true });
    await page.waitForTimeout(1000);
    const card = testId(page, "subject-rule-form").first();
    const goal = page.locator("#field-initialQuestions").first();
    for (const v of ["0", "-10", "100000"]) {
      await goal.fill(v);
      await card.getByRole("button", { name: "Salvar regras" }).click();
      await page.waitForTimeout(1500);
      const rule = await query<{ v: number }>("select initial_questions v from theory_catalog_subject_rules where catalog_id=$1 limit 1", [catalog.id]).catch(() => []);
      const msg = await alerts(page);
      if (TECH.test(msg)) finding({ severity: "Baixo", title: `Meta de questões ${v} recusada com erro técnico`, detail: msg });
      if (rule[0] && String(rule[0].v) === v && v !== "100000") {
        await shot(page, `F11.2 meta de questoes ${v}`);
        finding({ severity: "Baixo", title: `Regra aceita meta de questões ${v}`, detail: `gravou ${rule[0].v}` });
      }
    }
  });
});

test.describe("F12 · turmas", () => {
  test("F12.1 criar: nome curto, repetido, enorme; apagar com aluno", async ({ teacherPage: page, scenario, shot, finding }) => {
    await go(page, "/professor/turmas");
    const create = async (name: string) => {
      await page.getByRole("button", { name: "Nova turma" }).click();
      const d = testId(page, "class-dialog");
      await d.locator('[name="name"]').fill(name);
      await d.locator('button[type="submit"]').click();
      await page.waitForTimeout(1500);
      const msg = (await d.locator('[data-testid="alert"]').allTextContents().catch(() => [])).join(" | ");
      const open = await d.count();
      if (open) await d.getByRole("button", { name: "Cancelar" }).click().catch(() => {});
      return { msg, open };
    };
    const short = await create("ab");
    expect.soft(short.open, "nome curto mantém o diálogo").toBeTruthy();
    const name = `Turma QA ${Date.now().toString(36)}`;
    await create(name);
    const dup = await create(name);
    const n = await query<{ n: number }>("select count(*)::int n from classes where teacher_id=$1 and name=$2", [scenario.teacher.id, name]);
    if (n[0]!.n > 1) finding({ severity: "Baixo", title: "Turma com nome repetido é aceita (duas turmas iguais)", detail: `${n[0]!.n} turmas "${name}"` });
    else if (dup.open && !/já existe|repetid|mesmo nome/i.test(dup.msg)) finding({ severity: "Baixo", title: "Turma repetida recusada com frase genérica", detail: dup.msg });
    const big = await create(`T ${"x".repeat(500)}`);
    const bigRow = await query<{ len: number }>("select max(length(name))::int len from classes where teacher_id=$1", [scenario.teacher.id]);
    if (!big.open && bigRow[0]!.len > 200) {
      await shot(page, "F12.1 turma com nome de 500 caracteres");
      finding({ severity: "Baixo", title: "Nome de turma sem limite de tamanho", detail: `${bigRow[0]!.len} caracteres` });
    }
  });
});

test.describe("F13 · cadernos", () => {
  test("F13.1 link javascript:, meta acima de 100% e questões negativas", async ({ page, scenario, signIn, shot, finding }) => {
    await signIn(scenario.teacher);
    await go(page, "/professor/cadernos");
    const row = testId(page, "notebook-row").first();
    await row.getByRole("button", { name: "Editar" }).click();
    const form = testId(page, "notebook-form").first();
    await form.locator('[name="notebookLink"]').fill("javascript:window.__pwn=1;alert(1)");
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);
    const stored = await query<{ notebook_link: string }>("select notebook_link from study_plan_notebooks where study_plan_id=$1 and notebook_link like 'javascript:%'", [scenario.planId]);
    if (stored.length) {
      finding({ severity: "Médio", title: "Link do caderno aceita 'javascript:' (sem validação de URL)", detail: "gravado em study_plan_notebooks.notebook_link" });
      await signIn(scenario.student);
      await go(page, "/aluno/cadernos", { hard: true });
      page.on("dialog", (d) => void d.dismiss());
      const link = page.getByRole("link", { name: "Abrir no TEC" }).first();
      const href = await link.getAttribute("href");
      await link.click({ modifiers: [] }).catch(() => {});
      await page.waitForTimeout(1000);
      const pwned = await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn);
      await shot(page, "F13.1 aluno clica em link javascript do caderno");
      if (pwned) finding({ severity: "Crítico", title: "XSS: link do caderno executa JavaScript no navegador do aluno", detail: `href=${href}` });
      else finding({ severity: "Baixo", title: "Link javascript: do caderno chega ao aluno (React bloqueia a execução)", detail: `href renderizado: ${href}` });
      await signIn(scenario.teacher);
      await go(page, "/professor/cadernos", { hard: true });
    }

    for (const [fieldName, value, label] of [["subjectTarget", "150", "meta 150%"], ["totalQuestions", "-3", "questões negativas"], ["subjectTarget", "-1", "meta negativa"]] as const) {
      await go(page, "/professor/cadernos", { hard: true });
      await testId(page, "notebook-row").first().getByRole("button", { name: "Editar" }).click();
      const f = testId(page, "notebook-form").first();
      const input = f.locator(`[name="${fieldName}"]`);
      if (!(await input.count())) { finding({ severity: "UX", title: `Formulário de caderno não tem o campo ${fieldName}`, detail: "" }); continue; }
      await input.fill(value);
      await f.locator('button[type="submit"]').click();
      await page.waitForTimeout(1500);
      const msg = await alerts(page);
      if (TECH.test(msg) || /check constraint/i.test(msg)) {
        await shot(page, `F13.1 caderno ${label}`);
        finding({ severity: "Baixo", title: `Caderno com ${label} recusado com mensagem técnica`, detail: msg });
      }
      const cancel = f.getByRole("button", { name: "Cancelar" });
      if (await cancel.count()) await cancel.click();
    }
  });
});

test.describe("F14 · revisões", () => {
  test("F14.1 espaçamento zero e negativo", async ({ teacherPage: page, scenario, shot, finding }) => {
    await addTheoryCatalog(scenario);
    await go(page, "/professor/revisoes");
    for (const [n, min] of [["0", "10"], ["-2", "10"], ["2", "-5"]]) {
      const form = testId(page, "spacing-form").first();
      await form.locator('[name="lessonSpacing"]').fill(n);
      await form.locator('[name="minimumQuestions"]').fill(min);
      await form.locator('button[type="submit"]').click();
      await page.waitForTimeout(1500);
      const msg = await alerts(page);
      if (TECH.test(msg) || /check constraint/i.test(msg)) {
        await shot(page, `F14.1 espacamento ${n} minimo ${min}`);
        finding({ severity: "Baixo", title: `Espaçamento ${n}/${min} recusado com mensagem técnica`, detail: msg });
      }
      const rules = await query<{ lesson_spacing: number; minimum_questions: number }>(
        "select r.lesson_spacing, r.minimum_questions from theory_review_rules r join theory_catalog_subject_rules s on s.id = r.subject_rule_id limit 0",
      ).catch(() => []);
      void rules;
      if (!msg) finding({ severity: "Baixo", title: `Espaçamento ${n}/${min}: nenhuma resposta na tela`, detail: "nem sucesso nem erro" });
    }
  });
});

test.describe("F15 · simulados", () => {
  test("F15.1 nota acima do máximo, negativa, com 3 casas; editar depois de publicar", async ({ teacherPage: page, scenario, shot, finding }) => {
    const classId = randomUUID();
    await query("insert into classes (id, teacher_id, name) values ($1,$2,$3)", [classId, scenario.teacher.id, `Turma Sim ${classId.slice(0, 5)}`]);
    await query("insert into class_students (class_id, student_id, teacher_id) values ($1,$2,$3)", [classId, scenario.student.id, scenario.teacher.id]);
    await go(page, "/professor/simulados");
    await page.getByRole("button", { name: "Novo simulado" }).click();
    await page.locator('[name="title"]').fill("Simulado QA 🧪");
    await page.getByRole("combobox", { name: "Turma" }).click();
    await page.getByRole("option").first().click();
    await page.locator('[name="maxScore"]').fill("100");
    await page.getByRole("button", { name: /Cadastrar simulado/ }).click();
    await page.waitForTimeout(2000);
    const exam = await query<{ id: string }>("select id from mock_exams where teacher_id=$1", [scenario.teacher.id]);
    expect(exam).toHaveLength(1);
    await go(page, `/professor/simulados?simulado=${exam[0]!.id}`);
    const scoreInput = page.getByLabel(/^Nota de /).first();
    for (const v of ["150", "-1", "7.555"]) {
      await scoreInput.fill(v);
      await page.getByRole("button", { name: "Salvar nota" }).first().click();
      await page.waitForTimeout(1200);
      const saved = await query<{ score: string }>("select score::text from mock_exam_results where exam_id=$1", [exam[0]!.id]);
      const msg = await alerts(page);
      if (saved[0] && Number(saved[0].score) === Number(v)) finding({ severity: "Médio", title: `Simulado aceita nota ${v} (máx. 100)`, detail: msg });
      if (TECH.test(msg)) finding({ severity: "Baixo", title: `Nota ${v} recusada com erro técnico`, detail: msg });
    }
    await shot(page, "F15.1 notas invalidas no simulado");
  });
});
