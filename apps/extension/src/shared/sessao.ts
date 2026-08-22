import type { BateriaInicio, RespostaQuestao } from "@bora/protocol";

import { storage } from "./browser.ts";

const CHAVE_SESSAO = "bora.bateria.sessao.v1";

export interface SessaoBateria {
  readonly inicio: BateriaInicio;
  /** Fila de questões escolhidas pelo motor, na ordem de execução. */
  readonly fila: readonly number[];
  /** Respostas já registradas, indexadas por `questaoId`. */
  readonly respostas: Record<string, RespostaQuestao>;
  /**
   * Gerado UMA vez, quando o aluno finaliza, e persistido ANTES de qualquer
   * navegação. Toda retentativa de envio reusa este valor.
   */
  requestId: string | null;
  iniciadaEm: string;
  finalizadaEm: string | null;
}

export async function lerSessao(): Promise<SessaoBateria | null> {
  const guardado = await storage.get(CHAVE_SESSAO);
  return (guardado[CHAVE_SESSAO] as SessaoBateria | undefined) ?? null;
}

/**
 * Grava a sessão. SEMPRE aguarde antes de navegar.
 *
 * `location.assign` destrói o content script. Um `set` não aguardado pode não
 * chegar ao disco, e a sessão — inclusive o requestId — se perde. Foi essa
 * corrida que fez a versão anterior perder resultado de bateria já respondida.
 */
export async function gravarSessao(sessao: SessaoBateria): Promise<void> {
  await storage.set({ [CHAVE_SESSAO]: sessao });
}

export async function limparSessao(): Promise<void> {
  await storage.remove(CHAVE_SESSAO);
}
