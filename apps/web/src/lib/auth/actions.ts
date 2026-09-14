import { api } from "@/lib/api";
import { getSessionContext, invalidateSession } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";
import { adoptTheme, DEFAULT_THEME } from "@/lib/theme";

export interface FormState {
  readonly error?: string;
  readonly success?: string;
  /** Campo que causou o erro, quando há um. Marca o `Field` em vermelho. */
  readonly field?: string;
  /**
   * Para onde ir quando a operação conclui.
   *
   * A action é uma função comum do cliente e não tem como navegar sozinha: ela
   * DEVOLVE o destino, e `useFormActionState` navega. A alternativa — chamar
   * `useNavigate` dentro da action — não existe, porque hook não roda fora de
   * componente.
   */
  readonly redirectTo?: string;
}

const EMPTY: FormState = {};

function text(data: FormData, field: string): string {
  return String(data.get(field) ?? "").trim();
}

/**
 * O caminho comum das quatro actions que terminam com alguém autenticado.
 *
 * As três coisas acontecem NESTA ORDEM, e a ordem não é livre:
 *
 * 1. `invalidateSession()` — a consulta em voo ainda devolveria `null`, e quem
 *    acabou de entrar seria mandado de volta para a tela de login;
 * 2. pedir o contexto de novo, já com a identidade nova;
 * 3. pintar o tema da conta ANTES de navegar. Depois seria a piscada.
 */
async function landAfterAuth(fallback: string): Promise<FormState> {
  invalidateSession();
  const session = await getSessionContext();
  if (!session) return { redirectTo: fallback };

  const theme = await api.loadThemePreference();
  adoptTheme(session.profileId, theme ?? DEFAULT_THEME);

  return { redirectTo: homeForRole(session.role) };
}

export async function signIn(_prev: FormState = EMPTY, data: FormData): Promise<FormState> {
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const result = await api.signIn({ email, password });
  if (!result.ok) {
    return { error: result.error.message, ...(result.error.field ? { field: result.error.field } : {}) };
  }

  return landAfterAuth(ROUTES.student.overview);
}

export async function signUp(_prev: FormState = EMPTY, data: FormData): Promise<FormState> {
  const name = text(data, "name");
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");

  const result = await api.signUp({ name, email, password });
  if (!result.ok) {
    return { error: result.error.message, ...(result.error.field ? { field: result.error.field } : {}) };
  }

  // Cadastro público nasce sem acesso liberado: a lista de espera é a casa de
  // quem acabou de se cadastrar, e não a visão geral, que estaria vazia.
  invalidateSession();
  await getSessionContext();
  return { redirectTo: ROUTES.student.waitlist };
}

export async function requestPasswordReset(
  _prev: FormState = EMPTY,
  data: FormData,
): Promise<FormState> {
  const email = text(data, "email");
  if (!email) return { error: "Informe seu e-mail." };

  const result = await api.requestPasswordReset(email);
  if (!result.ok) return { error: result.error.message };

  // Resposta idêntica exista ou não a conta: confirmar a existência de um
  // e-mail cadastrado é vazamento de informação.
  return {
    success:
      "Se houver uma conta com este e-mail, o link de redefinição chegou na caixa de entrada.",
  };
}

export async function updatePassword(
  _prev: FormState = EMPTY,
  data: FormData,
): Promise<FormState> {
  const password = String(data.get("password") ?? "");
  const confirmation = String(data.get("passwordConfirmation") ?? "");

  if (password !== confirmation) {
    return { error: "As senhas não conferem.", field: "passwordConfirmation" };
  }

  const result = await api.resetPassword(password);
  if (!result.ok) {
    return { error: result.error.message, ...(result.error.field ? { field: result.error.field } : {}) };
  }

  return landAfterAuth(ROUTES.signIn);
}

/** Encerra a sessão. Quem navega depois é `useSignOut`. */
export async function signOut(): Promise<void> {
  await api.signOut();
  invalidateSession();
}
