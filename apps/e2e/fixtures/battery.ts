/**
 * Baterias já concluídas, montadas como pré-condição.
 *
 * Várias telas só têm o que mostrar depois de uma bateria: estatísticas,
 * caderno de erros, "Reforço recomendado", os números do professor. Levar cada
 * uma dessas telas até lá pela interface custaria uma bateria inteira por
 * teste, e o que se está testando é a tela, não a bateria — essa tem o
 * `quiz.spec.ts` inteiro dedicado a ela.
 *
 * O caminho aqui passa pelas MESMAS RPCs que o site chama, impersonando o
 * aluno: `start_quiz_session`, `finish_quiz_session` e
 * `record_quiz_session_time`. Nada é inserido no ledger por fora — se uma regra
 * de negócio regredir, a pré-condição falha em vez de fabricar dado impossível.
 */
import { randomUUID } from "node:crypto";
import type { QuestionAnswer } from "@bora/protocol";

import { pickQuestions } from "../../extension/src/content/engine.ts";
import { STUDENT_RETURN_URL } from "../support/app.ts";
import { asUser, query } from "./db.ts";
import { catalogQuestions, type Scenario, type ScenarioGoal } from "./scenario.ts";

interface OpenedSession {
  readonly id: string;
  readonly session_number: number;
  readonly main_target: number;
}

/** Histórico do bloco, na forma que o site envia para a extensão. */
async function historyOf(planId: string, blockId: string) {
  const rows = await query<{
    question_id: string;
    times_seen: string;
    correct_answers: string;
    incorrect_answers: string;
    last_seen_at: string;
  }>(
    `select question_id, times_seen, correct_answers, incorrect_answers, last_seen_at
       from public.vw_seen_questions
      where study_plan_id = $1 and block_id = $2`,
    [planId, blockId],
  );

  return rows.map((row) => ({
    questionId: Number(row.question_id),
    timesSeen: Number(row.times_seen),
    correctAnswers: Number(row.correct_answers),
    incorrectAnswers: Number(row.incorrect_answers),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
  }));
}

export interface CompletedQuiz {
  readonly sessionId: string;
  readonly sessionNumber: number;
  readonly queue: readonly number[];
  readonly correct: number;
  readonly answered: number;
}

export interface CompleteQuizOptions {
  /** Quantas questões da fila são acertos. Ignorado com `incorrectTopics`. */
  readonly correct?: number;
  /**
   * Erra exatamente as questões destes tópicos, e acerta o resto.
   *
   * Existe porque a fila é montada pelo rodízio por tópico, e "as N últimas"
   * não diz em que assunto o aluno errou. Um teste de dificuldade por tópico
   * precisa dizer o assunto, não a posição.
   */
  readonly incorrectTopics?: readonly string[];
  /** Quantas questões são respondidas. Padrão: `main_target` inteiro. */
  readonly answer?: number;
  /** Tempo registrado. `null` deixa a sessão em `awaiting_time`. */
  readonly minutes?: number | null;
}

/**
 * Abre, responde e conclui uma bateria da meta informada.
 *
 * A fila sai do motor real da extensão, alimentado pelo histórico real do
 * bloco: duas baterias seguidas no mesmo bloco não repetem questão, que é a
 * propriedade de que os testes de "segunda bateria" dependem.
 */
export async function completeQuiz(
  scenario: Scenario,
  goal: ScenarioGoal,
  options: CompleteQuizOptions,
): Promise<CompletedQuiz> {
  if (!goal.blockId) throw new Error(`a meta ${goal.title} não é de bateria`);
  const block = scenario.blocks.find((candidate) => candidate.id === goal.blockId);
  if (!block) throw new Error(`bloco ${goal.blockId} não pertence a este cenário`);

  const session = await asUser(scenario.student.id, async (client) => {
    const { rows } = await client.query<OpenedSession>(
      "select * from public.start_quiz_session($1::uuid, $2::uuid, $3::uuid)",
      [scenario.planId, goal.blockId, goal.id],
    );
    if (!rows[0]) throw new Error("start_quiz_session não devolveu sessão");
    return rows[0];
  });

  const queue = pickQuestions({
    returnUrl: STUDENT_RETURN_URL,
    quizSessionId: session.id,
    goalId: goal.id,
    studyPlanId: scenario.planId,
    blockId: block.id,
    sessionNumber: session.session_number,
    mainTarget: session.main_target,
    availableQuestions: await catalogQuestions(block.catalogBlockId),
    history: await historyOf(scenario.planId, block.id),
    historyComplete: true,
  });

  const answered = options.answer ?? queue.length;
  const wrongTopics = options.incorrectTopics;
  const isWrong = (item: { topic: string | null }, index: number) =>
    wrongTopics ? wrongTopics.includes(item.topic ?? "") : index >= (options.correct ?? 0);

  const answers: QuestionAnswer[] = queue.slice(0, answered).map((item, index) => ({
    questionId: item.id,
    executionOrder: index + 1,
    round: 0,
    phase: "main",
    outcome: isWrong(item, index) ? "incorrect" : "correct",
    // O tópico vai porque a extensão o envia (content/index.ts): ele sai do
    // item da fila, que o traz do catálogo. Mandar null aqui deixaria toda
    // bateria de teste agregada como "Tópico não identificado".
    topic: item.topic,
    sourceQuestionId: null,
    answeredAt: new Date().toISOString(),
  }));

  await asUser(scenario.student.id, (client) =>
    client.query(
      "select public.finish_quiz_session($1::uuid, $2::uuid, $3::jsonb, false)",
      [
        session.id,
        randomUUID(),
        JSON.stringify(
          answers.map((answer) => ({
            question_id: answer.questionId,
            execution_order: answer.executionOrder,
            round: answer.round,
            phase: answer.phase,
            outcome: answer.outcome,
            topic: answer.topic,
            source_question_id: answer.sourceQuestionId,
            answered_at: answer.answeredAt,
          })),
        ),
      ],
    ),
  );

  const minutes = options.minutes === undefined ? 85 : options.minutes;
  if (minutes !== null) {
    await asUser(scenario.student.id, (client) =>
      client.query("select public.record_quiz_session_time($1::uuid, $2::uuid, $3::integer)", [
        session.id,
        randomUUID(),
        minutes,
      ]),
    );
  }

  return {
    sessionId: session.id,
    sessionNumber: session.session_number,
    // Só os ids: quem chama compara conjuntos de questões, não itens de fila.
    queue: queue.map((item) => item.id),
    correct: answers.filter((answer) => answer.outcome === "correct").length,
    answered,
  };
}
