/**
 * §5 do `docs/fluxos-e2e.md` — o relato de erro, pelo lado do que ele NÃO faz.
 *
 * A regra que este arquivo protege é a mesma que vale para o TEC: nenhuma
 * requisição sai para um terceiro durante a suíte. O relato de erro é a única
 * coisa no produto que fala com um serviço externo por conta própria, e o que o
 * mantém calado aqui é o `VITE_SENTRY_DSN` vazio — que não é configuração de
 * teste, é a ausência dela.
 *
 * É por isso que a garantia precisa de teste e não de comentário: ela depende
 * de alguém NÃO ter preenchido uma variável. Um `.env.local` com o DSN de
 * staging, copiado de um colega, passa despercebido em revisão de código — não
 * há diff — e a partir daí cada execução da suíte despeja erro sintético no
 * painel do ambiente publicado, com os `user.id` dos usuários de teste.
 *
 * ## O TESTE PRECISA PROVOCAR UM ERRO RELATÁVEL, E ESSE É O PONTO TODO
 *
 * A primeira versão deste arquivo navegava e conferia que nada saía. Ela passava
 * — e passava também com o DSN preenchido, medido. O motivo: o SDK só fala com o
 * servidor quando tem evento a mandar, e os erros do caminho comum (`not_found`,
 * `forbidden`) são justamente os que o filtro descarta. O teste provava que um
 * produto sem erro não relata erro, que é verdade sobre qualquer produto.
 *
 * Por isso a interceptação abaixo força um `unknown` — o único código que o
 * filtro deixa passar. Medido com o DSN preenchido: o teste fica vermelho.
 *
 * E ele fica vermelho na CONTAGEM DE `error-code`, não na lista de requisições.
 * É de propósito, e vale saber qual das duas asserções trabalha: o envelope do
 * SDK é assíncrono e pode não ter saído no instante em que a lista é lida, mas
 * o código só é renderizado quando um evento foi realmente criado. A lista
 * enuncia a regra; a contagem é quem a sustenta.
 */
import { expect, test } from "../fixtures/index.ts";
import { testId } from "../support/ui.ts";

/** Hosts do serviço de relato, incluindo o CDN de onde o SDK poderia vir. */
function isReporting(url: string): boolean {
  return /(^|\.)sentry\.io$|(^|\.)sentry-cdn\.com$/.test(new URL(url).host);
}

test.describe("F-OBS-01 · o ambiente local não fala com o relato de erro", () => {
  test("nem na navegação normal, nem quando um erro relatável acontece", async ({
    teacherPage,
  }) => {
    const saidas: string[] = [];
    teacherPage.on("request", (request) => {
      if (isReporting(request.url())) saidas.push(request.url());
    });

    await teacherPage.goto("/professor");
    await expect(teacherPage.locator("h1")).toBeVisible();
    expect(saidas, `vazou na navegação normal: ${saidas.join(", ")}`).toEqual([]);

    // `XX999` não está no `switch` de `translateDbError`, então ele cai no
    // `default` e vira `unknown` — a afirmação, escrita pelo próprio adaptador,
    // de que ninguém previu este erro. É o que `captureRouteError` relata.
    //
    // A INTERCEPTAÇÃO É DE UMA TABELA SÓ, e não de `/rest/v1/` inteiro. Derrubar
    // tudo derruba junto a leitura do perfil, que é do loader do LAYOUT: o erro
    // sobe para o `ErrorBoundary` da raiz, que substitui o `RootLayout` — e com
    // ele o `ThemeProvider` — e a tela de erro quebra ao pintar. Medido: tela
    // branca, `Cannot read properties of undefined (reading 'palette')`.
    // Falhando só `study_plans`, quem pega é o boundary da ÁREA, a barra lateral
    // continua de pé, e é esse o caminho que o produto desenhou.
    await teacherPage.route(/\/rest\/v1\/study_plans/, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          code: "XX999",
          message: "falha sintética de F-OBS-01",
          details: null,
          hint: null,
        }),
      }),
    );

    await teacherPage.goto("/professor/planejamentos");
    await expect(teacherPage.getByText("Algo deu errado")).toBeVisible();

    // O código do erro só aparece quando o evento foi criado. Sem DSN não há
    // evento, logo não há código — e a asserção acima já esperou a tela, que é
    // o que permite contar logo em seguida: `count()` não espera por nada.
    await expect(testId(teacherPage, "error-code")).toHaveCount(0);

    expect(saidas, `requisições que vazaram: ${saidas.join(", ")}`).toEqual([]);
  });
});
