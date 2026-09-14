import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Só o playground. O pacote não é compilado: `apps/web` importa o fonte
 * TypeScript direto (`main`/`types` apontam para `src/index.ts`) e é o Vite do
 * site que transforma. Um build de biblioteca aqui só acrescentaria um passo
 * entre editar o tema e ver o efeito.
 */
export default defineConfig({
  plugins: [react({ compiler: true })],
  server: { port: 5174, open: false },
});
