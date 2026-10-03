/**
 * Carrega o Vade Mecum no banco (spec 40): normas, textos e mapas de edital.
 *
 * As fontes continuam sendo os geradores: `build-law-library.mjs` escreve o
 * índice e os textos, `build-law-exam-maps.mjs` os mapas, e a lista mestra
 * vem do pacote recebido. Este script só leva o que eles produziram para as
 * tabelas.
 *
 *   node scripts/load-law-library.mjs            # Supabase local
 *   node scripts/load-law-library.mjs --linked   # o projeto do `supabase link`
 *
 * A conexão é a mesma de `load-library-flashcards.mjs` — inclusive a regra de
 * que sem `--linked` o destino é sempre o banco local.
 *
 * O que a carga garante: uma transação só; rodar duas vezes não muda linha
 * nenhuma; artigo que some do arquivo é retirado, nunca apagado, e volta com
 * o mesmo id (R-LEI-03, R-LEI-08). Seções e itens de edital são conteúdo sem
 * histórico: o que sai do arquivo sai do banco.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import pg from "pg";

import { connectionString } from "./load-library-flashcards.mjs";

const root = new URL("../", import.meta.url);
const data = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const SPHERES = { constitucional: "constitutional", federal: "federal", parana: "state" };
const VERIFICATION = { pendente_fonte_oficial_individual: "pending_official_source" };

const slug = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function readLawLibrary({
  index = data("content/laws/library/index.json"),
  maps = data("content/laws/library/exam-maps.json"),
  master = data("content/laws/vade-mecum-base-v1/04_LISTA_MESTRA_INICIAL.json"),
  text = (id) => data(`content/laws/library/text/${id}.json`),
} = {}) {
  const subjects = [];
  for (const law of index) {
    if (!subjects.some((subject) => subject.name === law.subject)) {
      subjects.push({ id: slug(law.subject), name: law.subject, position: subjects.length });
    }
  }

  const norms = new Map(master.normas.map((norm) => [norm.canonical_id, {
    canonical_id: norm.canonical_id,
    title: norm.titulo,
    sphere: SPHERES[norm.esfera] ?? null,
    verification_status: VERIFICATION[norm.status_verificacao] ?? null,
  }]));
  // As normas que só os mapas citam entram com o título do mapa e nada mais
  // (R-LEI-01): a lista mestra não diz esfera nem situação delas.
  for (const map of maps.maps) {
    for (const section of map.sections) {
      for (const item of section.items) {
        if (!norms.has(item.canonicalId)) norms.set(item.canonicalId, { canonical_id: item.canonicalId, title: item.title, sphere: null, verification_status: null });
      }
    }
  }

  const laws = index.map((law, position) => ({
    id: law.id,
    norm_id: law.canonicalId,
    title: law.title,
    norm_label: law.norm,
    subject_id: slug(law.subject),
    official_url: law.officialUrl,
    source_date: law.sourceDate,
    position,
  }));

  const articles = index.flatMap((law) => {
    const document = text(law.id);
    if (document.id !== law.id) throw new Error(`O texto de ${law.id} declara outro id (${document.id}).`);
    return document.articles.map((article, position) => ({
      id: article.id, law_id: law.id, position, label: article.label, section: article.section, paragraphs: article.paragraphs,
    }));
  });

  const notices = maps.maps.map((map, position) => ({
    id: map.id, canonical_id: map.canonicalId, short_name: map.shortName, title: map.title,
    accent: map.accent, base_date: maps.baseDate, position,
  }));
  const sections = maps.maps.flatMap((map) => map.sections.map((section, position) => ({ notice_id: map.id, position, title: section.title })));
  const items = maps.maps.flatMap((map) => map.sections.flatMap((section, sectionPosition) => section.items.map((item, position) => ({
    notice_id: map.id, section_position: sectionPosition, position, norm_id: item.canonicalId, scope: item.scope,
    // Só para a validação: o banco calcula, e não guarda (R-LEI-05).
    libraryId: item.libraryId,
  }))));

  return { subjects, norms: [...norms.values()], laws, articles, notices, sections, items };
}

export function validateLawLibrary(library) {
  const errors = [];
  const norms = new Set(library.norms.map((norm) => norm.canonical_id));
  const lawByNorm = new Map(library.laws.map((law) => [law.norm_id, law.id]));
  const articleIds = new Set();
  for (const law of library.laws) {
    if (!law.norm_id) errors.push(`A lei ${law.id} não tem canonicalId no índice.`);
    else if (!norms.has(law.norm_id)) errors.push(`A lei ${law.id} aponta para uma norma desconhecida (${law.norm_id}).`);
  }
  for (const article of library.articles) {
    if (articleIds.has(article.id)) errors.push(`Artigo ${article.id} duplicado.`);
    articleIds.add(article.id);
  }
  // O arquivo do mapa diz qual lei tem cada norma; a biblioteca, também. Se
  // os dois discordarem, um deles está errado — e o banco só guarda um.
  for (const item of library.items) {
    const law = lawByNorm.get(item.norm_id) ?? null;
    if (item.libraryId !== law) errors.push(`O item ${item.notice_id}/${item.section_position}/${item.position} diz que ${item.norm_id} é a lei ${item.libraryId}, e a biblioteca diz ${law}.`);
  }
  if (errors.length > 0) throw new Error(`O Vade Mecum foi recusado:\n- ${errors.join("\n- ")}`);
}

async function upsert(client, table, rows, key, columns, types) {
  const set = columns.filter((column) => !key.includes(column));
  const record = columns.map((column) => `${column} ${types[column]}`).join(", ");
  const sql = `
    insert into public.${table} as t (${columns.join(", ")})
    select ${columns.join(", ")} from jsonb_to_recordset($1::jsonb) as x(${record})
    on conflict (${key.join(", ")}) do update set ${set.map((column) => `${column} = excluded.${column}`).join(", ")}
    where (${set.map((column) => `t.${column}`).join(", ")}) is distinct from (${set.map((column) => `excluded.${column}`).join(", ")})`;
  return (await client.query(sql, [JSON.stringify(rows)])).rowCount;
}

/** Escreve o Vade Mecum. Não abre transação: quem chama decide. */
export async function loadLawLibrary(client, library) {
  validateLawLibrary(library);
  const changed = {};
  changed.subjects = await upsert(client, "law_subjects", library.subjects, ["id"], ["id", "name", "position"], { id: "text", name: "text", position: "smallint" });
  changed.norms = await upsert(client, "legal_norms", library.norms, ["canonical_id"], ["canonical_id", "title", "sphere", "verification_status"],
    { canonical_id: "text", title: "text", sphere: "public.legal_norm_sphere", verification_status: "public.legal_norm_verification" });
  changed.laws = await upsert(client, "laws", library.laws, ["id"], ["id", "norm_id", "title", "norm_label", "subject_id", "official_url", "source_date", "position"],
    { id: "text", norm_id: "text", title: "text", norm_label: "text", subject_id: "text", official_url: "text", source_date: "date", position: "smallint" });

  // `retired_at = null` entra no upsert: o artigo que volta ao arquivo é
  // reativado com o mesmo id.
  changed.articles = (await client.query(`
    insert into public.law_articles as t (id, law_id, position, label, section, paragraphs)
    select id, law_id, position, label, section, paragraphs
      from jsonb_to_recordset($1::jsonb) as x(id text, law_id text, position integer, label text, section text, paragraphs text[])
    on conflict (id) do update set law_id = excluded.law_id, position = excluded.position, label = excluded.label,
      section = excluded.section, paragraphs = excluded.paragraphs, retired_at = null
    where (t.law_id, t.position, t.label, t.section, t.paragraphs, t.retired_at is null)
      is distinct from (excluded.law_id, excluded.position, excluded.label, excluded.section, excluded.paragraphs, true)
  `, [JSON.stringify(library.articles)])).rowCount;
  changed.retired = (await client.query(`
    update public.law_articles set retired_at = now()
     where retired_at is null and not (id = any($1::text[]))
  `, [library.articles.map((article) => article.id)])).rowCount;

  changed.notices = await upsert(client, "exam_notices", library.notices, ["id"], ["id", "canonical_id", "short_name", "title", "accent", "base_date", "position"],
    { id: "text", canonical_id: "text", short_name: "text", title: "text", accent: "text", base_date: "date", position: "smallint" });
  changed.sections = await upsert(client, "exam_notice_sections", library.sections, ["notice_id", "position"], ["notice_id", "position", "title"],
    { notice_id: "text", position: "smallint", title: "text" });
  const items = library.items.map(({ libraryId: _libraryId, ...item }) => item);
  changed.items = await upsert(client, "exam_notice_items", items, ["notice_id", "section_position", "position"], ["notice_id", "section_position", "position", "norm_id", "scope"],
    { notice_id: "text", section_position: "smallint", position: "smallint", norm_id: "text", scope: "text" });
  changed.removed = (await client.query(`
    delete from public.exam_notice_items i
     where not exists (select 1 from jsonb_to_recordset($1::jsonb) as x(notice_id text, section_position smallint, position smallint)
                        where x.notice_id = i.notice_id and x.section_position = i.section_position and x.position = i.position)
  `, [JSON.stringify(items)])).rowCount + (await client.query(`
    delete from public.exam_notice_sections s
     where not exists (select 1 from jsonb_to_recordset($1::jsonb) as x(notice_id text, position smallint)
                        where x.notice_id = s.notice_id and x.position = s.position)
  `, [JSON.stringify(library.sections)])).rowCount;

  return changed;
}

export async function runLawLoad(client, library) {
  await client.query("begin");
  try {
    const changed = await loadLawLibrary(client, library);
    await client.query("commit");
    return changed;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  const url = connectionString();
  const { username, host } = new URL(url);
  console.log(`→ carregando o Vade Mecum em ${username}@${host}`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const changed = await runLawLoad(client, readLawLibrary());
    console.log(`✓ ${Object.entries(changed).map(([name, count]) => `${name} ${count}`).join(" · ")}`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
