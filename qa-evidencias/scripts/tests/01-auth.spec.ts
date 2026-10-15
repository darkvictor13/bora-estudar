/**
 * Nível Crítico — fluxos 1 (login/logout/guarda), 4 (cadastro), 7 (senha).
 */
import { createUser, expect, go, query, setAccess, settle, test, TEST_PASSWORD } from "../qa.ts";
import { actionLink, waitForEmail } from "/home/victor-almeida/Documentos/Repos/pessoal/bora-estudar/apps/e2e/support/mailpit.ts";

const field = (page: import("@playwright/test").Page, name: string) => page.locator(`#field-${name}`);
const alertBox = (page: import("@playwright/test").Page, status?: string) =>
  page.locator(`[data-testid="alert"]${status ? `[data-status="${status}"]` : ""}`);

async function formLogin(page: import("@playwright/test").Page, email: string, password: string) {
  await go(page, "/entrar", { hard: true });
  await field(page, "email").fill(email);
  await field(page, "password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

const ALL_PROTECTED = [
  "/aluno", "/aluno/planejamento", "/aluno/teoria", "/aluno/disciplinas", "/aluno/leis", "/aluno/flashcards",
  "/aluno/flashcards/estatisticas", "/aluno/resumos-flash", "/aluno/cronograma", "/aluno/cronometro",
  "/aluno/simulados", "/aluno/cadernos", "/aluno/estatisticas", "/aluno/revisoes", "/aluno/conta",
  "/aluno/lista-espera", "/professor", "/professor/turmas", "/professor/simulados", "/professor/planejamentos",
  "/professor/metas", "/professor/teoria", "/professor/cadernos", "/professor/revisoes", "/professor/estatisticas",
  "/professor/conta", "/professor/alunos/00000000-0000-4000-8000-000000000000",
];

test.describe("F1 · guarda de rota", () => {
  test("F1.1 anônimo: toda rota protegida vai para /entrar, sem vazar conteúdo", async ({ page }) => {
    await go(page, "/entrar", { hard: true });
    for (const route of ALL_PROTECTED) {
      await go(page, route);
      await expect.soft(page, `rota ${route}`).toHaveURL(/\/entrar$/);
      await expect.soft(page.locator('[data-testid="sidebar"]'), `sidebar em ${route}`).toHaveCount(0);
    }
  });

  test("F1.2 link profundo: depois do login, a pessoa volta para onde queria ir", async ({ page, scenario, finding, shot }) => {
    await page.goto(`/professor/alunos/${scenario.student.id}`);
    await expect(page).toHaveURL(/\/entrar/);
    await field(page, "email").fill(scenario.teacher.email);
    await field(page, "password").fill(scenario.teacher.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/professor/);
    await settle(page);
    if (!page.url().includes(scenario.student.id)) {
      await shot(page, "F1.2 link profundo perdido apos login");
      finding({ flow: "F1", severity: "Baixo", title: "Login não devolve ao link profundo pedido", detail: `pediu /professor/alunos/${scenario.student.id}, caiu em ${page.url()}` });
    }
  });

  test("F1.3 papel errado volta para a própria casa", async ({ page, scenario, signIn }) => {
    await signIn(scenario.student);
    for (const route of ["/professor", "/professor/metas", `/professor/alunos/${scenario.student.id}`, "/professor/conta"]) {
      await go(page, route);
      await expect.soft(page, `aluno em ${route}`).toHaveURL(/\/aluno$/);
    }
    await signIn(scenario.teacher);
    await go(page, "/professor", { hard: true });
    for (const route of ["/aluno", "/aluno/teoria", "/aluno/conta", "/aluno/lista-espera", "/aluno/cronometro"]) {
      await go(page, route);
      await expect.soft(page, `professor em ${route}`).toHaveURL(/\/professor$/);
    }
  });
});

test.describe("F1 · login", () => {
  test("F1.4 caminho feliz: cada papel cai na própria casa e o nome aparece", async ({ page, scenario }) => {
    await formLogin(page, scenario.student.email, scenario.student.password);
    await expect(page).toHaveURL(/\/aluno$/);
    await expect(page.locator('[data-testid="user-name"]')).toContainText(scenario.student.name);
    await page.locator('[data-testid="sign-out"]').click();
    await expect(page).toHaveURL(/\/entrar$/);
    await formLogin(page, scenario.teacher.email, scenario.teacher.password);
    await expect(page).toHaveURL(/\/professor$/);
  });

  test("F1.5 e-mail com maiúsculas e espaços nas pontas entra", async ({ page, scenario, finding, shot }) => {
    await formLogin(page, `  ${scenario.student.email.toUpperCase()}  `, scenario.student.password);
    await page.waitForTimeout(2500);
    if (!/\/aluno$/.test(page.url())) {
      await shot(page, "F1.5 login com email maiusculo e espacos");
      finding({ severity: "Médio", title: "Login recusa e-mail com maiúsculas/espaços", detail: `URL ${page.url()}; alerta: ${await alertBox(page).allTextContents()}` });
    }
  });

  test("F1.6 senha errada e conta inexistente recebem a mesma frase; e-mail continua no campo", async ({ page, scenario }) => {
    await formLogin(page, scenario.student.email, "errada123");
    const a = await alertBox(page, "error").textContent();
    await expect.soft(field(page, "email")).toHaveValue(scenario.student.email);
    await formLogin(page, "ninguem-aqui@e2e.local", "errada123");
    const b = await alertBox(page, "error").textContent();
    expect.soft(a).toBe(b);
  });

  test("F1.7 campos vazios e só espaços", async ({ page }) => {
    await page.goto("/entrar");
    // O `required` do navegador barra o envio vazio; espaços passam pelo navegador.
    await field(page, "email").fill("   ");
    await field(page, "password").fill("   ");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForTimeout(1000);
    await expect.soft(page).toHaveURL(/\/entrar$/);
  });

  test("F1.8 duplo clique no Entrar não quebra nada", async ({ page, scenario }) => {
    await page.goto("/entrar");
    await field(page, "email").fill(scenario.student.email);
    await field(page, "password").fill(scenario.student.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).dblclick();
    await expect(page).toHaveURL(/\/aluno$/);
    await expect(page.locator('[data-testid="alert"][data-status="error"]')).toHaveCount(0);
  });

  test("F1.9 Supabase fora do ar no login: a tela explica", async ({ page, scenario, shot, finding }) => {
    await page.goto("/entrar");
    await page.route("**/auth/v1/token**", (route) => route.abort("internetdisconnected"));
    await field(page, "email").fill(scenario.student.email);
    await field(page, "password").fill(scenario.student.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForTimeout(2500);
    const text = (await alertBox(page).allTextContents()).join(" | ");
    await shot(page, "F1.9 login sem rede");
    if (!text) finding({ severity: "Alto", title: "Login sem rede não mostra mensagem", detail: "nenhum alerta" });
    else if (/incorret/i.test(text)) finding({ severity: "Médio", title: "Falha de rede no login é reportada como senha incorreta", detail: text });
    // Botão não pode ficar travado em "Entrando…"
    await expect.soft(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  });
});

test.describe("F1 · logout", () => {
  test("F1.10 logout: voltar e recarregar não mostram a área", async ({ page, scenario }) => {
    await formLogin(page, scenario.student.email, scenario.student.password);
    await expect(page).toHaveURL(/\/aluno$/);
    await page.goto("/aluno/conta");
    await page.locator('[data-testid="sign-out"]').click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goBack();
    await page.waitForTimeout(1500);
    await expect.soft(page).toHaveURL(/\/entrar$/);
    await expect.soft(page.getByText(scenario.student.email)).toHaveCount(0);
    await page.reload();
    await expect.soft(page).toHaveURL(/\/entrar$/);
  });

  test("F1.11 logout numa aba encerra a outra na próxima navegação", async ({ page, scenario }) => {
    await formLogin(page, scenario.student.email, scenario.student.password);
    await expect(page).toHaveURL(/\/aluno$/);
    const other = await page.context().newPage();
    await other.goto("/aluno/conta");
    await expect(other.getByRole("heading", { name: "Meus dados" })).toBeVisible();
    await page.locator('[data-testid="sign-out"]').click();
    await expect(page).toHaveURL(/\/entrar$/);
    await other.getByRole("link", { name: "Minha semana" }).click();
    await other.waitForTimeout(2000);
    await expect.soft(other).toHaveURL(/\/entrar$/);
  });
});

test.describe("F1 · redirecionamento aberto no /confirmar", () => {
  for (const next of ["//evil.example/x", "/\\evil.example/x", "/%09/evil.example/x", "https://evil.example/x", "/%5C%5Cevil.example"]) {
    test(`F1.12 next=${next}`, async ({ page, finding, shot }) => {
      const external: string[] = [];
      await page.route((url) => url.hostname.endsWith("evil.example"), async (route) => {
        external.push(route.request().url());
        await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>SITE EXTERNO</h1>" });
      });
      await page.goto(`/confirmar?next=${next}`);
      await page.waitForTimeout(2500);
      if (external.length || new URL(page.url()).hostname.endsWith("evil.example")) {
        await shot(page, `F1.12 open redirect ${next}`);
        finding({ severity: "Alto", title: `Redirecionamento aberto em /confirmar?next=${next}`, detail: `foi parar em ${page.url()}; requisições externas: ${external.join(", ")}` });
      }
      expect.soft(external, `next=${next} levou para fora`).toHaveLength(0);
    });
  }
});

test.describe("F4 · cadastro", () => {
  test.describe.configure({ mode: "serial" });
  const email = `qa-cadastro-${Date.now()}@e2e.local`;

  test("F4.1 caminho feliz: perfil aluno, pending, sem professor, cai na lista de espera", async ({ page, shot }) => {
    await go(page, "/cadastro", { hard: true });
    await field(page, "name").fill("Maria QA Cadastro");
    await field(page, "email").fill(email);
    await field(page, "password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await page.waitForURL(/\/aluno/, { timeout: 15_000 });
    await settle(page);
    await shot(page, "F4.1 depois do cadastro");
    await expect.soft(page).toHaveURL(/\/aluno\/lista-espera$/);
    const rows = await query<{ role: string; access_status: string; teacher_id: string | null }>(
      "select p.role, p.access_status, p.teacher_id from profiles p join auth.users u on u.id = p.id where u.email = $1",
      [email],
    );
    expect(rows).toHaveLength(1);
    expect.soft(rows[0]).toEqual({ role: "student", access_status: "pending", teacher_id: null });
  });

  test("F4.2 mesmo e-mail de novo, e com maiúsculas", async ({ page, shot, finding }) => {
    for (const variant of [email, email.toUpperCase()]) {
      await page.context().clearCookies();
      await go(page, "/cadastro", { hard: true });
      await field(page, "name").fill("Maria QA Repetida");
      await field(page, "email").fill(variant);
      await field(page, "password").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Criar minha conta" }).click();
      await page.waitForTimeout(3000);
      const text = (await alertBox(page).allTextContents()).join(" | ");
      await shot(page, `F4.2 cadastro repetido ${variant === email ? "igual" : "maiusculas"}`);
      if (!/\/cadastro$/.test(page.url())) {
        finding({ severity: "Médio", title: `Cadastro repetido (${variant === email ? "igual" : "maiúsculas"}) sai da tela de cadastro`, detail: `URL ${page.url()} alerta: ${text}` });
      }
      const n = await query<{ n: string }>("select count(*)::text n from auth.users where lower(email) = lower($1)", [email]);
      expect.soft(n[0]!.n, "contas com o mesmo e-mail").toBe("1");
    }
  });

  test("F4.3 validações: nome curto, só espaços, senha curta, e-mail sem domínio", async ({ page }) => {
    const cases: Array<[string, string, string, RegExp]> = [
      ["Al", `qa-v1-${Date.now()}@e2e.local`, TEST_PASSWORD, /nome completo/i],
      ["      ", `qa-v2-${Date.now()}@e2e.local`, TEST_PASSWORD, /nome completo/i],
      ["Nome Valido", `qa-v3-${Date.now()}@e2e.local`, "12345", /6 caracteres/i],
    ];
    for (const [name, mail, pass, msg] of cases) {
      await go(page, "/cadastro", { hard: true });
      await field(page, "name").fill(name);
      await field(page, "email").fill(mail);
      await field(page, "password").fill(pass);
      await page.getByRole("button", { name: "Criar minha conta" }).click();
      await expect.soft(alertBox(page, "error"), `caso ${JSON.stringify(name)}/${pass}`).toContainText(msg);
      await expect.soft(page).toHaveURL(/\/cadastro$/);
    }
  });

  test("F4.4 senha só com espaços (6+) é aceita?", async ({ page, finding }) => {
    const mail = `qa-espacos-${Date.now()}@e2e.local`;
    await go(page, "/cadastro", { hard: true });
    await field(page, "name").fill("Senha Espacos");
    await field(page, "email").fill(mail);
    await field(page, "password").fill("        ");
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await page.waitForTimeout(3000);
    const n = await query<{ n: string }>("select count(*)::text n from auth.users where email = $1", [mail]);
    if (n[0]!.n === "1") finding({ severity: "Baixo", title: "Cadastro aceita senha composta só de espaços", detail: mail });
  });

  test("F4.5 nome longo (>120 sem o maxlength do navegador), emoji e HTML", async ({ page, finding, shot }) => {
    const mail = `qa-longo-${Date.now()}@e2e.local`;
    const long = "Á".repeat(400);
    await go(page, "/cadastro", { hard: true });
    await field(page, "name").evaluate((el) => el.removeAttribute("maxlength"));
    await field(page, "name").fill(long);
    await field(page, "email").fill(mail);
    await field(page, "password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await page.waitForTimeout(3500);
    const rows = await query<{ len: number }>("select length(p.name) len from profiles p join auth.users u on u.id=p.id where u.email=$1", [mail]);
    if (rows[0] && rows[0].len > 120) {
      await shot(page, "F4.5 nome de 400 caracteres aceito");
      finding({ severity: "Baixo", title: "Nome sem limite no servidor (maxlength só no navegador)", detail: `gravou ${rows[0].len} caracteres` });
    }

    const mail2 = `qa-xss-${Date.now()}@e2e.local`;
    await page.context().clearCookies();
    await go(page, "/cadastro", { hard: true });
    const evil = `Zé 🎯 <img src=x onerror="window.__xss=1"> "aspas" & 'apos'`;
    await field(page, "name").fill(evil);
    await field(page, "email").fill(mail2);
    await field(page, "password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await page.waitForURL(/\/aluno/, { timeout: 15_000 });
    await page.goto("/aluno/conta");
    await settle(page);
    await expect.soft(page.locator("#field-name")).toHaveValue(evil);
    await expect.soft(page.locator('[data-testid="user-name"]')).toHaveText(evil);
    expect.soft(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await shot(page, "F4.5 nome com emoji e html");
  });

  test("F4.6 metadado role=teacher na chamada de cadastro não promove", async ({ request }) => {
    const mail = `qa-role-${Date.now()}@e2e.local`;
    const res = await request.post("http://127.0.0.1:54321/auth/v1/signup", {
      headers: { apikey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH", "Content-Type": "application/json" },
      data: { email: mail, password: TEST_PASSWORD, data: { role: "teacher", name: "Hacker QA", access_status: "active" } },
    });
    expect(res.ok()).toBeTruthy();
    const rows = await query<{ role: string; access_status: string }>("select p.role, p.access_status from profiles p join auth.users u on u.id=p.id where u.email=$1", [mail]);
    expect(rows[0]).toEqual({ role: "student", access_status: "pending" });
  });
});

test.describe("F7 · recuperação de senha", () => {
  test.describe.configure({ mode: "serial" });

  test("F7.1 ponta a ponta, reuso do link e idioma do e-mail", async ({ page, baseURL, finding, shot }) => {
    const person = await createUser("student", "Aluna QA Senha", "qa-senha");
    await setAccess(person.id, "active");
    await page.goto("/recuperar-senha");
    await field(page, "email").fill(person.email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(alertBox(page, "success")).toBeVisible();
    const mail = await waitForEmail(person.email);
    if (!/[áéíóúãõç]|senha|redefin/i.test(mail.subject + mail.Text)) {
      finding({ severity: "Baixo", title: "E-mail de recuperação não está em português", detail: mail.subject });
    }
    const link = actionLink(mail, baseURL!);
    await page.goto(link);
    await expect(page).toHaveURL(/\/redefinir-senha/);
    await field(page, "password").fill("NovaQA#2026");
    await field(page, "passwordConfirmation").fill("NovaQA#2026");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/aluno$/);

    // Reusar o mesmo link, já sem sessão.
    await page.locator('[data-testid="sign-out"]').click();
    await page.goto(link);
    await settle(page);
    await shot(page, "F7.1 reuso do link de recuperacao");
    await expect.soft(page.locator("#field-password"), "formulário de senha não pode reaparecer").toHaveCount(0);
  });

  test("F7.2 e-mail inválido e vazio na recuperação", async ({ page, shot }) => {
    await page.goto("/recuperar-senha");
    await field(page, "email").fill("   ");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await page.waitForTimeout(1500);
    await shot(page, "F7.2 recuperacao com email so espacos");
    await expect.soft(alertBox(page, "success"), "espaços não podem receber 'se houver uma conta'").toHaveCount(0);
  });

  test("F7.3 vários pedidos seguidos: limite do GoTrue chega como frase legível", async ({ page, finding, shot }) => {
    const person = await createUser("student", "Aluna QA Pressa", "qa-pressa");
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.goto("/recuperar-senha");
      await field(page, "email").fill(person.email);
      await page.getByRole("button", { name: "Enviar link" }).click();
      await page.waitForTimeout(1200);
      seen.push((await alertBox(page).allTextContents()).join(" | "));
    }
    await shot(page, "F7.3 terceiro pedido de recuperacao");
    const english = seen.find((s) => /[a-z]{4,} (seconds|request|rate|only)/i.test(s));
    if (english) finding({ severity: "Baixo", title: "Limite de envio de recuperação chega em inglês", detail: seen.join(" || ") });
  });
});
