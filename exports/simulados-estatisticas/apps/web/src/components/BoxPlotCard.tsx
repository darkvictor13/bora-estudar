import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Card, Empty } from "@bora/ui";

import { calculateBoxPlot } from "@/lib/domain/boxplot";

const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function BoxPlotCard({ values, title, description, unit, marker, emptyMessage }: {
  values: readonly number[];
  title: string;
  description: string;
  unit: string;
  marker?: { readonly value: number; readonly label: string };
  emptyMessage?: string;
}) {
  const plot = calculateBoxPlot(values);
  return (
    <Card title={title} sub={description}>
      {!plot ? (
        <Empty>{emptyMessage ?? `O boxplot aparece quando houver pelo menos cinco ${unit} com questões respondidas no período.`}</Empty>
      ) : (
        <Box data-testid="boxplot" sx={{ display: "grid", gap: 1.25 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Mediana: <Box component="span" sx={{ color: "success.main", fontWeight: 850 }}>{percent.format(plot.median)}%</Box>
            <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}> · {plot.count} {unit}</Box>
          </Typography>
          <Box role="img" aria-label={`Distribuição de ${plot.count} ${unit}: mínimo ${percent.format(plot.min)}%, primeiro quartil ${percent.format(plot.q1)}%, mediana ${percent.format(plot.median)}%, terceiro quartil ${percent.format(plot.q3)}%, máximo ${percent.format(plot.max)}%`} sx={{ position: "relative", height: 64, mx: 1 }}>
            {[0, 25, 50, 75, 100].map((tick) => <Box key={tick} sx={(theme) => ({ position: "absolute", left: `${tick}%`, top: 4, bottom: 7, borderLeft: `1px dashed ${theme.vars.palette.surface.border}` })} />)}
            <Box sx={{ position: "absolute", top: 28, left: `${plot.lowerWhisker}%`, width: `${plot.upperWhisker - plot.lowerWhisker}%`, borderTop: "2px solid", borderColor: "text.secondary" }} />
            {[plot.lowerWhisker, plot.upperWhisker].map((value, index) => <Box key={index} sx={{ position: "absolute", top: 20, left: `${value}%`, height: 18, borderLeft: "2px solid", borderColor: "text.secondary" }} />)}
            <Box sx={(theme) => ({ position: "absolute", top: 12, left: `${plot.q1}%`, width: `${plot.q3 - plot.q1}%`, minWidth: 2, height: 34, borderRadius: `${theme.brand.radius.sm}px`, border: `2px solid ${theme.vars.palette.success.main}`, backgroundColor: theme.vars.palette.success.soft })} />
            <Box sx={{ position: "absolute", top: 12, left: `${plot.median}%`, height: 34, borderLeft: "3px solid", borderColor: "success.main" }} />
            {plot.outliers.map((value, index) => <Box key={`${value}-${index}`} sx={(theme) => ({ position: "absolute", top: 24, left: `${value}%`, width: 10, height: 10, transform: "translateX(-50%)", borderRadius: "50%", backgroundColor: theme.vars.palette.error.main, border: `2px solid ${theme.vars.palette.surface.raised}` })} />)}
            {marker && <Box data-testid="boxplot-marker" sx={(theme) => ({ position: "absolute", top: 2, left: `${Math.min(100, Math.max(0, marker.value))}%`, width: 12, height: 12, transform: "translateX(-50%)", borderRadius: "50%", backgroundColor: theme.vars.palette.primary.main, border: `2px solid ${theme.vars.palette.surface.raised}`, boxShadow: theme.vars.palette.elevation.sm })} />}
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", color: "text.secondary" }}>
            {[0, 25, 50, 75, 100].map((tick) => <Typography key={tick} variant="caption">{tick}%</Typography>)}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 0.5 }}>
            <Typography variant="caption">Mín. {percent.format(plot.min)}%</Typography>
            <Typography variant="caption">P25 (Q1) {percent.format(plot.q1)}%</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>P50 (mediana) {percent.format(plot.median)}%</Typography>
            <Typography variant="caption">P75 (Q3) {percent.format(plot.q3)}%</Typography>
            <Typography variant="caption">Máx. {percent.format(plot.max)}%</Typography>
          </Box>
          {marker && <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 800 }}>{marker.label}: {percent.format(marker.value)}%</Typography>}
          {plot.outliers.length > 0 && <Typography variant="caption" color="text.secondary">Pontos vermelhos indicam resultados fora de 1,5 vez o intervalo entre quartis.</Typography>}
        </Box>
      )}
    </Card>
  );
}
