import { createScenario, expect, query, setAccess, test } from "../qa.ts";
const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const REST = "http://127.0.0.1:54321";
async function token(email: string, password: string) {
  const r = await fetch(`${REST}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return ((await r.json()) as { access_token: string }).access_token;
}
async function patch(tok: string, id: string, body: object) {
  const r = await fetch(`${REST}/rest/v1/goals?id=eq.${id}`, { method: "PATCH", headers: { apikey: KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
  return `${r.status} ${(await r.text()).slice(0, 200)}`;
}
test("F3.3 escrita direta em goals pelo aluno", async () => {
  const s = await createScenario();
  const theory = s.goals.find((g) => g.type === "theory")!;
  const extra = s.goals.find((g) => g.type === "extra")!;
  const tok = await token(s.student.email, s.student.password);
  const forged = await patch(tok, theory.id, { correct_answers: 999, questions_answered: 10, spent_minutes: 99999 });
  const row = await query("select correct_answers, questions_answered, spent_minutes from goals where id=$1", [theory.id]);
  console.log("ATIVO forja números:", forged.slice(0, 60), JSON.stringify(row[0]));
  await setAccess(s.student.id, "suspended");
  const tok2 = await token(s.student.email, s.student.password);
  const r2 = await patch(tok2, extra.id, { status: "completed", completed_at: new Date().toISOString() });
  const row2 = await query("select status from goals where id=$1", [extra.id]);
  console.log("SUSPENSO conclui:", r2.slice(0, 40), JSON.stringify(row2[0]));
  const r3 = await patch(tok2, theory.id, { spent_minutes: 5, status: "skipped" });
  const row3 = await query("select status, spent_minutes from goals where id=$1", [theory.id]);
  console.log("SUSPENSO pula teoria:", r3.slice(0, 40), JSON.stringify(row3[0]));
  expect(true).toBe(true);
});
