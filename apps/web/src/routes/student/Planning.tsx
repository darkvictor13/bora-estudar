import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Metric, PageHeader } from "@bora/ui";
import { useLoaderData } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type StudyPlanSummary, type Subject } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";

/**
 * O planejamento, como o aluno o vê — o `p-planejamento` da v2.
 *
 * SÓ LEITURA, e é regra de produto: quem monta o planejamento é o professor.
 * A tela existe para o aluno entender o percurso do curso: concurso, período,
 * disciplinas e aulas liberadas. A rotina acompanha as aulas presenciais.
 */
export async function planningLoader() {
  await requireStudentAccess();

  const plan = await api.loadActivePlanOrNull();
  if (!plan) return { plan: null, subjects: [] as readonly Subject[], theory: [] as const };

  const [subjects, theory] = await Promise.all([api.loadSubjects(plan.id), api.loadTheoryControl(plan.id)]);
  return { plan, subjects, theory };
}

type LoaderData = Awaited<ReturnType<typeof planningLoader>>;

/** `2026-09-16` → `16/09/2026`. Sem `toLocaleDateString`: ele depende do fuso. */
function formatDate(date: string | null): string {
  if (!date) return "—";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function PlanIdentity({ plan }: { plan: StudyPlanSummary }) {
  const rows: readonly [string, string][] = [
    ["Área", plan.area],
    ["Concurso", plan.targetExam ?? "—"],
    ["Fase", plan.stage],
    ["Modelo de estudo", plan.studyModel],
    ["Base da rotina", "Aulas presenciais"],
    ["Início", formatDate(plan.startsOn)],
    ["Data da prova", formatDate(plan.examDate)],
  ];

  return (
    <Card title={plan.name} sub="Percurso definido pelo professor e pela sequência das aulas">
      <Box
        component="dl"
        sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2,
          m: 0,
          [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
          [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" },
        })}
      >
        {rows.map(([label, value]) => (
          <Box key={label}>
            <Typography variant="metricLabel" component="dt">
              {label}
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontSize: "0.875rem", fontWeight: 500 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

export function Planning() {
  const { plan, subjects, theory } = useLoaderData() as LoaderData;

  if (!plan) {
    return (
      <>
        <PageHeader title="Meu curso" />
        <ContentBody>
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        </ContentBody>
      </>
    );
  }

  const blocks = subjects.reduce((sum, subject) => sum + subject.blocks.length, 0);
  const lessons = theory.reduce((sum, subject) => sum + subject.lessonsTotal, 0);
  const lessonsDone = theory.reduce((sum, subject) => sum + subject.lessonsDone, 0);
  const theoryBySubject = new Map(theory.map((item) => [item.subject, item]));

  return (
    <>
      <PageHeader title="Meu curso" description="A sequência de estudo acompanha as aulas presenciais liberadas" />

      <ContentBody>
        <Box
          sx={(theme) => ({
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1.25,
            mb: 1.75,
            [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
          })}
        >
          <Metric label="Disciplinas" value={subjects.length} />
          <Metric label="Aulas liberadas" value={lessons} note={`${lessonsDone} concluídas`} />
          <Metric label="Blocos" value={blocks} />
          <Metric
            label="Situação"
            value={plan.status === "active" ? "Ativo" : plan.status}
            note={`Desde ${formatDate(plan.startsOn)}`}
          />
        </Box>

        <PlanIdentity plan={plan} />

        <Box sx={{ mt: 1.75 }}>
          <Card title="Percurso por disciplina" sub="As novas aulas aparecem conforme o professor publica o conteúdo presencial">
            {subjects.length === 0 ? (
              <Empty icon="📚">Seu professor ainda não cadastrou disciplinas.</Empty>
            ) : (
              subjects.map((subject) => (
                <Box
                  key={subject.id}
                  data-testid="cycle-row"
                  data-subject={subject.name}
                  sx={(theme) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: 1.125,
                    borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                    "&:last-of-type": { borderBottom: "none" },
                  })}
                >
                  {/* A listra de cor é a única coisa que identifica a matéria
                      num relance, e é da v2. Vem do professor, não da paleta. */}
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 3,
                      alignSelf: "stretch",
                      minHeight: 32,
                      borderRadius: 2,
                      backgroundColor: subject.color,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {subject.name}
                    </Typography>
                    <Typography variant="caption" component="p">
                      {subject.blocks.length}{" "}
                      {subject.blocks.length === 1 ? "bloco" : "blocos"} · meta de{" "}
                      {subject.targetScore}% de acerto
                    </Typography>
                  </Box>
                  <Badge tone="neutral">{theoryBySubject.get(subject.name)?.lessonsDone ?? 0}/{theoryBySubject.get(subject.name)?.lessonsTotal ?? 0} aulas</Badge>
                </Box>
              ))
            )}
          </Card>
        </Box>
      </ContentBody>
    </>
  );
}
