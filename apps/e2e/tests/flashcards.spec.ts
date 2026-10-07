/**
 * Cartões de aula — o professor escreve, o aluno revisa, e editar a aula não
 * apaga o histórico de quem já revisou.
 *
 * O defeito que este fluxo segura é estrutural: os cartões moravam num array
 * `jsonb` da aula, e regravar o array deixava a revisão do aluno apontando
 * para um id que não existia mais. Hoje cada cartão é uma linha, e remover é
 * marca.
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { authenticate, expect, test } from "../fixtures/index.ts";
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

test.describe("F-FLASH-06 · deck pessoal repetido — QA-16", () => {
  test("a mesma disciplina e o mesmo assunto, com outra caixa, é recusado", async ({
    studentPage,
    scenario,
  }) => {
    const disciplina = `Direito ${scenario.student.id.slice(0, 8)}`;
    await studentPage.goto("/aluno/flashcards");

    await studentPage.getByRole("button", { name: "Criar flashcards" }).click();
    const primeiro = studentPage.getByRole("dialog");
    // O teto dos dois campos vem do contrato, e não de literal da tela.
    await expect(primeiro.getByLabel("Disciplina")).toHaveAttribute("maxlength", "120");
    await expect(primeiro.getByLabel("Assunto do deck")).toHaveAttribute("maxlength", "160");
    await primeiro.getByLabel("Disciplina").fill(disciplina);
    await primeiro.getByLabel("Assunto do deck").fill("Teoria do crime");
    await primeiro.getByRole("button", { name: "Criar deck" }).click();
    await expect(studentPage).toHaveURL(/meuDeck=/);

    await studentPage.goto("/aluno/flashcards");
    await studentPage.getByRole("button", { name: "Criar flashcards" }).click();
    const segundo = studentPage.getByRole("dialog");
    await segundo.getByLabel("Disciplina").fill(` ${disciplina.toUpperCase()} `);
    await segundo.getByLabel("Assunto do deck").fill("TEORIA DO CRIME");
    await segundo.getByRole("button", { name: "Criar deck" }).click();

    await expect(alert(segundo, "error")).toHaveText(
      "Você já tem um deck com essa disciplina e esse assunto.",
    );
    expect(
      await count(
        "select count(*) from public.personal_flashcard_decks where student_id = $1 and lower(btrim(subject)) = lower(btrim($2))",
        [scenario.student.id, disciplina],
      ),
    ).toBe(1);
  });
});

test.describe("F-FLASH-03 · biblioteca editorial", () => {
  test("o aluno revisa um cartão do deck duas vezes", async ({ studentPage, scenario }) => {
    await gradeTwice(studentPage, "/aluno/flashcards?deck=pf2029-informatica-01", "library_flashcard_reviews", scenario.student.id);
  });
});

test.describe("F-FLASH-04 · lista da biblioteca sem o texto", () => {
  // Spec 39, CA-07: a lista e a busca chegam pela view, sem nenhuma leitura de
  // `library_flashcards` — é ela que carrega frente e verso.
  test("a lista e a busca por tópico chegam sem o texto dos cartões", async ({ studentPage }) => {
    const textReads: string[] = [];
    studentPage.on("request", (request) => {
      if (/\/rest\/v1\/library_flashcards\?/.test(request.url())) textReads.push(request.url());
    });
    await studentPage.goto("/aluno/flashcards");
    const decks = studentPage.getByTestId("library-flashcard-deck");
    await expect(studentPage.getByText(/14 disciplinas · 101 decks por tópico · 5\.108 cartões/)).toBeVisible();

    await studentPage.getByLabel("Buscar disciplina ou tópico").fill("Tanatologia");
    await expect(decks.first()).toBeVisible();
    await expect(decks).toHaveCount(1);
    await expect(decks.first()).toContainText("Tanatologia");

    // Um tópico que só existe dentro dos cartões, e não no título do deck.
    await studentPage.getByLabel("Buscar disciplina ou tópico").fill("Conceito e Finalidade");
    await expect(decks.filter({ hasText: "Inquérito Policial" })).toHaveCount(1);

    expect(textReads).toEqual([]);
    expect(await studentPage.content()).not.toContain("Procedimento administrativo preliminar, informativo e inquisitivo");
  });
});

test.describe("F-FLASH-05 · cartão corrigido no banco", () => {
  // Spec 39, CA-08: a correção chega ao aluno sem build. O deck é um que
  // nenhum outro teste abre, e o texto volta ao original no fim.
  test("o deck mostra o texto que está no banco", async ({ studentPage }) => {
    const card = await one<{ id: string; front: string }>(
      `select id, front from public.library_flashcards
        where deck_id = 'pf2029-medicina-legal-sexologia' and retired_at is null
        order by position limit 1`,
    );
    const corrected = `${card.front} [corrigido ${crypto.randomUUID().slice(0, 8)}]`;
    await query("update public.library_flashcards set front = $1 where id = $2", [corrected, card.id]);
    try {
      await studentPage.goto("/aluno/flashcards?deck=pf2029-medicina-legal-sexologia");
      await expect(studentPage.getByText(corrected)).toBeVisible();
    } finally {
      await query("update public.library_flashcards set front = $1 where id = $2", [card.front, card.id]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Grifo nos flashcards (spec 42)
 * ------------------------------------------------------------------ */

/** Seleciona `quote` dentro de um lado do cartão, como um arrasto terminado. */
async function selectInCard(page: Page, side: "front" | "back", quote: string): Promise<void> {
  const text = page.locator(`[data-flashcard-side="${side}"]`);
  await expect(text).toContainText(quote);
  await text.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(wanted) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + wanted.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return;
    }
    throw new Error(`trecho não encontrado: ${wanted}`);
  }, quote);
}

async function markInCard(page: Page, side: "front" | "back", quote: string): Promise<void> {
  await selectInCard(page, side, quote);
  await page.getByRole("button", { name: "Marca-texto" }).click();
}

function cardMarks(page: Page, side: "front" | "back") {
  return page.locator(`[data-flashcard-side="${side}"] [data-testid="flashcard-mark"]`);
}

/** Vira o cartão e espera ele ter virado — o clique no texto vira com atraso. */
async function reveal(page: Page): Promise<void> {
  const card = page.getByTestId("flashcard-flip");
  await card.click({ position: { x: 12, y: 12 } });
  await expect(card).toHaveAttribute("data-flipped", "true");
}

/** Um deck pessoal com um cartão, criado como o aluno o criaria. */
async function personalDeck(studentId: string, front: string, back: string): Promise<string> {
  const deckId = randomUUID();
  await query(
    "insert into public.personal_flashcard_decks (id, student_id, subject, title) values ($1, $2, 'Direito Penal', 'Grifos')",
    [deckId, studentId],
  );
  await query(
    "insert into public.personal_flashcards (id, deck_id, student_id, front, back) values ($1, $2, $3, $4, $5)",
    [randomUUID(), deckId, studentId, front, back],
  );
  return deckId;
}

test.describe("F-GRIFO-01 · grifo na conta", () => {
  test("o grifo do verso da biblioteca e o da frente do pessoal aparecem em outra sessão", async ({ studentPage, scenario, browser, baseURL }) => {
    const libraryUrl = "/aluno/flashcards?deck=pf2029-informatica-02";
    await studentPage.goto(libraryUrl);
    await reveal(studentPage);
    const back = (await studentPage.locator('[data-flashcard-side="back"]').textContent()) ?? "";
    const quote = back.trim().split(/\s+/).slice(0, 2).join(" ");
    await markInCard(studentPage, "back", quote);
    await expect(cardMarks(studentPage, "back")).toHaveText([quote]);
    // A gravação sai depois da pintura: navegar antes de ela voltar a cancelaria.
    await expect.poll(() => count("select count(*) from public.flashcard_marks where student_id = $1", [scenario.student.id])).toBe(1);

    const personalUrl = `/aluno/flashcards?meuDeck=${await personalDeck(scenario.student.id, "O que é crime?", "Fato típico, ilícito e culpável.")}`;
    await studentPage.goto(personalUrl);
    await markInCard(studentPage, "front", "crime");
    await expect(cardMarks(studentPage, "front")).toHaveText(["crime"]);
    await expect.poll(() => count("select count(*) from public.flashcard_marks where student_id = $1", [scenario.student.id])).toBe(2);

    // Outro "aparelho": contexto novo, sem nada do primeiro além do login.
    if (!baseURL) throw new Error("baseURL não configurada no projeto do Playwright");
    const other = await browser.newContext({ baseURL });
    try {
      await authenticate(other, scenario.student, baseURL);
      const page = await other.newPage();
      await page.goto(libraryUrl);
      await reveal(page);
      await expect(cardMarks(page, "back")).toHaveText([quote]);
      await expect(cardMarks(page, "front")).toHaveCount(0);
      await page.goto(personalUrl);
      await expect(cardMarks(page, "front")).toHaveText(["crime"]);
    } finally {
      await other.close();
    }
  });
});

test.describe("F-GRIFO-02 · grifo ancorado pelo trecho", () => {
  test("reescrito o cartão antes do grifo, o grifo acompanha; apagado o trecho, o cartão avisa", async ({ page, signIn, scenario }) => {
    const catalog = await addTheoryCatalog(scenario);
    const aula = catalog.lessons[0]!;
    const cardId = randomUUID();
    const original = "Dez dias, se o indiciado estiver preso.";
    await query(
      `insert into public.theory_lesson_flashcards (id, theory_lesson_id, teacher_id, position, front, back)
       values ($1, $2, $3, 1, 'Qual o prazo do inquérito?', $4)`,
      [cardId, aula.id, scenario.teacher.id, original],
    );

    await signIn(scenario.student);
    await page.goto(`/aluno/flashcards?aula=${aula.id}`);
    await reveal(page);
    await markInCard(page, "back", "estiver preso");
    await expect.poll(() => count("select count(*) from public.flashcard_marks where student_id = $1", [scenario.student.id])).toBe(1);

    await query("update public.theory_lesson_flashcards set back = $1 where id = $2", [`Em regra, ${original}`, cardId]);
    await page.reload();
    await reveal(page);
    await expect(cardMarks(page, "back")).toHaveText(["estiver preso"]);

    await query("update public.theory_lesson_flashcards set back = $1 where id = $2", ["Dez dias, se o indiciado estiver solto.", cardId]);
    await page.reload();
    await expect(page.getByText(/Uma marcação sua neste cartão não foi encontrada no texto atual/)).toBeVisible();
    await reveal(page);
    await expect(cardMarks(page, "back")).toHaveCount(0);
    // Continua gravada: a correção do texto não apaga marcação (R-GRIFO-13).
    expect(await count("select count(*) from public.flashcard_marks where student_id = $1", [scenario.student.id])).toBe(1);
  });
});

test.describe("F-GRIFO-03 · virar, selecionar e desfazer", () => {
  test("clique vira, seleção não vira, e o desfazer remove o grifo de vez", async ({ studentPage, scenario }) => {
    const url = `/aluno/flashcards?meuDeck=${await personalDeck(scenario.student.id, "Qual é o prazo do inquérito policial?", "Dez dias.")}`;
    await studentPage.goto(url);
    const card = studentPage.getByTestId("flashcard-flip");

    // Arrastar sobre o texto seleciona, e o cartão não vira.
    const front = studentPage.locator('[data-flashcard-side="front"]');
    const box = await front.boundingBox();
    if (!box) throw new Error("a frente do cartão não está na tela");
    await studentPage.mouse.move(box.x + 2, box.y + box.height / 2);
    await studentPage.mouse.down();
    await studentPage.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await studentPage.mouse.up();
    await expect(studentPage.getByText(/1 trecho selecionado/)).toBeVisible();
    await studentPage.waitForTimeout(500); // o atraso do clique no texto já passou
    await expect(card).toHaveAttribute("data-flipped", "false");

    await studentPage.getByRole("button", { name: "Marca-texto" }).click();
    await expect(cardMarks(studentPage, "front")).toHaveCount(1);
    await expect.poll(() => count("select count(*) from public.flashcard_marks where student_id = $1", [scenario.student.id])).toBe(1);

    await studentPage.getByRole("button", { name: "Desfazer marcação" }).click();
    await expect(cardMarks(studentPage, "front")).toHaveCount(0);
    await expect.poll(() => count("select count(*) from public.flashcard_marks where student_id = $1", [scenario.student.id])).toBe(0);

    // Clique simples continua virando.
    await card.click();
    await expect(card).toHaveAttribute("data-flipped", "true");

    await studentPage.reload();
    await expect(studentPage.locator('[data-flashcard-side="front"]')).toBeVisible();
    await expect(cardMarks(studentPage, "front")).toHaveCount(0);
  });
});
