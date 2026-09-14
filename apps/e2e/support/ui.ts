/**
 * Como a suíte encontra as coisas na tela.
 *
 * ## Por que `data-testid`
 *
 * A suíte casava por classe CSS em cerca de 150 lugares (`.alert--success`
 * 52×, `.content` 36×, `.badge` 31×). Essas classes vinham de `globals.css`,
 * que some junto com as telas antigas; e o que as substitui é MUI, cujas
 * classes são geradas — `css-1x2y3z4` muda quando o Emotion decide que muda.
 * Casar por qualquer um dos dois é casar com o que não é contrato.
 *
 * `data-testid` é a única coisa na marcação que existe PARA ser casada. Quando
 * o componente é reescrito, ele carrega o testid consigo e o teste continua
 * valendo — que é exatamente o que uma rede de segurança precisa fazer durante
 * uma migração.
 *
 * ## Quando converter
 *
 * NA FASE EM QUE A TELA É REESCRITA, nunca antes nem depois. Converter cedo
 * deixa a suíte testando o que vai sumir; converter tarde deixa a fase sem
 * rede. A Fase 2 converteu a casca e a autenticação; `goalRow` e `cardByTitle`
 * pertencem a telas que as fases 3 a 6 ainda vão reescrever.
 *
 * ## A convenção
 *
 * O testid nomeia o PAPEL, e o que varia entra num `data-*` ao lado. Assim há
 * um testid por componente em vez de um por combinação — `alert-success`,
 * `alert-error` e `alert-warning` seriam três nomes para a mesma caixa.
 *
 * ```tsx
 * <div data-testid="alert" data-status="success">…</div>
 * <tr  data-testid="goal-row" data-goal-id={goal.id} data-status={goal.status}>
 * ```
 *
 * Em kebab-case, em inglês, e sem o nome da tela: `goal-row` serve ao aluno e
 * ao professor. A lista do que existe está em `docs/fluxos-e2e.md`.
 */
import type { Locator, Page } from "@playwright/test";

/** `[data-testid="..."]`, com escape do que o seletor não aceita cru. */
export function testId(page: Page | Locator, id: string): Locator {
  return page.locator(`[data-testid="${id}"]`);
}

/**
 * O corpo da página — o que a sidebar não é.
 *
 * Escopar o clique aqui é o que impede `button[type=submit]` de casar o "Sair"
 * da sidebar, que foi motivo de teste vermelho mais de uma vez.
 */
export function content(page: Page): Locator {
  return testId(page, "content");
}

export type AlertStatus = "success" | "error" | "info" | "warning";

/**
 * Um aviso, opcionalmente do papel pedido.
 *
 * O papel é ATRIBUTO no mesmo elemento, não um descendente e não uma classe
 * modificadora — por isso os dois entram no mesmo seletor. Era `.alert--success`
 * em 52 lugares da suíte, e cada um deles vira `alert(page, "success")`.
 */
export function alert(page: Page | Locator, status?: AlertStatus): Locator {
  const suffix = status ? `[data-status="${status}"]` : "";
  return page.locator(`[data-testid="alert"]${suffix}`);
}

/* ------------------------------------------------------------------ *
 * A casca — Fase 2
 * ------------------------------------------------------------------ */

export function sidebar(page: Page): Locator {
  return testId(page, "sidebar");
}

/**
 * O botão de sair.
 *
 * Tem testid próprio porque é o submit que mora FORA do conteúdo: era ele que
 * `button[type=submit]` casava por engano em qualquer teste de formulário, a
 * armadilha nº 1 do `docs/fluxos-e2e.md`.
 */
export function signOut(page: Page): Locator {
  return testId(page, "sign-out");
}

/** Um item de menu, pelo rótulo visível. */
export function navItem(page: Page, label: string): Locator {
  return testId(page, "nav-item").filter({ hasText: label });
}

/** O item de menu marcado como atual. */
export function activeNavItem(page: Page): Locator {
  return page.locator('[data-testid="nav-item"][data-active="true"]');
}

export function userChip(page: Page): Locator {
  return testId(page, "user-chip");
}

export function themeToggle(page: Page): Locator {
  return testId(page, "theme-toggle").locator("button");
}

export function sidebarToggle(page: Page): Locator {
  return testId(page, "sidebar-toggle");
}

/** `true` quando a barra está recolhida aos 64px. */
export function collapsedSidebar(page: Page): Locator {
  return page.locator('[data-testid="sidebar"][data-collapsed="true"]');
}

/* ------------------------------------------------------------------ *
 * Formulários — Fase 2
 * ------------------------------------------------------------------ */

/**
 * Um campo, pelo `name`.
 *
 * O `id` é `field-<name>` e é contrato da primitiva `Field` de `@bora/ui`; a
 * suíte digitava por `#field-email` antes da migração e continua digitando
 * depois, porque o id atravessou a reescrita junto com o componente.
 */
export function field(page: Page, name: string): Locator {
  return page.locator(`#field-${name}`);
}

/** O cartão de autenticação — o `auth-card` da v2. */
export function authCard(page: Page): Locator {
  return testId(page, "auth-card");
}

/* ------------------------------------------------------------------ *
 * Telas ainda não reescritas — fases 3 a 6
 * ------------------------------------------------------------------ */

/** Uma linha de meta, pelo id da meta. */
export function goalRow(page: Page | Locator, goalId: string): Locator {
  return page.locator(`[data-testid="goal-row"][data-goal-id="${goalId}"]`);
}

/** Todas as linhas de meta da tela, na ordem em que aparecem. */
export function goalRows(page: Page | Locator): Locator {
  return testId(page, "goal-row");
}

/**
 * Cartão pelo título, casando o `<h2>` inteiro.
 *
 * `filter({ hasText })` não serve: ele casa qualquer descendente, e o cartão
 * "Blocos x desempenho" contém o texto "Pior desempenho oficial primeiro" —
 * dois cartões respondem por "Desempenho oficial" e o modo estrito recusa.
 *
 * A primitiva `Card` de `@bora/ui` já traz `data-testid="card"`; as telas que
 * ainda usam a `.card` de `globals.css` são as das fases 3 a 6, e por isso o
 * seletor aceita as duas até lá.
 */
export function cardByTitle(page: Page, title: string): Locator {
  return page.locator('[data-testid="card"], .card', {
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}
