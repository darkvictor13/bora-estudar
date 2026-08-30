import { Link, useLoaderData } from "react-router";

import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getActiveCatalogs, getAllTeacherPlans, getMyStudents } from "@/lib/data/teacher";
import {
  ActivatePlanForm,
  ArchivePlanForm,
  NewPlanForm,
} from "@/components/teacher/PlanForms";
import { ROUTES } from "@/lib/routes";

const TONE: Record<string, "green" | "amber" | "neutral"> = {
  active: "green",
  draft: "amber",
  paused: "amber",
  archived: "neutral",
};

const LABEL: Record<string, string> = {
  active: "Ativo",
  draft: "Rascunho",
  paused: "Pausado",
  archived: "Arquivado",
};

/**
 * Confirmações que chegam por query string.
 *
 * Ativar e arquivar mudam a situação da linha, e com ela quais botões existem —
 * o formulário que mostraria a mensagem some na revalidação. Quem sobrevive é
 * esta página, então é ela que anuncia.
 */
const DONE_MESSAGE: Record<string, string> = {
  ativado: "Planejamento ativado. O anterior do aluno foi arquivado.",
  arquivado: "Planejamento arquivado. As metas e as baterias continuam no histórico.",
};

export async function teacherPlansLoader({ request }: { request: Request }) {
  const session = await requireRole("teacher");
  const [plans, students, catalogs] = await Promise.all([
    getAllTeacherPlans(session.profileId),
    getMyStudents(session.profileId),
    getActiveCatalogs(),
  ]);
  const feito = new URL(request.url).searchParams.get("feito");

  return {
    plans,
    doneMessage: feito ? (DONE_MESSAGE[feito] ?? null) : null,
    // Só quem tem vínculo vigente: é a mesma condição do WITH CHECK de
    // study_plans_teacher_insert, então a tela não oferece o que o banco recusa.
    students: students.map(({ profile }) => ({ id: profile.id, name: profile.name })),
    catalogs,
  };
}

type LoaderData = Awaited<ReturnType<typeof teacherPlansLoader>>;

export function TeacherPlans() {
  const { plans, students, catalogs, doneMessage } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Planejamentos"
        description="Um planejamento ativo por aluno — garantido por índice único no banco."
      />

      {doneMessage && <Alert kind="success">{doneMessage}</Alert>}

      <Card
        title="Novo planejamento"
        sub="Nasce como rascunho, com os blocos do catálogo escolhido. Ative para o aluno ver."
      >
        {students.length === 0 ? (
          <Empty>
            Vincule um aluno a você antes de criar um planejamento — a lista de candidatos está
            em Meus alunos.
          </Empty>
        ) : catalogs.length === 0 ? (
          <Empty>Nenhum catálogo ativo. Um administrador precisa cadastrar um.</Empty>
        ) : (
          <NewPlanForm students={students} catalogs={catalogs} />
        )}
      </Card>

      {plans.length === 0 ? (
        <Empty>Nenhum planejamento criado.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Planejamento</th>
                  <th>Concurso</th>
                  <th className="num">Metas/semana</th>
                  <th>Situação</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.studentName}</strong>
                    </td>
                    <td>{plan.name}</td>
                    <td className="muted">{plan.target_exam ?? "—"}</td>
                    <td className="num">{plan.weekly_goals}</td>
                    <td>
                      <Badge tone={TONE[plan.status] ?? "neutral"}>
                        {LABEL[plan.status] ?? plan.status}
                      </Badge>
                    </td>
                    <td>
                      <Link className="btn btn--ghost btn--sm" to={ROUTES.teacher.student(plan.student_id)}>
                        Abrir aluno
                      </Link>
                    </td>
                    <td>
                      <div className="row">
                        {plan.status !== "active" && <ActivatePlanForm planId={plan.id} />}
                        {plan.status !== "archived" && <ArchivePlanForm planId={plan.id} />}
                      </div>
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
