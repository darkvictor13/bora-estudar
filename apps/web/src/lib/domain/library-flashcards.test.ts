import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { flashcardEditorialNote, libraryReviewDeckIds, libraryReviewSources, normalizeLibraryReviews } from "./library-flashcards.ts";
import { scheduleFlashcardReview } from "./flashcards.ts";
import type { LibraryFlashcardAlias, LibraryFlashcardReview } from "../api/contract.ts";

// Um dos oito pares reais de Informática: o cartão saiu do deck 02 e foi
// consolidado no 01 (`library_flashcard_aliases`).
const alias: LibraryFlashcardAlias = {
  oldDeckId: "pf2029-informatica-02", oldCardId: "b09528e5-9bf2-4fe2-a8aa-6771101bcbce",
  deckId: "pf2029-informatica-01", cardId: "64b327ed-a2bf-4477-abca-901579a1fd65",
};

test("consolidação entre tópicos preserva o estado de memória mais recente", () => {
  assert.ok(libraryReviewDeckIds([alias.deckId], [alias]).includes(alias.oldDeckId));
  assert.deepEqual(libraryReviewDeckIds(["pf2029-rlm-argumentos"], [alias]), ["pf2029-rlm-argumentos"]);
  assert.ok(libraryReviewSources(alias.deckId, alias.cardId, [alias]).some((r) => r.cardId === alias.oldCardId));
  const review = (deckId: string, cardId: string, date: string): LibraryFlashcardReview => {
    const scheduled = scheduleFlashcardReview(deckId, cardId, "good", undefined, new Date(date));
    return { ...scheduled, deckId };
  };
  const legacy = review(alias.oldDeckId, alias.oldCardId, "2026-09-29T10:00:00Z");
  const earlier = review(alias.deckId, alias.cardId, "2026-09-28T10:00:00Z");
  for (const rows of [[legacy, earlier], [earlier, legacy]]) {
    const result = normalizeLibraryReviews(rows, [alias]);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.deckId, alias.deckId);
    assert.equal(result[0]?.cardId, alias.cardId);
    assert.equal(result[0]?.dueAt, legacy.dueAt);
    assert.equal(result[0]?.stability, legacy.stability);
  }
  const latest = review(alias.deckId, alias.cardId, "2026-09-30T10:00:00Z");
  assert.equal(normalizeLibraryReviews([legacy, latest], [alias])[0]?.lastReviewedAt, latest.lastReviewedAt);
});

test("exibe ressalvas fornecidas pelo arquivo sem declarar auditoria própria", () => {
  assert.match(flashcardEditorialNote("revoked")!, /histórico/);
  assert.match(flashcardEditorialNote("pending_check")!, /pendente/);
  assert.equal(flashcardEditorialNote(null), null);
});

// Spec 39, CA-10: o arquivo da biblioteca só entra por import dinâmico, no
// chunk da `fixtures`. Um import estático o devolveria ao bundle principal.
test("nenhum módulo do site importa estaticamente o JSON da biblioteca", () => {
  const src = fileURLToPath(new URL("../../", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) files.push(path);
    }
  };
  walk(src);
  const offenders = files.filter((file) => /^\s*import[^(]*pf2029-[a-z]+-flashcards\.json/m.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});
