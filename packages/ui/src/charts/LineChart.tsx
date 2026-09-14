import Box from '@mui/material/Box';

import { ChartFrame, Tooltip, useHover, type Point } from './Chart.tsx';
import { SinglePoint } from './SinglePoint.tsx';

/**
 * Uma linha, uma série — a evolução no tempo.
 *
 * Traço de 2px e marcador de 8px: o marcador é o alvo do ponteiro e precisa ser
 * maior que o traço, senão a dica só aparece por sorte. O anel de superfície de
 * 2px em volta do marcador é o que o separa da linha quando os dois se cruzam.
 *
 * SEM LEGENDA, porque há uma série só — o título já a nomeia. Legenda de um item
 * é ruído.
 */
export function LineChart({
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
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * step : 50,
    y: 100 - (point.value / max) * 100,
  }));

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={points}
      format={format}
      {...(testId ? { testId } : {})}
    >
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

      <Box onMouseLeave={onLeave} sx={{ position: 'relative', height }}>
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          sx={{ width: '100%', height: '100%', overflow: 'visible' }}
        >
          {/* Três fios de grade, sólidos. Pontilhado lê como limite ou projeção. */}
          {[0, 50, 100].map((y) => (
            <Box
              component="line"
              key={y}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              sx={(theme) => ({ stroke: theme.vars.palette.chart.grid, strokeWidth: 1 })}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <Box
            component="path"
            d={path}
            fill="none"
            vectorEffect="non-scaling-stroke"
            sx={(theme) => ({
              stroke: theme.vars.palette.chart.series,
              strokeWidth: 2,
              strokeLinejoin: 'round',
              strokeLinecap: 'round',
            })}
          />
        </Box>

        {/* Os marcadores e os alvos do ponteiro ficam em HTML, e não no SVG:
            o `preserveAspectRatio="none"` estica o desenho, e um círculo
            esticado vira elipse. */}
        {coords.map((coord, index) => (
          <Box
            key={points[index]!.label}
            data-testid="chart-point"
            data-label={points[index]!.label}
            data-value={points[index]!.value}
            onMouseEnter={() => onEnter(index)}
            sx={{
              position: 'absolute',
              left: `${coord.x}%`,
              top: `${coord.y}%`,
              width: 24,
              height: 24,
              transform: 'translate(-50%, -50%)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'default',
            }}
          >
            <Box
              sx={(theme) => ({
                width: hovered === index ? 10 : 8,
                height: hovered === index ? 10 : 8,
                borderRadius: '50%',
                backgroundColor: theme.vars.palette.chart.series,
                boxShadow: `0 0 0 2px ${theme.vars.palette.surface.raised}`,
                transition: theme.transitions.create(['width', 'height']),
              })}
            />
          </Box>
        ))}

        {hovered !== null && points[hovered] && (
          <Tooltip
            x={coords[hovered]!.x}
            label={points[hovered]!.label}
            value={format(points[hovered]!.value)}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', mt: 0.5 }}>
        {points.map((point, index) => (
          <Box
            key={point.label}
            sx={(theme) => ({
              flex: 1,
              textAlign: 'center',
              fontSize: '0.625rem',
              color:
                hovered === index
                  ? theme.vars.palette.text.primary
                  : theme.vars.palette.text.secondary,
            })}
          >
            {point.label}
          </Box>
        ))}
      </Box>
    </ChartFrame>
  );
}
