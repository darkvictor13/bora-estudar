import {
  HASH_KEYS,
  PROTOCOL_VERSION,
  ProtocolError,
  type Envelope,
  type HashKey,
} from "./envelope.ts";
import type {
  BateriaInicio,
  BateriaInicioEnvelope,
  BateriaResultado,
  BateriaResultadoEnvelope,
  FaseQuestao,
  QuestaoVista,
  RespostaQuestao,
  ResultadoQuestao,
} from "./messages.ts";

// ---------------------------------------------------------------------------
// base64url — mesma implementação nas duas pontas
// ---------------------------------------------------------------------------
// Usa apenas APIs presentes em navegador e em Node >= 18, para que o mesmo
// código rode no content script, no Next.js e nos testes.

function paraBase64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(codificado: string): string {
  const base64 = codificado.replace(/-/g, "+").replace(/_/g, "/");
  const preenchido = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binario: string;
  try {
    binario = atob(preenchido);
  } catch {
    throw new ProtocolError("fragmento não é base64url válido", "base64_invalido");
  }
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

function invalido(campo: string): never {
  throw new ProtocolError(`campo inválido no payload: ${campo}`, "corpo_invalido");
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function texto(v: unknown, campo: string): string {
  if (typeof v !== "string" || v.length === 0) invalido(campo);
  return v;
}

function textoOuNulo(v: unknown, campo: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") invalido(campo);
  return v.length > 0 ? v : null;
}

function inteiro(v: unknown, campo: string, { min = 0 } = {}): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) invalido(campo);
  return v;
}

function inteiroOuNulo(v: unknown, campo: string): number | null {
  if (v === null || v === undefined) return null;
  return inteiro(v, campo, { min: 1 });
}

function booleano(v: unknown, campo: string): boolean {
  if (typeof v !== "boolean") invalido(campo);
  return v;
}

function lista(v: unknown, campo: string): readonly unknown[] {
  if (!Array.isArray(v)) invalido(campo);
  return v;
}

function dataIso(v: unknown, campo: string): string {
  const s = texto(v, campo);
  if (Number.isNaN(Date.parse(s))) invalido(campo);
  return s;
}

const FASES: readonly FaseQuestao[] = ["principal", "reforco", "extra"];
const RESULTADOS: readonly ResultadoQuestao[] = ["acertou", "errou"];

function umDe<T extends string>(v: unknown, opcoes: readonly T[], campo: string): T {
  const s = texto(v, campo);
  if (!opcoes.includes(s as T)) invalido(campo);
  return s as T;
}

function lerQuestaoVista(v: unknown, i: number): QuestaoVista {
  if (!ehObjeto(v)) invalido(`historico[${i}]`);
  return {
    questaoId: inteiro(v["questaoId"], `historico[${i}].questaoId`, { min: 1 }),
    vezesVista: inteiro(v["vezesVista"], `historico[${i}].vezesVista`, { min: 1 }),
    acertos: inteiro(v["acertos"], `historico[${i}].acertos`),
    erros: inteiro(v["erros"], `historico[${i}].erros`),
    ultimaVez: dataIso(v["ultimaVez"], `historico[${i}].ultimaVez`),
  };
}

function lerResposta(v: unknown, i: number): RespostaQuestao {
  if (!ehObjeto(v)) invalido(`respostas[${i}]`);
  const fase = umDe(v["fase"], FASES, `respostas[${i}].fase`);
  const origemQuestaoId = inteiroOuNulo(v["origemQuestaoId"], `respostas[${i}].origemQuestaoId`);

  // O banco tem o mesmo CHECK. Falhar aqui dá um erro legível na origem, em vez
  // de um 23514 opaco depois de a bateria inteira ter sido respondida.
  if ((fase === "reforco") !== (origemQuestaoId !== null)) {
    invalido(`respostas[${i}].origemQuestaoId (obrigatório se e só se fase="reforco")`);
  }

  return {
    questaoId: inteiro(v["questaoId"], `respostas[${i}].questaoId`, { min: 1 }),
    ordemExecucao: inteiro(v["ordemExecucao"], `respostas[${i}].ordemExecucao`, { min: 1 }),
    rodada: inteiro(v["rodada"], `respostas[${i}].rodada`),
    fase,
    resultado: umDe(v["resultado"], RESULTADOS, `respostas[${i}].resultado`),
    topico: textoOuNulo(v["topico"], `respostas[${i}].topico`),
    origemQuestaoId,
    respondidaEm: dataIso(v["respondidaEm"], `respostas[${i}].respondidaEm`),
  };
}

function lerInicio(v: unknown): BateriaInicio {
  if (!ehObjeto(v)) invalido("corpo");
  return {
    urlRetorno: texto(v["urlRetorno"], "urlRetorno"),
    bateriaId: texto(v["bateriaId"], "bateriaId"),
    metaId: texto(v["metaId"], "metaId"),
    planejamentoId: texto(v["planejamentoId"], "planejamentoId"),
    blocoId: texto(v["blocoId"], "blocoId"),
    numeroBateria: inteiro(v["numeroBateria"], "numeroBateria", { min: 1 }),
    principaisAlvo: inteiro(v["principaisAlvo"], "principaisAlvo", { min: 1 }),
    questoesDisponiveis: lista(v["questoesDisponiveis"], "questoesDisponiveis").map((q, i) =>
      inteiro(q, `questoesDisponiveis[${i}]`, { min: 1 }),
    ),
    historico: lista(v["historico"], "historico").map(lerQuestaoVista),
    historicoCompleto: booleano(v["historicoCompleto"], "historicoCompleto"),
  };
}

function lerResultado(v: unknown): BateriaResultado {
  if (!ehObjeto(v)) invalido("corpo");
  return {
    bateriaId: texto(v["bateriaId"], "bateriaId"),
    requestId: texto(v["requestId"], "requestId"),
    cancelar: booleano(v["cancelar"], "cancelar"),
    respostas: lista(v["respostas"], "respostas").map(lerResposta),
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

function empacotar<K extends string, B>(tipo: K, corpo: B): Envelope<K, B> {
  return { protocolo: PROTOCOL_VERSION, tipo, corpo };
}

/** Monta a URL que leva o aluno ao TEC com a bateria carregada. */
export function montarUrlInicio(baseUrl: string, corpo: BateriaInicio): string {
  const envelope = empacotar("bateria.inicio", corpo);
  return `${baseUrl}#${HASH_KEYS.start}=${paraBase64Url(JSON.stringify(envelope))}`;
}

/** Monta a URL que devolve o resultado ao site. */
export function montarUrlResultado(corpo: BateriaResultado, urlRetorno: string): string {
  const envelope = empacotar("bateria.resultado", corpo);
  const separador = urlRetorno.includes("#") ? "&" : "#";
  return `${urlRetorno}${separador}${HASH_KEYS.result}=${paraBase64Url(JSON.stringify(envelope))}`;
}

function extrairFragmento(hash: string, chave: HashKey): string {
  const bruto = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const parte of bruto.split("&")) {
    const separador = parte.indexOf("=");
    if (separador > 0 && parte.slice(0, separador) === chave) {
      return decodeURIComponent(parte.slice(separador + 1));
    }
  }
  throw new ProtocolError(`fragmento ${chave} ausente na URL`, "fragmento_ausente");
}

function abrir<K extends string>(hash: string, chave: HashKey, tipoEsperado: K): unknown {
  const codificado = extrairFragmento(hash, chave);
  let cru: unknown;
  try {
    cru = JSON.parse(deBase64Url(codificado));
  } catch (erro) {
    if (erro instanceof ProtocolError) throw erro;
    throw new ProtocolError("fragmento não contém JSON válido", "json_invalido");
  }
  if (!ehObjeto(cru)) throw new ProtocolError("envelope não é um objeto", "json_invalido");

  if (cru["protocolo"] !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      `protocolo ${String(cru["protocolo"])} incompatível; esperado ${PROTOCOL_VERSION}`,
      "versao_incompativel",
    );
  }
  if (cru["tipo"] !== tipoEsperado) {
    throw new ProtocolError(
      `envelope do tipo ${String(cru["tipo"])}; esperado ${tipoEsperado}`,
      "tipo_inesperado",
    );
  }
  return cru["corpo"];
}

/** Lê o payload de início a partir de `location.hash`. Lança `ProtocolError`. */
export function lerInicioDaHash(hash: string): BateriaInicioEnvelope {
  return empacotar("bateria.inicio", lerInicio(abrir(hash, HASH_KEYS.start, "bateria.inicio")));
}

/** Lê o resultado a partir de `location.hash`. Lança `ProtocolError`. */
export function lerResultadoDaHash(hash: string): BateriaResultadoEnvelope {
  return empacotar(
    "bateria.resultado",
    lerResultado(abrir(hash, HASH_KEYS.result, "bateria.resultado")),
  );
}

/** `true` se a hash carrega um payload deste protocolo, sem validar o corpo. */
export function hashContemPayload(hash: string, chave: HashKey): boolean {
  try {
    extrairFragmento(hash, chave);
    return true;
  } catch {
    return false;
  }
}
