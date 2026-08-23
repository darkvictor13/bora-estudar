import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  ],

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
  },
});
