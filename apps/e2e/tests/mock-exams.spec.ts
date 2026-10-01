/**
 * Simulados presenciais — spec 35.
 *
 * O professor cadastra, lança e publica PELA TELA; o que se confere depois é o
 * que o aluno recebe. A pré-condição que vai por SQL é só a turma, que tem tela
 * própria e já é coberta em `teacher.spec.ts`.
 */
import { randomUUID } from "node:crypto";

import { createUser, expect, setAccess, test } from "../fixtures/index.ts";
import { count, query } from "../fixtures/db.ts";
import { alert, content } from "../support/ui.ts";

test.describe("F-SIM-01 · o ranking do aluno não tem nome de colega", () => {
  test("o professor publica com nomes; o aluno vê a própria linha e 'Colega'", async ({
    page,
    signIn,
    scenario,
  }) => {
    // O nome NÃO pode conter "Colega": as asserções do ranking procuram essa
    // palavra, e passariam com o nome verdadeiro na tela.
    const colleague = await createUser("student", `Vizinha ${randomUUID().slice(0, 6)}`, "aluno");
    await query("update public.profiles set teacher_id = $2 where id = $1", [colleague.id, scenario.teacher.id]);
    await setAccess(colleague.id, "active");
    const classId = randomUUID();
    const className = `Turma ${classId.slice(0, 6)}`;
    await query("insert into public.classes (id, teacher_id, name) values ($1, $2, $3)", [
      classId, scenario.teacher.id, className,
    ]);
    await query(
      `insert into public.class_students (class_id, student_id, teacher_id)
       values ($1, $2, $4), ($1, $3, $4)`,
      [classId, scenario.student.id, colleague.id, scenario.teacher.id],
    );

    await signIn(scenario.teacher);
    await page.goto("/professor/simulados");
    await page.getByRole("button", { name: "Novo simulado" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título").fill("Simulado E2E");
    await dialog.getByLabel("Turma").click();
    await page.getByRole("option", { name: className }).click();
    await dialog.getByRole("button", { name: "Cadastrar simulado" }).click();
    await expect(alert(page, "success")).toContainText("Simulado cadastrado");

    await content(page).getByLabel(`Nota de ${scenario.student.name}`).fill("60");
    await content(page).getByLabel(`Nota de ${scenario.student.name}`).press("Enter");
    // Espera pelo DADO, e não pelo aviso "Salva": a chave do formulário inclui
    // a nota, e a revalidação remonta o formulário levando o aviso junto.
    const notas = () => count("select count(*) from public.mock_exam_results where student_id in ($1, $2) and score is not null",
      [scenario.student.id, colleague.id]);
    await expect.poll(notas).toBe(1);
    await content(page).getByLabel(`Nota de ${colleague.name}`).fill("80");
    await content(page).getByLabel(`Nota de ${colleague.name}`).press("Enter");
    await expect(page.getByRole("button", { name: /Publicar ranking \(2 notas\)/ })).toBeVisible();

    await content(page).getByLabel("Matéria").fill("Português");
    await content(page).getByLabel("Questões").fill("10");
    await content(page).getByRole("button", { name: "Salvar matéria" }).click();
    const acertosDe = (name: string) => content(page).locator("form", { hasText: name }).getByLabel("Acertos");
    await expect(content(page).getByLabel("Acertos")).toHaveCount(2);
    const lancados = () => count("select count(*) from public.mock_exam_subject_results where student_id in ($1, $2)",
      [scenario.student.id, colleague.id]);
    await acertosDe(scenario.student.name).fill("6");
    await acertosDe(scenario.student.name).press("Enter");
    await expect.poll(lancados).toBe(1);
    await acertosDe(colleague.name).fill("9");
    await acertosDe(colleague.name).press("Enter");
    await expect.poll(lancados).toBe(2);

    // O professor vê os dois nomes no ranking.
    await expect(content(page)).toContainText(colleague.name);
    await page.getByRole("button", { name: /Publicar ranking/ }).click();
    await expect(alert(page, "success")).toContainText("Ranking publicado");

    await signIn(scenario.student);
    await page.goto("/aluno/simulados");
    const linhas = page.locator('[data-testid="ranking-row"]');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.nth(0)).toContainText("Colega");
    await expect(linhas.nth(0)).toContainText("80");
    await expect(linhas.nth(1)).toContainText(scenario.student.name);
    await expect(linhas.nth(1)).toContainText("Você");
    await expect(content(page)).toContainText("Sua posição: 2º");
    // A média dos colegas por matéria continua chegando (9 de 10).
    await expect(content(page)).toContainText("Média dos colegas: 90");

    // Nem o nome nem o id do colega estão em lugar nenhum da página.
    const html = await page.content();
    expect(html).not.toContain(colleague.name);
    expect(html).not.toContain(colleague.id);
  });
});
