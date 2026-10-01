import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCatalog, parseFlashcardSource } from "./import-police-flashcards.mjs";

const { catalog, report } = buildCatalog();

test("importa exatamente os 5108 cartões, separados em 14 matérias e 101 tópicos", () => {
  assert.equal(catalog.totalCards, 5108);
  assert.equal(catalog.subjects.length, 14);
  const decks = catalog.subjects.flatMap((s) => s.decks);
  assert.equal(decks.length, 101);
  assert.equal(new Set(decks.map((d) => d.id)).size, decks.length);
  assert.ok(decks.every((d) => d.cards.length && !/^Complement/i.test(d.title)));
  assert.deepEqual(catalog, JSON.parse(readFileSync(new URL("../apps/web/src/data/pf2029-policial-flashcards.json", import.meta.url), "utf8")));
});

test("todo cartão antigo continua endereçável sem descartar revisões", () => {
  const old = JSON.parse(readFileSync(new URL("../apps/web/src/data/pf2029-informatica-flashcards.json", import.meta.url), "utf8"));
  const references = new Set(catalog.subjects[0].decks.flatMap((deck) => deck.cards.flatMap((card) => [`${deck.id}:${card.id}`, ...card.previousReviews.map((ref) => `${ref.deckId}:${ref.cardId}`)])));
  for (const deck of old.decks) for (const card of deck.cards) assert.ok(references.has(`${deck.id}:${card.id}`), card.front);
  assert.equal(report.legacy.preserved, 1120);
  assert.equal(report.legacy.aliases, 8);
  assert.deepEqual(report.legacy.unmapped, []);
});

test("metadados ficam separados das respostas, inclusive quando aparecem juntos", () => {
  const cards = parseFlashcardSource("# 01 --- Teste\n## Subtópico\n### Flashcard 001\n**Frente:** Pergunta?\n**Verso:** Linha um\nlinha dois.\n**Origem:** resumo **Status:** conferir_vigencia\n------------------------------------------------------------------------\n# AUDITORIA GERAL\nTexto editorial");
  assert.equal(cards[0].back, "Linha um\nlinha dois.");
  assert.equal(cards[0].origin, "resumo");
  assert.equal(cards[0].status, "conferir_vigencia");
  assert.equal(cards[0].topic, "Subtópico");
  for (const subject of catalog.subjects) for (const deck of subject.decks) for (const card of deck.cards) {
    assert.ok(card.front.trim() && card.back.trim());
    assert.doesNotMatch(card.back, /\*\*(?:Origem|Status|Tags)[^*]*\*\*/);
  }
});

test("mantém a identificação de material histórico e auditoria parcial", () => {
  const legal = catalog.subjects.find((s) => s.id === "legislacao-especial");
  assert.equal(legal.decks.filter((d) => d.historical).length, 1);
  assert.match(legal.decks.find((d) => d.historical).title, /7\.102/);
  assert.equal(catalog.subjects.filter((s) => s.auditPartial).length, 6);
  assert.ok(catalog.subjects.flatMap((s) => s.decks.flatMap((d) => d.cards)).some((c) => c.status === "conferir_vigencia"));
});

test("a migração permite todos os decks importados", () => {
  // Os nove de Informática entraram na migration anterior, a das revisões.
  const sql = ["20260929100710_library_flashcard_reviews.sql", "20260929205400_police_flashcard_decks.sql"]
    .map((name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")).join("\n");
  for (const subject of catalog.subjects) for (const deck of subject.decks) assert.ok(sql.includes(`'${deck.id}'`));
});
