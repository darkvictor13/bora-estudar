import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Metric, PageHeader } from "@bora/ui";
import { useLoaderData } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type TheoryDiagnosis, type TheorySubjectControl } from "@/lib/api";
import { loadActivePlanOrNull } from "@/lib/api/supabase/plan.ts";
import { requireStudentAccess } from "@/lib/auth/session";

/**
 * O controle da teoria por disciplina — a tela `/aluno/teoria` da v108.
 *
 * Responde a três perguntas de uma vez: em que aula estou em cada matéria,
 * quanto falta para cada uma acabar, e quantas revisões me esperam. A meta da
 * semana abre UMA disciplina; esta tela mostra todas.
 */
export async function theoryLoader() {
  await requireStudentAccess();

  const plan = await loadActivePlanOrNull();
  if (!plan) return { subjects: [] as readonly TheorySubjectControl[], hasPlan: false };

  return { subjects: await api.loadTheoryControl(plan.id), hasPlan: true };
}

type LoaderData = Awaited<ReturnType<typeof theoryLoader>>;

function diagnosisLabel(diagnosis: TheoryDiagnosis): string | null {
  switch (diagnosis.kind) {
    case "ok":
      return null;
    case "no_catalog_linked":
      return "Sem catálogo vinculado";
    case "subject_not_audited":
      return "Fora do catálogo auditado";
    case "lesson_without_pages":
      return "Aula sem páginas auditadas";
  }
}

export function Theory() {
  const { subjects, hasPlan } = useLoaderData() as LoaderData;

  const lessonsDone = subjects.reduce((sum, subject) => sum + subject.lessonsDone, 0);
  const lessonsTotal = subjects.reduce((sum, subject) => sum + subject.lessonsTotal, 0);
  const reviewsDue = subjects.reduce((sum, subject) => sum + subject.reviewsDue, 0);

  return (
    <>
      <PageHeader
        title="Estudo da teoria"
        description="Em que aula você está, em cada disciplina"
      />

      <ContentBody>
        {!hasPlan && (
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        )}

        {hasPlan && subjects.length === 0 && (
          <Empty icon="📖">
            Seu planejamento ainda não tem um catálogo de teoria vinculado. Fale com seu professor.
          </Empty>
        )}

        {subjects.length > 0 && (
          <Box
            sx={(theme) => ({
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1.25,
              mb: 1.75,
              [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
            })}
          >
            <Metric label="Disciplinas" value={subjects.length} />
            <Metric
              label="Aulas concluídas"
              value={`${lessonsDone}/${lessonsTotal}`}
              note={
                lessonsTotal > 0 ? `${Math.round((lessonsDone / lessonsTotal) * 100)}% do curso` : ""
              }
            />
            {/* A fila de revisões é informação, não alarme: ela não bloqueia o
                avanço, e o número existe para a pessoa decidir quando encaixá-la. */}
            <Metric
              label="Revisões vencidas"
              value={reviewsDue}
              note={reviewsDue === 0 ? "Nada em atraso" : "Não bloqueiam a próxima aula"}
            />
          </Box>
        )}

        {subjects.map((subject) => {
          const percent =
            subject.lessonsTotal > 0
              ? Math.round((subject.lessonsDone / subject.lessonsTotal) * 100)
              : 0;
          const warning = diagnosisLabel(subject.diagnosis);

          return (
            <Box key={subject.subjectKey} sx={{ mb: 1.5 }}>
              <Card
                title={subject.subject}
                sub={
                  subject.currentLesson
                    ? `Aula atual: ${subject.currentLesson.lessonCode} — ${subject.currentLesson.title}`
                    : "Nenhuma aula no catálogo"
                }
                action={
                  <Box
                    data-testid="theory-subject"
                    data-subject={subject.subjectKey}
                    data-diagnosis={subject.diagnosis.kind}
                    sx={{ display: "flex", gap: 0.75, alignItems: "center" }}
                  >
                    {subject.reviewsDue > 0 && (
                      <Badge tone="warning">{subject.reviewsDue} revisões</Badge>
                    )}
                    <Badge tone={percent === 100 ? "success" : "neutral"}>
                      {subject.lessonsDone}/{subject.lessonsTotal}
                    </Badge>
                  </Box>
                }
              >
                {warning ? (
                  <Alert status="warning">{warning}</Alert>
                ) : (
                  <>
                    <LinearProgress
                      variant="determinate"
                      value={percent}
                      aria-label={`${percent}% das aulas de ${subject.subject}`}
                      sx={{ height: 8, borderRadius: 999, mb: 0.75 }}
                    />
                    <Typography variant="numeric" component="p">
                      {percent}% concluído
                    </Typography>
                  </>
                )}
              </Card>
            </Box>
          );
        })}
      </ContentBody>
    </>
  );
}
