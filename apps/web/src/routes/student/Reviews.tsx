import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import {
  getActiveStudyPlan,
  getBlockErrors,
  getBlockPerformance,
  getReviewCycles,
  getStudyPlanBlocks,
} from "@/lib/data/student";
import { ROUTES } from "@/lib/routes";

const PHASE_LABEL: Record<string, string> = {
  main: "principal",
  extra: "extra",
  reinforcement: "reforço",
};

export async function studentReviewsLoader({ request }: { request: Request }) {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) return { plan: null } as const;

  const [blocks, performance] = await Promise.all([
    getStudyPlanBlocks(plan.id),
    getBlockPerformance(plan.id),
  ]);
  const cycles = await getReviewCycles(blocks.map((b) => b.id));

  const requested = new URL(request.url).searchParams.get("bloco");
  const selectedId = requested && blocks.some((b) => b.id === requested) ? requested : null;
  const errors = selectedId ? await getBlockErrors(plan.id, selectedId) : [];

  return { plan, blocks, performance, cycles, selectedId, errors } as const;
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

  const { blocks, selectedId, errors } = data;
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

      <div className="stack">
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
