import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { QuizResultHandler } from "@/components/student/QuizResultHandler";
import { StartQuizButton } from "@/components/student/StartQuizButton";
import { CancelSessionForm, RegisterTimeForm } from "@/components/student/QuizSessionPanel";
import {
  CompleteGoalForm,
  DeleteExtraForm,
  ExtraStudyForm,
  ReopenGoalForm,
} from "@/components/student/GoalCompletion";
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

/**
 * Confirmações que chegam por query string.
 *
 * As actions de bateria devolvem `redirectTo` porque a revalidação delas
 * desmonta o formulário que mostraria a mensagem — o cartão da sessão aberta
 * some junto com o resultado da action. Quem sobrevive à revalidação é esta
 * página, então é ela que anuncia.
 */
const DONE_MESSAGE: Record<string, string> = {
  tempo: "Tempo registrado. Meta concluída.",
  cancelada: "Bateria cancelada. Ela não conta no desempenho nem como questão vista.",
  meta: "Meta concluída.",
  reaberta: "Meta reaberta. Ela voltou para pendente.",
  extra: "Estudo extra registrado.",
  "extra-removido": "Registro removido.",
};

export async function overviewLoader({ request }: { request: Request }) {
  const session = await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) return { plan: null } as const;

  const weeks = await getPlanWeeks(plan.id);
  const params = new URL(request.url).searchParams;
  const requested = Number(params.get("semana"));
  const week = weeks.includes(requested) ? requested : (weeks[0] ?? 1);
  const feito = params.get("feito");

  const [goals, performance, openSession, blocks] = await Promise.all([
    getWeekGoals(plan.id, week),
    getGoalPerformance(plan.id),
    getOpenQuizSession(plan.id),
    getStudyPlanBlocks(plan.id),
  ]);

  return {
    plan,
    weeks,
    week,
    doneMessage: feito ? (DONE_MESSAGE[feito] ?? null) : null,
    goals,
    performance,
    openSession,
    blocks,
    studentId: session.profileId,
  } as const;
}

type LoaderData = Awaited<ReturnType<typeof overviewLoader>>;

export function Overview() {
  const data = useLoaderData() as LoaderData;

  if (!data.plan) {
    return (
      <>
        <PageHeader title="Visão geral" />
        <Alert kind="info">
          Nenhum planejamento ativo. Aguarde seu professor montar e ativar um planejamento.
        </Alert>
      </>
    );
  }

  const { plan, weeks, week, doneMessage, goals, performance, openSession, blocks, studentId } =
    data;
  // Os dias que a semana já usa; o registro avulso cai num deles.
  const weekdays = [...new Set(goals.map((g) => g.weekday))].sort((a, b) => a - b);
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

      <QuizResultHandler />

      {doneMessage && <Alert kind="success">{doneMessage}</Alert>}

      {openSession && (
        <Card
          title={`Bateria ${openSession.session_number}`}
          sub={
            openSession.status === "awaiting_time"
              ? "Respondida. Falta registrar o tempo para concluir a meta."
              : "Em andamento. Continue pela extensão, no TEC."
          }
        >
          {openSession.status === "awaiting_time" ? (
            <RegisterTimeForm quizSessionId={openSession.id} />
          ) : (
            <div className="stack-sm">
              <p className="muted">
                Abra o TEC com a extensão instalada para continuar de onde parou. Se preferir
                recomeçar depois, cancele — a bateria cancelada não conta no desempenho nem como
                questão vista.
              </p>
              <div className="row">
                {openSession.goal_id && (
                  <StartQuizButton goalId={openSession.goal_id} label="Continuar no TEC" />
                )}
                <CancelSessionForm quizSessionId={openSession.id} />
              </div>
            </div>
          )}
        </Card>
      )}

      <>
        <Card
          title={`Semana ${week}`}
          sub={`${done} de ${goals.length} metas concluídas`}
          action={
            <div className="row" style={{ alignItems: "center" }}>
              {goals.length > 0 && (
                <ExtraStudyForm
                  studyPlanId={plan.id}
                  week={week}
                  weekdays={weekdays.length ? weekdays : [1, 2, 3, 4, 5]}
                />
              )}
              {weeks.length > 1 ? (
                <nav className="row" aria-label="Semanas">
                  {weeks.map((w) => (
                    <Link
                      key={w}
                      to={`${ROUTES.student.overview}?semana=${w}`}
                      className={`btn btn--sm ${w === week ? "btn--primary" : "btn--ghost"}`}
                    >
                      {w}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          }
        >
          {goals.length === 0 ? (
            <Empty>Nenhuma meta nesta semana.</Empty>
          ) : (
            <div className="stack">
              {[...byWeekday.entries()]
                .sort(([a], [b]) => a - b)
                .map(([weekday, dayGoals]) => (
                  <div key={weekday} className="stack-sm">
                    <h3>{weekdayName(weekday)}</h3>
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
                            <th />
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
                                  {goal.student_note && (
                                    <div className="muted">
                                      <em>Você anotou:</em> {goal.student_note}
                                    </div>
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
                                <td className="num">
                                  {formatMinutes(goal.planned_minutes)}
                                  {goal.spent_minutes ? (
                                    <div className="muted">
                                      feito: {formatMinutes(goal.spent_minutes)}
                                    </div>
                                  ) : null}
                                </td>
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
                                <td>
                                  {/*
                                    Meta de bateria segue pela bateria; as demais
                                    concluem por complete_goal. É a mesma divisão
                                    que a RPC impõe (R-CONC-02), então a tela
                                    nunca oferece um caminho que o banco recusa.
                                  */}
                                  {goal.type === "question_block" ? (
                                    goal.status === "pending" &&
                                    !openSession && <StartQuizButton goalId={goal.id} />
                                  ) : goal.status === "pending" ? (
                                    <CompleteGoalForm goalId={goal.id} week={week} />
                                  ) : goal.status === "completed" ? (
                                    <div className="row">
                                      <ReopenGoalForm goalId={goal.id} week={week} />
                                      {/*
                                        Remover só no registro que o PRÓPRIO
                                        aluno criou. `created_by` é o que separa
                                        isso da meta de estudo extra que o
                                        professor planejou — as duas são
                                        `extra_study` (R-EXTRA-15).
                                      */}
                                      {goal.type === "extra_study" &&
                                        goal.created_by === studentId && (
                                          <DeleteExtraForm goalId={goal.id} week={week} />
                                        )}
                                    </div>
                                  ) : null}
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
      </>
    </>
  );
}
