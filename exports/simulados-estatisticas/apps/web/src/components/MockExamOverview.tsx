import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Card, Empty, Metric } from "@bora/ui";

import type { MockExamResult } from "@/lib/api";
import { calculateMockExamStatistics } from "@/lib/domain/mock-exams";
import { BoxPlotCard } from "@/components/BoxPlotCard";
import { formatScore } from "@/components/MockExamRanking";

const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function MockExamOverview({ results, maxScore, profileId, draft = false }: {
  readonly results: readonly MockExamResult[];
  readonly maxScore: number;
  readonly profileId?: string;
  readonly draft?: boolean;
}) {
  const stats = calculateMockExamStatistics(results, maxScore, profileId);
  if (!stats) return <Card title="Estatísticas do simulado"><Empty>As estatísticas aparecem depois do lançamento das notas.</Empty></Card>;

  const relation = stats.mine
    ? stats.mine.percent >= stats.medianPercent ? "acima ou na mediana" : "abaixo da mediana"
    : null;

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Card title={draft ? "Prévia das estatísticas" : "Estatísticas do simulado"} sub="Comparação válida porque todos realizaram o mesmo simulado">
        {stats.mine && stats.participants >= 5 && (
          <Box sx={(theme) => ({ mb: 1.5, p: 1.5, borderRadius: `${theme.brand.radius.md}px`, backgroundColor: theme.vars.palette.accent.primarySoft, border: `1px solid ${theme.vars.palette.primary.main}` })}>
            <Typography sx={{ fontWeight: 850 }}>Você ficou {relation} da turma.</Typography>
            <Typography variant="body2" color="text.secondary">Percentil {stats.mine.percentile}: resultado superior ao de aproximadamente {stats.mine.percentile}% dos participantes.</Typography>
          </Box>
        )}
        {stats.mine && stats.participants < 5 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>O percentil aparece após pelo menos cinco alunos receberem nota neste simulado.</Typography>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: stats.mine ? "repeat(5, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))" }, gap: 1.1 }}>
          {stats.mine && <Metric label="Seu resultado" value={formatScore(stats.mine.score)} note={percent(stats.mine.percent)} />}
          <Metric label="Média da turma" value={formatScore(stats.averageScore)} note={percent(stats.averagePercent)} />
          <Metric label="Mediana" value={formatScore(stats.medianScore)} note={percent(stats.medianPercent)} />
          <Metric label="Maior nota" value={formatScore(stats.highestScore)} note={percent(stats.highestPercent)} />
          <Metric label="Participantes" value={stats.participants} note={`de ${formatScore(maxScore)} pontos`} />
        </Box>
      </Card>
      <BoxPlotCard
        values={stats.percentages}
        title="Distribuição das notas"
        description="Quartis e mediana dos participantes com nota lançada neste simulado"
        unit="alunos"
        emptyMessage="A distribuição aparece quando pelo menos cinco alunos tiverem nota lançada."
        {...(stats.mine ? { marker: { value: stats.mine.percent, label: "Seu resultado" } } : {})}
      />
    </Box>
  );
}
