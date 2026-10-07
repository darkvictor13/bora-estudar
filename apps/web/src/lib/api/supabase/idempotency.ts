/**
 * A memória de retentativa do adaptador, ligada ao relato de erro.
 *
 * O porquê dela (e do que ela NÃO cobre) está no cabeçalho de
 * `request-memory.ts`, onde mora a lógica — pura, para o runner do Node
 * conseguir testá-la. Aqui só se injeta `recoverThrown`, que converte o throw
 * de dentro da escrita em `failure` e o relata quando é `unknown`.
 *
 * `once()` é a defesa contra o CLIQUE DUPLO, dentro da aba. Onde a retentativa
 * importa de verdade — a resposta que se perde e a aba que recarrega —, quem
 * garante é o banco: `access_grants_request_uidx` (`set_student_access`),
 * `goal_batches.id` (`generate_week`), `goal_entries_request_uidx`
 * (`record_goal_entry`, `record_extra_study`, `record_initial_questions`) e
 * `theory_review_entries_request_uidx` (`record_review_questions`). Escrita nova com payload e sem
 * uma dessas chaves só tem esta memória, e ela não sobrevive a um recarregar.
 */
import { recoverThrown } from "./errors.ts";
import { createOnce } from "./request-memory.ts";

export const once = createOnce(recoverThrown);
