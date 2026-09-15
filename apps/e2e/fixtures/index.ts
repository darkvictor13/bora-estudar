/**
 * Ponto único de entrada dos testes: `import { test, expect } from "../fixtures"`.
 *
 * As fixtures ficam penduradas no `page` embutido do Playwright, e não num
 * contexto criado à mão. É de propósito: vídeo, trace, viewport e `baseURL` são
 * configurados pelo projeto, e um `browser.newContext()` dentro do teste não
 * herda nada disso — o comando de vídeo gravaria uma pasta vazia.
 */
import { test as base, expect, type Page } from "@playwright/test";

import { createScenario, type Person, type Scenario, type ScenarioOptions } from "./scenario.ts";
import { authenticate } from "./session.ts";
import { stubTec } from "./tec.ts";

export { expect };
export * from "./scenario.ts";
export * from "./tec.ts";
export { authenticate } from "./session.ts";

/**
 * Ruído previsível do ambiente local, que não é defeito do produto.
 *
 * O servidor de desenvolvimento transforma módulo sob demanda: na primeira
 * visita a uma rota, um pedido pode ser abortado ou chegar antes de o módulo
 * existir. Isso aparece no console e não diz nada sobre o produto — sem estes
 * filtros o teste de "abre sem erro de console" falha ou passa conforme a rota
 * já tenha sido carregada por outro worker.
 *
 * `/@vite/`, `/@react-refresh` e `/@fs/` são os prefixos internos do Vite, no
 * lugar do `_next/*` de antes.
 */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /@vite\//i,
  /@react-refresh/i,
  /@fs\//i,
  /net::ERR_ABORTED/i,
  /Failed to load resource/i,
];

export interface SignIn {
  /**
   * Autentica a aba como a pessoa informada, trocando de identidade se já
   * houver uma. Não navega: o teste decide para onde ir depois.
   */
  (person: Person): Promise<void>;
}

interface Options {
  /** Cenário que este arquivo (ou `describe`) quer. Use com `test.use`. */
  readonly scenarioOptions: ScenarioOptions;
}

interface Fixtures {
  /** Par professor/aluno exclusivo deste teste. */
  readonly scenario: Scenario;
  readonly signIn: SignIn;
  /** `page` já autenticada como o aluno do cenário. */
  readonly studentPage: Page;
  /** `page` já autenticada como o professor do cenário. */
  readonly teacherPage: Page;
  /** Nada a usar: existe para interceptar o domínio do TEC. */
  readonly tec: void;
  /** Erros de console acumulados na aba, já sem o ruído do ambiente. */
  readonly consoleErrors: string[];
}

export const test = base.extend<Options & Fixtures>({
  scenarioOptions: [{}, { option: true }],

  scenario: async ({ scenarioOptions }, use) => {
    await use(await createScenario(scenarioOptions));
  },

  signIn: async ({ page, baseURL }, use) => {
    if (!baseURL) throw new Error("baseURL não configurada no projeto do Playwright");
    const context = page.context();
    await use(async (person) => {
      await context.clearCookies();
      await authenticate(context, person, baseURL);
    });
  },

  studentPage: async ({ page, scenario, signIn }, use) => {
    await signIn(scenario.student);
    await use(page);
  },

  teacherPage: async ({ page, scenario, signIn }, use) => {
    await signIn(scenario.teacher);
    await use(page);
  },

  /**
   * Automática de propósito.
   *
   * Interceptar o domínio do TEC não custa nada em quem não navega para lá, e
   * garante por construção que NENHUM teste bata no site de um terceiro —
   * inclusive um teste novo, escrito por quem não leu esta observação. O site
   * ainda linka para lá no caderno de erros e no reforço.
   */
  tec: [
    async ({ page }, use) => {
      await stubTec(page);
      await use();
    },
    { auto: true },
  ],

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    const keep = (message: string) => {
      if (!IGNORED_CONSOLE.some((pattern) => pattern.test(message))) errors.push(message);
    };

    page.on("console", (message) => {
      if (message.type() === "error") keep(message.text());
    });
    // `pageerror` é a exceção não tratada, que não passa por `console`.
    page.on("pageerror", (error) => keep(`pageerror: ${error.message}`));

    await use(errors);
  },
});
