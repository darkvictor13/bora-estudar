/**
 * §1 do `docs/fluxos-e2e.md` — autenticação e roteamento.
 *
 * É o único arquivo que faz login pelo formulário. Todos os outros injetam a
 * sessão (ver `fixtures/session.ts`): provar que o formulário funciona é
 * trabalho de um teste, não de sessenta.
 *
 * CONVERTIDO PARA `data-testid` NA FASE 2, que é quando estas telas foram
 * reescritas em MUI. Nenhum seletor aqui casa classe CSS: `.alert--error` virou
 * `alert(page, "error")`, e `.sidebar__foot button[type=submit]` virou
 * `signOut(page)`.
 */
import { expect, test } from "../fixtures/index.ts";
import { createUser, deleteUser, setAccess } from "../fixtures/scenario.ts";
import { count, maybeOne } from "../fixtures/db.ts";
import { actionLink, clearMailbox, waitForEmail } from "../support/mailpit.ts";
import { PROTECTED_ROUTES, STUDENT_ROUTES, TEACHER_ROUTES } from "../support/routes.ts";
import { alert, field, signOut } from "../support/ui.ts";

/**
 * Cenário SEM planejamento.
 *
 * A autenticação não precisa de um: o que ela exige é um par professor/aluno
 * com perfil, e é só isso que este arquivo usa. Montar planejamento, blocos e
 * metas depende de `apply_study_plan_batch` e das colunas de `study_plans`, que
 * o schema de 14/09 reescreveu — trabalho da Fase 3, junto com as telas que os
 * consomem. Pedir o que não se usa acoplaria a rede de segurança da Fase 2 a
 * uma fixture de outra fase.
 */
test.use({ scenarioOptions: { withPlan: false } });

/** Faz login pela tela, como uma pessoa faria. */
async function signInThroughForm(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/entrar");
  await field(page, "email").fill(email);
  await field(page, "password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test.describe("F-AUTH-01 · anônimo é mandado para o login", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redireciona para /entrar`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/entrar$/);
    });
  }

  test("a ficha do aluno também é protegida", async ({ page, scenario }) => {
    await page.goto(`/professor/alunos/${scenario.student.id}`);
    await expect(page).toHaveURL(/\/entrar$/);
  });
});

test.describe("F-AUTH-02/03 · credencial recusada", () => {
  test("senha errada não revela se a conta existe", async ({ page, scenario }) => {
    await signInThroughForm(page, scenario.student.email, "senha-errada");

    await expect(page).toHaveURL(/\/entrar$/);
    await expect(alert(page, "error")).toHaveText("E-mail ou senha incorretos.");
  });

  test("e-mail inexistente dá a mesma mensagem que senha errada", async ({ page }) => {
    await signInThroughForm(page, "ninguem-aqui@e2e.local", "qualquer-coisa");

    await expect(alert(page, "error")).toHaveText("E-mail ou senha incorretos.");
  });

  test("campos vazios são validados pela action, não pelo navegador", async ({ page }) => {
    // O <form> tem noValidate: se o navegador estivesse validando, o submit
    // nem sairia e a mensagem abaixo nunca apareceria.
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(alert(page, "error")).toHaveText("Informe e-mail e senha.");
  });

  test("o e-mail digitado sobrevive ao erro", async ({ page, scenario }) => {
    // BUG-11: o React 19 reseta o <form action> quando a action termina, e a
    // pessoa redigitava e-mail e senha a cada tentativa.
    await signInThroughForm(page, scenario.student.email, "senha-errada");

    await expect(alert(page, "error")).toBeVisible();
    await expect(field(page, "email")).toHaveValue(scenario.student.email);
    await expect(field(page, "password")).toHaveValue("");
  });
});

test.describe("F-AUTH-04 · login leva cada papel para a própria casa", () => {
  test("aluno vai para /aluno", async ({ page, scenario }) => {
    await signInThroughForm(page, scenario.student.email, scenario.student.password);
    await expect(page).toHaveURL(/\/aluno$/);
    await expect(page.locator("h1")).toHaveText("Metas da semana");
  });

  test("professor vai para /professor", async ({ page, scenario }) => {
    await signInThroughForm(page, scenario.teacher.email, scenario.teacher.password);
    await expect(page).toHaveURL(/\/professor$/);
    await expect(page.locator("h1")).toHaveText("Meus alunos");
  });

  /*
   * O TESTE DO ADMIN SAIU, E A AUSÊNCIA É A NOTÍCIA.
   *
   * `user_role` no schema de 14/09 é `('teacher','student')`: `admin` deixou de
   * existir. O BUG-01 — admin caindo em loop entre `/professor` e a própria
   * home — não tem mais como acontecer porque não há mais o papel, e o
   * tratamento especial saiu de `homeForRole` junto. Se `admin` voltar, este
   * teste volta com ele.
   */
});

test.describe("F-AUTH-05 · papel errado é devolvido para a própria casa", () => {
  for (const route of TEACHER_ROUTES) {
    test(`aluno em ${route} volta para /aluno`, async ({ studentPage }) => {
      await studentPage.goto(route);
      await expect(studentPage).toHaveURL(/\/aluno$/);
    });
  }

  for (const route of STUDENT_ROUTES) {
    test(`professor em ${route} volta para /professor`, async ({ teacherPage }) => {
      await teacherPage.goto(route);
      await expect(teacherPage).toHaveURL(/\/professor$/);
    });
  }
});

test.describe("F-AUTH-06 · tela pública com sessão ativa", () => {
  for (const route of ["/entrar", "/cadastro"] as const) {
    test(`${route} manda o aluno autenticado para /aluno`, async ({ studentPage }) => {
      await studentPage.goto(route);
      await expect(studentPage).toHaveURL(/\/aluno$/);
    });
  }

  test("/ manda para a home do papel", async ({ studentPage }) => {
    await studentPage.goto("/");
    await expect(studentPage).toHaveURL(/\/aluno$/);
  });

  test("/ sem sessão manda para o login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar$/);
  });
});

test("F-AUTH-07 · logout apaga o cookie e a área volta a barrar", async ({ studentPage }) => {
  await studentPage.goto("/aluno");
  await expect(studentPage.locator("h1")).toHaveText("Metas da semana");

  await signOut(studentPage).click();
  await expect(studentPage).toHaveURL(/\/entrar$/);

  const cookies = await studentPage.context().cookies();
  expect(cookies.filter((cookie) => /^sb-.*-auth-token/.test(cookie.name))).toHaveLength(0);

  await studentPage.goto("/aluno");
  await expect(studentPage).toHaveURL(/\/entrar$/);
});

test.describe("F-AUTH-08/09 · cadastro público", () => {
  /*
   * NÃO EXISTE GATILHO DE CRIAÇÃO DE PERFIL no schema de 14/09/2026.
   *
   * `bora_criar_perfil_novo_aluno()` rodava em `auth.users` e criava a linha em
   * `profiles`. Ele não foi portado, e `docs/de-para-schema.md` o lista como o
   * primeiro item a resolver — com a decisão de produto que falta: a qual
   * professor um aluno sem metadado é anexado.
   *
   * Sem ele o cadastro cria o usuário no GoTrue e para aí: `loadSession`
   * devolve `null`, e quem acabou de se cadastrar volta para a tela de entrar.
   * O `fixme` é o lugar onde essa falta continua visível — as outras fixtures
   * inserem o perfil à mão para não derrubar a suíte inteira, e isso esconderia
   * a pendência se este teste não a apontasse.
   */
  test.fixme("cria o perfil e cai na lista de espera", async ({ page }) => {
    const email = `cadastro-${Date.now().toString(36)}@e2e.local`;

    await page.goto("/cadastro");
    await field(page, "name").fill("Candidata Recém-Cadastrada");
    await field(page, "email").fill(email);
    await field(page, "password").fill("SenhaE2E#2026");
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(page).toHaveURL(/\/aluno\/lista-espera$/);
    await expect(alert(page, "warning")).toContainText("Seu acesso ainda não foi liberado");

    const profile = await maybeOne<{ role: string; name: string }>(
      `select p.role::text, p.name from public.profiles p
         join auth.users u on u.id = p.id where u.email = $1`,
      [email],
    );
    expect(profile).toMatchObject({ role: "student", name: "Candidata Recém-Cadastrada" });

    // GAP-01: o cadastro público não vincula nem libera. Enquanto não houver
    // tela para isso, é o comportamento correto — e é o que este teste fixa.
    // O vínculo é `profiles.teacher_id` e o acesso é `profiles.access_status`,
    // desde que `student_teacher_links` e `subscriptions` saíram do schema.
    expect(
      await count(
        "select count(*) from public.profiles where id = (select id from auth.users where email = $1) and teacher_id is not null",
        [email],
      ),
    ).toBe(0);
    expect(
      await count(
        "select count(*) from public.profiles where id = (select id from auth.users where email = $1) and access_status <> 'pending'",
        [email],
      ),
    ).toBe(0);

    const user = await maybeOne<{ id: string }>("select id from auth.users where email = $1", [
      email,
    ]);
    if (user) await deleteUser(user.id);
  });

  test("nome curto é recusado", async ({ page }) => {
    await page.goto("/cadastro");
    await field(page, "name").fill("Jo");
    await field(page, "email").fill(`curto-${Date.now().toString(36)}@e2e.local`);
    await field(page, "password").fill("SenhaE2E#2026");
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(alert(page, "error")).toHaveText("Informe seu nome completo.");
  });

  test("senha curta é recusada", async ({ page }) => {
    await page.goto("/cadastro");
    await field(page, "name").fill("Candidata Teste");
    await field(page, "email").fill(`senha-${Date.now().toString(36)}@e2e.local`);
    await field(page, "password").fill("123");
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(alert(page, "error")).toHaveText("A senha precisa ter pelo menos 6 caracteres.");
  });

  test("e-mail já cadastrado é recusado", async ({ page, scenario }) => {
    await page.goto("/cadastro");
    await field(page, "name").fill("Outra Pessoa");
    await field(page, "email").fill(scenario.student.email);
    await field(page, "password").fill("SenhaE2E#2026");
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(alert(page, "error")).toHaveText("Já existe uma conta com este e-mail.");
  });
});

test.describe("F-AUTH-10/11/12 · recuperação de senha", () => {
  // O Mailpit é global: dois testes lendo a caixa ao mesmo tempo se confundem.
  test.describe.configure({ mode: "serial" });

  test("do pedido até entrar com a senha nova", async ({ page, baseURL }) => {
    const person = await createUser("student", "Aluna Esquecida", "esqueci");
    await setAccess(person.id, "active");
    await clearMailbox();

    await page.goto("/recuperar-senha");
    await field(page, "email").fill(person.email);
    await page.getByRole("button", { name: "Enviar link" }).click();

    // Resposta neutra: confirmar que o e-mail existe é vazamento.
    await expect(alert(page, "success")).toContainText("Se houver uma conta");

    const email = await waitForEmail(person.email);
    expect(email.subject).toContain("Redefinir sua senha");

    // BUG-02: o link precisa levar a uma sessão de recuperação viva. Antes ele
    // caía no site_url e a tela dizia "link expirou" para todo mundo.
    await page.goto(actionLink(email, baseURL!));
    await expect(page).toHaveURL(/\/redefinir-senha/);
    await expect(alert(page, "warning")).toHaveCount(0);

    const novaSenha = "NovaSenhaE2E#2026";
    await field(page, "password").fill(novaSenha);
    await field(page, "passwordConfirmation").fill(novaSenha);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/aluno$/);

    // A senha nova entra…
    await signOut(page).click();
    await signInThroughForm(page, person.email, novaSenha);
    await expect(page).toHaveURL(/\/aluno$/);

    // …e a antiga deixa de entrar.
    await signOut(page).click();
    await signInThroughForm(page, person.email, person.password);
    await expect(alert(page, "error")).toHaveText("E-mail ou senha incorretos.");
  });

  test("e-mail inexistente recebe a mesma resposta neutra", async ({ page }) => {
    await page.goto("/recuperar-senha");
    await field(page, "email").fill("nao-existe@e2e.local");
    await page.getByRole("button", { name: "Enviar link" }).click();

    await expect(alert(page, "success")).toContainText("Se houver uma conta");
  });

  test("link expirado avisa em vez de mostrar o formulário", async ({ page }) => {
    await page.goto("/redefinir-senha");

    await expect(alert(page, "warning")).toContainText("Este link expirou ou já foi usado");
    await expect(field(page, "password")).toHaveCount(0);
  });

  test("senhas diferentes e senha curta são recusadas", async ({ page, baseURL }) => {
    const person = await createUser("student", "Aluna Confusa", "confusa");
    await setAccess(person.id, "active");
    await clearMailbox();

    await page.goto("/recuperar-senha");
    await field(page, "email").fill(person.email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await page.goto(actionLink(await waitForEmail(person.email), baseURL!));

    await field(page, "password").fill("SenhaE2E#2026");
    await field(page, "passwordConfirmation").fill("OutraCoisa#2026");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(alert(page, "error")).toHaveText("As senhas não conferem.");

    await field(page, "password").fill("123");
    await field(page, "passwordConfirmation").fill("123");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(alert(page, "error")).toHaveText("A senha precisa ter pelo menos 6 caracteres.");
  });
});

// ---------------------------------------------------------------------------
// §1 — senha visível.
// Spec docs/specs/29-sidebar-e-senha-visivel.md
// ---------------------------------------------------------------------------

test.describe("F-UI-04 · mostrar e ocultar a senha", () => {
  test("o botão revela e volta a ocultar, sem copiar o valor", async ({ page }) => {
    await page.goto("/entrar");

    const campo = field(page, "password");
    const botao = page.getByRole("button", { name: "Mostrar senha" });

    await campo.fill("segredo-do-teste");
    await expect(campo).toHaveAttribute("type", "password");
    await expect(botao).toHaveAttribute("aria-pressed", "false");

    await botao.click();
    await expect(campo).toHaveAttribute("type", "text");
    // O valor continua no MESMO input: a senha nunca existe em dois lugares.
    await expect(campo).toHaveValue("segredo-do-teste");
    await expect(page.getByRole("button", { name: "Ocultar senha" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Ocultar senha" }).click();
    await expect(campo).toHaveAttribute("type", "password");
    await expect(campo).toHaveValue("segredo-do-teste");
  });
});

test.describe("F-UI-05 · o botão de senha não submete", () => {
  test("clicar nele não dispara o login", async ({ page }) => {
    await page.goto("/entrar");
    await field(page, "email").fill("ninguem@exemplo.com");
    await field(page, "password").fill("qualquer-coisa");

    // Um <button> sem `type` dentro de <form> submete. Se este submetesse, o
    // login tentaria acontecer e a tela mostraria erro de credencial.
    await page.getByRole("button", { name: "Mostrar senha" }).click();

    await expect(page).toHaveURL(/\/entrar$/);
    await expect(alert(page, "error")).toHaveCount(0);
    await expect(field(page, "password")).toHaveAttribute("type", "text");
  });
});

test.describe("F-UI-06 · a senha começa sempre oculta", () => {
  test("mesmo depois de revelada numa visita anterior", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(field(page, "password")).toHaveAttribute("type", "text");

    // Nada de lembrar "estava visível": quem abre a tela depois pode ser outra
    // pessoa, no mesmo computador.
    await page.reload();
    await expect(field(page, "password")).toHaveAttribute("type", "password");

    // E na tela de cadastro, que abre com o campo oculto como qualquer outra.
    await page.goto("/cadastro");
    await expect(page.locator('input[type="password"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Mostrar senha" })).toBeVisible();
  });
});
