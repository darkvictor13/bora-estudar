/**
 * Volta completa do fluxo da extensão, sem navegador.
 *
 * Exercita a cadeia inteira contra o Supabase local: o site abre a sessão e
 * monta o payload, o motor da extensão escolhe a fila e responde, o resultado
 * volta pelo protocolo e vira linha no ledger, e o tempo conclui a meta.
 *
 * Fica fora do `npm run check` porque exige o stack local no ar:
 *
 *   npm run test:e2e
 *
 * Recria a base antes de rodar, para partir sempre do seed conhecido. Sem
 * isso, rodar depois do `db:test` — que limpa os usuários do seed — falharia
 * no login.
 */
import { createServerClient } from "@supabase/ssr";
import { buildStartUrl, buildResultUrl, parseStartHash, parseResultHash }
  from "../packages/protocol/src/index.ts";
import { pickQuestions, nextUnanswered, progressOf }
  from "../apps/extension/src/content/engine.ts";
import { randomUUID } from "node:crypto";

import { execFileSync } from "node:child_process";

console.log("→ recriando a base a partir do seed");
execFileSync("supabase", ["db", "reset"], { stdio: "ignore" });

const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
function client() {
  const store = new Map();
  return createServerClient("http://127.0.0.1:54321", KEY, {
    cookies: { getAll: () => [...store].map(([name, value]) => ({ name, value })),
               setAll: (l) => l.forEach(({ name, value }) => store.set(name, value)) },
  });
}
const sb = client();
await sb.auth.signInWithPassword({ email: "aluno@boraestudar.local", password: "BoraEstudar#2026!" });

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) falhas++; };

// ---------- SITE: abre a sessão e monta o payload ----------
const { data: plan } = await sb.from("study_plans").select("id").eq("status","active").single();
const { data: goal } = await sb.from("goals")
  .select("id,block_id").eq("type","question_block").eq("status","pending").limit(1).single();
const { data: opened, error: e1 } = await sb.rpc("start_quiz_session", {
  p_study_plan_id: plan.id, p_block_id: goal.block_id, p_goal_id: goal.id });
ok(!e1 && opened?.status === "in_progress", `sessão aberta (${opened?.status}, nº ${opened?.session_number})`);

const { data: blk } = await sb.from("study_plan_blocks")
  .select("catalog_block_id").eq("id", goal.block_id).single();
const { data: cat } = await sb.from("catalog_questions")
  .select("question_id").eq("block_id", blk.catalog_block_id).order("position");
const available = cat.map(r => Number(r.question_id));
ok(available.length === 30, `catálogo do bloco: ${available.length} questões`);

const startPayload = {
  returnUrl: "http://localhost:3000/aluno",
  quizSessionId: opened.id, goalId: goal.id, studyPlanId: plan.id, blockId: goal.block_id,
  sessionNumber: opened.session_number, mainTarget: opened.main_target,
  availableQuestions: available, history: [], historyComplete: true,
};
const startUrl = buildStartUrl("https://www.tecconcursos.com.br/questoes", startPayload);
ok(startUrl.includes("#boraQuizStart="), "site montou a URL de início");

// ---------- EXTENSÃO: lê, escolhe a fila, responde ----------
const recebido = parseStartHash(startUrl.slice(startUrl.indexOf("#"))).body;
ok(recebido.quizSessionId === opened.id, "extensão leu o payload íntegro");

const fila = pickQuestions(recebido);
ok(fila.length === 15, `motor escolheu ${fila.length} questões (alvo ${recebido.mainTarget})`);
ok(fila.every(q => available.includes(q)), "toda questão da fila pertence ao bloco");

const answers = {};
let ordem = 0;
for (const questionId of fila) {
  ordem++;
  answers[String(questionId)] = {
    questionId, executionOrder: ordem, round: 0, phase: "main",
    outcome: ordem <= 11 ? "correct" : "incorrect",
    topic: null, sourceQuestionId: null, answeredAt: "2026-08-22T10:00:00.000Z",
  };
}
ok(nextUnanswered(fila, answers) === null, "fila completa: não sobra pendente");
const prog = progressOf(fila, answers);
ok(prog.correct === 11 && prog.incorrect === 4, `progresso: ${prog.correct} ac / ${prog.incorrect} er`);

const requestId = randomUUID();
const resultUrl = buildResultUrl(
  { quizSessionId: recebido.quizSessionId, requestId, cancel: false, answers: Object.values(answers) },
  recebido.returnUrl);
ok(resultUrl.startsWith("http://localhost:3000/aluno#boraQuizResult="), "extensão montou a URL de retorno");

// ---------- SITE: recebe e grava ----------
const devolvido = parseResultHash(resultUrl.slice(resultUrl.indexOf("#"))).body;
ok(devolvido.requestId === requestId, "requestId preservado na volta");
ok(devolvido.answers.length === 15, `${devolvido.answers.length} respostas na volta`);

const gravar = () => sb.rpc("finish_quiz_session", {
  p_quiz_session_id: devolvido.quizSessionId, p_request_id: devolvido.requestId,
  p_outcomes: devolvido.answers.map(a => ({
    question_id: a.questionId, execution_order: a.executionOrder, round: a.round,
    phase: a.phase, outcome: a.outcome, topic: a.topic,
    source_question_id: a.sourceQuestionId, answered_at: a.answeredAt })),
  p_cancel: false });

const r1 = await gravar();
ok(!r1.error && r1.data?.status === "awaiting_time", `gravado (${r1.data?.status ?? r1.error?.message})`);
const r2 = await gravar();
ok(!r2.error, "retentativa com o mesmo requestId não falha");

const { count } = await sb.from("quiz_session_questions")
  .select("id", { count: "exact", head: true }).eq("quiz_session_id", opened.id);
ok(count === 15, `ledger com ${count} linhas (sem duplicar no replay)`);

// ---------- SITE: registra o tempo ----------
const r3 = await sb.rpc("record_quiz_session_time", {
  p_quiz_session_id: opened.id, p_request_id: randomUUID(), p_duration_minutes: 85 });
ok(!r3.error && r3.data?.status === "completed", `tempo registrado (${r3.data?.status ?? r3.error?.message})`);

const { data: g } = await sb.from("goals").select("status").eq("id", goal.id).single();
ok(g.status === "completed", `meta ficou ${g.status}`);

const { data: perf } = await sb.from("vw_goal_performance")
  .select("questions_answered,correct_answers,minutes_spent").eq("goal_id", goal.id).single();
ok(perf.questions_answered === 15 && perf.correct_answers === 11 && perf.minutes_spent === 85,
   `desempenho: ${perf.correct_answers}/${perf.questions_answered} em ${perf.minutes_spent}min`);

// ---------- 2ª bateria: histórico evita repetir ----------
// O professor cria a próxima meta no mesmo bloco.
const prof = client();
await prof.auth.signInWithPassword({ email: "professor@boraestudar.local", password: "BoraEstudar#2026!" });
const { error: eGoal } = await prof.from("goals").insert({
  study_plan_id: plan.id,
  student_id: (await sb.auth.getUser()).data.user.id,
  teacher_id: (await prof.auth.getUser()).data.user.id,
  week_number: 9, weekday: 6, day_order: 1,
  type: "question_block", block_id: goal.block_id,
  title: "Segunda bateria do bloco",
  created_by: (await prof.auth.getUser()).data.user.id,
});
ok(!eGoal, `professor criou a 2ª meta${eGoal ? `: ${eGoal.message}` : ""}`);

{
  const { data: hist } = await sb.from("vw_seen_questions")
    .select("question_id,times_seen,correct_answers,incorrect_answers,last_seen_at")
    .eq("study_plan_id", plan.id).eq("block_id", goal.block_id);
  const history = hist.map(h => ({ questionId: Number(h.question_id), timesSeen: h.times_seen,
    correctAnswers: h.correct_answers, incorrectAnswers: h.incorrect_answers, lastSeenAt: h.last_seen_at }));
  const fila2 = pickQuestions({ ...startPayload, history, historyComplete: true });
  const repetidas = fila2.filter(q => fila.includes(q));
  ok(history.length === 15, `histórico devolveu ${history.length} questões vistas`);
  ok(repetidas.length === 0, `2ª bateria não repete nenhuma das 15 (repetidas: ${repetidas.length})`);
  ok(fila2.length === 15, `2ª fila com ${fila2.length} questões, das 15 inéditas restantes`);
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nvolta completa OK");
process.exit(falhas ? 1 : 0);
