import type { Enum } from "@bora/database";

export type Theme = Enum<"theme_preference">;

/** Quem nunca escolheu não tem linha em `user_preferences` (R-TEMA-07). */
export const DEFAULT_THEME: Theme = "light";

/**
 * A cópia local, no aparelho.
 *
 * A conta é a fonte da verdade; isto aqui existe por uma razão só: o site é uma
 * SPA em modo data, e o DOCUMENTO PINTA ANTES de os loaders da rota
 * resolverem. Sem uma cópia que o navegador já tenha em mãos, toda carga de
 * página começaria clara e trocaria na frente de quem escolheu escuro.
 *
 * Duas chaves porque quem aplica o tema antes do primeiro paint é um script
 * embutido em `index.html`, que não tem como saber quem está autenticado: ele
 * lê o ponteiro, e o ponteiro diz qual das chaves de tema abrir. AS DUAS
 * CHAVES ESTÃO ESCRITAS LITERALMENTE LÁ TAMBÉM — um script embutido não
 * importa módulo. Mexeu aqui, mexa em `apps/web/index.html`.
 */
const ACTIVE_KEY = "bora.theme.active";

function keyFor(profileId: string): string {
  return `bora.theme.${profileId}`;
}

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * `localStorage` LANÇA — não devolve `null` — onde o navegador o bloqueia:
 * navegação privada com armazenamento negado, política de site, iframe sem
 * permissão. Tema é conforto; nenhuma dessas situações pode derrubar a tela.
 * Sem cópia local a pessoa perde só o pintar-antes-do-paint: a conta continua
 * mandando.
 */
function silently(action: () => void): void {
  try {
    action();
  } catch {
    // sem cópia local neste aparelho
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function rememberTheme(profileId: string, theme: Theme): void {
  silently(() => {
    localStorage.setItem(ACTIVE_KEY, profileId);
    localStorage.setItem(keyFor(profileId), theme);
  });
}

/**
 * O que a conta diz prevalece sobre o que o aparelho guardou (R-TEMA-11).
 *
 * Chamada pelo loader do layout, e não por um efeito: efeito roda DEPOIS da
 * pintura, e reconciliar depois da pintura é a piscada que `R-TEMA-10` existe
 * para impedir.
 */
export function adoptTheme(profileId: string, theme: Theme): void {
  applyTheme(theme);
  rememberTheme(profileId, theme);
}

/**
 * Esquece a cópia local e volta ao claro.
 *
 * Chamada no logout e sempre que uma rota protegida recusa a sessão. É o que
 * sustenta duas regras ao mesmo tempo: ninguém herda o tema de quem usou o
 * computador antes (R-TEMA-13), e sem sessão o tema é claro (R-TEMA-14).
 *
 * Apaga a chave de QUEM ESTAVA ATIVO, não o `localStorage` inteiro: a suíte e2e
 * e o próprio Supabase guardam coisas ali.
 */
export function forgetTheme(): void {
  silently(() => {
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active) localStorage.removeItem(keyFor(active));
    localStorage.removeItem(ACTIVE_KEY);
  });
  applyTheme(DEFAULT_THEME);
}
