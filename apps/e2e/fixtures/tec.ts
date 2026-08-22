/**
 * TEC Concursos, servido localmente.
 *
 * `tec-page.ts` tem `https://www.tecconcursos.com.br` fixo no código e
 * `goToQuestion()` navega direto para lá — não há como apontá-la para outro
 * host. Sem interceptação, um teste da extensão bate no site de um terceiro:
 * lento, instável e indefensável. Toda rota do domínio é respondida aqui.
 *
 * O HTML é o mínimo que `tec-page.ts` sabe ler, e a mecânica importa: o
 * resultado é detectado por VISIBILIDADE, não por presença. Os dois elementos
 * ficam no DOM desde a carga e o clique alterna `display` — é isso que dispara
 * `detectOutcome()`. Uma página que só inserisse o elemento do acerto passaria
 * no teste e não provaria nada.
 */
import type { BrowserContext, Page, Route } from "@playwright/test";

export const TEC_HOST = "www.tecconcursos.com.br";
export const TEC_ORIGIN = `https://${TEC_HOST}`;
export const TEC_GLOB = "**://*.tecconcursos.com.br/**";

/** Id da questão na URL, quando houver: `/questoes/100001`. */
function questionIdFrom(url: string): number | null {
  const match = new URL(url).pathname.match(/\/questoes\/(\d+)/);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Página sintética de questão.
 *
 * Os dois botões de resposta carregam a classe `questao-alternativa`, que é o
 * que `isAnswerControl()` reconhece: clicar num deles é o que derruba a guarda
 * de abertura e libera o registro do resultado.
 *
 * `preAnswered` reproduz o cenário da guarda (F-BAT-07): a questão já vem com o
 * resultado visível na carga, como o TEC faz com questão que o aluno já
 * resolveu antes, fora desta bateria.
 */
function questionHtml(questionId: number | null, preAnswered: "correct" | "incorrect" | null): string {
  const label = questionId === null ? "Questões" : `Questão ${questionId}`;
  const correctDisplay = preAnswered === "correct" ? "block" : "none";
  const incorrectDisplay = preAnswered === "incorrect" ? "block" : "none";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${label} — TEC (sintético)</title></head>
<body>
  <h1 class="id-questao">${label}</h1>

  <div class="questao-enunciado-resolucao-acertou" style="display:${correctDisplay}">Você acertou!</div>
  <div class="questao-enunciado-resolucao-errou" style="display:${incorrectDisplay}">Você errou!</div>

  <button class="questao-alternativa" data-outcome="correct">Responder certo</button>
  <button class="questao-alternativa" data-outcome="incorrect">Responder errado</button>

  <script>
    for (const botao of document.querySelectorAll(".questao-alternativa")) {
      botao.addEventListener("click", () => {
        const acertou = botao.dataset.outcome === "correct";
        document.querySelector(".questao-enunciado-resolucao-acertou").style.display =
          acertou ? "block" : "none";
        document.querySelector(".questao-enunciado-resolucao-errou").style.display =
          acertou ? "none" : "block";
      });
    }
  </script>
</body>
</html>`;
}

async function fulfillTec(route: Route, preAnswered: Map<number, "correct" | "incorrect">) {
  const url = route.request().url();
  const questionId = questionIdFrom(url);
  const answered = questionId === null ? null : preAnswered.get(questionId) ?? null;

  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: questionHtml(questionId, answered),
  });
}

export interface TecStub {
  /** Faz uma questão já abrir com o resultado visível, como no F-BAT-07. */
  preAnswer(questionId: number, outcome: "correct" | "incorrect"): void;
  /** Botão de resposta da questão aberta. */
  answer(page: Page, outcome: "correct" | "incorrect"): Promise<void>;
}

/** Intercepta o domínio do TEC no contexto inteiro (inclusive novas abas). */
export async function stubTec(target: BrowserContext | Page): Promise<TecStub> {
  const preAnswered = new Map<number, "correct" | "incorrect">();
  await target.route(TEC_GLOB, (route) => fulfillTec(route, preAnswered));

  return {
    preAnswer(questionId, outcome) {
      preAnswered.set(questionId, outcome);
    },
    async answer(page, outcome) {
      await page.locator(`.questao-alternativa[data-outcome="${outcome}"]`).click();
    },
  };
}

export function questionUrl(questionId: number): string {
  return `${TEC_ORIGIN}/questoes/${questionId}`;
}
