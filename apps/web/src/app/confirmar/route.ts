import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { ROUTES } from "@/lib/routes";

/**
 * Fecha o ciclo do link enviado por e-mail.
 *
 * O GoTrue não devolve uma sessão pronta: devolve um `code` (fluxo PKCE, que é
 * o que `@supabase/ssr` usa) ou um `token_hash` (fluxo antigo). Nos dois casos
 * alguém precisa trocar isso por sessão E gravar o cookie — e gravar cookie é
 * privilégio de Route Handler. Sem esta rota, `/redefinir-senha` chamava
 * `getSessionContext()`, recebia `null` e mostrava "este link expirou" para
 * todo mundo, sempre.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Só caminho interno: `next` vem da URL e não pode virar redirecionamento
  // aberto para outro host.
  const requested = url.searchParams.get("next") ?? ROUTES.resetPassword;
  const next = requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : ROUTES.resetPassword;

  const response = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToWrite) {
        for (const { name, value, options } of cookiesToWrite) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({
          type: (type as "recovery" | "email" | "invite" | "magiclink") ?? "recovery",
          token_hash: tokenHash,
        })
      : { error: new Error("link sem código") };

  // Sem sessão, a tela de destino é quem explica o que aconteceu — ela já
  // trata o caso e oferece pedir um link novo.
  if (error) return NextResponse.redirect(new URL(next, url.origin));

  return response;
}
