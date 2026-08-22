import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HASH_KEYS, PROTOCOL_VERSION, ProtocolError } from "./envelope.ts";
import {
  hashContemPayload,
  lerInicioDaHash,
  lerResultadoDaHash,
  montarUrlInicio,
  montarUrlResultado,
} from "./codec.ts";
import type { BateriaInicio, BateriaResultado } from "./messages.ts";

const inicio: BateriaInicio = {
  urlRetorno: "http://localhost:3000/aluno",
  bateriaId: "11111111-1111-4111-8111-111111111111",
  metaId: "22222222-2222-4222-8222-222222222222",
  planejamentoId: "33333333-3333-4333-8333-333333333333",
  blocoId: "44444444-4444-4444-8444-444444444444",
  numeroBateria: 3,
  principaisAlvo: 15,
  questoesDisponiveis: [101, 102, 103],
  historico: [
    { questaoId: 101, vezesVista: 2, acertos: 1, erros: 1, ultimaVez: "2026-08-20T10:00:00.000Z" },
  ],
  historicoCompleto: true,
};

const resultado: BateriaResultado = {
  bateriaId: inicio.bateriaId,
  requestId: "55555555-5555-4555-8555-555555555555",
  cancelar: false,
  respostas: [
    {
      questaoId: 101,
      ordemExecucao: 1,
      rodada: 0,
      fase: "principal",
      resultado: "acertou",
      topico: "Local de crime",
      origemQuestaoId: null,
      respondidaEm: "2026-08-22T10:00:00.000Z",
    },
    {
      questaoId: 900,
      ordemExecucao: 2,
      rodada: 1,
      fase: "reforco",
      resultado: "errou",
      topico: null,
      origemQuestaoId: 101,
      respondidaEm: "2026-08-22T10:05:00.000Z",
    },
  ],
};

const hashDe = (url: string) => url.slice(url.indexOf("#"));

describe("ida e volta", () => {
  it("preserva o payload de início", () => {
    const url = montarUrlInicio("https://www.tecconcursos.com.br/questoes", inicio);
    assert.equal(lerInicioDaHash(hashDe(url)).corpo.bateriaId, inicio.bateriaId);
    assert.deepEqual(lerInicioDaHash(hashDe(url)).corpo, inicio);
  });

  it("preserva o payload de resultado, inclusive campos nulos", () => {
    const url = montarUrlResultado(resultado, "http://localhost:3000/aluno");
    assert.deepEqual(lerResultadoDaHash(hashDe(url)).corpo, resultado);
  });

  it("sobrevive a acentuação e caractere fora do ASCII no tópico", () => {
    const comAcento: BateriaResultado = {
      ...resultado,
      respostas: [{ ...resultado.respostas[0]!, topico: "Cadeia de custódia — perícia 🔬" }],
    };
    const url = montarUrlResultado(comAcento, "http://localhost:3000/aluno");
    assert.equal(lerResultadoDaHash(hashDe(url)).corpo.respostas[0]?.topico, "Cadeia de custódia — perícia 🔬");
  });

  it("não usa caractere que precise de escape em URL", () => {
    const url = montarUrlInicio("https://exemplo.test/q", inicio);
    const codificado = url.slice(url.indexOf("=") + 1);
    assert.match(codificado, /^[A-Za-z0-9_-]+$/);
  });

  it("preserva a hash existente do urlRetorno", () => {
    const url = montarUrlResultado(resultado, "http://localhost:3000/aluno#aba=metas");
    assert.ok(url.includes("#aba=metas&"));
    assert.equal(lerResultadoDaHash(hashDe(url)).corpo.requestId, resultado.requestId);
  });
});

describe("rejeição", () => {
  const esperaErro = (fn: () => unknown, codigo: ProtocolError["codigo"]) => {
    assert.throws(fn, (e: unknown) => e instanceof ProtocolError && e.codigo === codigo);
  };

  it("fragmento ausente", () => {
    esperaErro(() => lerInicioDaHash("#outraCoisa=abc"), "fragmento_ausente");
  });

  it("base64 inválido", () => {
    esperaErro(() => lerInicioDaHash(`#${HASH_KEYS.start}=!!!nao-e-base64!!!`), "base64_invalido");
  });

  it("versão de protocolo diferente", () => {
    const envelope = { protocolo: PROTOCOL_VERSION + 1, tipo: "bateria.inicio", corpo: inicio };
    const b64 = btoa(JSON.stringify(envelope)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    esperaErro(() => lerInicioDaHash(`#${HASH_KEYS.start}=${b64}`), "versao_incompativel");
  });

  it("tipo trocado entre as duas direções", () => {
    const url = montarUrlResultado(resultado, "http://x.test/a");
    esperaErro(() => lerInicioDaHash(hashDe(url)), "fragmento_ausente");
  });

  it("campo obrigatório faltando", () => {
    const { bateriaId: _omitido, ...semId } = inicio;
    const url = montarUrlInicio("https://x.test/q", semId as BateriaInicio);
    esperaErro(() => lerInicioDaHash(hashDe(url)), "corpo_invalido");
  });

  it("reforço sem origemQuestaoId", () => {
    const invalido: BateriaResultado = {
      ...resultado,
      respostas: [{ ...resultado.respostas[1]!, origemQuestaoId: null }],
    };
    const url = montarUrlResultado(invalido, "http://x.test/a");
    esperaErro(() => lerResultadoDaHash(hashDe(url)), "corpo_invalido");
  });

  it("questão principal com origemQuestaoId preenchido", () => {
    const invalido: BateriaResultado = {
      ...resultado,
      respostas: [{ ...resultado.respostas[0]!, origemQuestaoId: 999 }],
    };
    const url = montarUrlResultado(invalido, "http://x.test/a");
    esperaErro(() => lerResultadoDaHash(hashDe(url)), "corpo_invalido");
  });

  it("data que não é ISO", () => {
    const invalido: BateriaResultado = {
      ...resultado,
      respostas: [{ ...resultado.respostas[0]!, respondidaEm: "ontem" }],
    };
    const url = montarUrlResultado(invalido, "http://x.test/a");
    esperaErro(() => lerResultadoDaHash(hashDe(url)), "corpo_invalido");
  });
});

describe("hashContemPayload", () => {
  it("detecta sem validar o corpo", () => {
    assert.equal(hashContemPayload(`#${HASH_KEYS.start}=lixo`, HASH_KEYS.start), true);
    assert.equal(hashContemPayload(`#${HASH_KEYS.start}=lixo`, HASH_KEYS.result), false);
    assert.equal(hashContemPayload("", HASH_KEYS.start), false);
  });
});
