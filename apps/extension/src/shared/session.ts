import type { QuestionAnswer, QuizStart } from "@bora/protocol";
import type { QueueItem } from "../content/engine.ts";

import { storage } from "./browser.ts";

const SESSION_KEY = "bora.quiz.session.v1";

export interface QuizSessionState {
  readonly start: QuizStart;
  /** Fila de questões escolhidas pelo motor, na ordem de execução. */
  readonly queue: readonly QueueItem[];
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

/**
 * Migra a fila gravada pela versão anterior, que era `number[]`.
 *
 * **Não se descarta bateria em andamento por causa de atualização de
 * extensão.** É uma hora de estudo do aluno, e é o tipo de perda que as três
 * ordenações do CLAUDE.md existem para impedir. Cada número vira um item
 * principal, rodada 0, sem origem — que é exatamente o que ele era.
 *
 * O tópico é perdido, e não faz falta: ele só serve para escolher a correlata,
 * e uma bateria começada antes desta versão não tem correlata nenhuma.
 */
function migrateQueue(queue: unknown): QueueItem[] {
  if (!Array.isArray(queue)) return [];
  return queue.map((entry) =>
    typeof entry === "number"
      ? { id: entry, topic: null, phase: "main" as const, round: 0, sourceQuestionId: null, depth: 0 }
      : (entry as QueueItem),
  );
}

export async function readSession(): Promise<QuizSessionState | null> {
  const stored = await storage.get(SESSION_KEY);
  const session = stored[SESSION_KEY] as QuizSessionState | undefined;
  if (!session) return null;
  return { ...session, queue: migrateQueue(session.queue) };
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
