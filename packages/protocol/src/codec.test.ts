import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HASH_KEYS, PROTOCOL_VERSION, ProtocolError } from "./envelope.ts";
import {
  buildResultUrl,
  buildStartUrl,
  hashHasPayload,
  parseResultHash,
  parseStartHash,
} from "./codec.ts";
import type { QuizResult, QuizStart } from "./messages.ts";

const start: QuizStart = {
  returnUrl: "http://localhost:3000/student",
  quizSessionId: "11111111-1111-4111-8111-111111111111",
  goalId: "22222222-2222-4222-8222-222222222222",
  studyPlanId: "33333333-3333-4333-8333-333333333333",
  blockId: "44444444-4444-4444-8444-444444444444",
  sessionNumber: 3,
  mainTarget: 15,
  availableQuestions: [
    { id: 101, topic: "Local de crime" },
    // Tópico nulo é caso real: o bloco pode não ter tópico cadastrado, e o
    // motor degrada para "qualquer questão" em vez de quebrar (R-FASE-03).
    { id: 102, topic: null },
    { id: 103, topic: "Cadeia de custódia" },
  ],
  history: [
    {
      questionId: 101,
      timesSeen: 2,
      correctAnswers: 1,
      incorrectAnswers: 1,
      lastSeenAt: "2026-08-20T10:00:00.000Z",
    },
  ],
  historyComplete: true,
};

const result: QuizResult = {
  quizSessionId: start.quizSessionId,
  requestId: "55555555-5555-4555-8555-555555555555",
  cancel: false,
  answers: [
    {
      questionId: 101,
      executionOrder: 1,
      round: 0,
      phase: "main",
      outcome: "correct",
      topic: "Local de crime",
      sourceQuestionId: null,
      answeredAt: "2026-08-22T10:00:00.000Z",
    },
    {
      questionId: 900,
      executionOrder: 2,
      round: 1,
      phase: "reinforcement",
      outcome: "incorrect",
      topic: null,
      sourceQuestionId: 101,
      answeredAt: "2026-08-22T10:05:00.000Z",
    },
  ],
};

const hashOf = (url: string) => url.slice(url.indexOf("#"));

describe("ida e volta", () => {
  it("preserva o payload de início", () => {
    const url = buildStartUrl("https://www.tecconcursos.com.br/questoes", start);
    assert.deepEqual(parseStartHash(hashOf(url)).body, start);
  });

  it("preserva o payload de resultado, inclusive campos nulos", () => {
    const url = buildResultUrl(result, "http://localhost:3000/student");
    assert.deepEqual(parseResultHash(hashOf(url)).body, result);
  });

  it("sobrevive a acentuação e caractere fora do ASCII no tópico", () => {
    const accented: QuizResult = {
      ...result,
      answers: [{ ...result.answers[0]!, topic: "Cadeia de custódia — perícia 🔬" }],
    };
    const url = buildResultUrl(accented, "http://localhost:3000/student");
    assert.equal(
      parseResultHash(hashOf(url)).body.answers[0]?.topic,
      "Cadeia de custódia — perícia 🔬",
    );
  });

  it("não usa caractere que precise de escape em URL", () => {
    const url = buildStartUrl("https://exemplo.test/q", start);
    assert.match(url.slice(url.indexOf("=") + 1), /^[A-Za-z0-9_-]+$/);
  });

  it("preserva a hash existente do returnUrl", () => {
    const url = buildResultUrl(result, "http://localhost:3000/student#tab=goals");
    assert.ok(url.includes("#tab=goals&"));
    assert.equal(parseResultHash(hashOf(url)).body.requestId, result.requestId);
  });
});

describe("rejeição", () => {
  const expectError = (fn: () => unknown, code: ProtocolError["code"]) => {
    assert.throws(fn, (e: unknown) => e instanceof ProtocolError && e.code === code);
  };

  it("fragmento ausente", () => {
    expectError(() => parseStartHash("#outraCoisa=abc"), "missing_fragment");
  });

  it("base64 inválido", () => {
    expectError(() => parseStartHash(`#${HASH_KEYS.start}=!!!nao-e-base64!!!`), "invalid_base64");
  });

  it("versão de protocolo diferente", () => {
    const envelope = { protocol: PROTOCOL_VERSION + 1, kind: "quiz.start", body: start };
    const b64 = btoa(JSON.stringify(envelope))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expectError(() => parseStartHash(`#${HASH_KEYS.start}=${b64}`), "incompatible_version");
  });

  it("tipo trocado entre as duas direções", () => {
    const url = buildResultUrl(result, "http://x.test/a");
    expectError(() => parseStartHash(hashOf(url)), "missing_fragment");
  });

  it("campo obrigatório faltando", () => {
    const { quizSessionId: _omitted, ...withoutId } = start;
    const url = buildStartUrl("https://x.test/q", withoutId as QuizStart);
    expectError(() => parseStartHash(hashOf(url)), "invalid_body");
  });

  it("reforço sem sourceQuestionId", () => {
    const broken: QuizResult = {
      ...result,
      answers: [{ ...result.answers[1]!, sourceQuestionId: null }],
    };
    expectError(() => parseResultHash(hashOf(buildResultUrl(broken, "http://x.test/a"))), "invalid_body");
  });

  it("questão principal com sourceQuestionId preenchido", () => {
    const broken: QuizResult = {
      ...result,
      answers: [{ ...result.answers[0]!, sourceQuestionId: 999 }],
    };
    expectError(() => parseResultHash(hashOf(buildResultUrl(broken, "http://x.test/a"))), "invalid_body");
  });

  it("data que não é ISO", () => {
    const broken: QuizResult = {
      ...result,
      answers: [{ ...result.answers[0]!, answeredAt: "ontem" }],
    };
    expectError(() => parseResultHash(hashOf(buildResultUrl(broken, "http://x.test/a"))), "invalid_body");
  });
});

describe("hashHasPayload", () => {
  it("detecta sem validar o corpo", () => {
    assert.equal(hashHasPayload(`#${HASH_KEYS.start}=lixo`, HASH_KEYS.start), true);
    assert.equal(hashHasPayload(`#${HASH_KEYS.start}=lixo`, HASH_KEYS.result), false);
    assert.equal(hashHasPayload("", HASH_KEYS.start), false);
  });
});

describe("protocolo 2", () => {
  it("recusa um payload da versão 1", () => {
    // O envelope antigo trazia `protocol: 1` e `availableQuestions: number[]`.
    // Quem tem a extensão desatualizada precisa de uma mensagem acionável, não
    // de um campo faltando em runtime.
    const antigo = { protocol: 1, kind: "quiz.start", body: { ...start, availableQuestions: [1] } };
    const hash = `#${HASH_KEYS.start}=${Buffer.from(JSON.stringify(antigo))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}`;

    assert.throws(
      () => parseStartHash(hash),
      (error: unknown) =>
        error instanceof ProtocolError && error.code === "incompatible_version",
    );
  });

  it("recusa availableQuestions em forma de número", () => {
    const url = buildStartUrl("https://tec.example/questoes", {
      ...start,
      // Forma da versão 1, forçada: precisa falhar na validação, e não passar
      // adiante um item sem `id`.
      availableQuestions: [1, 2] as never,
    });
    assert.throws(
      () => parseStartHash(`#${url.split("#")[1]}`),
      (error: unknown) => error instanceof ProtocolError && error.code === "invalid_body",
    );
  });
});
