import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getAllTeacherPlans } from "@/lib/data/teacher";
import { supabase } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/routes";

export async function teacherNotebooksLoader({ request }: { request: Request }) {
  const session = await requireRole("teacher");
  const plans = await getAllTeacherPlans(session.profileId);

  const requested = new URL(request.url).searchParams.get("plano");
  const selectedId =
    requested && plans.some((p) => p.id === requested)
      ? requested
      : (plans.find((p) => p.status === "active")?.id ?? plans[0]?.id ?? null);

  const { data: blocks } = selectedId
    ? await supabase
        .from("study_plan_blocks")
        .select(
          "id,name,subject_name,subject_color,subject_target,question_count,link,active,subject_order,block_order",
        )
        .eq("study_plan_id", selectedId)
        .is("deleted_at", null)
        .order("subject_order")
        .order("block_order")
    : { data: [] };

  return { plans, selectedId, blocks: blocks ?? [] };
}

type LoaderData = Awaited<ReturnType<typeof teacherNotebooksLoader>>;

export function TeacherNotebooks() {
  const { plans, selectedId, blocks } = useLoaderData() as LoaderData;
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <PageHeader title="Cadernos" description="Blocos configurados em cada planejamento." />

      {plans.length === 0 ? (
        <Empty>Nenhum planejamento criado.</Empty>
      ) : (
        <div className="stack">
          <Card title="Planejamento">
            <nav className="row" aria-label="Planejamentos">
              {plans.map((plan) => (
                <Link
                  key={plan.id}
                  to={`${ROUTES.teacher.notebooks}?plano=${plan.id}`}
                  className={`btn btn--sm ${plan.id === selectedId ? "btn--primary" : "btn--ghost"}`}
                >
                  {plan.studentName} · {plan.name}
                </Link>
              ))}
            </nav>
          </Card>

          <Card
            title={selected ? `${selected.studentName} — ${selected.name}` : "Blocos"}
            sub={`${blocks.length} bloco(s)`}
          >
            {blocks.length === 0 ? (
              <Empty>Nenhum bloco neste planejamento.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Disciplina</th>
                      <th>Bloco</th>
                      <th className="num">Questões</th>
                      <th className="num">Meta</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((block) => (
                      <tr key={block.id}>
                        <td style={{ color: block.subject_color }}>{block.subject_name}</td>
                        <td>
                          {block.link ? (
                            <a href={block.link} target="_blank" rel="noreferrer">
                              {block.name}
                            </a>
                          ) : (
                            block.name
                          )}
                        </td>
                        <td className="num">{block.question_count || "—"}</td>
                        <td className="num">{block.subject_target}%</td>
                        <td>
                          {block.active ? (
                            <Badge tone="green">Ativo</Badge>
                          ) : (
                            <Badge>Desativado</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
