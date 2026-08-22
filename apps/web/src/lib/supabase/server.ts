import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@bora/database";

import { env } from "@/lib/env";

/**
 * Cliente para Server Components, Route Handlers e Server Actions.
 *
 * `cookies()` é assíncrono a partir do Next 16, então esta função também é.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToWrite) {
        try {
          for (const { name, value, options } of cookiesToWrite) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode gravar cookie. Isso é esperado: quem
          // renova a sessão é o proxy, que roda antes da renderização.
        }
      },
    },
  });
}

/**
 * Usuário autenticado, ou `null`.
 *
 * Usa `getUser()`, que valida o token no servidor de auth. `getSession()` lê o
 * cookie sem validar e não serve para decisão de acesso.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
