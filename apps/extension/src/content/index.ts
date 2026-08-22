import {
  HASH_KEYS,
  ProtocolError,
  buildResultUrl,
  hashHasPayload,
  parseStartHash,
  type QuizResult,
  type QuizStart,
} from "@bora/protocol";

import { readSession, writeSession, clearSession, type QuizSessionState } from "../shared/session.ts";

const PANEL_ID = "bora-panel";

// ---------------------------------------------------------------------------
// Importação do payload de início
// ---------------------------------------------------------------------------

async function importStartFromUrl(): Promise<QuizSessionState | null> {
  if (!hashHasPayload(location.hash, HASH_KEYS.start)) return null;

  const { body } = parseStartHash(location.hash);

  const session: QuizSessionState = {
    start: body,
    queue: pickQuestions(body),
    answers: {},
    requestId: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  // Persistir ANTES de limpar a hash. Se a ordem se inverter e a gravação
  // falhar, o payload some da URL e não há de onde recuperá-lo.
  await writeSession(session);
  history.replaceState(null, "", location.pathname + location.search);

  return session;
}

/**
 * Escolhe as questões da sessão.
 *
 * Placeholder: hoje só prioriza as nunca vistas e completa com as menos vistas.
 * O motor de seleção real (erros recentes, espaçamento, correlação de tópico)
 * ainda será implementado.
 */
function pickQuestions(start: QuizStart): number[] {
  const seen = new Map(start.history.map((h) => [h.questionId, h]));
  const sorted = [...start.availableQuestions].sort(
    (a, b) => (seen.get(a)?.timesSeen ?? 0) - (seen.get(b)?.timesSeen ?? 0),
  );
  return sorted.slice(0, start.mainTarget);
}

// ---------------------------------------------------------------------------
// Envio do resultado
// ---------------------------------------------------------------------------

/**
 * Devolve o resultado ao site.
 *
 * O `await` antes de navegar não é opcional: `location.assign` derruba o
 * content script, e um `storage.set` pendente se perde junto com o requestId.
 */
export async function sendResult(session: QuizSessionState, cancel = false): Promise<void> {
  const withId: QuizSessionState = {
    ...session,
    requestId: session.requestId ?? crypto.randomUUID(),
    finishedAt: session.finishedAt ?? new Date().toISOString(),
  };
  await writeSession(withId);

  const body: QuizResult = {
    quizSessionId: withId.start.quizSessionId,
    requestId: withId.requestId!,
    cancel,
    answers: Object.values(withId.answers),
  };

  location.assign(buildResultUrl(body, withId.start.returnUrl));
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

function mountPanel(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
    "width:280px", "padding:14px 16px", "border-radius:12px",
    "background:#0f172a", "color:#f8fafc", "font:14px/1.5 system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.35)",
  ].join(";");
  document.body.appendChild(panel);
  return panel;
}

function writePanel(panel: HTMLElement, title: string, lines: string[]): void {
  panel.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = title;
  heading.style.display = "block";
  heading.style.marginBottom = "6px";
  panel.appendChild(heading);

  for (const line of lines) {
    const row = document.createElement("div");
    row.textContent = line;
    row.style.opacity = "0.85";
    panel.appendChild(row);
  }
}

async function boot(): Promise<void> {
  let session: QuizSessionState | null;
  try {
    session = (await importStartFromUrl()) ?? (await readSession());
  } catch (error) {
    if (error instanceof ProtocolError) {
      writePanel(mountPanel(), "Bora Estudar", [
        error.code === "incompatible_version"
          ? "Atualize a extensão: o site enviou uma sessão em formato mais novo."
          : `Não foi possível ler a sessão (${error.code}).`,
      ]);
      return;
    }
    throw error;
  }

  if (!session) return;

  const answered = Object.keys(session.answers).length;
  const warnings = session.start.historyComplete
    ? []
    : ["Histórico incompleto: pode haver repetição de questão."];

  writePanel(mountPanel(), `Sessão ${session.start.sessionNumber}`, [
    `${answered} de ${session.queue.length} respondidas`,
    ...warnings,
  ]);
}

void boot();

export { clearSession };
