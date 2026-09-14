/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  /**
   * Qual implementação de `lib/api` atende. `supabase` (o padrão) fala com o
   * banco; `fixtures` serve dados em memória, e é o caminho para construir uma
   * tela cuja fase o adaptador ainda não escreveu. Ver `lib/api/index.ts`.
   */
  readonly VITE_API_IMPL: "fixtures" | "supabase" | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
