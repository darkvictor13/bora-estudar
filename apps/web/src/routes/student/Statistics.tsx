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
import { api, type Statistics as StatisticsData } from "@/lib/api";
import { loadActivePlanOrNull } from "@/lib/api/supabase/plan.ts";
import { requireStudentAccess } from "@/lib/auth/session";
import { formatMinutes } from "@/lib/domain/week";

/**
 * Estatísticas do aluno — o `p-estatisticas` da v2.
 *
 * Cada gráfico tem UMA SÉRIE, e é por isso que nenhum tem legenda: o título já
 * nomeia o que está desenhado. Duas medidas de escalas diferentes viram dois
 * gráficos — nunca dois eixos y, que é a forma mais comum de um painel inventar
 * uma correlação que o dado não tem.
 */
export async function studentStatisticsLoader({ request }: { request: Request }) {
  await requireStudentAccess();

  const plan = await loadActivePlanOrNull();
  if (!plan) return { stats: null, years: [] as number[], year: new Date().getFullYear() };

  const asked = Number(new URL(request.url).searchParams.get("ano"));
  const thisYear = new Date().getFullYear();
  const year = Number.isFinite(asked) && asked > 2000 ? asked : thisYear;

  const stats = await api.loadStatistics({ studyPlanId: plan.id, year });
  // Do ano em que o planejamento começou até hoje: um seletor com 2019 numa
  // conta criada em 2026 é ruído.
  const firstYear = Number(plan.startsOn.slice(0, 4));
  const years = Array.from({ length: Math.max(1, thisYear - firstYear + 1) }, (_, i) => firstYear + i);

  return { stats, years, year };
}

type LoaderData = Awaited<ReturnType<typeof studentStatisticsLoader>>;

function Kpis({ stats }: { stats: StatisticsData }) {
  return (
    <Box
      sx={(theme) => ({
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1.25,
        mb: 1.75,
        [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
      })}
    >
      {/*
        A ROSCA DE ACERTO E ERRO DA v2 VIROU UM NÚMERO, e a troca é do método:
        uma rosca de duas fatias é um número desenhado de forma difícil de ler —
        a comparação que ela pede o olho faz pior do que a leitura direta.
      */}
      <Metric
        label="Desempenho"
        value={stats.score === null ? "—" : `${stats.score}%`}
        note={`${stats.correctAnswers}/${stats.questionsAnswered} acertos`}
      />
      <Metric label="Questões" value={stats.questionsAnswered} />
      <Metric label="Tempo estudado" value={formatMinutes(stats.studiedMinutes)} />
      <Metric label="Metas concluídas" value={stats.goalsCompleted} />
      <Metric
        label="Sequência"
        value={stats.streakDays}
        note={stats.streakDays === 1 ? "dia" : "dias"}
      />
    </Box>
  );
}

export function StudentStatistics() {
  const { stats, years, year } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();

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
        description="O que os seus registros dizem"
        actions={
          <TextField
            select
            size="small"
            label="Ano"
            slotProps={{ select: { inputProps: { "data-testid": "year-select" } } }}
            value={String(year)}
            onChange={(event) => {
              params.set("ano", event.target.value);
              setParams(params);
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
        <Kpis stats={stats} />

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
              <BarChart
                testId="chart-minutes-day"
                title="Tempo por dia"
                description="Os últimos 14 dias com registro."
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
                  description="O traço é a meta que seu professor definiu. Pior desempenho primeiro."
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
      </ContentBody>
    </>
  );
}
