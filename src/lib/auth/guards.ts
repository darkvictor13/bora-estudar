import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import {
  getNavigationSession,
  type UserRole,
} from "./session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const studentRoutesWithoutAcademicAccess = new Set([
  "acesso",
  "perfil",
  "lista-de-espera",
]);

const getLiveIdentity = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tipo,ativo")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.ativo) return null;
  if (!["aluno", "professor", "admin"].includes(profile.tipo)) return null;

  return {
    client: supabase,
    role: profile.tipo as UserRole,
    subject: authData.user.id,
  };
});

export const getStudentAcademicAccessState = cache(async () => {
  const session = await requireRole("aluno");
  const { data, error } = await session.client.rpc("aluno_possui_acesso");

  return {
    error,
    isActive: error ? session.academicAccess === "ativo" : data === true,
    session,
  };
});

export async function requireRole(role: UserRole) {
  const session = await getNavigationSession();
  const liveIdentity = await getLiveIdentity();

  if (!session || !liveIdentity || session.subject !== liveIdentity.subject) redirect("/entrar");
  // Um papel alterado pelo administrador invalida o cookie de navegação antigo.
  // O login silencioso reconcilia a sessão Supabase e emite o papel atual.
  if (session.role !== liveIdentity.role) redirect("/entrar");
  if (liveIdentity.role !== role) redirect("/acesso-negado");

  return { ...session, client: liveIdentity.client };
}

export async function requireStudentAcademicAccess(segments: string[]) {
  const { error, isActive, session } = await getStudentAcademicAccessState();
  const route = segments[0] ?? "inicio";

  if (route === "lista-de-espera" && isActive) redirect("/aluno/inicio");
  if (!studentRoutesWithoutAcademicAccess.has(route) && (error || !isActive)) redirect("/aluno/acesso");

  return session;
}

export async function requireProfessorStudentLink(studentId: string) {
  const session = await requireRole("professor");
  const { data: linked, error } = await session.client.rpc("professor_tem_aluno", {
    p_aluno_id: studentId,
  });

  if (error || !linked) redirect("/acesso-negado");

  return session;
}
