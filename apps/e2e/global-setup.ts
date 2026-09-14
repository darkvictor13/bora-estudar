/**
 * Pré-condições da suíte, verificadas uma vez.
 *
 * Deliberadamente NÃO roda `supabase db reset`. O reset custa uns 25 s e só
 * seria necessário se os testes compartilhassem o aluno do seed — e não
 * compartilham: cada teste cria o próprio par professor/aluno (ver
 * `fixtures/scenario.ts`). O que resta de estado compartilhado é o catálogo de
 * questões, que é leitura, e é o que esta função garante existir.
 *
 * Isso também torna a suíte imune à ordem de execução em relação ao
 * `npm run db:test`, que trunca `auth.users` e `public.catalogs`.
 */
import { closeDb, count, query } from "./fixtures/db.ts";
import { CATALOG } from "./fixtures/scenario.ts";

async function ensureCatalog(): Promise<void> {
  await query("insert into public.catalogs (key, name) values ($1, $2) on conflict (key) do nothing", [
    CATALOG.key,
    "PCPR 2026 — Investigador",
  ]);

  for (const [index, block] of CATALOG.blocks.entries()) {
    await query(
      `insert into public.catalog_blocks
         (id, catalog_key, block_key, number, name, subject_key, subject_name, question_count)
       values ($1, $2, $3, 1, $4, $5, $6, 30)
       on conflict (catalog_key, block_key) do nothing`,
      [block.id, CATALOG.key, block.blockKey, block.name, block.subjectKey, block.subjectName],
    );

    // 30 questões por bloco, com tópico rotativo — o mesmo shape do seed. É o
    // mínimo para uma bateria de 15 principais deixar 15 inéditas para a
    // seguinte, que é o que o F-BAT-17 exige.
    await query(
      `insert into public.catalog_questions (block_id, question_id, topic, position)
       select $1, $2::bigint + g - 1, ($3::text[])[1 + (g % 3)], g
         from generate_series(1, 30) g
       on conflict (block_id, question_id) do nothing`,
      [block.id, block.firstQuestionId, [...block.topics]],
    );

    const questions = await count(
      "select count(*) from public.catalog_questions where block_id = $1",
      [block.id],
    );
    if (questions < 30) {
      throw new Error(`bloco ${index + 1} do catálogo tem ${questions} questões; esperado 30`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  try {
    await ensureCatalog();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Não foi possível preparar o ambiente da suíte.\n` +
        `Suba o stack com \`npm run db:start\` (exige Docker) antes de rodar.\n` +
        `Erro: ${detail}`,
    );
  } finally {
    // O pool do global setup vive noutro processo que o dos workers: fechá-lo
    // aqui evita que o Playwright espere por uma conexão aberta no fim.
    await closeDb();
  }
}
