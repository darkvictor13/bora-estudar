/**
 * A memória de retentativa do adaptador, ligada ao relato de erro.
 *
 * O porquê dela (e do que ela NÃO cobre) está no cabeçalho de
 * `request-memory.ts`, onde mora a lógica — pura, para o runner do Node
 * conseguir testá-la. Aqui só se injeta `recoverThrown`, que converte o throw
 * de dentro da escrita em `failure` e o relata quando é `unknown`.
 *
 * ## Onde mora a idempotência
 *
 * No BANCO, num índice UNIQUE por tabela de execução. `once()` só poupa a
 * segunda viagem do clique duplo, dentro da aba: ela não sobrevive a um
 * recarregar, e a resposta que se perde e a aba que recarrega são o caso caro.
 *
 * **Com payload** (`request_id` numa coluna única, e a comparação das próprias
 * colunas do registro — mesma chave e mesmo payload devolve o resultado
 * anterior, outro payload é `23505`):
 *
 * - `access_grants_request_uidx`: `set_student_access`;
 * - a PK de `goal_batches` (`goal_batches.id`): `generate_week`;
 * - `goal_entries_request_uidx`: `record_goal_entry`, `record_extra_study` e
 *   `record_initial_questions`;
 * - `theory_review_entries_request_uidx`: `record_review_questions`.
 *
 * **Naturalmente idempotentes** (sem `request_id`, porque o parâmetro já é a
 * identidade do alvo, e o que garante é uma coluna ou um índice):
 *
 * - `link_student`: `profiles.teacher_id` cabe um valor só, e a escrita é um
 *   `update ... where teacher_id is null`;
 * - `activate_study_plan`: `study_plans_one_active_per_student_uidx`;
 * - `clear_pending_goals`: só apaga, e o critério é o mesmo a cada chamada.
 *
 * **Escritas diretas que ficam só com `once()`**: as que levam uma coluna a um
 * VALOR e não acumulam — a página da teoria (`theory_progress.current_page`) e
 * o status da meta. Repetir o pedido deixa a linha onde a primeira vez deixou.
 * O que ACUMULA (questões, minutos, registro) não tem escrita direta desde o
 * PR 5c: `goal_entries` e `theory_reviews` não têm INSERT nem UPDATE para
 * `authenticated`, e o contador de `theory_progress` está fora do grant.
 *
 * Escrita nova com payload e sem uma dessas chaves só tem a memória do
 * processo, e ela não sobrevive a um recarregar.
 */
import { recoverThrown } from "./errors.ts";
import { createOnce } from "./request-memory.ts";

export const once = createOnce(recoverThrown);
