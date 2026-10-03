import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(await readFile(path.join(root, "content/laws/library/index.json"), "utf8"));

test("o primeiro lote tem 15 leis canônicas, fonte oficial e artigos íntegros", async () => {
  assert.equal(index.length, 15);
  assert.equal(new Set(index.map((law) => law.id)).size, index.length);

  let total = 0;
  for (const law of index) {
    assert.match(law.officialUrl, /^https:\/\/www\.planalto\.gov\.br\//);
    const doc = JSON.parse(await readFile(path.join(root, "content/laws/library/text", `${law.id}.json`), "utf8"));
    assert.equal(doc.id, law.id);
    assert.equal(doc.articles.length, law.articleCount);
    assert.equal(new Set(doc.articles.map((article) => article.id)).size, doc.articles.length);
    assert.ok(doc.articles.every((article) => article.paragraphs.length > 0));
    assert.ok(doc.articles.every((article) => article.paragraphs.every((paragraph) => !/\\[#*_]/.test(paragraph))));
    total += doc.articles.length;
  }
  assert.equal(total, 768);
});

test("artigos incluídos posteriormente seguem a ordem da lei", async () => {
  const doc = JSON.parse(await readFile(path.join(root, "content/laws/library/text/l9296.json"), "utf8"));
  const labels = doc.articles.map((article) => article.label);
  assert.deepEqual(labels.slice(7, 12), ["Art. 8", "Art. 8-A", "Art. 9", "Art. 10", "Art. 10-A"]);
});
