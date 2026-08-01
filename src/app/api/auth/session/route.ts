import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  homeForRole,
  SESSION_COOKIE,
  signNavigationSession,
  type AcademicAccess,
  type NavigationSession,
  type UserRole,
} from "@/lib/auth/session";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

type SessionRequest = { accessToken?: unknown };

function isRole(value: unknown): value is UserRole {
  return value === "aluno" || value === "professor" || value === "admin";
}

function isAcademicAccess(value: unknown): value is AcademicAccess {
  return ["pendente", "ativo", "bloqueado", "expirado", "cancelado"].includes(
    String(value),
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SessionRequest | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";

  if (!accessToken) {
    return Response.json({ error: "Token de acesso ausente." }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return Response.json({ error: "Sessão do Supabase inválida." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tipo,ativo,deleted_at")
    .eq("id", userData.user.id)
    .single();
  const role = profile?.tipo;

  if (profileError || !isRole(role) || !profile.ativo || profile.deleted_at) {
    const response = Response.json(
      { error: "Seu perfil está inativo ou não possui acesso à plataforma." },
      { status: 403 },
    );
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    return response;
  }

  const expiresAt = Math.min(
    (userData.user as { exp?: number }).exp ? Number((userData.user as { exp?: number }).exp) * 1000 : Date.now() + 60 * 60 * 1000,
    Date.now() + 60 * 60 * 1000,
  );
  const navigationSession: NavigationSession = {
    subject: userData.user.id,
    role,
    expiresAt,
  };

  if (role === "aluno") {
    const { data: access } = await supabase
      .from("acessos_aluno")
      .select("status")
      .eq("aluno_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    navigationSession.academicAccess = isAcademicAccess(access?.status)
      ? access.status
      : "pendente";
  }

  if (role === "professor") {
    const { data: links } = await supabase
      .from("professor_alunos")
      .select("aluno_id")
      .eq("professor_id", userData.user.id)
      .eq("status", "ativo");
    navigationSession.linkedStudentIds = links?.map((link) => link.aluno_id) ?? [];
  }

  try {
    const signedSession = await signNavigationSession(navigationSession);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, signedSession, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(expiresAt),
      priority: "high",
    });
  } catch (error) {
    console.error("[auth/session] Falha ao assinar a sessão de navegação.", error);
    return Response.json(
      { error: "A sessão do servidor ainda não foi configurada." },
      { status: 503 },
    );
  }

  return Response.json({ home: homeForRole(role), role });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
