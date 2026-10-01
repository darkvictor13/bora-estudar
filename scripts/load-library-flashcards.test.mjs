// A carga da biblioteca contra o Supabase local (spec 38).
//
// Roda em `npm run db:test`, depois das suítes SQL, sobre a biblioteca que o
// `run.sh` carregou. Cada teste abre uma transação e a desfaz no fim — a base
// sai como entrou. O único que comita é o de recusa sem escrita parcial, e ele
// existe para provar que não comitou.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import pg from "pg";

import { connectionString, loadLibrary, readLibrary, runLoad, validateLibrary } from "./load-library-flashcards.mjs";

const client = new pg.Client({ connectionString: connectionString([]) });
const pristine = readLibrary();
const library = () => structuredClone(pristine);

// Um cartão ativo que nenhum alias cita, para retirar e mover sem esbarrar no
// gatilho de alias.
const ALIASED = new Set(pristine.aliases.flatMap((a) => [a.card_id, a.old_card_id]));
const plain = pristine.cards.find((card) => !card.retired && !ALIASED.has(card.id));

async function inRollback(body) {
  await client.query("begin");
  try {
    return await body();
  } finally {
    await client.query("rollback");
  }
}

before(() => client.connect());
after(() => client.end());

test("CA-01: a contagem de cada deck na view bate com o arquivo", async () => {
  const { rows } = await client.query("select deck_id, active_cards from public.vw_library_flashcard_decks");
  const fromDb = Object.fromEntries(rows.map((row) => [row.deck_id, row.active_cards]));
  const fromFile = {};
  for (const card of pristine.cards) if (!card.retired) fromFile[card.deck_id] = (fromFile[card.deck_id] ?? 0) + 1;
  assert.equal(Object.keys(fromFile).length, 101);
  assert.deepEqual(fromDb, fromFile);
});

test("CA-03: carregar de novo o mesmo arquivo não escreve nada", () => inRollback(async () => {
  const before = (await client.query("select max(updated_at) as at from public.library_flashcards")).rows[0].at;
  const changed = await loadLibrary(client, library());
  assert.deepEqual(changed, { subjects: 0, decks: 0, cards: 0, retired: 0, aliases: 0 });
  const after = (await client.query("select max(updated_at) as at from public.library_flashcards")).rows[0].at;
  assert.equal(after.getTime(), before.getTime());
}));

test("CA-04: o cartão que some é retirado, e o que volta é reativado com o mesmo id", () => inRollback(async () => {
  const without = library();
  without.cards = without.cards.filter((card) => card.id !== plain.id);
  const removed = await loadLibrary(client, without);
  assert.equal(removed.retired, 1);
  const retired = await client.query("select retired_at from public.library_flashcards where id = $1", [plain.id]);
  assert.notEqual(retired.rows[0].retired_at, null);

  const restored = await loadLibrary(client, library());
  assert.equal(restored.cards, 1);
  const active = await client.query("select retired_at, deck_id from public.library_flashcards where id = $1", [plain.id]);
  assert.equal(active.rows[0].retired_at, null);
  assert.equal(active.rows[0].deck_id, plain.deck_id);
}));

test("R-BIB-06: corrigir o verso edita no lugar, sem retirar", () => inRollback(async () => {
  const edited = library();
  edited.cards.find((card) => card.id === plain.id).back = `${plain.back} (corrigido)`;
  const changed = await loadLibrary(client, edited);
  assert.deepEqual(changed, { subjects: 0, decks: 0, cards: 1, retired: 0, aliases: 0 });
  const row = await client.query("select back, retired_at from public.library_flashcards where id = $1", [plain.id]);
  assert.equal(row.rows[0].back, `${plain.back} (corrigido)`);
  assert.equal(row.rows[0].retired_at, null);
}));

test("CA-05: o arquivo que move um cartão de deck é recusado pelo banco", () => inRollback(async () => {
  const moved = library();
  const target = moved.decks.find((deck) => deck.id !== plain.deck_id).id;
  moved.cards.find((card) => card.id === plain.id).deck_id = target;
  await assert.rejects(loadLibrary(client, moved), (error) => {
    assert.match(error.message, new RegExp(`${plain.id} não pode mudar do deck ${plain.deck_id}`));
    return true;
  });
}));

test("R-BIB-20: o mesmo id em dois decks é recusado antes do banco", () => {
  const twice = library();
  const other = twice.decks.find((deck) => deck.id !== plain.deck_id).id;
  twice.cards.push({ ...plain, deck_id: other });
  assert.throws(() => validateLibrary(twice), /aparece nos decks/);
});

test("R-BIB-20: alias para cartão inexistente é recusado antes do banco", () => {
  const broken = library();
  broken.aliases[0] = { ...broken.aliases[0], card_id: "00000000-0000-4000-8000-000000000000" };
  assert.throws(() => validateLibrary(broken), /o cartão novo não existe/);
});

test("CA-06: status desconhecido recusa a carga inteira, sem escrita parcial", async () => {
  const bad = library();
  const first = bad.cards.find((card) => card.id === plain.id);
  first.front = `${plain.front} (não pode ficar)`;
  bad.cards.at(-10).status_id = "status_que_nao_existe";
  await assert.rejects(runLoad(client, bad), /library_flashcards_status_id_fkey/);
  const row = await client.query("select front from public.library_flashcards where id = $1", [plain.id]);
  assert.equal(row.rows[0].front, plain.front);
});

test("CA-07: revisão de um cartão que a biblioteca não tem faz a carga falhar, nomeando o par", () => inRollback(async () => {
  const student = "b7000000-0000-4000-8000-000000000002";
  const orphan = "b7000000-0000-4000-8000-0000000000ff";
  await client.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'orfa.biblioteca@x.com', '{"name":"Órfã"}')`,
    [student],
  );
  await client.query(
    `insert into public.library_flashcard_reviews (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade)
     values ($1, $2, $3, now(), 10, 1, 'good')`,
    [student, plain.deck_id, orphan],
  );
  await assert.rejects(loadLibrary(client, library()), new RegExp(`${plain.deck_id}/${orphan} \\(1 revisões\\)`));
}));

// A regra que hoje mora em `flashcardEditorialNote`, em
// `apps/web/src/lib/domain/library-flashcards.ts`. Copiada aqui porque é ela
// que a coluna substitui: a spec 39 troca o front para ler o enum, e então
// este teste passa a comparar com a frase do front, não com a regex.
function noticeFromRegex(status) {
  if (status === "historico_revogado") return "revoked";
  if (/conferir|verificar|revisar/.test(status)) return "pending_check";
  if (status === "atualizacao_futura_2027") return "future_effect";
  if (/versionamento|ressalva/.test(status)) return "version_caveat";
  return null;
}

test("CA-11: o aviso editorial de cada status reproduz a regra do front", async () => {
  const { rows } = await client.query("select id, editorial_notice from public.library_flashcard_statuses order by id");
  const used = new Set(pristine.cards.map((card) => card.status_id).filter(Boolean));
  assert.equal(used.size, 33);
  for (const status of used) assert.ok(rows.some((row) => row.id === status), `status ${status} sem linha`);
  for (const row of rows) assert.equal(row.editorial_notice, noticeFromRegex(row.id), row.id);
});

test("--linked nunca é o padrão, mesmo com a senha no ambiente", () => {
  assert.match(connectionString([], { SUPABASE_DB_PASSWORD: "x" }), /127\.0\.0\.1:54322/);
});
