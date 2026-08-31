import { Link, useLoaderData } from "react-router";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { getMyStudentsWithProgress, getWaitlistCandidates } from "@/lib/data/teacher";
import { LinkStudentForm } from "@/components/teacher/AccessForms";
import {
  BAND_LABEL,
  BAND_TONE,
  bandRank,
  classifyStudent,
  normalize,
  officialPctOf,
  progressOf,
  type StudentBand,
} from "@/lib/domain/students";
import { ROUTES } from "@/lib/routes";

const ACCESS_LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  active: { text: "Acesso ativo", tone: "green" },
  pending: { text: "Aguardando liberação", tone: "amber" },
  suspended: { text: "Suspenso", tone: "red" },
  expired: { text: "Expirado", tone: "red" },
};

const BANDS: readonly StudentBand[] = ["atrasado", "atencao", "sem-dados", "ritmo"];

export async function teacherStudentsLoader({ request }: { request: Request }) {
  const session = await requireRole("teacher");
  const [students, candidates] = await Promise.all([
    getMyStudentsWithProgress(session.profileId),
    getWaitlistCandidates(),
  ]);

  const params = new URL(request.url).searchParams;
  const rawBand = params.get("situacao");
  const rawPlan = params.get("plano");

  const rows = students
    .map((student) => {
      const band = classifyStudent(student.progress);
      return {
        ...student,
        band,
        planName: student.activePlan?.name ?? "Sem planejamento ativo",
        progressPct: progressOf(student.progress),
        officialPct: officialPctOf(student.progress),
      };
    })
    // R-TURMA-11: quem precisa de atenção primeiro. É a ordenação que
    // transforma a lista em diagnóstico.
    .sort((a, b) => bandRank(a.band) - bandRank(b.band) || a.profile.name.localeCompare(b.profile.name, "pt-BR"));

  const planNames = [...new Set(rows.map((r) => r.planName))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  // R-TURMA-10: valor inválido é ignorado, e a lista volta inteira.
  const busca = params.get("busca") ?? "";
  const situacao = rawBand && BANDS.includes(rawBand as StudentBand) ? (rawBand as StudentBand) : null;
  const plano = rawPlan && planNames.includes(rawPlan) ? rawPlan : null;

  const termo = normalize(busca);
  const filtered = rows.filter((row) => {
    if (situacao && row.band !== situacao) return false;
    if (plano && row.planName !== plano) return false;
    if (!termo) return true;
    // R-TURMA-08: nome e e-mail, que é o que o rótulo promete.
    return (
      normalize(row.profile.name).includes(termo) ||
      normalize(row.profile.contact_email ?? "").includes(termo)
    );
  });

  const totals = {
    alunos: rows.length,
    ritmo: rows.filter((r) => r.band === "ritmo").length,
    // "Precisam de atenção" soma Atenção E Atrasado: as duas pedem a mesma ação.
    atencao: rows.filter((r) => r.band === "atencao" || r.band === "atrasado").length,
    questoes: rows.reduce((sum, r) => sum + r.progress.mainCount, 0),
    acertos: rows.reduce((sum, r) => sum + r.progress.mainCorrect, 0),
  };

  return { students: filtered, total: rows.length, candidates, totals, planNames, busca, situacao, plano };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentsLoader>>;

export function TeacherStudents() {
  const { students, total, candidates, totals, planNames, busca, situacao, plano } =
    useLoaderData() as LoaderData;
  const mediaTurma = totals.questoes ? Math.round((totals.acertos / totals.questoes) * 100) : null;

  return (
    <>
      <PageHeader
        title="Meus alunos"
        description={`${total} aluno(s) com vínculo vigente.`}
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

      {total > 0 && (
        <div className="grid-cards">
          <Card title="Alunos">
            <p className="stat__value">{totals.alunos}</p>
          </Card>
          <Card title="Em ritmo">
            <p className="stat__value">{totals.ritmo}</p>
          </Card>
          <Card title="Precisam de atenção" sub="Atenção e atrasados">
            <p className="stat__value">{totals.atencao}</p>
          </Card>
          <Card title="Questões da turma" sub="Somente principais">
            <div className="stat">
              <p className="stat__value">{totals.questoes}</p>
              <p className="muted">
                {mediaTurma === null ? "sem questões ainda" : `${mediaTurma}% de acerto`}
              </p>
            </div>
          </Card>
        </div>
      )}

      {total > 0 && (
        <Card title="Filtrar">
          {/*
            `method="get"`: busca e filtros vivem na query string, como
            `?semana=` e `?ver=`. Um link para "meus alunos atrasados" passa a
            existir, e o estado não morre a cada render — que é o que acontecia
            na v96, filtrando em memória.
          */}
          <form method="get" action={ROUTES.teacher.students} className="field-row">
            <div className="field">
              <label className="field__label" htmlFor="field-busca">
                Nome ou e-mail
              </label>
              <input id="field-busca" name="busca" type="search" defaultValue={busca} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="field-situacao">
                Situação
              </label>
              <select id="field-situacao" name="situacao" defaultValue={situacao ?? ""}>
                <option value="">Todas</option>
                {BANDS.map((band) => (
                  <option key={band} value={band}>
                    {BAND_LABEL[band]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="field-plano">
                Planejamento
              </label>
              <select id="field-plano" name="plano" defaultValue={plano ?? ""}>
                <option value="">Todos</option>
                {planNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn--primary btn--sm">
              Filtrar
            </button>
          </form>
        </Card>
      )}

      {students.length === 0 ? (
        <Empty>
          {total === 0 ? "Nenhum aluno vinculado ainda." : "Nenhum aluno neste filtro."}
        </Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Contato</th>
                  <th>Planejamento ativo</th>
                  <th className="num">Metas</th>
                  <th className="num">Oficial</th>
                  <th>Situação</th>
                  <th>Acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map(({ profile, subscription, activePlan, band, progress, progressPct, officialPct }) => {
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
                      <td className="num">
                        {progress.goalCount ? (
                          <>
                            {progress.completed}/{progress.goalCount}
                            {progressPct !== null && (
                              <span className="muted"> · {Math.round(progressPct * 100)}%</span>
                            )}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="num">
                        {officialPct === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <strong>{officialPct}%</strong>
                        )}
                      </td>
                      {/*
                        As duas células levam classe porque a linha passou a ter
                        DOIS badges — situação de estudo e situação de acesso —,
                        e `tr .badge` sozinho vira violação de modo estrito no
                        teste. A classe é o endereço estável de cada um.
                      */}
                      <td className="situacao">
                        <Badge tone={BAND_TONE[band]}>{BAND_LABEL[band]}</Badge>
                      </td>
                      <td className="acesso">
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
