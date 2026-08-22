import { type Envelope } from "./envelope.ts";

// ---------------------------------------------------------------------------
// Site → extensão
// ---------------------------------------------------------------------------

/**
 * Uma questão que o aluno já respondeu neste bloco, em baterias concluídas.
 * A extensão usa isto para não repetir questão já vista.
 */
export interface QuestaoVista {
  readonly questaoId: number;
  readonly vezesVista: number;
  readonly acertos: number;
  readonly erros: number;
  /** ISO 8601. */
  readonly ultimaVez: string;
}

export interface BateriaInicio {
  /** Para onde a extensão devolve o resultado. Origem exata, sem fragmento. */
  readonly urlRetorno: string;
  readonly bateriaId: string;
  readonly metaId: string;
  readonly planejamentoId: string;
  readonly blocoId: string;
  readonly numeroBateria: number;
  /** Quantas questões principais a bateria persegue. */
  readonly principaisAlvo: number;
  /** Questões do bloco, na ordem do catálogo. */
  readonly questoesDisponiveis: readonly number[];
  readonly historico: readonly QuestaoVista[];
  /**
   * `false` quando o site não conseguiu carregar o histórico inteiro.
   *
   * A extensão DEVE degradar visivelmente neste caso, avisando o aluno de que
   * pode haver repetição. A versão anterior marcava o histórico como
   * autoritativo mesmo truncado, e o motor passava a repetir questões em
   * silêncio depois de ~30 baterias no mesmo bloco.
   */
  readonly historicoCompleto: boolean;
}

export type BateriaInicioEnvelope = Envelope<"bateria.inicio", BateriaInicio>;

// ---------------------------------------------------------------------------
// Extensão → site
// ---------------------------------------------------------------------------

export type FaseQuestao = "principal" | "reforco" | "extra";
export type ResultadoQuestao = "acertou" | "errou";

export interface RespostaQuestao {
  readonly questaoId: number;
  readonly ordemExecucao: number;
  readonly rodada: number;
  readonly fase: FaseQuestao;
  readonly resultado: ResultadoQuestao;
  readonly topico: string | null;
  /** Obrigatório quando `fase` é "reforco". */
  readonly origemQuestaoId: number | null;
  /** ISO 8601. */
  readonly respondidaEm: string;
}

export interface BateriaResultado {
  readonly bateriaId: string;
  /**
   * Chave de idempotência. Gerada UMA vez, quando a bateria é finalizada, e
   * persistida junto da sessão antes de qualquer navegação.
   *
   * Toda retentativa reenvia este mesmo valor. Regerá-lo no ponto de uso
   * transforma a proteção do servidor em decoração: cada retry chega ao banco
   * como operação nova.
   */
  readonly requestId: string;
  readonly cancelar: boolean;
  readonly respostas: readonly RespostaQuestao[];
}

export type BateriaResultadoEnvelope = Envelope<"bateria.resultado", BateriaResultado>;

export type QualquerEnvelope = BateriaInicioEnvelope | BateriaResultadoEnvelope;
