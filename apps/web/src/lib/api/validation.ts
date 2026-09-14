/**
 * AS REGRAS QUE AS DUAS IMPLEMENTAÇÕES CUMPREM IGUAL.
 *
 * Validação de formulário é parte do contrato, não detalhe de quem o cumpre:
 * se a fixture recusa nome curto com uma frase e o Supabase com outra, a tela
 * construída contra a fixture mostra um texto em desenvolvimento e outro em
 * produção — e o teste que fixou a primeira frase passa a mentir.
 *
 * Por isso as mensagens moram aqui, uma vez. `fixtures.ts` e `supabase.ts`
 * chamam as mesmas funções antes de qualquer ida ao servidor, o que também
 * significa que nome curto não gasta uma viagem de rede para ser recusado.
 */
import type { ApiError, Credentials, SignUpInput } from "./contract.ts";

/** O mínimo que o GoTrue aceita, e o mesmo número que a v2 pedia. */
export const MIN_PASSWORD_LENGTH = 6;

/** O mínimo para um nome ser um nome, e não uma inicial. */
export const MIN_NAME_LENGTH = 3;

function invalid(message: string, field?: string): ApiError {
  return { code: "validation", message, ...(field ? { field } : {}) };
}

export function checkCredentials({ email, password }: Credentials): ApiError | null {
  if (!email.trim() || !password) return invalid("Informe e-mail e senha.");
  return null;
}

export function checkPassword(password: string): ApiError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return invalid(
      `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      "password",
    );
  }
  return null;
}

export function checkSignUp({ name, email, password }: SignUpInput): ApiError | null {
  if (name.trim().length < MIN_NAME_LENGTH) return invalid("Informe seu nome completo.", "name");
  if (!email.trim()) return invalid("Informe seu e-mail.", "email");
  return checkPassword(password);
}

export function checkName(name: string): ApiError | null {
  if (name.trim().length < MIN_NAME_LENGTH) return invalid("Informe seu nome completo.", "name");
  return null;
}
