import Link from "next/link";
import type { Metadata } from "next";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import {
  getActiveStudyPlan,
  getGoalPerformance,
  getOpenQuizSession,
  getPlanWeeks,
  getStudyPlanBlocks,
  getWeekGoals,
} from "@/lib/data/student";
import {
  GOAL_TYPE_LABEL,
  GOAL_STATUS_LABEL,
  formatMinutes,
  goalStatusTone,
  scorePercent,
  weekdayName,
} from "@/lib/domain/goals";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Visão geral · Bora Estudar" };

export default async function StudentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) {
    return (
      <>
        <PageHeader title="Visão geral" />
        <Alert kind="info">
          Nenhum planejamento ativo. Aguarde seu professor montar e ativar um planejamento.
        </Alert>
      </>
    );
  }

  const weeks = await getPlanWeeks(plan.id);
  const params = await searchParams;
  const requested = Number(params.semana);
  const week = weeks.includes(requested) ? requested : (weeks[0] ?? 1);

  const [goals, performance, openSession, blocks] = await Promise.all([
    getWeekGoals(plan.id, week),
    getGoalPerformance(plan.id),
    getOpenQuizSession(plan.id),
    getStudyPlanBlocks(plan.id),
  ]);
  const blockById = new Map(blocks.map((b) => [b.id, b]));

  const byWeekday = new Map<number, typeof goals>();
  for (const goal of goals) {
    const list = byWeekday.get(goal.weekday) ?? [];
    list.push(goal);
    byWeekday.set(goal.weekday, list);
  }

  const done = goals.filter((g) => g.status === "completed").length;

  return (
    <>
      <PageHeader
        title="Visão geral"
        description={`${plan.name}${plan.target_exam ? ` · ${plan.target_exam}` : ""}`}
      />

      {openSession && (
        <Alert kind={openSession.status === "awaiting_time" ? "warning" : "info"}>
          {openSession.status === "awaiting_time" ? (
            <>
              A bateria {openSession.session_number} já foi respondida. Falta registrar o tempo para
              concluir a meta.
            </>
          ) : (
            <>Bateria {openSession.session_number} em andamento. Continue pela extensão no TEC.</>
          )}
        </Alert>
      )}

      <div className="stack">
        <Card
          title={`Semana ${week}`}
          sub={`${done} de ${goals.length} metas concluídas`}
          action={
            weeks.length > 1 ? (
              <nav className="row" aria-label="Semanas">
                {weeks.map((w) => (
                  <Link
                    key={w}
                    href={`${ROUTES.student.overview}?semana=${w}`}
                    className={`btn btn--sm ${w === week ? "btn--primary" : "btn--ghost"}`}
                  >
                    {w}
                  </Link>
                ))}
              </nav>
            ) : null
          }
        >
          {goals.length === 0 ? (
            <Empty>Nenhuma meta nesta semana.</Empty>
          ) : (
            <div className="stack">
              {[...byWeekday.entries()]
                .sort(([a], [b]) => a - b)
                .map(([weekday, dayGoals]) => (
                  <div key={weekday}>
                    <h3 style={{ marginBottom: 8 }}>{weekdayName(weekday)}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Meta</th>
                            <th>Tipo</th>
                            <th>Bloco</th>
                            <th className="num">Previsto</th>
                            <th className="num">Resultado</th>
                            <th>Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dayGoals.map((goal) => {
                            const perf = performance.get(goal.id);
                            const pct = perf
                              ? scorePercent(perf.correct_answers ?? 0, perf.questions_answered ?? 0)
                              : null;
                            const block = goal.block_id ? blockById.get(goal.block_id) : null;
                            return (
                              <tr key={goal.id}>
                                <td>
                                  <strong>{goal.title}</strong>
                                  {goal.teacher_note && (
                                    <div className="muted">{goal.teacher_note}</div>
                                  )}
                                </td>
                                <td>{GOAL_TYPE_LABEL[goal.type]}</td>
                                <td>
                                  {block ? (
                                    <span style={{ color: block.subject_color }}>
                                      {block.subject_name}
                                    </span>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                                <td className="num">{formatMinutes(goal.planned_minutes)}</td>
                                <td className="num">
                                  {perf && perf.questions_answered ? (
                                    <>
                                      {perf.correct_answers}/{perf.questions_answered}
                                      {pct !== null && <span className="muted"> · {pct}%</span>}
                                    </>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                                <td>
                                  <Badge tone={goalStatusTone(goal.status)}>
                                    {GOAL_STATUS_LABEL[goal.status]}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
