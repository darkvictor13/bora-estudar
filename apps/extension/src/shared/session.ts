import type { QuestionAnswer, QuizStart } from "@bora/protocol";

import { storage } from "./browser.ts";

const SESSION_KEY = "bora.quiz.session.v1";

export interface QuizSessionState {
  readonly start: QuizStart;
  /** Fila de questões escolhidas pelo motor, na ordem de execução. */
  readonly queue: readonly number[];
  /** Respostas já registradas, indexadas por `questionId`. */
  readonly answers: Record<string, QuestionAnswer>;
  /**
   * Gerado UMA vez, quando o aluno finaliza, e persistido ANTES de qualquer
   * navegação. Toda retentativa de envio reusa este valor.
   */
  requestId: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function readSession(): Promise<QuizSessionState | null> {
  const stored = await storage.get(SESSION_KEY);
  return (stored[SESSION_KEY] as QuizSessionState | undefined) ?? null;
}

/**
 * Grava a sessão. SEMPRE aguarde antes de navegar.
 *
 * `location.assign` destrói o content script. Um `set` não aguardado pode não
 * chegar ao disco, e a sessão — inclusive o requestId — se perde. Foi essa
 * corrida que fez a versão anterior perder resultado de bateria já respondida.
 */
export async function writeSession(session: QuizSessionState): Promise<void> {
  await storage.set({ [SESSION_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await storage.remove(SESSION_KEY);
}
