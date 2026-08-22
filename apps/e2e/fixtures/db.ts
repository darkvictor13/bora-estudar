/**
 * Acesso direto ao Postgres local, só para montar e inspecionar fixture.
 *
 * O teste passa pela interface como um aluno passaria; o banco entra em cena
 * apenas antes (para criar o cenário) e depois (para conferir o que a tela
 * prometeu ter gravado). É a única camada do e2e que ignora a RLS: conecta
 * como `postgres`, porque criar um par professor/aluno exige escrever em
 * `auth.users` e em `student_teacher_links`, que não têm grant para ninguém.
 *
 * Nunca use estas funções para *fazer* o que a aplicação deveria fazer. Um
 * teste que grava a resposta da bateria por aqui não prova nada sobre o
 * produto.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/** O stack local do Supabase sempre expõe a mesma porta e a mesma senha. */
export const DATABASE_URL =
  process.env["E2E_DATABASE_URL"] ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Poucas conexões por worker: são vários workers em paralelo, e o Postgres do
 * Supabase local sobe com `max_connections` modesto.
 */
const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });

export async function query<R extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<R[]> {
  const result = await pool.query<R>(text, params as unknown[]);
  return result.rows;
}

/** Primeira linha, ou `null`. */
export async function maybeOne<R extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<R | null> {
  const rows = await query<R>(text, params);
  return rows[0] ?? null;
}

/** Primeira linha, exigindo que exista. */
export async function one<R extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<R> {
  const row = await maybeOne<R>(text, params);
  if (!row) throw new Error(`consulta não devolveu linha: ${text}`);
  return row;
}

/** Valor único da primeira coluna da primeira linha. */
export async function value<T>(text: string, params: readonly unknown[] = []): Promise<T> {
  const row = await one<QueryResultRow>(text, params);
  return Object.values(row)[0] as T;
}

/** Contagem, já convertida — o driver devolve `bigint` como string. */
export async function count(text: string, params: readonly unknown[] = []): Promise<number> {
  return Number(await value<string | number>(text, params));
}

/**
 * Roda dentro de uma transação, na MESMA conexão.
 *
 * Necessário para impersonar: `set_config('request.jwt.claim.sub', …, true)`
 * vale só até o fim da transação, e é assim que `auth.uid()` passa a devolver
 * o usuário escolhido — o mesmo truque que o `supabase/seed.sql` usa para
 * criar as metas chamando a RPC real.
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa com `auth.uid()` respondendo pelo usuário escolhido.
 *
 * Só a claim é trocada, não o `role` do Postgres: a conexão continua sendo
 * `postgres`, que é o que permite chamar as RPCs `security definer` sem
 * depender dos grants de `authenticated`. Quem valida os grants é a suíte de
 * `supabase/tests/`; aqui a impersonação existe apenas para montar cenário.
 */
export async function asUser<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(async (client) => {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return fn(client);
  });
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
