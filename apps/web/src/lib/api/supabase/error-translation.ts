/**
 * A TRADUÇÃO DO ERRO, SEM DEPENDÊNCIA DE RUNTIME.
 *
 * Mora fora de `errors.ts` porque aquele importa `@/lib/observability`, que o
 * runner do Node não resolve (alias) nem avalia (`import.meta.env` não existe
 * fora do Vite). Este arquivo só importa `../contract.ts`; o `import type` do
 * `@supabase/supabase-js` é apagado pelo strip.
 */
import type { AuthError } from "@supabase/supabase-js";

import { ApiThrownError, type ApiError } from "../contract.ts";

export const OFFLINE_MESSAGE = "Sem conexão. Verifique a rede e tente de novo.";
export const INVALID_VALUE_MESSAGE =
  "Algum campo tem um valor que não pode ser gravado. Confira e tente de novo.";
export const SERVER_UNAVAILABLE_MESSAGE =
  "O servidor não respondeu como esperado. Tente de novo em instantes.";

/** O `error` do postgrest-js. `code` falta quando o corpo não era JSON. */
export interface DbErrorLike {
  readonly code?: string | null;
  readonly message: string;
}

/**
 * Traduz o erro do GoTrue.
 *
 * SEM REVELAR SE O E-MAIL EXISTE: dizer "não há conta com este e-mail" entrega
 * a base de usuários a quem perguntar devagar. Senha errada e conta inexistente
 * saem com a mesma frase, de propósito.
 */
export function translateAuthError(error: Pick<AuthError, "name" | "message" | "code">): ApiError {
  const m = error.message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return { code: "validation", message: "E-mail ou senha incorretos." };
  }
  if (m.includes("email not confirmed")) {
    return { code: "validation", message: "Confirme seu e-mail antes de entrar." };
  }
  if (m.includes("user already registered") || error.code === "user_already_exists") {
    return { code: "conflict", message: "Já existe uma conta com este e-mail.", field: "email" };
  }
  if (m.includes("password should be at least") || error.code === "weak_password") {
    return {
      code: "validation",
      message: "A senha precisa ter pelo menos 6 caracteres.",
      field: "password",
    };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return {
      code: "conflict",
      message: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
    };
  }
  // `AuthRetryableFetchError` é o que sobra quando não há rede nenhuma.
  if (error.name === "AuthRetryableFetchError") {
    return { code: "offline", message: OFFLINE_MESSAGE };
  }
  return { code: "unknown", message: error.message };
}

/**
 * Traduz o erro do PostgREST.
 *
 * `code === ""` é o `fetch` que falhou (sem rede, DNS, CORS, `AbortError`): o
 * postgrest-js monta o erro sem código, e o TEXTO muda por navegador ("Failed
 * to fetch", "NetworkError when attempting to fetch resource.", "Load failed").
 * A rede se reconhece pelo código, nunca pela frase.
 *
 * Sem `code` nenhum é o corpo que não era JSON — 502/503 de gateway, página de
 * proxy. Continua `unknown` (e relatado), com frase fixa: HTML de gateway não
 * vai para a tela.
 *
 * `42501` é o que a RLS devolve quando um `WITH CHECK` recusa a linha, e é a
 * forma mais comum de "seu acesso venceu" chegar até aqui — o banco não tem
 * como saber que foi isso, mas a tela precisa dizer algo melhor do que
 * "insufficient privilege".
 *
 * `P0001` é o `raise exception` dos gatilhos de proteção, e a mensagem deles já
 * está em português e já é dirigida a quem está usando: "somente o professor
 * altera o planejamento da meta" é exatamente o que a tela deve mostrar.
 *
 * `23514`, `22P02`, `22003` e `23502` são rede de segurança: a regra de verdade
 * mora em `validation.ts`, e quem sabe qual CHECK disparou troca a frase na
 * chamada. O preço é que `validation` não é relatado.
 */
export function translateDbError(error: DbErrorLike): ApiError {
  if (error.code === "") return { code: "offline", message: OFFLINE_MESSAGE };
  if (error.code === undefined || error.code === null) {
    return { code: "unknown", message: SERVER_UNAVAILABLE_MESSAGE };
  }
  switch (error.code) {
    case "42501":
      return {
        code: "forbidden",
        message: "Você não tem permissão para esta operação, ou seu acesso venceu.",
      };
    case "P0001":
      return { code: "conflict", message: error.message };
    case "23505":
      return { code: "conflict", message: "Este registro já existe." };
    case "23503":
      return { code: "conflict", message: "O registro depende de outro que não existe." };
    case "PGRST116":
      return { code: "not_found", message: "Registro não encontrado." };
    case "23514": // check_violation
    case "22P02": // invalid_text_representation ("1.5" num integer)
    case "22003": // numeric_value_out_of_range
    case "23502": // not_null_violation
      return { code: "validation", message: INVALID_VALUE_MESSAGE };
    default:
      return { code: "unknown", message: error.message };
  }
}

/** O que uma escrita LANÇOU, no vocabulário do contrato. */
export function apiErrorFromThrown(thrown: unknown): ApiError {
  if (thrown instanceof ApiThrownError) return { code: thrown.code, message: thrown.message };
  return { code: "unknown", message: thrown instanceof Error ? thrown.message : String(thrown) };
}
