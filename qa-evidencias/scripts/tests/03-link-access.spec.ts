/**
 * Nível Crítico — fluxo 5: achar, assumir, liberar, bloquear.
 */
import { createScenario, createUser, expect, go, query, test } from "../qa.ts";
import { reload } from "../qa.ts";

const field = (page: import("@playwright/test").Page, name: string) => page.locator(`#field-${name}`);

async function search(page: import("@playwright/test").Page, email: string) {
  await field(page, "email").fill(email);
  await page.locator('[data-testid="find-student-submit"]').click();
  await page.waitForTimeout(1200);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

test.describe("F5 · achar e assumir", () => {
  test("F5.1 e-mail com maiúsculas/espaços acha; e-mail de professor não acha ninguém", async ({ page, signIn, shot, finding }) => {
    const teacher = await createUser("teacher", "Professora QA Busca", "qa-prof");
    const other = await createUser("teacher", "Professor QA Outro", "qa-prof2");
    const student = await createUser("student", "Aluno QA Sem Professor", "qa-livre");
    await signIn(teacher);
    await go(page, "/professor");

    await search(page, `  ${student.email.toUpperCase()}  `);
    await shot(page, "F5.1 busca com maiusculas e espacos");
    await expect.soft(page.locator('[data-testid="student-search-result"]')).toHaveAttribute("data-student-id", student.id);

    for (const [label, email] of [["outro professor", other.email], ["o próprio professor", teacher.email]] as const) {
      await search(page, email);
      const result = page.locator('[data-testid="student-search-result"]');
      if (await result.count()) {
        await shot(page, `F5.1 busca pelo email de ${label}`);
        finding({ severity: "Médio", title: `Busca de aluno devolve ${label}`, detail: `${email} → ${await result.textContent()}` });
      }
    }

    for (const bad of ["qa-livre", "@e2e.local", "a@b", "   "]) {
      await search(page, bad);
      await expect.soft(page.locator('[data-testid="student-search-result"]'), `busca "${bad}"`).toHaveCount(0);
    }
  });

  test("F5.2 assumir com duplo clique e com rede caindo uma vez", async ({ page, signIn, shot }) => {
    const teacher = await createUser("teacher", "Professora QA Duplo", "qa-prof");
    const student = await createUser("student", "Aluno QA Duplo", "qa-duplo");
    await signIn(teacher);
    await go(page, "/professor");
    await search(page, student.email);
    let failed = false;
    await page.route("**/rest/v1/rpc/link_student", async (route) => {
      if (!failed) {
        failed = true;
        return route.abort("internetdisconnected");
      }
      return route.continue();
    });
    await page.locator('[data-testid="link-student"]').click();
    await page.waitForTimeout(1200);
    await shot(page, "F5.2 assumir sem rede");
    const alertText = (await page.locator('[data-testid="alert"]').allTextContents()).join(" | ");
    expect.soft(alertText, "falha de rede precisa aparecer").toMatch(/conex|rede/i);
    await page.locator('[data-testid="link-student"]').dblclick();
    await page.waitForTimeout(2000);
    const row = await query<{ teacher_id: string }>("select teacher_id from profiles where id=$1", [student.id]);
    expect(row[0]!.teacher_id).toBe(teacher.id);
    await expect.soft(page.locator(`[data-testid="student-card"][data-student-id="${student.id}"]`)).toHaveCount(1);
  });
});

test.describe("F5 · liberar e bloquear", () => {
  test("F5.3 duplo clique em Liberar grava UMA liberação; falha de rede + nova tentativa também", async ({ page, signIn, shot, finding }) => {
    const s = await createScenario({ access: "pending" });
    await signIn(s.teacher);
    await go(page, `/professor/alunos/${s.student.id}`);
    await page.locator('[data-testid="grant-access"]').dblclick();
    await page.waitForTimeout(2500);
    const grants = await query<{ n: number }>("select count(*)::int n from access_grants where student_id=$1", [s.student.id]);
    expect.soft(grants[0]!.n, "duplo clique").toBe(1);
    const p1 = await query<{ access_status: string; access_expires_at: string }>("select access_status, (access_expires_at at time zone 'America/Sao_Paulo')::date::text access_expires_at from profiles where id=$1", [s.student.id]);
    const today = (await query<{ d: string }>("select current_date::text d"))[0]!.d;
    expect.soft(p1[0]).toEqual({ access_status: "active", access_expires_at: addMonths(today, 3) });

    const text = await page.locator('[data-testid="access-form"]').textContent();
    if (/\d{4}-\d{2}-\d{2}/.test(text ?? "")) {
      await shot(page, "F5.3 vigencia em formato ISO");
      finding({ severity: "Baixo", title: "Vigência do acesso aparece em ISO (2027-01-06) em vez de dd/mm/aaaa", detail: text ?? "" });
    }

    let failed = false;
    await page.route("**/rest/v1/rpc/set_student_access", async (route) => {
      if (!failed) {
        failed = true;
        // O servidor GRAVA, mas a resposta se perde: o pior caso para retentativa.
        const response = await route.fetch();
        void response;
        return route.abort("internetdisconnected");
      }
      return route.continue();
    });
    await page.locator('[data-testid="grant-access"]').click();
    await page.waitForTimeout(2000);
    await shot(page, "F5.3 liberar com resposta perdida");
    await page.locator('[data-testid="grant-access"]').click();
    await page.waitForTimeout(2500);
    const grants2 = await query<{ n: number }>("select count(*)::int n from access_grants where student_id=$1", [s.student.id]);
    expect.soft(grants2[0]!.n, "resposta perdida + nova tentativa = uma liberação a mais, não duas").toBe(2);
    const p2 = await query<{ access_expires_at: string }>("select (access_expires_at at time zone 'America/Sao_Paulo')::date::text access_expires_at from profiles where id=$1", [s.student.id]);
    expect.soft(p2[0]!.access_expires_at, "soma de 3 + 3 meses").toBe(addMonths(today, 6));
  });

  test("F5.4 liberar quem venceu em 2020 conta a partir de hoje", async ({ page, signIn }) => {
    const s = await createScenario({ access: "expired" });
    await query("update profiles set access_expires_at='2020-06-01' where id=$1", [s.student.id]);
    await signIn(s.teacher);
    await go(page, `/professor/alunos/${s.student.id}`);
    await page.getByRole("combobox", { name: /Vigência/ }).click();
    await page.getByRole("option", { name: "1 mês" }).click();
    await page.locator('[data-testid="grant-access"]').click();
    await page.waitForTimeout(2500);
    const today = (await query<{ d: string }>("select current_date::text d"))[0]!.d;
    const p = await query<{ access_status: string; access_expires_at: string }>("select access_status, (access_expires_at at time zone 'America/Sao_Paulo')::date::text access_expires_at from profiles where id=$1", [s.student.id]);
    expect.soft(p[0]).toEqual({ access_status: "active", access_expires_at: addMonths(today, 1) });
  });

  test("F5.5 aluno com a aba aberta: liberação e bloqueio refletem na barra lateral sem recarregar", async ({ browser, shot, finding }) => {
    const s = await createScenario({ access: "pending" });
    const { authenticate } = await import("../qa.ts");
    const studentCtx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const teacherCtx = await browser.newContext();
    await authenticate(studentCtx, s.student, "http://localhost:3000");
    await authenticate(teacherCtx, s.teacher, "http://localhost:3000");
    const sp = await studentCtx.newPage();
    const tp = await teacherCtx.newPage();
    await go(sp, "/aluno/conta");
    const studyLink = () => sp.locator('[data-testid="sidebar"]').getByRole("link", { name: "Minha semana" });
    await expect(studyLink()).toHaveCount(0);

    await go(tp, `/professor/alunos/${s.student.id}`);
    await tp.locator('[data-testid="grant-access"]').click();
    await expect(tp.locator('[data-testid="alert"][data-status="success"]')).toBeVisible();

    // O aluno navega pela própria barra, sem F5.
    await sp.locator('[data-testid="sidebar"]').getByRole("link", { name: "Lista de espera" }).click();
    await sp.waitForTimeout(1500);
    await sp.locator('[data-testid="sidebar"]').getByRole("link", { name: "Meus dados" }).click();
    await sp.waitForTimeout(1500);
    if ((await studyLink().count()) === 0) {
      await shot(sp, "F5.5 liberado mas barra lateral continua travada");
      finding({ severity: "Médio", title: "Aluno liberado continua com a barra lateral travada até recarregar a página", detail: "Itens de estudo seguem inertes após a liberação; o loader do layout (hasAccess) não revalida na navegação." });
    }
    await reload(sp);
    await expect(studyLink(), "depois do F5 a barra abre").toHaveCount(1);

    await tp.locator('[data-testid="revoke-access"]').click();
    await expect(tp.locator('[data-testid="alert"][data-status="success"]')).toContainText("bloqueado");
    await expect.soft(tp.locator('[data-testid="revoke-access"]'), "botão bloquear some").toHaveCount(0);

    await studyLink().click();
    await sp.waitForTimeout(2000);
    await expect.soft(sp, "bloqueado sai na próxima navegação").toHaveURL(/lista-espera/);
    await studentCtx.close();
    await teacherCtx.close();
  });
});
