import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import {
  getPlanProgress,
  getStudentSessions,
  getStudentSubscription,
  getStudentSummary,
} from "@/lib/data/teacher";
import {
  getReviewCompletions,
  getReviewSpacings,
  getStudyPlanBlocks,
  getTopicDifficulty,
} from "@/lib/data/student";
import { SpacingForms } from "@/components/teacher/SpacingForms";
import { ReviewGrid } from "@/components/ReviewGrid";
import { buildGrid } from "@/lib/domain/spacing";
import { GrantAccessForm, SuspendAccessForm } from "@/components/teacher/AccessForms";
import { VoidSessionForm } from "@/components/teacher/VoidSessionForm";
import { TopicDifficulty } from "@/components/TopicDifficulty";
import { QUIZ_STATUS_LABEL, formatMinutes, scorePercent } from "@/lib/domain/goals";
import { ROUTES } from "@/lib/routes";

/** Confirmação por query string: a linha muda de situação e o botão some. */
const DONE_MESSAGE: Record<string, string> = {
  anulada: "Bateria anulada. A meta voltou a pendente e as questões voltaram a ser inéditas.",
  suspenso: "Acesso suspenso. O aluno volta para a lista de espera.",
  espacamento: "Espaçamento salvo. A grade de revisão do aluno já reflete a mudança.",
  revisao: "Revisão marcada como feita.",
  "revisao-desfeita": "Revisão desmarcada.",
};

/** Só bateria finalizada é anulável — espelha R-ANUL-03, que a RPC impõe. */
const VOIDABLE = new Set(["completed", "awaiting_time"]);

const QUIZ_TONE: Record<string, "green" | "amber" | "blue" | "neutral" | "red"> = {
  completed: "green",
  awaiting_time: "amber",
  in_progress: "blue",
  cancelled: "neutral",
  voided: "red",
};

const ACCESS_LABEL: Record<string, string> = {
  active: "ativa",
  pending: "aguardando liberação",
  suspended: "suspensa",
  expired: "expirada",
};

/**
 * `daterange` chega como texto do PostgREST: `[2026-08-30,2026-11-30)`.
 * Mostrar a data final é o que a v96 fazia no badge "Acesso ativo · até
 * DD/MM/AAAA", e é o que responde "até quando" sem abrir o banco.
 *
 * O parâmetro é `unknown` porque é assim que `supabase gen types` mapeia
 * `daterange` — não existe tipo TypeScript para ele. A checagem em runtime é o
 * que transforma isso em algo seguro de renderizar.
 */
function formatValidity(validity: unknown): string {
  if (typeof validity !== "string") return "";
  const match = validity.match(/^[[(]([^,]*),([^)\]]*)[)\]]$/);
  if (!match) return validity;
  const [, inicio, fim] = match;
  const br = (iso: string) =>
    iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "sem fim";
  return `${br(inicio ?? "")} até ${br(fim ?? "")}`;
}

const PLAN_STATUS: Record<string, { text: string; tone: "green" | "amber" | "neutral" }> = {
  active: { text: "Ativo", tone: "green" },
  draft: { text: "Rascunho", tone: "amber" },
  paused: { text: "Pausado", tone: "amber" },
  archived: { text: "Arquivado", tone: "neutral" },
};

export async function teacherStudentLoader({
  params,
  request,
}: {
  params: { studentId?: string };
  request: Request;
}) {
  const session = await requireRole("teacher");
  const studentId = params.studentId ?? "";

  const summary = await getStudentSummary(session.profileId, studentId);
  // Era `notFound()` do Next. Aqui é uma Response lançada, que o
  // `ErrorBoundary` da rota transforma em tela — ver routes/RouteError.tsx.
  if (!summary) throw new Response(null, { status: 404, statusText: "Aluno não encontrado" });

  const activePlan = summary.plans.find((p) => p.status === "active") ?? null;
  const [progress, subscription, sessions, topics, blocks, spacings, reviewsDone] = await Promise.all([
    activePlan ? getPlanProgress(activePlan.id) : Promise.resolve(null),
    getStudentSubscription(studentId),
    getStudentSessions(studentId),
    activePlan ? getTopicDifficulty(activePlan.id) : Promise.resolve([]),
    activePlan ? getStudyPlanBlocks(activePlan.id) : Promise.resolve([]),
    activePlan ? getReviewSpacings(activePlan.id) : Promise.resolve([]),
    activePlan ? getReviewCompletions(activePlan.id) : Promise.resolve(new Set<string>()),
  ]);

  // Toda disciplina do planejamento aparece na tabela de espaçamento, inclusive
  // a que ainda não tem linha: é aqui que o professor a liga (R-REVE-19).
  const subjects = new Map<string, { firstInterval: number; secondInterval: number; blockCount: number }>();
  for (const block of blocks) {
    const current = subjects.get(block.subject_name) ?? {
      firstInterval: 0,
      secondInterval: 0,
      blockCount: 0,
    };
    subjects.set(block.subject_name, { ...current, blockCount: current.blockCount + 1 });
  }
  for (const spacing of spacings) {
    const current = subjects.get(spacing.subject_name);
    if (!current) continue;
    subjects.set(spacing.subject_name, {
      ...current,
      firstInterval: spacing.first_interval,
      secondInterval: spacing.second_interval,
    });
  }

  const feito = new URL(request.url).searchParams.get("feito");

  return {
    summary,
    activePlan,
    progress,
    subscription,
    sessions,
    topics,
    blockNames: blocks.map((b) => [b.id, b.name] as const),
    spacings: [...subjects].map(([subject, value]) => ({ subject, ...value })),
    grids: buildGrid(spacings, blocks, reviewsDone),
    teacherId: session.profileId,
    studyPlanId: activePlan?.id ?? null,
    studentId,
    doneMessage: feito ? (DONE_MESSAGE[feito] ?? null) : null,
  };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentLoader>>;

export function TeacherStudent() {
  const {
    summary,
    activePlan,
    progress,
    subscription,
    sessions,
    topics,
    blockNames,
    spacings,
    grids,
    teacherId,
    studyPlanId,
    studentId,
    doneMessage,
  } = useLoaderData() as LoaderData;
  const hasActive = subscription?.status === "active";

  return (
    <>
      <PageHeader title={summary.profile.name} description={summary.profile.contact_email ?? ""} />

      {doneMessage && <Alert kind="success">{doneMessage}</Alert>}

      <div className="stack">
        <Card
          title="Acesso"
          sub={
            hasActive
              ? `Ativo${formatValidity(subscription?.validity) ? ` · vigência ${formatValidity(subscription?.validity)}` : ""}`
              : subscription
                ? `Sem acesso ativo · última assinatura ${ACCESS_LABEL[subscription.status] ?? subscription.status}`
                : "Este aluno nunca teve acesso liberado"
          }
        >
          <div className="row" style={{ alignItems: "flex-end", gap: 16 }}>
            <GrantAccessForm studentId={studentId} hasActive={hasActive} />
            {hasActive && <SuspendAccessForm studentId={studentId} />}
          </div>
        </Card>

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

        <Card
          title="Baterias"
          sub={`${sessions.length} no histórico — a mais recente primeiro`}
        >
          {sessions.length === 0 ? (
            <Empty>Este aluno ainda não fez nenhuma bateria.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bloco</th>
                    <th className="num">Nº</th>
                    <th className="num">Oficial</th>
                    <th className="num">Tempo</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    const pct = scorePercent(session.mainCorrect, session.mainCount);
                    return (
                      <tr key={session.id}>
                        <td>
                          <strong style={{ color: session.block?.subject_color }}>
                            {session.block?.subject_name ?? "—"}
                          </strong>
                          <div className="muted">{session.block?.name ?? "—"}</div>
                          {session.void_reason && (
                            <div className="muted">
                              <em>Motivo:</em> {session.void_reason}
                            </div>
                          )}
                        </td>
                        <td className="num">{session.session_number ?? "—"}</td>
                        <td className="num">
                          {session.mainCount ? (
                            <>
                              {session.mainCorrect}/{session.mainCount}
                              {pct !== null && <span className="muted"> · {pct}%</span>}
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">{formatMinutes(session.duration_minutes)}</td>
                        <td>
                          <Badge tone={QUIZ_TONE[session.status] ?? "neutral"}>
                            {QUIZ_STATUS_LABEL[session.status]}
                          </Badge>
                        </td>
                        <td>
                          {VOIDABLE.has(session.status) && (
                            <VoidSessionForm
                              quizSessionId={session.id}
                              studentId={studentId}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <TopicDifficulty rows={topics} blockNames={new Map(blockNames)} />

        {studyPlanId && (
          <>
            <SpacingForms
              spacings={spacings}
              studyPlanId={studyPlanId}
              studentId={studentId}
              teacherId={teacherId}
            />
            <ReviewGrid
              grids={grids}
              studyPlanId={studyPlanId}
              redirectTo={ROUTES.teacher.student(studentId)}
              emptyHint="Nenhuma disciplina com revisão programada. Defina o espaçamento acima."
              emptyTitle="Grade de revisão"
            />
          </>
        )}

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
