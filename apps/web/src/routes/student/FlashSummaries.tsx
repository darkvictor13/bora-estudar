import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutwardOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, PageHeader } from "@bora/ui";
import { useMemo, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type TheoryLesson } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function flashSummariesLoader({ request }: LoaderFunctionArgs) {
  await requireStudentAccess(request);
  const lessonId = new URL(request.url).searchParams.get("aula");
  const plan = await api.loadActivePlanOrNull();
  const subjects = plan ? await api.loadTheoryControl(plan.id) : [];
  const lessons = subjects.flatMap((subject) => subject.lessons).filter((item) => item.published);

  return {
    hasPlan: Boolean(plan),
    lessons,
    lesson: lessonId ? lessons.find((item) => item.id === lessonId) ?? null : null,
    requestedLesson: Boolean(lessonId),
  };
}

type LoaderData = Awaited<ReturnType<typeof flashSummariesLoader>>;

function SummaryStatus({ lesson }: { lesson: TheoryLesson }) {
  return (
    <Badge tone={lesson.resources.flashSummary ? "success" : "neutral"}>
      {lesson.resources.flashSummary ? "Disponível" : "Em preparação"}
    </Badge>
  );
}

function LessonNavigation({ lesson, lessons }: { lesson: TheoryLesson; lessons: readonly TheoryLesson[] }) {
  const subjectLessons = lessons.filter((item) => item.subject === lesson.subject);

  return (
    <Card title={lesson.subject} sub="Aulas deste resumo flash">
      <Box component="nav" aria-label={`Aulas de ${lesson.subject}`} sx={{ display: "grid", gap: 0.5 }}>
        {subjectLessons.map((item) => (
          <Button
            key={item.id}
            component={Link}
            to={ROUTES.student.flashSummaryForLesson(item.id)}
            variant={item.id === lesson.id ? "contained" : "text"}
            color={item.id === lesson.id ? "primary" : "inherit"}
            sx={(theme) => ({
              justifyContent: "flex-start",
              textAlign: "left",
              px: 1,
              py: 0.8,
              borderRadius: `${theme.brand.radius.sm}px`,
              fontSize: "0.75rem",
              fontWeight: item.id === lesson.id ? 800 : 600,
            })}
          >
            <Box component="span" sx={{ width: 42, flexShrink: 0, color: "text.secondary", fontFamily: "monospace" }}>
              {item.lessonCode}
            </Box>
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.title}
            </Box>
          </Button>
        ))}
      </Box>
    </Card>
  );
}

function SelectedSummary({ lesson, lessons }: { lesson: TheoryLesson; lessons: readonly TheoryLesson[] }) {
  return (
    <>
      <PageHeader
        title={`Resumo Flash · ${lesson.lessonCode}`}
        description={`${lesson.subject} · ${lesson.title}`}
        actions={(
          <Button component={Link} to={ROUTES.student.flashSummaries} variant="outlined" size="small" startIcon={<ArrowBackIcon />}>
            Todos os resumos
          </Button>
        )}
      />
      <ContentBody>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "250px minmax(0, 1fr)" }, gap: 1.5, alignItems: "start" }}>
          <LessonNavigation lesson={lesson} lessons={lessons} />
          <Card
            title={lesson.title}
            sub={`Resumo Flash da aula ${lesson.lessonCode}`}
            action={<SummaryStatus lesson={lesson} />}
          >
            <Box sx={(theme) => ({
              p: { xs: 1.75, md: 2.5 },
              borderRadius: `${theme.brand.radius.lg}px`,
              border: `1px solid ${theme.vars.palette.surface.border}`,
              backgroundColor: theme.vars.palette.surface.sunken,
              ...theme.applyStyles("dark", {
                backgroundImage: `linear-gradient(135deg, ${theme.vars.palette.surface.overlay}, ${theme.vars.palette.surface.sunken})`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 28px ${theme.vars.palette.accent.primarySoft}`,
              }),
            })}>
              <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 800, letterSpacing: "0.1em" }}>
                Material de apoio da aula
              </Typography>
              <Typography variant="body1" component="p" sx={{ mt: 0.75, mb: 2 }}>
                Revise os pontos essenciais desta aula no Resumo Flash. O professor pode atualizar este material sem alterar o registro das questões.
              </Typography>
              {lesson.resources.flashSummary ? (
                <Button component="a" href={lesson.resources.flashSummary} target="_blank" rel="noopener noreferrer" variant="contained" endIcon={<ArrowOutwardIcon />} data-testid="lesson-summary-open">
                  Abrir resumo desta aula
                </Button>
              ) : (
                <Alert status="info">O professor ainda não adicionou o Resumo Flash desta aula.</Alert>
              )}
            </Box>
          </Card>
        </Box>
      </ContentBody>
    </>
  );
}

export function FlashSummaries() {
  const { hasPlan, lessons, lesson, requestedLesson } = useLoaderData() as LoaderData;
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("Todas");
  const groups = useMemo(() => {
    const result = new Map<string, TheoryLesson[]>();
    for (const item of lessons) {
      const list = result.get(item.subject) ?? [];
      list.push(item);
      result.set(item.subject, list);
    }
    return result;
  }, [lessons]);
  const subjects = [...groups.keys()];
  const availableCount = lessons.filter((item) => Boolean(item.resources.flashSummary)).length;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredLessons = lessons.filter((item) => {
    const matchesSubject = subject === "Todas" || item.subject === subject;
    const haystack = `${item.lessonCode} ${item.title} ${item.subject}`.toLocaleLowerCase("pt-BR");
    return matchesSubject && (!normalizedQuery || haystack.includes(normalizedQuery));
  });

  if (lesson) return <SelectedSummary lesson={lesson} lessons={lessons} />;

  return (
    <>
      <PageHeader
        title="Resumos Flash"
        description="A biblioteca de revisão rápida da preparação PRF"
        actions={<Button component={Link} to={ROUTES.student.theory} variant="outlined" size="small" startIcon={<MenuBookIcon />}>Ver aulas</Button>}
      />
      <ContentBody>
        {requestedLesson && !lesson && (
          <Alert status="warning">Aula não encontrada ou ainda não publicada pelo professor.</Alert>
        )}

        {!requestedLesson && !hasPlan && (
          <Alert status="info">Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.</Alert>
        )}

        {!requestedLesson && hasPlan && lessons.length === 0 && (
          <Empty icon="📄">Ainda não há aulas publicadas neste planejamento.</Empty>
        )}

        {!requestedLesson && hasPlan && lessons.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "215px minmax(0, 1fr)" }, gap: 1.5, alignItems: "start" }}>
            <Card title="Navegar" sub="Escolha a disciplina">
              <Box component="nav" aria-label="Disciplinas dos resumos flash" sx={{ display: "grid", gap: 0.5 }}>
                {["Todas", ...subjects].map((item) => (
                  <Button
                    key={item}
                    variant={subject === item ? "contained" : "text"}
                    color={subject === item ? "primary" : "inherit"}
                    onClick={() => setSubject(item)}
                    sx={{ justifyContent: "flex-start", textAlign: "left", fontWeight: subject === item ? 800 : 600, fontSize: "0.8rem" }}
                  >
                    {item}
                  </Button>
                ))}
              </Box>
            </Card>

            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Card title="Base de Resumos Flash" sub="Revisão organizada por disciplina e aula">
                <Box sx={(theme) => ({
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                  gap: 1,
                  mb: 1.5,
                  p: 1.25,
                  borderRadius: `${theme.brand.radius.md}px`,
                  backgroundColor: theme.vars.palette.surface.sunken,
                })}>
                  <Box><Typography variant="caption" color="text.secondary">Disciplinas</Typography><Typography variant="h2">{subjects.length}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Aulas publicadas</Typography><Typography variant="h2">{lessons.length}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Resumos disponíveis</Typography><Typography variant="h2" color="primary.main">{availableCount}</Typography></Box>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  label="Buscar aula ou disciplina"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary" }} /> }}
                />
              </Card>

              <Card title={subject === "Todas" ? "Todas as aulas" : subject} sub={`${filteredLessons.length} ${filteredLessons.length === 1 ? "aula" : "aulas"}`}>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                  {filteredLessons.map((item) => (
                    <Box key={item.id} sx={(theme) => ({
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      flexWrap: "wrap",
                      p: 1.25,
                      borderRadius: `${theme.brand.radius.md}px`,
                      border: `1px solid ${theme.vars.palette.surface.border}`,
                      backgroundColor: theme.vars.palette.surface.raised,
                      transition: theme.transitions.create(["border-color", "background-color"]),
                      "&:hover": { borderColor: theme.vars.palette.accent.primaryBorder, backgroundColor: theme.vars.palette.accent.primarySoft },
                    })}>
                      <DescriptionIcon color="primary" aria-hidden="true" />
                      <Box sx={{ flex: 1, minWidth: 190 }}>
                        <Typography variant="body2" component="p" sx={{ fontWeight: 800 }}>{item.lessonCode} · {item.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.subject}</Typography>
                      </Box>
                      <SummaryStatus lesson={item} />
                      <Button component={Link} to={ROUTES.student.flashSummaryForLesson(item.id)} size="small" variant="outlined">
                        Abrir aula
                      </Button>
                    </Box>
                  ))}
                  {filteredLessons.length === 0 && <Empty icon="🔎">Nenhuma aula corresponde à busca.</Empty>}
                </Box>
              </Card>
            </Box>
          </Box>
        )}
      </ContentBody>
    </>
  );
}
