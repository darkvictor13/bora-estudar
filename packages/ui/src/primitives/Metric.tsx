import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/**
 * O KPI da v2 — `.metric`: rótulo em versalete, número grande, nota embaixo.
 *
 * O número usa a variante `metric` (sans, 26px, peso 300) e NÃO o mono. Mono é
 * a face de COLUNA de número, onde a largura fixa do algarismo é o que alinha;
 * aqui o número aparece sozinho, e o traço fino do 300 é o que impede um KPI
 * de gritar mais alto que o título da página.
 */
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
        transition: theme.transitions.create(['transform', 'box-shadow']),
        ...theme.applyStyles('light', { boxShadow: theme.vars.palette.elevation.sm }),
        '&:hover': { transform: 'translateY(-1px)', boxShadow: theme.vars.palette.elevation.lg },
      })}
    >
      <Typography variant="metricLabel" component="p" sx={{ mb: 1 }}>
        {label}
      </Typography>
      <Typography variant="metric" component="p" data-testid="metric-value">
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
