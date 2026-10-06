/**
 * O ERRO DO BANCO, TRADUZIDO PARA VOCABULÁRIO DE PRODUTO.
 *
 * `42501` não diz à pessoa que o acesso dela venceu, e "Invalid login
 * credentials" está em inglês e serve para dois casos diferentes. Traduzir é
 * trabalho daqui, e é onde o acoplamento ao banco termina: a tela decide o que
 * mostrar a partir de `ApiErrorCode`, nunca a partir de um código do Postgres.
 */
import type { PostgrestError } from "@supabase/supabase-js";

import { captureUnexpectedFailure } from "@/lib/observability";

import { ApiThrownError, type ApiError, type ApiErrorCode, type Result } from "../contract.ts";
import { apiErrorFromThrown, translateDbError } from "./error-translation.ts";

/**
 * `unknown` é a única confissão que este arquivo faz.
 *
 * Os dois tradutores (`error-translation.ts`) terminam em `unknown` quando não reconhecem o erro,
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

export function failure<T>(error: ApiError, cause?: unknown): Result<T> {
  reportIfUnknown(error, cause);
  return { ok: false, error };
}

/** O throw que escapou de uma escrita, como `Result` — relatado se for `unknown`. */
export function recoverThrown(thrown: unknown): Result<never> {
  return failure(apiErrorFromThrown(thrown), thrown);
}

/**
 * Para a escrita que chama helper que LANÇA (`requireSession`, `throwDb`) e não
 * passa por `once`. Escrita devolve `Result`: quem garante isso é o adaptador, e
 * não um try/catch em componente.
 */
export async function settle<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await operation();
  } catch (thrown) {
    return recoverThrown(thrown);
  }
}

export { translateAuthError, translateDbError } from "./error-translation.ts";

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
