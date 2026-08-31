import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import {
  getActiveStudyPlan,
  getBlockPerformance,
  getBlockTopics,
  getOpenQuizSession,
  getPendingQuizGoals,
  getStudyPlanBlocks,
} from "@/lib/data/student";
import { StartQuizButton } from "@/components/student/StartQuizButton";
import { oldestPendingGoalOf } from "@/lib/domain/goals";
import { BlockTopics } from "@/components/SessionTopics";

export async function studentNotebooksLoader() {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) return { plan: null } as const;

  const [blocks, performance, pendingGoals, openSession] = await Promise.all([
    getStudyPlanBlocks(plan.id),
    getBlockPerformance(plan.id),
    getPendingQuizGoals(plan.id),
    getOpenQuizSession(plan.id),
  ]);
  const topics = await getBlockTopics(
    blocks.map((b) => b.catalog_block_id).filter((id) => id !== null),
  );
  // O Map não sobrevive à serialização do loader; a lista de pares, sim.
  return {
    plan,
    blocks,
    performance,
    topics: [...topics.entries()],
    pendingGoals,
    openSession,
  } as const;
}

type LoaderData = Awaited<ReturnType<typeof studentNotebooksLoader>>;

export function StudentNotebooks() {
  const data = useLoaderData() as LoaderData;

  if (!data.plan) {
    return (
      <>
        <PageHeader title="Cadernos TEC" />
        <Alert kind="info">Nenhum planejamento ativo.</Alert>
      </>
    );
  }

  const { blocks, pendingGoals, openSession } = data;
  const perfById = new Map(data.performance.map((p) => [p.block_id, p]));
  const topicsByCatalog = new Map(data.topics);

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
        <>
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
                      <th>Bateria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((block) => {
                      const perf = perfById.get(block.id);
                      const proximaMeta = oldestPendingGoalOf(pendingGoals, block.id);
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
                            {block.catalog_block_id && (
                              <BlockTopics
                                topics={topicsByCatalog.get(block.catalog_block_id) ?? []}
                              />
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
                          <td className="acao">
                            {/* Só existe UMA bateria aberta por planejamento, e
                                `start_quiz_session` recusa a segunda: com uma
                                aberta, todo bloco aponta para ela. Esconder isso
                                deixaria o aluno clicando num botão que só
                                levanta erro. */}
                            {openSession ? (
                              openSession.status === "awaiting_time" ? (
                                <Link to={ROUTES.student.overview}>Registrar tempo</Link>
                              ) : openSession.goal_id ? (
                                <StartQuizButton
                                  goalId={openSession.goal_id}
                                  label="Continuar no TEC"
                                />
                              ) : null
                            ) : !block.active ? (
                              <span className="muted">Bloco desativado</span>
                            ) : proximaMeta ? (
                              <StartQuizButton goalId={proximaMeta.id} />
                            ) : (
                              <span className="muted">Sem meta pendente</span>
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
        </>
      )}
    </>
  );
}
