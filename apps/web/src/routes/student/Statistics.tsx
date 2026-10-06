import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
import { useState } from "react";

import { ContentBody } from "@/components/AppShell";
import { StudentBoxPlot } from "@/components/StudentBoxPlot";
import { PerformanceOverview, StudyTimeDistribution, PerformanceTables } from "@/components/StatisticsReferencePanels";
import { StudyStreakDialog } from "@/components/student/StudyStreakDialog";
import { MonthlyStudyChart } from "@/components/MonthlyStudyChart";
import { SubjectPerformanceCard } from "@/components/SubjectPerformanceCard";
import { api, type Statistics as StatisticsData, type WeeklyQuestionComparison, type SubjectPeerComparison } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { formatDayMonth } from "@/lib/domain/dates";
import { questionAccuracy } from "@/lib/domain/question-performance";
import { formatMinutes } from "@/lib/domain/week";

/**
 * Estatísticas do aluno — o `p-estatisticas` da v2.
 *
 * Os gráficos temporais mantêm uma série por medida. A única barra de duas
 * cores divide o mesmo total de respostas entre acertos e erros.
 */
export async function studentStatisticsLoader({ request }: { request: Request }) {
  await requireStudentAccess(request);
  const params = new URL(request.url).searchParams;

  const plan = await api.loadActivePlanOrNull();
  if (!plan) return { stats: null, comparison: [] as readonly WeeklyQuestionComparison[], subjectPeers: [] as readonly SubjectPeerComparison[], years: [] as number[], year: new Date().getFullYear(), startsOn: null as string | null };

  const asked = Number(params.get("ano"));
  const thisYear = new Date().getFullYear();
  const year = Number.isFinite(asked) && asked > 2000 ? asked : thisYear;

  const [stats, comparison, subjectPeers] = await Promise.all([
    api.loadStatistics({ studyPlanId: plan.id, year }),
    api.loadStudentWeeklyQuestionComparison(year),
    api.loadStudentSubjectPeerComparison(year),
  ]);
  // Do ano em que o planejamento começou até hoje: um seletor com 2019 numa
  // conta criada em 2026 é ruído.
  const firstYear = Number(plan.startsOn.slice(0, 4));
  const years = Array.from({ length: Math.max(1, thisYear - firstYear + 1) }, (_, i) => firstYear + i);

  return { stats, comparison, subjectPeers, years, year, startsOn: plan.startsOn };
}

type LoaderData = Awaited<ReturnType<typeof studentStatisticsLoader>>;

function Kpis({ stats, onOpenStreak }: { stats: StatisticsData; onOpenStreak: () => void }) {
  return (
    <Box
      sx={(theme) => ({
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 1.25,
        mb: 1.75,
        [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
      })}
    >
      <Metric label="Tempo estudado" value={formatMinutes(stats.studiedMinutes)} />
      <Metric label="Metas concluídas" value={stats.goalsCompleted} />
      <Box component="button" type="button" onClick={onOpenStreak} aria-label="Abrir calendário de constância dos estudos" sx={{ border: 0, p: 0, background: "none", textAlign: "left", cursor: "pointer", borderRadius: 2, "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 3 } }}>
        <Metric label="Sequência" value={stats.streakDays} note={stats.streakDays === 1 ? "dia de estudo · ver dias" : "dias de estudo · ver dias"} />
      </Box>
    </Box>
  );
}

function StudentComparison({ comparison }: { comparison: readonly WeeklyQuestionComparison[] }) {
  return (
    <StudentBoxPlot
      boxes={comparison.map((week) => ({
        label: `S${week.weekNumber}`,
        summary: week.distribution ? { count: week.sampleSize, ...week.distribution, outliers: [] as readonly number[] } : null,
        studentScore: week.studentScore,
        sampleSize: week.sampleSize,
        minimumQuestions: week.minimumQuestions,
        studentQuestions: week.studentQuestions,
      }))}
      emptyMessage="O comparativo aparece quando houver questões registradas nas semanas do planejamento ativo."
    />
  );
}

export function StudentStatistics() {
  const { stats, comparison, subjectPeers, years, year, startsOn } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();
  const [streakOpen, setStreakOpen] = useState(false);

  if (!stats) {
    return (
      <>
        <PageHeader title="Estatísticas" />
        <ContentBody>
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        </ContentBody>
      </>
    );
  }

  const semDado = stats.questionsAnswered === 0 && stats.studiedMinutes === 0;

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description="Seu aprendizado medido pelos acertos e erros nas questões"
        actions={
          <TextField
            select
            size="small"
            label="Ano"
            slotProps={{ select: { inputProps: { "data-testid": "year-select" } } }}
            value={String(year)}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              next.set("ano", event.target.value);
              setParams(next);
            }}
            sx={{ minWidth: 140 }}
          >
            {years.map((option) => (
              <MenuItem key={option} value={String(option)}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        }
      />

      <ContentBody>
        <Box sx={{ mb: 1.5 }}>
          <PerformanceOverview stats={stats} subjectPeers={subjectPeers} />
        </Box>
        <Box sx={{ mb: 2 }}><StudyTimeDistribution stats={stats} /></Box>
        <Box sx={{ mb: 2 }}><PerformanceTables stats={stats} /></Box>
        <Kpis stats={stats} onOpenStreak={() => setStreakOpen(true)} />

        <Box sx={{ mb: 1.75 }}><StudentComparison comparison={comparison} /></Box>

        <Box component="details" sx={{ mb: 1.75 }}><Typography component="summary" sx={{ cursor: "pointer", fontWeight: 750, py: 1.5 }}>Ver aprendizagem por dia</Typography><Card title="Aprendizagem por dia" sub="Respostas registradas nos últimos 14 dias; leitura de materiais não altera o aproveitamento">
            {stats.dailyQuestions.length === 0 ? (
              <Empty>Nenhuma questão respondida nos últimos 14 dias.</Empty>
            ) : (
              <Box data-testid="daily-questions" sx={{ display: "grid", gap: 0.75 }}>
                {stats.dailyQuestions.map((day) => {
                  const accuracy = questionAccuracy(day.questions, day.correctAnswers);
                  return <Box key={day.date} data-testid="daily-question-row" sx={(theme) => ({
                    display: "grid",
                    gridTemplateColumns: "72px minmax(0, 1fr) 120px",
                    gap: 1.5,
                    alignItems: "center",
                    px: 1.5,
                    py: 1,
                    borderRadius: `${theme.brand.radius.md}px`,
                    backgroundColor: theme.vars.palette.surface.sunken,
                    [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr", gap: 0.6 },
                  })}>
                    <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                      {formatDayMonth(day.date)}
                    </Typography>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{day.questions} questões respondidas</Typography>
                      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                        <Typography variant="caption" sx={{ color: "success.main", fontWeight: 800 }}>
                          {day.correctAnswers} acertos · {accuracy.correctPercent?.toLocaleString("pt-BR")}%
                        </Typography>
                        <Typography variant="caption" sx={{ color: "error.main", fontWeight: 800 }}>
                          {day.wrongAnswers} erros · {accuracy.wrongPercent?.toLocaleString("pt-BR")}%
                        </Typography>
                      </Box>
                    </Box>
                    <Box role="img" aria-label={`${accuracy.correctPercent?.toLocaleString("pt-BR")}% de acertos e ${accuracy.wrongPercent?.toLocaleString("pt-BR")}% de erros`} sx={(theme) => ({ display: "flex", height: 10, overflow: "hidden", borderRadius: 99, backgroundColor: theme.vars.palette.surface.raised })}>
                      <Box sx={{ width: `${accuracy.correctPercent}%`, backgroundColor: "success.main" }} />
                      <Box sx={{ flex: 1, backgroundColor: "error.main" }} />
                    </Box>
                  </Box>;
                })}
              </Box>
            )}
          </Card>
        </Box>

        <Box component="details" sx={{ mt: 2 }}>
        <Typography component="summary" sx={{ cursor: "pointer", fontWeight: 750, py: 1.5 }}>Evolução semanal, tempo e colunas por disciplina</Typography>
        {semDado ? (
          <Empty icon="📊">
            Nenhum registro em {year}. Assim que você registrar estudo, os gráficos aparecem aqui.
          </Empty>
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
                description="Acertos sobre questões da semana — não a média das porcentagens."
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
                description="Os últimos 14 dias com registro."
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
        </Box>
      </ContentBody>
      {startsOn && <StudyStreakDialog open={streakOpen} onClose={() => setStreakOpen(false)} startsOn={startsOn} />}
    </>
  );
}
