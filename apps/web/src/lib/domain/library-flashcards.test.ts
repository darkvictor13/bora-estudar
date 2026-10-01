import assert from "node:assert/strict";
import test from "node:test";
import { LIBRARY_DECKS, flashcardEditorialNote, libraryReviewDeckIds, libraryReviewSources, normalizeLibraryReviews } from "./library-flashcards.ts";
import { scheduleFlashcardReview } from "./flashcards.ts";
import type { LibraryFlashcardReview } from "../api/contract.ts";

test("consolidação entre tópicos preserva o estado de memória mais recente", () => {
  const deck = LIBRARY_DECKS.find((d) => d.id === "pf2029-informatica-01")!;
  const card = deck.cards.find((c) => c.previousReviews.some((r) => r.deckId !== deck.id))!;
  const old = card.previousReviews[0]!;
  assert.ok(libraryReviewDeckIds([deck.id]).includes(old.deckId));
  assert.ok(libraryReviewSources(deck.id, card.id).some((r) => r.cardId === old.cardId));
  const review = (deckId: string, cardId: string, date: string): LibraryFlashcardReview => {
    const scheduled = scheduleFlashcardReview(deckId, cardId, "good", undefined, new Date(date));
    return { ...scheduled, deckId };
  };
  const legacy = review(old.deckId, old.cardId, "2026-09-29T10:00:00Z");
  const earlier = review(deck.id, card.id, "2026-09-28T10:00:00Z");
  for (const rows of [[legacy, earlier], [earlier, legacy]]) {
    const result = normalizeLibraryReviews(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.deckId, deck.id);
    assert.equal(result[0]?.cardId, card.id);
    assert.equal(result[0]?.dueAt, legacy.dueAt);
    assert.equal(result[0]?.stability, legacy.stability);
  }
  const latest = review(deck.id, card.id, "2026-09-30T10:00:00Z");
  assert.equal(normalizeLibraryReviews([legacy, latest])[0]?.lastReviewedAt, latest.lastReviewedAt);
});

test("exibe ressalvas fornecidas pelo arquivo sem declarar auditoria própria", () => {
  assert.match(flashcardEditorialNote("historico_revogado")!, /histórico/);
  assert.match(flashcardEditorialNote("jurisprudencia_verificar")!, /pendente/);
  assert.equal(flashcardEditorialNote("mantido_v1"), null);
});
