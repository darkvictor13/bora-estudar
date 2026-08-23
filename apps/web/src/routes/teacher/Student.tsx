import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getPlanProgress, getStudentSummary } from "@/lib/data/teacher";
import { ROUTES } from "@/lib/routes";

const PLAN_STATUS: Record<string, { text: string; tone: "green" | "amber" | "neutral" }> = {
  active: { text: "Ativo", tone: "green" },
  draft: { text: "Rascunho", tone: "amber" },
  paused: { text: "Pausado", tone: "amber" },
  archived: { text: "Arquivado", tone: "neutral" },
};

export async function teacherStudentLoader({ params }: { params: { studentId?: string } }) {
  const session = await requireRole("teacher");
  const studentId = params.studentId ?? "";

  const summary = await getStudentSummary(session.profileId, studentId);
  // Era `notFound()` do Next. Aqui é uma Response lançada, que o
  // `ErrorBoundary` da rota transforma em tela — ver routes/RouteError.tsx.
  if (!summary) throw new Response(null, { status: 404, statusText: "Aluno não encontrado" });

  const activePlan = summary.plans.find((p) => p.status === "active") ?? null;
  const progress = activePlan ? await getPlanProgress(activePlan.id) : null;

  return { summary, activePlan, progress };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentLoader>>;

export function TeacherStudent() {
  const { summary, activePlan, progress } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader title={summary.profile.name} description={summary.profile.contact_email ?? ""} />

      <div className="stack">
        <Card
          title="Planejamentos"
          sub={`${summary.plans.length} no histórico`}
          action={
            <Link className="btn btn--ghost btn--sm" to={ROUTES.teacher.students}>
              ← Voltar
            </Link>
          }
        >
          {summary.plans.length === 0 ? (
            <Empty>Nenhum planejamento criado para este aluno.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Concurso</th>
                    <th className="num">Metas/semana</th>
                    <th>Início</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.plans.map((plan) => {
                    const status = PLAN_STATUS[plan.status] ?? {
                      text: plan.status,
                      tone: "neutral" as const,
                    };
                    return (
                      <tr key={plan.id}>
                        <td>
                          <strong>{plan.name}</strong>
                          {plan.area && <div className="muted">{plan.area}</div>}
                        </td>
                        <td>{plan.target_exam ?? "—"}</td>
                        <td className="num">{plan.weekly_goals}</td>
                        <td>{new Date(plan.start_date).toLocaleDateString("pt-BR")}</td>
                        <td>
                          <Badge tone={status.tone}>{status.text}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {progress && (
          <div className="grid-cards">
            <Card title="Metas" sub={activePlan?.name}>
              <p style={{ fontSize: "2rem", fontWeight: 700 }}>
                {progress.completed}
                <span className="muted" style={{ fontSize: "1rem" }}>
                  {" "}
                  / {progress.goalCount}
                </span>
              </p>
              <p className="muted">{progress.pending} pendentes</p>
            </Card>

            <Card title="Desempenho oficial" sub="Somente questões principais">
              <p style={{ fontSize: "2rem", fontWeight: 700 }}>
                {progress.officialPct === null ? "—" : `${progress.officialPct}%`}
              </p>
              <p className="muted">
                {progress.mainCorrect} de {progress.mainQuestions} principais
              </p>
            </Card>

            <Card title="Semanas planejadas">
              <p style={{ fontSize: "2rem", fontWeight: 700 }}>{progress.weeks.length}</p>
              <p className="muted">
                {progress.weeks.length ? `semanas ${progress.weeks.join(", ")}` : "nenhuma"}
              </p>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
