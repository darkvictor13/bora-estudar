import type { ThemePreference } from "@/lib/api/contract.ts";

/**
 * O tema, do ponto de vista do documento.
 *
 * O TIPO VEM DO CONTRATO, não do banco. Era `Enum<"theme_preference">`, um
 * enum do Postgres — e ele desapareceu junto com `user_preferences` no schema
 * de 14/09/2026. Amarrar o tipo da interface a um enum do banco significa que
 * a tela para de compilar quando a outra frente mexe no schema, o que é
 * exatamente o acoplamento que `lib/api` existe para cortar.
 */
export type Theme = ThemePreference;

/** Quem nunca escolheu não tem preferência guardada, e a ausência é claro (R-TEMA-07). */
export const DEFAULT_THEME: Theme = "light";

/**
 * A cópia local, no aparelho.
 *
 * Existe por uma razão só: o site é uma SPA em modo data, e o DOCUMENTO PINTA
 * ANTES de os loaders da rota resolverem. Sem uma cópia que o navegador já
 * tenha em mãos, toda carga de página começaria clara e trocaria na frente de
 * quem escolheu escuro.
 *
 * Duas chaves porque quem aplica o tema antes do primeiro paint é um script
 * embutido em `index.html`, que não tem como saber quem está autenticado: ele
 * lê o ponteiro, e o ponteiro diz qual das chaves de tema abrir. AS DUAS
 * CHAVES ESTÃO ESCRITAS LITERALMENTE LÁ TAMBÉM — um script embutido não
 * importa módulo. Mexeu aqui, mexa em `apps/web/index.html`.
 *
 * ENQUANTO A COLUNA NÃO EXISTE, ESTA CÓPIA É A ÚNICA. O schema atual não tem
 * onde guardar a preferência (lacuna nº 1 de `lib/api/contract.ts`), então
 * `supabaseApi.loadThemePreference` lê daqui. No dia em que a frente do banco
 * entregar a coluna, nada disto muda de forma: a cópia local continua sendo o
 * que evita a piscada, e a conta volta a ser a fonte da verdade.
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
 */
function silently<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
}

/** O que este aparelho guardou para este perfil, ou `null` se nunca guardou. */
export function readLocalTheme(profileId: string): Theme | null {
  return silently(() => {
    const stored = localStorage.getItem(keyFor(profileId));
    return isTheme(stored) ? stored : null;
  }, null);
}

export function writeLocalTheme(profileId: string, theme: Theme): void {
  silently(() => {
    localStorage.setItem(ACTIVE_KEY, profileId);
    localStorage.setItem(keyFor(profileId), theme);
  }, undefined);
}

/** @deprecated Use `writeLocalTheme`. Mantido enquanto as telas antigas existirem. */
export const rememberTheme = writeLocalTheme;

/**
 * Pinta e guarda, nesta ordem.
 *
 * Chamada pelo loader do layout, e não por um efeito: efeito roda DEPOIS da
 * pintura, e reconciliar depois da pintura é a piscada que R-TEMA-10 existe
 * para impedir.
 *
 * `null` É "NUNCA ESCOLHEU", E NÃO SE GRAVA. A ausência equivale a claro, mas
 * não é a mesma coisa que ter escolhido claro (R-TEMA-07): gravar `light` aqui
 * transformaria toda primeira visita numa escolha que a pessoa não fez, e o
 * dia em que existir "seguir o sistema" não haveria como distinguir quem
 * queria claro de quem nunca opinou.
 */
export function adoptTheme(profileId: string, theme: Theme | null): void {
  applyTheme(theme ?? DEFAULT_THEME);
  if (theme) writeLocalTheme(profileId, theme);
}

/**
 * Esquece a cópia local e volta ao claro.
 *
 * Chamada no logout e sempre que uma rota protegida recusa a sessão. Sustenta
 * duas regras ao mesmo tempo: ninguém herda o tema de quem usou o computador
 * antes (R-TEMA-13), e sem sessão o tema é claro (R-TEMA-14).
 *
 * Apaga a chave de QUEM ESTAVA ATIVO, não o `localStorage` inteiro: a suíte
 * e2e e o próprio Supabase guardam coisas ali.
 */
export function forgetTheme(): void {
  silently(() => {
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active) localStorage.removeItem(keyFor(active));
    localStorage.removeItem(ACTIVE_KEY);
  }, undefined);
  applyTheme(DEFAULT_THEME);
}
