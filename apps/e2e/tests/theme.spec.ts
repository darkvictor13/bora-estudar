/**
 * §8 do `docs/fluxos-e2e.md` — tema claro e escuro.
 *
 * Implementa F-TEMA-01 a F-TEMA-08, os critérios CA-01 a CA-08 da spec
 * `docs/specs/11-tema-claro-escuro.md`. Os critérios de banco — RLS, grant por
 * coluna, enum — são provados sem navegador em `supabase/tests/06_preferences.sql`.
 */
import type { Page } from "@playwright/test";

import { expect, test, authenticate } from "../fixtures/index.ts";
import { createUser, deleteUser, type Person } from "../fixtures/scenario.ts";
import { maybeOne } from "../fixtures/db.ts";
import { collect, contrast, describe, isLarge, type Spec } from "../support/contrast.ts";

/** O botão do tema. `type="button"`, então nunca colide com o "Sair". */
const toggle = (page: Page) => page.locator(".sidebar__theme button");

const html = (page: Page) => page.locator("html");

async function storedTheme(profileId: string): Promise<string | null> {
  const row = await maybeOne<{ theme: string }>(
    "select theme::text from public.user_preferences where profile_id = $1",
    [profileId],
  );
  return row?.theme ?? null;
}

async function localCopy(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => {
    const active = localStorage.getItem("bora.theme.active");
    return { active, theme: active ? localStorage.getItem(`bora.theme.${active}`) : null };
  });
}

test.describe("F-TEMA-01 · escolher o tema", () => {
  test("aplica na hora, grava na conta e sobrevive ao recarregar", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();

    // Quem nunca escolheu não tem linha, e a ausência equivale a claro.
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    expect(await storedTheme(scenario.student.id)).toBeNull();

    await toggle(studentPage).click();

    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(toggle(studentPage)).toHaveText("Tema claro");
    await expect.poll(() => storedTheme(scenario.student.id)).toBe("dark");
    expect(await localCopy(studentPage)).toEqual({
      active: scenario.student.id,
      theme: "dark",
    });

    await studentPage.reload();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(toggle(studentPage)).toHaveText("Tema claro");
  });

  test("voltar para o claro grava de novo, sem criar uma segunda linha", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect.poll(() => storedTheme(scenario.student.id)).toBe("dark");

    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    await expect.poll(() => storedTheme(scenario.student.id)).toBe("light");
  });
});

test.describe("F-TEMA-02 · a escolha é da conta", () => {
  test("aparece em outro navegador, que não tem cópia local", async ({
    studentPage,
    scenario,
    browser,
    baseURL,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect.poll(() => storedTheme(scenario.student.id)).toBe("dark");

    // Contexto criado à mão de propósito: é um aparelho NOVO, sem
    // `localStorage`, então o único caminho possível para o escuro é a conta.
    // Não herda `baseURL` do projeto — por isso a URL absoluta.
    const fresh = await browser.newContext();
    try {
      await authenticate(fresh, scenario.student, baseURL!);
      const page = await fresh.newPage();
      await page.goto(`${baseURL}/aluno`);

      await expect(page.locator("h1")).toBeVisible();
      await expect(html(page)).toHaveAttribute("data-theme", "dark");
    } finally {
      await fresh.close();
    }
  });
});

test.describe("F-TEMA-03 · sem piscada", () => {
  test("o documento já está escuro antes de a rota renderizar", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");

    // Espera a gravação ANTES de recarregar, e não por capricho: a conta é a
    // fonte da verdade (R-TEMA-11), então recarregar antes de o dark subir faz
    // o loader devolver o valor antigo e desfazer a escolha — comportamento
    // correto, que aqui seria lido como piscada.
    await expect.poll(() => storedTheme(scenario.student.id)).toBe("dark");

    // Segura a resposta do perfil: sem ela o loader não resolve e nenhuma tela
    // renderiza. É exatamente a janela em que a piscada aconteceria — se o tema
    // dependesse do loader, aqui o documento ainda estaria claro.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await studentPage.route(/\/rest\/v1\/profiles/, async (route) => {
      await held;
      await route.continue();
    });

    await studentPage.goto("/aluno", { waitUntil: "commit" });

    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    expect(await studentPage.locator("h1").count()).toBe(0);

    release();
    await expect(studentPage.locator("h1")).toBeVisible();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("F-TEMA-04 · a gravação falha", () => {
  test("troca na tela, avisa que não salvou, e não inventa linha no banco", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();

    await studentPage.route(/\/rest\/v1\/user_preferences/, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "indisponivel" }),
      }),
    );

    await toggle(studentPage).click();

    // A escolha vale neste aparelho, e a pessoa sabe que ela não subiu.
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(studentPage.locator(".sidebar__note")).toContainText(
      "Não foi possível salvar na sua conta",
    );
    expect(await storedTheme(scenario.student.id)).toBeNull();
  });
});

test.describe("F-TEMA-05 · sair", () => {
  test("apaga a cópia local, volta ao claro, e o próximo não herda", async ({
    studentPage,
    scenario,
    signIn,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");

    // O único submit da sidebar é o "Sair": o controle de tema é `type=button`.
    await studentPage.locator(".sidebar form button[type=submit]").click();

    await expect(studentPage).toHaveURL(/\/entrar$/);
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    expect(await localCopy(studentPage)).toEqual({ active: null, theme: null });

    // Outra pessoa, no mesmo navegador, não herda o tema de quem saiu.
    await signIn(scenario.teacher);
    await studentPage.goto("/professor");
    await expect(studentPage.locator("h1")).toBeVisible();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
  });
});

test.describe("F-TEMA-06 · os três papéis", () => {
  test("professor escolhe o tema e a escolha persiste", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor");
    await expect(teacherPage.locator("h1")).toBeVisible();

    await toggle(teacherPage).click();
    await expect(html(teacherPage)).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => storedTheme(scenario.teacher.id)).toBe("dark");

    await teacherPage.reload();
    await expect(html(teacherPage)).toHaveAttribute("data-theme", "dark");
  });

  test("admin também", async ({ page, signIn, baseURL }) => {
    let admin: Person | null = null;
    try {
      admin = await createUser("admin", "Admin do tema");
      await signIn(admin);
      await page.goto(`${baseURL}/professor`);
      await expect(page.locator("h1")).toBeVisible();

      await toggle(page).click();
      await expect(html(page)).toHaveAttribute("data-theme", "dark");
      await expect.poll(() => storedTheme(admin!.id)).toBe("dark");
    } finally {
      if (admin) await deleteUser(admin.id);
    }
  });
});

/**
 * O que este teste segura: `R-TEMA-15` promete AA nos dois temas, e promessa de
 * contraste conferida no olho regride sem ninguém notar. Os pares saem de
 * `getComputedStyle` na página de verdade, com fundo resolvido e `opacity`
 * considerada — ver `support/contrast.ts`.
 */
const TEXT: readonly Spec[] = [
  "h1",
  "h2",
  "h3",
  "p",
  "a",
  "td",
  "th",
  ".muted",
  ".card__sub",
  ".badge",
  ".alert",
  ".empty",
  ".field__label",
  ".field__hint",
  ".btn",
  ".sidebar__link",
  ".sidebar__title",
  ".sidebar__user",
  ".sidebar__brand",
].map((selector) => ({ selector, kind: "text" }) as const);

/**
 * Só limite de CONTROLE — campo e botão com borda visível.
 *
 * Borda de cartão fica de fora de propósito: cartão não é componente de
 * interface na acepção da 1.4.11, e o tema claro nunca teve 3:1 ali. Incluí-lo
 * reprovaria o design que já está no ar por uma regra que ele não precisa
 * cumprir.
 */
const BORDERS: readonly Spec[] = [
  ".field input",
  ".field select",
  ".field textarea",
  ".btn--ghost",
  ".btn--danger",
].map((selector) => ({ selector, kind: "border" }) as const);

async function assertAA(page: Page, where: string): Promise<void> {
  const { text, borders } = await collect(page, [...TEXT, ...BORDERS]);

  expect(text.length, `${where}: nenhum texto medido — o seletor não casou nada`).toBeGreaterThan(0);

  const fracos = text
    .map((sample) => ({ sample, ratio: contrast(sample.color, sample.background) }))
    .filter(({ sample, ratio }) => ratio < (isLarge(sample) ? 3 : 4.5))
    .map(({ sample, ratio }) => describe(sample, ratio));

  expect(fracos, `${where}: texto abaixo de AA`).toEqual([]);

  const limites = borders
    .map((sample) => ({ sample, ratio: contrast(sample.border, sample.background) }))
    .filter(({ ratio }) => ratio < 3)
    .map(({ sample, ratio }) => describe(sample, ratio));

  expect(limites, `${where}: limite de controle abaixo de 3:1`).toEqual([]);
}

test.describe("F-TEMA-07 · contraste AA nos dois temas", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`telas do aluno, tema ${theme}`, async ({ studentPage }) => {
      await studentPage.goto("/aluno");
      await expect(studentPage.locator("h1")).toBeVisible();
      if (theme === "dark") {
        await toggle(studentPage).click();
        await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
      }

      for (const route of ["/aluno", "/aluno/estatisticas", "/aluno/revisoes", "/aluno/conta"]) {
        await studentPage.goto(route);
        await expect(studentPage.locator("h1")).toBeVisible();
        await assertAA(studentPage, `${route} (${theme})`);
      }
    });

    test(`telas do professor, tema ${theme}`, async ({ teacherPage }) => {
      await teacherPage.goto("/professor");
      await expect(teacherPage.locator("h1")).toBeVisible();
      if (theme === "dark") {
        await toggle(teacherPage).click();
        await expect(html(teacherPage)).toHaveAttribute("data-theme", "dark");
      }

      for (const route of ["/professor", "/professor/planejamentos", "/professor/estatisticas"]) {
        await teacherPage.goto(route);
        await expect(teacherPage.locator("h1")).toBeVisible();
        await assertAA(teacherPage, `${route} (${theme})`);
      }
    });
  }
});

test.describe("F-TEMA-08 · sem escolha", () => {
  test("abre claro mesmo com o sistema no escuro", async ({ studentPage, scenario }) => {
    // Não existe "seguir o sistema": `prefers-color-scheme` não é lido em lugar
    // nenhum do site (R-TEMA-06).
    await studentPage.emulateMedia({ colorScheme: "dark" });

    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();

    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    await expect(toggle(studentPage)).toHaveText("Tema escuro");
    expect(await storedTheme(scenario.student.id)).toBeNull();
  });
});
