"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

export interface FormState {
  readonly error?: string;
  readonly success?: string;
}

const EMPTY: FormState = {};

function text(data: FormData, field: string): string {
  return String(data.get(field) ?? "").trim();
}

/**
 * Traduz o erro do GoTrue.
 *
 * A mensagem crua vem em inglês e às vezes é técnica demais ("Invalid login
 * credentials" para senha errada E para e-mail inexistente). Aqui vira algo
 * que o aluno entende, sem revelar se o e-mail existe.
 */
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  return message;
}

export async function signIn(_prev: FormState = EMPTY, data: FormData): Promise<FormState> {
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translateAuthError(error.message) };

  const session = await getSessionContext();
  revalidatePath("/", "layout");
  redirect(session ? homeForRole(session.role) : ROUTES.student.overview);
}

export async function signUp(_prev: FormState = EMPTY, data: FormData): Promise<FormState> {
  const name = text(data, "name");
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");

  if (name.length < 3) return { error: "Informe seu nome completo." };
  if (!email) return { error: "Informe seu e-mail." };
  if (password.length < 6) return { error: "A senha precisa ter pelo menos 6 caracteres." };

  const supabase = await createServerSupabaseClient();
  // O papel vai no metadata: tg_create_profile_for_new_user lê `role` de lá.
  // Cadastro público só cria aluno; professor e admin são criados por dentro.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role: "student" } },
  });
  if (error) return { error: translateAuthError(error.message) };

  revalidatePath("/", "layout");
  redirect(ROUTES.student.waitlist);
}

export async function requestPasswordReset(
  _prev: FormState = EMPTY,
  data: FormData,
): Promise<FormState> {
  const email = text(data, "email");
  if (!email) return { error: "Informe seu e-mail." };

  const supabase = await createServerSupabaseClient();
  const origin = text(data, "origin") || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}${ROUTES.resetPassword}`,
  });
  if (error) return { error: translateAuthError(error.message) };

  // Resposta idêntica exista ou não a conta: confirmar a existência de um
  // e-mail cadastrado é vazamento de informação.
  return { success: "Se houver uma conta com este e-mail, o link de redefinição chegou na caixa de entrada." };
}

export async function updatePassword(
  _prev: FormState = EMPTY,
  data: FormData,
): Promise<FormState> {
  const password = String(data.get("password") ?? "");
  const confirmation = String(data.get("passwordConfirmation") ?? "");

  if (password.length < 6) return { error: "A senha precisa ter pelo menos 6 caracteres." };
  if (password !== confirmation) return { error: "As senhas não conferem." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: translateAuthError(error.message) };

  const session = await getSessionContext();
  revalidatePath("/", "layout");
  redirect(session ? homeForRole(session.role) : ROUTES.signIn);
}

export async function signOut(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(ROUTES.signIn);
}
