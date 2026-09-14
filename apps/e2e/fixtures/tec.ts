/**
 * TEC Concursos, servido localmente.
 *
 * O site linka para o TEC no caderno de erros e no reforço, com o host fixo no
 * código (`TEC_QUESTION_URL`). Sem interceptação, um teste que clique num
 * desses links bate no site de um terceiro: lento, instável e indefensável.
 * Toda rota do domínio é respondida aqui.
 *
 * A página sintética era muito maior enquanto existia a extensão: ela
 * reproduzia o mecanismo de detecção de acerto por visibilidade, que o content
 * script lia. Com a extensão fora, o que resta a garantir é só que nenhuma
 * requisição saia para fora — o conteúdo serve para o teste reconhecer onde
 * parou.
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

async function fulfillTec(route: Route): Promise<void> {
  const questionId = questionIdFrom(route.request().url());
  const label = questionId === null ? "Questões" : `Questão ${questionId}`;

  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${label} — TEC (sintético)</title></head>
<body><h1 class="id-questao">${label}</h1></body>
</html>`,
  });
}

/** Intercepta o domínio do TEC no contexto inteiro (inclusive novas abas). */
export async function stubTec(target: BrowserContext | Page): Promise<void> {
  await target.route(TEC_GLOB, (route) => void fulfillTec(route));
}

export function questionUrl(questionId: number): string {
  return `${TEC_ORIGIN}/questoes/${questionId}`;
}
