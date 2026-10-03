/**
 * Carrega a biblioteca de flashcards PF 2029 no banco (spec 38).
 *
 * A fonte continua sendo o importador: `import-police-flashcards.mjs` gera
 * `pf2029-policial-flashcards.json` a partir dos Markdown de `content/`, e
 * este script leva o JSON para as tabelas. O banco é destino, não fonte.
 *
 * ## Uso
 *
 *   node scripts/load-library-flashcards.mjs            # Supabase local
 *   node scripts/load-library-flashcards.mjs --linked   # o projeto do `supabase link`
 *
 * `--linked` lê o host de `supabase/.temp/pooler-url`, que o `supabase link`
 * escreve, e a senha de `SUPABASE_DB_PASSWORD` — a mesma conexão que o
 * `db push` do deploy já usa. Sem o flag o destino é sempre o banco local,
 * mesmo com a senha no ambiente: `db:reset` não pode carregar em staging por
 * engano.
 *
 * ## O que a carga garante
 *
 * - Uma transação só: falhou, nada foi escrito (R-BIB-16).
 * - Rodar duas vezes não muda linha nenhuma (R-BIB-17): o upsert só escreve o
 *   que mudou, e `updated_at` só anda quando o texto andou.
 * - Cartão que sumiu do arquivo é retirado; o que volta é reativado (R-BIB-18).
 * - Cartão não muda de deck — o gatilho do banco recusa (R-BIB-04).
 * - Revisão órfã faz a carga falhar (R-BIB-21): é a pré-condição da FK da 39.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import pg from "pg";

const root = new URL("../", import.meta.url);
const CURRENT = new URL("content/flashcards/pf2029-policial-flashcards.json", root);
const LEGACY = new URL("content/flashcards/pf2029-informatica-flashcards.json", root);
const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Os dois arquivos, achatados nas linhas que as tabelas recebem. */
export function readLibrary(current = readJson(CURRENT), legacy = readJson(LEGACY)) {
  const subjects = [];
  const decks = [];
  const cards = [];
  const aliases = [];

  current.subjects.forEach((subject, subjectPosition) => {
    subjects.push({
      id: subject.id,
      name: subject.subject,
      source_file: subject.sourceFile,
      audit_label: subject.auditLabel,
      audit_partial: subject.auditPartial,
      position: subjectPosition,
    });
    subject.decks.forEach((deck, deckPosition) => {
      decks.push({
        id: deck.id,
        subject_id: subject.id,
        number: deck.number,
        title: deck.title,
        historical: deck.historical,
        position: deckPosition,
      });
      deck.cards.forEach((card, cardPosition) => {
        cards.push(cardRow(deck.id, card, cardPosition, false));
        for (const old of card.previousReviews ?? []) {
          aliases.push({ old_deck_id: old.deckId, old_card_id: old.cardId, deck_id: deck.id, card_id: card.id });
        }
      });
    });
  });

  // Do arquivo antigo de Informática entram só os cartões consolidados — os
  // que algum alias cita. Os outros 1.120 já estão no atual, com o mesmo id.
  const aliased = new Set(aliases.map((alias) => `${alias.old_deck_id}:${alias.old_card_id}`));
  for (const deck of legacy.decks) {
    deck.cards.forEach((card, cardPosition) => {
      if (aliased.has(`${deck.id}:${card.id}`)) cards.push(cardRow(deck.id, card, cardPosition, true));
    });
  }

  return { subjects, decks, cards, aliases };
}

function cardRow(deckId, card, position, retired) {
  return {
    id: card.id,
    deck_id: deckId,
    topic: card.topic,
    front: card.front,
    back: card.back,
    origin_id: card.origin,
    status_id: card.status ?? null,
    source_number: card.sourceNumber ?? null,
    position,
    retired,
  };
}

/** O que dá para recusar sem banco, com a mensagem que nomeia o cartão (R-BIB-20). */
export function validateLibrary(library) {
  const errors = [];
  const decks = new Set(library.decks.map((deck) => deck.id));
  const subjects = new Set(library.subjects.map((subject) => subject.id));
  const cards = new Map();

  for (const deck of library.decks) {
    if (!subjects.has(deck.subject_id)) errors.push(`Deck ${deck.id} sem matéria (${deck.subject_id}).`);
  }
  for (const card of library.cards) {
    const previous = cards.get(card.id);
    if (previous) {
      errors.push(previous.deck_id === card.deck_id
        ? `Cartão ${card.id} duplicado no deck ${card.deck_id}.`
        : `Cartão ${card.id} aparece nos decks ${previous.deck_id} e ${card.deck_id}: mover é retirar, criar e registrar alias.`);
    }
    cards.set(card.id, card);
  }
  for (const alias of library.aliases) {
    const old = cards.get(alias.old_card_id);
    const target = cards.get(alias.card_id);
    const name = `${alias.old_deck_id}/${alias.old_card_id} → ${alias.deck_id}/${alias.card_id}`;
    if (!old || old.deck_id !== alias.old_deck_id) errors.push(`Alias ${name}: o cartão antigo não existe no deck citado.`);
    else if (!old.retired) errors.push(`Alias ${name}: o cartão antigo continua ativo.`);
    if (!target || target.deck_id !== alias.deck_id) errors.push(`Alias ${name}: o cartão novo não existe no deck citado.`);
    else if (target.retired) errors.push(`Alias ${name}: o cartão novo está retirado.`);
  }
  for (const card of library.cards) {
    if (!decks.has(card.deck_id) && !card.retired) errors.push(`Cartão ${card.id} num deck que o arquivo não declara (${card.deck_id}).`);
  }

  if (errors.length > 0) throw new Error(`A biblioteca foi recusada:\n- ${errors.join("\n- ")}`);
}

/**
 * Escreve a biblioteca. NÃO abre nem fecha transação: quem chama decide, e é
 * isso que deixa o teste rodar a carga e desfazer no fim. `runLoad` é a
 * versão com transação, que o script usa.
 */
export async function loadLibrary(client, library) {
  validateLibrary(library);
  const changed = {};

  changed.subjects = (await client.query(`
    insert into public.library_flashcard_subjects as t (id, name, source_file, audit_label, audit_partial, position)
    select id, name, source_file, audit_label, audit_partial, position
      from jsonb_to_recordset($1::jsonb)
        as x(id text, name text, source_file text, audit_label text, audit_partial boolean, position smallint)
    on conflict (id) do update set
      name = excluded.name, source_file = excluded.source_file, audit_label = excluded.audit_label,
      audit_partial = excluded.audit_partial, position = excluded.position
    where (t.name, t.source_file, t.audit_label, t.audit_partial, t.position)
      is distinct from (excluded.name, excluded.source_file, excluded.audit_label, excluded.audit_partial, excluded.position)
  `, [JSON.stringify(library.subjects)])).rowCount;

  changed.decks = (await client.query(`
    insert into public.library_flashcard_decks as t (id, subject_id, number, title, historical, position)
    select id, subject_id, number, title, historical, position
      from jsonb_to_recordset($1::jsonb)
        as x(id text, subject_id text, number text, title text, historical boolean, position smallint)
    on conflict (id) do update set
      subject_id = excluded.subject_id, number = excluded.number, title = excluded.title,
      historical = excluded.historical, position = excluded.position
    where (t.subject_id, t.number, t.title, t.historical, t.position)
      is distinct from (excluded.subject_id, excluded.number, excluded.title, excluded.historical, excluded.position)
  `, [JSON.stringify(library.decks)])).rowCount;

  // `deck_id` entra no SET de propósito: se o arquivo mover um cartão, o
  // gatilho `library_flashcards_forbid_move` recusa com o id na mensagem, em
  // vez de a carga seguir e deixar o cartão no deck antigo em silêncio.
  changed.cards = (await client.query(`
    insert into public.library_flashcards as t
      (id, deck_id, topic, front, back, origin_id, status_id, source_number, position, retired_at)
    select id, deck_id, topic, front, back, origin_id, status_id, source_number, position,
           case when retired then now() end
      from jsonb_to_recordset($1::jsonb)
        as x(id uuid, deck_id text, topic text, front text, back text, origin_id text,
             status_id text, source_number text, position integer, retired boolean)
    on conflict (id) do update set
      deck_id = excluded.deck_id, topic = excluded.topic, front = excluded.front, back = excluded.back,
      origin_id = excluded.origin_id, status_id = excluded.status_id,
      source_number = excluded.source_number, position = excluded.position,
      retired_at = case when excluded.retired_at is null then null else coalesce(t.retired_at, excluded.retired_at) end
    where (t.deck_id, t.topic, t.front, t.back, t.origin_id, t.status_id, t.source_number, t.position, t.retired_at is null)
      is distinct from (excluded.deck_id, excluded.topic, excluded.front, excluded.back, excluded.origin_id,
                        excluded.status_id, excluded.source_number, excluded.position, excluded.retired_at is null)
  `, [JSON.stringify(library.cards)])).rowCount;

  changed.retired = (await client.query(`
    update public.library_flashcards set retired_at = now()
     where retired_at is null and not (id = any($1::uuid[]))
  `, [library.cards.map((card) => card.id)])).rowCount;

  changed.aliases = (await client.query(`
    insert into public.library_flashcard_aliases as t (old_deck_id, old_card_id, deck_id, card_id)
    select old_deck_id, old_card_id, deck_id, card_id
      from jsonb_to_recordset($1::jsonb) as x(old_deck_id text, old_card_id uuid, deck_id text, card_id uuid)
    on conflict (old_deck_id, old_card_id) do update set deck_id = excluded.deck_id, card_id = excluded.card_id
    where (t.deck_id, t.card_id) is distinct from (excluded.deck_id, excluded.card_id)
  `, [JSON.stringify(library.aliases)])).rowCount;

  // O gatilho de alias é DEFERRED: sem isto ele só conferiria no COMMIT, e
  // quem chama sem fechar a transação (o teste) não veria a recusa.
  await client.query("set constraints public.library_flashcard_aliases_endpoints, public.library_flashcards_alias_endpoints immediate");
  await client.query("set constraints public.library_flashcard_aliases_endpoints, public.library_flashcards_alias_endpoints deferred");

  const { rows: orphans } = await client.query(`
    select r.deck_id, r.card_id::text, count(*)::integer as reviews
      from public.library_flashcard_reviews r
     where not exists (select 1 from public.library_flashcards c where c.deck_id = r.deck_id and c.id = r.card_id)
     group by r.deck_id, r.card_id
     order by r.deck_id, r.card_id
  `);
  if (orphans.length > 0) {
    const list = orphans.slice(0, 20).map((o) => `${o.deck_id}/${o.card_id} (${o.reviews} revisões)`);
    throw new Error(`Há ${orphans.length} cartões revisados que a biblioteca não tem:\n- ${list.join("\n- ")}`);
  }

  // A FK da spec 39 nasce `not valid` (R-BIB-25): com o conteúdo carregado e
  // nenhuma órfã, é aqui que as revisões antigas passam a ser conferidas.
  // Antes da migration da 39 a constraint não existe e nada acontece.
  const { rows: pending } = await client.query(`
    select 1 from pg_constraint
     where conname = 'library_flashcard_reviews_card_fk' and not convalidated
  `);
  if (pending.length > 0) {
    await client.query("alter table public.library_flashcard_reviews validate constraint library_flashcard_reviews_card_fk");
  }

  return changed;
}

/** A carga numa transação: ou tudo, ou nada (R-BIB-16). */
export async function runLoad(client, library) {
  await client.query("begin");
  try {
    const changed = await loadLibrary(client, library);
    await client.query("commit");
    return changed;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export function connectionString(argv = process.argv.slice(2), env = process.env) {
  if (!argv.includes("--linked")) return env["LIBRARY_DB_URL"] ?? LOCAL_URL;
  const password = env["SUPABASE_DB_PASSWORD"];
  if (!password) throw new Error("--linked exige SUPABASE_DB_PASSWORD.");
  let pooler;
  try {
    pooler = readFileSync(new URL("supabase/.temp/pooler-url", root), "utf8").trim();
  } catch {
    throw new Error("--linked exige `supabase link` antes: falta supabase/.temp/pooler-url.");
  }
  const url = new URL(pooler);
  url.password = password;
  return url.toString();
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

async function main() {
  const url = connectionString();
  const { username, host } = new URL(url);
  console.log(`→ carregando a biblioteca de flashcards em ${username}@${host}`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const changed = await runLoad(client, readLibrary());
    console.log(`✓ matérias ${changed.subjects} · decks ${changed.decks} · cartões ${changed.cards} · retirados ${changed.retired} · aliases ${changed.aliases}`);
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
