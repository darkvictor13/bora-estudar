/**
 * Harness de QA: estende o `test` do apps/e2e com um monitor automático.
 *
 * Toda aba do contexto grava console (error/warning), pageerror, requisição
 * que falhou e resposta >= 400. No fim do teste o log vai para out/monitor e
 * é anexado ao resultado. Achados explícitos entram por `finding()`.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

import { test as base, expect } from "/home/victor-almeida/Documentos/Repos/pessoal/bora-estudar/apps/e2e/fixtures/index.ts";

export * from "/home/victor-almeida/Documentos/Repos/pessoal/bora-estudar/apps/e2e/fixtures/index.ts";
export { query, one, maybeOne, count, asUser } from "/home/victor-almeida/Documentos/Repos/pessoal/bora-estudar/apps/e2e/fixtures/db.ts";
export { expect };

export const REPO = "/home/victor-almeida/Documentos/Repos/pessoal/bora-estudar";
export const EVIDENCE = path.join(REPO, "qa-evidencias");
const OUT = path.join(import.meta.dirname, "out");

export interface MonitorEvent {
  readonly kind: "console-error" | "console-warning" | "pageerror" | "requestfailed" | "http";
  readonly url: string;
  readonly text: string;
  readonly at: string;
}

const NOISE = [/ERR_NETWORK_CHANGED/, /Download the React DevTools/i, /\[vite\]/i, /tecconcursos/i];

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .toLowerCase();
}

export function watch(page: Page, events: MonitorEvent[]): void {
  const push = (kind: MonitorEvent["kind"], text: string, url = page.url()) => {
    if (NOISE.some((pattern) => pattern.test(text) || pattern.test(url))) return;
    events.push({ kind, url, text: text.slice(0, 2000), at: new Date().toISOString() });
  };
  page.on("console", (message) => {
    if (message.type() === "error") push("console-error", message.text());
    else if (message.type() === "warning") push("console-warning", message.text());
  });
  page.on("pageerror", (error) => push("pageerror", `${error.name}: ${error.message}\n${error.stack ?? ""}`));
  page.on("requestfailed", (request) => {
    push("requestfailed", `${request.method()} ${request.url()} → ${request.failure()?.errorText}`, request.url());
  });
  page.on("response", async (response) => {
    if (response.status() < 400) return;
    let body = "";
    try {
      body = (await response.text()).slice(0, 600);
    } catch {
      body = "<sem corpo>";
    }
    push(
      "http",
      `${response.request().method()} ${response.status()} ${response.url()} :: ${body}`,
      response.url(),
    );
  });
}

export interface Finding {
  readonly flow: string;
  readonly severity: "Crítico" | "Alto" | "Médio" | "Baixo" | "UX";
  readonly title: string;
  readonly detail: string;
}

interface QaFixtures {
  readonly monitor: MonitorEvent[];
  readonly finding: (f: Omit<Finding, "flow"> & { flow?: string }) => void;
  readonly shot: (page: Page, name: string) => Promise<string>;
}

export const test = base.extend<QaFixtures>({
  monitor: [
    async ({ context }, use, testInfo) => {
      const events: MonitorEvent[] = [];
      for (const page of context.pages()) watch(page, events);
      context.on("page", (page) => watch(page, events));
      await use(events);
      fs.mkdirSync(path.join(OUT, "monitor"), { recursive: true });
      const file = path.join(OUT, "monitor", `${testInfo.project.name}--${slug(testInfo.title)}.json`);
      fs.writeFileSync(file, JSON.stringify(events, null, 2));
      if (events.length) {
        await testInfo.attach("monitor", { body: JSON.stringify(events, null, 2), contentType: "application/json" });
      }
    },
    { auto: true },
  ],

  finding: async ({}, use, testInfo) => {
    const found: Finding[] = [];
    await use((f) => {
      found.push({ flow: f.flow ?? testInfo.title.split(" ")[0] ?? "?", ...f } as Finding);
    });
    fs.mkdirSync(path.join(OUT, "findings"), { recursive: true });
    const file = path.join(OUT, "findings", `${testInfo.project.name}--${slug(testInfo.title)}.json`);
    if (found.length) fs.writeFileSync(file, JSON.stringify(found, null, 2));
    else fs.rmSync(file, { force: true });
  },

  shot: async ({}, use, testInfo: TestInfo) => {
    await use(async (page, name) => {
      fs.mkdirSync(EVIDENCE, { recursive: true });
      const file = path.join(EVIDENCE, `${slug(name)}--${testInfo.project.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      return file;
    });
  },
});

/** Espera a SPA assentar: rede quieta e sem overlay de carregamento. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Navegação resiliente ao ruído da máquina (ver QA_REPORT: ambiente).
 *
 * Um processo de outro projeto conecta/desconecta uma rede docker a cada ~4 s
 * e o Chromium aborta tudo em voo com ERR_NETWORK_CHANGED. No Vite de dev uma
 * carga completa baixa centenas de módulos, e quase toda carga é interrompida.
 *
 * Então: se o app já está montado, navega POR DENTRO do router (pushState +
 * popstate) — os loaders e as guardas rodam igual, sem baixar módulo nenhum.
 * Senão, carga completa com até 6 tentativas.
 */
export async function appMounted(page: Page): Promise<boolean> {
  return page
    .locator('[data-testid="sidebar"], [data-testid="auth-card"], h1')
    .first()
    .isVisible()
    .catch(() => false);
}

export async function go(page: Page, url: string, opts: { hard?: boolean } = {}): Promise<void> {
  if (!opts.hard && page.url().startsWith("http://localhost:3000") && (await appMounted(page))) {
    await page.evaluate((target) => {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }, url);
    await settle(page);
    await page.waitForTimeout(300);
    if (await appMounted(page)) return;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt === 0) await page.goto(url).catch(() => {});
    else await page.reload().catch(() => {});
    await settle(page);
    if (await appMounted(page)) return;
    await page.waitForTimeout(1500);
  }
}

/** F5 de verdade (carga completa), com nova tentativa se a página assentar em branco. */
export async function reload(page: Page): Promise<void> {
  await go(page, page.url(), { hard: true });
}
