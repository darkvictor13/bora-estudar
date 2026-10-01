import Box from '@mui/material/Box';

import { ChartFrame, Tooltip, useHover, type Point } from './Chart.tsx';
import { SinglePoint } from './SinglePoint.tsx';

/**
 * Barras verticais, uma série.
 *
 * A ponta da barra é arredondada em 4px e ANCORADA NA LINHA DE BASE: arredondar
 * os quatro cantos descola a barra do eixo e a faz parecer flutuar. O vão de 2px
 * entre barras é superfície, não borda — borda em volta da marca engorda o
 * desenho e some no modo escuro.
 */
export function BarChart({
  title,
  description,
  points,
  format = String,
  height = 160,
  testId,
}: {
  title: string;
  description?: string;
  points: readonly Point[];
  format?: (value: number) => string;
  height?: number;
  testId?: string;
}) {
  const { hovered, onEnter, onLeave } = useHover();

  // Menos de dois pontos não comparam nada: vira número, não desenho.
  if (points.length < 2) {
    return (
      <SinglePoint
        title={title}
        {...(description ? { description } : {})}
        point={points[0]}
        format={format}
        {...(testId ? { testId } : {})}
      />
    );
  }

  const max = Math.max(1, ...points.map((point) => point.value));

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={points}
      format={format}
      {...(testId ? { testId } : {})}
    >
      {/* O TETO DO EIXO, escrito. Sem ele o gráfico compara alturas entre si e
          nunca diz quanto vale a mais alta — e duas figuras lado a lado com
          escalas diferentes parecem comparáveis. */}
      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'flex-end',
          ...theme.typography.numeric,
          fontSize: '0.625rem',
          color: theme.vars.palette.text.secondary,
        })}
      >
        {format(max)}
      </Box>

      <Box
        onMouseLeave={onLeave}
        // CENTRADAS. Com três pontos e teto de largura, alinhar à esquerda
        // deixa metade do eixo vazia e o gráfico parece cortado.
        sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', height }}
      >
        {points.map((point, index) => {
          const ratio = point.value / max;
          return (
            <Box
              key={point.label}
              data-testid="chart-bar"
              data-label={point.label}
              data-value={point.value}
              onMouseEnter={() => onEnter(index)}
              sx={{
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                minWidth: 0,
                // Teto de largura: com três pontos a barra ocuparia um terço da
                // tela e viraria um bloco saturado. Marca fina é regra, e a
                // regra não pode depender de quantos pontos vieram.
                maxWidth: 56,
              }}
            >
              <Box
                sx={(theme) => ({
                  // Altura mínima de 2px: uma semana com valor zero precisa
                  // continuar sendo uma coluna, senão a barra some e a semana
                  // parece nunca ter existido.
                  height: `${Math.max(2, ratio * 100)}%`,
                  borderRadius: '4px 4px 0 0',
                  backgroundColor: theme.vars.palette.chart.series,
                  opacity: hovered === null || hovered === index ? 1 : 0.55,
                  transition: theme.transitions.create('opacity'),
                })}
              />
            </Box>
          );
        })}
      </Box>

      {/* O eixo é UM fio, um tom acima da superfície. */}
      <Box
        sx={(theme) => ({ height: '1px', backgroundColor: theme.vars.palette.chart.grid })}
      />

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: '2px', mt: 0.5 }}>
        {points.map((point, index) => (
          <Box
            key={point.label}
            sx={(theme) => ({
              flex: 1,
              minWidth: 0,
              // O mesmo teto da barra: sem ele o rótulo se espalha e deixa de
              // ficar embaixo da coluna que nomeia.
              maxWidth: 56,
              textAlign: 'center',
              fontSize: '0.625rem',
              color:
                hovered === index
                  ? theme.vars.palette.text.primary
                  : theme.vars.palette.text.secondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            })}
          >
            {point.label}
          </Box>
        ))}
      </Box>

      {hovered !== null && points[hovered] && (
        <Tooltip
          x={((hovered + 0.5) / points.length) * 100}
          label={points[hovered]!.label}
          value={format(points[hovered]!.value)}
        />
      )}
    </ChartFrame>
  );
}
