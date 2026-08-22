import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROUTES, homeForRole } from "@/lib/routes";
import type { Enum } from "@bora/database";

export type UserRole = Enum<"user_role">;

export interface SessionContext {
  readonly user: User;
  readonly profileId: string;
  readonly name: string;
  readonly role: UserRole;
  /** `true` quando o aluno tem assinatura ativa. Professor e admin: sempre. */
  readonly hasAccess: boolean;
}

/**
 * Contexto da sessão, ou `null` se não houver ninguém autenticado.
 *
 * Uma única ida ao banco resolve perfil e acesso. Chamada em todo layout de
 * área protegida; o Next deduplica dentro do mesmo render.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,name,role")
    .eq("id", user.id)
    .maybeSingle();

  // Sem perfil o gatilho de auth falhou. Tratar como não autenticado é mais
  // seguro do que assumir um papel.
  if (!profile) return null;

  let hasAccess = profile.role !== "student";
  if (profile.role === "student") {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    hasAccess = !!subscription;
  }

  return { user, profileId: profile.id, name: profile.name, role: profile.role, hasAccess };
}

/** Exige sessão. Redireciona para o login se não houver. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect(ROUTES.signIn);
  return session;
}

/** Exige um papel específico. Manda para a home do papel real se não bater. */
export async function requireRole(role: UserRole): Promise<SessionContext> {
  const session = await requireSession();
  if (session.role !== role) redirect(homeForRole(session.role));
  return session;
}

/**
 * Exige aluno COM acesso liberado.
 *
 * Usada no topo de cada tela de estudo. Não fica no layout porque o layout
 * precisa continuar renderizando a sidebar e as duas telas livres — dados e
 * lista de espera — para quem ainda aguarda liberação.
 */
export async function requireStudentAccess(): Promise<SessionContext> {
  const session = await requireRole("student");
  if (!session.hasAccess) redirect(ROUTES.student.waitlist);
  return session;
}
