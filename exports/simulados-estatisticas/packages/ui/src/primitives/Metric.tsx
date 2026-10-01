import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Indicador de desempenho com contraste entre rótulo, número e contexto. */
export interface MetricProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly note?: string;
}

export function Metric({ label, value, note }: MetricProps) {
  return (
    <Box
      data-testid="metric"
      data-label={label}
      sx={(theme) => ({
        px: 2.25,
        py: 2,
        backgroundColor: theme.vars.palette.surface.raised,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: `${theme.brand.radius.lg}px`,
        ...theme.applyStyles('dark', {
          backgroundImage: `linear-gradient(145deg, ${theme.vars.palette.surface.overlay}, ${theme.vars.palette.surface.raised} 70%)`,
          boxShadow: '0 10px 22px -18px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        }),
        ...theme.applyStyles('light', { boxShadow: theme.vars.palette.elevation.sm }),
      })}
    >
      <Typography variant="metricLabel" component="p" sx={{ mb: 1 }}>
        {label}
      </Typography>
      <Typography variant="metric" component="p" data-testid="metric-value" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      {note && (
        <Typography variant="caption" component="p" sx={{ mt: 0.375 }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}
