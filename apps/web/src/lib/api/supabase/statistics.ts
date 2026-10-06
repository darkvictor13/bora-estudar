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
import { questionsByDay } from "@/lib/domain/question-performance";
import { classQuestionDistribution } from "@/lib/domain/class-question-distribution";
import { entryDay } from "@/lib/domain/schedule";

import type {
  ClassQuestionDistribution,
  SeriesPoint,
  Statistics,
  StatisticsFilter,
  StudentQuestionComparison,
  WeeklyQuestionComparison,
  SubjectPeerComparison,
  SubjectPerformance,
  IsoDate,
  Uuid,
} from "../contract.ts";
import { throwDb } from "./errors.ts";
import { activePlanOf, requireSession, today } from "./session.ts";

interface StudentComparisonRow {
  sample_size: number;
  minimum_questions: number;
  student_questions: number;
  student_score: number | null;
  percentile: number | null;
  box_min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  box_max: number | null;
  lower_whisker: number | null;
  upper_whisker: number | null;
}

interface WeeklyComparisonRow extends StudentComparisonRow {
  week_number: number;
}

const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

/**
 * O recorte por ANO de um registro é o do dia estudado (N-07): um extra lançado
 * em 2027-01-01 para 2026-12-31 é de 2026. Sem `studied_on`, vale o instante do
 * lançamento, nos limites locais do ano.
 *
 * As aspas em volta do instante são a forma do PostgREST para valor com `.` e `:`
 * dentro de uma árvore lógica. `.or()` entra com `AND` nos demais filtros.
 */
function entryYear(year: number): string {
  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();
  return (
    `and(studied_on.gte.${year}-01-01,studied_on.lt.${year + 1}-01-01),` +
    `and(studied_on.is.null,created_at.gte."${from}",created_at.lt."${to}")`
  );
}

interface EntryRow {
  id: string;
  minutes: number;
  questions: number;
  correct_answers: number;
  created_at: string;
  studied_on: string | null;
  goals: { subject: string; block?: string | null; week_number: number; status: string } | null;
}

/** Compara alunos da mesma turma no mesmo ano, sem expor nomes ou notas individuais. */
export async function loadClassQuestionDistribution(classId: Uuid, year: number): Promise<ClassQuestionDistribution> {
  const session = await requireSession();
  if (session.role !== "teacher") throw new Error("A distribuição da turma está disponível apenas ao professor.");

  const members = await supabase.from("class_students")
    .select("student_id")
    .eq("class_id", classId)
    .eq("teacher_id", session.profileId);
  if (members.error) throwDb(members.error);
  const studentIds = (members.data ?? []).map((member) => member.student_id);
  if (studentIds.length === 0) return classQuestionDistribution([], []);

  // A turma é a moldura; o planejamento ativo é o recorte. Sem esta segunda
  // condição, um plano arquivado do mesmo aluno continuaria alterando quartis
  // e mediana do boxplot atual.
  const activePlans = await supabase.from("study_plans")
    .select("id,student_id")
    .eq("teacher_id", session.profileId)
    .eq("class_id", classId)
    .eq("status", "active")
    .in("student_id", studentIds);
  if (activePlans.error) throwDb(activePlans.error);

  const activeStudentIds = [...new Set((activePlans.data ?? []).map((plan) => plan.student_id))];
  const activePlanIds = (activePlans.data ?? []).map((plan) => plan.id);
  if (activePlanIds.length === 0) {
    return classQuestionDistribution(studentIds, [], activeStudentIds);
  }

  const rows: { studentId: string; questions: number; correctAnswers: number }[] = [];
  // O Data API pode limitar cada resposta a 1.000 linhas. Paginamos em ordem
  // estável para que uma turma ativa não perca os registros mais recentes.
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase.from("goal_entries")
      .select("id,student_id,questions,correct_answers,goals!inner(study_plan_id)")
      .eq("teacher_id", session.profileId)
      .in("student_id", studentIds)
      .in("goals.study_plan_id", activePlanIds)
      .gt("questions", 0)
      .or(entryYear(year))
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (page.error) throwDb(page.error);
    const batch = page.data ?? [];
    rows.push(...batch.map((row) => ({
      studentId: row.student_id,
      questions: row.questions,
      correctAnswers: row.correct_answers,
    })));
    if (batch.length < pageSize) break;
  }
  return classQuestionDistribution(studentIds, rows, activeStudentIds);
}

export async function loadStudyDays(year: number): Promise<readonly IsoDate[]> {
  const session = await requireSession();
  if (session.role !== "student") throw new Error("O calendário de estudo pertence ao aluno.");
  const dates = new Set<IsoDate>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase.from("goal_entries")
      .select("id,created_at,studied_on,minutes,questions")
      .eq("student_id", session.profileId)
      .or(entryYear(year))
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (page.error) throwDb(page.error);
    const batch = page.data ?? [];
    for (const row of batch) if (row.minutes > 0 || row.questions > 0) dates.add(entryDay({ createdAt: row.created_at, studiedOn: row.studied_on }));
    if (batch.length < pageSize) break;
  }
  return [...dates].filter((date) => date.startsWith(`${year}-`)).sort();
}

/** Agregados anônimos calculados no banco; nenhuma nota de colega chega ao cliente. */
export async function loadStudentQuestionComparison(year: number): Promise<StudentQuestionComparison> {
  const session = await requireSession();
  if (session.role !== "student") throw new Error("A comparação individual pertence ao aluno.");

  const { data, error } = await supabase.rpc("student_question_comparison", { p_year: year });
  if (error) throwDb(error);
  const row = (data?.[0] ?? null) as StudentComparisonRow | null;
  if (!row) return emptyStudentComparison();

  const hasDistribution = [row.box_min, row.q1, row.median, row.q3, row.box_max, row.lower_whisker, row.upper_whisker]
    .every((value) => value !== null);

  return {
    sampleSize: row.sample_size,
    minimumQuestions: row.minimum_questions,
    studentQuestions: Number(row.student_questions),
    studentScore: row.student_score === null ? null : Number(row.student_score),
    percentile: row.percentile === null ? null : Number(row.percentile),
    distribution: hasDistribution ? {
      min: Number(row.box_min),
      q1: Number(row.q1),
      median: Number(row.median),
      q3: Number(row.q3),
      max: Number(row.box_max),
      lowerWhisker: Number(row.lower_whisker),
      upperWhisker: Number(row.upper_whisker),
    } : null,
  };
}

export async function loadStudentWeeklyQuestionComparison(year: number): Promise<readonly WeeklyQuestionComparison[]> {
  const session = await requireSession();
  if (session.role !== "student") throw new Error("A comparação semanal pertence ao aluno.");

  const { data, error } = await supabase.rpc("student_weekly_question_comparison", { p_year: year });
  if (error) throwDb(error);

  return ((data ?? []) as WeeklyComparisonRow[]).map((row) => {
    const hasDistribution = [row.box_min, row.q1, row.median, row.q3, row.box_max, row.lower_whisker, row.upper_whisker]
      .every((value) => value !== null);
    return {
      weekNumber: row.week_number,
      sampleSize: row.sample_size,
      minimumQuestions: row.minimum_questions,
      studentQuestions: Number(row.student_questions),
      studentScore: row.student_score === null ? null : Number(row.student_score),
      percentile: row.percentile === null ? null : Number(row.percentile),
      distribution: hasDistribution ? {
        min: Number(row.box_min),
        q1: Number(row.q1),
        median: Number(row.median),
        q3: Number(row.q3),
        max: Number(row.box_max),
        lowerWhisker: Number(row.lower_whisker),
        upperWhisker: Number(row.upper_whisker),
      } : null,
    };
  });
}

export async function loadStudentSubjectPeerComparison(year: number): Promise<readonly SubjectPeerComparison[]> {
  const session = await requireSession();
  if (session.role !== "student") throw new Error("O comparativo por matéria pertence ao aluno.");

  const { data, error } = await supabase.rpc("student_subject_peer_comparison", { p_year: year });
  if (error) throwDb(error);
  return (data ?? []).map((row) => ({
    subject: row.subject,
    studentScore: Number(row.student_score),
    peerAverage: row.peer_average === null ? null : Number(row.peer_average),
    sampleSize: row.sample_size,
    minimumQuestions: row.minimum_questions,
  }));
}

function emptyStudentComparison(): StudentQuestionComparison {
  return {
    sampleSize: 0,
    minimumQuestions: 10,
    studentQuestions: 0,
    studentScore: null,
    percentile: null,
    distribution: null,
  };
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
  // Só a janela das metas concluídas usa estes limites: os registros usam `entryYear`.
  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();

  const rows: EntryRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase
      .from("goal_entries")
      .select("id,minutes,questions,correct_answers,created_at,studied_on,goals!inner(subject,block,week_number,status,study_plan_id)")
      .eq("student_id", studentId)
      .eq("goals.study_plan_id", planId)
      .or(entryYear(year))
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (page.error) throwDb(page.error);
    const batch = (page.data ?? []) as unknown as EntryRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  // Metas concluídas precisam respeitar o mesmo período dos demais KPIs. Uma
  // conclusão de 2025 não pode reaparecer quando o professor seleciona 2026.
  const completedGoals = await supabase
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("study_plan_id", planId)
    .eq("status", "completed")
    .gte("completed_at", from)
    .lt("completed_at", to);
  if (completedGoals.error) throwDb(completedGoals.error);

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
  const blocks = new Map<string, { subject: string; block: string; questions: number; correctAnswers: number }>();
  for (const row of rows) {
    if (row.questions <= 0) continue;
    const subject = row.goals?.subject ?? "Sem disciplina";
    const block = row.goals?.block ?? "Sem bloco vinculado";
    const key = JSON.stringify([subject, block]);
    const current = blocks.get(key) ?? { subject, block, questions: 0, correctAnswers: 0 };
    current.questions += row.questions;
    current.correctAnswers += row.correct_answers;
    blocks.set(key, current);
  }

  return {
    studyTime: rows.filter((row) => row.minutes > 0).map((row) => ({ date: entryDay({ createdAt: row.created_at, studiedOn: row.studied_on }), subject: row.goals?.subject ?? "Sem disciplina", minutes: row.minutes })),
    byBlock: [...blocks.values()],
    score: questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : null,
    questionsAnswered,
    correctAnswers,
    studiedMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    goalsCompleted: completedGoals.count ?? 0,
    streakDays: streakDays(
      rows.filter((row) => row.minutes > 0 || row.questions > 0).map((row) => entryDay({ createdAt: row.created_at, studiedOn: row.studied_on })),
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
    dailyQuestions: questionsByDay(
      rows.map((row) => ({
        createdAt: row.created_at,
        studiedOn: row.studied_on,
        questions: row.questions,
        correctAnswers: row.correct_answers,
      })),
      addDays(today(), -13),
    ),
    // DO MAIS ANTIGO PARA O MAIS NOVO. A ordem da consulta é a do banco, que
    // não promete nenhuma; uma série temporal desenhada ao contrário lê como
    // queda onde houve subida, e ninguém desconfia do eixo.
    minutesByDay: ordered(
      sumBy(
        // Os últimos 14 dias, e não o ano inteiro: uma série de 365 colunas de
        // 2px não é leitura, é textura.
        rows.filter((row) => entryDay(dayOf(row)) >= addDays(today(), -13)),
        (row) => entryDay(dayOf(row)),
        (row) => row.minutes,
      ),
      (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
    ),
    minutesByMonth: ordered(
      sumBy(rows, (row) => entryDay(dayOf(row)).slice(0, 7), (row) => row.minutes),
      (iso) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?",
    ),
    bySubject,
  };
}

/** O que `entryDay` lê de uma linha do ledger. */
function dayOf(row: EntryRow): { createdAt: string; studiedOn: string | null } {
  return { createdAt: row.created_at, studiedOn: row.studied_on };
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
    dailyQuestions: [],
    minutesByDay: [],
    minutesByMonth: [],
    bySubject: [],
  };
}
