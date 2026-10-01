// A carga do Vade Mecum contra o Supabase local (spec 40).
//
// Roda em `npm run db:test`, depois das suítes SQL. Cada teste abre uma
// transação e a desfaz no fim; o de recusa comita de propósito, para provar
// que não comitou nada.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import pg from "pg";

import { connectionString } from "./load-library-flashcards.mjs";
import { loadLawLibrary, readLawLibrary, runLawLoad, validateLawLibrary } from "./load-law-library.mjs";

const client = new pg.Client({ connectionString: connectionString([]) });
const pristine = readLawLibrary();
const library = () => structuredClone(pristine);
const article = pristine.articles.find((item) => item.id === "ld-art-33") ?? pristine.articles[0];

async function inRollback(body) {
  await client.query("begin");
  try {
    return await body();
  } finally {
    await client.query("rollback");
  }
}

before(() => client.connect());
after(() => client.end());

test("CA-02: carregar de novo o mesmo arquivo não escreve nada", () => inRollback(async () => {
  const changed = await loadLawLibrary(client, library());
  assert.ok(Object.values(changed).every((count) => count === 0), JSON.stringify(changed));
}));

test("CA-02: o artigo que some é retirado, e volta com o mesmo id", () => inRollback(async () => {
  const without = library();
  without.articles = without.articles.filter((item) => item.id !== article.id);
  assert.equal((await loadLawLibrary(client, without)).retired, 1);
  assert.notEqual((await client.query("select retired_at from public.law_articles where id = $1", [article.id])).rows[0].retired_at, null);
  assert.equal((await loadLawLibrary(client, library())).articles, 1);
  assert.equal((await client.query("select retired_at from public.law_articles where id = $1", [article.id])).rows[0].retired_at, null);
}));

test("corrigir um parágrafo edita o artigo no lugar", () => inRollback(async () => {
  const edited = library();
  const target = edited.articles.find((item) => item.id === article.id);
  target.paragraphs = [`${target.paragraphs[0]} (corrigido)`, ...target.paragraphs.slice(1)];
  const changed = await loadLawLibrary(client, edited);
  assert.equal(changed.articles, 1);
  assert.equal(changed.retired, 0);
}));

test("o item de edital que sai do arquivo sai do banco", () => inRollback(async () => {
  const fewer = library();
  const last = fewer.items.at(-1);
  fewer.items = fewer.items.slice(0, -1);
  assert.equal((await loadLawLibrary(client, fewer)).removed, 1);
  const { rowCount } = await client.query(
    "select 1 from public.exam_notice_items where notice_id = $1 and section_position = $2 and position = $3",
    [last.notice_id, last.section_position, last.position],
  );
  assert.equal(rowCount, 0);
}));

test("mapa e biblioteca que discordam sobre a lei de uma norma são recusados antes do banco", () => {
  const broken = library();
  const item = broken.items.find((entry) => entry.libraryId);
  item.libraryId = "outra";
  assert.throws(() => validateLawLibrary(broken), /é a lei outra/);
});

test("artigo duplicado é recusado antes do banco", () => {
  const twice = library();
  twice.articles.push({ ...twice.articles[0] });
  assert.throws(() => validateLawLibrary(twice), /duplicado/);
});

test("falha no meio da carga não deixa escrita parcial", async () => {
  const bad = library();
  const first = bad.articles.find((item) => item.id === article.id);
  first.label = `${article.label} (não pode ficar)`;
  bad.articles.at(-1).paragraphs = [];
  await assert.rejects(runLawLoad(client, bad), /law_articles_paragraphs_check/);
  const { rows } = await client.query("select label from public.law_articles where id = $1", [article.id]);
  assert.equal(rows[0].label, article.label);
});
