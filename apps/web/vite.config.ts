import path from "node:path";

import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * SOURCEMAP E ENVIO ANDAM JUNTOS, OU NÃO ANDAM.
 *
 * `wrangler.jsonc` publica `assets.directory: "./dist"` INTEIRO — não há passo
 * de seleção entre compilar e publicar. Um `.map` gerado e não removido vai
 * para o ar, servido a qualquer um, e entrega o código-fonte junto com o
 * bundle. Por isso o sourcemap é gerado só quando existe token para enviá-lo ao
 * Sentry, que é o mesmo plugin que o apaga do `dist` depois de subir.
 *
 * A consequência é deliberada: o job `check` do `ci.yml` — que roda em PR de
 * fork e não recebe secret nenhum — compila sem sourcemap e sem plugin, e
 * continua verde. O que ele prova é que o bundle compila, e isso não depende do
 * Sentry.
 *
 * O espalhamento condicional em cada campo não é estilo: `exactOptionalProperty
 * Types` recusa `undefined` numa propriedade opcional, e `org: undefined` não é
 * a mesma coisa que `org` ausente.
 */
const uploadSourcemaps = Boolean(process.env["SENTRY_AUTH_TOKEN"]);

function sentryPlugins() {
  const authToken = process.env["SENTRY_AUTH_TOKEN"];
  if (!authToken) return [];

  const org = process.env["SENTRY_ORG"];
  const project = process.env["SENTRY_PROJECT"];
  // O MESMO valor que `VITE_APP_VERSION` assa no bundle: é o que liga o stack
  // trace recebido ao sourcemap enviado. Divergir aqui dá o pior resultado
  // possível — evento com release que não casa com artefato nenhum, e um trace
  // minificado que parece defeito do SDK.
  const release = process.env["VITE_APP_VERSION"];

  return [
    sentryVitePlugin({
      authToken,
      ...(org ? { org } : {}),
      ...(project ? { project } : {}),
      ...(release ? { release: { name: release } } : {}),

      // Mesma postura de `WRANGLER_SEND_METRICS: "false"` nos workflows: a
      // ferramenta de build não manda telemetria daqui.
      telemetry: false,

      sourcemaps: {
        // APAGA OS `.map` DO `dist` DEPOIS DE ENVIAR. Sem isto o passo seguinte
        // do deploy publica o código-fonte junto.
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },

      // SENTRY FORA DO AR NÃO PODE SEGURAR UM DEPLOY.
      //
      // O deploy é banco → site, e a ordem não pode inverter. Falhar o job
      // `site` deixa o banco já migrado com o bundle antigo no ar; pagar esse
      // preço por uma indisponibilidade de terceiro seria trocar um defeito
      // conhecido por um risco maior. O envio é adiado para o próximo deploy —
      // o que se perde é a legibilidade do stack trace daquela release, não o
      // relato em si.
      //
      // Os `.map` continuam saindo do `dist`: o step seguinte do workflow os
      // apaga de qualquer forma, e `scripts/fumaca.sh` confere no ar.
      errorHandler: (error) => {
        console.warn(`[sentry] envio de sourcemap falhou, seguindo assim mesmo: ${error.message}`);
      },
    }),
  ];
}

/**
 * O site é uma SPA: nenhum servidor de aplicação, só arquivos estáticos.
 *
 * Isso é possível porque a fronteira de segurança está no banco — RLS, grant
 * por coluna e RPC —, e não numa camada de servidor do front. O bundle carrega
 * apenas a publishable key, que é pública por definição. Ver docs/arquitetura.md.
 */
export default defineConfig({
  plugins: [
    // Paridade com o `reactCompiler: true` que estava no next.config.ts. Na
    // v6 do plugin o transform é oxc, e o compiler exige `oxc-transform-react`.
    react({ compiler: true }),

    ...sentryPlugins(),
  ],

  /**
   * Bandeiras de compilação do SDK.
   *
   * `__SENTRY_TRACING__` remove do bundle o código de tracing, que este projeto
   * não usa — `lib/observability.ts` não define `tracesSampleRate`.
   * `__SENTRY_DEBUG__` remove as mensagens de diagnóstico do próprio SDK.
   */
  define: {
    __SENTRY_DEBUG__: false,
    __SENTRY_TRACING__: false,
  },

  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },

  server: {
    // A suíte e2e assume 3000 como padrão (apps/e2e/support/app.ts) e passa
    // `--port` quando quer outra. `strictPort` evita o pior dos mundos: o Vite
    // subir na 3001 em silêncio e a suíte testar um servidor que não existe.
    port: 3000,
    strictPort: true,
  },

  build: {
    // Erro de bundle grande não ajuda aqui: o app é um painel autenticado,
    // atrás de login, e o primeiro carregamento não disputa SEO.
    chunkSizeWarningLimit: 900,

    // Ver o comentário no topo: gerar sem ter para onde enviar é publicar o
    // código-fonte em `dist`.
    sourcemap: uploadSourcemaps,
  },
});
