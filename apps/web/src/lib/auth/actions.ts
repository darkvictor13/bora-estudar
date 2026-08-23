import { supabase } from "@/lib/supabase/client";
import { getSessionContext, invalidateSession } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

export interface FormState {
  readonly error?: string;
  readonly success?: string;
  /**
   * Para onde ir quando a operação conclui.
   *
   * No Next estas actions terminavam em `redirect()`, que só existe do lado do
   * servidor. Aqui a action é uma função comum do cliente e não tem como
   * navegar sozinha: ela DEVOLVE o destino, e `useFormActionState` navega. A
   * alternativa — chamar `useNavigate` dentro da action — não existe, porque
   * hook não roda fora de componente.
   */
  readonly redirectTo?: string;
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translateAuthError(error.message) };

  invalidateSession();
  const session = await getSessionContext();
  return { redirectTo: session ? homeForRole(session.role) : ROUTES.student.overview };
}

export async function signUp(_prev: FormState = EMPTY, data: FormData): Promise<FormState> {
  const name = text(data, "name");
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");

  if (name.length < 3) return { error: "Informe seu nome completo." };
  if (!email) return { error: "Informe seu e-mail." };
  if (password.length < 6) return { error: "A senha precisa ter pelo menos 6 caracteres." };

  // O papel vai no metadata: tg_create_profile_for_new_user lê `role` de lá.
  // Cadastro público só cria aluno; professor e admin são criados por dentro.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role: "student" } },
  });
  if (error) return { error: translateAuthError(error.message) };

  invalidateSession();
  return { redirectTo: ROUTES.student.waitlist };
}

export async function requestPasswordReset(
  _prev: FormState = EMPTY,
  data: FormData,
): Promise<FormState> {
  const email = text(data, "email");
  if (!email) return { error: "Informe seu e-mail." };

  // A origem sai de `location`, e não mais de um campo escondido alimentado
  // pelo cabeçalho Host: no navegador ela é a origem de verdade — local,
  // preview ou produção — sem depender de proxy nenhum contar a verdade.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${ROUTES.authCallback}?next=${encodeURIComponent(ROUTES.resetPassword)}`,
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

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: translateAuthError(error.message) };

  invalidateSession();
  const session = await getSessionContext();
  return { redirectTo: session ? homeForRole(session.role) : ROUTES.signIn };
}

/** Encerra a sessão. Quem navega depois é `useSignOut`. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  invalidateSession();
}
