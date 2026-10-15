/** Evidências dos achados confirmados à mão. */
import { randomUUID } from "node:crypto";

import { authenticate, createScenario, go, query, test } from "../qa.ts";

const SEED_STUDENT = { id: "", email: "aluno@local.dev", password: "SenhaLocal#2026", name: "" };
const SEED_TEACHER = { id: "", email: "professor@local.dev", password: "SenhaLocal#2026", name: "" };

test("EV1 aluno vinculado vê 'Ainda sem professor'; professor vê copy de aluno", async ({ page, signIn, shot }) => {
  await signIn(SEED_STUDENT);
  await go(page, "/aluno/conta", { hard: true });
  await shot(page, "EV1 aluno do seed vinculado ve ainda sem professor");
  await signIn(SEED_TEACHER);
  await go(page, "/professor/conta", { hard: true });
  await shot(page, "EV1 meus dados do professor com textos de aluno");
});

test("EV2 dois planejamentos ativos: tela do professor e do aluno", async ({ page, shot }) => {
  const s = await createScenario();
  const second = randomUUID();
  await query(
    `insert into study_plans (id, teacher_id, student_id, name, area, stage, study_model, weekly_goals, starts_on, status)
     values ($1,$2,$3,'Segundo plano ATIVO','Policial','Pré-edital','Avanço progressivo',12,current_date,'paused')`,
    [second, s.teacher.id, s.student.id],
  );
  // O estado que a corrida de duas abas produz (F8.4), montado pela API com o token do professor.
  const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  const tok = ((await (await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: s.teacher.email, password: s.teacher.password }) })).json()) as { access_token: string }).access_token;
  const r = await fetch(`http://127.0.0.1:54321/rest/v1/study_plans?id=eq.${second}`, { method: "PATCH", headers: { apikey: KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }) });
  console.log("PATCH:", r.status);
  await authenticate(page.context(), s.teacher, "http://localhost:3000");
  await go(page, "/professor/planejamentos", { hard: true });
  const rows = page.locator('[data-testid="plan-row"]');
  await rows.last().scrollIntoViewIfNeeded();
  console.log("CARTÕES:", (await rows.allTextContents()).map((t) => t.slice(0, 70)).join(" || "));
  await page.screenshot({ path: "/home/victor-almeida/Documentos/Repos/pessoal/bora-estudar/qa-evidencias/ev2-professor-com-dois-planejamentos-ativos-para-o-mesmo-aluno--desktop.png" });
  await page.context().clearCookies();
  await authenticate(page.context(), s.student, "http://localhost:3000");
  await go(page, "/aluno", { hard: true });
  await shot(page, "EV2 aluno com dois planejamentos ativos");
  console.log("ALUNO VÊ:", (await page.locator("h1 + p, main p").first().textContent())?.slice(0, 80));
});

test("EV3 primeira carga com rede lenta: quanto tempo em branco", async ({ page, signIn, shot }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await signIn(SEED_STUDENT);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  const t0 = Date.now();
  await page.goto("/aluno", { waitUntil: "commit" });
  let firstContent = -1;
  let shotTaken = false;
  for (let i = 0; i < 120; i++) {
    const text = await page.evaluate(() => document.body.innerText.trim().length).catch(() => 0);
    if (!shotTaken && Date.now() - t0 > 2500) { await shot(page, "EV3 primeira carga em rede lenta apos 2-5s"); shotTaken = true; }
    if (text > 0) { firstContent = Date.now() - t0; break; }
    await page.waitForTimeout(250);
  }
  console.log("PRIMEIRO CONTEÚDO VISÍVEL (ms):", firstContent);
});
