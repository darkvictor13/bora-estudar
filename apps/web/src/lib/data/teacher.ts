import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Consultas do professor.
 *
 * A RLS já restringe ao contexto do professor autenticado, mas os filtros
 * explícitos por `teacher_id` permanecem: o Postgres usa o índice, e sem eles
 * a policy vira um seq scan em tabela grande.
 */

export async function getMyStudents(teacherId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: links } = await supabase
    .from("student_teacher_links")
    .select("student_id,started_at")
    .eq("teacher_id", teacherId)
    .is("ended_at", null)
    .order("started_at");

  const studentIds = (links ?? []).map((l) => l.student_id);
  if (!studentIds.length) return [];

  const [{ data: profiles }, { data: subscriptions }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("id,name,contact_email,phone").in("id", studentIds),
    supabase.from("subscriptions").select("student_id,status,plan,validity").in("student_id", studentIds),
    supabase
      .from("study_plans")
      .select("id,student_id,name,status,target_exam")
      .in("student_id", studentIds)
      .eq("status", "active")
      .is("deleted_at", null),
  ]);

  const subscriptionByStudent = new Map((subscriptions ?? []).map((s) => [s.student_id, s]));
  const planByStudent = new Map((plans ?? []).map((p) => [p.student_id, p]));

  return (profiles ?? []).map((profile) => ({
    profile,
    subscription: subscriptionByStudent.get(profile.id) ?? null,
    activePlan: planByStudent.get(profile.id) ?? null,
  }));
}

export async function getStudentSummary(teacherId: string, studentId: string) {
  const supabase = await createServerSupabaseClient();

  const [{ data: profile }, { data: plans }, { data: link }] = await Promise.all([
    supabase.from("profiles").select("id,name,contact_email,phone").eq("id", studentId).maybeSingle(),
    supabase
      .from("study_plans")
      .select("id,name,status,area,target_exam,stage,study_model,weekly_goals,start_date")
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_teacher_links")
      .select("id")
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId)
      .is("ended_at", null)
      .maybeSingle(),
  ]);

  // Sem vínculo vigente o professor não tem por que ver este aluno, mesmo que
  // a RLS deixasse passar por um planejamento antigo.
  if (!profile || !link) return null;

  return { profile, plans: plans ?? [] };
}

export async function getPlanProgress(studyPlanId: string) {
  const supabase = await createServerSupabaseClient();

  const [{ data: goals }, { data: blocks }] = await Promise.all([
    supabase
      .from("goals")
      .select("id,week_number,status")
      .eq("study_plan_id", studyPlanId)
      .is("deleted_at", null),
    supabase
      .from("vw_block_performance")
      .select("block_id,session_count,main_count,main_correct,official_score_pct,total_score_pct")
      .eq("study_plan_id", studyPlanId),
  ]);

  const list = goals ?? [];
  const completed = list.filter((g) => g.status === "completed").length;
  const weeks = [...new Set(list.map((g) => g.week_number))].sort((a, b) => a - b);

  const main = (blocks ?? []).reduce((s, b) => s + (b.main_count ?? 0), 0);
  const correct = (blocks ?? []).reduce((s, b) => s + (b.main_correct ?? 0), 0);

  return {
    goalCount: list.length,
    completed,
    pending: list.length - completed,
    weeks,
    mainQuestions: main,
    mainCorrect: correct,
    officialPct: main ? Math.round((correct / main) * 100) : null,
    blocks: blocks ?? [],
  };
}

export async function getAllTeacherPlans(teacherId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: plans } = await supabase
    .from("study_plans")
    .select("id,student_id,name,status,area,target_exam,start_date,weekly_goals")
    .eq("teacher_id", teacherId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const studentIds = [...new Set((plans ?? []).map((p) => p.student_id))];
  const { data: profiles } = studentIds.length
    ? await supabase.from("profiles").select("id,name").in("id", studentIds)
    : { data: [] };

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  return (plans ?? []).map((plan) => ({ ...plan, studentName: nameById.get(plan.student_id) ?? "—" }));
}
