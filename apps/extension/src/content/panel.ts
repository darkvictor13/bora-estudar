import type { Progress } from "./engine.ts";

/**
 * Painel flutuante injetado na página do TEC.
 *
 * Monta o DOM por API, sem innerHTML: o conteúdo vem de uma página de
 * terceiro, e concatenar HTML aqui abriria caminho para injeção.
 */

const PANEL_ID = "bora-panel";

export interface PanelState {
  readonly error?: string;
  readonly sessionNumber?: number;
  readonly progress?: Progress;
  readonly historyComplete?: boolean;
  readonly currentIsInQueue?: boolean;
  /** Bateria já entregue ao site: só reenvio deliberado ou descarte. */
  readonly delivered?: boolean;
  readonly onGoToPending?: (() => void) | null;
  readonly onFinish?: (() => void) | null;
  readonly onFinishEarly?: (() => void) | null;
  readonly onCancel?: (() => void) | null;
  readonly onResend?: (() => void) | null;
  readonly onDiscard?: (() => void) | null;
}

function mount(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "width:274px",
    "padding:14px 16px",
    "border-radius:12px",
    "background:#0f172a",
    "color:#f8fafc",
    "font:14px/1.5 system-ui,-apple-system,sans-serif",
    "box-shadow:0 10px 28px rgba(0,0,0,.4)",
  ].join(";");
  document.body.appendChild(panel);
  return panel;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.style.cssText = [
    "display:block",
    "width:100%",
    "margin-top:6px",
    "padding:7px 10px",
    "border-radius:8px",
    "border:1px solid " + (primary ? "transparent" : "rgba(255,255,255,.22)"),
    "background:" + (primary ? "#1a56db" : "transparent"),
    "color:#f8fafc",
    "font:inherit",
    "font-weight:550",
    "cursor:pointer",
  ].join(";");
  element.addEventListener("click", onClick);
  return element;
}

function line(text: string, dim = false): HTMLElement {
  const element = document.createElement("div");
  element.textContent = text;
  if (dim) element.style.opacity = "0.75";
  return element;
}

export function renderPanel(state: PanelState): void {
  const panel = mount();
  panel.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = state.error
    ? "Bora Estudar"
    : `Bateria ${state.sessionNumber ?? ""}`.trim();
  heading.style.cssText = "display:block;margin-bottom:6px";
  panel.appendChild(heading);

  if (state.error) {
    const message = line(state.error);
    message.style.color = "#fca5a5";
    panel.appendChild(message);
    return;
  }

  const progress = state.progress;
  if (progress) {
    panel.appendChild(line(`${progress.answered} de ${progress.total} respondidas`));
    if (progress.answered > 0) {
      panel.appendChild(line(`${progress.correct} acertos · ${progress.incorrect} erros`, true));
    }
  }

  if (state.delivered) {
    const nota = line(
      "Já enviada ao site. Se o resultado não apareceu no painel do aluno, reenvie.",
    );
    nota.style.cssText = "margin-top:6px;font-size:13px;opacity:.75";
    panel.appendChild(nota);
    if (state.onResend) panel.appendChild(button("Reenviar ao site", state.onResend, true));
    if (state.onDiscard) panel.appendChild(button("Descartar bateria", state.onDiscard));
    return;
  }

  if (state.historyComplete === false) {
    const warning = line("Histórico incompleto: pode repetir questão.");
    warning.style.cssText = "margin-top:6px;color:#fcd34d;font-size:13px";
    panel.appendChild(warning);
  }

  if (state.currentIsInQueue === false && state.onGoToPending) {
    const note = line("Você saiu da fila da bateria.");
    note.style.cssText = "margin-top:6px;font-size:13px;opacity:.75";
    panel.appendChild(note);
  }

  if (state.onGoToPending) panel.appendChild(button("Ir para a próxima", state.onGoToPending, true));
  if (state.onFinish) panel.appendChild(button("Finalizar e enviar", state.onFinish, true));
  if (state.onFinishEarly) panel.appendChild(button("Finalizar agora", state.onFinishEarly));
  if (state.onCancel) panel.appendChild(button("Cancelar bateria", state.onCancel));
}
