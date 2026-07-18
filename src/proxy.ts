import { NextResponse, type NextRequest } from "next/server";

import {
  canStudentAccessPath,
  professorStudentIdForPath,
  roleForPath,
  safeReturnPath,
} from "@/lib/auth/policies";
import {
  homeForRole,
  hasActiveStudentLink,
  SESSION_COOKIE,
  verifyNavigationSession,
} from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifyNavigationSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(session ? homeForRole(session.role) : "/entrar", request.url),
    );
  }

  const expectedRole = roleForPath(pathname);
  if (!expectedRole) return NextResponse.next();

  if (!session) {
    const loginUrl = new URL("/entrar", request.url);
    loginUrl.searchParams.set("proximo", safeReturnPath(pathname, search));
    return NextResponse.redirect(loginUrl);
  }

  if (session.role !== expectedRole) {
    return NextResponse.redirect(new URL("/acesso-negado", request.url));
  }

  if (
    session.role === "aluno" &&
    !canStudentAccessPath(pathname, session.academicAccess)
  ) {
    return NextResponse.redirect(new URL("/aluno/acesso", request.url));
  }

  const studentId = professorStudentIdForPath(pathname);
  if (studentId && !hasActiveStudentLink(session, studentId)) {
    return NextResponse.redirect(new URL("/acesso-negado", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/aluno/:path*", "/professor/:path*", "/admin/:path*"],
};
