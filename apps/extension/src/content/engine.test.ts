import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_CORRELATE_DEPTH,
  answersForResult,
  appendExtraRound,
  canAnswer,
  nextUnanswered,
  pickCorrelate,
  pickQuestions,
  progressOf,
  type QueueItem,
} from "./engine.ts";
import type { AvailableQuestion, QuestionAnswer, QuizStart, SeenQuestion } from "@bora/protocol";

const seen = (questionId: number, extra: Partial<SeenQuestion> = {}): SeenQuestion => ({
  questionId,
  timesSeen: 1,
  correctAnswers: 1,
  incorrectAnswers: 0,
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

/** Questão do catálogo. Sem tópico, salvo quando o teste precisa de um. */
const q = (id: number, topic: string | null = null): AvailableQuestion => ({ id, topic });

const start = (over: Partial<QuizStart> = {}): QuizStart => ({
  returnUrl: "http://x.test/aluno",
  quizSessionId: "s",
  goalId: "g",
  studyPlanId: "p",
  blockId: "b",
  sessionNumber: 1,
  mainTarget: 3,
  availableQuestions: [q(1), q(2), q(3), q(4), q(5)],
  history: [],
  historyComplete: true,
  ...over,
});

/** Só os ids da fila, que é o que a maioria das asserções compara. */
const ids = (queue: readonly QueueItem[]) => queue.map((item) => item.id);

describe("pickQuestions", () => {
  it("respeita o alvo de principais", () => {
    assert.equal(pickQuestions(start()).length, 3);
    assert.equal(pickQuestions(start({ mainTarget: 10 })).length, 5);
  });

  it("marca tudo como principal, rodada 0, sem origem", () => {
    const fila = pickQuestions(start({ mainTarget: 2 }));
    assert.ok(fila.every((i) => i.phase === "main" && i.round === 0 && i.depth === 0));
    assert.ok(fila.every((i) => i.sourceQuestionId === null));
  });

  it("põe as inéditas antes de qualquer vista", () => {
    const fila = pickQuestions(start({ mainTarget: 3, history: [seen(1), seen(2)] }));
    assert.deepEqual(ids(fila), [3, 4, 5]);
  });

  it("entre as vistas, prioriza a que tem mais erros", () => {
    const fila = pickQuestions(
      start({
        mainTarget: 2,
        availableQuestions: [q(1), q(2), q(3)],
        history: [
          seen(1, { incorrectAnswers: 0 }),
          seen(2, { incorrectAnswers: 5 }),
          seen(3, { incorrectAnswers: 2 }),
        ],
      }),
    );
    assert.deepEqual(ids(fila), [2, 3]);
  });

  it("desempata erros iguais pela vista há mais tempo", () => {
    const fila = pickQuestions(
      start({
        mainTarget: 2,
        availableQuestions: [q(1), q(2), q(3)],
        history: [
          seen(1, { incorrectAnswers: 1, lastSeenAt: "2026-05-01T00:00:00.000Z" }),
          seen(2, { incorrectAnswers: 1, lastSeenAt: "2026-01-01T00:00:00.000Z" }),
          seen(3, { incorrectAnswers: 1, lastSeenAt: "2026-03-01T00:00:00.000Z" }),
        ],
      }),
    );
    assert.deepEqual(ids(fila), [2, 3]);
  });

  it("é determinística: mesma entrada, mesma fila", () => {
    const entrada = start({
      mainTarget: 4,
      availableQuestions: [q(9), q(4), q(7), q(1), q(3)],
      history: [seen(4), seen(7)],
    });
    assert.deepEqual(pickQuestions(entrada), pickQuestions(entrada));
  });

  it("não quebra com bloco menor que o alvo", () => {
    assert.deepEqual(
      ids(pickQuestions(start({ availableQuestions: [q(7)], mainTarget: 15 }))),
      [7],
    );
  });

  it("carrega o tópico de cada questão para a fila", () => {
    const fila = pickQuestions(
      start({ mainTarget: 1, availableQuestions: [q(1, "Tipicidade")] }),
    );
    assert.equal(fila[0]?.topic, "Tipicidade");
  });
});

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: 1,
  topic: null,
  phase: "main",
  round: 0,
  sourceQuestionId: null,
  depth: 0,
  ...over,
});

describe("pickCorrelate", () => {
  const catalogo = start({
    availableQuestions: [
      q(1, "Tipicidade"),
      q(2, "Ilicitude"),
      q(3, "Tipicidade"),
      q(4, "Culpabilidade"),
    ],
  });

  it("escolhe do MESMO tópico da questão errada", () => {
    const fila = [item({ id: 1, topic: "Tipicidade" })];
    const correlata = pickCorrelate(catalogo, fila[0]!, fila);
    assert.equal(correlata?.id, 3);
    assert.equal(correlata?.topic, "Tipicidade");
  });

  it("marca fase, origem e profundidade", () => {
    const fila = [item({ id: 1, topic: "Tipicidade" })];
    const correlata = pickCorrelate(catalogo, fila[0]!, fila);
    assert.equal(correlata?.phase, "reinforcement");
    assert.equal(correlata?.sourceQuestionId, 1);
    assert.equal(correlata?.depth, 1);
  });

  it("herda a rodada da origem", () => {
    const origem = item({ id: 2, topic: "Ilicitude", phase: "extra", round: 2 });
    const correlata = pickCorrelate(catalogo, origem, [origem]);
    assert.equal(correlata?.round, 2);
  });

  it("cai para qualquer tópico quando o da origem esgotou", () => {
    // 1 e 3 são de Tipicidade e as duas já estão na fila.
    const fila = [item({ id: 1, topic: "Tipicidade" }), item({ id: 3, topic: "Tipicidade" })];
    const correlata = pickCorrelate(catalogo, fila[0]!, fila);
    assert.ok(correlata);
    assert.notEqual(correlata?.topic, "Tipicidade");
  });

  it("nunca repete questão que já está na fila", () => {
    const fila = [q(1), q(2), q(3), q(4)].map((question, index) =>
      item({ id: question.id, topic: question.topic, depth: index === 0 ? 0 : 1 }),
    );
    assert.equal(pickCorrelate(catalogo, fila[0]!, fila), null);
  });

  it("para na profundidade máxima", () => {
    const origem = item({ id: 1, topic: "Tipicidade", depth: MAX_CORRELATE_DEPTH });
    assert.equal(pickCorrelate(catalogo, origem, [origem]), null);
  });

  it("origem sem tópico ainda gera correlata, de qualquer tópico", () => {
    const origem = item({ id: 1, topic: null });
    assert.ok(pickCorrelate(catalogo, origem, [origem]));
  });
});

describe("appendExtraRound", () => {
  const catalogo = start({
    availableQuestions: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => q(id)),
  });

  it("acrescenta exatamente 5", () => {
    const fila = [item({ id: 1 }), item({ id: 2 })];
    const extras = appendExtraRound(catalogo, fila);
    assert.equal(extras?.length, 5);
    assert.ok(extras?.every((e) => e.phase === "extra"));
  });

  it("incrementa a rodada", () => {
    const fila = [item({ id: 1 })];
    const primeira = appendExtraRound(catalogo, fila)!;
    assert.ok(primeira.every((e) => e.round === 1));

    const segunda = appendExtraRound(
      start({ availableQuestions: Array.from({ length: 20 }, (_, i) => q(i + 1)) }),
      [...fila, ...primeira],
    )!;
    assert.ok(segunda.every((e) => e.round === 2));
  });

  it("é tudo ou nada: sem 5 inéditas, não acrescenta nenhuma", () => {
    // 8 questões no catálogo, 4 já na fila: sobram 4.
    const fila = [1, 2, 3, 4].map((id) => item({ id }));
    assert.equal(appendExtraRound(catalogo, fila), null);
  });
});

const answer = (
  questionId: number,
  outcome: "correct" | "incorrect",
  phase: QuestionAnswer["phase"] = "main",
  round = 0,
): QuestionAnswer => ({
  questionId,
  executionOrder: questionId,
  round,
  phase,
  outcome,
  topic: null,
  sourceQuestionId: phase === "reinforcement" ? 1 : null,
  answeredAt: "2026-08-22T10:00:00.000Z",
});

describe("nextUnanswered", () => {
  it("devolve a primeira sem resposta, respeitando a ordem da fila", () => {
    const fila = [5, 6, 7].map((id) => item({ id }));
    assert.equal(nextUnanswered(fila, { "5": answer(5, "correct") }), 6);
  });

  it("devolve null quando tudo foi respondido", () => {
    const fila = [5, 6].map((id) => item({ id }));
    assert.equal(
      nextUnanswered(fila, { "5": answer(5, "correct"), "6": answer(6, "incorrect") }),
      null,
    );
  });
});

describe("canAnswer", () => {
  const principal = item({ id: 1 });
  const correlata = item({ id: 2, phase: "reinforcement", sourceQuestionId: 1, depth: 1 });

  it("principal pode sempre", () => {
    assert.equal(canAnswer(principal, [principal, correlata], {}), true);
  });

  it("correlata não pode enquanto houver principal pendente", () => {
    assert.equal(canAnswer(correlata, [principal, correlata], {}), false);
  });

  it("correlata pode quando as principais acabaram", () => {
    assert.equal(
      canAnswer(correlata, [principal, correlata], { "1": answer(1, "incorrect") }),
      true,
    );
  });

  it("correlata de rodada > 0 espera as extras da MESMA rodada", () => {
    const extra1 = item({ id: 3, phase: "extra", round: 1 });
    const extra2 = item({ id: 4, phase: "extra", round: 1 });
    const correlataR1 = item({
      id: 5,
      phase: "reinforcement",
      round: 1,
      sourceQuestionId: 3,
      depth: 1,
    });
    const fila = [principal, extra1, extra2, correlataR1];
    const feitas = { "1": answer(1, "correct"), "3": answer(3, "incorrect", "extra", 1) };

    assert.equal(canAnswer(correlataR1, fila, feitas), false);
    assert.equal(
      canAnswer(correlataR1, fila, { ...feitas, "4": answer(4, "correct", "extra", 1) }),
      true,
    );
  });
});

describe("progressOf", () => {
  it("conta por fase", () => {
    const fila = [1, 2, 3].map((id) => item({ id }));
    const p = progressOf(
      fila,
      {
        "1": answer(1, "correct"),
        "2": answer(2, "incorrect"),
        "3": answer(3, "correct", "reinforcement"),
      },
      2,
    );
    assert.deepEqual(p, {
      answered: 3,
      total: 3,
      correct: 2,
      incorrect: 1,
      main: 2,
      mainTarget: 2,
      reinforcement: 1,
      extra: 0,
    });
  });
});

describe("answersForResult", () => {
  const feitas = {
    "1": answer(1, "correct"),
    "2": answer(2, "incorrect"),
    "3": answer(3, "correct", "reinforcement"),
    "4": answer(4, "correct", "extra", 1),
  };

  it("com todas as principais feitas, manda tudo", () => {
    assert.equal(answersForResult(feitas, 2).length, 4);
  });

  it("na finalização antecipada, DESCARTA o que não é principal", () => {
    // 2 principais de um alvo de 15: correlata e extra ficam de fora, senão
    // finish_quiz_session recusaria a bateria inteira.
    const parcial = answersForResult(feitas, 15);
    assert.equal(parcial.length, 2);
    assert.ok(parcial.every((a) => a.phase === "main"));
  });
});

// ---------------------------------------------------------------------------
// Rodízio por tópico — spec docs/specs/22-rodizio-por-topico.md
// ---------------------------------------------------------------------------

/** Conta quantas questões de cada tópico saíram na fila. */
const porTopico = (queue: readonly QueueItem[]) => {
  const contagem = new Map<string, number>();
  for (const item of queue) {
    const key = item.topic ?? "";
    contagem.set(key, (contagem.get(key) ?? 0) + 1);
  }
  return contagem;
};

/** Bloco com `n` tópicos de `porTopico` questões cada. */
const blocoComTopicos = (nomes: readonly string[], cada: number): AvailableQuestion[] =>
  nomes.flatMap((nome, t) =>
    Array.from({ length: cada }, (_, i) => q(t * 100 + i + 1, nome)),
  );

describe("rodízio por tópico", () => {
  it("com três tópicos de tamanho igual, 15 saem 5 de cada", () => {
    const fila = pickQuestions(
      start({ mainTarget: 15, availableQuestions: blocoComTopicos(["A", "B", "C"], 10) }),
    );
    assert.equal(fila.length, 15);
    assert.deepEqual([...porTopico(fila)].sort(), [["A", 5], ["B", 5], ["C", 5]]);
  });

  it("o tópico já coberto pelo histórico entra menos", () => {
    const disponiveis = blocoComTopicos(["A", "B"], 10);
    // Metade de A já foi vista; B está intocado.
    const historico = disponiveis
      .filter((question) => question.topic === "A")
      .slice(0, 5)
      .map((question) => seen(question.id));

    const fila = pickQuestions(
      start({ mainTarget: 6, availableQuestions: disponiveis, history: historico }),
    );
    const contagem = porTopico(fila);
    assert.ok(
      contagem.get("B")! > contagem.get("A")!,
      `B deveria entrar mais que A: ${JSON.stringify([...contagem])}`,
    );
  });

  it("empate resolve pelo tópico maior", () => {
    // A tem 10 e B tem 2; nenhum visto. Com uma vaga só, A ganha.
    const fila = pickQuestions(
      start({
        mainTarget: 1,
        availableQuestions: [...blocoComTopicos(["A"], 10), ...blocoComTopicos(["B"], 2)],
      }),
    );
    assert.equal(fila[0]?.topic, "A");
  });

  it("é determinística", () => {
    const entrada = start({
      mainTarget: 7,
      availableQuestions: blocoComTopicos(["A", "B", "C"], 5),
      history: [seen(101), seen(202)],
    });
    assert.deepEqual(pickQuestions(entrada), pickQuestions(entrada));
  });

  it("bloco sem tópico nenhum degrada para a fila anterior", () => {
    // Todas com topic null: um grupo só, e a ordem é a de sempre.
    const fila = pickQuestions(
      start({
        mainTarget: 3,
        availableQuestions: [q(1), q(2), q(3), q(4)],
        history: [seen(1), seen(2)],
      }),
    );
    assert.deepEqual(ids(fila), [3, 4, 1]);
  });

  it("a rodada extra também respeita o rodízio", () => {
    const disponiveis = blocoComTopicos(["A", "B", "C"], 5);
    const entrada = start({ mainTarget: 3, availableQuestions: disponiveis });
    const fila = pickQuestions(entrada);

    const extras = appendExtraRound(entrada, fila)!;
    assert.equal(extras.length, 5);
    // Com 3 principais (uma de cada) e 5 extras, nenhum tópico passa de 3.
    const contagem = porTopico([...fila, ...extras]);
    assert.ok(
      [...contagem.values()].every((n) => n <= 3),
      `nenhum tópico deveria passar de 3: ${JSON.stringify([...contagem])}`,
    );
  });

  it("não repete questão entre a primeira e a segunda bateria", () => {
    const disponiveis = blocoComTopicos(["A", "B", "C"], 10);
    const primeira = pickQuestions(start({ mainTarget: 15, availableQuestions: disponiveis }));

    // A segunda bateria enxerga as 15 primeiras como vistas.
    const segunda = pickQuestions(
      start({
        mainTarget: 15,
        availableQuestions: disponiveis,
        history: primeira.map((item) => seen(item.id)),
      }),
    );

    const repetidas = segunda.filter((item) => primeira.some((p) => p.id === item.id));
    assert.deepEqual(repetidas, [], "a segunda bateria repetiu questão");
  });
});
