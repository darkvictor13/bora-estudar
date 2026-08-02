import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllRows, fetchAllRowsInBatches } from "./pagination.ts";

test("fetchAllRows percorre todas as páginas até a primeira página incompleta", async () => {
  const source = Array.from({ length: 1_205 }, (_, index) => index + 1);
  const ranges: Array<[number, number]> = [];

  const result = await fetchAllRows(async (from, to) => {
    ranges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });

  assert.deepEqual(result, source);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1_000, 1_499]]);
});

test("fetchAllRows propaga o erro da página e não retorna resultado parcial", async () => {
  const failure = new Error("falha simulada");

  await assert.rejects(
    () => fetchAllRows(async (from) => (
      from === 0
        ? { data: Array.from({ length: 500 }, (_, index) => index), error: null }
        : { data: null, error: failure }
    )),
    failure,
  );
});

test("fetchAllRowsInBatches limita filtros extensos e pagina cada lote", async () => {
  const values = ["a", "b", "c", "d", "e"];
  const batches: string[][] = [];

  const result = await fetchAllRowsInBatches(
    values,
    async (batch, from) => {
      batches.push(batch);
      return { data: from === 0 ? batch : [], error: null };
    },
    2,
  );

  assert.deepEqual(result, values);
  assert.deepEqual(batches, [["a", "b"], ["c", "d"], ["e"]]);
});
