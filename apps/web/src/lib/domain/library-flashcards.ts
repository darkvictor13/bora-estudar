import catalog from "../../data/pf2029-policial-flashcards.json" with { type: "json" };
import type { FlashcardCard, FlashcardReview, LibraryFlashcardReview } from "../api/contract.ts";

export interface LibraryDeck {
  readonly id: string;
  readonly subjectId: string;
  readonly number: string;
  readonly title: string;
  readonly historical: boolean;
  readonly cards: readonly (FlashcardCard & { readonly origin: string; readonly tags: readonly string[]; readonly status: string; readonly sourceNumber: string; readonly previousReviews: readonly { deckId: string; cardId: string }[] })[];
}

export interface LibrarySubject {
  readonly id: string;
  readonly subject: string;
  readonly sourceFile: string;
  readonly auditLabel: string;
  readonly auditPartial: boolean;
  readonly totalCards: number;
  readonly decks: readonly LibraryDeck[];
}

export const POLICE_FLASHCARDS = catalog as { readonly id: string; readonly source: string; readonly totalCards: number; readonly subjects: readonly LibrarySubject[] };
export const LIBRARY_DECKS = POLICE_FLASHCARDS.subjects.flatMap((subject) => subject.decks);
const decksById = new Map(LIBRARY_DECKS.map((deck) => [deck.id, deck]));
const reviewAliases = new Map(LIBRARY_DECKS.flatMap((deck) => deck.cards.flatMap((card) => card.previousReviews.map((old) => [`${old.deckId}:${old.cardId}`, { deckId: deck.id, cardId: card.id }] as const))));

export function librarySubject(subjectId: string): LibrarySubject | undefined {
  return POLICE_FLASHCARDS.subjects.find((subject) => subject.id === subjectId);
}

export function libraryDeck(deckId: string): LibraryDeck | undefined {
  return decksById.get(deckId);
}

export function libraryReviewSources(deckId: string, cardId: string) {
  return [{ deckId, cardId }, ...(libraryDeck(deckId)?.cards.find((card) => card.id === cardId)?.previousReviews ?? [])];
}

/** Include the old decks when a consolidated card moved to another topic. */
export function libraryReviewDeckIds(deckIds: readonly string[]): string[] {
  return [...new Set(deckIds.flatMap((id) => {
    const deck = libraryDeck(id);
    return deck ? [id, ...deck.cards.flatMap((card) => card.previousReviews.map((old) => old.deckId))] : [];
  }))];
}

/** Most recent memory state wins. Original rows remain intact in the database. */
export function normalizeLibraryReviews(reviews: readonly LibraryFlashcardReview[]): LibraryFlashcardReview[] {
  const result = new Map<string, LibraryFlashcardReview>();
  for (const review of reviews) {
    const target = reviewAliases.get(`${review.deckId}:${review.cardId}`);
    const normalized = target ? { ...review, ...target } : review;
    const key = `${normalized.deckId}:${normalized.cardId}`;
    const previous = result.get(key);
    if (!previous || Date.parse(normalized.lastReviewedAt) > Date.parse(previous.lastReviewedAt)
      || (normalized.lastReviewedAt === previous.lastReviewedAt && normalized.reviewCount > previous.reviewCount)) result.set(key, normalized);
  }
  return [...result.values()];
}

export function flashcardEditorialNote(status: string | undefined): string | null {
  if (!status) return null;
  if (status === "historico_revogado") return "Conteúdo histórico: o arquivo identifica esta norma como revogada.";
  if (/conferir|verificar|revisar/.test(status)) return "O arquivo sinaliza este cartão como pendente de conferência.";
  if (status === "atualizacao_futura_2027") return "O arquivo indica aplicação futura, a partir de 2027.";
  if (/versionamento|ressalva/.test(status)) return "Este cartão tem ressalva de versão no material de origem.";
  return null;
}

/** A fila de estudo usa o mesmo algoritmo de repetição espaçada das aulas. */
export function lessonReviewFromLibrary(review: LibraryFlashcardReview): FlashcardReview {
  return { lessonId: review.deckId, cardId: review.cardId, dueAt: review.dueAt, intervalMinutes: review.intervalMinutes, reviewCount: review.reviewCount, lastGrade: review.lastGrade, state: review.state, step: review.step, stability: review.stability, difficulty: review.difficulty, lapses: review.lapses, lastReviewedAt: review.lastReviewedAt };
}
