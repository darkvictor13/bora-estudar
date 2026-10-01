import type { LibraryFlashcardAlias, LibraryFlashcardCatalog, LibraryFlashcardDeck, LibraryFlashcardNotice } from "./contract.ts";

/**
 * A biblioteca da implementação `fixtures`, lida do mesmo arquivo que a carga
 * leva ao banco (spec 39, R-BIB-32).
 *
 * Import DINÂMICO: o arquivo sai do bundle principal e vira um chunk que só é
 * baixado quando a `fixtures` o pede. Decidido na entrevista da spec 39 — o
 * chunk continua publicado em `dist`.
 */

interface FileCard { id: string; topic: string; front: string; back: string; status?: string; previousReviews?: { deckId: string; cardId: string }[] }
interface FileDeck { id: string; number: string; title: string; historical: boolean; cards: FileCard[] }
interface FileSubject { id: string; subject: string; sourceFile: string; auditLabel: string; auditPartial: boolean; decks: FileDeck[] }

/**
 * Os status que geram aviso, como `library_flashcard_statuses` os carrega na
 * migration `20261001120000`. O teste da carga confere a tabela do banco; o de
 * `fixtures.test.ts`, que estas duas listas dizem a mesma coisa para o arquivo.
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
  pending ??= import("../../data/pf2029-policial-flashcards.json", { with: { type: "json" } })
    .then(({ default: file }) => build((file as { subjects: FileSubject[] }).subjects));
  return pending;
}

function build(subjects: readonly FileSubject[]): FixtureLibrary {
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
