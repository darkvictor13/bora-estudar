/**
 * Dois projetos, dois propósitos.
 *
 *   fast   — `npm run e2e`. Sem vídeo, sem trace, sem screenshot, paralelismo
 *            no máximo que a máquina suporta. É o que roda antes de commitar.
 *   video  — `npm run e2e:video`. Um `.webm` por teste, com trace, viewport
 *            fixo e menos workers para a gravação não competir por CPU.
 *
 * O que os dois compartilham é a suíte: os mesmos arquivos, os mesmos testes.
 * A diferença é só o que se guarda do que aconteceu.
 */
import { defineConfig, devices } from "@playwright/test";
import os from "node:os";

import { BASE_URL } from "./support/app.ts";

/**
 * Um worker por núcleo, menos dois.
 *
 * Os dois reservados são para o servidor do Vite e para o Postgres, que
 * disputam a mesma máquina. Deixar o Playwright usar todos os núcleos deixa a
 * suíte mais LENTA: as requisições passam a esperar o servidor que ficou sem
 * CPU, e o timeout das ações começa a estourar por contenção.
 */
const cores = os.availableParallelism?.() ?? os.cpus().length;
const fastWorkers = Math.max(2, cores - 2);

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",

  // Toda fixture é exclusiva do teste que a pediu, então nada impede o
  // paralelismo dentro do arquivo.
  fullyParallel: true,

  // `test.only` esquecido no arquivo não pode passar por verde no CI.
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,

  // A folga é para a primeira visita a cada rota. Com o Vite a transformação
  // sob demanda é bem mais barata que a compilação do `next dev`, mas o custo
  // não é zero: sem servidor de aplicação, a primeira tela ainda espera a
  // cascata de sessão da SPA (validar token, ler perfil, ler assinatura) antes
  // de o loader da página começar.
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: process.env["CI"]
    ? [["github"], ["list"]]
    : [["list"], ["./support/video-reporter.ts"]],

  use: {
    baseURL: BASE_URL,
    // Toda navegação de teste é local; nada aqui deve depender da rede.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [
    {
      name: "fast",
      use: {
        ...devices["Desktop Chrome"],
        // Nada de artefato: gravar trace ou vídeo é o que mais custa numa
        // execução em que ninguém vai olhar o resultado.
        trace: "off",
        video: "off",
        screenshot: "off",
      },
      workers: fastWorkers,
    },
    {
      name: "video",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        video: { mode: "on", size: { width: 1280, height: 720 } },
        trace: "on",
        screenshot: "only-on-failure",
      },
      // Gravar disputa CPU com o encoder de vídeo de cada contexto. Metade dos
      // workers do modo rápido mantém o vídeo fluido.
      workers: Math.max(1, Math.floor(fastWorkers / 2)),
    },
  ],

  outputDir: "./test-results",

  /**
   * Reaproveita um `npm run dev` que já esteja no ar.
   *
   * É o caminho mais rápido no dia a dia: o servidor já transformou os módulos,
   * e a suíte não paga isso de novo. Sem servidor no ar, sobe um — na porta que
   * a `E2E_BASE_URL` pedir, e não na 3000 fixa, senão apontar a suíte para
   * outra porta subiria um servidor que ninguém iria consultar.
   *
   * Ao contrário do `next dev`, que recusava um segundo servidor para o mesmo
   * diretório em QUALQUER porta, o Vite aceita quantos quiser — um por porta.
   * Apontar a `E2E_BASE_URL` para outra porta agora funciona mesmo com um
   * `npm run dev` no ar.
   *
   * `strictPort: true` no vite.config é o que torna isto confiável: sem ele o
   * Vite cairia para a porta seguinte em silêncio, e a suíte ficaria esperando
   * numa porta onde não há servidor até estourar o timeout.
   */
  webServer: {
    command: `npm run dev --workspace @bora/web -- --port ${new URL(BASE_URL).port || "3000"}`,
    url: BASE_URL,
    cwd: "../..",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
