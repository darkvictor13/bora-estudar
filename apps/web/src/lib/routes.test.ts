import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROUTES, safeInternalPath } from "./routes.ts";

const FALLBACK = ROUTES.resetPassword;

describe("safeInternalPath — QA-02", () => {
  it("recusa os três payloads do relatório, que o navegador lê como outro site", () => {
    for (const raw of ["/\\evil.example/x", "/\t/evil.example/x", "/\\\\evil.example"]) {
      assert.equal(safeInternalPath(raw, FALLBACK), FALLBACK, JSON.stringify(raw));
    }
  });

  it("recusa o que a normalização transforma em `//host`", () => {
    for (const raw of ["/.//evil.example/x", "/%2e//evil.example"]) {
      assert.equal(safeInternalPath(raw, FALLBACK), FALLBACK, raw);
    }
  });

  it("recusa URL absoluta, esquema perigoso e caminho sem barra inicial", () => {
    for (const raw of ["//evil.example", "https://evil.example", "javascript:alert(1)", "aluno"]) {
      assert.equal(safeInternalPath(raw, FALLBACK), FALLBACK, raw);
    }
  });

  it("recusa ausente e vazio", () => {
    for (const raw of [null, undefined, ""]) {
      assert.equal(safeInternalPath(raw, FALLBACK), FALLBACK);
    }
  });

  it("recusa as telas públicas, como o React Router as casa", () => {
    for (const raw of ["/confirmar", "/CONFIRMAR/", "/confirm%61r", "/entrar", "/redefinir-senha"]) {
      assert.equal(safeInternalPath(raw, "/aluno"), "/aluno", raw);
    }
  });

  it("recusa `%` malformado", () => {
    assert.equal(safeInternalPath("/aluno/%E0%A4%A", FALLBACK), FALLBACK);
  });

  it("devolve o caminho interno com busca e fragmento", () => {
    assert.equal(safeInternalPath("/aluno?semana=2#x", FALLBACK), "/aluno?semana=2#x");
    assert.equal(safeInternalPath("/", FALLBACK), "/");
  });

  it("devolve o caminho já normalizado", () => {
    assert.equal(safeInternalPath("/aluno/../professor", FALLBACK), "/professor");
  });

  it("aceita `/%2F%2Fhost`: é caminho interno, e o router não o lê como absoluto", () => {
    assert.equal(safeInternalPath("/%2F%2Fevil.example", FALLBACK), "/%2F%2Fevil.example");
  });

  it("não valida o fallback: ele é constante de quem chama", () => {
    assert.equal(safeInternalPath(null, "/aluno"), "/aluno");
  });
});
