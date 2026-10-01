import { libraryReviewDeckIds, libraryReviewSources, normalizeLibraryReviews } from "@/lib/domain/library-flashcards";
import { scheduleFlashcardReview } from "@/lib/domain/flashcards";
import { supabase } from "@/lib/supabase/client";

import type { FlashcardGrade, FlashcardState, GradeLibraryFlashcardInput, LibraryFlashcardAlias, LibraryFlashcardCatalog, LibraryFlashcardDeck, LibraryFlashcardNotice, LibraryFlashcardReview, Result } from "../contract.ts";
import { done, failure, throwDb, translateDbError } from "./errors.ts";
import { reviewValues, writeReview } from "./flashcards.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

// O conteúdo vem do banco (spec 39). A lista chega sem texto, por
// `vw_library_flashcard_decks`; o texto, só quando o deck é aberto.

interface SubjectRow { id: string; name: string; source_file: string; audit_label: string; audit_partial: boolean }
interface DeckSummaryRow { deck_id: string; subject_id: string | null; number: string | null; title: string | null; historical: boolean; card_ids: string[]; topics: string[] }
interface AliasRow { old_deck_id: string; old_card_id: string; deck_id: string; card_id: string }
interface CardRow { id: string; topic: string; front: string; back: string; status: { editorial_notice: LibraryFlashcardNotice | null } | null }

const SUBJECT_COLUMNS = "id,name,source_file,audit_label,audit_partial";

function toSubject(row: SubjectRow) {
  return { id: row.id, name: row.name, sourceFile: row.source_file, auditLabel: row.audit_label, auditPartial: row.audit_partial };
}

async function loadAliases(): Promise<readonly LibraryFlashcardAlias[]> {
  const { data, error } = await supabase.from("library_flashcard_aliases").select("old_deck_id,old_card_id,deck_id,card_id");
  if (error) throwDb(error);
  return ((data ?? []) as AliasRow[]).map((row) => ({ oldDeckId: row.old_deck_id, oldCardId: row.old_card_id, deckId: row.deck_id, cardId: row.card_id }));
}

export async function loadLibraryFlashcardCatalog(): Promise<LibraryFlashcardCatalog> {
  await requireSession();
  const [subjects, decks, aliases] = await Promise.all([
    supabase.from("library_flashcard_subjects").select(SUBJECT_COLUMNS).order("position"),
    supabase.from("vw_library_flashcard_decks").select("deck_id,subject_id,number,title,historical,card_ids,topics").order("position"),
    loadAliases(),
  ]);
  if (subjects.error) throwDb(subjects.error);
  if (decks.error) throwDb(decks.error);
  const deckRows = (decks.data ?? []) as DeckSummaryRow[];
  return {
    subjects: ((subjects.data ?? []) as SubjectRow[]).map((row) => ({
      ...toSubject(row),
      // Deck sem matéria é o de antes da primeira carga (R-BIB-11): não aparece.
      decks: deckRows.filter((deck) => deck.subject_id === row.id).map((deck) => ({
        id: deck.deck_id, subjectId: row.id, number: deck.number ?? "", title: deck.title ?? deck.deck_id,
        historical: deck.historical, cardIds: deck.card_ids, topics: deck.topics,
      })),
    })),
    aliases,
  };
}

export async function loadLibraryFlashcardDeck(deckId: string): Promise<LibraryFlashcardDeck | null> {
  await requireSession();
  const { data: deck, error } = await supabase.from("library_flashcard_decks")
    .select(`id,number,title,historical,subject:library_flashcard_subjects(${SUBJECT_COLUMNS})`)
    .eq("id", deckId).maybeSingle();
  if (error) throwDb(error);
  const row = deck as { id: string; number: string | null; title: string | null; historical: boolean; subject: SubjectRow | null } | null;
  if (!row?.subject) return null;
  const { data: cards, error: cardsError } = await supabase.from("library_flashcards")
    .select("id,topic,front,back,status:library_flashcard_statuses(editorial_notice)")
    .eq("deck_id", deckId).is("retired_at", null).order("position");
  if (cardsError) throwDb(cardsError);
  return {
    id: row.id, number: row.number ?? "", title: row.title ?? row.id, historical: row.historical,
    subject: toSubject(row.subject),
    cards: ((cards ?? []) as CardRow[]).map((card) => ({ id: card.id, topic: card.topic, front: card.front, back: card.back, notice: card.status?.editorial_notice ?? null })),
  };
}

const COLUMNS = "deck_id,card_id,due_at,interval_minutes,review_count,last_grade,state,step,stability,difficulty,lapses,last_reviewed_at";
interface Row {
  deck_id: string;
  card_id: string;
  due_at: string;
  interval_minutes: number;
  review_count: number;
  last_grade: string;
  state: string;
  step: number;
  stability: number;
  difficulty: number;
  lapses: number;
  last_reviewed_at: string;
}

function toReview(row: Row): LibraryFlashcardReview {
  return { deckId: row.deck_id, cardId: row.card_id, dueAt: row.due_at, intervalMinutes: row.interval_minutes, reviewCount: row.review_count, lastGrade: row.last_grade as FlashcardGrade, state: row.state as FlashcardState, step: row.step, stability: row.stability, difficulty: row.difficulty, lapses: row.lapses, lastReviewedAt: row.last_reviewed_at };
}

export async function loadLibraryFlashcardReviews(deckIds: readonly string[]): Promise<readonly LibraryFlashcardReview[]> {
  if (deckIds.length === 0) return [];
  const aliases = await loadAliases();
  const ids = libraryReviewDeckIds(deckIds, aliases);
  const session = await requireSession();
  const result: LibraryFlashcardReview[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("library_flashcard_reviews")
      .select(COLUMNS).eq("student_id", session.profileId).in("deck_id", ids)
      .order("deck_id").order("card_id").range(offset, offset + 999);
    if (error) throwDb(error);
    const rows = (data ?? []) as Row[];
    result.push(...rows.map(toReview));
    if (rows.length < 1000) break;
  }
  return normalizeLibraryReviews(result, aliases).filter((review) => deckIds.includes(review.deckId));
}

export function gradeLibraryFlashcard(input: GradeLibraryFlashcardInput): Promise<Result<LibraryFlashcardReview>> {
  return once(input.requestId, async () => {
    const session = await requireSession();
    // O banco também recusa (FK e WITH CHECK, R-BIB-24 e 26), mas com 42501,
    // que a tela leria como acesso vencido. Conferir antes dá o motivo certo.
    const { data: card, error: cardError } = await supabase.from("library_flashcards")
      .select("id").eq("deck_id", input.deckId).eq("id", input.cardId).is("retired_at", null).maybeSingle();
    if (cardError) return failure<LibraryFlashcardReview>(translateDbError(cardError));
    if (!card) return failure<LibraryFlashcardReview>({ code: "not_found", message: "Cartão não encontrado neste deck." });
    const aliases = await loadAliases();
    const sources = libraryReviewSources(input.deckId, input.cardId, aliases);
    const { data: previous, error: readError } = await supabase.from("library_flashcard_reviews")
      .select(COLUMNS).eq("student_id", session.profileId).in("deck_id", [...new Set(sources.map((source) => source.deckId))]).in("card_id", sources.map((source) => source.cardId));
    if (readError) return failure<LibraryFlashcardReview>(translateDbError(readError));
    const previousReview = normalizeLibraryReviews(((previous ?? []) as Row[]).map(toReview), aliases).find((review) => review.deckId === input.deckId && review.cardId === input.cardId);
    const next = scheduleFlashcardReview(input.deckId, input.cardId, input.grade, previousReview ? { ...previousReview, lessonId: input.deckId } : undefined);
    // A leitura acima traz também as fontes antigas do mesmo cartão; o que
    // decide entre INSERT e UPDATE é haver linha neste deck, com este id.
    const existed = ((previous ?? []) as Row[]).some((row) => row.deck_id === input.deckId && row.card_id === input.cardId);
    const values = reviewValues(next);
    const { data, error } = await writeReview(
      existed,
      () => supabase.from("library_flashcard_reviews")
        .insert({ student_id: session.profileId, deck_id: input.deckId, card_id: input.cardId, ...values })
        .select(COLUMNS).single(),
      () => supabase.from("library_flashcard_reviews").update(values)
        .eq("student_id", session.profileId).eq("deck_id", input.deckId).eq("card_id", input.cardId)
        .select(COLUMNS).single(),
    );
    if (error) return failure<LibraryFlashcardReview>(translateDbError(error));
    return done(toReview(data as Row));
  });
}
