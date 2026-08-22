import type { Metadata } from "next";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import { getActiveStudyPlan, getBlockPerformance, getStudyPlanBlocks } from "@/lib/data/student";

export const metadata: Metadata = { title: "Cadernos TEC · Bora Estudar" };

export default async function StudentNotebooksPage() {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) {
    return (
      <>
        <PageHeader title="Cadernos TEC" />
        <Alert kind="info">Nenhum planejamento ativo.</Alert>
      </>
    );
  }

  const [blocks, performance] = await Promise.all([
    getStudyPlanBlocks(plan.id),
    getBlockPerformance(plan.id),
  ]);
  const perfById = new Map(performance.map((p) => [p.block_id, p]));

  const bySubject = new Map<string, typeof blocks>();
  for (const block of blocks) {
    const list = bySubject.get(block.subject_name) ?? [];
    list.push(block);
    bySubject.set(block.subject_name, list);
  }

  return (
    <>
      <PageHeader
        title="Cadernos TEC"
        description="Blocos do seu planejamento, na ordem definida pelo professor."
      />

      {blocks.length === 0 ? (
        <Empty>Nenhum caderno configurado neste planejamento.</Empty>
      ) : (
        <div className="stack">
          {[...bySubject.entries()].map(([subject, list]) => (
            <Card key={subject} title={subject} sub={`${list.length} bloco(s)`}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bloco</th>
                      <th className="num">Questões</th>
                      <th className="num">Meta</th>
                      <th className="num">Desempenho</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((block) => {
                      const perf = perfById.get(block.id);
                      const pct = perf?.official_score_pct ?? null;
                      const reachedTarget = pct !== null && pct >= block.subject_target;
                      return (
                        <tr key={block.id}>
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
                          <td className="num">{pct === null ? "—" : `${pct}%`}</td>
                          <td>
                            {!block.active ? (
                              <Badge>Desativado</Badge>
                            ) : pct === null ? (
                              <Badge tone="neutral">Não iniciado</Badge>
                            ) : reachedTarget ? (
                              <Badge tone="green">Na meta</Badge>
                            ) : (
                              <Badge tone="amber">Abaixo da meta</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
