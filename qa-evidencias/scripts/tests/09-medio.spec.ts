/**
 * Nível Médio — fluxos 16 a 21.
 */
import type { Page } from "@playwright/test";

import { createScenario, expect, go, query, reload, test } from "../qa.ts";

const TECH = /TypeError|invalid input|out of range|violates|syntax for type|duplicate key|null value|Failed to fetch/i;
const alerts = async (page: Page) => (await page.locator('[data-testid="alert"]').allTextContents()).join(" | ");

test.describe("F16 · flashcards", () => {
  test("F16.1 deck e cartão pessoal: HTML, emoji, texto enorme, repetido; nota com duplo clique", async ({ studentPage: page, scenario, shot, finding }) => {
    await go(page, "/aluno/flashcards");
    const create = async (subject: string, title: string) => {
      await page.getByRole("button", { name: "Criar flashcards" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Disciplina").fill(subject);
      await d.getByLabel("Assunto do deck").fill(title);
      await d.getByRole("button", { name: "Criar deck" }).click();
      await page.waitForTimeout(1500);
      const msg = (await d.locator('[data-testid="alert"]').allTextContents().catch(() => [])).join(" | ");
      return { msg, open: await d.count() };
    };
    const title = `Deck <i>QA</i> 🧠 ${Date.now().toString(36)}`;
    await create("Direito Penal", title);
    await expect(page).toHaveURL(/meuDeck=/);
    const deckUrl = page.url();
    await page.getByRole("button", { name: "Adicionar cartão" }).click();
    const cd = page.getByRole("dialog");
    const huge = `<script>window.__x=1</script>${"Lorem ipsum dolor sit amet ".repeat(400)}`;
    await cd.getByLabel("Pergunta ou afirmação").fill(huge);
    await cd.getByLabel("Resposta").fill("Resposta 🎯 <b>não negrito</b>");
    await cd.getByRole("button", { name: "Adicionar cartão" }).click();
    await page.waitForTimeout(2000);
    const stored = await query<{ len: number }>("select length(front)::int len from personal_flashcards where student_id=$1", [scenario.student.id]);
    if (stored[0] && stored[0].len > 5000) finding({ severity: "Baixo", title: "Cartão pessoal sem limite de tamanho", detail: `frente com ${stored[0].len} caracteres` });
    await go(page, deckUrl, { hard: true });
    expect.soft(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
    await shot(page, "F16.1 cartao pessoal com texto enorme");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) finding({ severity: "Baixo", title: "Cartão com texto longo estoura a largura", detail: `${overflow}px` });

    // nota com duplo clique
    await page.locator('[data-testid="flashcard-flip"]').click();
    await page.getByRole("button", { name: "Acertei" }).dblclick().catch(() => {});
    await page.waitForTimeout(2000);
    const reviews = await query<{ n: number; c: number }>("select count(*)::int n, coalesce(max(review_count),0)::int c from personal_flashcard_reviews where student_id=$1", [scenario.student.id]);
    if (reviews[0]!.c > 1) finding({ severity: "Médio", title: "Duplo clique em 'Acertei' conta duas revisões do mesmo cartão", detail: JSON.stringify(reviews[0]) });

    await go(page, "/aluno/flashcards");
    const dup = await create("Direito Penal", title);
    const decks = await query<{ n: number }>("select count(*)::int n from personal_flashcard_decks where student_id=$1 and title=$2", [scenario.student.id, title.trim()]);
    if (decks[0]!.n > 1) finding({ severity: "Baixo", title: "Deck pessoal com o mesmo assunto e disciplina é criado de novo", detail: `${decks[0]!.n} decks iguais` });
    if (TECH.test(dup.msg)) finding({ severity: "Baixo", title: "Deck repetido recusado com mensagem técnica", detail: dup.msg });
  });

  test("F16.2 busca da biblioteca com caracteres especiais", async ({ studentPage: page, shot, finding }) => {
    await go(page, "/aluno/flashcards");
    const box = page.getByLabel("Buscar disciplina ou tópico");
    for (const q of ["(", "[a-z", "\\", "%", "constitucionalidade", "CONSTITUCIONALIDADE", "constitucionalidáde", "🧠", "x".repeat(500)]) {
      await box.fill(q);
      await page.waitForTimeout(400);
      const h1 = await page.locator("h1").allTextContents();
      if (h1.some((h) => /Algo deu errado/.test(h))) {
        await shot(page, `F16.2 busca ${q.slice(0, 10)}`);
        finding({ severity: "Médio", title: `Busca de flashcards com "${q.slice(0, 12)}" derruba a tela`, detail: "" });
        await go(page, "/aluno/flashcards", { hard: true });
      }
    }
    await box.fill("constitucionalidade");
    const a = await page.getByTestId("library-flashcard-deck").count();
    await box.fill("CONSTITUCIONALIDÁDE");
    const b = await page.getByTestId("library-flashcard-deck").count();
    if (a > 0 && b === 0) finding({ severity: "Baixo", title: "Busca de flashcards não ignora acento/caixa", detail: `"constitucionalidade" acha ${a}, "CONSTITUCIONALIDÁDE" acha ${b}` });
  });
});

test.describe("F17 · leis", () => {
  test("F17.1 busca de lei e de artigo com caracteres especiais e sem resultado", async ({ studentPage: page, shot, finding }) => {
    await go(page, "/aluno/leis");
    const box = page.getByPlaceholder("Buscar lei ou número");
    for (const q of ["(", "8.069", "8069", "estatuto da crianca", "ESTATUTO DA CRIANÇA", "zzzzzz", "🧑‍⚖️"]) {
      await box.fill(q);
      await page.waitForTimeout(500);
      const h1 = await page.locator("h1").allTextContents();
      if (h1.some((h) => /Algo deu errado/.test(h))) {
        await shot(page, `F17.1 busca ${q}`);
        finding({ severity: "Médio", title: `Busca de lei "${q}" derruba a tela`, detail: "" });
        await go(page, "/aluno/leis", { hard: true });
      }
    }
    await box.fill("zzzzzz");
    await page.waitForTimeout(500);
    const text = (await page.locator("main").textContent()) ?? "";
    await shot(page, "F17.1 busca de lei sem resultado");
    if (!/nenhum|não encontr|sem resultado/i.test(text)) finding({ severity: "UX", title: "Busca de lei sem resultado não diz que não achou", detail: "" });
    await box.fill("8.069");
    await page.waitForTimeout(500);
    const withDot = (await page.locator("main").textContent())?.includes("8.069") ?? false;
    await box.fill("8069");
    await page.waitForTimeout(500);
    const noDot = (await page.locator("main").textContent())?.includes("8.069") ?? false;
    if (withDot && !noDot) finding({ severity: "Baixo", title: "Busca de lei por número sem ponto (8069) não acha a Lei 8.069", detail: "" });
  });
});

test.describe("F19 · lista de alunos do professor", () => {
  test("F19.1 busca, filtros na URL, voltar, e busca com caracteres especiais", async ({ teacherPage: page, scenario, shot, finding }) => {
    await go(page, "/professor");
    const search = page.getByLabel("Buscar por nome");
    await search.fill(scenario.student.name.toUpperCase());
    await page.waitForTimeout(600);
    await expect.soft(page.locator('[data-testid="student-card"]')).toHaveCount(1);
    const urlAfterSearch = page.url();
    await search.fill("%_(");
    await page.waitForTimeout(600);
    await expect.soft(page.locator('[data-testid="student-card"]')).toHaveCount(0);
    const empty = (await page.locator("main").textContent()) ?? "";
    if (!/nenhum/i.test(empty)) finding({ severity: "UX", title: "Busca de alunos sem resultado não explica", detail: "" });
    await page.getByRole("combobox", { name: "Ritmo" }).click();
    const options = await page.getByRole("option").allTextContents();
    await page.getByRole("option").nth(1).click();
    await page.waitForTimeout(600);
    const withFilter = page.url();
    await page.goBack();
    await page.waitForTimeout(800);
    await shot(page, "F19.1 lista de alunos depois do voltar");
    if (page.url() === withFilter) finding({ severity: "Baixo", title: "Botão voltar não desfaz o filtro de ritmo", detail: `opções: ${options.join(", ")}` });
    if (!urlAfterSearch.includes("busca") && !urlAfterSearch.includes("q=") && !urlAfterSearch.includes("nome")) {
      finding({ severity: "UX", title: "A busca por nome não fica na URL (some ao recarregar/compartilhar)", detail: urlAfterSearch });
    }
  });
});

test.describe("F20 · meus dados", () => {
  for (const role of ["aluno", "professor"] as const) {
    test(`F20.1 salvar nome (${role}): vazio, espaços, longo, emoji; persistência`, async ({ page, scenario, signIn, shot, finding }) => {
      await signIn(role === "aluno" ? scenario.student : scenario.teacher);
      const route = role === "aluno" ? "/aluno/conta" : "/professor/conta";
      await go(page, route);
      const name = page.locator("#field-name");
      for (const bad of ["", "   ", "Al"]) {
        await name.fill(bad);
        await page.getByRole("button", { name: "Salvar" }).click();
        await page.waitForTimeout(1000);
        const msg = await alerts(page);
        if (!/nome/i.test(msg)) finding({ severity: "Baixo", title: `Meus dados (${role}): nome "${bad}" sem mensagem`, detail: msg });
      }
      const good = `Fulana d'Ávila 🌟 ${role}`;
      await name.fill(`   ${good}   `);
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.locator('[data-testid="alert"][data-status="success"]')).toBeVisible();
      await reload(page);
      await expect.soft(page.locator("#field-name")).toHaveValue(good);
      await expect.soft(page.locator('[data-testid="user-name"]')).toHaveText(good);
      await name.evaluate((el) => el.removeAttribute("maxlength"));
      await name.fill("N".repeat(300));
      await page.getByRole("button", { name: "Salvar" }).click();
      await page.waitForTimeout(1200);
      const len = await query<{ len: number }>("select length(name)::int len from profiles where id=$1", [role === "aluno" ? scenario.student.id : scenario.teacher.id]);
      if (len[0]!.len > 120) {
        await shot(page, `F20.1 nome com 300 caracteres ${role}`);
        finding({ severity: "Baixo", title: `Meus dados (${role}) grava nome de ${len[0]!.len} caracteres (sem limite no servidor)`, detail: "" });
      }
      await page.route("**/rest/v1/profiles**", (r) => (r.request().method() === "PATCH" ? r.abort("internetdisconnected") : r.continue()));
      await name.fill("Nome Sem Rede");
      await page.getByRole("button", { name: "Salvar" }).click();
      await page.waitForTimeout(1200);
      const offline = await alerts(page);
      if (TECH.test(offline)) finding({ severity: "Médio", title: `Meus dados (${role}) sem rede mostra erro técnico`, detail: offline });
    });
  }
});

test.describe("F21 · lista de espera", () => {
  test("F21.1 validações e correção da inscrição", async ({ page, signIn, shot, finding }) => {
    const s = await createScenario({ access: "pending", withLink: false, withPlan: false });
    await signIn(s.student);
    await go(page, "/aluno/lista-espera");
    const form = page.locator('[data-testid="waitlist-form"]');
    const fill = async (v: Record<string, string>) => {
      for (const [k, value] of Object.entries(v)) await form.locator(`[name="${k}"]`).fill(value);
      await form.getByRole("button", { name: /Entrar na lista|Atualizar|Salvar/ }).click();
      await page.waitForTimeout(1500);
    };
    await fill({ name: "Aluna Espera QA", whatsapp: "abc", interestArea: "Policial", targetExam: "PMPR", birthDate: "2031-01-01" });
    const row = await query<{ whatsapp: string; birth_date: string | null }>("select whatsapp, birth_date::text from waitlist where student_id=$1", [s.student.id]);
    await shot(page, "F21.1 lista de espera com whatsapp abc e nascimento no futuro");
    if (row[0]?.whatsapp === "abc") finding({ severity: "Baixo", title: "Lista de espera aceita WhatsApp 'abc'", detail: "sem validação de formato de telefone" });
    if (row[0]?.birth_date === "2031-01-01") finding({ severity: "Baixo", title: "Lista de espera aceita data de nascimento no futuro", detail: "2031-01-01" });
    const rawMsg = await alerts(page);
    if (/violates check constraint/i.test(rawMsg)) finding({ severity: "Médio", title: "Lista de espera mostra a mensagem crua do Postgres ao recusar o WhatsApp", detail: rawMsg });
    await fill({ whatsapp: "(41) 99999-0000", birthDate: "2031-01-01" });
    const row2 = await query<{ whatsapp: string; birth_date: string | null }>("select whatsapp, birth_date::text from waitlist where student_id=$1", [s.student.id]);
    await shot(page, "F21.1 lista de espera com nascimento no futuro");
    if (row2[0]?.birth_date === "2031-01-01") finding({ severity: "Baixo", title: "Lista de espera aceita data de nascimento no futuro", detail: "2031-01-01" });
    await fill({ whatsapp: "41999990000", birthDate: "1990-05-10", targetExam: "PCPR — Investigador 🚔" });
    const row3 = await query<{ target_exam: string }>("select target_exam from waitlist where student_id=$1", [s.student.id]);
    expect.soft(row3[0]?.target_exam, "a correção da inscrição grava").toBe("PCPR — Investigador 🚔");
    await reload(page);
    const kept = await form.locator('[name="whatsapp"]').inputValue().catch(() => "");
    expect.soft(kept, "a inscrição volta preenchida").toBe("41999990000");
  });
});
