import type { Result } from "./contract.ts";
import type { FlashcardDeckRef, FlashcardMark, FlashcardMarksApi, SaveFlashcardMarksInput } from "./flashcard-marks.ts";
import { fixtureLibrary } from "./fixtures-library.ts";
import { diffFlashcardMarks, libraryMarkDeckIds, resolveFlashcardMarkAliases } from "../domain/flashcard-markings.ts";

/**
 * O grifo nos flashcards na implementação `fixtures` (spec 42). Guarda as
 * marcações como o banco guarda — no cartão em que foram feitas — e resolve o
 * alias da biblioteca na leitura, como o adaptador do Supabase.
 */

const marks = new Map<string, FlashcardMark>();

export function resetFixtureFlashcardMarks(): void {
  marks.clear();
}

export function createFlashcardMarkFixtures(
  later: <T>(value: T) => Promise<T>,
  once: <T>(requestId: string, run: () => Result<T>) => Result<T>,
): FlashcardMarksApi {
  return {
    loadFlashcardMarks: async (deck: FlashcardDeckRef) => {
      const aliases = deck.kind === "library" ? (await fixtureLibrary()).catalog.aliases : [];
      const deckIds = new Set(deck.kind === "library" ? libraryMarkDeckIds(deck.deckId, aliases) : [deck.deckId]);
      const stored = [...marks.values()].filter((mark) => mark.card.kind === deck.kind && deckIds.has(mark.card.deckId));
      return later(resolveFlashcardMarkAliases(stored, aliases).filter((mark) => mark.card.deckId === deck.deckId));
    },
    saveFlashcardMarks: (input: SaveFlashcardMarksInput) => later(once(input.requestId, () => {
      const diff = diffFlashcardMarks(input.previous, input.next);
      for (const id of diff.remove) marks.delete(id);
      for (const mark of diff.insert) if (!marks.has(mark.id)) marks.set(mark.id, mark);
      // Alterar não toca o cartão gravado, como o grant de UPDATE do banco.
      for (const mark of diff.update) {
        const stored = marks.get(mark.id);
        if (stored) marks.set(mark.id, { ...mark, card: stored.card, side: stored.side });
      }
      return { ok: true, data: null } as const;
    })),
  };
}
