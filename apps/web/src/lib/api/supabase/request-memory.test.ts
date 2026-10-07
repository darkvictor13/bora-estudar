/**
 * N-01: `once()` guardava para sempre a promessa REJEITADA. A retentativa
 * recebia o mesmo erro sem reexecutar, e saía uma `unhandledrejection` por
 * falha. Importa `request-memory.ts` e não `idempotency.ts`, que puxa o relato.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiThrownError, type RequestId, type Result } from "../contract.ts";
import { apiErrorFromThrown } from "./error-translation.ts";
import { createOnce } from "./request-memory.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` as RequestId;
const newOnce = () => createOnce((thrown) => ({ ok: false, error: apiErrorFromThrown(thrown) }));

test("operação que lança vira failure: a promessa resolve, não rejeita", async () => {
  const once = newOnce();
  const result = await once(id(1), async () => {
    throw new ApiThrownError("offline", "sem rede");
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "offline");
});

test("depois de um throw a mesma chave reexecuta, e pode dar certo", async () => {
  const once = newOnce();
  let calls = 0;
  const operation = async (): Promise<Result<string>> => {
    calls += 1;
    if (calls === 1) throw new ApiThrownError("offline", "sem rede");
    return { ok: true, data: "gravou" };
  };
  const first = await once(id(2), operation);
  assert.equal(first.ok, false);
  await new Promise(setImmediate);
  const second = await once(id(2), operation);
  assert.equal(calls, 2);
  assert.deepEqual(second, { ok: true, data: "gravou" });
});

test("failure devolvido sem throw também libera a chave", async () => {
  const once = newOnce();
  let calls = 0;
  const operation = async (): Promise<Result<string>> => {
    calls += 1;
    return { ok: false, error: { code: "conflict", message: "x" } };
  };
  await once(id(3), operation);
  await new Promise(setImmediate);
  await once(id(3), operation);
  assert.equal(calls, 2);
});

test("sucesso é memorizado: uma execução, o mesmo valor", async () => {
  const once = newOnce();
  let calls = 0;
  const operation = async (): Promise<Result<{ n: number }>> => {
    calls += 1;
    return { ok: true, data: { n: calls } };
  };
  const first = await once(id(4), operation);
  const second = await once(id(4), operation);
  assert.equal(calls, 1);
  assert.equal(second, first);
});

test("duas chamadas enquanto a primeira roda são uma execução só", async () => {
  const once = newOnce();
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation = async (): Promise<Result<number>> => {
    calls += 1;
    await gate;
    return { ok: true, data: 1 };
  };
  const a = once(id(5), operation);
  const b = once(id(5), operation);
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
});

test("nenhuma unhandledRejection quando a operação lança", async () => {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listener);
  try {
    const once = newOnce();
    await once(id(6), async () => {
      throw new ApiThrownError("unknown", "boom");
    });
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.deepEqual(seen, []);
  } finally {
    process.off("unhandledRejection", listener);
  }
});
