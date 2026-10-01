import type { FlashcardReview, LibraryFlashcardAlias, LibraryFlashcardCatalog, LibraryFlashcardNotice, LibraryFlashcardReview } from "../api/contract.ts";

// O conteúdo da biblioteca não mora mais aqui: vem do contrato, que lê do
// banco (spec 39). Este módulo guarda só as regras sobre ele — e por isso não
// importa o JSON, que é o que CA-10 confere.

function aliasTargets(aliases: readonly LibraryFlashcardAlias[]) {
  return new Map(aliases.map((alias) => [`${alias.oldDeckId}:${alias.oldCardId}`, { deckId: alias.deckId, cardId: alias.cardId }] as const));
}

/** O cartão atual e os pares antigos cuja memória vale para ele. */
export function libraryReviewSources(deckId: string, cardId: string, aliases: readonly LibraryFlashcardAlias[]) {
  return [{ deckId, cardId }, ...aliases.filter((alias) => alias.deckId === deckId && alias.cardId === cardId).map((alias) => ({ deckId: alias.oldDeckId, cardId: alias.oldCardId }))];
}

/** Include the old decks when a consolidated card moved to another topic. */
export function libraryReviewDeckIds(deckIds: readonly string[], aliases: readonly LibraryFlashcardAlias[]): string[] {
  const wanted = new Set(deckIds);
  return [...new Set([...deckIds, ...aliases.filter((alias) => wanted.has(alias.deckId)).map((alias) => alias.oldDeckId)])];
}

/** Most recent memory state wins. Original rows remain intact in the database. */
export function normalizeLibraryReviews(reviews: readonly LibraryFlashcardReview[], aliases: readonly LibraryFlashcardAlias[]): LibraryFlashcardReview[] {
  const targets = aliasTargets(aliases);
  const result = new Map<string, LibraryFlashcardReview>();
  for (const review of reviews) {
    const target = targets.get(`${review.deckId}:${review.cardId}`);
    const normalized = target ? { ...review, ...target } : review;
    const key = `${normalized.deckId}:${normalized.cardId}`;
    const previous = result.get(key);
    if (!previous || Date.parse(normalized.lastReviewedAt) > Date.parse(previous.lastReviewedAt)
      || (normalized.lastReviewedAt === previous.lastReviewedAt && normalized.reviewCount > previous.reviewCount)) result.set(key, normalized);
  }
  return [...result.values()];
}

const NOTICES: Readonly<Record<LibraryFlashcardNotice, string>> = {
  revoked: "Conteúdo histórico: o arquivo identifica esta norma como revogada.",
  pending_check: "O arquivo sinaliza este cartão como pendente de conferência.",
  future_effect: "O arquivo indica aplicação futura, a partir de 2027.",
  version_caveat: "Este cartão tem ressalva de versão no material de origem.",
};

/** A frase do aviso editorial; quem decide se há aviso é o banco (R-BIB-30). */
export function flashcardEditorialNote(notice: LibraryFlashcardNotice | null | undefined): string | null {
  return notice ? NOTICES[notice] : null;
}

export function libraryCardCount(catalog: LibraryFlashcardCatalog): number {
  return catalog.subjects.reduce((total, subject) => total + subject.decks.reduce((sum, deck) => sum + deck.cardIds.length, 0), 0);
}

/** Os ids do deck no formato que o progresso e a fila de estudo esperam. */
export function libraryDeckCards(deck: { readonly cardIds: readonly string[] }): readonly { readonly id: string }[] {
  return deck.cardIds.map((id) => ({ id }));
}

/** A fila de estudo usa o mesmo algoritmo de repetição espaçada das aulas. */
export function lessonReviewFromLibrary(review: LibraryFlashcardReview): FlashcardReview {
  return { lessonId: review.deckId, cardId: review.cardId, dueAt: review.dueAt, intervalMinutes: review.intervalMinutes, reviewCount: review.reviewCount, lastGrade: review.lastGrade, state: review.state, step: review.step, stability: review.stability, difficulty: review.difficulty, lapses: review.lapses, lastReviewedAt: review.lastReviewedAt };
}
