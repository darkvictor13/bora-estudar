/**
 * Posição e estado do painel — spec docs/specs/28-painel-arrastavel-e-topicos.md
 *
 * Preferência de quem usa, e não dado de bateria: por isso vive em chave
 * própria no `storage.local`, e não no envelope da sessão. Misturar as duas
 * faria a preferência morrer junto com a bateria — e, pior, poria uma escrita
 * a mais no caminho que a segunda das três ordenações do CLAUDE.md protege.
 */

export const PANEL_STATE_KEY = "boraPanelState";

/** Canto padrão, em pixels a partir da borda direita e inferior. */
export const DEFAULT_MARGIN = 16;

export interface PanelPlacement {
  /** Distância da borda esquerda. `null` mantém o painel ancorado à direita. */
  readonly left: number | null;
  readonly top: number | null;
  readonly minimized: boolean;
}

export const DEFAULT_PLACEMENT: PanelPlacement = { left: null, top: null, minimized: false };

/**
 * Mantém o painel dentro da janela.
 *
 * Os quatro lados: um painel arrastado para fora não tem como voltar, porque a
 * alça foi junto. `bottom` deixa uma faixa visível em vez de exigir que o
 * painel inteiro caiba — a altura muda conforme o conteúdo, e prender pela
 * altura faria o painel saltar ao crescer.
 */
export function clampPlacement(
  left: number,
  top: number,
  viewport: { width: number; height: number; panelWidth: number },
): { left: number; top: number } {
  const maxLeft = Math.max(0, viewport.width - viewport.panelWidth);
  const maxTop = Math.max(0, viewport.height - 50);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Valida o que veio do `storage`.
 *
 * O dado sobreviveu a versões anteriores da extensão e a telas de outro
 * tamanho: `NaN`, string, objeto de outro formato e coordenada fora da janela
 * atual caem no canto padrão. Um painel restaurado fora da tela é um painel
 * perdido (R-PAIN-04).
 */
export function readPlacement(
  raw: unknown,
  viewport?: { width: number; height: number; panelWidth: number },
): PanelPlacement {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PLACEMENT;

  const value = raw as Record<string, unknown>;
  const minimized = value.minimized === true;

  if (!finite(value.left) || !finite(value.top)) {
    return { ...DEFAULT_PLACEMENT, minimized };
  }

  if (!viewport) return { left: value.left, top: value.top, minimized };

  const clamped = clampPlacement(value.left, value.top, viewport);
  return { left: clamped.left, top: clamped.top, minimized };
}
