import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Spec 41, CA-03: o site não guarda conteúdo nem o importa (R-PUB-03).
 *
 * Substitui o teste da spec 39 (CA-10), que conferia só o import ESTÁTICO —
 * e foi por um import dinâmico que o arquivo dos cartões voltou ao `dist`.
 * Aqui vale qualquer forma de chegar lá: `import`, `import()`, `new URL`, ou
 * um caminho solto num literal.
 */

const web = fileURLToPath(new URL("../../", import.meta.url));
const self = fileURLToPath(import.meta.url);

/** Caminho que chega a `content/`, ou nome de um dos arquivos de conteúdo. */
const CONTENT_REFERENCE = /(?:^|["'`/])content\/(?:flashcards|laws)\b|pf2029-[a-z]+-flashcards\.json|exam-maps\.json|laws\/text\//m;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test("apps/web/src/data não existe", () => {
  assert.equal(existsSync(join(web, "src", "data")), false);
});

test("nenhum arquivo de apps/web/src referencia conteúdo", () => {
  const offenders = walk(join(web, "src"))
    .filter((file) => file !== self && /\.(ts|tsx|js|jsx|css|html)$/.test(file))
    .filter((file) => CONTENT_REFERENCE.test(readFileSync(file, "utf8")))
    .map((file) => relative(web, file));
  assert.deepEqual(offenders, []);
});

test("apps/web/public não publica JSON", () => {
  const offenders = walk(join(web, "public")).filter((file) => file.endsWith(".json")).map((file) => relative(web, file));
  assert.deepEqual(offenders, []);
});

test("o padrão reconhece as formas de chegar ao conteúdo", () => {
  for (const source of [
    `import("../../../../content/flashcards/x.json")`,
    `new URL("content/laws/library/index.json", root)`,
    `import data from "./pf2029-policial-flashcards.json"`,
    `import(\`../data/laws/text/\${id}.json\`)`,
  ]) assert.match(source, CONTENT_REFERENCE, source);
  assert.doesNotMatch(`const content = "texto"; // conteúdo da página`, CONTENT_REFERENCE);
});
