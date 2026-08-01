import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  roleForPath,
  safeReturnPath,
} from "@/lib/auth/policies";
import {
  homeForRole,
  SESSION_COOKIE,
  verifyNavigationSession,
} from "@/lib/auth/session";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function proxy(request: NextRequest) {
  let refreshedCookies: CookieToSet[] = [];
  let refreshedHeaders: Record<string, string> = {};
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        refreshedCookies = cookiesToSet;
        refreshedHeaders = headers;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      },
    },
  });

  await supabase.auth.getUser();

  function withRefreshedSession(response: NextResponse) {
    refreshedCookies.forEach(({ name, options, value }) => response.cookies.set(name, value, options));
    Object.entries(refreshedHeaders).forEach(([name, value]) => response.headers.set(name, value));
    return response;
  }

  const { pathname, search } = request.nextUrl;
  const session = await verifyNavigationSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (pathname === "/") {
    return withRefreshedSession(NextResponse.redirect(
      new URL(session ? homeForRole(session.role) : "/entrar", request.url),
    ));
  }

  const expectedRole = roleForPath(pathname);
  if (!expectedRole) return withRefreshedSession(NextResponse.next({ request }));

  if (!session) {
    const loginUrl = new URL("/entrar", request.url);
    loginUrl.searchParams.set("proximo", safeReturnPath(pathname, search));
    return withRefreshedSession(NextResponse.redirect(loginUrl));
  }

  if (session.role !== expectedRole) {
    const loginUrl = new URL("/entrar", request.url);
    loginUrl.searchParams.set("proximo", safeReturnPath(pathname, search));
    return withRefreshedSession(NextResponse.redirect(loginUrl));
  }

  return withRefreshedSession(NextResponse.next({ request }));
}

export const config = {
  matcher: ["/", "/aluno/:path*", "/professor/:path*", "/admin/:path*"],
};
