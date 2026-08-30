/**
 * Estado recolhido da sidebar — spec docs/specs/29-sidebar-e-senha-visivel.md
 *
 * Mora em `localStorage`, e não em `user_preferences` como o tema. Não é
 * economia: recolher é preferência do APARELHO. A mesma pessoa quer a sidebar
 * aberta no monitor grande e recolhida no laptop, e guardar na conta imporia a
 * escolha de uma tela à outra. O tema não tem esse problema — ele é da pessoa,
 * não da tela.
 */

export const SIDEBAR_KEY = "boraSidebarCollapsed";

/** Abaixo disto, a sidebar começa recolhida. É o limiar da v96. */
export const NARROW_WIDTH = 700;

/**
 * Recolhida ou não, na montagem.
 *
 * `stored` é o que veio do `localStorage` — string, `null`, ou o que uma versão
 * anterior deixou lá. Só `"1"` e `"0"` são respostas; qualquer outra coisa cai
 * no padrão por largura, que é o único caso em que o tamanho da janela decide.
 */
export function initialCollapsed(stored: string | null, width: number): boolean {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return width <= NARROW_WIDTH;
}

/**
 * Lê sem deixar a leitura derrubar a tela.
 *
 * `localStorage` LANÇA em janela privada e com dados de site bloqueados — não
 * devolve `null`, lança. Uma sidebar é conforto; nada aqui pode impedir a
 * página de abrir.
 */
export function readCollapsed(width: number): boolean {
  try {
    return initialCollapsed(window.localStorage.getItem(SIDEBAR_KEY), width);
  } catch {
    return width <= NARROW_WIDTH;
  }
}

export function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {
    // Preferência não gravada é irritação; exceção aqui derrubaria o clique.
  }
}
