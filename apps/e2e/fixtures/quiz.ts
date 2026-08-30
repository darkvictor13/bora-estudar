/**
 * A extensão vista de fora, para os testes do lado do SITE.
 *
 * Os testes de `quiz.spec.ts` exercitam o que o site faz: montar o payload de
 * início, receber o resultado no fragmento, gravar, limpar a hash e registrar o
 * tempo. Para isso não é preciso um navegador com a extensão instalada — é
 * preciso alguém que produza um payload de volta *idêntico* ao que a extensão
 * produz. É o que este módulo faz.
 *
 * O que ele NÃO faz é substituir os testes da extensão: quem prova que a
 * extensão persiste antes de limpar a hash e gera o `requestId` uma única vez é
 * `extension.spec.ts`, com a extensão de verdade carregada. Aqui o motor real é
 * importado (`pickQuestions`) justamente para que a fila usada nos testes do
 * site seja a mesma que o aluno veria.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  HASH_KEYS,
  buildResultUrl,
  buildStartUrl,
  parseResultHash,
  parseStartHash,
  type QuestionAnswer,
  type QuizResult,
  type QuizStart,
} from "@bora/protocol";

import { pickQuestions, type QueueItem } from "../../extension/src/content/engine.ts";
import { STUDENT_RETURN_URL } from "../support/app.ts";

export const TEC_URL = "https://www.tecconcursos.com.br/questoes";

/**
 * Lê o payload de início da URL em que o navegador parou.
 *
 * O fragmento nunca chega ao servidor: interceptar a requisição do TEC dá a URL
 * sem `#`. A única fonte é a URL do frame depois da navegação — armadilha nº 3
 * do `docs/fluxos-e2e.md`.
 */
export function readStartPayload(url: string): QuizStart {
  const hash = url.slice(url.indexOf("#"));
  return parseStartHash(hash).body;
}

export function startHashOf(url: string): string | null {
  const index = url.indexOf(`#${HASH_KEYS.start}=`);
  return index === -1 ? null : url.slice(index);
}

export interface AnswerPlan {
  /** Quantas das questões da fila são respondidas. Padrão: a fila inteira. */
  readonly answer?: number;
  /** Quantas das respondidas são acertos. */
  readonly correct: number;
}

/**
 * Respostas na forma exata que a extensão grava.
 *
 * `executionOrder` é sequencial e sem colisão porque o banco tem
 * `unique(quiz_session_id, execution_order)`.
 */
export function buildAnswers(queue: readonly QueueItem[], plan: AnswerPlan): QuestionAnswer[] {
  const total = plan.answer ?? queue.length;
  return queue.slice(0, total).map((item, index) => ({
    questionId: item.id,
    executionOrder: index + 1,
    round: item.round,
    phase: item.phase,
    outcome: index < plan.correct ? ("correct" as const) : ("incorrect" as const),
    topic: item.topic,
    sourceQuestionId: item.sourceQuestionId,
    answeredAt: new Date().toISOString(),
  }));
}

export interface SimulatedRun {
  readonly start: QuizStart;
  readonly queue: readonly QueueItem[];
  readonly result: QuizResult;
  /** URL de volta ao site, com o resultado no fragmento. */
  readonly returnUrl: string;
}

/**
 * Roda a bateria inteira "por fora" e devolve a URL de volta.
 *
 * O `requestId` é gerado UMA vez, aqui, e fica em `result` para que o teste de
 * idempotência possa reenviar exatamente o mesmo payload.
 */
export function simulateExtension(
  startUrl: string,
  plan: AnswerPlan,
  options: { readonly cancel?: boolean; readonly requestId?: string } = {},
): SimulatedRun {
  const start = readStartPayload(startUrl);
  const queue = pickQuestions(start);
  const result: QuizResult = {
    quizSessionId: start.quizSessionId,
    requestId: options.requestId ?? randomUUID(),
    cancel: options.cancel ?? false,
    answers: options.cancel ? [] : buildAnswers(queue, plan),
  };

  return { start, queue, result, returnUrl: buildResultUrl(result, start.returnUrl) };
}

/** Monta uma URL de volta a partir de um resultado já pronto (para reenvio). */
export function resultUrl(result: QuizResult, returnUrl: string): string {
  return buildResultUrl(result, returnUrl);
}

/**
 * Volta ao site com o resultado no fragmento.
 *
 * Passa por `about:blank` antes. Sem isso, um `goto` para a mesma URL trocando
 * só o fragmento é navegação *same-document*: o React não remonta,
 * `QuizResultHandler` nunca roda e o teste falha por um motivo que não tem nada
 * a ver com o produto — armadilha nº 2 do `docs/fluxos-e2e.md`.
 */
export async function returnToSite(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

// ---------------------------------------------------------------------------
// Payload sintético, para os testes da própria extensão
// ---------------------------------------------------------------------------

/**
 * Monta um payload de início sem passar pelo site.
 *
 * A extensão só consome o protocolo: de onde o payload veio é indiferente para
 * ela. Um `mainTarget` de 3 em vez dos 15 reais corta o tempo do teste por
 * cinco sem mudar nenhum caminho de código — quem verifica que o site produz
 * um payload íntegro, com `mainTarget` 15, é `quiz.spec.ts`.
 */
export function syntheticStart(overrides: Partial<QuizStart> = {}): QuizStart {
  return {
    returnUrl: STUDENT_RETURN_URL,
    quizSessionId: "11111111-1111-4111-8111-111111111111",
    goalId: "22222222-2222-4222-8222-222222222222",
    studyPlanId: "33333333-3333-4333-8333-333333333333",
    blockId: "44444444-4444-4444-8444-444444444444",
    sessionNumber: 1,
    mainTarget: 3,
    availableQuestions: [
      { id: 100001, topic: "Local de crime" },
      { id: 100002, topic: "Cadeia de custódia" },
      { id: 100003, topic: "Local de crime" },
      { id: 100004, topic: "Perícia papiloscópica" },
      { id: 100005, topic: "Cadeia de custódia" },
    ],
    history: [],
    historyComplete: true,
    ...overrides,
  };
}

/** URL do TEC carregando um payload de início no fragmento. */
export function startUrlFor(start: QuizStart): string {
  return buildStartUrl(TEC_URL, start);
}

/** Lê o resultado que a extensão devolveu na URL de retorno. */
export function readResultPayload(url: string): QuizResult {
  return parseResultHash(url.slice(url.indexOf("#"))).body;
}
