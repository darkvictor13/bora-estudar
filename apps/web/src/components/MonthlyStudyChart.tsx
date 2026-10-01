import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SeriesPoint } from "@/lib/api";
import { formatMinutes } from "@/lib/domain/week";

export function MonthlyStudyChart({ points }: { points: readonly SeriesPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return <Box component="figure" data-testid="chart-minutes-month" sx={{ m: 0 }}>
    <Typography component="figcaption" variant="metricLabel">Tempo por mês</Typography>
    <Typography variant="caption" component="p" sx={{ mb: 2 }}>Compare as horas registradas em cada mês.</Typography>
    <Box sx={{ display: "grid", gap: 1.5, minHeight: 180, alignContent: "center" }}>
      {points.length === 0 && <Typography color="text.secondary">Nenhum tempo registrado.</Typography>}
      {points.map((point) => <Box key={point.label} sx={{ display: "grid", gridTemplateColumns: "38px minmax(0, 1fr) 68px", gap: 1.25, alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>{point.label}</Typography>
        <Box aria-hidden="true" sx={(theme) => ({ height: 14, borderRadius: 99, bgcolor: theme.vars.palette.surface.sunken })}>
          <Box sx={{ height: "100%", width: `${point.value / max * 100}%`, borderRadius: 99, bgcolor: "primary.main" }} />
        </Box>
        <Typography variant="numeric" sx={{ textAlign: "right", fontWeight: 700 }}>{formatMinutes(point.value)}</Typography>
      </Box>)}
    </Box>
  </Box>;
}
