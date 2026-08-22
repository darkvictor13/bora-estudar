import { tabs } from "../shared/browser.ts";
import { readSession, clearSession } from "../shared/session.ts";
import { progressOf } from "../content/engine.ts";
import { QUESTIONS_URL } from "../content/tec-page.ts";

const statusEl = document.getElementById("status")!;
const openButton = document.getElementById("open") as HTMLButtonElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;

async function render(): Promise<void> {
  const session = await readSession();

  if (!session) {
    statusEl.textContent = "Nenhuma bateria em andamento. Inicie uma pelo painel do aluno.";
    openButton.hidden = true;
    clearButton.hidden = true;
    return;
  }

  const progress = progressOf(session.queue, session.answers);
  statusEl.textContent =
    `Bateria ${session.start.sessionNumber}: ${progress.answered} de ${progress.total} respondidas` +
    (session.finishedAt ? " · aguardando envio ao site." : ".");
  openButton.hidden = false;
  clearButton.hidden = false;
}

openButton.addEventListener("click", async () => {
  const [tab] = await tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await tabs.update(tab.id, { url: QUESTIONS_URL });
  window.close();
});

clearButton.addEventListener("click", async () => {
  if (!confirm("Descartar a sessão local? O resultado ainda não enviado será perdido.")) return;
  await clearSession();
  await render();
});

void render();
