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
import { expect, test } from "../fixtures/index.ts";
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
    await studentPage.goto("/aluno/cadernos");
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
    await studentPage.goto("/aluno/cadernos");
    await expect(studentPage.locator("h1")).toBeVisible();

    // "/aluno" é prefixo de "/aluno/cadernos": sem casar o caminho mais longo,
    // os dois ficariam marcados e "Metas" mentiria em toda subpágina.
    await expect(activeNavItem(studentPage)).toHaveCount(1);
    await expect(activeNavItem(studentPage)).toContainText("Cadernos TEC");
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
