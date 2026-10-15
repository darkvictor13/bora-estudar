/**
 * Spec 46 — exclusão de conta e documentos legais.
 *
 * A exclusão tem duas metades, e os testes de banco (`21_account_deletion.sql`)
 * provam as duas; aqui se prova o que só o navegador mostra: a pessoa LÊ o que
 * sai e o que fica antes de confirmar, só confirma digitando a palavra, e
 * depois de excluir não consegue entrar de novo — mas o mesmo e-mail cadastra
 * uma conta nova e vazia.
 */
import { expect, test } from "../fixtures/index.ts";
import { count, maybeOne, one } from "../fixtures/db.ts";
import { deleteUser } from "../fixtures/scenario.ts";
import { alert, content, field, testId } from "../support/ui.ts";

test.describe("F-LGPD-01 · excluir a conta", () => {
  test("o diálogo só habilita com EXCLUIR, apaga o que o aluno fez, encerra a sessão e libera o e-mail", async ({
    studentPage,
    page,
    scenario,
  }) => {
    const studentId = scenario.student.id;
    await studentPage.goto("/aluno/conta");
    await testId(studentPage, "delete-account-open").click();

    const dialog = testId(studentPage, "delete-account-dialog");
    const confirm = testId(studentPage, "delete-account-confirm");
    await expect(dialog).toBeVisible();
    // O diálogo repete as duas listas, e não só pergunta "tem certeza?".
    await expect(dialog).toContainText("O que é apagado");
    await expect(dialog).toContainText("O que fica, sem identificar você");

    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/digite EXCLUIR/).fill("excluir");
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/digite EXCLUIR/).fill("EXCLUIR");
    await expect(confirm).toBeEnabled();

    expect(await count("select count(*) from public.goals where student_id = $1", [studentId])).toBeGreaterThan(0);
    await confirm.click();

    await expect(page).toHaveURL(/\/entrar\?conta=excluida$/);
    await expect(alert(page, "success")).toHaveText("Sua conta foi excluída.");

    // O que o aluno fez saiu; o perfil ficou anônimo.
    expect(await count("select count(*) from public.goals where student_id = $1", [studentId])).toBe(0);
    expect(await count("select count(*) from public.study_plans where student_id = $1", [studentId])).toBe(0);
    const profile = await one<{ name: string; deleted: boolean; teacher_id: string | null }>(
      "select name, deleted_at is not null as deleted, teacher_id from public.profiles where id = $1",
      [studentId],
    );
    expect(profile).toMatchObject({ name: "Conta excluída", deleted: true, teacher_id: null });

    // O login seguinte falha: o e-mail e a senha deixaram de existir.
    await field(page, "email").fill(scenario.student.email);
    await field(page, "password").fill("E2ePass#2026!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alert(page, "error")).toHaveText("E-mail ou senha incorretos.");

    // O mesmo e-mail cadastra uma conta nova, sem ligação com a apagada.
    await page.goto("/cadastro");
    await field(page, "name").fill("Quem Voltou Depois");
    await field(page, "email").fill(scenario.student.email);
    await field(page, "password").fill("SenhaE2E#2026");
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await expect(page).toHaveURL(/\/aluno\/lista-espera$/);

    const reborn = await maybeOne<{ id: string }>("select id from auth.users where email = $1", [
      scenario.student.email,
    ]);
    expect(reborn).not.toBeNull();
    expect(reborn!.id).not.toBe(studentId);
    expect(await count("select count(*) from public.goals where student_id = $1", [reborn!.id])).toBe(0);
    await deleteUser(reborn!.id);
  });
});

test.describe("F-LGPD-02 · o cartão diz o que sai e o que fica", () => {
  test("as duas listas e o aviso de que não há volta aparecem ANTES do botão", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");

    const card = testId(studentPage, "delete-account-card");
    await expect(card).toContainText("O que é apagado");
    await expect(card).toContainText("tudo o que você fez e escreveu");
    await expect(card).toContainText("O que fica, sem identificar você");
    await expect(card).toContainText("liberações de acesso");
    await expect(card).toContainText("notas dos simulados presenciais");
    await expect(card).toContainText("Não há como desfazer");

    // Cancelar fecha o diálogo e não exclui nada.
    await testId(studentPage, "delete-account-open").click();
    await testId(studentPage, "delete-account-cancel").click();
    await expect(testId(studentPage, "delete-account-dialog")).toBeHidden();
    await expect(content(studentPage)).toContainText("Excluir conta");
  });
});

test.describe("F-LGPD-03 · privacidade e termos", () => {
  test("abrem sem login", async ({ page }) => {
    await page.goto("/privacidade");
    await expect(page.locator("h1")).toHaveText("Política de privacidade");
    await expect(testId(page, "legal-document")).toContainText("O que é apagado");
    await expect(testId(page, "legal-document")).toContainText("Sentry");

    await page.goto("/termos");
    await expect(page.locator("h1")).toHaveText("Termos de uso");
  });

  test("são linkados do cadastro e do login", async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.getByText("Ao criar a conta você concorda")).toBeVisible();
    await testId(page, "legal-link-privacy").click();
    await expect(page).toHaveURL(/\/privacidade$/);

    await page.goto("/entrar");
    await expect(testId(page, "legal-link-terms")).toBeVisible();
    await testId(page, "legal-link-terms").click();
    await expect(page).toHaveURL(/\/termos$/);
  });

  // Dois testes, e não um com `studentPage` e `teacherPage`: os dois são a MESMA
  // aba, e o segundo login sobrescreveria o primeiro em silêncio.
  test("e de Meus dados do aluno", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");
    await expect(testId(studentPage, "legal-link-privacy")).toBeVisible();
    await expect(testId(studentPage, "legal-link-terms")).toBeVisible();
  });

  test("e de Meus dados do professor", async ({ teacherPage }) => {
    await teacherPage.goto("/professor/conta");
    await expect(testId(teacherPage, "legal-link-privacy")).toBeVisible();
    await expect(testId(teacherPage, "legal-link-terms")).toBeVisible();
  });
});

test.describe("F-LGPD-04 · sem acesso vigente também exclui", () => {
  test.use({ scenarioOptions: { access: "expired" } });

  test("aluno com acesso vencido exclui a conta", async ({ studentPage, page, scenario }) => {
    await studentPage.goto("/aluno/conta");
    await testId(studentPage, "delete-account-open").click();
    await studentPage.getByLabel(/digite EXCLUIR/).fill("EXCLUIR");
    await testId(studentPage, "delete-account-confirm").click();

    await expect(page).toHaveURL(/\/entrar\?conta=excluida$/);
    expect(
      await count("select count(*) from public.profiles where id = $1 and deleted_at is not null", [
        scenario.student.id,
      ]),
    ).toBe(1);
  });
});

test.describe("F-LGPD-05 · o professor não exclui a conta por aqui", () => {
  test("o cartão não aparece em Meus dados do professor", async ({ teacherPage }) => {
    await teacherPage.goto("/professor/conta");
    await expect(teacherPage.locator("h1")).toHaveText("Meus dados");
    // `count()` não espera: o h1 acima é a espera dos loaders da rota.
    await expect(testId(teacherPage, "delete-account-card")).toHaveCount(0);
    await expect(testId(teacherPage, "delete-account-open")).toHaveCount(0);
  });
});
