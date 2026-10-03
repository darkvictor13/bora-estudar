import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { buildNeedles, MIN_LENGTH, readContent, scanDist } from "./check-dist-content.mjs";

// Spec 41, CA-02: a varredura reprova o dist que leva conteúdo, e aprova o
// limpo e o que só leva a amostra.

const needles = buildNeedles(readContent());
const work = mkdtempSync(path.join(tmpdir(), "dist-content-"));
after(() => rmSync(work, { recursive: true, force: true }));

let counter = 0;
function dist(files) {
  const dir = path.join(work, `dist-${(counter += 1)}`);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

const texts = readContent();
const card = texts.find(({ source, text }) => source.startsWith("cartão") && text.length >= MIN_LENGTH && !text.includes("\n")).text;
const quoted = texts.find(({ text }) => text.length >= MIN_LENGTH && text.includes('"') && !text.includes("\n")).text;
const multiline = texts.find(({ text }) => text.includes("\n") && text.split("\n").some((line) => line.trim().length >= MIN_LENGTH)).text;
const article = texts.find(({ source, text }) => source.startsWith("artigo") && text.length >= MIN_LENGTH).text;

test("o conteúdo de referência tem cartões e artigos", () => {
  assert.ok(texts.some(({ source }) => source.startsWith("cartão")));
  assert.ok(texts.some(({ source }) => source.startsWith("artigo")));
  assert.ok(needles.count > 1000);
});

test("um dist limpo passa", () => {
  assert.deepEqual(scanDist(dist({ "index.html": "<!doctype html><title>Bora</title>", "assets/index-abc.js": "console.log('nada aqui');" }), needles), []);
});

test("cartão cru num template literal reprova, nomeando arquivo e trecho", () => {
  const found = scanDist(dist({ "assets/chunk-1.js": `const deck=[{front:\`${card}\`}];` }), needles);
  assert.equal(found.length >= 1, true);
  assert.equal(found[0].file, path.join("assets", "chunk-1.js"));
  assert.equal(found[0].line, card.trim());
  assert.match(found[0].source, /^cartão /);
});

test("trecho com aspas, escapado como string JSON, reprova", () => {
  const body = `export default ${JSON.stringify({ text: quoted })};`;
  assert.ok(!body.includes(quoted), "o teste precisa da forma escapada, não da crua");
  assert.ok(scanDist(dist({ "assets/chunk-2.js": body }), needles).length >= 1);
});

test("texto de várias linhas reprova pela linha, mesmo escapado", () => {
  assert.ok(scanDist(dist({ "assets/chunk-3.js": JSON.stringify(multiline) }), needles).length >= 1);
});

test("parágrafo de artigo reprova", () => {
  const found = scanDist(dist({ "assets/law.js": `p:"${article}"` }), needles);
  assert.ok(found.some(({ source }) => source.startsWith("artigo ")));
});

test("a amostra da fixtures passa", () => {
  const sample = readFileSync(new URL("../apps/web/src/lib/api/fixtures-content.ts", import.meta.url), "utf8");
  assert.deepEqual(scanDist(dist({ "assets/fixtures.js": sample }), needles), []);
});

test("arquivo binário não é lido", () => {
  assert.deepEqual(scanDist(dist({ "materials/aula.pdf": card }), needles), []);
});
