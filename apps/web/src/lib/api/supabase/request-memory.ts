/**
 * A CHAVE DE RETENTATIVA, GUARDADA NO CLIENTE — e o porquê de isso não bastar.
 *
 * O contrato exige `requestId` gerado uma vez, na origem, e o CLAUDE.md explica
 * o custo de não o ter: cada tentativa chega ao banco como operação nova, e o
 * servidor grava duas vezes o que deveria gravar uma. Já custou bateria
 * respondida na versão anterior — uma hora de estudo do aluno, que não pode ser
 * recriada.
 *
 * Quem cumpria essa promessa era `reserve_operation`, que comparava o hash do
 * payload na tabela `operations`. **As duas saíram no schema de 14/09/2026.**
 * Enquanto não voltarem, o que existe é isto: uma memória do processo, que
 * cobre o caso comum — clique duplo, retentativa dentro da mesma aba — e não
 * cobre o caso caro: a aba que recarrega no meio da gravação, ou duas abas.
 *
 * É defesa parcial, e está escrito aqui para ninguém confundir com a de verdade.
 * O pedido à frente do banco é `operations` + `reserve_operation` de volta.
 *
 * Puro de propósito (só `import type`): `errors.ts` puxa `@/lib/observability`,
 * que o runner do Node não avalia. Quem relata é o `recover` injetado.
 */
import type { RequestId, Result } from "../contract.ts";

/** Tamanho da memória. Passar disso descarta as mais antigas, em ordem de inserção. */
const LIMIT = 200;

export function createOnce(recover: (thrown: unknown) => Result<never>) {
  const seen = new Map<RequestId, Promise<Result<unknown>>>();

  return function once<T>(requestId: RequestId, operation: () => Promise<Result<T>>): Promise<Result<T>> {
    const known = seen.get(requestId);
    if (known) return known as Promise<Result<T>>;

    // NUNCA REJEITA. O throw de dentro (`requireSession`, `throwDb`) vira
    // `failure` aqui, e é isso que deixa o `.then` abaixo limpar a chave: uma
    // promessa rejeitada ficava no mapa, a retentativa recebia o mesmo erro sem
    // reexecutar, e o botão da tela ficava preso em "Registrando…".
    const running = (async (): Promise<Result<T>> => {
      try {
        return await operation();
      } catch (thrown) {
        return recover(thrown);
      }
    })();
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
  };
}
