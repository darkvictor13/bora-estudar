import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Metric, PageHeader } from "@bora/ui";
import { Link, useLoaderData } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type TheoryDiagnosis, type TheorySubjectControl } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

/**
 * O controle da teoria por disciplina — a tela `/aluno/teoria` da v108.
 *
 * Responde a três perguntas de uma vez: em que aula estou em cada matéria,
 * quanto falta para cada uma acabar, e quantas revisões me esperam. A meta da
 * semana abre UMA disciplina; esta tela mostra todas.
 */
export async function theoryLoader() {
  await requireStudentAccess();

  const plan = await api.loadActivePlanOrNull();
  if (!plan) return { subjects: [] as readonly TheorySubjectControl[], hasPlan: false };

  return { subjects: await api.loadTheoryControl(plan.id), hasPlan: true };
}

type LoaderData = Awaited<ReturnType<typeof theoryLoader>>;

type StudyResourceTone = "tec" | "qconcursos" | "flashcards" | "summary";

const studyResourcePalette: Record<StudyResourceTone, { start: string; end: string; shadow: string }> = {
  tec: { start: "#173F67", end: "#092743", shadow: "rgba(9, 39, 67, 0.28)" },
  qconcursos: { start: "#F58A24", end: "#D85A0B", shadow: "rgba(216, 90, 11, 0.28)" },
  flashcards: { start: "#1AAE9F", end: "#087A70", shadow: "rgba(8, 122, 112, 0.28)" },
  summary: { start: "#8B5CF6", end: "#6537C7", shadow: "rgba(101, 55, 199, 0.28)" },
};

function studyResourceButtonSx(tone: StudyResourceTone) {
  const color = studyResourcePalette[tone];

  return {
    color: "#fff",
    borderColor: color.end,
    background: `linear-gradient(145deg, ${color.start} 0%, ${color.end} 100%)`,
    boxShadow: `0 3px 0 ${color.end}, 0 7px 14px ${color.shadow}`,
    transform: "translateY(-1px)",
    transition: "transform 150ms ease, box-shadow 150ms ease, filter 150ms ease",
    "&:hover": {
      color: "#fff",
      borderColor: color.end,
      background: `linear-gradient(145deg, ${color.start} 0%, ${color.end} 100%)`,
      boxShadow: `0 2px 0 ${color.end}, 0 5px 10px ${color.shadow}`,
      filter: "brightness(1.06)",
      transform: "translateY(0)",
    },
    "&:focus-visible": {
      outline: `3px solid ${color.start}55`,
      outlineOffset: 2,
    },
  };
}

function diagnosisLabel(diagnosis: TheoryDiagnosis): string | null {
  switch (diagnosis.kind) {
    case "ok":
      return null;
    case "no_catalog_linked":
      return "Sem catálogo vinculado";
    case "subject_not_audited":
      return "Aguardando aula do professor";
    case "lesson_without_pages":
      return "Aula ainda indisponível";
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
        title="Aulas"
        description="Conteúdo lecionado e material de apoio para seus estudos"
      />

      <ContentBody>
        {!hasPlan && (
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        )}

        {hasPlan && subjects.length === 0 && (
          <Empty icon="📖">
            Seu planejamento ainda não tem aulas vinculadas. Fale com seu professor.
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
              label="Metas de questões"
              value={`${lessonsDone}/${lessonsTotal}`}
              note={
                lessonsTotal > 0 ? `${Math.round((lessonsDone / lessonsTotal) * 100)}% das aulas publicadas` : ""
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
                      {percent}% das metas de questões atingidas
                    </Typography>
                    <Box sx={{ display: "grid", gap: 1, mt: 2 }}>
                      {subject.lessons.map((lesson) => {
                        const blocks = lesson.materialBlocks.length > 0 ? lesson.materialBlocks : [{
                          title: lesson.title,
                          pdf: lesson.resources.pdf,
                          tecQuestions: lesson.resources.tecQuestions,
                          qcQuestions: lesson.resources.qcQuestions,
                        }];
                        return (
                          <Box key={lesson.id} sx={(theme) => ({
                            p: 1.25,
                            borderRadius: `${theme.brand.radius.md}px`,
                            backgroundColor: theme.vars.palette.surface.sunken,
                          })}>
                            <Typography variant="body2" component="p" sx={{ fontWeight: 600 }}>
                              {lesson.lessonCode} · {lesson.title}
                            </Typography>
                            <Box sx={{ display: "grid", gap: 0.75, mt: 1.25 }}>
                              {blocks.map((block, index) => (
                                <Box key={`${block.title}-${index}`} sx={(theme) => ({ p: 1.25, border: `1px solid ${theme.vars.palette.surface.border}`, borderRadius: `${theme.brand.radius.sm}px`, backgroundColor: theme.vars.palette.surface.raised })}>
                                  <Typography variant="body2" component="p" sx={{ fontWeight: 700, mb: 0.75 }}>Bloco {String(index + 1).padStart(2, "0")} · {block.title}</Typography>
                                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                    {[
                                      { label: "PDF", url: block.pdf, tone: undefined },
                                      { label: "TEC", url: block.tecQuestions, tone: "tec" as const },
                                      { label: "QConcursos", url: block.qcQuestions, tone: "qconcursos" as const },
                                    ].filter((link): link is typeof link & { url: string } => Boolean(link.url)).map((link) => (
                                      <Button
                                        key={link.label}
                                        component="a"
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        size="small"
                                        variant="outlined"
                                        sx={link.tone ? studyResourceButtonSx(link.tone) : undefined}
                                      >
                                        {link.label}
                                      </Button>
                                    ))}
                                    {!block.pdf && !block.tecQuestions && !block.qcQuestions && <Typography variant="caption">Materiais em preparação.</Typography>}
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                              <Button component={Link} to={ROUTES.student.flashcardsForLesson(lesson.id)} size="small" variant="outlined" sx={studyResourceButtonSx("flashcards")}>
                                Flashcards
                              </Button>
                              <Button component={Link} to={ROUTES.student.flashSummaryForLesson(lesson.id)} size="small" variant="outlined" sx={studyResourceButtonSx("summary")}>Resumo flash</Button>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
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
