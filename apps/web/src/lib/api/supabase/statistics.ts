/**
 * AS ESTATÍSTICAS, CONTRA O BANCO — leitura e nada mais.
 *
 * Todo número sai do LEDGER (`goal_entries`), nunca dos contadores da meta. É a
 * mesma regra da semana, e pelo mesmo motivo: dois caminhos escrevendo o mesmo
 * número divergem, e o que diverge em silêncio é o que ninguém conserta.
 *
 * As séries são agregadas AQUI, e não no Postgres, por uma razão de fronteira:
 * agregar no banco exigiria uma view por recorte — semana, dia, mês, disciplina
 * —, e cada view nova é uma migration que esta frente não escreve. O volume
 * justifica: um ano de estudo de um aluno são algumas centenas de linhas.
 */
import { supabase } from "@/lib/supabase/client";
import { streakDays } from "@/lib/domain/week";

import type {
  SeriesPoint,
  Statistics,
  StatisticsFilter,
  SubjectPerformance,
  Uuid,
} from "../contract.ts";
import { throwDb } from "./errors.ts";
import { activePlanOf, requireSession, today } from "./session.ts";

const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

interface EntryRow {
  minutes: number;
  questions: number;
  correct_answers: number;
  created_at: string;
  goals: { subject: string; week_number: number; status: string } | null;
}

/** Soma por chave, preservando a ordem em que as chaves apareceram. */
function sumBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
  value: (row: T) => number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    out.set(k, (out.get(k) ?? 0) + value(row));
  }
  return out;
}

/**
 * Série ordenada pela CHAVE, e rotulada depois.
 *
 * A chave é a data ISO — que ordena como texto — e o rótulo é o que a pessoa
 * lê. Ordenar por "14/09" ordenaria por dia do mês, e dezembro viria antes de
 * fevereiro.
 */
function ordered(
  map: ReadonlyMap<string, number>,
  label: (key: string) => string,
): readonly SeriesPoint[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({ label: label(key), value }));
}

export async function loadStatistics(filter: StatisticsFilter): Promise<Statistics> {
  const session = await requireSession();

  const planId =
    filter.studyPlanId ?? (await activePlanOf(session.profileId))?.id ?? null;

  // Sem planejamento não há estatística: o aluno não estudou nada por aqui.
  if (!planId) return empty();

  /**
   * O DONO DO NÚMERO É O ALUNO DO PLANEJAMENTO, não quem está olhando.
   *
   * Filtrar por `session.profileId` funcionava enquanto só o aluno abria esta
   * consulta; na tela do professor o resultado vinha vazio — ele filtrava os
   * registros DELE, e professor não registra estudo. O aluno sai do
   * planejamento, que é o recorte que a tela escolheu.
   */
  const { data: owner, error: ownerError } = await supabase
    .from("study_plans")
    .select("student_id")
    .eq("id", planId)
    .maybeSingle();

  if (ownerError) throwDb(ownerError);
  const studentId = owner?.student_id ?? session.profileId;

  const year = filter.year ?? new Date().getFullYear();
  const from = `${year}-01-01T00:00:00.000Z`;
  const to = `${year + 1}-01-01T00:00:00.000Z`;

  const [entries, goals] = await Promise.all([
    supabase
      .from("goal_entries")
      .select("minutes,questions,correct_answers,created_at,goals!inner(subject,week_number,status,study_plan_id)")
      .eq("student_id", studentId)
      .eq("goals.study_plan_id", planId)
      .gte("created_at", from)
      .lt("created_at", to),
    supabase
      .from("goals")
      .select("status,subject")
      .eq("study_plan_id", planId),
  ]);

  if (entries.error) throwDb(entries.error);
  if (goals.error) throwDb(goals.error);

  const rows = (entries.data ?? []) as unknown as EntryRow[];

  const questionsAnswered = rows.reduce((sum, row) => sum + row.questions, 0);
  const correctAnswers = rows.reduce((sum, row) => sum + row.correct_answers, 0);

  // Desempenho POR SEMANA: acertos sobre questões daquela semana, e não a média
  // das porcentagens — a média de porcentagens dá peso igual a uma semana de
  // três questões e a uma de trezentas.
  const byWeek = new Map<number, { questions: number; correct: number }>();
  for (const row of rows) {
    const week = row.goals?.week_number ?? 0;
    const current = byWeek.get(week) ?? { questions: 0, correct: 0 };
    byWeek.set(week, {
      questions: current.questions + row.questions,
      correct: current.correct + row.correct_answers,
    });
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);

  const subjectTargets = await targetsBySubject(studentId);
  const bySubject = buildSubjects(rows, subjectTargets);

  return {
    score: questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : null,
    questionsAnswered,
    correctAnswers,
    studiedMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    goalsCompleted: (goals.data ?? []).filter((goal) => goal.status === "completed").length,
    streakDays: streakDays(
      rows.map((row) => row.created_at.slice(0, 10)),
      today(),
    ),
    scoreByWeek: weeks.map(([week, totals]) => ({
      label: `S${week}`,
      value: totals.questions > 0 ? Math.round((totals.correct / totals.questions) * 100) : 0,
    })),
    questionsByWeek: weeks.map(([week, totals]) => ({
      label: `S${week}`,
      value: totals.questions,
    })),
    // DO MAIS ANTIGO PARA O MAIS NOVO. A ordem da consulta é a do banco, que
    // não promete nenhuma; uma série temporal desenhada ao contrário lê como
    // queda onde houve subida, e ninguém desconfia do eixo.
    minutesByDay: ordered(
      sumBy(
        // Os últimos 14 dias, e não o ano inteiro: uma série de 365 colunas de
        // 2px não é leitura, é textura.
        rows.filter((row) => row.created_at.slice(0, 10) >= addDays(today(), -13)),
        (row) => row.created_at.slice(0, 10),
        (row) => row.minutes,
      ),
      (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
    ),
    minutesByMonth: ordered(
      sumBy(rows, (row) => row.created_at.slice(0, 7), (row) => row.minutes),
      (iso) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?",
    ),
    bySubject,
  };
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** A meta de acerto de cada disciplina, para o traço no gráfico. */
async function targetsBySubject(studentId: Uuid): Promise<ReadonlyMap<string, number>> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("teacher_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!profile?.teacher_id) return new Map();

  const { data } = await supabase
    .from("subjects")
    .select("name,target_score")
    .eq("teacher_id", profile.teacher_id);

  return new Map((data ?? []).map((row) => [row.name, row.target_score]));
}

function buildSubjects(
  rows: readonly EntryRow[],
  targets: ReadonlyMap<string, number>,
): readonly SubjectPerformance[] {
  const bySubject = new Map<string, { questions: number; correct: number }>();
  for (const row of rows) {
    const subject = row.goals?.subject ?? "—";
    const current = bySubject.get(subject) ?? { questions: 0, correct: 0 };
    bySubject.set(subject, {
      questions: current.questions + row.questions,
      correct: current.correct + row.correct_answers,
    });
  }

  return [...bySubject.entries()]
    // Disciplina sem questão respondida não entra: uma barra de zero por cento
    // afirma "errou tudo", e ninguém errou nada — não houve resposta.
    .filter(([, totals]) => totals.questions > 0)
    .map(([subject, totals]) => ({
      subject,
      questions: totals.questions,
      correctAnswers: totals.correct,
      score: Math.round((totals.correct / totals.questions) * 100),
      targetScore: targets.get(subject) ?? 80,
    }))
    .sort((a, b) => a.score - b.score);
}

function empty(): Statistics {
  return {
    score: null,
    questionsAnswered: 0,
    correctAnswers: 0,
    studiedMinutes: 0,
    goalsCompleted: 0,
    streakDays: 0,
    scoreByWeek: [],
    questionsByWeek: [],
    minutesByDay: [],
    minutesByMonth: [],
    bySubject: [],
  };
}
