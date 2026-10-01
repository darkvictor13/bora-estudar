/**
 * Simulados presenciais — spec 35.
 *
 * O professor cadastra, lança e publica PELA TELA; o que se confere depois é o
 * que o aluno recebe. A pré-condição que vai por SQL é só a turma, que tem tela
 * própria e já é coberta em `teacher.spec.ts`.
 */
import { randomUUID } from "node:crypto";

import { createUser, expect, setAccess, test } from "../fixtures/index.ts";
import { count, one, query } from "../fixtures/db.ts";
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

test.describe("F-SIM-02 · lançar nota e acertos do simulado", () => {
  /*
   * O aviso de "salvo" é a única confirmação que o professor tem de que a nota
   * gravou. Ele morava num formulário cuja `key` carregava a nota: a
   * revalidação depois de salvar remontava o formulário, e o aviso sumia antes
   * de aparecer. O teste espera o aviso NA TELA, e só depois confere o banco.
   */
  test("o aviso aparece e fica, e o valor gravado continua no campo", async ({
    teacherPage,
    scenario,
  }) => {
    const turma = randomUUID();
    const simulado = randomUUID();
    await query("insert into public.classes (id, teacher_id, name) values ($1, $2, $3)", [
      turma,
      scenario.teacher.id,
      `Turma ${scenario.planId.slice(0, 8)}`,
    ]);
    await query(
      "insert into public.class_students (class_id, student_id, teacher_id) values ($1, $2, $3)",
      [turma, scenario.student.id, scenario.teacher.id],
    );
    await query(
      `insert into public.mock_exams (id, teacher_id, class_id, title, exam_date, max_score)
       values ($1, $2, $3, 'Simulado e2e', current_date, 100)`,
      [simulado, scenario.teacher.id, turma],
    );
    await query(
      `insert into public.mock_exam_subjects (exam_id, teacher_id, subject, question_count)
       values ($1, $2, 'Direito Penal', 20)`,
      [simulado, scenario.teacher.id],
    );

    await teacherPage.goto(`/professor/simulados?simulado=${simulado}`);

    // O `has` do filtro é relativo ao `<form>`: ancorado em `content` ele não
    // casaria nunca, porque `content` não está dentro do formulário.
    const nota = teacherPage.getByLabel(`Nota de ${scenario.student.name}`);
    const formNota = content(teacherPage).locator("form").filter({ has: nota });
    await nota.fill("72.5");
    await formNota.getByRole("button", { name: "Salvar nota" }).click();
    await expect(formNota.getByRole("status")).toHaveText("Salva");

    const salva = await one<{ score: string }>(
      "select score::text from public.mock_exam_results where exam_id = $1 and student_id = $2",
      [simulado, scenario.student.id],
    );
    expect(salva.score).toBe("72.50");
    // Depois da revalidação o aviso continua, e o campo mostra a nota do banco.
    await expect(formNota.getByRole("status")).toHaveText("Salva");
    await expect(nota).toHaveValue("72.5");

    const acertos = teacherPage.getByLabel("Acertos");
    const formAcertos = content(teacherPage).locator("form").filter({ has: acertos });
    await acertos.fill("15");
    await formAcertos.getByRole("button", { name: "Salvar acertos" }).click();
    await expect(formAcertos.getByRole("status")).toHaveText("Salvos");

    const lancado = await one<{ correct_answers: number }>(
      `select correct_answers from public.mock_exam_subject_results
        where exam_id = $1 and student_id = $2 and subject = 'Direito Penal'`,
      [simulado, scenario.student.id],
    );
    expect(lancado.correct_answers).toBe(15);
    await expect(formAcertos.getByRole("status")).toHaveText("Salvos");
    await expect(acertos).toHaveValue("15");

    // Editar de novo apaga o aviso: ele fala do que está gravado, não do que
    // está digitado.
    await nota.fill("80");
    await expect(formNota.getByRole("status")).toHaveCount(0);
  });
});
