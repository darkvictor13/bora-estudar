import type { FlashcardCard, FlashcardReview } from "../api/contract.ts";
import { flashcardStudyStats } from "./flashcards.ts";

export type FlashcardSource = "Biblioteca editorial" | "Aulas do professor" | "Meus decks";

export interface FlashcardStatisticsDeck {
  readonly id: string;
  readonly source: FlashcardSource;
  readonly subject: string;
  /** Só o id conta para a estatística: a biblioteca chega sem o texto. */
  readonly cards: readonly Pick<FlashcardCard, "id">[];
  readonly reviews: readonly FlashcardReview[];
}

export function buildFlashcardStatistics(decks: readonly FlashcardStatisticsDeck[], now = new Date()) {
  const allReviews = decks.flatMap((deck) => deck.reviews);
  const studied = allReviews.length;
  const correct = allReviews.filter((review) => review.lastGrade === "good" || review.lastGrade === "easy").length;
  const doubt = allReviews.filter((review) => review.lastGrade === "hard").length;
  const errors = allReviews.filter((review) => review.lastGrade === "again").length;
  const bySource = (["Biblioteca editorial", "Aulas do professor", "Meus decks"] as const).map((source) => {
    const sourceDecks = decks.filter((deck) => deck.source === source);
    const cards = sourceDecks.reduce((total, deck) => total + deck.cards.length, 0);
    const reviews = sourceDecks.reduce((total, deck) => total + deck.reviews.length, 0);
    return { source, decks: sourceDecks.length, cards, studied: reviews };
  });
  const subjectNames = [...new Set(decks.map((deck) => deck.subject))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const bySubject = subjectNames.map((subject) => {
    const subjectDecks = decks.filter((deck) => deck.subject === subject);
    const cards = subjectDecks.flatMap((deck) => deck.cards);
    const reviews = subjectDecks.flatMap((deck) => deck.reviews);
    const hits = reviews.filter((review) => review.lastGrade === "good" || review.lastGrade === "easy").length;
    return { subject, cards: cards.length, studied: reviews.length, score: reviews.length ? Math.round(hits / reviews.length * 100) : null };
  });
  const memory = decks.reduce((sum, deck) => {
    const item = flashcardStudyStats(deck.cards, deck.reviews, now);
    return { fresh: sum.fresh + item.fresh, learning: sum.learning + item.learning, due: sum.due + item.due, consolidated: sum.consolidated + item.consolidated };
  }, { fresh: 0, learning: 0, due: 0, consolidated: 0 });
  return {
    cards: decks.reduce((total, deck) => total + deck.cards.length, 0),
    decks: decks.length,
    studied,
    totalReviews: allReviews.reduce((total, review) => total + review.reviewCount, 0),
    retention: studied ? Math.round(correct / studied * 100) : null,
    answers: { correct, doubt, errors },
    memory,
    bySource,
    bySubject,
  };
}
