import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { ChartFrame } from './Chart.tsx';

export interface RankedRow {
  readonly label: string;
  readonly value: number;
  /** A meta daquela linha, 0-100. Vira um traço sobre a barra. */
  readonly target?: number;
  /** O que escrever ao lado, quando o valor sozinho não basta. */
  readonly note?: string;
}

/**
 * Barras horizontais com marca de meta — o desempenho por disciplina.
 *
 * SUBSTITUI O RADAR DA v2, e a troca tem motivo. Num radar a área cresce com o
 * QUADRADO do valor, então 80% parece mais que o dobro de 55%; a ordem dos
 * eixos, que é arbitrária, muda o formato da figura; e comparar dois pontos
 * distantes no círculo exige girar a cabeça. Barra horizontal responde a mesma
 * pergunta — quem está acima da meta — num relance, e ainda cabe o nome da
 * disciplina por extenso.
 *
 * UMA COR PARA TODAS AS BARRAS. Pintar cada uma conforme o valor gastaria o
 * único canal livre repetindo o que o comprimento já diz. Quem está abaixo da
 * meta é dito pelo TRAÇO da meta e pelo texto ao lado, não pela cor.
 */
export function RankedBars({
  title,
  description,
  rows,
  format = (value) => `${value}%`,
  testId,
}: {
  title: string;
  description?: string;
  rows: readonly RankedRow[];
  format?: (value: number) => string;
  testId?: string;
}) {
  const max = Math.max(100, ...rows.map((row) => row.value));

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={rows.map((row) => ({ label: row.label, value: row.value }))}
      format={format}
      {...(testId ? { testId } : {})}
    >
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {rows.map((row) => (
          <Box key={row.label} data-testid="ranked-row" data-label={row.label}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.375 }}>
              <Typography sx={{ fontSize: '0.75rem', minWidth: 0 }} noWrap>
                {row.label}
              </Typography>
              <Typography variant="numeric" component="span">
                {format(row.value)}
                {row.note ? ` · ${row.note}` : ''}
              </Typography>
            </Box>

            <Box
              role="img"
              aria-label={`${row.label}: ${format(row.value)}${
                row.target === undefined ? '' : `, meta ${format(row.target)}`
              }`}
              sx={(theme) => ({
                position: 'relative',
                height: 8,
                borderRadius: 999,
                backgroundColor: theme.vars.palette.surface.sunken,
                overflow: 'visible',
              })}
            >
              <Box
                sx={(theme) => ({
                  width: `${Math.min(100, (row.value / max) * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: theme.vars.palette.chart.series,
                })}
              />
              {row.target !== undefined && (
                // A meta é um TRAÇO, não uma segunda barra: uma segunda barra
                // seria uma segunda série, e a pergunta aqui é só "passou ou
                // não passou desta linha".
                <Box
                  data-testid="ranked-target"
                  sx={(theme) => ({
                    position: 'absolute',
                    top: -3,
                    bottom: -3,
                    left: `${Math.min(100, (row.target! / max) * 100)}%`,
                    width: 2,
                    borderRadius: 1,
                    backgroundColor: theme.vars.palette.text.primary,
                    opacity: 0.55,
                  })}
                />
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </ChartFrame>
  );
}
