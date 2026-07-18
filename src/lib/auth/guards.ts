import "server-only";

import { redirect } from "next/navigation";

import {
  getNavigationSession,
  hasActiveStudentLink,
  isAcademicAccessActive,
  type UserRole,
} from "./session";

const studentRoutesWithoutAcademicAccess = new Set([
  "acesso",
  "perfil",
  "lista-de-espera",
]);

export async function requireRole(role: UserRole) {
  const session = await getNavigationSession();

  if (!session) redirect("/entrar");
  if (session.role !== role) redirect("/acesso-negado");

  return session;
}

export async function requireStudentAcademicAccess(segments: string[]) {
  const session = await requireRole("aluno");
  const route = segments[0] ?? "inicio";

  if (!studentRoutesWithoutAcademicAccess.has(route) && !isAcademicAccessActive(session)) {
    redirect("/aluno/acesso");
  }

  return session;
}

export async function requireProfessorStudentLink(studentId: string) {
  const session = await requireRole("professor");

  if (!hasActiveStudentLink(session, studentId)) redirect("/acesso-negado");

  return session;
}
