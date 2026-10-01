// Alternativa local quando Docker não está disponível. Não acessa banco remoto.
// Uso: node scripts/check-mock-exams.mjs <caminho-do-pglite/dist/index.js> [--suite=08_mock_exams.sql]
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
create role anon;
create role authenticated;
create role service_role bypassrls;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create schema auth;
create table auth.users (
 id uuid primary key, instance_id uuid, aud text, role text, email text,
 raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
 created_at timestamptz default now(), updated_at timestamptz default now(),
 encrypted_password text, email_confirmed_at timestamptz
);
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
 select (auth.jwt()->>'sub')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant all on auth.users to service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`);
for (const name of (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
  console.log(`Migration OK: ${name}`);
}
const requestedSuite = process.argv.find((arg) => arg.startsWith('--suite='))?.slice('--suite='.length);
const suites = (await readdir('supabase/tests')).filter((name) => /^\d.*\.sql$/.test(name)).sort();
if (requestedSuite && !suites.includes(requestedSuite)) throw new Error(`Suíte SQL não encontrada: ${requestedSuite}`);
for (const name of suites.filter((name) => !requestedSuite || name === '00_fixtures.sql' || name === requestedSuite)) {
  await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
  const sql = (await readFile(`supabase/tests/${name}`, 'utf8')).replace(/^\\.*$/gm, '');
  try { await db.exec(sql); }
  catch (error) { console.error(`${name}: ${error.message}`); process.exitCode = 1; break; }
  console.log(`Suíte OK: ${name}`);
}
await db.close();
