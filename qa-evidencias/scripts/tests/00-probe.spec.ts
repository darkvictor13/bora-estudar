import fs from "node:fs";
import path from "node:path";

import { addTheoryCatalog, settle, test } from "../qa.ts";

test.setTimeout(400_000);
const TIMES: string[] = [];

const OUT = path.join(import.meta.dirname, "..", "out");

const STUDENT = [
  "/aluno",
  "/aluno?dia=todos",
  "/aluno/planejamento",
  "/aluno/teoria",
  "/aluno/disciplinas",
  "/aluno/leis",
  "/aluno/flashcards",
  "/aluno/flashcards/estatisticas",
  "/aluno/resumos-flash",
  "/aluno/cronograma",
  "/aluno/cronometro",
  "/aluno/simulados",
  "/aluno/cadernos",
  "/aluno/estatisticas",
  "/aluno/revisoes",
  "/aluno/conta",
  "/aluno/lista-espera",
];

const TEACHER = [
  "/professor",
  "/professor/turmas",
  "/professor/simulados",
  "/professor/planejamentos",
  "/professor/metas",
  "/professor/teoria",
  "/professor/cadernos",
  "/professor/revisoes",
  "/professor/estatisticas",
  "/professor/conta",
];

function name(route: string): string {
  return route.replace(/[/?=]+/g, "_").replace(/^_/, "") || "root";
}

async function probe(page: import("@playwright/test").Page, role: string, route: string, project: string) {
  const t0 = Date.now();
  await page.goto(route);
  await settle(page);
  fs.mkdirSync(OUT, { recursive: true });
  fs.appendFileSync(path.join(OUT, "timings.txt"), `${project}\t${role}\t${route}\t${Date.now() - t0}ms\n`);
  await page.waitForTimeout(500);
  const aria = await page.locator("body").ariaSnapshot().catch((e) => `ERRO: ${e}`);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    h1: document.querySelector("h1")?.textContent ?? null,
    title: document.title,
    url: location.pathname + location.search,
  }));
  fs.mkdirSync(path.join(OUT, "aria", project), { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "aria", project, `${role}-${name(route)}.yml`),
    `# ${route} → ${overflow.url}\n# title: ${overflow.title} | h1: ${overflow.h1} | scroll ${overflow.scrollWidth}/${overflow.clientWidth}\n${aria}`,
  );
  fs.mkdirSync(path.join(OUT, "screens", project), { recursive: true });
  await page.screenshot({ path: path.join(OUT, "screens", project, `${role}-${name(route)}.png`), fullPage: true });
  return overflow;
}

test("PROBE aluno do cenário: todas as rotas", async ({ studentPage, scenario, finding }, testInfo) => {
  await addTheoryCatalog(scenario, { withUnaudited: true });
  for (const route of STUDENT) {
    const o = await probe(studentPage, "aluno", route, testInfo.project.name);
    if (o.scrollWidth > o.clientWidth + 1) {
      finding({ flow: "R-26", severity: "Médio", title: `Estouro horizontal em ${route}`, detail: JSON.stringify(o) });
    }
  }
});

test("PROBE professor do cenário: todas as rotas", async ({ teacherPage, scenario, finding }, testInfo) => {
  await addTheoryCatalog(scenario, { withUnaudited: true });
  for (const route of [...TEACHER, `/professor/alunos/${scenario.student.id}`]) {
    const o = await probe(teacherPage, "prof", route, testInfo.project.name);
    if (o.scrollWidth > o.clientWidth + 1) {
      finding({ flow: "R-26", severity: "Médio", title: `Estouro horizontal em ${route}`, detail: JSON.stringify(o) });
    }
  }
});

test("PROBE seed: aluno e professor do seed", async ({ page, signIn, finding }, testInfo) => {
  const seedStudent = { id: "", email: "aluno@local.dev", password: "SenhaLocal#2026", name: "" };
  const seedTeacher = { id: "", email: "professor@local.dev", password: "SenhaLocal#2026", name: "" };
  await signIn(seedStudent);
  for (const route of STUDENT) {
    const o = await probe(page, "seedaluno", route, testInfo.project.name);
    if (o.scrollWidth > o.clientWidth + 1) {
      finding({ flow: "R-26", severity: "Médio", title: `Estouro horizontal em ${route} (seed)`, detail: JSON.stringify(o) });
    }
  }
  await signIn(seedTeacher);
  for (const route of TEACHER) {
    const o = await probe(page, "seedprof", route, testInfo.project.name);
    if (o.scrollWidth > o.clientWidth + 1) {
      finding({ flow: "R-26", severity: "Médio", title: `Estouro horizontal em ${route} (seed)`, detail: JSON.stringify(o) });
    }
  }
});

test("PROBE anônimo: públicas e 404", async ({ page }, testInfo) => {
  for (const route of ["/", "/entrar", "/cadastro", "/recuperar-senha", "/redefinir-senha", "/confirmar", "/nao-existe", "/aluno/xyz", "/professor/alunos/00000000-0000-0000-0000-000000000000"]) {
    await probe(page, "anon", route, testInfo.project.name);
  }
});
