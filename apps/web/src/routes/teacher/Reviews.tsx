import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getMyStudents, getPlanProgress } from "@/lib/data/teacher";
import { supabase } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/routes";

export async function teacherReviewsLoader() {
  const session = await requireRole("teacher");
  const students = await getMyStudents(session.profileId);

  const rows = await Promise.all(
    students
      .filter((s) => s.activePlan)
      .map(async ({ profile, activePlan }) => {
        const progress = await getPlanProgress(activePlan!.id);
        const blockIds = progress.blocks.map((b) => b.block_id).filter(Boolean) as string[];

        const { data: blocks } = blockIds.length
          ? await supabase
              .from("study_plan_blocks")
              .select("id,name,subject_name,subject_color")
              .in("id", blockIds)
          : { data: [] };
        const blockById = new Map((blocks ?? []).map((b) => [b.id, b]));

        // Mesma regra do reforço automático: três baterias válidas no bloco e
        // acumulado abaixo de 80% nas principais.
        const needing = progress.blocks
          .filter((b) => (b.session_count ?? 0) >= 3 && (b.official_score_pct ?? 100) < 80)
          .map((b) => ({
            block: b.block_id ? (blockById.get(b.block_id) ?? null) : null,
            sessions: b.session_count ?? 0,
            pct: b.official_score_pct,
          }));

        return { profile, planName: activePlan!.name, needing };
      }),
  );

  return { studentCount: students.length, withPending: rows.filter((r) => r.needing.length > 0) };
}

type LoaderData = Awaited<ReturnType<typeof teacherReviewsLoader>>;

export function TeacherReviews() {
  const { studentCount, withPending } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Revisões"
        description="Blocos em que o aluno acumulou três baterias abaixo de 80% nas questões principais."
      />

      {studentCount === 0 ? (
        <Empty>Nenhum aluno vinculado.</Empty>
      ) : withPending.length === 0 ? (
        <Card>
          <Empty>Nenhum bloco exigindo reforço no momento.</Empty>
        </Card>
      ) : (
        <>
          {withPending.map(({ profile, planName, needing }) => (
            <Card
              key={profile.id}
              title={profile.name}
              sub={planName}
              action={
                <Link className="btn btn--ghost btn--sm" to={ROUTES.teacher.student(profile.id)}>
                  Abrir aluno
                </Link>
              }
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Disciplina</th>
                      <th>Bloco</th>
                      <th className="num">Baterias</th>
                      <th className="num">Oficial</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needing.map((item, index) => (
                      <tr key={item.block?.id ?? index}>
                        <td style={{ color: item.block?.subject_color }}>
                          {item.block?.subject_name ?? "—"}
                        </td>
                        <td>{item.block?.name ?? "—"}</td>
                        <td className="num">{item.sessions}</td>
                        <td className="num">
                          <strong>{item.pct === null ? "—" : `${item.pct}%`}</strong>
                        </td>
                        <td>
                          <Badge tone="red">Reforço recomendado</Badge>
                        </td>
                      </tr>
                    ))}
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
