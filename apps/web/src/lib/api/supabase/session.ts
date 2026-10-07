/**
 * Quem está autenticado, e o que o acesso dele permite.
 *
 * Fica separado dos casos de uso porque TODOS eles precisam: a RLS decide pela
 * linha, mas o adaptador precisa do `student_id`/`teacher_id` para montar a
 * consulta, e precisa saber a qual planejamento a tela se refere.
 */
import { isAuthApiError, isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

import { hasExpired, todayLocal } from "@/lib/domain/dates";

import { ApiThrownError, type Session, type StudyPlanSummary, type Uuid } from "../contract.ts";
import { readFailure, throwDb, translateAuthError } from "./errors.ts";

export interface ProfileRow {
  id: string;
  name: string | null;
  role: "student" | "teacher";
  access_status: "pending" | "active" | "suspended" | "expired";
  access_expires_at: string | null;
  teacher_id: string | null;
}

export const PROFILE_COLUMNS = "id,name,role,access_status,access_expires_at,teacher_id";

/** `2026-09-14` — a data de hoje, sem hora, no fuso de quem está usando. */
export function today(): string {
  return todayLocal();
}

/**
 * O acesso vence pelo RELÓGIO, não só pelo enum.
 *
 * `access_status` fica `active` até alguém rodar a rotina que o expira, e essa
 * rotina não existe (R-VINC-28): `has_active_access()` recusa a escrita pelo
 * instante, e a tela precisa dizer a mesma coisa. `access_expires_at` é
 * `timestamptz`, então a comparação é de INSTANTES, na mesma fronteira do banco
 * (`> now()`): comparar o texto com a data de hoje deixava o dia do vencimento
 * "Liberado" enquanto a escrita já era recusada (QA-20).
 */
export function effectiveAccess(
  row: Pick<ProfileRow, "access_status" | "access_expires_at">,
): Session["access"] {
  if (row.access_status !== "active") return row.access_status;
  if (row.access_expires_at && hasExpired(row.access_expires_at)) return "expired";
  return "active";
}

export function toSession(
  user: { id: string; email?: string | undefined },
  row: ProfileRow,
): Session {
  return {
    profileId: row.id,
    email: user.email ?? "",
    name: row.name,
    role: row.role,
    access: effectiveAccess(row),
    accessExpiresAt: row.access_expires_at,
    teacherId: row.teacher_id,
  };
}

/**
 * O servidor de auth DISSE que não há sessão — e não apenas deixou de responder.
 *
 * Sem sessão guardada, ou com token que o GoTrue recusa (4xx: JWT inválido,
 * usuário apagado, refresh já usado), a pessoa está deslogada de fato. Rede
 * caída, timeout e 5xx não dizem nada sobre a sessão.
 */
function signedOut(error: AuthError): boolean {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && error.status >= 400 && error.status < 500;
}

export async function currentSession(): Promise<Session | null> {
  // `getUser()` valida o token no servidor de auth. `getSession()` lê o cookie
  // sem validar, e não serve para decisão de acesso.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // NÃO CONSEGUIR VERIFICAR NÃO É ESTAR DESLOGADO. Devolver `null` aqui faz
  // `requireSession` tratar a falha como sessão expirada: apaga o tema do
  // aparelho, manda para `/entrar` e, como a sessão continua lá, a pessoa
  // volta à tela no claro e sem o que estava fazendo. Uma única requisição
  // perdida numa recarga bastava — era o "Lançar tempo" virando o tema.
  if (authError && !signedOut(authError)) {
    const translated = translateAuthError(authError);
    throw new ApiThrownError(
      translated.code,
      translated.code === "offline"
        ? translated.message
        : "Não foi possível confirmar sua sessão agora. Atualize a página para tentar de novo.",
      { cause: authError },
    );
  }
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (error) throwDb(error);
  // Sem perfil, o gatilho de auth falhou. Tratar como não autenticado é mais
  // seguro do que assumir um papel.
  if (!data) return null;

  return toSession(user, data as ProfileRow);
}

/** A sessão, ou o erro de leitura que o `ErrorBoundary` da rota mostra. */
export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) readFailure("Sua sessão expirou. Entre de novo.", "unauthenticated");
  return session;
}

export const PLAN_COLUMNS =
  "id,student_id,class_id,name,area,target_exam,stage,study_model,weekly_goals,starts_on,exam_date,status";

export interface PlanRow {
  id: string;
  student_id: string;
  class_id: string | null;
  name: string;
  area: string;
  target_exam: string | null;
  stage: string;
  study_model: string;
  weekly_goals: number;
  starts_on: string;
  exam_date: string | null;
  status: StudyPlanSummary["status"];
}

export function toPlan(row: PlanRow): StudyPlanSummary {
  return {
    id: row.id,
    studentId: row.student_id,
    classId: row.class_id,
    name: row.name,
    area: row.area,
    targetExam: row.target_exam,
    stage: row.stage,
    studyModel: row.study_model,
    weeklyGoals: row.weekly_goals,
    startsOn: row.starts_on,
    examDate: row.exam_date,
    status: row.status,
  };
}

/**
 * O planejamento ATIVO do aluno.
 *
 * Um índice único parcial garante no banco que existe no máximo um por aluno —
 * é invariante de schema, não sequência de UPDATE no cliente. Aqui o `limit(1)`
 * é só defesa em profundidade.
 */
export async function activePlanOf(studentId: Uuid): Promise<StudyPlanSummary | null> {
  const { data, error } = await supabase
    .from("study_plans")
    .select(PLAN_COLUMNS)
    .eq("student_id", studentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throwDb(error);
  return data ? toPlan(data as PlanRow) : null;
}
