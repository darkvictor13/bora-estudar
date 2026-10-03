import type { LibraryFlashcardAlias, LibraryFlashcardCatalog, LibraryFlashcardDeck, LibraryFlashcardNotice } from "./contract.ts";
import { SAMPLE_FLASHCARD_SUBJECTS, type SampleSubject } from "./fixtures-content.ts";

/**
 * A biblioteca da implementação `fixtures`, montada a partir da amostra
 * sintética de `fixtures-content.ts` (spec 41, R-PUB-05).
 *
 * Até a spec 41 ela lia o arquivo real por import dinâmico (spec 39,
 * R-BIB-32), e o Vite publicava esse arquivo como chunk em `dist`, aberto a
 * quem não tinha conta. O conteúdo real chega ao site só pelo banco.
 */

/**
 * Os status que geram aviso, como `library_flashcard_statuses` os carrega na
 * migration `20261001120000`. O teste da carga confere a tabela do banco; o de
 * `fixtures.test.ts`, que a amostra exercita cada aviso.
 */
export const FIXTURE_STATUS_NOTICES: Readonly<Record<string, LibraryFlashcardNotice>> = {
  historico_revogado: "revoked",
  conferir_vigencia: "pending_check",
  conferir_legislacao: "pending_check",
  jurisprudencia_verificar: "pending_check",
  fonte_resumo_revisar: "pending_check",
  atualizacao_futura_2027: "future_effect",
  alerta_versionamento: "version_caveat",
  manual_2018_com_ressalva_normativa: "version_caveat",
};

interface FixtureLibrary {
  readonly catalog: LibraryFlashcardCatalog;
  readonly decks: ReadonlyMap<string, LibraryFlashcardDeck>;
}

let pending: Promise<FixtureLibrary> | null = null;

export function fixtureLibrary(): Promise<FixtureLibrary> {
  pending ??= Promise.resolve(build(SAMPLE_FLASHCARD_SUBJECTS));
  return pending;
}

function build(subjects: readonly SampleSubject[]): FixtureLibrary {
  const aliases: LibraryFlashcardAlias[] = [];
  const decks = new Map<string, LibraryFlashcardDeck>();
  const catalog: LibraryFlashcardCatalog = {
    aliases,
    subjects: subjects.map((subject) => {
      const info = { id: subject.id, name: subject.subject, sourceFile: subject.sourceFile, auditLabel: subject.auditLabel, auditPartial: subject.auditPartial };
      return {
        ...info,
        decks: subject.decks.map((deck) => {
          for (const card of deck.cards) {
            for (const old of card.previousReviews ?? []) aliases.push({ oldDeckId: old.deckId, oldCardId: old.cardId, deckId: deck.id, cardId: card.id });
          }
          decks.set(deck.id, {
            id: deck.id, number: deck.number, title: deck.title, historical: deck.historical, subject: info,
            cards: deck.cards.map((card) => ({ id: card.id, topic: card.topic, front: card.front, back: card.back, notice: FIXTURE_STATUS_NOTICES[card.status ?? ""] ?? null })),
          });
          return {
            id: deck.id, subjectId: subject.id, number: deck.number, title: deck.title, historical: deck.historical,
            cardIds: deck.cards.map((card) => card.id),
            topics: [...new Set(deck.cards.map((card) => card.topic))].sort(),
          };
        }),
      };
    }),
  };
  return { catalog, decks };
}
