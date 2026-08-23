import { Link, useLoaderData } from "react-router";

import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getMyStudents, getPlanProgress } from "@/lib/data/teacher";
import { ROUTES } from "@/lib/routes";

export async function teacherStatisticsLoader() {
  const session = await requireRole("teacher");
  const students = await getMyStudents(session.profileId);

  const rows = await Promise.all(
    students.map(async ({ profile, activePlan }) => ({
      profile,
      activePlan,
      progress: activePlan ? await getPlanProgress(activePlan.id) : null,
    })),
  );

  // Pior desempenho oficial primeiro: é onde a atenção do professor rende mais.
  rows.sort((a, b) => (a.progress?.officialPct ?? 101) - (b.progress?.officialPct ?? 101));

  return { rows };
}

type LoaderData = Awaited<ReturnType<typeof teacherStatisticsLoader>>;

export function TeacherStatistics() {
  const { rows } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description="Panorama da turma. O desempenho conta somente as questões principais."
      />

      {rows.length === 0 ? (
        <Empty>Nenhum aluno vinculado.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Planejamento</th>
                  <th className="num">Metas</th>
                  <th className="num">Concluídas</th>
                  <th className="num">Principais</th>
                  <th className="num">Desempenho</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ profile, activePlan, progress }) => (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.name}</strong>
                    </td>
                    <td className="muted">{activePlan?.name ?? "Sem planejamento ativo"}</td>
                    <td className="num">{progress?.goalCount ?? "—"}</td>
                    <td className="num">{progress?.completed ?? "—"}</td>
                    <td className="num">{progress?.mainQuestions || "—"}</td>
                    <td className="num">
                      <strong>
                        {progress?.officialPct === null || progress === null
                          ? "—"
                          : `${progress.officialPct}%`}
                      </strong>
                    </td>
                    <td>
                      <Link className="btn btn--ghost btn--sm" to={ROUTES.teacher.student(profile.id)}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
