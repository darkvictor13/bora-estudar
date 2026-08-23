import { useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStudentAccess } from "@/lib/auth/session";
import { getActiveStudyPlan, getBlockPerformance, getStudyPlanBlocks } from "@/lib/data/student";
import { scorePercent } from "@/lib/domain/goals";

export async function subjectsLoader() {
  await requireStudentAccess();

  const plan = await getActiveStudyPlan();
  if (!plan) return { plan: null } as const;

  const [blocks, performance] = await Promise.all([
    getStudyPlanBlocks(plan.id),
    getBlockPerformance(plan.id),
  ]);
  return { plan, blocks, performance } as const;
}

type LoaderData = Awaited<ReturnType<typeof subjectsLoader>>;

export function Subjects() {
  const data = useLoaderData() as LoaderData;

  if (!data.plan) {
    return (
      <>
        <PageHeader title="Disciplinas" />
        <Alert kind="info">Nenhum planejamento ativo.</Alert>
      </>
    );
  }

  const perfById = new Map(data.performance.map((p) => [p.block_id, p]));

  // Agrega os blocos por disciplina para dar a nota da matéria.
  const subjects = new Map<
    string,
    { name: string; color: string; target: number; blocks: number; main: number; correct: number }
  >();
  for (const block of data.blocks) {
    const entry = subjects.get(block.subject_name) ?? {
      name: block.subject_name,
      color: block.subject_color,
      target: block.subject_target,
      blocks: 0,
      main: 0,
      correct: 0,
    };
    const perf = perfById.get(block.id);
    entry.blocks += 1;
    entry.main += perf?.main_count ?? 0;
    entry.correct += perf?.main_correct ?? 0;
    subjects.set(block.subject_name, entry);
  }

  const rows = [...subjects.values()];

  return (
    <>
      <PageHeader
        title="Disciplinas"
        description="Aproveitamento oficial por matéria, comparado com a meta definida pelo professor."
      />

      {rows.length === 0 ? (
        <Empty>Nenhuma disciplina configurada neste planejamento.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Disciplina</th>
                  <th className="num">Blocos</th>
                  <th className="num">Principais</th>
                  <th className="num">Acertos</th>
                  <th className="num">Meta</th>
                  <th className="num">Desempenho</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((subject) => {
                  const pct = scorePercent(subject.correct, subject.main);
                  return (
                    <tr key={subject.name}>
                      <td>
                        <strong style={{ color: subject.color }}>{subject.name}</strong>
                      </td>
                      <td className="num">{subject.blocks}</td>
                      <td className="num">{subject.main || "—"}</td>
                      <td className="num">{subject.main ? subject.correct : "—"}</td>
                      <td className="num">{subject.target}%</td>
                      <td className="num">
                        <strong>{pct === null ? "—" : `${pct}%`}</strong>
                      </td>
                      <td>
                        {pct === null ? (
                          <Badge tone="neutral">Sem dados</Badge>
                        ) : pct >= subject.target ? (
                          <Badge tone="green">Na meta</Badge>
                        ) : (
                          <Badge tone="amber">Abaixo</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
