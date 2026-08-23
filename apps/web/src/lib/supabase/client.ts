import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@bora/database";

import { env } from "@/lib/env";

/**
 * O cliente do Supabase, um por aplicação.
 *
 * Continua sendo o `createBrowserClient` do `@supabase/ssr`, e não o
 * `createClient` do supabase-js, por um motivo concreto: ele guarda a sessão
 * em COOKIE, não em localStorage. Três consequências que valem a dependência:
 *
 *  - a sessão sobrevive a uma navegação de documento — e voltar do TEC é
 *    exatamente isso (`location.assign`), então o token precisa estar num
 *    lugar que a nova página encontre;
 *  - `apps/e2e/fixtures/session.ts` autentica injetando os cookies que a
 *    própria biblioteca monta. Trocar o armazenamento invalidaria a fixture de
 *    login da suíte inteira;
 *  - se um dia voltar a existir renderização no servidor, o cookie já está lá.
 *
 * Singleton de propósito. Cada `createBrowserClient` registra o seu próprio
 * temporizador de renovação de token e o seu próprio listener de
 * `onAuthStateChange`; criar um por componente, como o código do Next fazia,
 * multiplicaria os dois.
 */
export const supabase = createBrowserClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      /**
       * A troca do código do e-mail por sessão é feita à mão, em
       * `routes/AuthCallback.tsx`.
       *
       * Com o padrão (`true`) o cliente procura um `?code=` na URL e faz a
       * troca sozinho, de forma assíncrona, na construção do módulo. Isso
       * corre com o loader da rota de callback: quem chegasse depois perderia,
       * e `exchangeCodeForSession` falharia dizendo que o código é inválido —
       * o que a pessoa leria como "este link expirou". Um caminho explícito
       * troca uma corrida por uma ordem.
       */
      detectSessionInUrl: false,
    },
  },
);
