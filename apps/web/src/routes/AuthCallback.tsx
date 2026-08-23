import { redirect } from "react-router";

import { supabase } from "@/lib/supabase/client";
import { invalidateSession } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

/**
 * Fecha o ciclo do link enviado por e-mail.
 *
 * O GoTrue não devolve uma sessão pronta: devolve um `code` (fluxo PKCE, que é
 * o que `@supabase/ssr` usa) ou um `token_hash` (fluxo antigo). Nos dois casos
 * alguém precisa trocar isso por sessão.
 *
 * No Next isto era um Route Handler, e a justificativa estava escrita no
 * código: "só Route Handler grava cookie". Essa razão não existe mais — no
 * navegador, gravar cookie é o comportamento normal do cliente do Supabase.
 * Sobrou o trabalho de verdade, que é a troca, e ele cabe num loader.
 */
export async function authCallbackLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Só caminho interno: `next` vem da URL e não pode virar redirecionamento
  // aberto para outro host.
  const requested = url.searchParams.get("next") ?? ROUTES.resetPassword;
  const next =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : ROUTES.resetPassword;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({
          type: (type as "recovery" | "email" | "invite" | "magiclink") ?? "recovery",
          token_hash: tokenHash,
        })
      : { error: new Error("link sem código") };

  // Sem sessão, a tela de destino é quem explica o que aconteceu — ela já
  // trata o caso e oferece pedir um link novo. Por isso o destino é o mesmo
  // com erro ou sem.
  if (!error) invalidateSession();

  throw redirect(next);
}

/** Nunca renderiza: o loader sempre redireciona. */
export function AuthCallback() {
  return null;
}
