import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Renova a sessão do Supabase a cada navegação.
 *
 * No Next 16 este arquivo se chama `proxy` (era `middleware`) e a função
 * exportada precisa ter o mesmo nome. O runtime é sempre `nodejs`.
 *
 * Server Components não conseguem gravar cookie, então a renovação do token
 * precisa acontecer aqui, antes da renderização.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToWrite) {
        for (const { name, value } of cookiesToWrite) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToWrite) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Não remova: é esta chamada que dispara a renovação do token.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Tudo, exceto estáticos e imagens — que não precisam de sessão e
    // pagariam uma ida ao servidor de auth à toa.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
