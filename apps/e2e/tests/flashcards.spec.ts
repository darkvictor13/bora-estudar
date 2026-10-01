/**
 * Cartões de aula — o professor escreve, o aluno revisa, e editar a aula não
 * apaga o histórico de quem já revisou.
 *
 * O defeito que este fluxo segura é estrutural: os cartões moravam num array
 * `jsonb` da aula, e regravar o array deixava a revisão do aluno apontando
 * para um id que não existia mais. Hoje cada cartão é uma linha, e remover é
 * marca.
 */
import { expect, test } from "../fixtures/index.ts";
import { count, one, query } from "../fixtures/db.ts";
import { addTheoryCatalog } from "../fixtures/scenario.ts";
import { alert } from "../support/ui.ts";

test.describe("F-FLASH-01 · cartões de aula", () => {
  test("o aluno revisa, o professor edita e remove, e o histórico continua", async ({
    page,
    signIn,
    scenario,
  }) => {
    const catalog = await addTheoryCatalog(scenario);
    const aula = catalog.lessons[0]!;
    const linha = page.locator(`[data-testid="lesson-row"][data-lesson-id="${aula.id}"]`);

    await signIn(scenario.teacher);
    await page.goto("/professor/teoria");
    await linha.getByRole("button", { name: "Editar" }).click();
    for (const [frente, verso] of [["Pergunta A", "Resposta A"], ["Pergunta B", "Resposta B"]] as const) {
      await linha.getByRole("button", { name: "Adicionar flashcard" }).click();
      const cartao = linha.locator('[data-testid="teacher-flashcard"]').last();
      await cartao.getByLabel("Frente · pergunta ou afirmação").fill(frente);
      await cartao.getByLabel("Resposta e explicação").fill(verso);
    }
    await linha.getByRole("button", { name: "Salvar aula" }).click();
    await expect(alert(page, "success")).toBeVisible();
    expect(await count("select count(*) from public.theory_lesson_flashcards where theory_lesson_id = $1", [aula.id])).toBe(2);

    await signIn(scenario.student);
    await page.goto(`/aluno/flashcards?aula=${aula.id}`);
    await page.locator('[data-testid="flashcard-flip"]').click();
    await page.getByRole("button", { name: "Acertei" }).click();
    await expect.poll(() => count("select count(*) from public.flashcard_reviews where student_id = $1", [scenario.student.id])).toBe(1);
    const revisada = await one<{ card_id: string; front: string }>(
      `select r.card_id, c.front from public.flashcard_reviews r
         join public.theory_lesson_flashcards c on c.id = r.card_id
        where r.student_id = $1`,
      [scenario.student.id],
    );

    // O professor reescreve o OUTRO cartão e remove o que o aluno revisou.
    await signIn(scenario.teacher);
    await page.goto("/professor/teoria");
    await linha.getByRole("button", { name: "Editar" }).click();
    const cartoes = linha.locator('[data-testid="teacher-flashcard"]');
    await expect(cartoes).toHaveCount(2);
    const outro = cartoes.filter({ hasNot: page.locator(`textarea:text-is("${revisada.front}")`) });
    const removido = cartoes.filter({ has: page.locator(`textarea:text-is("${revisada.front}")`) });
    await outro.getByLabel("Frente · pergunta ou afirmação").fill("Pergunta reescrita");
    await removido.getByRole("button", { name: "Remover" }).click();
    await linha.getByRole("button", { name: "Salvar aula" }).click();
    await expect(alert(page, "success")).toBeVisible();

    // O cartão removido continua na tabela, marcado; o reescrito manteve o id.
    const cards = await query<{ id: string; front: string; deleted: boolean }>(
      "select id, front, deleted from public.theory_lesson_flashcards where theory_lesson_id = $1 order by position",
      [aula.id],
    );
    expect(cards).toHaveLength(2);
    expect(cards.find((card) => card.id === revisada.card_id)?.deleted).toBe(true);
    expect(cards.find((card) => card.id !== revisada.card_id)?.front).toBe("Pergunta reescrita");
    expect(await count("select count(*) from public.flashcard_reviews where student_id = $1", [scenario.student.id])).toBe(1);

    // O aluno vê só o cartão vivo, já reescrito.
    await signIn(scenario.student);
    await page.goto(`/aluno/flashcards?aula=${aula.id}`);
    await expect(page.getByText("Pergunta reescrita").first()).toBeVisible();
    expect(await page.content()).not.toContain(revisada.front);
  });
});

/**
 * Revisar duas vezes o MESMO cartão exercita os dois caminhos da escrita: a
 * primeira é INSERT, a segunda é UPDATE. Com o `upsert` de antes, a primeira
 * já falhava com 42501 — o PostgREST manda as colunas de identidade no
 * `ON CONFLICT DO UPDATE`, e elas ficam fora do grant.
 *
 * Entre as duas, o vencimento é antecipado por SQL: esperar o intervalo real
 * do agendador seria esperar minutos.
 */
async function gradeTwice(
  page: import("@playwright/test").Page,
  url: string,
  table: "library_flashcard_reviews" | "personal_flashcard_reviews",
  studentId: string,
): Promise<void> {
  await page.goto(url);
  await page.locator('[data-testid="flashcard-flip"]').click();
  await page.getByRole("button", { name: "Acertei" }).click();
  await expect.poll(() => count(`select count(*) from public.${table} where student_id = $1`, [studentId])).toBe(1);

  await query(`update public.${table} set due_at = now() - interval '1 day' where student_id = $1`, [studentId]);
  await page.goto(url);
  await page.locator('[data-testid="flashcard-flip"]').click();
  await page.getByRole("button", { name: "Acertei" }).click();
  await expect.poll(async () => (await one<{ review_count: number }>(
    `select review_count from public.${table} where student_id = $1`, [studentId])).review_count).toBe(2);
}

test.describe("F-FLASH-02 · deck pessoal", () => {
  test("o aluno cria o deck, o cartão, e revisa duas vezes", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno/flashcards");
    await studentPage.getByRole("button", { name: "Criar flashcards" }).click();
    const deckDialog = studentPage.getByRole("dialog");
    await deckDialog.getByLabel("Disciplina").fill("Direito Penal");
    await deckDialog.getByLabel("Assunto do deck").fill("Teoria do crime");
    await deckDialog.getByRole("button", { name: "Criar deck" }).click();
    await expect(studentPage).toHaveURL(/meuDeck=/);
    await studentPage.getByRole("button", { name: "Adicionar cartão" }).click();
    const cardDialog = studentPage.getByRole("dialog");
    await cardDialog.getByLabel("Pergunta ou afirmação").fill("O que é crime?");
    await cardDialog.getByLabel("Resposta").fill("Fato típico, ilícito e culpável.");
    await cardDialog.getByRole("button", { name: "Adicionar cartão" }).click();
    await expect(cardDialog).toHaveCount(0);

    await gradeTwice(studentPage, studentPage.url(), "personal_flashcard_reviews", scenario.student.id);
  });
});

test.describe("F-FLASH-03 · biblioteca editorial", () => {
  test("o aluno revisa um cartão do deck duas vezes", async ({ studentPage, scenario }) => {
    await gradeTwice(studentPage, "/aluno/flashcards?deck=pf2029-informatica-01", "library_flashcard_reviews", scenario.student.id);
  });
});
