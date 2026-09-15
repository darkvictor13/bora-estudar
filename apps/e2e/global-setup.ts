/**
 * Pré-condições da suíte, verificadas uma vez.
 *
 * Deliberadamente NÃO roda `supabase db reset`. O reset custa uns 25 s e só
 * seria necessário se os testes compartilhassem o aluno do seed — e não
 * compartilham: cada teste cria o próprio par professor/aluno (ver
 * `fixtures/scenario.ts`). O que resta de estado compartilhado é o catálogo de
 * questões, que é leitura.
 *
 * ## O CATÁLOGO DE QUESTÕES NÃO EXISTE MAIS
 *
 * `public.catalogs` e `public.catalog_questions` saíram no schema de
 * 14/09/2026; sobrou `catalog_blocks`, que é a lista de blocos do TEC e não
 * carrega questão nenhuma. Quem consumia o catálogo eram as fixtures de
 * BATERIA, e a bateria saiu com a extensão — as fixtures foram removidas junto.
 *
 * Por isso esta função verifica só o que toda tela precisa: que o banco responda
 * e que `profiles` exista. Preparar catálogo aqui seria preparar dado que
 * ninguém lê.
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
