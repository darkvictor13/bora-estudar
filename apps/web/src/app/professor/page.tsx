import Link from "next/link";
import type { Metadata } from "next";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getMyStudents } from "@/lib/data/teacher";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Meus alunos · Bora Estudar" };

const ACCESS_LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  active: { text: "Acesso ativo", tone: "green" },
  pending: { text: "Aguardando liberação", tone: "amber" },
  suspended: { text: "Suspenso", tone: "red" },
  expired: { text: "Expirado", tone: "red" },
};

export default async function TeacherStudentsPage() {
  const session = await requireRole("teacher");
  const students = await getMyStudents(session.profileId);

  return (
    <>
      <PageHeader
        title="Meus alunos"
        description={`${students.length} aluno(s) com vínculo vigente.`}
      />

      {students.length === 0 ? (
        <Empty>Nenhum aluno vinculado ainda.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Contato</th>
                  <th>Planejamento ativo</th>
                  <th>Acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map(({ profile, subscription, activePlan }) => {
                  const access = ACCESS_LABEL[subscription?.status ?? "pending"] ?? {
                    text: "Sem assinatura",
                    tone: "neutral" as const,
                  };
                  return (
                    <tr key={profile.id}>
                      <td>
                        <strong>{profile.name}</strong>
                      </td>
                      <td className="muted">
                        {profile.contact_email}
                        {profile.phone && <div>{profile.phone}</div>}
                      </td>
                      <td>
                        {activePlan ? (
                          <>
                            {activePlan.name}
                            {activePlan.target_exam && (
                              <div className="muted">{activePlan.target_exam}</div>
                            )}
                          </>
                        ) : (
                          <span className="muted">Nenhum</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={access.tone}>{access.text}</Badge>
                      </td>
                      <td>
                        <Link className="btn btn--ghost btn--sm" href={ROUTES.teacher.student(profile.id)}>
                          Abrir
                        </Link>
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
