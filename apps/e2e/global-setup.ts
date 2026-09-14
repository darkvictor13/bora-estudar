/**
 * Pré-condições da suíte, verificadas uma vez.
 *
 * Deliberadamente NÃO roda `supabase db reset`. O reset custa uns 25 s e só
 * seria necessário se os testes compartilhassem o aluno do seed — e não
 * compartilham: cada teste cria o próprio par professor/aluno (ver
 * `fixtures/scenario.ts`). O que resta de estado compartilhado é o catálogo de
 * questões, que é leitura.
 *
 * ## O CATÁLOGO ESTÁ SUSPENSO
 *
 * `public.catalogs` e `public.catalog_questions` não existem no schema de
 * 14/09/2026; sobrou `catalog_blocks`, com outra forma — `catalog_key` e
 * `block_number` no lugar de `catalog_id` e `number`, `question_slots` no lugar
 * de `question_count`. O catálogo alimenta as fixtures de BATERIA, que são
 * trabalho da Fase 3, e o formato novo só pode ser montado junto com elas.
 *
 * Até lá esta função verifica o que a Fase 2 precisa — que o banco responda e
 * que `profiles` exista — e não inventa catálogo. Preparar dado no formato
 * errado deixaria a Fase 3 depurando uma fixture em vez de uma tela.
 */
import { closeDb, count } from "./fixtures/db.ts";

async function ensureDatabase(): Promise<void> {
  // Uma consulta que só passa se o schema estiver aplicado. `profiles` é a
  // tabela de que toda sessão depende: sem ela nenhum teste tem como começar.
  await count("select count(*) from public.profiles");
}

export default async function globalSetup(): Promise<void> {
  try {
    await ensureDatabase();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Não foi possível preparar o ambiente da suíte.\n` +
        `Suba o stack com \`npm run db:start\` (exige Docker) e aplique o schema com\n` +
        `\`npm run db:reset\` antes de rodar.\n` +
        `Erro: ${detail}`,
    );
  } finally {
    // O pool do global setup vive noutro processo que o dos workers: fechá-lo
    // aqui evita que o Playwright espere por uma conexão aberta no fim.
    await closeDb();
  }
}
