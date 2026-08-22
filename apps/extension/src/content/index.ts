import {
  HASH_KEYS,
  ProtocolError,
  hashContemPayload,
  lerInicioDaHash,
  montarUrlResultado,
  type BateriaResultado,
} from "@bora/protocol";

import { gravarSessao, lerSessao, limparSessao, type SessaoBateria } from "../shared/sessao.ts";

const ID_PAINEL = "bora-painel";

// ---------------------------------------------------------------------------
// Importação do payload de início
// ---------------------------------------------------------------------------

async function importarInicioDaUrl(): Promise<SessaoBateria | null> {
  if (!hashContemPayload(location.hash, HASH_KEYS.start)) return null;

  const { corpo } = lerInicioDaHash(location.hash);

  const sessao: SessaoBateria = {
    inicio: corpo,
    fila: selecionarQuestoes(corpo),
    respostas: {},
    requestId: null,
    iniciadaEm: new Date().toISOString(),
    finalizadaEm: null,
  };

  // Persistir ANTES de limpar a hash. Se a ordem se inverter e a gravação
  // falhar, o payload some da URL e não há de onde recuperá-lo.
  await gravarSessao(sessao);
  history.replaceState(null, "", location.pathname + location.search);

  return sessao;
}

/**
 * Escolhe as questões da bateria.
 *
 * Placeholder: hoje só prioriza as nunca vistas e completa com as menos vistas.
 * O motor de seleção real (erros recentes, espaçamento, correlação de tópico)
 * ainda será implementado.
 */
function selecionarQuestoes(inicio: SessaoBateria["inicio"]): number[] {
  const vistas = new Map(inicio.historico.map((h) => [h.questaoId, h]));
  const ordenadas = [...inicio.questoesDisponiveis].sort((a, b) => {
    const va = vistas.get(a)?.vezesVista ?? 0;
    const vb = vistas.get(b)?.vezesVista ?? 0;
    return va - vb;
  });
  return ordenadas.slice(0, inicio.principaisAlvo);
}

// ---------------------------------------------------------------------------
// Envio do resultado
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Devolve o resultado ao site.
 *
 * O `await` antes de navegar não é opcional: `location.assign` derruba o
 * content script, e um `storage.set` pendente se perde junto com o requestId.
 */
export async function enviarResultado(sessao: SessaoBateria, cancelar = false): Promise<void> {
  const comId: SessaoBateria = {
    ...sessao,
    requestId: sessao.requestId ?? uuid(),
    finalizadaEm: sessao.finalizadaEm ?? new Date().toISOString(),
  };
  await gravarSessao(comId);

  const corpo: BateriaResultado = {
    bateriaId: comId.inicio.bateriaId,
    requestId: comId.requestId!,
    cancelar,
    respostas: Object.values(comId.respostas),
  };

  location.assign(montarUrlResultado(corpo, comId.inicio.urlRetorno));
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

function montarPainel(): HTMLElement {
  const existente = document.getElementById(ID_PAINEL);
  if (existente) return existente;

  const painel = document.createElement("aside");
  painel.id = ID_PAINEL;
  painel.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
    "width:280px", "padding:14px 16px", "border-radius:12px",
    "background:#0f172a", "color:#f8fafc", "font:14px/1.5 system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.35)",
  ].join(";");
  document.body.appendChild(painel);
  return painel;
}

function escrever(painel: HTMLElement, titulo: string, linhas: string[]): void {
  painel.replaceChildren();

  const h = document.createElement("strong");
  h.textContent = titulo;
  h.style.display = "block";
  h.style.marginBottom = "6px";
  painel.appendChild(h);

  for (const linha of linhas) {
    const p = document.createElement("div");
    p.textContent = linha;
    p.style.opacity = "0.85";
    painel.appendChild(p);
  }
}

async function iniciar(): Promise<void> {
  let sessao: SessaoBateria | null;
  try {
    sessao = (await importarInicioDaUrl()) ?? (await lerSessao());
  } catch (erro) {
    if (erro instanceof ProtocolError) {
      escrever(montarPainel(), "Bora Estudar", [
        erro.codigo === "versao_incompativel"
          ? "Atualize a extensão: o site enviou uma bateria em formato mais novo."
          : `Não foi possível ler a bateria (${erro.codigo}).`,
      ]);
      return;
    }
    throw erro;
  }

  if (!sessao) return;

  const respondidas = Object.keys(sessao.respostas).length;
  const avisos = sessao.inicio.historicoCompleto
    ? []
    : ["Histórico incompleto: pode haver repetição de questão."];

  escrever(montarPainel(), `Bateria ${sessao.inicio.numeroBateria}`, [
    `${respondidas} de ${sessao.fila.length} respondidas`,
    ...avisos,
  ]);
}

void iniciar();

export { limparSessao };
