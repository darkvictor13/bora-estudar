/**
 * Login sem passar pelo formulário.
 *
 * Autenticar pela interface custa uma navegação, uma server action e um
 * redirect — por teste. Multiplicado pela suíte inteira, é a maior fatia do
 * tempo de execução, gasta reprovando algo que os testes de `auth.spec.ts` já
 * provam uma vez.
 *
 * Aqui o `@supabase/ssr` é usado exatamente como o site o usa, mas com um
 * armazenamento em memória: o `signInWithPassword` produz os MESMOS cookies
 * que o servidor gravaria, e eles são injetados no contexto do navegador. Não
 * há atalho de formato nem cookie forjado — se o `@supabase/ssr` mudar o nome
 * ou a divisão em pedaços dos cookies, isto continua correto porque é a
 * biblioteca que os monta.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";

/** O stack local do Supabase sempre gera as mesmas chaves. */
export const SUPABASE_URL = process.env["E2E_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
export const SUPABASE_KEY =
  process.env["E2E_SUPABASE_KEY"] ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

interface StoredCookie {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Cookies de uma sessão autenticada, prontos para `context.addCookies`.
 *
 * `sameSite: "Lax"` e `path: "/"` reproduzem o que o `@supabase/ssr` pede ao
 * gravar; `domain` fica no host da aplicação porque o cookie é do site, não do
 * Supabase.
 */
export async function signInCookies(
  email: string,
  password: string,
  host: string,
): Promise<Parameters<BrowserContext["addCookies"]>[0]> {
  const jar = new Map<string, StoredCookie>();

  const client = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const cookie of list) jar.set(cookie.name, cookie);
      },
    },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login de fixture falhou para ${email}: ${error.message}`);
  if (jar.size === 0) throw new Error(`login de ${email} não produziu cookie de sessão`);

  return [...jar.values()].map(({ name, value }) => ({
    name,
    value,
    domain: host,
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));
}

/** Autentica o contexto do navegador como a pessoa informada. */
export async function authenticate(
  context: BrowserContext,
  person: { readonly email: string; readonly password: string },
  baseURL: string,
): Promise<void> {
  const host = new URL(baseURL).hostname;
  await context.addCookies(await signInCookies(person.email, person.password, host));
}
