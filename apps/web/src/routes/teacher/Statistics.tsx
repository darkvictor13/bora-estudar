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
  RankedBars,
} from "@bora/ui";
import { useLoaderData, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type Statistics } from "@/lib/api";
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
  await requireRole("teacher");

  const plans = (await api.listPlans()).filter((plan) => plan.status === "active");
  const params = new URL(request.url).searchParams;
  const planId = params.get("plano") ?? plans[0]?.id ?? null;
  const year = Number(params.get("ano")) || new Date().getFullYear();

  return {
    plans,
    planId,
    year,
    stats: planId ? await api.loadStatistics({ studyPlanId: planId, year }) : null,
  };
}

type LoaderData = Awaited<ReturnType<typeof teacherStatisticsLoader>>;

export function TeacherStatistics() {
  const { plans, planId, year, stats } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();

  function setParam(key: string, value: string) {
    params.set(key, value);
    setParams(params);
  }

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description="Por planejamento"
        actions={
          <>
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
            Nenhum planejamento ativo. Ative um planejamento para ver as estatísticas dele.
          </Alert>
        )}

        {stats && <TeacherCharts stats={stats} year={year} />}
      </ContentBody>
    </>
  );
}

function TeacherCharts({ stats, year }: { stats: Statistics; year: number }) {
  const semDado = stats.questionsAnswered === 0 && stats.studiedMinutes === 0;

  return (
    <>
      <Box
        sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 1.25,
          mb: 1.75,
          [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
        })}
      >
        <Metric
          label="Desempenho"
          value={stats.score === null ? "—" : `${stats.score}%`}
          note={`${stats.correctAnswers}/${stats.questionsAnswered} acertos`}
        />
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
            <BarChart
              testId="chart-minutes-day"
              title="Tempo por dia"
              points={stats.minutesByDay}
              format={formatMinutes}
            />
          </Card>
          <Card>
            <BarChart
              testId="chart-minutes-month"
              title="Tempo por mês"
              points={stats.minutesByMonth}
              format={formatMinutes}
            />
          </Card>
          <Box sx={{ gridColumn: "1 / -1" }}>
            <Card>
              <RankedBars
                testId="chart-by-subject"
                title="Desempenho por disciplina"
                description="O traço é a meta. Pior desempenho primeiro."
                rows={stats.bySubject.map((subject) => ({
                  label: subject.subject,
                  value: subject.score,
                  target: subject.targetScore,
                  note: `${subject.correctAnswers}/${subject.questions}`,
                }))}
              />
            </Card>
          </Box>
        </Box>
      )}
    </>
  );
}
