// Alternativa local quando Docker não está disponível. Não acessa banco remoto.
// Uso: node scripts/check-mock-exams.mjs <caminho-do-pglite/dist/index.js> [--types] [--suite=08_mock_exams.sql]
import { readFile, readdir, writeFile } from "node:fs/promises";
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
if (process.argv.includes('--types')) {
  // Gera apenas os dois acréscimos desta migration usando o catálogo local.
  // A geração completa do CLI continua sendo o caminho normal com Docker.
  let blocks = '';
  for (const table of ['mock_exam_results', 'mock_exams']) {
    const { rows: columns } = await db.query(`select column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema='public' and table_name=$1 order by column_name`, [table]);
    blocks += `      ${table}: {\n`;
    for (const mode of ['Row', 'Insert', 'Update']) {
      blocks += `        ${mode}: {\n`;
      for (const col of columns) {
        const nullable = col.is_nullable === 'YES';
        const type = ['numeric','integer'].includes(col.data_type) ? 'number' : col.data_type === 'boolean' ? 'boolean' : 'string';
        const optional = mode === 'Update' || (mode === 'Insert' && (nullable || col.column_default !== null));
        blocks += `          ${col.column_name}${optional ? '?' : ''}: ${type}${nullable ? ' | null' : ''}\n`;
      }
      blocks += '        }\n';
    }
    const { rows: fks } = await db.query(`select c.conname, c.confrelid::regclass::text as target,
      array(select a.attname from unnest(c.conkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by pos) as cols,
      array(select a.attname from unnest(c.confkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by pos) as refs
      from pg_constraint c where c.conrelid=$1::regclass and c.contype='f' order by c.conname`, [`public.${table}`]);
    blocks += '        Relationships: [\n';
    for (const fk of fks) blocks += `          {\n            foreignKeyName: ${JSON.stringify(fk.conname)}\n            columns: ${JSON.stringify(fk.cols)}\n            isOneToOne: false\n            referencedRelation: ${JSON.stringify(fk.target.replace('public.',''))}\n            referencedColumns: ${JSON.stringify(fk.refs)}\n          },\n`;
    blocks += '        ]\n      }\n';
  }
  const path = 'packages/database/src/schema.gen.ts';
  const source = (await readFile(path, 'utf8')).replace(/      mock_(?:exam_results|exams): \{[\s\S]*?^      \}\r?\n/gm, '');
  {
    await writeFile(path, source.replace(/    Tables: \{\r?\n/, `    Tables: {\n${blocks}`));
    console.log('Tipos das tabelas novas gerados do catálogo local.');
  }
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
