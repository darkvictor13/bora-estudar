import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getMyStudents, getWaitlistCandidates } from "@/lib/data/teacher";
import { LinkStudentForm } from "@/components/teacher/AccessForms";
import { ROUTES } from "@/lib/routes";

const ACCESS_LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  active: { text: "Acesso ativo", tone: "green" },
  pending: { text: "Aguardando liberação", tone: "amber" },
  suspended: { text: "Suspenso", tone: "red" },
  expired: { text: "Expirado", tone: "red" },
};

export async function teacherStudentsLoader() {
  const session = await requireRole("teacher");
  const [students, candidates] = await Promise.all([
    getMyStudents(session.profileId),
    getWaitlistCandidates(),
  ]);
  return { students, candidates };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentsLoader>>;

export function TeacherStudents() {
  const { students, candidates } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Meus alunos"
        description={`${students.length} aluno(s) com vínculo vigente.`}
      />

      {/*
        A fila de candidatos vem antes da lista: quem se cadastrou e ainda não
        tem professor é a única coisa nesta tela que exige ação. Ela só é
        visível por causa da policy `waitlist_teacher_read` — sem ela,
        `waitlist_own` passa por `is_teacher_of` e a consulta volta vazia.
      */}
      {candidates.length > 0 && (
        <Card
          title="Candidatos"
          sub={`${candidates.length} pessoa(s) na lista de espera, ainda sem professor`}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Concurso em foco</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.student_id}>
                    <td>
                      <strong>{candidate.name}</strong>
                      {candidate.interest_area && (
                        <div className="muted">{candidate.interest_area}</div>
                      )}
                    </td>
                    <td className="muted">
                      {candidate.email}
                      {candidate.whatsapp && <div>{candidate.whatsapp}</div>}
                    </td>
                    <td>{candidate.focus_exam ?? "—"}</td>
                    <td>
                      <LinkStudentForm studentId={candidate.student_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
                        <Link className="btn btn--ghost btn--sm" to={ROUTES.teacher.student(profile.id)}>
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
