import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import {
  getActiveStudyPlan,
  getBlockErrors,
  getBlockPerformance,
  getCompletedSessions,
  getCycleErrors,
  getReviewCycles,
  getStudyPlanBlocks,
  getUsedSessions,
} from "@/lib/data/student";
import { ReinforcementForm } from "@/components/student/ReinforcementForm";
import { buildCycles } from "@/lib/domain/reinforcement";
import { ROUTES } from "@/lib/routes";

const PHASE_LABEL: Record<string, string> = {
  main: "principal",
  extra: "extra",
  reinforcement: "reforço",
};

/** Confirmação por query string: o ciclo some da lista com a revalidação. */
const DONE_MESSAGE: Record<string, string> = {
  reforco: "Reforço concluído. O ciclo foi revisado e saiu da lista.",
};

export async function studentReviewsLoader({ request }: { request: Request }) {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) return { plan: null } as const;

  const [blocks, performance] = await Promise.all([
    getStudyPlanBlocks(plan.id),
    getBlockPerformance(plan.id),
  ]);
  const blockIds = blocks.map((b) => b.id);
  const [cycles, used] = await Promise.all([getReviewCycles(blockIds), getUsedSessions(blockIds)]);

  const params = new URL(request.url).searchParams;
  const requested = params.get("bloco");
  const selectedId = requested && blocks.some((b) => b.id === requested) ? requested : null;
  const errors = selectedId ? await getBlockErrors(plan.id, selectedId) : [];

  // Ciclos abertos de cada bloco. `buildCycles` é pura e devolve só os que
  // exigem reforço — em 80% ou mais o ciclo se fecha sozinho.
  const openCycles = await Promise.all(
    blocks.map(async (block) => {
      const sessions = await getCompletedSessions(plan.id, block.id);
      const cycle = buildCycles(sessions, used)[0];
      if (!cycle) return null;
      return {
        blockId: block.id,
        blockName: block.name,
        subjectName: block.subject_name,
        subjectColor: block.subject_color,
        score: cycle.score,
        highPriority: cycle.highPriority,
        sessionIds: cycle.sessions.map((s) => s.id),
        errors: await getCycleErrors(cycle.sessions.map((s) => s.id)),
      };
    }),
  );

  const feito = params.get("feito");

  return {
    plan,
    blocks,
    performance,
    cycles,
    selectedId,
    errors,
    openCycles: openCycles.filter((c) => c !== null),
    doneMessage: feito ? (DONE_MESSAGE[feito] ?? null) : null,
    // Gerado UMA vez por carga da tela, e não a cada submissão: é o que faz o
    // reenvio devolver o reforço já gravado (R-RCIC-11).
    requestId: crypto.randomUUID(),
  } as const;
}

type LoaderData = Awaited<ReturnType<typeof studentReviewsLoader>>;

export function StudentReviews() {
  const data = useLoaderData() as LoaderData;

  if (!data.plan) {
    return (
      <>
        <PageHeader title="Revisões" />
        <Alert kind="info">Nenhum planejamento ativo.</Alert>
      </>
    );
  }

  const { blocks, selectedId, errors, openCycles, doneMessage, requestId } = data;
  const perfById = new Map(data.performance.map((p) => [p.block_id, p]));

  const cyclesByBlock = new Map<string, number>();
  for (const cycle of data.cycles) {
    cyclesByBlock.set(cycle.block_id, (cyclesByBlock.get(cycle.block_id) ?? 0) + 1);
  }

  const selected = selectedId ? blocks.find((b) => b.id === selectedId) : null;

  /**
   * O reforço automático nasce quando três baterias válidas do mesmo bloco
   * ficam abaixo de 80% no acumulado. A avaliação usa SOMENTE as principais.
   */
  const needsReinforcement = (blockId: string) => {
    const perf = perfById.get(blockId);
    if (!perf) return false;
    return (perf.session_count ?? 0) >= 3 && (perf.official_score_pct ?? 100) < 80;
  };

  return (
    <>
      <PageHeader
        title="Revisões"
        description="O caderno de erros reúne as questões erradas nas três fases: principais, extras e reforços."
      />

      {doneMessage && <Alert kind="success">{doneMessage}</Alert>}

      <div className="stack">
        {openCycles.map((cycle) => (
          <Card
            key={cycle.blockId}
            title={`Reforço — ${cycle.blockName}`}
            sub={`Ciclo de 3 baterias com ${cycle.score}% nas principais · ${cycle.errors.length} questão(ões) a revisar`}
            action={
              cycle.highPriority ? <Badge tone="red">Prioridade alta</Badge> : <Badge tone="amber">Disponível</Badge>
            }
          >
            <ReinforcementForm
              studyPlanId={data.plan.id}
              blockId={cycle.blockId}
              sessionIds={cycle.sessionIds}
              errors={cycle.errors}
              requestId={requestId}
            />
          </Card>
        ))}

        <Card title="Blocos" sub="Selecione um bloco para ver os erros acumulados">
          {blocks.length === 0 ? (
            <Empty>Nenhum bloco configurado.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bloco</th>
                    <th className="num">Baterias</th>
                    <th className="num">Oficial</th>
                    <th className="num">Ciclos revisados</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((block) => {
                    const perf = perfById.get(block.id);
                    const pct = perf?.official_score_pct ?? null;
                    return (
                      <tr key={block.id}>
                        <td>
                          <strong style={{ color: block.subject_color }}>
                            {block.subject_name}
                          </strong>
                          <div className="muted">{block.name}</div>
                        </td>
                        <td className="num">{perf?.session_count ?? 0}</td>
                        <td className="num">{pct === null ? "—" : `${pct}%`}</td>
                        <td className="num">{cyclesByBlock.get(block.id) ?? 0}</td>
                        <td>
                          {needsReinforcement(block.id) ? (
                            <Badge tone="red">Reforço recomendado</Badge>
                          ) : (
                            <Badge tone="neutral">Em dia</Badge>
                          )}
                        </td>
                        <td>
                          {/*
                            <Link>, e não <a href="?bloco=…">: numa SPA o <a>
                            recarrega o documento inteiro e joga fora o estado
                            da aplicação para trocar um parâmetro de busca. O
                            loader revalida sozinho quando a query muda.
                          */}
                          <Link
                            className="btn btn--ghost btn--sm"
                            to={`${ROUTES.student.reviews}?bloco=${block.id}`}
                            aria-current={block.id === selectedId ? "true" : undefined}
                          >
                            Ver erros
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selected && (
          <Card
            title={`Erros — ${selected.name}`}
            sub={`${errors.length} questão(ões) única(s) errada(s)`}
          >
            {errors.length === 0 ? (
              <Empty>Nenhum erro registrado neste bloco.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Questão</th>
                      <th>Tópico</th>
                      <th className="num">Vezes</th>
                      <th>Origem dos erros</th>
                      <th>Último erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((error) => (
                      <tr key={error.question_id}>
                        <td>#{error.question_id}</td>
                        <td>{error.topic ?? "Tópico não identificado"}</td>
                        <td className="num">{error.error_count}</td>
                        <td className="muted">
                          {[
                            error.main_errors ? `${error.main_errors}P` : null,
                            error.extra_errors ? `${error.extra_errors}E` : null,
                            error.reinforcement_errors ? `${error.reinforcement_errors}R` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </td>
                        <td className="muted">
                          {error.last_error_phase
                            ? (PHASE_LABEL[error.last_error_phase] ?? error.last_error_phase)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
