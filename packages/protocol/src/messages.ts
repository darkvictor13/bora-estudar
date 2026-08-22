import { type Envelope } from "./envelope.ts";

// ---------------------------------------------------------------------------
// Site → extensão
// ---------------------------------------------------------------------------

/**
 * Uma questão que o aluno já respondeu neste bloco, em sessões concluídas.
 * A extensão usa isto para não repetir questão já vista.
 */
export interface SeenQuestion {
  readonly questionId: number;
  readonly timesSeen: number;
  readonly correctAnswers: number;
  readonly incorrectAnswers: number;
  /** ISO 8601. */
  readonly lastSeenAt: string;
}

export interface QuizStart {
  /** Para onde a extensão devolve o resultado. Origem exata, sem fragmento. */
  readonly returnUrl: string;
  readonly quizSessionId: string;
  readonly goalId: string;
  readonly studyPlanId: string;
  readonly blockId: string;
  readonly sessionNumber: number;
  /** Quantas questões principais a sessão persegue. */
  readonly mainTarget: number;
  /** Questões do bloco, na ordem do catálogo. */
  readonly availableQuestions: readonly number[];
  readonly history: readonly SeenQuestion[];
  /**
   * `false` quando o site não conseguiu carregar o histórico inteiro.
   *
   * A extensão DEVE degradar visivelmente neste caso, avisando o aluno de que
   * pode haver repetição. A versão anterior marcava o histórico como
   * autoritativo mesmo truncado, e o motor passava a repetir questões em
   * silêncio depois de ~30 sessões no mesmo bloco.
   */
  readonly historyComplete: boolean;
}

export type QuizStartEnvelope = Envelope<"quiz.start", QuizStart>;

// ---------------------------------------------------------------------------
// Extensão → site
// ---------------------------------------------------------------------------

export type QuestionPhase = "main" | "reinforcement" | "extra";
export type QuestionOutcome = "correct" | "incorrect";

export interface QuestionAnswer {
  readonly questionId: number;
  readonly executionOrder: number;
  readonly round: number;
  readonly phase: QuestionPhase;
  readonly outcome: QuestionOutcome;
  readonly topic: string | null;
  /** Obrigatório quando `phase` é "reinforcement". */
  readonly sourceQuestionId: number | null;
  /** ISO 8601. */
  readonly answeredAt: string;
}

export interface QuizResult {
  readonly quizSessionId: string;
  /**
   * Chave de idempotência. Gerada UMA vez, quando a sessão é finalizada, e
   * persistida junto do estado antes de qualquer navegação.
   *
   * Toda retentativa reenvia este mesmo valor. Regerá-lo no ponto de uso
   * transforma a proteção do servidor em decoração: cada retry chega ao banco
   * como operação nova.
   */
  readonly requestId: string;
  readonly cancel: boolean;
  readonly answers: readonly QuestionAnswer[];
}

export type QuizResultEnvelope = Envelope<"quiz.result", QuizResult>;

export type AnyEnvelope = QuizStartEnvelope | QuizResultEnvelope;
