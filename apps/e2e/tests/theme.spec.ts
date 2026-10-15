/**
 * §8 do `docs/fluxos-e2e.md` — tema claro e escuro.
 *
 * Implementa F-TEMA-01 a F-TEMA-08, os critérios CA-01 a CA-08 da spec
 * `docs/specs/11-tema-claro-escuro.md`, e F-TEMA-09, que existe por causa de
 * um defeito: falha de rede ao verificar a sessão apagava o tema.
 *
 * ## A CONTA É A FONTE DA VERDADE
 *
 * A preferência mora em `profiles.theme_preference` (migration
 * `20261015145000`). Durante um mês — de 14/09/2026, quando `user_preferences`
 * saiu, até aquela migration — a escolha valeu só por aparelho, e F-TEMA-02 e
 * F-TEMA-04 ficaram em `fixme` para a falta continuar visível. Hoje os dois
 * rodam: a escolha atravessa para outro aparelho sem `localStorage`, e a
 * gravação que falha avisa em vez de calar.
 */
import type { Page } from "@playwright/test";

import { expect, test, authenticate } from "../fixtures/index.ts";
import { one } from "../fixtures/db.ts";
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
 * O tema que este APARELHO guardou para um perfil: a cópia local, que é a que
 * o script anti-flash de `index.html` lê. A CONTA é outra coisa — `savedTheme`.
 */
async function storedTheme(page: Page, profileId: string): Promise<string | null> {
  return page.evaluate((id) => localStorage.getItem(`bora.theme.${id}`), profileId);
}

/**
 * O tema que a CONTA guardou (`profiles.theme_preference`). Os testes que
 * recarregam a página ou abrem outro aparelho esperam por ele antes: a gravação
 * é assíncrona, e recarregar antes de ela descer faz o loader devolver o valor
 * antigo — a janela que a spec 11 descreve, e que aqui seria lida como defeito.
 */
async function savedTheme(profileId: string): Promise<string | null> {
  return (await one<{ theme_preference: string | null }>(
    "select theme_preference::text from public.profiles where id = $1",
    [profileId],
  )).theme_preference;
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
    await expect(toggle(studentPage)).toHaveAccessibleName("Tema claro");
    expect(await localCopy(studentPage)).toEqual({
      active: scenario.student.id,
      theme: "dark",
    });

    // A conta, e não só o aparelho: é ela que o loader consulta ao recarregar.
    await expect.poll(() => savedTheme(scenario.student.id)).toBe("dark");

    await studentPage.reload();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    await expect(toggle(studentPage)).toHaveAccessibleName("Tema claro");
  });

  test("voltar para o claro grava de novo, sem deixar resíduo", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await toggle(studentPage).click();
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("dark");
    await expect.poll(() => savedTheme(scenario.student.id)).toBe("dark");

    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("light");
    // Escolher claro depois de escuro É uma escolha: grava `light`, e não volta a nulo.
    await expect.poll(() => savedTheme(scenario.student.id)).toBe("light");
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
    await expect.poll(() => storedTheme(studentPage, scenario.student.id)).toBe("dark");
    // O aparelho novo só pode ficar escuro se o escuro estiver NA CONTA.
    await expect.poll(() => savedTheme(scenario.student.id)).toBe("dark");

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
    await expect.poll(() => savedTheme(scenario.student.id)).toBe("dark");

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
  test("troca na tela, avisa que não salvou, e não grava nada na conta", async ({
    studentPage,
    scenario,
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

    // A gravação foi derrubada, então a conta continua em "nunca escolheu".
    expect(await savedTheme(scenario.student.id)).toBeNull();
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
    await expect(toggle(studentPage)).toHaveAccessibleName("Tema escuro");
    expect(await storedTheme(studentPage, scenario.student.id)).toBeNull();
  });
});

test.describe("F-TEMA-09 · a sessão que não pôde ser verificada", () => {
  test("uma falha de rede ao verificar não apaga a escolha nem desloga", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();
    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");

    // Era o "Lançar tempo": um link que recarrega a página, e UMA requisição de
    // verificação perdida na recarga. A falha virava "sessão expirada", o tema
    // era apagado, e a pessoa voltava logada — mas no claro.
    let failures = 1;
    await studentPage.route(/\/auth\/v1\/user/, (route) =>
      failures-- > 0 ? route.abort("internetdisconnected") : route.continue(),
    );

    await studentPage.reload();
    await expect(studentPage.getByText("Sem conexão")).toBeVisible();
    await expect(studentPage).toHaveURL(/\/aluno/);
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
    expect(await storedTheme(studentPage, scenario.student.id)).toBe("dark");

    await studentPage.reload();
    await expect(studentPage.locator("h1")).toBeVisible();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");
  });

  test("a sessão que o servidor RECUSA continua deslogando e apagando", async ({
    studentPage,
    scenario,
  }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();
    await toggle(studentPage).click();
    await expect(html(studentPage)).toHaveAttribute("data-theme", "dark");

    // O outro lado da correção: token inválido é deslogado de fato, e aí o tema
    // some como manda R-TEMA-13 e R-TEMA-14.
    await studentPage.route(/\/auth\/v1\/user/, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }),
      }),
    );

    await studentPage.reload();
    await expect(studentPage).toHaveURL(/\/entrar/);
    await expect(html(studentPage)).toHaveAttribute("data-theme", "light");
    expect(await storedTheme(studentPage, scenario.student.id)).toBeNull();
  });
});

test.describe("F-TEMA-10 · telas sem sessão", () => {
  // O app tem dois temas, e a tela de entrada é parte dele: segue o `data-theme`
  // do documento (claro, sem sessão — R-TEMA-14), sem escopo próprio, e o vidro
  // do cartão existe nos dois. O escuro é forçado no documento porque, sem
  // sessão, não há onde escolhê-lo.
  for (const theme of ["light", "dark"] as const) {
    test(`/entrar segue o tema do documento e o cartão é de vidro, tema ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" }); // R-TEMA-06: o sistema não decide
      await page.goto("/entrar");
      await expect(page.getByTestId("auth-card")).toBeVisible();
      await expect(html(page)).toHaveAttribute("data-theme", "light");
      if (theme === "dark") {
        // Trocar o atributo em execução dispara a transição de fundo do MUI, e o
        // contraste mediria um quadro do meio dela — o mesmo defeito que o
        // `body` sem `transition` evita (CLAUDE.md, "Tema").
        await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
        await page.evaluate(() => { document.documentElement.dataset["theme"] = "dark"; });
      }

      await expect(page.getByTestId("auth-overlay")).not.toHaveAttribute("data-theme", /.+/);
      const glass = await page.getByTestId("auth-card").evaluate((element) => {
        const style = getComputedStyle(element);
        return { filter: style.backdropFilter, background: style.backgroundColor };
      });
      expect(glass.filter, `vidro sem desfoque (${theme})`).toContain("blur");
      const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(glass.background)?.[1] ?? 1);
      expect(alpha, `o cartão é opaco (${theme}): ${glass.background}`).toBeLessThan(1);

      await assertAA(page, `/entrar (${theme})`);
    });
  }
});
