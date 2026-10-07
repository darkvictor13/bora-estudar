/**
 * A tradução do erro é o que separa "sem rede" de "defeito" — e só o segundo
 * deve chegar ao painel. Importa `error-translation.ts` e não `errors.ts`: este
 * puxa `@/lib/observability`, que o runner do Node não resolve.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiThrownError } from "../contract.ts";
import {
  INVALID_VALUE_MESSAGE,
  OFFLINE_MESSAGE,
  SERVER_UNAVAILABLE_MESSAGE,
  apiErrorFromThrown,
  studyWriteError,
  translateAuthError,
  translateDbError,
} from "./error-translation.ts";

test("code vazio é rede caída, qualquer que seja o texto do navegador", () => {
  for (const message of [
    "TypeError: Failed to fetch",
    "TypeError: NetworkError when attempting to fetch resource.",
    "TypeError: Load failed",
  ]) {
    assert.deepEqual(translateDbError({ code: "", message }), {
      code: "offline",
      message: OFFLINE_MESSAGE,
    });
  }
});

test("corpo que não era JSON (sem code) vira unknown com frase fixa, sem o HTML", () => {
  const error = translateDbError({ message: "<html>502 Bad Gateway</html>" });
  assert.deepEqual(error, { code: "unknown", message: SERVER_UNAVAILABLE_MESSAGE });
  assert.ok(!error.message.includes("<html>"));
  assert.deepEqual(translateDbError({ code: null, message: "x" }), {
    code: "unknown",
    message: SERVER_UNAVAILABLE_MESSAGE,
  });
});

test("as quatro violações de valor viram validation genérico, sem field", () => {
  for (const code of ["23514", "22P02", "22003", "23502"]) {
    const error = translateDbError({ code, message: "in english" });
    assert.deepEqual(error, { code: "validation", message: INVALID_VALUE_MESSAGE });
    assert.ok(!("field" in error));
  }
});

test("os códigos de antes continuam como eram", () => {
  assert.equal(translateDbError({ code: "42501", message: "m" }).code, "forbidden");
  assert.deepEqual(translateDbError({ code: "P0001", message: "só o professor altera" }), {
    code: "conflict",
    message: "só o professor altera",
  });
  assert.deepEqual(translateDbError({ code: "23505", message: "m" }), {
    code: "conflict",
    message: "Este registro já existe.",
  });
  assert.deepEqual(translateDbError({ code: "23503", message: "m" }), {
    code: "conflict",
    message: "O registro depende de outro que não existe.",
  });
  assert.deepEqual(translateDbError({ code: "PGRST116", message: "m" }), {
    code: "not_found",
    message: "Registro não encontrado.",
  });
});

test("P0002 (no_data_found das RPCs de estudo) é not_found, sem vazar a mensagem do banco", () => {
  assert.deepEqual(translateDbError({ code: "P0002", message: "meta nao encontrada" }), {
    code: "not_found",
    message: "Registro não encontrado.",
  });
});

test("código desconhecido continua unknown com a mensagem original (F-OBS-01 depende disso)", () => {
  assert.deepEqual(translateDbError({ code: "XX999", message: "x" }), { code: "unknown", message: "x" });
});

test("AuthRetryableFetchError usa a mesma constante do banco", () => {
  assert.deepEqual(
    translateAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", code: undefined }),
    { code: "offline", message: OFFLINE_MESSAGE },
  );
});

test("apiErrorFromThrown preserva o código de ApiThrownError e cai em unknown no resto", () => {
  assert.deepEqual(apiErrorFromThrown(new ApiThrownError("offline", OFFLINE_MESSAGE)), {
    code: "offline",
    message: OFFLINE_MESSAGE,
  });
  assert.deepEqual(apiErrorFromThrown(new TypeError("y")), { code: "unknown", message: "y" });
  assert.deepEqual(apiErrorFromThrown("z"), { code: "unknown", message: "z" });
});

test("studyWriteError: 23505 é a mesma chave com outra carga, e o resto segue a tradução comum", () => {
  const conflict = studyWriteError({ code: "23505", message: "duplicate key" });
  assert.equal(conflict.code, "conflict");
  assert.match(conflict.message, /outros valores/);
  assert.deepEqual(studyWriteError({ code: "42501", message: "m" }), translateDbError({ code: "42501", message: "m" }));
  assert.equal(studyWriteError({ code: "P0002", message: "revisao nao encontrada" }).code, "not_found");
});
