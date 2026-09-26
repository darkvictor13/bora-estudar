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
  /**
   * Para onde o relato de erro vai. VAZIO EM DESENVOLVIMENTO E NA SUÍTE E2E: é
   * o que faz o SDK virar no-op, sem requisição para fora. Ver `lib/observability.ts`.
   *
   * É público como a chave do Supabase — o Vite assa as duas no bundle —, então
   * mora numa VARIABLE do Environment, nunca num secret.
   */
  readonly VITE_SENTRY_DSN: string | undefined;
  /** `staging` ou `producao`, para separar os erros dos dois ambientes. */
  readonly VITE_SENTRY_ENVIRONMENT: string | undefined;
  /** O SHA do commit publicado. É o `release` do Sentry. */
  readonly VITE_APP_VERSION: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
