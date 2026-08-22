/**
 * A extensão de verdade, carregada num Chromium de verdade.
 *
 * Precisa de fixtures próprias porque uma extensão só carrega em contexto
 * persistente (`launchPersistentContext`), e o `page` embutido do Playwright
 * vem de um contexto comum. Daí um `test` separado, exportado deste arquivo.
 *
 * Dois detalhes não são negociáveis:
 *
 *   - `channel: "chromium"` — no headless antigo a extensão simplesmente não
 *     carrega, e o teste falha dizendo que o painel não existe;
 *   - `dist/` precisa estar compilado. O `global-setup` compila.
 *
 * O vídeo é ligado à mão a partir da configuração do projeto: contexto criado
 * dentro do teste não herda o `use` do projeto, então sem isto o comando de
 * vídeo gravaria tudo, menos a extensão.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as base, chromium, type BrowserContext, type Page, type Video } from "@playwright/test";

import { createScenario, type Scenario, type ScenarioOptions } from "./scenario.ts";
import { signInCookies } from "./session.ts";
import { stubTec, type TecStub } from "./tec.ts";

export const EXTENSION_DIST = path.resolve(import.meta.dirname, "../../extension/dist");

interface Options {
  readonly scenarioOptions: ScenarioOptions;
}

interface Fixtures {
  readonly scenario: Scenario;
  /** Contexto persistente com a extensão instalada e o TEC interceptado. */
  readonly extContext: BrowserContext;
  readonly extPage: Page;
  readonly tec: TecStub;
  /** Autentica o contexto como a pessoa informada. */
  readonly signIn: (person: { readonly email: string; readonly password: string }) => Promise<void>;
}

export const test = base.extend<Options & Fixtures>({
  scenarioOptions: [{}, { option: true }],

  scenario: async ({ scenarioOptions }, use) => {
    await use(await createScenario(scenarioOptions));
  },

  extContext: async ({ baseURL }, use, testInfo) => {
    const wantsVideo = testInfo.project.use.video && testInfo.project.use.video !== "off";
    const context = await chromium.launchPersistentContext(
      mkdtempSync(path.join(tmpdir(), "bora-e2e-ext-")),
      {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${EXTENSION_DIST}`,
          `--load-extension=${EXTENSION_DIST}`,
        ],
        viewport: { width: 1280, height: 720 },
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        ...(baseURL ? { baseURL } : {}),
        ...(wantsVideo ? { recordVideo: { dir: testInfo.outputPath("video") } } : {}),
      },
    );

    // Guardados antes do close: depois dele o objeto Page já não responde, e é
    // só depois dele que o arquivo do vídeo está fechado e completo.
    const videos: Video[] = [];
    await use(context);
    for (const page of context.pages()) {
      const video = page.video();
      if (video) videos.push(video);
    }
    await context.close();
    for (const video of videos) {
      await testInfo.attach("video", { path: await video.path(), contentType: "video/webm" });
    }
  },

  extPage: async ({ extContext }, use) => {
    // O contexto persistente já sobe com uma aba. Reaproveitar essa aba, em vez
    // de abrir outra, é o que faz o vídeo gravar o que interessa.
    await use(extContext.pages()[0] ?? (await extContext.newPage()));
  },

  tec: [
    async ({ extContext }, use) => {
      // No contexto, não na aba: a extensão navega, e uma rota registrada só
      // na aba original deixaria de valer numa aba nova.
      await use(await stubTec(extContext));
    },
    { auto: true },
  ],

  signIn: async ({ extContext, baseURL }, use) => {
    if (!baseURL) throw new Error("baseURL não configurada no projeto do Playwright");
    const host = new URL(baseURL).hostname;
    await use(async (person) => {
      await extContext.clearCookies();
      await extContext.addCookies(await signInCookies(person.email, person.password, host));
    });
  },
});

export { expect } from "@playwright/test";
