import { supabase } from "@/lib/supabase/client";

/**
 * Consultas do professor.
 *
 * A RLS já restringe ao contexto do professor autenticado, mas os filtros
 * explícitos por `teacher_id` permanecem: o Postgres usa o índice, e sem eles
 * a policy vira um seq scan em tabela grande.
 */

export async function getMyStudents(teacherId: string) {

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

  // Um aluno tem histórico de assinaturas: a que renovou fica ao lado das
  // antigas. Montar o Map direto guardava a última linha que o PostgREST
  // devolveu, não a vigente, e um aluno que renovou aparecia como "Expirado"
  // para o professor enquanto entrava no sistema normalmente. O aluno lê a
  // dele com `status = 'active'`; aqui precisa ser o mesmo critério.
  type Subscription = NonNullable<typeof subscriptions>[number];
  const subscriptionByStudent = new Map<string, Subscription>();
  for (const subscription of subscriptions ?? []) {
    const current = subscriptionByStudent.get(subscription.student_id);
    if (!current || (current.status !== "active" && subscription.status === "active")) {
      subscriptionByStudent.set(subscription.student_id, subscription);
    }
  }

  const planByStudent = new Map((plans ?? []).map((p) => [p.student_id, p]));

  return (profiles ?? []).map((profile) => ({
    profile,
    subscription: subscriptionByStudent.get(profile.id) ?? null,
    activePlan: planByStudent.get(profile.id) ?? null,
  }));
}

export async function getStudentSummary(teacherId: string, studentId: string) {

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

/**
 * Candidatos da lista de espera — spec 13.
 *
 * A leitura é permitida pela policy `waitlist_teacher_read`, que mostra quem
 * ainda não tem professor mais quem este professor já reivindicou. Sem ela esta
 * consulta voltaria vazia sempre: `waitlist_own` passa por `is_teacher_of`, e o
 * professor só enxerga quem já é aluno dele.
 *
 * O filtro `teacher_id is null` é explícito além da policy — a policy garante,
 * o filtro deixa a intenção legível e usa o índice.
 */
export async function getWaitlistCandidates() {
  const { data } = await supabase
    .from("waitlist")
    .select("student_id,name,email,whatsapp,interest_area,focus_exam,created_at")
    .is("teacher_id", null)
    .order("created_at");
  return data ?? [];
}

/** Assinatura vigente do aluno, para a ficha. */
export async function getStudentSubscription(studentId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("id,status,plan,validity,updated_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  const list = data ?? [];
  // Mesmo critério de getMyStudents: a vigente é a `active`, não a última que o
  // PostgREST devolveu. Um aluno que renovou tem histórico ao lado da atual.
  return list.find((s) => s.status === "active") ?? list[0] ?? null;
}
