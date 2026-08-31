import { Link, useLoaderData } from "react-router";

import { Card, Empty, PageHeader } from "@/components/ui";
import { GenerateWeekForm } from "@/components/teacher/GenerateWeekForm";
import { requireRole } from "@/lib/auth/session";
import { countGoalsPerBlock, getAllTeacherPlans, getPlanProgress } from "@/lib/data/teacher";
import { supabase } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/routes";

export async function teacherGoalsLoader({ request }: { request: Request }) {
  const session = await requireRole("teacher");
  const plans = await getAllTeacherPlans(session.profileId);

  const requested = new URL(request.url).searchParams.get("plano");
  const selectedId =
    requested && plans.some((p) => p.id === requested)
      ? requested
      : (plans.find((p) => p.status === "active")?.id ?? plans[0]?.id ?? null);

  if (!selectedId) return { plans, selectedId: null } as const;

  const [{ data: blocks }, progress, used] = await Promise.all([
    supabase
      .from("study_plan_blocks")
      .select("id,name,subject_name,subject_order,block_order")
      .eq("study_plan_id", selectedId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("subject_order")
      .order("block_order"),
    getPlanProgress(selectedId),
    // Ponto de partida do rodízio, para a prévia mostrar o mesmo bloco que a
    // gravação vai escolher (R-PREV-08 e R-PREV-14).
    countGoalsPerBlock(selectedId),
  ]);

  return {
    plans,
    selectedId,
    blocks: (blocks ?? []).map((block) => ({ ...block, used: used.get(block.id) ?? 0 })),
    progress,
  } as const;
}

type LoaderData = Awaited<ReturnType<typeof teacherGoalsLoader>>;

export function TeacherGoals() {
  const data = useLoaderData() as LoaderData;

  if (!data.selectedId) {
    return (
      <>
        <PageHeader title="Gerar metas" />
        <Empty>Nenhum planejamento criado. Crie um planejamento antes de gerar metas.</Empty>
      </>
    );
  }

  const { plans, selectedId, blocks, progress } = data;
  const selected = plans.find((p) => p.id === selectedId)!;
  const nextWeek = (progress.weeks.at(-1) ?? 0) + 1;

  return (
    <>
      <PageHeader
        title="Gerar metas"
        description="Distribui os blocos escolhidos pelos dias marcados, em rodízio. Reenviar o mesmo lote não duplica a semana."
      />

      <>
        <Card title="Planejamento">
          <nav className="row" aria-label="Planejamentos">
            {plans.map((plan) => (
              <Link
                key={plan.id}
                to={`${ROUTES.teacher.goals}?plano=${plan.id}`}
                className={`btn btn--sm ${plan.id === selectedId ? "btn--primary" : "btn--ghost"}`}
              >
                {plan.studentName} · {plan.name}
              </Link>
            ))}
          </nav>
        </Card>

        <Card
          title={`${selected.studentName} — ${selected.name}`}
          sub={
            progress.weeks.length
              ? `Semanas já planejadas: ${progress.weeks.join(", ")}`
              : "Nenhuma semana planejada ainda"
          }
        >
          {blocks.length === 0 ? (
            <Empty>Este planejamento não tem blocos ativos. Configure os cadernos primeiro.</Empty>
          ) : (
            <GenerateWeekForm
              studyPlanId={selectedId}
              nextWeek={nextWeek}
              blocks={blocks.map((b) => ({
                id: b.id,
                name: b.name,
                subjectName: b.subject_name,
                used: b.used,
              }))}
            />
          )}
        </Card>
      </>
    </>
  );
}
