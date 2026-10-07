/**
 * §2 do `docs/fluxos-e2e.md` — a casca: barra lateral, navegação e identidade.
 *
 * Nasceu na Fase 2, quando `AppShell` substituiu a sidebar de `globals.css`.
 * F-UI-01, F-UI-02 e F-UI-03 moraram em `student.spec.ts` enquanto a casca era
 * da área do aluno; ela é das duas áreas, e o arquivo acompanha.
 *
 * Todo seletor aqui é `data-testid`. A classe do Emotion muda quando o Emotion
 * decide, e `.sidebar__collapse` sumiu junto com o CSS que a definia.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/index.ts";
import { query } from "../fixtures/db.ts";
import { addTheoryCatalog, type Scenario } from "../fixtures/scenario.ts";
import { collect, contrast, describe as describeSample } from "../support/contrast.ts";
import { PAGE_TITLES, STUDENT_ROUTES, TEACHER_ROUTES, studentPageOf } from "../support/routes.ts";
import {
  activeNavItem,
  content,
  navItem,
  sidebar,
  sidebarToggle,
  signOut,
  testId,
  userChip,
} from "../support/ui.ts";

// A casca não precisa de planejamento: ela desenha a moldura, não o conteúdo.
test.use({ scenarioOptions: { withPlan: false } });

test.describe("F-UI-01 · recolher a barra lateral", () => {
  test("o botão recolhe e expande, e o conteúdo ganha a largura", async ({ studentPage }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();

    const aberto = (await content(studentPage).boundingBox())!;
    await expect(navItem(studentPage, "Disciplinas")).toBeVisible();

    await sidebarToggle(studentPage).click();

    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "true");
    // Recolhida, o item continua no DOM e continua clicável — o que some é o
    // RÓTULO. Um menu que desaparece inteiro não é um menu recolhido.
    await expect(testId(studentPage, "nav-item").first()).toBeVisible();
    await expect(studentPage.getByText("Disciplinas", { exact: true })).toBeHidden();

    const recolhido = (await content(studentPage).boundingBox())!;
    expect(recolhido.width).toBeGreaterThan(aberto.width);

    // O botão continua acessível: uma barra recolhida sem como expandir é uma
    // barra perdida.
    await expect(sidebarToggle(studentPage)).toBeVisible();
    await sidebarToggle(studentPage).click();
    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "false");
    await expect(navItem(studentPage, "Disciplinas")).toBeVisible();
  });
});

test.describe("F-UI-02 · o estado persiste", () => {
  test("sobrevive à navegação e ao recarregamento", async ({ studentPage }) => {
    await studentPage.goto("/aluno");
    await expect(studentPage.locator("h1")).toBeVisible();
    await sidebarToggle(studentPage).click();
    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "true");

    // Navegação de SPA: o layout não remonta, mas o estado tem de acompanhar.
    await studentPage.goto("/aluno/resumos-flash");
    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "true");

    await studentPage.reload();
    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "true");
  });
});

test.describe("F-UI-03 · o estado é anunciado", () => {
  test("aria-expanded acompanha, e o rótulo diz a ação", async ({ studentPage }) => {
    await studentPage.goto("/aluno");

    const botao = sidebarToggle(studentPage);
    // Aberta: `aria-expanded` é "true" e o rótulo oferece recolher.
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    await expect(botao).toHaveAttribute("aria-label", "Recolher menu");

    await botao.click();
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    await expect(botao).toHaveAttribute("aria-label", "Expandir menu");
  });
});

test.describe("F-UI-07 · a tela estreita recolhe à força", () => {
  /*
   * A regra é da v2 (`mobile-tablet.css`): abaixo de 820px a barra fica só com
   * ícones, quer a pessoa queira ou não. 220px de menu num aparelho de 700px é
   * quase um terço da largura útil.
   */
  test("abaixo de 820px não há rótulo nem botão de expandir", async ({ studentPage }) => {
    await studentPage.setViewportSize({ width: 1200, height: 900 });
    await studentPage.goto("/aluno");
    await expect(navItem(studentPage, "Disciplinas")).toBeVisible();
    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "false");

    await studentPage.setViewportSize({ width: 700, height: 900 });

    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "true");
    await expect(studentPage.getByText("Disciplinas", { exact: true })).toBeHidden();
    // Sem botão: o recolhimento é imposto, e um controle que não muda nada é
    // pior do que controle nenhum.
    await expect(sidebarToggle(studentPage)).toHaveCount(0);

    // A PREFERÊNCIA NÃO FOI APAGADA. Voltar à tela larga devolve os rótulos:
    // recolher por falta de espaço não pode desfazer a escolha de quem usa um
    // monitor grande.
    await studentPage.setViewportSize({ width: 1200, height: 900 });
    await expect(sidebar(studentPage)).toHaveAttribute("data-collapsed", "false");
    await expect(navItem(studentPage, "Disciplinas")).toBeVisible();
  });
});

test.describe("F-UI-08 · o item atual é o da rota", () => {
  test("a rota mais específica ganha, e só ela", async ({ studentPage }) => {
    await studentPage.goto("/aluno/resumos-flash");
    await expect(studentPage.locator("h1")).toBeVisible();

    // "/aluno" é prefixo de "/aluno/resumos-flash": sem casar o caminho mais longo,
    // os dois ficariam marcados e "Minha semana" mentiria em toda subpágina.
    await expect(activeNavItem(studentPage)).toHaveCount(1);
    await expect(activeNavItem(studentPage)).toContainText("Resumos Flash");
    await expect(activeNavItem(studentPage)).toHaveAttribute("aria-current", "page");
  });

  test("navegar pelo menu troca a tela e a marcação", async ({ studentPage }) => {
    await studentPage.goto("/aluno");
    await navItem(studentPage, "Meus dados").click();

    await expect(studentPage).toHaveURL(/\/aluno\/conta$/);
    await expect(activeNavItem(studentPage)).toContainText("Meus dados");

    // O TÍTULO DA TELA NÃO É VERIFICADO AQUI, e a omissão tem prazo: as telas
    // do aluno ainda falam com o schema antigo e caem no limite de erro até as
    // fases 3 a 6 as reescreverem. O que esta fase promete é a MOLDURA — que a
    // navegação leve ao endereço certo e marque o item certo —, e é isso que a
    // casca continua fazendo mesmo com o conteúdo quebrado. O nome da tela
    // volta a ser exigido em `student.spec.ts`, na fase de cada uma.
  });
});

test.describe("F-UI-09 · o rodapé identifica quem está logado", () => {
  test("o aluno vê o próprio nome, o papel e a saída", async ({ studentPage, scenario }) => {
    await studentPage.goto("/aluno");

    await expect(userChip(studentPage)).toContainText(scenario.student.name);
    await expect(userChip(studentPage)).toContainText("Aluno");
    await expect(signOut(studentPage)).toBeVisible();
  });

  test("o professor vê o papel dele, na mesma casca", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor");

    await expect(userChip(teacherPage)).toContainText(scenario.teacher.name);
    await expect(userChip(teacherPage)).toContainText("Professor");
  });
});

test.describe("F-UI-10 · sem acesso liberado, o estudo fica inerte", () => {
  test.use({ scenarioOptions: { access: "pending", withPlan: false } });

  test("os itens de estudo não navegam; os da conta, sim", async ({ studentPage }) => {
    await studentPage.goto("/aluno/conta");
    await expect(studentPage.locator("h1")).toBeVisible();

    // Sem destino, e não um link com `aria-disabled`: o link continuaria
    // navegando no clique, o loader devolveria a pessoa, e ela daria a volta
    // inteira para não sair do lugar.
    // Todos os itens de ESTUDO, e nenhum dos de conta. O número acompanha o
    // menu: cinco na Fase 2, mais "Planejamento" na 3 e "Estudo da teoria" na
    // 4. Contar assim é o que faz o teste falhar quando alguém acrescenta uma
    // tela de estudo e esquece de bloqueá-la.
    const inertes = studentPage.locator('[data-testid="nav-item"][data-enabled="false"]');
    const todos = studentPage.locator('[data-testid="nav-item"]');
    await expect(inertes).toHaveCount((await todos.count()) - 2);
    for (const item of await inertes.all()) {
      await expect(item).toBeDisabled();
      await expect(item).not.toHaveAttribute("href", /./);
    }

    await expect(navItem(studentPage, "Lista de espera")).toBeEnabled();
  });
});

/**
 * O quanto o conteúdo transborda, em px. Mede o `<main data-testid="content">`, e
 * NÃO o `documentElement`: a casca é `overflow: hidden`, o documento nunca rola
 * na horizontal, e o excesso vira rolagem DENTRO do `main` — que é por onde o
 * defeito escapava (QA-23).
 */
async function overflowOf(page: Page): Promise<number> {
  return content(page).evaluate((main) => main.scrollWidth - main.clientWidth);
}

/**
 * Nomes de verdade, que são longos. O defeito nunca foi o `minWidth` sozinho: o
 * item flex cresce com o TEXTO da opção escolhida, e "Catálogo E2E 887111a1" cabe
 * onde "PMPR Soldado 2025 — Edital 01/2025 (versão consolidada)" não cabe.
 */
async function nameThingsLikeReality(scenario: Scenario): Promise<void> {
  const long = "Polícia Militar do Paraná, Soldado 2025 — edital consolidado com retificações";
  await query("update public.study_plans set name = $2 where id = $1", [scenario.planId, `${long} (plano)`]);
  await query("update public.theory_catalogs set name = $2 where teacher_id = $1", [
    scenario.teacher.id,
    `${long} (catálogo)`,
  ]);
}

test.describe("F-UI-11 · nenhuma tela passa de 375px (QA-23)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    // A casca de cima pede cenário sem planejamento; aqui as telas têm de ter o
    // que mostrar: cartões, selects, linhas de meta.
    scenarioOptions: {},
  });

  test.describe("aluno", () => {
    for (const route of STUDENT_ROUTES) {
      test(`${route} cabe`, async ({ studentPage, scenario }) => {
        await nameThingsLikeReality(scenario);
        await studentPage.goto(route);
        await expect(studentPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);

        expect(await overflowOf(studentPage)).toBeLessThanOrEqual(0);
      });
    }

    test("o botão de modo do cronômetro cabe e diz o que mostra, parado e rodando", async ({
      studentPage,
    }) => {
      await studentPage.goto("/aluno");
      await expect(studentPage.locator("h1")).toHaveText("Minha semana");

      // O nome acessível COMEÇA pelo texto visível (WCAG 2.5.3): "Livre" ao
      // comando de voz acha o botão.
      const modo = studentPage.getByRole("button", { name: /^Livre/ });
      await expect(modo).toBeVisible();
      expect(await modo.evaluate((botao) => botao.scrollWidth - botao.clientWidth)).toBeLessThanOrEqual(0);
      expect(await overflowOf(studentPage)).toBeLessThanOrEqual(0);

      // Rodando aparece "Lançar tempo", o item que faltava caber.
      await studentPage.getByRole("button", { name: "Iniciar cronômetro" }).click();
      await expect(studentPage.getByRole("link", { name: "Lançar tempo" })).toBeVisible();

      expect(await modo.evaluate((botao) => botao.scrollWidth - botao.clientWidth)).toBeLessThanOrEqual(0);
      expect(await overflowOf(studentPage)).toBeLessThanOrEqual(0);
    });
  });

  test.describe("professor", () => {
    for (const route of TEACHER_ROUTES) {
      test(`${route} cabe`, async ({ teacherPage, scenario }) => {
        // O select do catálogo só existe com um catálogo, e as duas disciplinas
        // dão dois cartões de regra.
        await addTheoryCatalog(scenario, { withUnaudited: true });
        await nameThingsLikeReality(scenario);
        await teacherPage.goto(route);
        await expect(teacherPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);

        expect(await overflowOf(teacherPage)).toBeLessThanOrEqual(0);
      });
    }

    test("a ficha do aluno cabe", async ({ teacherPage, scenario }) => {
      await teacherPage.goto(studentPageOf(scenario.student.id));
      await expect(teacherPage.locator("h1")).toHaveText(scenario.student.name);

      expect(await overflowOf(teacherPage)).toBeLessThanOrEqual(0);
    });
  });
});

test.describe("F-UI-12 · a primeira carga mostra que está carregando (QA-26)", () => {
  test("com a sessão presa: 'Carregando', sem h1 e sem aviso de HydrateFallback", async ({
    studentPage,
  }) => {
    const warnings: string[] = [];
    studentPage.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });

    // Segura a verificação da sessão: sem ela nenhum loader resolve, que é a
    // janela em que a tela ficava branca. Mesma técnica de F-TEMA-03.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await studentPage.route(/\/auth\/v1\/user/, async (route) => {
      await held;
      await route.continue();
    });

    await studentPage.goto("/aluno", { waitUntil: "commit" });

    const carregando = testId(studentPage, "app-loading");
    await expect(carregando.first()).toBeVisible();
    await expect(carregando.first()).toContainText("Carregando");
    expect(await studentPage.locator("h1").count()).toBe(0);

    release();
    await expect(studentPage.locator("h1")).toHaveText("Minha semana");
    await expect(carregando).toHaveCount(0);

    expect(warnings.filter((texto) => /HydrateFallback/.test(texto))).toEqual([]);
  });

  /**
   * Sem o bundle: `lib/env.ts` lançando por falta de `VITE_*`, ou a rede caindo.
   * O primeiro padrão é o módulo do Vite de desenvolvimento, o segundo o build.
   */
  for (const tema of ["light", "dark"] as const) {
    test(`sem o bundle, a tela estática diz o que fazer, tema ${tema}`, async ({ page }) => {
      await page.addInitScript((escolha) => {
        if (escolha !== "dark") return;
        localStorage.setItem("bora.theme.active", "e2e");
        localStorage.setItem("bora.theme.e2e", "dark");
      }, tema);
      await page.route(/\/(src\/main\.tsx|assets\/index-[^/]+\.js)/, (route) => route.abort());

      await page.goto("/entrar");

      const carregando = testId(page, "app-loading");
      await expect(carregando).toBeVisible();
      await expect(carregando).toContainText("recarregue");
      if (tema === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      else await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
      expect(await page.locator("h1").count()).toBe(0);

      const { text } = await collect(page, [
        { selector: '[data-testid="app-loading"] p', kind: "text" },
      ]);
      expect(text.length, "nenhum texto medido").toBeGreaterThan(0);
      const fracos = text
        .map((amostra) => ({ amostra, razao: contrast(amostra.color, amostra.background) }))
        .filter(({ razao }) => razao < 4.5)
        .map(({ amostra, razao }) => describeSample(amostra, razao));
      expect(fracos).toEqual([]);
    });
  }
});
