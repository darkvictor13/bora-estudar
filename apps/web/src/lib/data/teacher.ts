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

/** Catálogos ativos, para materializar os blocos de um planejamento novo. */
export async function getActiveCatalogs() {
  const { data } = await supabase.from("catalogs").select("key,name").eq("active", true).order("name");
  return data ?? [];
}

/**
 * Blocos ativos de um catálogo, na ordem em que vão para o planejamento.
 *
 * A ordenação por `subject_name` e depois `number` é a mesma que decide
 * `subject_order` e `block_order` — e é `study_plan_block_order_uidx` que exige
 * o par ser único dentro do planejamento.
 */
export async function getCatalogBlocks(catalogKey: string) {
  const { data } = await supabase
    .from("catalog_blocks")
    .select("id,name,subject_name,number,question_count")
    .eq("catalog_key", catalogKey)
    .eq("active", true)
    .order("subject_name")
    .order("number");
  return data ?? [];
}

/**
 * Todos os blocos do planejamento, **incluindo os excluídos**, com quantas
 * metas cada um tem.
 *
 * Diferente de `getStudyPlanBlocks`, que filtra `deleted_at is null` porque
 * serve às telas do aluno. Aqui os excluídos precisam aparecer no recorte
 * "Excluídos", e a contagem de metas é o que decide se excluir é oferecido
 * (R-CAD-04).
 */
export async function getPlanBlocksForManagement(studyPlanId: string) {
  const [{ data: blocks }, { data: goals }] = await Promise.all([
    supabase
      .from("study_plan_blocks")
      .select(
        "id,name,subject_name,subject_color,subject_target,question_count,link,active,deleted_at,subject_order,block_order,catalog_block_id",
      )
      .eq("study_plan_id", studyPlanId)
      .order("subject_order")
      .order("block_order"),
    supabase
      .from("goals")
      .select("block_id")
      .eq("study_plan_id", studyPlanId)
      .is("deleted_at", null)
      .not("block_id", "is", null),
  ]);

  const goalsByBlock = new Map<string, number>();
  for (const goal of goals ?? []) {
    if (goal.block_id) goalsByBlock.set(goal.block_id, (goalsByBlock.get(goal.block_id) ?? 0) + 1);
  }

  return (blocks ?? []).map((block) => ({ ...block, goalCount: goalsByBlock.get(block.id) ?? 0 }));
}

/**
 * Baterias do aluno, da mais recente para a mais antiga.
 *
 * A leitura é permitida por `quiz_sessions_read`, que usa
 * `can_view_context(student_id, teacher_id)` — o professor já enxerga. O
 * desempenho vem de `vw_quiz_session_performance`, nunca recalculado aqui
 * (R-ANUL-10).
 *
 * Ordena por `execution_sequence`, e não por data: duas baterias criadas no
 * mesmo instante empatariam em `started_at`, e a sequência é sequencial por
 * construção. É o mesmo critério de `openSessionOf` nas fixtures do e2e.
 */
export async function getStudentSessions(studentId: string) {
  const { data: sessions } = await supabase
    .from("quiz_sessions")
    .select(
      "id,block_id,goal_id,session_number,execution_sequence,status,main_target,duration_minutes,started_at,void_reason",
    )
    .eq("student_id", studentId)
    .order("execution_sequence", { ascending: false });

  const list = sessions ?? [];
  if (!list.length) return [];

  const [{ data: performance }, { data: blocks }] = await Promise.all([
    supabase
      .from("vw_quiz_session_performance")
      .select("quiz_session_id,main_count,main_correct")
      .in(
        "quiz_session_id",
        list.map((s) => s.id),
      ),
    supabase
      .from("study_plan_blocks")
      .select("id,name,subject_name,subject_color")
      .in("id", [...new Set(list.map((s) => s.block_id))]),
  ]);

  const perfById = new Map((performance ?? []).map((p) => [p.quiz_session_id, p]));
  const blockById = new Map((blocks ?? []).map((b) => [b.id, b]));

  return list.map((session) => ({
    ...session,
    block: blockById.get(session.block_id) ?? null,
    mainCount: perfById.get(session.id)?.main_count ?? 0,
    mainCorrect: perfById.get(session.id)?.main_correct ?? 0,
  }));
}

/**
 * Os alunos do professor, com progresso e desempenho — spec 17.
 *
 * **Duas consultas para todos, nunca duas por aluno.** Com trinta alunos, uma
 * consulta por aluno seriam sessenta idas ao servidor por carga de página. As
 * metas e o desempenho de todos os planejamentos ativos vêm de uma vez e são
 * casados em memória.
 */
export async function getMyStudentsWithProgress(teacherId: string) {
  const students = await getMyStudents(teacherId);
  if (!students.length) return [];

  const planIds = students.map((s) => s.activePlan?.id).filter((id): id is string => !!id);

  const [{ data: goals }, { data: performance }] = planIds.length
    ? await Promise.all([
        supabase
          .from("goals")
          .select("study_plan_id,status")
          .in("study_plan_id", planIds)
          .is("deleted_at", null),
        supabase
          .from("vw_block_performance")
          .select("study_plan_id,main_count,main_correct")
          .in("study_plan_id", planIds),
      ])
    : [{ data: [] }, { data: [] }];

  const byPlan = new Map<string, { goalCount: number; completed: number; mainCount: number; mainCorrect: number }>();
  const of = (planId: string) => {
    const current = byPlan.get(planId) ?? {
      goalCount: 0,
      completed: 0,
      mainCount: 0,
      mainCorrect: 0,
    };
    byPlan.set(planId, current);
    return current;
  };

  for (const goal of goals ?? []) {
    const entry = of(goal.study_plan_id);
    entry.goalCount += 1;
    if (goal.status === "completed") entry.completed += 1;
  }
  for (const row of performance ?? []) {
    // `study_plan_id` da view é nullable no tipo gerado — a view sai de um
    // left join —, mas toda linha que a consulta devolve tem plano, porque o
    // filtro é `in (planIds)`.
    if (!row.study_plan_id) continue;
    const entry = of(row.study_plan_id);
    entry.mainCount += row.main_count ?? 0;
    entry.mainCorrect += row.main_correct ?? 0;
  }

  return students.map((student) => ({
    ...student,
    progress: student.activePlan
      ? (byPlan.get(student.activePlan.id) ?? {
          goalCount: 0,
          completed: 0,
          mainCount: 0,
          mainCorrect: 0,
        })
      : { goalCount: 0, completed: 0, mainCount: 0, mainCorrect: 0 },
  }));
}

/**
 * Quantas metas de bateria cada bloco já tem no planejamento — spec 18.
 *
 * É o ponto de partida do rodízio: sem ele, toda semana recomeçaria no primeiro
 * bloco de cada disciplina (R-PREV-08). Conta todas as semanas não excluídas.
 */
export async function countGoalsPerBlock(studyPlanId: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("goals")
    .select("block_id")
    .eq("study_plan_id", studyPlanId)
    .eq("type", "question_block")
    .is("deleted_at", null)
    .not("block_id", "is", null);

  const counts = new Map<string, number>();
  for (const goal of data ?? []) {
    if (goal.block_id) counts.set(goal.block_id, (counts.get(goal.block_id) ?? 0) + 1);
  }
  return counts;
}
