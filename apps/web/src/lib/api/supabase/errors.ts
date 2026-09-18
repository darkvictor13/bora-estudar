/**
 * O ERRO DO BANCO, TRADUZIDO PARA VOCABULÁRIO DE PRODUTO.
 *
 * `42501` não diz à pessoa que o acesso dela venceu, e "Invalid login
 * credentials" está em inglês e serve para dois casos diferentes. Traduzir é
 * trabalho daqui, e é onde o acoplamento ao banco termina: a tela decide o que
 * mostrar a partir de `ApiErrorCode`, nunca a partir de um código do Postgres.
 */
import type { AuthError, PostgrestError } from "@supabase/supabase-js";

import { captureUnexpectedFailure } from "@/lib/observability";

import { ApiThrownError, type ApiError, type ApiErrorCode, type Result } from "../contract.ts";

/**
 * `unknown` é a única confissão que este arquivo faz.
 *
 * Os dois tradutores abaixo terminam em `unknown` quando não reconhecem o erro,
 * e as cinco chamadas de `fail("unknown", …)` espalhadas pelo adaptador dizem a
 * mesma coisa à mão: a gravação não aconteceu e ninguém sabe por quê. Como o
 * contrato manda a ESCRITA devolver `Result` em vez de lançar, nada disso chega
 * a um `ErrorBoundary` — sem relatar aqui, o caso é visto pela pessoa que
 * tentou gravar e por mais ninguém.
 */
function reportIfUnknown(error: ApiError, cause?: unknown): void {
  if (error.code === "unknown") captureUnexpectedFailure(error.message, cause);
}

export function fail<T>(code: ApiErrorCode, message: string, field?: string): Result<T> {
  const error = { code, message, ...(field ? { field } : {}) } satisfies ApiError;
  reportIfUnknown(error);
  return { ok: false, error };
}

export function done<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function failure<T>(error: ApiError): Result<T> {
  reportIfUnknown(error);
  return { ok: false, error };
}

/**
 * Traduz o erro do GoTrue.
 *
 * SEM REVELAR SE O E-MAIL EXISTE: dizer "não há conta com este e-mail" entrega
 * a base de usuários a quem perguntar devagar. Senha errada e conta inexistente
 * saem com a mesma frase, de propósito.
 */
export function translateAuthError(error: AuthError): ApiError {
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
    return { code: "offline", message: "Sem conexão. Verifique a rede e tente de novo." };
  }
  return { code: "unknown", message: error.message };
}

/**
 * Traduz o erro do PostgREST.
 *
 * `42501` é o que a RLS devolve quando um `WITH CHECK` recusa a linha, e é a
 * forma mais comum de "seu acesso venceu" chegar até aqui — o banco não tem
 * como saber que foi isso, mas a tela precisa dizer algo melhor do que
 * "insufficient privilege".
 *
 * `P0001` é o `raise exception` dos gatilhos de proteção, e a mensagem deles já
 * está em português e já é dirigida a quem está usando: "somente o professor
 * altera o planejamento da meta" é exatamente o que a tela deve mostrar.
 */
export function translateDbError(error: PostgrestError): ApiError {
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
    default:
      return { code: "unknown", message: error.message };
  }
}

/**
 * Leitura que falhou é problema do `ErrorBoundary` da rota, não da tela.
 *
 * O contrato separa os dois caminhos de propósito: erro de ESCRITA é normal —
 * acesso vencido, meta concluída noutra aba — e volta como `Result`; erro de
 * LEITURA significa que a tela não tem o que mostrar, e `throw` obrigaria cada
 * loader a um try/catch que ninguém lembra de escrever.
 */
export function throwDb(error: PostgrestError): never {
  const translated = translateDbError(error);
  // `ApiThrownError` e não `Error`: o código precisa sobreviver ao `throw`.
  // Quem pega isto — o `ErrorBoundary` da rota — decide entre mostrar e
  // RELATAR, e a diferença entre `forbidden` (o acesso venceu, dezenas de vezes
  // por dia) e `unknown` não pode depender de casar a frase em português.
  throw new ApiThrownError(translated.code, translated.message, { cause: error });
}

/**
 * Um erro de leitura escrito à mão, com a mesma forma dos de cima.
 *
 * O código padrão é `not_found` porque é o que as chamadas de hoje significam —
 * planejamento que ainda não existe, aluno sem vínculo com quem pergunta. São
 * ESTADOS do produto, que a tela explica e ninguém precisa corrigir; passe um
 * código diferente quando a ausência for defeito.
 */
export function readFailure(message: string, code: ApiErrorCode = "not_found"): never {
  throw new ApiThrownError(code, message);
}
