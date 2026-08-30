import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getPlanProgress, getStudentSubscription, getStudentSummary } from "@/lib/data/teacher";
import { GrantAccessForm, SuspendAccessForm } from "@/components/teacher/AccessForms";
import { ROUTES } from "@/lib/routes";

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

export async function teacherStudentLoader({ params }: { params: { studentId?: string } }) {
  const session = await requireRole("teacher");
  const studentId = params.studentId ?? "";

  const summary = await getStudentSummary(session.profileId, studentId);
  // Era `notFound()` do Next. Aqui é uma Response lançada, que o
  // `ErrorBoundary` da rota transforma em tela — ver routes/RouteError.tsx.
  if (!summary) throw new Response(null, { status: 404, statusText: "Aluno não encontrado" });

  const activePlan = summary.plans.find((p) => p.status === "active") ?? null;
  const [progress, subscription] = await Promise.all([
    activePlan ? getPlanProgress(activePlan.id) : Promise.resolve(null),
    getStudentSubscription(studentId),
  ]);

  return { summary, activePlan, progress, subscription, studentId };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentLoader>>;

export function TeacherStudent() {
  const { summary, activePlan, progress, subscription, studentId } = useLoaderData() as LoaderData;
  const hasActive = subscription?.status === "active";

  return (
    <>
      <PageHeader title={summary.profile.name} description={summary.profile.contact_email ?? ""} />

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
