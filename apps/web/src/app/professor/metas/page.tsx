import type { Metadata } from "next";

import { Card, Empty, PageHeader } from "@/components/ui";
import { GenerateWeekForm } from "@/components/teacher/GenerateWeekForm";
import { requireRole } from "@/lib/auth/session";
import { getAllTeacherPlans, getPlanProgress } from "@/lib/data/teacher";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gerar metas · Bora Estudar" };

export default async function TeacherGoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>;
}) {
  const session = await requireRole("teacher");
  const plans = await getAllTeacherPlans(session.profileId);

  const params = await searchParams;
  const selectedId =
    params.plano && plans.some((p) => p.id === params.plano)
      ? params.plano
      : (plans.find((p) => p.status === "active")?.id ?? plans[0]?.id ?? null);

  if (!selectedId) {
    return (
      <>
        <PageHeader title="Gerar metas" />
        <Empty>Nenhum planejamento criado. Crie um planejamento antes de gerar metas.</Empty>
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: blocks }, progress] = await Promise.all([
    supabase
      .from("study_plan_blocks")
      .select("id,name,subject_name,subject_order,block_order")
      .eq("study_plan_id", selectedId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("subject_order")
      .order("block_order"),
    getPlanProgress(selectedId),
  ]);

  const selected = plans.find((p) => p.id === selectedId)!;
  const nextWeek = (progress.weeks.at(-1) ?? 0) + 1;

  return (
    <>
      <PageHeader
        title="Gerar metas"
        description="Distribui os blocos escolhidos pelos dias marcados, em rodízio. Reenviar o mesmo lote não duplica a semana."
      />

      <div className="stack">
        <Card title="Planejamento">
          <nav className="row" aria-label="Planejamentos">
            {plans.map((plan) => (
              <a
                key={plan.id}
                href={`?plano=${plan.id}`}
                className={`btn btn--sm ${plan.id === selectedId ? "btn--primary" : "btn--ghost"}`}
              >
                {plan.studentName} · {plan.name}
              </a>
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
          {(blocks ?? []).length === 0 ? (
            <Empty>Este planejamento não tem blocos ativos. Configure os cadernos primeiro.</Empty>
          ) : (
            <GenerateWeekForm
              studyPlanId={selectedId}
              nextWeek={nextWeek}
              blocks={(blocks ?? []).map((b) => ({
                id: b.id,
                name: b.name,
                subjectName: b.subject_name,
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}
