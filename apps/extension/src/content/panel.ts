import type { Progress, TopicTally } from "./engine.ts";
import {
  DEFAULT_MARGIN,
  PANEL_STATE_KEY,
  clampPlacement,
  readPlacement,
  type PanelPlacement,
} from "./panel-position.ts";

/**
 * Painel flutuante injetado na página do TEC.
 *
 * Monta o DOM por API, sem innerHTML: o conteúdo vem de uma página de
 * terceiro, e concatenar HTML aqui abriria caminho para injeção.
 */

const PANEL_ID = "bora-panel";
const PANEL_WIDTH = 274;

/**
 * Posição e estado de minimizado, em memória.
 *
 * Lidos uma vez do `storage.local` na primeira montagem e escritos quando
 * mudam. Guardar em módulo evita que cada `renderPanel` — que acontece a cada
 * resposta — faça uma leitura assíncrona só para saber onde o painel está.
 */
let placement: PanelPlacement = { left: null, top: null, minimized: false };
let placementLoaded = false;

/**
 * A janela e a largura REAL do painel.
 *
 * Medida, e não a constante: `width:274px` mais `padding:0 16px` dá 306px de
 * caixa, e prender pela constante deixava o painel passar 32px da borda
 * direita. No estado minimizado a largura é `auto`, então medir é a única
 * forma correta.
 */
function viewport(panel?: HTMLElement | null) {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    panelWidth: panel?.offsetWidth || PANEL_WIDTH,
  };
}

async function savePlacement(): Promise<void> {
  try {
    await chrome.storage.local.set({ [PANEL_STATE_KEY]: placement });
  } catch {
    // Preferência perdida é irritação; bateria perdida é uma hora de estudo.
    // Falhar aqui nunca pode derrubar o painel.
  }
}

function applyPlacement(panel: HTMLElement): void {
  if (placement.left !== null && placement.top !== null) {
    panel.style.left = `${placement.left}px`;
    panel.style.top = `${placement.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  } else {
    panel.style.left = "auto";
    panel.style.top = "auto";
    panel.style.right = `${DEFAULT_MARGIN}px`;
    panel.style.bottom = `${DEFAULT_MARGIN}px`;
  }
  panel.dataset.minimized = placement.minimized ? "true" : "false";
  panel.style.width = placement.minimized ? "auto" : `${PANEL_WIDTH}px`;
  panel.style.padding = placement.minimized ? "8px 12px" : "14px 16px";
}

/**
 * Arrasta pelo cabeçalho, com ponteiro.
 *
 * `pointer*` cobre mouse e toque num caminho só — a v96 duplicava tudo para
 * `touch`. O ouvinte de movimento entra no `pointerdown` e sai no `pointerup`:
 * ouvinte vivo o tempo todo numa página de terceiro é custo por questão
 * respondida, não por arrasto (R-PAIN-07).
 */
function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener("pointerdown", (event) => {
    // Clicar num botão do cabeçalho não vira arrasto de um pixel.
    if ((event.target as HTMLElement).closest("button")) return;

    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originLeft = rect.left;
    const originTop = rect.top;
    event.preventDefault();

    const move = (moveEvent: PointerEvent) => {
      const next = clampPlacement(
        originLeft + moveEvent.clientX - startX,
        originTop + moveEvent.clientY - startY,
        viewport(panel),
      );
      placement = { ...placement, left: next.left, top: next.top };
      applyPlacement(panel);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      void savePlacement();
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}

export interface PanelState {
  readonly error?: string;
  readonly sessionNumber?: number;
  readonly progress?: Progress;
  readonly historyComplete?: boolean;
  readonly currentIsInQueue?: boolean;
  /** Bateria já entregue ao site: só reenvio deliberado ou descarte. */
  readonly delivered?: boolean;
  readonly onGoToPending?: (() => void) | null;
  /** Só com todas as principais respondidas. Acrescenta 5, ou nenhuma. */
  readonly onExtraRound?: (() => void) | null;
  readonly onFinish?: (() => void) | null;
  readonly onFinishEarly?: (() => void) | null;
  readonly onCancel?: (() => void) | null;
  readonly onResend?: (() => void) | null;
  readonly onDiscard?: (() => void) | null;
  /** Resumo por tópico do que será enviado. Vazio antes da primeira resposta. */
  readonly topics?: readonly TopicTally[];
  /** Ao concluir, o resumo abre sozinho: é quando ele importa. */
  readonly topicsOpen?: boolean;
}

/**
 * Lê a posição salva na primeira montagem.
 *
 * Chamada por `index.ts` antes do primeiro `renderPanel`. Se falhar, o painel
 * abre no canto padrão — nunca deixa de abrir.
 */
export async function loadPanelPlacement(): Promise<void> {
  if (placementLoaded) return;
  placementLoaded = true;
  try {
    const stored = await chrome.storage.local.get(PANEL_STATE_KEY);
    // Sem painel montado ainda: a constante é a melhor estimativa, e o próximo
    // arrasto corrige com a medida real.
    placement = readPlacement(stored[PANEL_STATE_KEY], viewport(null));
  } catch {
    // Canto padrão.
  }
}

function mount(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.style.cssText = [
    "position:fixed",
    "box-sizing:border-box",
    "z-index:2147483647",
    "border-radius:12px",
    "background:#0f172a",
    "color:#f8fafc",
    "font:14px/1.5 system-ui,-apple-system,sans-serif",
    "box-shadow:0 10px 28px rgba(0,0,0,.4)",
  ].join(";");
  applyPlacement(panel);
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

/** Cabeçalho: é a alça do arrasto e onde mora o botão de minimizar. */
function header(panel: HTMLElement, title: string): HTMLElement {
  const bar = document.createElement("div");
  bar.dataset.role = "drag-handle";
  bar.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:8px",
    "margin-bottom:6px",
    "cursor:move",
    "touch-action:none",
  ].join(";");

  const heading = document.createElement("strong");
  heading.textContent = title;
  bar.appendChild(heading);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.dataset.role = "minimize";
  toggle.textContent = placement.minimized ? "▢" : "−";
  toggle.title = placement.minimized ? "Restaurar" : "Minimizar";
  toggle.setAttribute("aria-label", placement.minimized ? "Restaurar painel" : "Minimizar painel");
  toggle.style.cssText = [
    "border:0",
    "background:transparent",
    "color:#f8fafc",
    "font:inherit",
    "line-height:1",
    "padding:2px 6px",
    "cursor:pointer",
  ].join(";");
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    placement = { ...placement, minimized: !placement.minimized };
    applyPlacement(panel);
    void savePlacement();
    // Redesenha para trocar o rótulo do botão e mostrar ou esconder o corpo.
    renderPanel(lastState);
  });
  bar.appendChild(toggle);

  makeDraggable(panel, bar);
  return bar;
}

/** Resumo por tópico, recolhível. Ver R-PAIN-12. */
function topicsSection(topics: readonly TopicTally[], open: boolean): HTMLElement {
  const details = document.createElement("details");
  details.dataset.role = "topics";
  details.open = open;
  details.style.cssText = "margin-top:8px;font-size:13px";

  const summary = document.createElement("summary");
  summary.textContent = `Tópicos (${topics.length})`;
  summary.style.cssText = "cursor:pointer;opacity:.8";
  details.appendChild(summary);

  for (const row of topics) {
    const item = document.createElement("div");
    item.dataset.topic = row.topic;
    item.style.cssText = "display:flex;justify-content:space-between;gap:8px;margin-top:3px";

    const name = document.createElement("span");
    name.textContent = row.topic;
    name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

    const numbers = document.createElement("span");
    numbers.textContent = `${row.correct}✓ ${row.incorrect}✕`;
    numbers.style.cssText = "opacity:.8;flex:none";

    item.append(name, numbers);
    details.appendChild(item);
  }

  return details;
}

/**
 * Último estado desenhado.
 *
 * Minimizar redesenha o painel, e o botão não tem como saber o resto do estado
 * — ele é um filho do painel, não o dono dele.
 */
let lastState: PanelState = {};

export function renderPanel(state: PanelState): void {
  lastState = state;
  const panel = mount();
  panel.replaceChildren();
  applyPlacement(panel);

  const title = state.error ? "Bora Estudar" : `Bateria ${state.sessionNumber ?? ""}`.trim();
  panel.appendChild(header(panel, placement.minimized ? "Bora" : title));

  // Minimizado: só o cabeçalho, que é a alça e o botão de restaurar.
  if (placement.minimized) return;

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
      // A composição aparece assim que a FILA cresce além das principais — ou
      // seja, quando entrou uma correlata ou uma rodada extra. Condicioná-la às
      // RESPOSTAS a esconderia justamente no momento em que ela explica o que
      // acabou de acontecer: a fila aumentou porque o aluno errou.
      if (progress.total > progress.mainTarget) {
        panel.appendChild(
          line(
            `${progress.main} principais · ${progress.reinforcement} reforços · ${progress.extra} extras`,
            true,
          ),
        );
      }
    }
  }

  if (state.delivered) {
    const nota = line(
      "Já enviada ao site. Se o resultado não apareceu no painel do aluno, reenvie.",
    );
    nota.style.cssText = "margin-top:6px;font-size:13px;opacity:.75";
    panel.appendChild(nota);
    if (state.topics && state.topics.length > 0) {
      // Entregue é justamente quando o resumo importa mais: o aluno acabou de
      // responder e ainda lembra das questões.
      panel.appendChild(topicsSection(state.topics, true));
    }
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

  if (state.topics && state.topics.length > 0) {
    panel.appendChild(topicsSection(state.topics, state.topicsOpen === true));
  }

  if (state.onGoToPending) panel.appendChild(button("Ir para a próxima", state.onGoToPending, true));
  if (state.onExtraRound) {
    panel.appendChild(button("+ 5 questões extras", state.onExtraRound));
  }
  if (state.onFinish) panel.appendChild(button("Finalizar e enviar", state.onFinish, true));
  if (state.onFinishEarly) panel.appendChild(button("Finalizar agora", state.onFinishEarly));
  if (state.onCancel) panel.appendChild(button("Cancelar bateria", state.onCancel));
}
