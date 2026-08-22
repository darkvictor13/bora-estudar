/**
 * Localizadores dos componentes de `components/ui.tsx`.
 *
 * Concentrados aqui pelo mesmo motivo que `tec-page.ts` concentra o
 * acoplamento ao HTML do TEC: quando a marcação mudar, muda um arquivo.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Cartão pelo título, casando o `<h2>` inteiro.
 *
 * `filter({ hasText })` não serve: ele casa qualquer descendente, e o cartão
 * "Blocos x desempenho" contém o texto "Pior desempenho oficial primeiro" —
 * dois cartões respondem por "Desempenho oficial" e o modo estrito recusa.
 */
export function cardByTitle(page: Page, title: string): Locator {
  return page.locator(".card", {
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}
