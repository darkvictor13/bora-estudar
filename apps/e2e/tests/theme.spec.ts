/**
 * §8 do `docs/fluxos-e2e.md` — tema claro e escuro.
 *
 * Implementa F-TEMA-01 a F-TEMA-08, os critérios CA-01 a CA-08 da spec
 * `docs/specs/11-tema-claro-escuro.md`.
 *
 * ## O TEMA PERDEU A CONTA NO SCHEMA DE 14/09/2026
 *
 * `user_preferences` saiu e nada a substituiu: `profiles` não tem coluna de
 * preferência, e `supabase/tests/06_preferences.sql` não tem mais tabela para
 * provar. É a lacuna nº 1 de `apps/web/src/lib/api/contract.ts`, e o pedido à
 * frente do banco é pequeno — uma coluna `theme_preference` em `profiles`.
 *
 * Enquanto ela não existe, a escolha vale por APARELHO. O que continua
 * verdadeiro, e continua testado aqui: a troca aplica na hora, sobrevive ao
 * recarregar, não pisca, e some quando a pessoa sai. O que está suspenso, e
 * está marcado `fixme` em vez de apagado: a escolha atravessar para outro
 * aparelho (F-TEMA-02, R-TEMA-11) e o aviso de gravação que falhou
 * (F-TEMA-04, R-TEMA-12) — não há gravação remota para falhar.
 */
import type { Page } from "@playwright/test";

import { expect, test, authenticate } from "../fixtures/index.ts";
import { collect, contrast, describe, isLarge, type Spec } from "../support/contrast.ts";
import { signOut, themeToggle } from "../support/ui.ts";

/**
 * Cenário SEM planejamento — mesmo motivo de `auth.spec.ts`.
 *
 * O tema não depende de meta nenhuma: o que ele exige é uma sessão e uma tela
 * com a casca em volta. Planejamento, blocos e metas dependem de colunas e de
 * uma RPC que o schema de 14/09 reescreveu, e voltam na Fase 3.
 */
test.use({ scenarioOptions: { withPlan: false } });

/** O botão do tema. `type="button"`, então nunca colide com o "Sair". */
const toggle = (page: Page) => themeToggle(page);

const html = (page: Page) => page.locator("html");

/**
 * O tema que este APARELHO guardou para um perfil.
 *
 * Era uma consulta a `user_preferences`. Enquanto a coluna não existe, a
 * cópia local é a única, e é ela que o script anti-flash de `index.html` lê.
 */
async function storedTheme(page: Page, profileId: string): Promise<string | null> {
  return page.evaluate((id) => localStorage.getItem(`bora.theme.${id}`), profileId);
}

async function localCopy(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => {
    const active = localStorage.getItem("bora.theme.active");
    return { active, theme: active ? localStorage.getItem(`bora.theme.${active}`) : null };
  });
}

test.describe("F-TEMA-01 · escolher o tema", () => {
  test("aplica na hora, fica guardado e sobrevive ao recarregar", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();

    // Quem nunca escolheu não tem nada guardado, e a ausência equivale a claro.
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    expect(await storedTheme(studentPage, scenario.student.id)).toBeNull();

    await toggle(studentPage).click();

    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(toggle(studentPage)).toHaveText("Tema claro");
    expect(await localCopy(studentPage)).toEqual({
      active: scenario.student.id,
      theme: "dark",
    });

    await studentPage.reload();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(toggle(studentPage)).toHaveText("Tema claro");
  });

  test("voltar para o claro grava de novo, sem deixar resíduo", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("dark");

    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("light");
  });
});

test.describe("F-TEMA-02 · a escolha é da conta", () => {
  /*
   * SUSPENSO ATÉ A COLUNA EXISTIR — ver o cabeçalho deste arquivo.
   *
   * Este é o teste que define o que "a escolha é da conta" significa: um
   * aparelho sem `localStorage` só pode ficar escuro se o escuro tiver vindo do
   * servidor. Sem `theme_preference` em `profiles`, não vem — e o teste falha
   * dizendo a verdade. Fica `fixme` para que a verdade continue visível na
   * saída da suíte em vez de sumir num arquivo apagado.
   */
  test.fixme("aparece em outro navegador, que não tem cópia local", async ({
    studentPage,
    scenario,
    browser,
    baseURL,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("dark");

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

    // Espera a gravação ANTES de recarregar, e não por capricho: recarregar
    // antes de o dark descer faz o loader devolver o valor antigo e desfazer a
    // escolha — comportamento correto, que aqui seria lido como piscada.
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("dark");

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
  /*
   * SUSPENSO PELO MESMO MOTIVO DE F-TEMA-02.
   *
   * Não há gravação remota para derrubar: `saveThemePreference` escreve no
   * aparelho e devolve sucesso. Interceptar rota nenhuma produziria o aviso, e
   * um teste que passa sem exercitar nada é pior do que um `fixme`.
   */
  test.fixme("troca na tela, avisa que não salvou, e não inventa linha no banco", async ({
    studentPage,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();

    await studentPage.route(/\/rest\/v1\/profiles/, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "indisponivel" }),
      }),
    );

    await toggle(studentPage).click();

    // A escolha vale neste aparelho, e a pessoa sabe que ela não subiu.
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(studentPage.locator('[data-testid="theme-unsaved"]')).toContainText(
      "Não foi possível salvar na sua conta",
    );
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
    await signOut(studentPage).click();

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

test.describe("F-TEMA-06 · os dois papéis", () => {
  /*
   * Eram três. `user_role` no schema de 14/09 é `('teacher','student')`, e o
   * teste do admin saiu com o papel — não por falta de cobertura.
   */
  test("professor escolhe o tema e a escolha persiste", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor");
    await expect(teacherPage.locator("h1")).toBeVisible();

    await toggle(teacherPage).click();
    await expect(html(teacherPage)).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => storedTheme(teacherPage, scenario.teacher.id)).toBe("dark");

    await teacherPage.reload();
    await expect(html(teacherPage)).toHaveAttribute("data-theme", "dark");
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
    expect(await storedTheme(studentPage, scenario.student.id)).toBeNull();
  });
});
