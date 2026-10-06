/**
 * A memória de retentativa do adaptador, ligada ao relato de erro.
 *
 * O porquê dela (e do que ela NÃO cobre) está no cabeçalho de
 * `request-memory.ts`, onde mora a lógica — pura, para o runner do Node
 * conseguir testá-la. Aqui só se injeta `recoverThrown`, que converte o throw
 * de dentro da escrita em `failure` e o relata quando é `unknown`.
 */
import { recoverThrown } from "./errors.ts";
import { createOnce } from "./request-memory.ts";

export const once = createOnce(recoverThrown);
