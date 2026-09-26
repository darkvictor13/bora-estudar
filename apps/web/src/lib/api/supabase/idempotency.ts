/**
 * A CHAVE DE RETENTATIVA, GUARDADA NO CLIENTE — e o porquê de isso não bastar.
 *
 * O contrato exige `requestId` gerado uma vez, na origem, e o CLAUDE.md explica
 * o custo de não o ter: cada tentativa chega ao banco como operação nova, e o
 * servidor grava duas vezes o que deveria gravar uma. Já custou bateria
 * respondida na versão anterior — uma hora de estudo do aluno, que não pode ser
 * recriada.
 *
 * A defesa de verdade é do banco, e existe por RPC: `set_student_access`
 * guarda o `request_id` em `access_grants`, e `replace_week_goals` em
 * `week_batches`, cada uma comparando o payload pelas próprias colunas. O
 * padrão anterior — uma tabela `operations` genérica com `reserve_operation` —
 * saiu no schema de 14/09/2026 e não volta.
 *
 * O que existe AQUI é uma memória do processo, que cobre o caso comum — clique
 * duplo, retentativa dentro da mesma aba — nas escritas diretas que não passam
 * por RPC. Não cobre o caso caro: a aba que recarrega no meio da gravação, ou
 * duas abas. É defesa parcial, e está escrito aqui para ninguém confundir com a
 * de verdade: escrita que não pode duplicar precisa de RPC com `request_id`.
 */
import type { RequestId, Result } from "../contract.ts";

const seen = new Map<RequestId, Promise<Result<unknown>>>();

/** Tamanho da memória. Passar disso descarta as mais antigas, em ordem de inserção. */
const LIMIT = 200;

export function once<T>(requestId: RequestId, operation: () => Promise<Result<T>>): Promise<Result<T>> {
  const known = seen.get(requestId);
  if (known) return known as Promise<Result<T>>;

  const running = operation();
  seen.set(requestId, running as Promise<Result<unknown>>);

  // Uma tentativa que FALHOU pode ser repetida: guardar o erro transformaria
  // "sem rede" numa recusa permanente até a pessoa recarregar a página.
  void running.then((result) => {
    if (!result.ok) seen.delete(requestId);
  });

  if (seen.size > LIMIT) {
    const oldest = seen.keys().next();
    if (!oldest.done) seen.delete(oldest.value);
  }

  return running;
}
