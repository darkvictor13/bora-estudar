/**
 * Resumos flash — o texto vem do banco, e a anotação mora na conta (spec 45).
 *
 * O defeito que esta suíte segura: o salvamento comparava o estado anterior
 * pela URL, e o JSON das anotações estourava o limite dos proxies muito antes
 * do teto da coluna. O aluno que anotava bastante passava a ver "não foi
 * possível salvar" em toda marcação nova.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { authenticate, expect, test } from "../fixtures/index.ts";
import { one, query, value } from "../fixtures/db.ts";

const FIRST = "A prisão em flagrante dispensa ordem judicial.";
const SECOND = "O inquérito policial é inquisitivo e sigiloso.";

/** O texto do resumo é conteúdo comum: cada teste cria o próprio tópico e o apaga. */
async function createTopic(): Promise<string> {
  const id = `e2e-resumo-${randomUUID().slice(0, 8)}`;
  await query(
    `insert into public.summary_topics (id, subject, title, position, source_name, source_hash, blocks)
     values ($1, 'Direito Processual Penal', 'Prisões e inquérito', 9999, 'e2e.docx', 'e2e', $2::jsonb)`,
    [id, JSON.stringify([{ type: "paragraph", text: FIRST }, { type: "paragraph", text: SECOND }])],
  );
  return id;
}

async function dropTopic(id: string): Promise<void> {
  await query("delete from public.summary_topics where id = $1", [id]); // as anotações descem em cascata
}

/** Seleciona `quote` dentro do parágrafo `path` e aplica o marca-texto amarelo (atalho 1). */
async function highlight(page: Page, path: string, quote: string): Promise<void> {
  const paragraph = page.locator(`[data-summary-text][data-path="${path}"]`);
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
  await page.keyboard.press("1");
}

async function notesOf(studentId: string, topicId: string): Promise<{ quote: string }[]> {
  const row = await one<{ notes: { quote: string }[] }>(
    "select notes from public.summary_annotations where user_id = $1 and topic_id = $2", [studentId, topicId]);
  return row.notes;
}

test.describe("F-RES-01 · anotação na conta", () => {
  test("o grifo feito numa sessão aparece em outra sessão do mesmo aluno", async ({ studentPage, scenario, browser, baseURL }) => {
    const topicId = await createTopic();
    try {
      await studentPage.goto(`/aluno/resumos-flash?resumo=${topicId}`);
      await highlight(studentPage, "0", "ordem judicial");
      await expect(studentPage.locator('[data-testid="summary-mark"]')).toHaveText(["ordem judicial"]);
      await expect.poll(async () => (await query("select 1 from public.summary_annotations where user_id = $1 and topic_id = $2", [scenario.student.id, topicId])).length).toBe(1);
      expect((await notesOf(scenario.student.id, topicId)).map((note) => note.quote)).toEqual(["ordem judicial"]);

      if (!baseURL) throw new Error("baseURL não configurada no projeto do Playwright");
      const other = await browser.newContext({ baseURL });
      try {
        await authenticate(other, scenario.student, baseURL);
        const page = await other.newPage();
        await page.goto(`/aluno/resumos-flash?resumo=${topicId}`);
        await expect(page.locator('[data-testid="summary-mark"]')).toHaveText(["ordem judicial"]);
      } finally {
        await other.close();
      }
    } finally {
      await dropTopic(topicId);
    }
  });
});

test.describe("F-RES-02 · muitas anotações continuam salvando", () => {
  test("com ~60 KB de anotações já gravadas, um grifo novo ainda grava", async ({ studentPage, scenario }) => {
    const topicId = await createTopic();
    try {
      // Cada comentário carrega o trecho e o texto: 150 deles passam de 60 KB, o
      // que na URL do filtro antigo era mais de sete vezes o limite de um proxy.
      const existing = Array.from({ length: 150 }, (_, i) => ({
        id: `seed-${i}`, path: "1", start: 0, end: 5, quote: SECOND.slice(0, 5),
        style: "comment", color: "#d4aa20", comment: `Comentário ${i} ${"x".repeat(300)}`,
      }));
      await query("insert into public.summary_annotations (user_id, topic_id, notes) values ($1, $2, $3::jsonb)",
        [scenario.student.id, topicId, JSON.stringify(existing)]);
      expect(await value<number>("select length(notes::text) from public.summary_annotations where user_id = $1 and topic_id = $2",
        [scenario.student.id, topicId])).toBeGreaterThan(60_000);

      await studentPage.goto(`/aluno/resumos-flash?resumo=${topicId}`);
      await highlight(studentPage, "0", "flagrante");
      await expect.poll(async () => (await notesOf(scenario.student.id, topicId)).length).toBe(151);
      await expect(studentPage.getByText("Não foi possível salvar")).toHaveCount(0);
    } finally {
      await dropTopic(topicId);
    }
  });
});

test.describe("F-RES-03 · duas abas", () => {
  test("a aba desatualizada é avisada e não sobrescreve o que a outra gravou", async ({ studentPage, scenario }) => {
    const topicId = await createTopic();
    try {
      await studentPage.goto(`/aluno/resumos-flash?resumo=${topicId}`);
      await expect(studentPage.locator('[data-summary-text][data-path="0"]')).toContainText(FIRST);

      // "A outra aba" grava primeiro, pelo mesmo caminho que a tela usa.
      const written = [{ id: "outra-aba", path: "1", start: 0, end: 9, quote: SECOND.slice(0, 9),
        style: "highlight", color: "#fff176", comment: "" }];
      await query("insert into public.summary_annotations (user_id, topic_id, notes) values ($1, $2, $3::jsonb)",
        [scenario.student.id, topicId, JSON.stringify(written)]);

      await highlight(studentPage, "0", "flagrante");
      await expect(studentPage.getByText(/mudaram em outra aba/)).toBeVisible();
      expect((await notesOf(scenario.student.id, topicId)).map((note) => note.quote)).toEqual([SECOND.slice(0, 9)]);
    } finally {
      await dropTopic(topicId);
    }
  });
});
