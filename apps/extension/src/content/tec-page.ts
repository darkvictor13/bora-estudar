import type { QuestionOutcome } from "@bora/protocol";

/**
 * Adaptador para o DOM do TEC Concursos.
 *
 * TODO o acoplamento ao HTML de terceiro mora aqui. Quando o TEC mudar o
 * layout — e vai mudar — só este arquivo precisa ser tocado, e o motor da
 * bateria continua igual.
 */

const SELECTORS = {
  /** Elemento com o número da questão, usado quando a URL não tem o id. */
  questionId: ".id-questao",
  correct: ".questao-enunciado-resolucao-acertou",
  incorrect: ".questao-enunciado-resolucao-errou",
  /** Alvos de clique que indicam que o aluno está respondendo agora. */
  answerControls: "button, label, input, .alternativa, .questao-alternativa",
} as const;

export const QUESTIONS_URL = "https://www.tecconcursos.com.br/questoes";

export function questionUrl(questionId: number): string {
  return `${QUESTIONS_URL}/${Math.trunc(questionId)}`;
}

/** Navega na mesma aba, sem depender dos controles internos do TEC. */
export function goToQuestion(questionId: number): void {
  const target = questionUrl(questionId);
  if (location.href !== target) location.assign(target);
}

/** Id da questão aberta. A URL é a fonte confiável; o DOM é o reserva. */
export function currentQuestionId(): number | null {
  const fromPath = location.pathname.match(/\/questoes\/(\d+)/);
  if (fromPath?.[1]) return Number(fromPath[1]);

  const element = document.querySelector(SELECTORS.questionId);
  const fromDom = element?.textContent?.match(/(\d+)/);
  return fromDom?.[1] ? Number(fromDom[1]) : null;
}

function isVisible(element: Element | null): boolean {
  if (!element) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Resultado da questão aberta, ou `null` se ainda não foi respondida.
 *
 * A checagem de visibilidade importa: o TEC deixa os dois elementos no DOM e
 * alterna a exibição. Procurar só pela presença marcaria tudo como acerto.
 */
export function detectOutcome(): QuestionOutcome | null {
  if (isVisible(document.querySelector(SELECTORS.correct))) return "correct";
  if (isVisible(document.querySelector(SELECTORS.incorrect))) return "incorrect";

  // Reserva por texto, para o caso de as classes mudarem de nome.
  const text = document.body?.innerText ?? "";
  if (/Você\s+acertou!/i.test(text)) return "correct";
  if (/Você\s+errou!/i.test(text)) return "incorrect";
  return null;
}

export function isAnswerControl(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(SELECTORS.answerControls);
}

/**
 * Observa a página até a questão aberta ser respondida.
 *
 * Combina MutationObserver com uma sondagem lenta porque o TEC renderiza o
 * resultado de formas diferentes conforme o tipo de questão, e nem toda
 * mudança dispara mutação observável no elemento certo.
 */
export function watchForAnswer(onAnswered: () => void): () => void {
  const observer = new MutationObserver(onAnswered);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  const timer = setInterval(onAnswered, 900);

  return () => {
    observer.disconnect();
    clearInterval(timer);
  };
}
