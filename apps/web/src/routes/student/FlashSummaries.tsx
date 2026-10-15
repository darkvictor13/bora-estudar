import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutwardOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, PageHeader } from "@bora/ui";
import { useState } from "react";
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { SummaryLibrary, SummaryReader } from "@/components/student/SummaryLibrary";
import { api, type TheoryLesson } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function flashSummariesLoader({ request }: LoaderFunctionArgs) {
  await requireStudentAccess(request);
  const lessonId = new URL(request.url).searchParams.get("aula");
  const topicId = new URL(request.url).searchParams.get("resumo");
  const [topics, document] = await Promise.all([
    api.loadSummaryCatalog(),
    topicId ? api.loadSummaryDocument(topicId) : Promise.resolve(null),
  ]);
  const notes = document ? await api.loadSummaryNotes(document.id) : [];
  const plan = await api.loadActivePlanOrNull();
  const subjects = plan ? await api.loadTheoryControl(plan.id) : [];
  const lessons = subjects.flatMap((subject) => subject.lessons).filter((item) => item.published);

  return {
    hasPlan: Boolean(plan),
    lessons,
    lesson: lessonId ? lessons.find((item) => item.id === lessonId) ?? null : null,
    requestedLesson: Boolean(lessonId),
    topics,
    document,
    notes,
    requestedTopic: Boolean(topicId),
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
          <Button component={Link} to={`${ROUTES.student.flashSummaries}?origem=aulas`} variant="outlined" size="small" startIcon={<ArrowBackIcon />}>
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
  const { hasPlan, lessons, lesson, requestedLesson, topics, document, requestedTopic, notes } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const source = params.get("origem") === "aulas" || requestedLesson ? "aulas" : "biblioteca";
  const filteredLessons = lessons.filter(item => `${item.lessonCode} ${item.title} ${item.subject}`
    .toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  const availableCount = lessons.filter(item => Boolean(item.resources.flashSummary)).length;

  if (lesson) return <SelectedSummary lesson={lesson} lessons={lessons} />;
  if (document) return <SummaryReader key={document.id} document={document} topics={topics} initialNotes={notes} />;

  return <>
    <PageHeader title="Resumos Flash" description="Escolha uma disciplina e revise os tópicos do seu material"
      actions={<Button component={Link} to={ROUTES.student.theory} variant="outlined" size="small" startIcon={<MenuBookIcon />}>Ver aulas</Button>} />
    <ContentBody>
      {requestedTopic && <Alert status="warning">Resumo não encontrado.</Alert>}
      {requestedLesson && <Alert status="warning">Aula não encontrada ou ainda não publicada pelo professor.</Alert>}
      <Tabs value={source} onChange={(_, value: string) => setParams(value === "aulas" ? { origem: "aulas" } : {})}
        aria-label="Origem dos resumos" variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab value="biblioteca" label="Biblioteca PF 2029" id="summary-library-tab" aria-controls="summary-library-panel" />
        <Tab value="aulas" label="Resumos das aulas" id="summary-lessons-tab" aria-controls="summary-lessons-panel" />
      </Tabs>
      {source === "biblioteca" ? (
        <Box role="tabpanel" id="summary-library-panel" aria-labelledby="summary-library-tab">
          <SummaryLibrary topics={topics} />
        </Box>
      ) : (
        <Box role="tabpanel" id="summary-lessons-panel" aria-labelledby="summary-lessons-tab">
          <Card title="Resumos das aulas" sub={`${availableCount} ${availableCount === 1 ? "disponível" : "disponíveis"} · ${lessons.length} ${lessons.length === 1 ? "aula publicada" : "aulas publicadas"}`}>
            <TextField fullWidth size="small" label="Buscar aula ou disciplina" value={query} onChange={event => setQuery(event.target.value)} sx={{ mb: 2 }} />
            {!hasPlan ? <Alert status="info">Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.</Alert> : (
              <Box sx={{ display: "grid", gap: 1 }}>
                {filteredLessons.map(item => <Box key={item.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                  <DescriptionIcon color="primary" aria-hidden="true" />
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Typography variant="body2" sx={{ fontWeight: 750 }}>{item.lessonCode} · {item.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.subject}</Typography>
                  </Box>
                  <SummaryStatus lesson={item} />
                  <Button component={Link} to={ROUTES.student.flashSummaryForLesson(item.id)} size="small" variant="outlined">Abrir aula</Button>
                </Box>)}
                {!filteredLessons.length && <Empty>{lessons.length ? "Nenhuma aula corresponde à busca." : "Ainda não há aulas publicadas neste planejamento."}</Empty>}
              </Box>
            )}
          </Card>
        </Box>
      )}
    </ContentBody>
  </>;
}
