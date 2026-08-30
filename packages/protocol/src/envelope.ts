/**
 * Versão do protocolo. As duas pontas comparam este número.
 *
 * Incremente ao fazer uma mudança incompatível. A extensão instalada é sempre
 * mais antiga que o site (o usuário atualiza quando quer), então o site precisa
 * detectar e avisar em vez de enviar um payload que a extensão não entende.
 *
 * Histórico:
 *   1 → 2  `availableQuestions` deixou de ser `number[]` e passou a carregar o
 *          tópico de cada questão. Sem ele não existe reforço correlato "do
 *          mesmo tópico", e a extensão não fala com o Supabase para buscá-lo.
 *          Ver docs/specs/21-fases-na-extensao.md.
 */
export const PROTOCOL_VERSION = 2 as const;

/** Chaves do fragmento da URL usadas em cada direção. */
export const HASH_KEYS = {
  /** Site → extensão: inicia uma sessão de questões. */
  start: "boraQuizStart",
  /** Extensão → site: devolve o resultado. */
  result: "boraQuizResult",
} as const;

export type HashKey = (typeof HASH_KEYS)[keyof typeof HASH_KEYS];

export interface Envelope<TKind extends string, TBody> {
  readonly protocol: typeof PROTOCOL_VERSION;
  readonly kind: TKind;
  readonly body: TBody;
}

export type ProtocolErrorCode =
  | "missing_fragment"
  | "invalid_base64"
  | "invalid_json"
  | "incompatible_version"
  | "unexpected_kind"
  | "invalid_body";

export class ProtocolError extends Error {
  // Campo declarado e atribuído no corpo, e não como parameter property: o
  // modo strip-only do Node (`node --test arquivo.ts`) só remove tipos, não
  // gera código, então parameter property quebra a execução sem build.
  readonly code: ProtocolErrorCode;

  constructor(message: string, code: ProtocolErrorCode) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}
