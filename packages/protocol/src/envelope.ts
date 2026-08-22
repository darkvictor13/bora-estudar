/**
 * Versão do protocolo. As duas pontas comparam este número.
 *
 * Incremente ao fazer uma mudança incompatível. A extensão instalada é sempre
 * mais antiga que o site (o usuário atualiza quando quer), então o site precisa
 * detectar e avisar em vez de enviar um payload que a extensão não entende.
 */
export const PROTOCOL_VERSION = 1 as const;

/** Chaves do fragmento da URL usadas em cada direção. */
export const HASH_KEYS = {
  /** Site → extensão: inicia uma bateria. */
  start: "boraBateriaInicio",
  /** Extensão → site: devolve o resultado. */
  result: "boraBateriaResultado",
} as const;

export type HashKey = (typeof HASH_KEYS)[keyof typeof HASH_KEYS];

export interface Envelope<TKind extends string, TBody> {
  readonly protocolo: typeof PROTOCOL_VERSION;
  readonly tipo: TKind;
  readonly corpo: TBody;
}

export type CodigoErroProtocolo =
  | "fragmento_ausente"
  | "base64_invalido"
  | "json_invalido"
  | "versao_incompativel"
  | "tipo_inesperado"
  | "corpo_invalido";

export class ProtocolError extends Error {
  // Campo declarado e atribuído no corpo, e não como parameter property: o
  // modo strip-only do Node (`node --test arquivo.ts`) só remove tipos, não
  // gera código, então parameter property quebra a execução sem build.
  readonly codigo: CodigoErroProtocolo;

  constructor(message: string, codigo: CodigoErroProtocolo) {
    super(message);
    this.name = "ProtocolError";
    this.codigo = codigo;
  }
}
