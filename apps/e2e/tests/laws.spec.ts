/**
 * Vade Mecum — o texto vem do banco, e a marcação de leitura mora na conta.
 *
 * O defeito estrutural que esta suíte segura: a marcação ficava no
 * `localStorage` e era presa à posição do caractere. Trocar de aparelho a
 * perdia, e corrigir uma vírgula no começo do parágrafo a deslocava. Hoje ela
 * é linha de `law_marks`, ancorada pelo trecho (spec 40).
 */
import type { Page } from "@playwright/test";

import { authenticate, expect, test } from "../fixtures/index.ts";
import { count, one, query } from "../fixtures/db.ts";

/** Seleciona `quote` dentro de um parágrafo e aplica o marca-texto. */
async function markPassage(page: Page, articleId: string, quote: string): Promise<void> {
  const paragraph = page.locator(`[data-law-paragraph][data-article-id="${articleId}"][data-paragraph-index="0"]`);
  await expect(paragraph).toContainText(quote);
  await paragraph.evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(text) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return;
    }
    throw new Error(`trecho não encontrado: ${text}`);
  }, quote);
  await page.getByRole("button", { name: "Marca-texto" }).click();
}

function marksOf(page: Page, articleId: string) {
  return page.locator(`[data-law-paragraph][data-article-id="${articleId}"] [data-testid="law-mark"]`);
}

test.describe("F-LEI-01 · marcação na conta", () => {
  test("a marcação feita numa sessão aparece em outra sessão do mesmo aluno", async ({ studentPage, scenario, browser, baseURL }) => {
    await studentPage.goto("/aluno/leis?lei=lai");
    await markPassage(studentPage, "lai-art-1", "Esta Lei");
    await expect(marksOf(studentPage, "lai-art-1")).toHaveText(["Esta Lei"]);
    await expect.poll(() => count("select count(*) from public.law_marks where student_id = $1 and article_id = 'lai-art-1'", [scenario.student.id])).toBe(1);

    // Outro "aparelho": contexto novo, sem nada do primeiro além do login.
    if (!baseURL) throw new Error("baseURL não configurada no projeto do Playwright");
    const other = await browser.newContext({ baseURL });
    try {
      await authenticate(other, scenario.student, baseURL);
      const page = await other.newPage();
      await page.goto("/aluno/leis?lei=lai");
      await expect(marksOf(page, "lai-art-1")).toHaveText(["Esta Lei"]);
    } finally {
      await other.close();
    }
  });
});

test.describe("F-LEI-02 · marcação ancorada pelo trecho", () => {
  // O texto da lei é conteúdo comum: o teste usa um artigo que nenhum outro
  // abre, e devolve o parágrafo original no fim.
  test("corrigido o texto antes do grifo, o grifo acompanha; apagado o trecho, o leitor avisa", async ({ studentPage, scenario }) => {
    const article = await one<{ paragraphs: string[] }>("select paragraphs from public.law_articles where id = 'lai-art-2'");
    const original = article.paragraphs[0]!;
    try {
      await studentPage.goto("/aluno/leis?lei=lai");
      await markPassage(studentPage, "lai-art-2", "entidades privadas");
      await expect.poll(() => count("select count(*) from public.law_marks where student_id = $1 and article_id = 'lai-art-2'", [scenario.student.id])).toBe(1);

      await query("update public.law_articles set paragraphs[1] = $1 where id = 'lai-art-2'", [`Redação dada pela correção de 2026. ${original}`]);
      await studentPage.reload();
      await expect(marksOf(studentPage, "lai-art-2")).toHaveText(["entidades privadas"]);

      await query("update public.law_articles set paragraphs[1] = $1 where id = 'lai-art-2'", [original.replace("entidades privadas", "organizações")]);
      await studentPage.reload();
      await expect(studentPage.getByText(/Uma marcação sua não foi encontrada no texto atual desta lei/)).toBeVisible();
      await expect(marksOf(studentPage, "lai-art-2")).toHaveCount(0);
      // Continua gravada: a correção do texto não apaga marcação (R-LEI-13).
      expect(await count("select count(*) from public.law_marks where student_id = $1 and article_id = 'lai-art-2'", [scenario.student.id])).toBe(1);
    } finally {
      await query("update public.law_articles set paragraphs[1] = $1 where id = 'lai-art-2'", [original]);
    }
  });
});

test.describe("F-LEI-03 · mapa de edital", () => {
  test("a norma com texto na biblioteca aparece disponível e abre a lei", async ({ studentPage }) => {
    await studentPage.goto("/aluno/leis?visao=mapas&mapa=pmpr-2025");
    const available = studentPage.locator('[data-testid="exam-map-item"][data-canonical-id="BR-FED-LEI-11340-2006"]');
    await expect(available).toHaveAttribute("data-available", "true");
    await expect(studentPage.locator('[data-testid="exam-map-item"][data-canonical-id="BR-CF-1988"]').first()).toHaveAttribute("data-available", "false");
    await available.getByRole("link", { name: "Ler lei" }).click();
    await expect(studentPage).toHaveURL(/lei=lmp/);
    await expect(studentPage.getByText("Lei 11.340/2006").first()).toBeVisible();
  });
});
