/**
 * O contrato do grifo nos flashcards (spec 42). Os três tipos de cartão
 * moram em três tabelas, e por isso o cartão é dito pelo tipo mais o par
 * deck/cartão: `deckId` é o deck da biblioteca, a aula do professor ou o deck
 * pessoal, conforme `kind`.
 */
import type { RequestId, Result, Uuid } from "./contract.ts";
import type { LawMarkColor, LawMarkStyle } from "./laws.ts";

export type FlashcardCardKind = "library" | "lesson" | "personal";
export type FlashcardSide = "front" | "back";

/** Um deck aberto para revisão, de qualquer dos três tipos. */
export interface FlashcardDeckRef {
  readonly kind: FlashcardCardKind;
  readonly deckId: string;
}

export interface FlashcardCardRef extends FlashcardDeckRef {
  readonly cardId: Uuid;
}

export interface FlashcardTextRange {
  readonly card: FlashcardCardRef;
  readonly side: FlashcardSide;
  readonly start: number;
  readonly end: number;
}

/**
 * Uma marcação num lado do cartão. `card` é o cartão onde ela aparece HOJE:
 * a gravada num cartão da biblioteca que mudou de deck chega já apontando para
 * o substituto (R-GRIFO-16) — o par gravado no banco não muda, e não precisa,
 * porque alterar e apagar são por id.
 */
export interface FlashcardMark extends FlashcardTextRange {
  readonly id: Uuid;
  readonly style: LawMarkStyle;
  readonly color: LawMarkColor;
  readonly quote: string;
  readonly prefix: string;
  readonly suffix: string;
}

/** O antes e o depois de UMA ação na tela; grava-se a diferença, por id. */
export interface SaveFlashcardMarksInput {
  readonly deck: FlashcardDeckRef;
  readonly previous: readonly FlashcardMark[];
  readonly next: readonly FlashcardMark[];
  readonly requestId: RequestId;
}

export interface FlashcardMarksApi {
  /** As marcações do aluno nos cartões do deck, como foram gravadas — sem reancorar. */
  loadFlashcardMarks(deck: FlashcardDeckRef): Promise<readonly FlashcardMark[]>;
  saveFlashcardMarks(input: SaveFlashcardMarksInput): Promise<Result<null>>;
}
