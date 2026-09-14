import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { Point } from './Chart.tsx';

/**
 * UM PONTO NÃO É UM GRÁFICO — é um número.
 *
 * Uma barra sozinha ocupa a largura inteira e vira um bloco saturado que não
 * compara nada com nada; uma linha de um ponto é um ponto solto no vazio. Nos
 * dois casos a forma promete uma leitura — "veja a tendência" — que o dado não
 * tem. O número escrito por extenso diz a mesma coisa sem prometer.
 *
 * O gráfico volta sozinho a partir do segundo ponto, porque aí há o que
 * comparar.
 */
export function SinglePoint({
  title,
  description,
  point,
  format,
  testId,
}: {
  title: string;
  description?: string;
  point: Point | undefined;
  format: (value: number) => string;
  testId?: string;
}) {
  return (
    <Box component="figure" data-testid={testId ?? 'chart'} data-single="true" sx={{ m: 0 }}>
      <Typography component="figcaption" variant="metricLabel" sx={{ display: 'block', mb: 0.25 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
          {description}
        </Typography>
      )}

      {point ? (
        <>
          <Typography variant="metric" component="p" data-testid="chart-single-value">
            {format(point.value)}
          </Typography>
          <Typography variant="caption" component="p">
            {point.label} · a comparação aparece a partir do segundo período
          </Typography>
        </>
      ) : (
        <Typography variant="body2">Sem registro no período.</Typography>
      )}
    </Box>
  );
}
