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

/**
 * O e-mail da busca do professor.
 *
 * Exige o `@` porque a busca casa o endereço INTEIRO: quem digita metade não
 * recebe "nenhum aluno com este e-mail", recebe a explicação de que a busca é
 * pelo endereço completo. Sem isto, a recusa do servidor e o engano de quem
 * digitou chegam com a mesma frase.
 */
export function checkStudentEmail(email: string): ApiError | null {
  const value = email.trim();
  if (!value) return invalid("Informe o e-mail do aluno.", "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return invalid("Digite o e-mail inteiro do aluno, como ele o cadastrou.", "email");
  }
  return null;
}

/**
 * As vigências que o professor escolhe, e a `check` que o banco impõe.
 *
 * Três é o padrão — o valor que a v96 passava como literal em
 * `liberarAlunoAcesso`. Os quatro estão aqui, e não só na tela, porque
 * `access_grants_months_check` recusa qualquer outro: uma lista que exista só
 * no `<select>` diverge do banco na primeira tela nova.
 */
export const ACCESS_MONTHS: readonly number[] = [1, 3, 6, 12];
export const DEFAULT_ACCESS_MONTHS = 3;

export function checkAccessMonths(months: number): ApiError | null {
  if (!ACCESS_MONTHS.includes(months)) {
    return invalid("A vigência é de 1, 3, 6 ou 12 meses.", "months");
  }
  return null;
}

/** O nome da turma. Mesmo mínimo de um nome de pessoa: duas letras não nomeiam. */
export function checkClassName(name: string): ApiError | null {
  if (name.trim().length < MIN_NAME_LENGTH) return invalid("Dê um nome à turma.", "name");
  return null;
}
