/**
 * Nível Crítico — fluxos 2 (isolamento) e 3 (aluno sem acesso vigente).
 */
import { randomUUID } from "node:crypto";

import { addTheoryCatalog, createScenario, expect, go, query, setAccess, settle, test, type Scenario } from "../qa.ts";

const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const REST = "http://127.0.0.1:54321";

async function token(email: string, password: string): Promise<string> {
  const res = await fetch(`${REST}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

async function rest(tok: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${REST}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

interface World {
  a: Scenario;
  b: Scenario;
  classA: string;
  mockA: string;
  deckA: string;
  catalogA: string;
  lessonA: string;
}

async function world(): Promise<World> {
  const a = await createScenario();
  const b = await createScenario();
  const catalog = await addTheoryCatalog(a);
  const classA = randomUUID();
  await query("insert into classes (id, teacher_id, name) values ($1, $2, $3)", [classA, a.teacher.id, `Turma QA ${classA.slice(0, 6)}`]);
  await query("insert into class_students (class_id, student_id, teacher_id) values ($1, $2, $3)", [classA, a.student.id, a.teacher.id]);
  const mockA = randomUUID();
  await query("insert into mock_exams (id, teacher_id, class_id, title, exam_date, max_score, published) values ($1,$2,$3,$4,current_date,100,false)", [mockA, a.teacher.id, classA, `Simulado secreto ${mockA.slice(0, 6)}`]);
  await query("insert into mock_exam_results (exam_id, student_id, teacher_id, score) values ($1,$2,$3,77)", [mockA, a.student.id, a.teacher.id]);
  await query("update mock_exams set published = true where id = $1", [mockA]);
  const deckA = randomUUID();
  await query("insert into personal_flashcard_decks (id, student_id, subject, title) values ($1,$2,'Direito Penal',$3)", [deckA, a.student.id, `Deck secreto ${deckA.slice(0, 6)}`]);
  await query("insert into personal_flashcards (id, deck_id, student_id, front, back) values ($1,$2,$3,'FRENTE-SECRETA-A','VERSO-SECRETO-A')", [randomUUID(), deckA, a.student.id]);
  return { a, b, classA, mockA, deckA, catalogA: catalog.id, lessonA: catalog.lessons[0]!.id };
}

test.describe("F2 · isolamento pela interface", () => {
  test("F2.1 aluno B não alcança nada do aluno A pela URL", async ({ page, signIn, shot }) => {
    const w = await world();
    await signIn(w.b.student);
    const probes = [
      `/aluno?plano=${w.a.planId}`,
      `/aluno?semana=1&plano=${w.a.planId}`,
      `/aluno/flashcards?meuDeck=${w.deckA}`,
      `/aluno/flashcards?aula=${w.lessonA}`,
      `/aluno/resumos-flash?aula=${w.lessonA}`,
      `/aluno/simulados?simulado=${w.mockA}`,
    ];
    for (const route of probes) {
      await go(page, route);
      const html = await page.content();
      for (const secret of ["FRENTE-SECRETA-A", "VERSO-SECRETO-A", `Deck secreto ${w.deckA.slice(0, 6)}`, `Simulado secreto ${w.mockA.slice(0, 6)}`, w.a.student.name, w.a.planName, w.a.goals[0]!.title]) {
        if (html.includes(secret)) await shot(page, `F2.1 vazamento ${route}`);
        expect.soft(html.includes(secret), `"${secret}" em ${route}`).toBe(false);
      }
    }
  });

  test("F2.2 professor B não alcança aluno, plano, catálogo, turma nem simulado de A", async ({ page, signIn, shot }) => {
    const w = await world();
    await signIn(w.b.teacher);
    const probes = [
      `/professor/alunos/${w.a.student.id}`,
      `/professor?turma=${w.classA}`,
      `/professor/cadernos?plano=${w.a.planId}`,
      `/professor/revisoes?plano=${w.a.planId}`,
      `/professor/metas?plano=${w.a.planId}`,
      `/professor/teoria?catalogo=${w.catalogA}`,
      `/professor/estatisticas?plano=${w.a.planId}&turma=${w.classA}`,
      `/professor/simulados?simulado=${w.mockA}`,
      `/professor/planejamentos?aluno=${w.a.student.id}`,
    ];
    for (const route of probes) {
      await go(page, route);
      const html = await page.content();
      for (const secret of [w.a.student.name, w.a.planName, w.a.student.email, `Simulado secreto ${w.mockA.slice(0, 6)}`, `Turma QA ${w.classA.slice(0, 6)}`, w.a.goals[0]!.title]) {
        if (html.includes(secret)) await shot(page, `F2.2 vazamento ${route}`);
        expect.soft(html.includes(secret), `"${secret}" em ${route}`).toBe(false);
      }
    }
  });
});

test.describe("F2 · isolamento pela API, sem tela", () => {
  test("F2.3 aluno B lendo e escrevendo dados de A", async () => {
    const w = await world();
    const tok = await token(w.b.student.email, w.b.student.password);
    for (const path of [
      `goals?study_plan_id=eq.${w.a.planId}`,
      `study_plans?id=eq.${w.a.planId}`,
      `profiles?id=eq.${w.a.student.id}`,
      `personal_flashcards?deck_id=eq.${w.deckA}`,
      `personal_flashcard_decks?id=eq.${w.deckA}`,
      `mock_exams?id=eq.${w.mockA}`,
      `mock_exam_results?exam_id=eq.${w.mockA}`,
      `classes?id=eq.${w.classA}`,
      `class_students?class_id=eq.${w.classA}`,
      `waitlist?select=*`,
      `access_grants?select=*`,
    ]) {
      const r = await rest(tok, path);
      expect.soft(r.body, `GET ${path}`).toBe("[]");
    }
    const goal = w.a.goals[0]!.id;
    const upd = await rest(tok, `goals?id=eq.${goal}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
    expect.soft(upd.body, "PATCH meta de A").toBe("[]");
    const ins = await rest(tok, "goal_entries", { method: "POST", body: JSON.stringify({ goal_id: goal, student_id: w.a.student.id, teacher_id: w.a.teacher.id, minutes: 30 }) });
    expect.soft([401, 403, 400, 409].includes(ins.status), `POST goal_entries em A: ${ins.status} ${ins.body}`).toBe(true);
    const del = await rest(tok, `personal_flashcard_decks?id=eq.${w.deckA}`, { method: "DELETE" });
    expect.soft(del.body, "DELETE deck de A").toBe("[]");
  });

  test("F2.4 professor B: ler A, assumir A já vinculado, liberar acesso de A", async () => {
    const w = await world();
    const tok = await token(w.b.teacher.email, w.b.teacher.password);
    const read = await rest(tok, `profiles?id=eq.${w.a.student.id}`);
    expect.soft(read.body).toBe("[]");
    const link = await rest(tok, "rpc/link_student", { method: "POST", body: JSON.stringify({ p_student_id: w.a.student.id }) });
    const after = await query<{ teacher_id: string }>("select teacher_id from profiles where id=$1", [w.a.student.id]);
    expect.soft(after[0]!.teacher_id, `link_student respondeu ${link.status} ${link.body}`).toBe(w.a.teacher.id);
    const grant = await rest(tok, "rpc/set_student_access", { method: "POST", body: JSON.stringify({ p_student_id: w.a.student.id, p_action: "suspend", p_months: null, p_request_id: randomUUID() }) });
    const st = await query<{ access_status: string }>("select access_status from profiles where id=$1", [w.a.student.id]);
    expect.soft(st[0]!.access_status, `set_student_access respondeu ${grant.status} ${grant.body}`).toBe("active");
    const found = await rest(tok, "rpc/find_student_by_email", { method: "POST", body: JSON.stringify({ p_email: w.a.student.email }) });
    expect.soft(found.body.includes(w.a.student.name), `find_student_by_email de aluno alheio devolveu ${found.body}`).toBe(false);
  });
});

test.describe("F3 · aluno sem acesso vigente", () => {
  const STUDY = ["/aluno", "/aluno/planejamento", "/aluno/teoria", "/aluno/disciplinas", "/aluno/leis", "/aluno/flashcards", "/aluno/flashcards/estatisticas", "/aluno/resumos-flash", "/aluno/cronometro", "/aluno/simulados", "/aluno/cadernos", "/aluno/estatisticas", "/aluno/revisoes"];

  for (const status of ["pending", "suspended", "expired", "active-vencido"] as const) {
    test(`F3.1 ${status}: telas de estudo mandam para a lista de espera`, async ({ page, signIn, shot, monitor }) => {
      const s = await createScenario({ access: status === "active-vencido" ? "active" : status });
      if (status === "active-vencido") {
        await query("update profiles set access_status='active', access_expires_at=current_date - 1 where id=$1", [s.student.id]);
      }
      await signIn(s.student);
      for (const route of STUDY) {
        await go(page, route);
        await page.waitForURL(/\/aluno\/lista-espera$/, { timeout: 4000 }).catch(() => {});
        if (!/\/aluno\/lista-espera$/.test(page.url())) {
          const h1 = await page.locator("h1").allTextContents();
          const alerts = await page.locator('[data-testid="alert"], [role="alert"]').allTextContents();
          const err = monitor.filter((e) => e.kind !== "console-warning").slice(-3).map((e) => e.text.slice(0, 120));
          await shot(page, `F3.1 ${status} ficou em ${route}`);
          expect.soft(false, `${status} em ${route}: h1=${JSON.stringify(h1)} alertas=${JSON.stringify(alerts)} ultimos=${JSON.stringify(err)}`).toBe(true);
        }
      }
      await page.goto("/aluno/conta");
      await expect.soft(page.getByRole("heading", { name: "Meus dados" })).toBeVisible();
      await shot(page, `F3.1 conta com acesso ${status}`);
    });
  }

  test("F3.2 acesso vencido no meio da sessão: escrever na semana é recusado com frase clara", async ({ page, signIn, shot }) => {
    const s = await createScenario();
    await signIn(s.student);
    await go(page, "/aluno?dia=todos");
    // O professor bloqueia enquanto a tela está aberta.
    await setAccess(s.student.id, "suspended");
    const extra = s.goals.find((g) => g.type === "extra")!;
    const row = page.locator(`[data-testid="goal-row"][data-goal-id="${extra.id}"]`);
    await row.getByRole("button", { name: /^Concluir/ }).click();
    await page.waitForTimeout(2000);
    await shot(page, "F3.2 concluir meta com acesso suspenso");
    const status = await query<{ status: string }>("select status from goals where id=$1", [extra.id]);
    expect.soft(status[0]!.status, "meta não pode concluir com acesso suspenso").not.toBe("completed");
    const alerts = await page.locator('[data-testid="alert"]').allTextContents();
    expect.soft(alerts.join(" "), "tela precisa explicar").toMatch(/acesso|liberad|venc|suspens/i);
  });
});
