import { tabs } from "../shared/browser.ts";
import { lerSessao, limparSessao } from "../shared/sessao.ts";

const URL_TEC = "https://www.tecconcursos.com.br/questoes";

const estado = document.getElementById("estado")!;
const abrir = document.getElementById("abrir") as HTMLButtonElement;
const limpar = document.getElementById("limpar") as HTMLButtonElement;

async function render(): Promise<void> {
  const sessao = await lerSessao();

  if (!sessao) {
    estado.textContent = "Nenhuma bateria em andamento. Inicie uma pelo painel do aluno.";
    abrir.hidden = true;
    limpar.hidden = true;
    return;
  }

  const respondidas = Object.keys(sessao.respostas).length;
  estado.textContent = `Bateria ${sessao.inicio.numeroBateria}: ${respondidas} de ${sessao.fila.length} respondidas.`;
  abrir.hidden = false;
  limpar.hidden = false;
}

abrir.addEventListener("click", async () => {
  const [aba] = await tabs.query({ active: true, currentWindow: true });
  if (aba?.id !== undefined) await tabs.update(aba.id, { url: URL_TEC });
  window.close();
});

limpar.addEventListener("click", async () => {
  if (!confirm("Descartar a sessão local? O resultado ainda não enviado será perdido.")) return;
  await limparSessao();
  await render();
});

void render();
