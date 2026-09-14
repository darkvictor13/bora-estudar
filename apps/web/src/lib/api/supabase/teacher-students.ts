/**
 * A LISTA DE ALUNOS E A FICHA, do lado do professor.
 *
 * ## Duas coisas que este schema ainda não permite, e por quê
 *
 * - **Liberar e bloquear acesso.** `profiles` concede `UPDATE (name)` e mais
 *   nada: `access_status`, `access_expires_at` e `teacher_id` ficam FORA do
 *   grant, de propósito — a RLS decide qual linha e nunca qual coluna, e sem o
 *   grant por coluna o professor promoveria aluno a professor. Liberar acesso
 *   precisa nascer como RPC, e `grantAccess`/`revokeAccess` recusam dizendo
 *   isso em vez de tentar e colher `42501`.
 * - **Anular bateria.** `quiz_sessions` é SELECT e nada mais; `void_quiz_session`
 *   não foi portada.
 */
import { supabase } from "@/lib/supabase/client";
import { classifyPace, progressUntil } from "@/lib/domain/teacher";

import type {
  QuizSessionSummary,
  Result,
  StudentCard,
  StudentFile,
  StudentListFilter,
  Uuid,
} from "../contract.ts";
import { readFailure, throwDb } from "./errors.ts";
import { PLAN_COLUMNS, requireSession, today, toPlan, type PlanRow } from "./session.ts";
import { loadStatistics } from "./statistics.ts";

interface ProfileRow {
  id: string;
  name: string | null;
  access_status: StudentCard["access"];
  access_expires_at: string | null;
}

interface GoalRow {
  student_id: string;
  week_number: number;
  weekday: number;
  status: StudentCard["pace"] extends never ? never : "pending" | "in_progress" | "completed" | "skipped";
}

/**
 * Os alunos do professor, com o número que a lista mostra.
 *
 * Três consultas para a lista inteira, e não três por aluno: com trinta alunos
 * a segunda forma seria noventa idas ao servidor para desenhar uma tela.
 */
export async function listStudents(
  filter: StudentListFilter = {},
): Promise<readonly StudentCard[]> {
  const session = await requireSession();

  const { data: students, error } = await supabase
    .from("profiles")
    .select("id,name,access_status,access_expires_at")
    .eq("teacher_id", session.profileId)
    .eq("role", "student");

  if (error) throwDb(error);

  const ids = (students ?? []).map((row) => row.id);
  if (ids.length === 0) return [];

  const [plans, goals, entries, classes] = await Promise.all([
    supabase.from("study_plans").select(`${PLAN_COLUMNS},student_id`).in("student_id", ids).eq("status", "active"),
    supabase.from("goals").select("student_id,week_number,weekday,status").in("student_id", ids),
    supabase
      .from("goal_entries")
      .select("student_id,minutes,questions,correct_answers,created_at")
      .in("student_id", ids),
    supabase
      .from("class_students")
      .select("student_id,classes(name)")
      .in("student_id", ids),
  ]);

  if (plans.error) throwDb(plans.error);
  if (goals.error) throwDb(goals.error);
  if (entries.error) throwDb(entries.error);
  if (classes.error) throwDb(classes.error);

  const planByStudent = new Map(
    ((plans.data ?? []) as unknown as (PlanRow & { student_id: string })[]).map((row) => [
      row.student_id,
      row,
    ]),
  );
  const classByStudent = new Map(
    ((classes.data ?? []) as unknown as { student_id: string; classes: { name: string } | null }[]).map(
      (row) => [row.student_id, row.classes?.name ?? null],
    ),
  );

  const cards = (students as ProfileRow[]).map((student) => {
    const plan = planByStudent.get(student.id);
    const studentGoals = ((goals.data ?? []) as unknown as GoalRow[]).filter(
      (goal) => goal.student_id === student.id,
    );
    const studentEntries = (entries.data ?? []).filter((entry) => entry.student_id === student.id);

    const progress = plan
      ? progressUntil(
          studentGoals.map((goal) => ({
            weekNumber: goal.week_number,
            weekday: goal.weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7,
            status: goal.status,
          })),
          plan.starts_on,
          today(),
        )
      : { completed: 0, due: 0, percent: 0 };

    const questions = studentEntries.reduce((sum, entry) => sum + entry.questions, 0);
    const correct = studentEntries.reduce((sum, entry) => sum + entry.correct_answers, 0);
    const lastActivity = studentEntries
      .map((entry) => entry.created_at)
      .sort()
      .at(-1);

    return {
      studentId: student.id,
      name: student.name,
      // `profiles` não guarda e-mail: ele mora em `auth.users`, que a API não
      // expõe. O professor identifica o aluno pelo nome e pela turma; o e-mail
      // aparece na lista de espera, que é onde ele foi informado.
      email: "",
      access: student.access_status,
      accessExpiresAt: student.access_expires_at,
      className: classByStudent.get(student.id) ?? null,
      planName: plan?.name ?? null,
      pace: classifyPace(progress.completed, progress.due),
      progress: progress.percent,
      score: questions > 0 ? Math.round((correct / questions) * 100) : null,
      questionsAnswered: questions,
      studiedMinutes: studentEntries.reduce((sum, entry) => sum + entry.minutes, 0),
      lastActivityAt: lastActivity ?? null,
    } satisfies StudentCard;
  });

  return applyFilter(cards, filter);
}

/** Os filtros da lista. Somam-se: busca E ritmo E acesso. */
function applyFilter(
  cards: readonly StudentCard[],
  filter: StudentListFilter,
): readonly StudentCard[] {
  const search = filter.search?.trim().toLowerCase() ?? "";

  return cards
    .filter((card) => (search ? (card.name ?? "").toLowerCase().includes(search) : true))
    .filter((card) => (filter.pace ? card.pace === filter.pace : true))
    .filter((card) => (filter.access ? card.access === filter.access : true))
    // Atrasado primeiro: a lista existe para o professor achar quem precisa
    // dele, e ordem alfabética esconde isso atrás do alfabeto.
    .sort((a, b) => {
      const order = { behind: 0, attention: 1, on_track: 2 } as const;
      return (
        order[a.pace] - order[b.pace] ||
        (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")
      );
    });
}

export async function loadStudentFile(studentId: Uuid): Promise<StudentFile> {
  const cards = await listStudents();
  const card = cards.find((candidate) => candidate.studentId === studentId);
  // Aluno de outro professor não é 404 por acaso: a RLS já o esconde, e a tela
  // precisa dizer "não existe para você" em vez de mostrar uma ficha vazia.
  if (!card) readFailure("Aluno não encontrado, ou sem vínculo com você.");

  const { data: plan, error } = await supabase
    .from("study_plans")
    .select(PLAN_COLUMNS)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throwDb(error);

  const sessions = await loadSessions(studentId);

  return {
    card,
    plan: plan ? toPlan(plan as PlanRow) : null,
    statistics: await loadStatistics({
      ...(plan ? { studyPlanId: (plan as PlanRow).id } : {}),
      year: new Date().getFullYear(),
    }),
    sessions,
    // DIFICULDADES POR TÓPICO ficam vazias neste schema: elas saem do ledger
    // cruzado com o tópico de cada questão, e `catalog_questions` — que
    // guardava o tópico — não foi portada. Volta com o motor de baterias.
    topicDifficulties: [],
  };
}

/**
 * O histórico de baterias.
 *
 * O NÚMERO NÃO ESTÁ EM `quiz_sessions` — está na view. A tabela guarda o
 * contexto (quando começou, qual bloco, que estado) e o ledger
 * `quiz_session_questions` guarda as respostas; `vw_quiz_session_performance`
 * é quem os soma. É a regra do CLAUDE.md: todo número agregado vem de view,
 * nunca de coluna de contador mantida à mão.
 */
async function loadSessions(studentId: Uuid): Promise<readonly QuizSessionSummary[]> {
  const [sessions, performance, notebooks] = await Promise.all([
    supabase
      .from("quiz_sessions")
      .select("id,status,started_at,finished_at,duration_minutes,block_id")
      .eq("student_id", studentId)
      .order("started_at", { ascending: false }),
    supabase
      .from("vw_quiz_session_performance")
      .select("quiz_session_id,main_total,main_correct")
      .eq("student_id", studentId),
    supabase
      .from("study_plan_notebooks")
      .select("block_id,subject_name,notebook_name")
      .eq("student_id", studentId),
  ]);

  if (sessions.error) throwDb(sessions.error);
  if (performance.error) throwDb(performance.error);

  const byBlock = new Map((notebooks.data ?? []).map((row) => [row.block_id, row]));
  const bySession = new Map(
    (performance.data ?? [])
      .filter((row): row is typeof row & { quiz_session_id: string } => row.quiz_session_id !== null)
      .map((row) => [row.quiz_session_id, row]),
  );

  return (sessions.data ?? []).map((row) => {
    const notebook = byBlock.get(row.block_id);
    const totals = bySession.get(row.id);
    const mainTotal = totals?.main_total ?? 0;
    const mainCorrect = totals?.main_correct ?? 0;

    return {
      id: row.id,
      subject: notebook?.subject_name ?? "—",
      blockName: notebook?.notebook_name ?? "—",
      status: row.status,
      mainTotal,
      mainCorrect,
      score: mainTotal > 0 ? Math.round((mainCorrect / mainTotal) * 100) : null,
      durationMinutes: row.duration_minutes,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    };
  });
}

/** A recusa das três operações que precisam de RPC. */
function needsRpc(operation: string, what: string): never {
  throw new Error(
    `${operation} precisa nascer como RPC: ${what} O grant por coluna em ` +
      `\`profiles\` e a escrita fechada de \`quiz_sessions\` são a defesa certa; ` +
      `afrouxá-las para a tela funcionar abriria o buraco que elas fecham. ` +
      `Ver docs/de-para-schema.md.`,
  );
}

export function grantAccess(): Promise<Result<StudentCard>> {
  return needsRpc(
    "Liberar acesso",
    "`access_status` e `access_expires_at` ficam fora do GRANT UPDATE de `profiles`.",
  );
}

export function revokeAccess(): Promise<Result<StudentCard>> {
  return needsRpc(
    "Bloquear acesso",
    "`access_status` fica fora do GRANT UPDATE de `profiles`.",
  );
}

export function voidQuizSession(): Promise<Result<QuizSessionSummary>> {
  return needsRpc(
    "Anular bateria",
    "`quiz_sessions` é SELECT e nada mais, e `void_quiz_session` não foi portada.",
  );
}
