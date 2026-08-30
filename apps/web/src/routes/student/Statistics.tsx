import { useLoaderData } from "react-router";

import { Alert, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import {
  getActiveStudyPlan,
  getBlockPerformance,
  getStudyPlanBlocks,
  getTopicDifficulty,
} from "@/lib/data/student";
import { TopicDifficulty } from "@/components/TopicDifficulty";
import { scorePercent } from "@/lib/domain/goals";

export async function studentStatisticsLoader() {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) return { plan: null } as const;

  const [performance, blocks, topics] = await Promise.all([
    getBlockPerformance(plan.id),
    getStudyPlanBlocks(plan.id),
    getTopicDifficulty(plan.id),
  ]);
  return { plan, performance, blocks, topics } as const;
}

type LoaderData = Awaited<ReturnType<typeof studentStatisticsLoader>>;

export function StudentStatistics() {
  const data = useLoaderData() as LoaderData;

  if (!data.plan) {
    return (
      <>
        <PageHeader title="Estatísticas" />
        <Alert kind="info">Nenhum planejamento ativo.</Alert>
      </>
    );
  }

  const { performance, topics } = data;
  const blockById = new Map(data.blocks.map((b) => [b.id, b]));

  const totals = performance.reduce(
    (acc, r) => ({
      main: acc.main + (r.main_count ?? 0),
      mainCorrect: acc.mainCorrect + (r.main_correct ?? 0),
      total: acc.total + (r.total_count ?? 0),
      totalCorrect: acc.totalCorrect + (r.total_correct ?? 0),
    }),
    { main: 0, mainCorrect: 0, total: 0, totalCorrect: 0 },
  );

  const officialPct = scorePercent(totals.mainCorrect, totals.main);
  const totalPct = scorePercent(totals.totalCorrect, totals.total);

  // Pior desempenho oficial primeiro: é onde o estudo precisa ir.
  const rows = [...performance].sort(
    (a, b) => (a.official_score_pct ?? 101) - (b.official_score_pct ?? 101),
  );

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description="O desempenho oficial conta só as questões principais. O aproveitamento total inclui extras e reforços."
      />

      <div className="stack">
        <div className="grid-cards">
          <Card title="Desempenho oficial" sub="Somente questões principais">
            <p style={{ fontSize: "2rem", fontWeight: 700 }}>
              {officialPct === null ? "—" : `${officialPct}%`}
            </p>
            <p className="muted">
              {totals.mainCorrect} acertos em {totals.main} principais
            </p>
          </Card>

          <Card title="Aproveitamento total" sub="Principais, extras e reforços">
            <p style={{ fontSize: "2rem", fontWeight: 700 }}>
              {totalPct === null ? "—" : `${totalPct}%`}
            </p>
            <p className="muted">
              {totals.totalCorrect} acertos em {totals.total} questões resolvidas
            </p>
          </Card>
        </div>

        <TopicDifficulty
          rows={topics}
          blockNames={new Map(data.blocks.map((b) => [b.id, b.name]))}
          title="Onde você está errando"
        />

        <Card title="Blocos x desempenho" sub="Pior desempenho oficial primeiro">
          {rows.length === 0 ? (
            <Empty>Nenhuma bateria concluída ainda.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Disciplina</th>
                    <th>Bloco</th>
                    <th className="num">Total realizado</th>
                    <th>Composição</th>
                    <th>Acertos e erros</th>
                    <th className="num">Oficial</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const block = row.block_id ? blockById.get(row.block_id) : null;
                    const composition = [
                      `${row.main_count ?? 0} principais`,
                      row.extra_count ? `${row.extra_count} extras` : null,
                      row.reinforcement_count ? `${row.reinforcement_count} reforços` : null,
                    ].filter(Boolean);
                    const outcomes = [
                      `P: ${row.main_correct ?? 0} ac. / ${row.main_incorrect ?? 0} er.`,
                      row.extra_count
                        ? `E: ${row.extra_correct ?? 0} ac. / ${row.extra_incorrect ?? 0} er.`
                        : null,
                      row.reinforcement_count
                        ? `R: ${row.reinforcement_correct ?? 0} ac. / ${row.reinforcement_incorrect ?? 0} er.`
                        : null,
                    ].filter(Boolean);

                    return (
                      <tr key={row.block_id}>
                        <td style={{ color: block?.subject_color }}>
                          {block?.subject_name ?? "—"}
                        </td>
                        <td>{block?.name ?? "—"}</td>
                        <td className="num">
                          <strong>{row.total_count ?? 0}</strong>
                        </td>
                        <td className="muted">{composition.join(" · ")}</td>
                        <td className="muted">{outcomes.join(" · ")}</td>
                        <td className="num">
                          <strong>
                            {row.official_score_pct === null ? "—" : `${row.official_score_pct}%`}
                          </strong>
                        </td>
                        <td className="num">
                          {row.total_score_pct === null ? "—" : `${row.total_score_pct}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
