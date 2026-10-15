/**
 * Níveis Médio/Baixo — fluxos 18 (estatísticas), 22 a 26.
 */
import type { Page } from "@playwright/test";

import { expect, go, reload, test } from "../qa.ts";

const SEED_STUDENT = { id: "", email: "aluno@local.dev", password: "SenhaLocal#2026", name: "" };
const SEED_TEACHER = { id: "", email: "professor@local.dev", password: "SenhaLocal#2026", name: "" };

async function crashed(page: Page) {
  return (await page.locator("h1").allTextContents()).some((h) => /Algo deu errado/.test(h));
}

test.describe("F18 · estatísticas", () => {
  test("F18.1 cada opção de cada filtro, aluno e professor do seed", async ({ page, signIn, monitor, shot, finding }) => {
    for (const [who, route] of [[SEED_STUDENT, "/aluno/estatisticas"], [SEED_STUDENT, "/aluno/flashcards/estatisticas"], [SEED_TEACHER, "/professor/estatisticas"]] as const) {
      await signIn(who);
      await go(page, route, { hard: true });
      const combos = page.locator("main").getByRole("combobox");
      for (let i = 0; i < 6; i++) {
        if (i >= (await combos.count())) break;
        await combos.nth(i).click({ timeout: 5000 }).catch(() => {});
        const count = await page.getByRole("option").count();
        await page.keyboard.press("Escape");
        for (let j = 0; j < Math.min(count, 8); j++) {
          if (i >= (await combos.count())) break;
          await combos.nth(i).click({ timeout: 5000 }).catch(() => {});
          const option = page.getByRole("option").nth(j);
          if (!(await option.count())) { await page.keyboard.press("Escape"); break; }
          const label = await option.textContent();
          const errorsBefore = monitor.filter((e) => e.kind === "pageerror").length;
          await option.click();
          await page.waitForTimeout(900);
          if (await crashed(page)) {
            await shot(page, `F18.1 ${route} filtro ${label}`);
            finding({ severity: "Médio", title: `${route}: filtro "${label}" derruba a tela`, detail: ((await page.locator("main").textContent()) ?? "").slice(0, 160) });
            await go(page, route, { hard: true });
            break;
          }
          const text = (await page.locator("main").textContent()) ?? "";
          if (/NaN|undefined|Infinity/.test(text)) finding({ severity: "Médio", title: `${route}: filtro "${label}" mostra NaN/undefined`, detail: text.match(/.{0,40}(NaN|undefined|Infinity).{0,40}/)?.[0] ?? "" });
          if (monitor.filter((e) => e.kind === "pageerror").length > errorsBefore) {
            finding({ severity: "Baixo", title: `${route}: filtro "${label}" lança exceção JS`, detail: monitor.filter((e) => e.kind === "pageerror").at(-1)!.text.slice(0, 200) });
          }
        }
      }
    }
  });

  test("F18.2 aluno sem nenhum registro: estatísticas dizem isso", async ({ studentPage: page, shot, finding }) => {
    for (const route of ["/aluno/estatisticas", "/aluno/flashcards/estatisticas", "/aluno/simulados"]) {
      await go(page, route);
      const text = (await page.locator("main").textContent()) ?? "";
      if (/NaN|undefined|Infinity|null/.test(text)) {
        await shot(page, `F18.2 ${route} vazio`);
        finding({ severity: "Médio", title: `${route} sem dados mostra NaN/undefined`, detail: text.match(/.{0,40}(NaN|undefined|Infinity|null).{0,40}/)?.[0] ?? "" });
      }
    }
  });
});

test.describe("F24 · cronômetro e sequência", () => {
  test("F24.1 cronômetro: conta, sobrevive à navegação e ao F5, zera; tela cheia fecha para a semana", async ({ studentPage: page, shot, finding }) => {
    await go(page, "/aluno");
    const clock = page.getByRole("region", { name: "Ferramenta de estudo" });
    await clock.getByRole("button", { name: "Iniciar cronômetro" }).click();
    await page.waitForTimeout(2600);
    const t1 = (await clock.textContent())?.match(/\d\d:\d\d:\d\d/)?.[0];
    expect.soft(t1, "contou").not.toBe("00:00:00");
    await page.locator('[data-testid="sidebar"]').getByRole("link", { name: "Aulas" }).click();
    await page.waitForTimeout(1500);
    const t2 = (await page.getByRole("region", { name: "Ferramenta de estudo" }).textContent())?.match(/\d\d:\d\d:\d\d/)?.[0];
    if (!t2 || t2 <= (t1 ?? "")) finding({ severity: "Médio", title: "Cronômetro para ou zera ao navegar entre telas", detail: `${t1} → ${t2}` });
    await reload(page);
    await page.waitForTimeout(1200);
    const t3 = (await page.getByRole("region", { name: "Ferramenta de estudo" }).textContent())?.match(/\d\d:\d\d:\d\d/)?.[0];
    if (!t3 || t3 === "00:00:00") finding({ severity: "Médio", title: "Cronômetro zera ao recarregar a página (F5)", detail: `${t2} → ${t3}` });
    await go(page, "/aluno/cronometro");
    await shot(page, "F24.1 cronometro em tela cheia");
    const close = page.getByRole("button", { name: /Fechar|Sair da tela cheia|Voltar/ }).first();
    if (await close.count()) {
      await close.click();
      await expect.soft(page).toHaveURL(/\/aluno$/);
    } else finding({ severity: "UX", title: "Tela cheia do cronômetro sem botão de fechar acessível por nome", detail: "" });
  });

  test("F24.2 calendário de constância abre e fecha", async ({ page, signIn, shot }) => {
    await signIn(SEED_STUDENT);
    await go(page, "/aluno");
    await page.getByRole("button", { name: /SEQUÊNCIA/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await shot(page, "F24.2 calendario de constancia");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("F23 · tema", () => {
  test("F23.1 escuro persiste no F5; o próximo usuário do aparelho abre claro", async ({ page, scenario, signIn }) => {
    await signIn(scenario.student);
    await go(page, "/aluno/conta");
    await page.locator('[data-testid="theme-toggle"] button').click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await reload(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator('[data-testid="sign-out"]').click();
    await expect(page).toHaveURL(/\/entrar$/);
    await signIn(scenario.teacher);
    await go(page, "/professor", { hard: true });
    await expect.soft(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  });
});

test.describe("F25 · rotas legadas e inexistentes", () => {
  test("F25.2 /aluno/cronograma preserva a query; caminho inexistente logado mostra 404 com saída", async ({ studentPage: page, finding }) => {
    await go(page, "/aluno/cronograma?semana=1&dia=todos");
    await expect.soft(page).toHaveURL(/\/aluno\?semana=1&dia=todos$/);
    for (const route of ["/aluno/nao-existe", "/professor/nao-existe", "/xpto/123"]) {
      await go(page, route);
      const h1 = await page.locator("h1").allTextContents();
      expect.soft(h1, route).toContain("Página não encontrada");
      const sidebar = await page.locator('[data-testid="sidebar"]').count();
      if (route.startsWith("/aluno") && !sidebar) finding({ severity: "UX", title: "404 dentro da área do aluno perde a barra lateral", detail: "a pessoa só tem o link 'Ir para o início'" });
    }
  });
});

test.describe("F26 · celular 375px", () => {
  test("F26.1 elementos que não cabem: chip do cronômetro e select do catálogo", async ({ page, signIn, shot, finding }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "só no celular");
    await signIn(SEED_STUDENT);
    await go(page, "/aluno", { hard: true });
    const chip = await page.getByRole("button", { name: "Modos e tempo do cronômetro" }).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    if (chip.scroll > chip.client + 1) {
      await shot(page, "F26.1 chip do cronometro cortado");
      finding({ severity: "Baixo", title: "Chip 'Livre' do cronômetro não cabe em 375px (texto vaza)", detail: JSON.stringify(chip) });
    }
    await signIn(SEED_TEACHER);
    await go(page, "/professor/teoria", { hard: true });
    const box = await page.getByRole("combobox", { name: /Catálogo/ }).evaluate((el) => {
      const r = (el.closest(".MuiFormControl-root") ?? el).getBoundingClientRect();
      return { right: Math.round(r.right), viewport: window.innerWidth };
    });
    if (box.right > box.viewport - 8) {
      await shot(page, "F26.1 select do catalogo cortado");
      finding({ severity: "Baixo", title: "Select de catálogo encosta/passa da borda direita em 375px", detail: JSON.stringify(box) });
    }
  });
});
