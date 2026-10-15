/** Testes de integração opcionais: BORA_LOCAL_TEST=1 node --test este arquivo. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

test("biblioteca local preserva tópicos, imagens e acesso restrito", { skip: process.env.BORA_LOCAL_TEST !== "1" }, async () => {
  const source = JSON.parse(await readFile(new URL("../content/summaries/local/pf2029/library.json", import.meta.url), "utf8"));
  const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  try {
    const loaded = await db.query("select id,blocks from public.summary_topics order by position");
    assert.equal(loaded.rows.length, source.topics.length);
    for (let i = 0; i < source.topics.length; i++) {
      assert.equal(loaded.rows[i].id, source.topics[i].id);
      assert.deepEqual(loaded.rows[i].blocks, source.topics[i].blocks);
    }
    const assets = await db.query("select name from storage.objects where bucket_id='flash-summaries'");
    const keys = new Set(assets.rows.map(row => row.name));
    for (const asset of source.assets) assert.ok(keys.has(`pf2029/${asset.key}`));
    assert.ok(keys.has("pf2029/source.docx"));
    assert.equal((await db.query("select public from storage.buckets where id='flash-summaries'")).rows[0].public, false);
    await db.query("begin");
    await db.query("set local role anon");
    await assert.rejects(db.query("select id from public.summary_topics"), { code: "42501" });
    await db.query("rollback");
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: "00000000-0000-0000-0000-000000000001", role: "authenticated" })]);
    await db.query("set local role authenticated");
    assert.equal((await db.query("select id from public.summary_topics")).rowCount, 0);
    assert.equal((await db.query("select name from storage.objects where bucket_id='flash-summaries'")).rowCount, 0);
    await assert.rejects(db.query("update public.summary_topics set title='alterado'"), { code: "42501" });
    await db.query("rollback");
    const users = (await db.query("select id,email from auth.users where email in ('aluno@local.dev','professor@local.dev')")).rows;
    const student = users.find(user => user.email === 'aluno@local.dev');
    const teacher = users.find(user => user.email === 'professor@local.dev');
    assert.ok(student && teacher);
    const topic = source.topics[0].id;
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: student.id, role: "authenticated" })]);
    await db.query("set local role authenticated");
    // O aluno com acesso lê as imagens do resumo, e NUNCA o .docx original.
    const visible = (await db.query("select name from storage.objects where bucket_id='flash-summaries'")).rows.map(row => row.name);
    assert.ok(!visible.includes("pf2029/source.docx"));
    assert.ok(visible.every(name => /^pf2029\/[0-9a-f]{64}\.(png|jpe?g|jfif)$/.test(name)));
    assert.equal(visible.length, source.assets.length);
    const note = { id: 'test', path: '0', start: 0, end: 5, quote: 'teste', style: 'comment', color: '#d4aa20', comment: 'Nota de teste' };
    const save = async (previous, next) => (await db.query("select public.save_summary_notes($1,$2::jsonb,$3::jsonb) as saved", [topic, JSON.stringify(previous), JSON.stringify(next)])).rows[0].saved;
    const before = (await db.query("select notes from public.summary_annotations where user_id=$1 and topic_id=$2", [student.id, topic])).rows[0]?.notes ?? [];
    const after = [...before, note];
    assert.equal(await save(before, after), true);
    assert.equal(await save(before, after), true, "a retentativa de quem já gravou não é conflito");
    assert.equal(await save(before, [...before, { ...note, id: 'outra-aba' }]), false, "estado anterior desatualizado é conflito");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: teacher.id, role: "authenticated" })]);
    assert.equal((await db.query("select notes from public.summary_annotations where user_id=$1 and topic_id=$2", [student.id, topic])).rowCount, 0);
    await db.query("rollback");
  } finally { await db.end(); }
});
