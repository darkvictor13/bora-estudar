/** Carga pessoal e local, sem reset: texto no Postgres e imagens no Storage privado. */
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, basename } from "node:path";
import pg from "pg";

const root = resolve("content/summaries/local/pf2029");
const library = JSON.parse(await readFile(resolve(root, "library.json"), "utf8"));
const cli = resolve("node_modules/@supabase/cli-windows-x64/bin/supabase.exe");
// As credenciais ficam só neste processo de carga, nunca no cliente ou nos logs.
const raw = execFileSync(cli, ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const config = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
if (!['localhost', '127.0.0.1'].includes(new URL(config.API_URL).hostname)) throw new Error("Carga permitida apenas no Supabase local.");
const headers = { Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, apikey: config.SERVICE_ROLE_KEY, "x-upsert": "true" };
const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".jfif": "image/jpeg", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const uploads = (await readdir(resolve(root, "media"))).filter(f => !f.endsWith('.emf'));
async function upload(key, bytes, type) {
  const response = await fetch(`${config.API_URL}/storage/v1/object/flash-summaries/pf2029/${key}`, {
    method: "POST", headers: { ...headers, "Content-Type": type }, body: bytes,
  });
  if (!response.ok) throw new Error(`Falha em ${key}: ${response.status} ${await response.text()}`);
}
for (let i = 0; i < uploads.length; i += 6) {
  await Promise.all(uploads.slice(i, i + 6).map(async key => {
    const extension = key.slice(key.lastIndexOf('.'));
    if (!types[extension]) throw new Error(`Formato não suportado: ${extension}`);
    await upload(key, await readFile(resolve(root, "media", key)), types[extension]);
  }));
}
const original = process.argv[2];
if (original) await upload('source.docx', await readFile(original), types['.docx']);
const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
try {
  await db.query("begin");
  for (const topic of library.topics) {
    await db.query(`insert into public.summary_topics(id,subject,title,position,source_name,source_hash,blocks)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb)
      on conflict (id) do update set subject=excluded.subject,title=excluded.title,position=excluded.position,
        source_name=excluded.source_name,source_hash=excluded.source_hash,blocks=excluded.blocks,updated_at=now()
      where (summary_topics.subject,summary_topics.title,summary_topics.position,summary_topics.source_hash,summary_topics.blocks)
        is distinct from (excluded.subject,excluded.title,excluded.position,excluded.source_hash,excluded.blocks)`,
    [topic.id, topic.subject, topic.title, topic.position, library.source, library.sha256, JSON.stringify(topic.blocks)]);
  }
  await db.query("commit");
  console.log(`Importados ${library.topics.length} tópicos e ${uploads.length} imagens${original ? `; original ${basename(original)} preservado no Storage` : ''}.`);
} catch (error) {
  await db.query("rollback");
  throw error;
} finally { await db.end(); }
