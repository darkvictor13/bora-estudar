import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getAllTeacherPlans } from "@/lib/data/teacher";
import { ROUTES } from "@/lib/routes";

const TONE: Record<string, "green" | "amber" | "neutral"> = {
  active: "green",
  draft: "amber",
  paused: "amber",
  archived: "neutral",
};

const LABEL: Record<string, string> = {
  active: "Ativo",
  draft: "Rascunho",
  paused: "Pausado",
  archived: "Arquivado",
};

export async function teacherPlansLoader() {
  const session = await requireRole("teacher");
  return { plans: await getAllTeacherPlans(session.profileId) };
}

type LoaderData = Awaited<ReturnType<typeof teacherPlansLoader>>;

export function TeacherPlans() {
  const { plans } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Planejamentos"
        description="Um planejamento ativo por aluno — garantido por índice único no banco."
      />

      {plans.length === 0 ? (
        <Empty>Nenhum planejamento criado.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Planejamento</th>
                  <th>Concurso</th>
                  <th className="num">Metas/semana</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.studentName}</strong>
                    </td>
                    <td>{plan.name}</td>
                    <td className="muted">{plan.target_exam ?? "—"}</td>
                    <td className="num">{plan.weekly_goals}</td>
                    <td>
                      <Badge tone={TONE[plan.status] ?? "neutral"}>
                        {LABEL[plan.status] ?? plan.status}
                      </Badge>
                    </td>
                    <td>
                      <Link className="btn btn--ghost btn--sm" to={ROUTES.teacher.student(plan.student_id)}>
                        Abrir aluno
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
