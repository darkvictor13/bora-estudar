import type { LawDocument, LawEntry, LawExamMaps } from "./laws.ts";

/**
 * A amostra que a implementação `fixtures` serve no lugar do conteúdo real
 * (spec 41, R-PUB-05).
 *
 * TODO TEXTO AQUI É INVENTADO. O conteúdo de verdade mora em `content/` e
 * chega ao site só pelo banco; este arquivo vai para o bundle de produção
 * junto com a `fixtures`, e a varredura do `dist` (R-PUB-09) reprova o build
 * se uma linha de cartão ou de artigo real aparecer nele. Não copie, nem
 * resuma, conteúdo de `content/` para cá.
 *
 * O tamanho é o mínimo que exercita o contrato: duas matérias, um deck
 * histórico, os quatro avisos editoriais, um alias; duas leis em matérias
 * diferentes e um edital com norma que tem texto e norma que não tem.
 */

export interface SampleCard {
  readonly id: string;
  readonly topic: string;
  readonly front: string;
  readonly back: string;
  /** O `status` do arquivo; os que geram aviso estão em `FIXTURE_STATUS_NOTICES`. */
  readonly status?: string;
  readonly previousReviews?: readonly { readonly deckId: string; readonly cardId: string }[];
}

export interface SampleDeck {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly historical: boolean;
  readonly cards: readonly SampleCard[];
}

export interface SampleSubject {
  readonly id: string;
  readonly subject: string;
  readonly sourceFile: string;
  readonly auditLabel: string;
  readonly auditPartial: boolean;
  readonly decks: readonly SampleDeck[];
}

const card = (n: number) => `5a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const SAMPLE_FLASHCARD_SUBJECTS: readonly SampleSubject[] = [
  {
    id: "amostra-redes",
    subject: "Redes (amostra)",
    sourceFile: "AMOSTRA_REDES.md",
    auditLabel: "Amostra",
    auditPartial: false,
    decks: [
      {
        id: "amostra-redes-01",
        number: "01",
        title: "Protocolos imaginários",
        historical: false,
        cards: [
          { id: card(1), topic: "Camadas", front: "Na amostra, qual camada o protocolo Lontra ocupa?", back: "A camada de enlace fictícia número sete." },
          { id: card(2), topic: "Camadas", front: "O protocolo Lontra exige confirmação de cada quadro?", back: "Não. Na amostra ele confirma só o último quadro da rajada.", status: "conferir_vigencia" },
          { id: card(3), topic: "Portas", front: "Que porta a amostra reserva para o serviço Capivara?", back: "A porta 4242, só nos exemplos.", status: "atualizacao_futura_2027" },
          { id: card(4), topic: "Portas", front: "A porta do serviço Capivara muda entre versões da amostra?", back: "Mudou na segunda versão; a primeira usava 4241.", status: "alerta_versionamento" },
        ],
      },
      {
        id: "amostra-redes-02",
        number: "02",
        title: "Endereços de faz de conta",
        historical: false,
        cards: [
          { id: card(5), topic: "Máscaras", front: "Quantos endereços cabem numa sub-rede Tamanduá?", back: "Dezesseis, pela regra inventada para a amostra." },
          {
            id: card(6),
            topic: "Máscaras",
            front: "Onde foi parar o cartão sobre a sub-rede Quati?",
            back: "Veio do deck 01 para este, e a memória de quem já o revisava veio junto.",
            previousReviews: [{ deckId: "amostra-redes-01", cardId: card(99) }],
          },
        ],
      },
    ],
  },
  {
    id: "amostra-direito",
    subject: "Direito (amostra)",
    sourceFile: "AMOSTRA_DIREITO.md",
    auditLabel: "Amostra parcial",
    auditPartial: true,
    decks: [
      {
        id: "amostra-direito-historico",
        number: "01",
        title: "Regra revogada da amostra",
        historical: true,
        cards: [
          { id: card(7), topic: "Revogação", front: "O que dizia a Regra Exemplar 1/2020 sobre prazos?", back: "Dava dez dias fictícios; foi revogada pela Regra Exemplar 2/2024.", status: "historico_revogado" },
          { id: card(8), topic: "Revogação", front: "A Regra Exemplar 1/2020 ainda vale para fatos antigos?", back: "Na amostra, só para os fatos anteriores a 2024.", status: "historico_revogado" },
        ],
      },
    ],
  },
];

export const SAMPLE_LAW_INDEX: readonly LawEntry[] = [
  {
    id: "amostra-um",
    canonicalId: "BR-AMOSTRA-LEI-1-2026",
    title: "Lei da Amostra Um",
    norm: "Lei Exemplar 1/2026",
    subject: "Matéria A (amostra)",
    officialUrl: "https://example.com/amostra-um",
    sourceDate: "2026-10-01",
    articleCount: 3,
  },
  {
    id: "amostra-dois",
    canonicalId: "BR-AMOSTRA-LEI-2-2026",
    title: "Lei da Amostra Dois",
    norm: "Lei Exemplar 2/2026",
    subject: "Matéria B (amostra)",
    officialUrl: "https://example.com/amostra-dois",
    sourceDate: null,
    articleCount: 2,
  },
];

export const SAMPLE_LAW_TEXTS: Readonly<Record<string, LawDocument>> = {
  "amostra-um": {
    id: "amostra-um",
    articles: [
      {
        id: "amostra-um-art-1",
        label: "Art. 1",
        section: "Disposições da amostra",
        paragraphs: [
          "Art. 1º Esta Lei Exemplar organiza a leitura de exemplos usados apenas no ambiente de desenvolvimento.",
          "Parágrafo único. Nenhum exemplo desta Lei Exemplar produz efeito fora da amostra.",
        ],
      },
      {
        id: "amostra-um-art-2",
        label: "Art. 2",
        section: "Disposições da amostra",
        paragraphs: ["Art. 2º O grifo feito nesta amostra serve para conferir a reancoragem das marcações."],
      },
      {
        id: "amostra-um-art-3",
        label: "Art. 3",
        section: "Disposições finais",
        paragraphs: ["Art. 3º Esta Lei Exemplar entra em vigor na data em que a amostra for carregada."],
      },
    ],
  },
  "amostra-dois": {
    id: "amostra-dois",
    articles: [
      {
        id: "amostra-dois-art-1",
        label: "Art. 1",
        section: "Texto integral",
        paragraphs: ["Art. 1º A segunda Lei Exemplar existe para que a biblioteca tenha duas matérias."],
      },
      {
        id: "amostra-dois-art-2",
        label: "Art. 2",
        section: "Texto integral",
        paragraphs: ["Art. 2º Revogam-se as disposições imaginárias em contrário."],
      },
    ],
  },
};

export const SAMPLE_EXAM_MAPS: LawExamMaps = {
  baseDate: "2026-10-01",
  maps: [
    {
      id: "amostra-2026",
      shortName: "AMOSTRA",
      title: "Edital da Amostra 2026",
      accent: "Exemplo",
      canonicalId: "EDITAL-AMOSTRA-2026-01",
      sections: [
        {
          title: "Leis da amostra",
          items: [
            { canonicalId: "BR-AMOSTRA-LEI-1-2026", title: "Lei Exemplar 1/2026 — Lei da Amostra Um", scope: "Integral, com destaque para a reancoragem", libraryId: "amostra-um", available: true },
            { canonicalId: "BR-AMOSTRA-LEI-2-2026", title: "Lei Exemplar 2/2026 — Lei da Amostra Dois", scope: "Arts. 1º e 2º", libraryId: "amostra-dois", available: true },
          ],
        },
        {
          title: "Normas sem texto na biblioteca",
          items: [
            { canonicalId: "BR-AMOSTRA-DEC-3-2026", title: "Decreto Exemplar 3/2026", scope: "Capítulo das medidas protetivas imaginárias", libraryId: null, available: false },
          ],
        },
      ],
    },
  ],
};
