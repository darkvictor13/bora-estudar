import {
  HASH_KEYS,
  PROTOCOL_VERSION,
  ProtocolError,
  type Envelope,
  type HashKey,
} from "./envelope.ts";
import type {
  AvailableQuestion,
  QuestionAnswer,
  QuestionOutcome,
  QuestionPhase,
  QuizResult,
  QuizResultEnvelope,
  QuizStart,
  QuizStartEnvelope,
  SeenQuestion,
} from "./messages.ts";

// ---------------------------------------------------------------------------
// base64url — mesma implementação nas duas pontas
// ---------------------------------------------------------------------------
// Usa apenas APIs presentes em navegador e em Node >= 18, para que o mesmo
// código rode no content script, no site e nos testes.

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ProtocolError("fragmento não é base64url válido", "invalid_base64");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

function invalid(field: string): never {
  throw new ProtocolError(`campo inválido no payload: ${field}`, "invalid_body");
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length === 0) invalid(field);
  return v;
}

function readNullableString(v: unknown, field: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") invalid(field);
  return v.length > 0 ? v : null;
}

function readInteger(v: unknown, field: string, { min = 0 } = {}): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) invalid(field);
  return v;
}

function readNullableInteger(v: unknown, field: string): number | null {
  if (v === null || v === undefined) return null;
  return readInteger(v, field, { min: 1 });
}

function readBoolean(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") invalid(field);
  return v;
}

function readArray(v: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(v)) invalid(field);
  return v;
}

function readIsoDate(v: unknown, field: string): string {
  const s = readString(v, field);
  if (Number.isNaN(Date.parse(s))) invalid(field);
  return s;
}

const PHASES: readonly QuestionPhase[] = ["main", "reinforcement", "extra"];
const OUTCOMES: readonly QuestionOutcome[] = ["correct", "incorrect"];

function readOneOf<T extends string>(v: unknown, options: readonly T[], field: string): T {
  const s = readString(v, field);
  if (!options.includes(s as T)) invalid(field);
  return s as T;
}

function readSeenQuestion(v: unknown, i: number): SeenQuestion {
  if (!isObject(v)) invalid(`history[${i}]`);
  return {
    questionId: readInteger(v["questionId"], `history[${i}].questionId`, { min: 1 }),
    timesSeen: readInteger(v["timesSeen"], `history[${i}].timesSeen`, { min: 1 }),
    correctAnswers: readInteger(v["correctAnswers"], `history[${i}].correctAnswers`),
    incorrectAnswers: readInteger(v["incorrectAnswers"], `history[${i}].incorrectAnswers`),
    lastSeenAt: readIsoDate(v["lastSeenAt"], `history[${i}].lastSeenAt`),
  };
}

function readAnswer(v: unknown, i: number): QuestionAnswer {
  if (!isObject(v)) invalid(`answers[${i}]`);
  const phase = readOneOf(v["phase"], PHASES, `answers[${i}].phase`);
  const sourceQuestionId = readNullableInteger(
    v["sourceQuestionId"],
    `answers[${i}].sourceQuestionId`,
  );

  // O banco tem o mesmo CHECK. Falhar aqui dá um erro legível na origem, em vez
  // de um 23514 opaco depois de a sessão inteira ter sido respondida.
  if ((phase === "reinforcement") !== (sourceQuestionId !== null)) {
    invalid(`answers[${i}].sourceQuestionId (obrigatório se e só se phase="reinforcement")`);
  }

  return {
    questionId: readInteger(v["questionId"], `answers[${i}].questionId`, { min: 1 }),
    executionOrder: readInteger(v["executionOrder"], `answers[${i}].executionOrder`, { min: 1 }),
    round: readInteger(v["round"], `answers[${i}].round`),
    phase,
    outcome: readOneOf(v["outcome"], OUTCOMES, `answers[${i}].outcome`),
    topic: readNullableString(v["topic"], `answers[${i}].topic`),
    sourceQuestionId,
    answeredAt: readIsoDate(v["answeredAt"], `answers[${i}].answeredAt`),
  };
}

function readAvailableQuestion(v: unknown, i: number): AvailableQuestion {
  if (!isObject(v)) invalid(`availableQuestions[${i}]`);
  return {
    id: readInteger(v["id"], `availableQuestions[${i}].id`, { min: 1 }),
    topic: readNullableString(v["topic"], `availableQuestions[${i}].topic`),
  };
}

function readQuizStart(v: unknown): QuizStart {
  if (!isObject(v)) invalid("body");
  return {
    returnUrl: readString(v["returnUrl"], "returnUrl"),
    quizSessionId: readString(v["quizSessionId"], "quizSessionId"),
    goalId: readString(v["goalId"], "goalId"),
    studyPlanId: readString(v["studyPlanId"], "studyPlanId"),
    blockId: readString(v["blockId"], "blockId"),
    sessionNumber: readInteger(v["sessionNumber"], "sessionNumber", { min: 1 }),
    mainTarget: readInteger(v["mainTarget"], "mainTarget", { min: 1 }),
    availableQuestions: readArray(v["availableQuestions"], "availableQuestions").map(
      readAvailableQuestion,
    ),
    history: readArray(v["history"], "history").map(readSeenQuestion),
    historyComplete: readBoolean(v["historyComplete"], "historyComplete"),
  };
}

function readQuizResult(v: unknown): QuizResult {
  if (!isObject(v)) invalid("body");
  return {
    quizSessionId: readString(v["quizSessionId"], "quizSessionId"),
    requestId: readString(v["requestId"], "requestId"),
    cancel: readBoolean(v["cancel"], "cancel"),
    answers: readArray(v["answers"], "answers").map(readAnswer),
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

function wrap<K extends string, B>(kind: K, body: B): Envelope<K, B> {
  return { protocol: PROTOCOL_VERSION, kind, body };
}

/** Monta a URL que leva o aluno ao TEC com a sessão carregada. */
export function buildStartUrl(baseUrl: string, body: QuizStart): string {
  const envelope = wrap("quiz.start", body);
  return `${baseUrl}#${HASH_KEYS.start}=${toBase64Url(JSON.stringify(envelope))}`;
}

/** Monta a URL que devolve o resultado ao site. */
export function buildResultUrl(body: QuizResult, returnUrl: string): string {
  const envelope = wrap("quiz.result", body);
  const separator = returnUrl.includes("#") ? "&" : "#";
  return `${returnUrl}${separator}${HASH_KEYS.result}=${toBase64Url(JSON.stringify(envelope))}`;
}

function extractFragment(hash: string, key: HashKey): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of raw.split("&")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator) === key) {
      return decodeURIComponent(part.slice(separator + 1));
    }
  }
  throw new ProtocolError(`fragmento ${key} ausente na URL`, "missing_fragment");
}

function open<K extends string>(hash: string, key: HashKey, expectedKind: K): unknown {
  const encoded = extractFragment(hash, key);
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded));
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    throw new ProtocolError("fragmento não contém JSON válido", "invalid_json");
  }
  if (!isObject(raw)) throw new ProtocolError("envelope não é um objeto", "invalid_json");

  if (raw["protocol"] !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      `protocolo ${String(raw["protocol"])} incompatível; esperado ${PROTOCOL_VERSION}`,
      "incompatible_version",
    );
  }
  if (raw["kind"] !== expectedKind) {
    throw new ProtocolError(
      `envelope do tipo ${String(raw["kind"])}; esperado ${expectedKind}`,
      "unexpected_kind",
    );
  }
  return raw["body"];
}

/** Lê o payload de início a partir de `location.hash`. Lança `ProtocolError`. */
export function parseStartHash(hash: string): QuizStartEnvelope {
  return wrap("quiz.start", readQuizStart(open(hash, HASH_KEYS.start, "quiz.start")));
}

/** Lê o resultado a partir de `location.hash`. Lança `ProtocolError`. */
export function parseResultHash(hash: string): QuizResultEnvelope {
  return wrap("quiz.result", readQuizResult(open(hash, HASH_KEYS.result, "quiz.result")));
}

/** `true` se a hash carrega um payload deste protocolo, sem validar o corpo. */
export function hashHasPayload(hash: string, key: HashKey): boolean {
  try {
    extractFragment(hash, key);
    return true;
  } catch {
    return false;
  }
}
