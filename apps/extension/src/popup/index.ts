import { tabs } from "../shared/browser.ts";
import { readSession, clearSession } from "../shared/session.ts";

const TEC_URL = "https://www.tecconcursos.com.br/questoes";

const statusEl = document.getElementById("status")!;
const openButton = document.getElementById("open") as HTMLButtonElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;

async function render(): Promise<void> {
  const session = await readSession();

  if (!session) {
    statusEl.textContent = "Nenhuma sessão em andamento. Inicie uma pelo painel do aluno.";
    openButton.hidden = true;
    clearButton.hidden = true;
    return;
  }

  const answered = Object.keys(session.answers).length;
  statusEl.textContent = `Sessão ${session.start.sessionNumber}: ${answered} de ${session.queue.length} respondidas.`;
  openButton.hidden = false;
  clearButton.hidden = false;
}

openButton.addEventListener("click", async () => {
  const [tab] = await tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await tabs.update(tab.id, { url: TEC_URL });
  window.close();
});

clearButton.addEventListener("click", async () => {
  if (!confirm("Descartar a sessão local? O resultado ainda não enviado será perdido.")) return;
  await clearSession();
  await render();
});

void render();
