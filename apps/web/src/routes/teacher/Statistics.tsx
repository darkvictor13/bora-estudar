import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import {
  Alert,
  BarChart,
  Card,
  Empty,
  LineChart,
  Metric,
  PageHeader,
} from "@bora/ui";
import { useLoaderData, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { BoxPlotCard } from "@/components/BoxPlotCard";
import { QuestionAccuracyCard } from "@/components/QuestionAccuracyCard";
import { MonthlyStudyChart } from "@/components/MonthlyStudyChart";
import { SubjectPerformanceCard } from "@/components/SubjectPerformanceCard";
import { api, type ClassQuestionDistribution, type Statistics } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { formatMinutes } from "@/lib/domain/week";

/**
 * Estatísticas do professor — o `renderEstatisticas` da v2.
 *
 * É A MESMA TELA DO ALUNO, apontada para o planejamento de UM aluno. A
 * diferença não está nos gráficos; está em quem escolhe o recorte. Duplicar os
 * componentes para "a versão do professor" produziria duas verdades sobre o
 * mesmo número.
 */
export async function teacherStatisticsLoader({ request }: { request: Request }) {
  await requireRole("teacher", request);

  const [allPlans, classes] = await Promise.all([api.listPlans(), api.listClasses()]);
  const activePlans = allPlans.filter((plan) => plan.status === "active");
  const params = new URL(request.url).searchParams;
  const requestedPlan = activePlans.find((plan) => plan.id === params.get("plano"));
  const requestedClass = classes.find((entry) => entry.id === params.get("turma"));
  const classId = requestedClass?.id ?? requestedPlan?.classId ?? classes[0]?.id ?? null;
  const plans = classId ? activePlans.filter((plan) => plan.classId === classId) : activePlans;
  const planId = plans.find((plan) => plan.id === requestedPlan?.id)?.id ?? plans[0]?.id ?? null;
  const year = Number(params.get("ano")) || new Date().getFullYear();

  const [stats, questionDistribution] = await Promise.all([
    planId ? api.loadStatistics({ studyPlanId: planId, year }) : Promise.resolve(null),
    classId ? api.loadClassQuestionDistribution(classId, year) : Promise.resolve(null),
  ]);

  return {
    plans,
    classes,
    planId,
    classId,
    year,
    stats,
    questionDistribution,
  };
}

type LoaderData = Awaited<ReturnType<typeof teacherStatisticsLoader>>;

export function TeacherStatistics() {
  const { plans, classes, planId, classId, year, stats, questionDistribution } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }

  function setClass(value: string) {
    const next = new URLSearchParams(params);
    next.set("turma", value);
    // Cada turma tem seus próprios planejamentos. Manter o id anterior aqui
    // produziria a combinação visual "turma B + aluno da turma A".
    next.delete("plano");
    setParams(next);
  }

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description="Questões respondidas, aproveitamento e tempo de estudo"
        actions={
          <>
            <TextField
              select
              size="small"
              label="Turma"
              value={classId ?? ""}
              slotProps={{ select: { inputProps: { "data-testid": "stats-class" } } }}
              onChange={(event) => setClass(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              {classes.map((entry) => (
                <MenuItem key={entry.id} value={entry.id}>
                  {entry.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Planejamento"
              value={planId ?? ""}
              slotProps={{ select: { inputProps: { "data-testid": "stats-plan" } } }}
              onChange={(event) => setParam("plano", event.target.value)}
              sx={{ minWidth: 260 }}
            >
              {plans.map((plan) => (
                <MenuItem key={plan.id} value={plan.id}>
                  {plan.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Ano"
              value={String(year)}
              slotProps={{ select: { inputProps: { "data-testid": "stats-year" } } }}
              onChange={(event) => setParam("ano", event.target.value)}
              sx={{ minWidth: 120 }}
            >
              {years.map((option) => (
                <MenuItem key={option} value={String(option)}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </>
        }
      />

      <ContentBody>
        {!planId && (
          <Alert status="info">
            Esta turma não tem planejamento ativo. Ative um planejamento para ver as estatísticas dela.
          </Alert>
        )}

        {stats && <TeacherCharts stats={stats} year={year} />}
        <Box component="section" aria-label="Distribuição de acertos da turma" sx={{ mt: 2 }}>
          {questionDistribution ? <QuestionDistribution distribution={questionDistribution} year={year} /> : <Empty>Cadastre uma turma para acompanhar a distribuição dos acertos nas questões.</Empty>}
        </Box>
      </ContentBody>
    </>
  );
}
function QuestionDistribution({ distribution, year }: { distribution: ClassQuestionDistribution; year: number }) {
  return <>
    <BoxPlotCard values={distribution.scores} title="Aproveitamento nas questões · turma"
      description={`Distribuição em ${year}, por aluno da turma. Cada aluno precisa de pelo menos ${distribution.minimumQuestions} questões respondidas; esta é uma visão geral, sem comparar tópicos distintos.`}
      unit="alunos" emptyMessage={`Amostra insuficiente: são necessários pelo menos cinco alunos com ${distribution.minimumQuestions} ou mais questões respondidas em ${year}.`} />
    <Box sx={{ mt: 1, color: "text.secondary", fontSize: 13 }}>
      {distribution.scores.length} de {distribution.studentsWithActivePlan} alunos com planejamento ativo entram na distribuição · {distribution.studentsWithQuestions} responderam alguma questão · {distribution.enrolledStudents} matriculados na turma.
    </Box>
  </>;
}

function TeacherCharts({ stats, year }: { stats: Statistics; year: number }) {
  const semDado = stats.questionsAnswered === 0 && stats.studiedMinutes === 0;

  return (
    <>
      <Box sx={{ mb: 1.5 }}>
        <QuestionAccuracyCard questions={stats.questionsAnswered} correctAnswers={stats.correctAnswers} />
      </Box>
      <Box
        sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 1.25,
          mb: 1.75,
          [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
        })}
      >
        <Metric label="Questões" value={stats.questionsAnswered} />
        <Metric label="Tempo" value={formatMinutes(stats.studiedMinutes)} />
        <Metric label="Metas concluídas" value={stats.goalsCompleted} />
        <Metric label="Sequência" value={stats.streakDays} />
      </Box>

      {semDado ? (
        <Empty icon="📊">Nenhum registro em {year}.</Empty>
      ) : (
        <Box
          sx={(theme) => ({
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1.5,
            [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
          })}
        >
          <Card>
            <LineChart
              testId="chart-score-week"
              title="Desempenho por semana"
              points={stats.scoreByWeek}
              format={(value) => `${value}%`}
            />
          </Card>
          <Card>
            <BarChart
              testId="chart-questions-week"
              title="Questões por semana"
              points={stats.questionsByWeek}
            />
          </Card>
          <Card>
            <LineChart
              testId="chart-minutes-day"
              title="Tempo por dia"
              points={stats.minutesByDay}
              format={formatMinutes}
            />
          </Card>
          <Card>
            <MonthlyStudyChart points={stats.minutesByMonth} />
          </Card>
          <Box sx={{ gridColumn: "1 / -1" }}>
            <SubjectPerformanceCard subjects={stats.bySubject} />
          </Box>
        </Box>
      )}
    </>
  );
}
