import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId, useState, type ReactNode } from 'react';

/**
 * OS GRÁFICOS, EM SVG À MÃO.
 *
 * Sem biblioteca, e a ausência é decisão: cada uma traz seu próprio sistema de
 * cor, sua própria tipografia e uns 150 KB, e o trabalho passa a ser convencê-la
 * a não usar nada disso. O que este produto desenha são barras, uma linha e um
 * rótulo — o SVG cabe em menos código do que a configuração caberia.
 *
 * As regras que todos seguem, e que valem mais que o desenho:
 *
 * - **Uma série por gráfico.** Duas medidas de escalas diferentes viram dois
 *   gráficos, nunca dois eixos y — a sobreposição de duas escalas inventa uma
 *   correlação que não está no dado.
 * - **Uma cor por série, nunca uma rampa por valor.** Pintar a barra maior mais
 *   escura gasta o único canal livre repetindo o que o comprimento já diz.
 * - **Grade e eixo recuam.** Fio de um tom acima da superfície, sólido — traço
 *   pontilhado lê como "projeção" quando é só grade.
 * - **Rótulo direto é seletivo.** Um número em cada ponto não é lido; o eixo e a
 *   dica ao passar o ponteiro carregam o resto.
 * - **Toda figura tem tabela.** É o que sustenta leitor de tela, impressão em
 *   preto e branco e quem simplesmente quer o número.
 */

export interface Point {
  readonly label: string;
  readonly value: number;
}

export interface ChartFrameProps {
  readonly title: string;
  readonly description?: string;
  /** Como escrever o valor na tabela e na dica. */
  readonly format?: (value: number) => string;
  readonly points: readonly Point[];
  readonly children: ReactNode;
  readonly testId?: string;
}

/**
 * A moldura: título, a figura e a tabela que a acompanha.
 *
 * A tabela começa fechada e é um `<details>` de verdade — não um bloco escondido
 * por CSS. Quem usa leitor de tela a encontra pela navegação normal, e quem só
 * quer o número não precisa passar o ponteiro por doze barras.
 */
export function ChartFrame({
  title,
  description,
  format = String,
  points,
  children,
  testId,
}: ChartFrameProps) {
  const id = useId();

  return (
    <Box component="figure" data-testid={testId ?? 'chart'} sx={{ m: 0 }}>
      <Typography component="figcaption" variant="metricLabel" sx={{ display: 'block', mb: 0.25 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
          {description}
        </Typography>
      )}

      <Box aria-describedby={`${id}-table`} sx={{ position: 'relative' }}>
        {children}
      </Box>

      <Box
        component="details"
        id={`${id}-table`}
        sx={(theme) => ({
          mt: 1,
          fontSize: '0.75rem',
          color: theme.vars.palette.text.secondary,
          '& summary': { cursor: 'pointer' },
        })}
      >
        <summary>Ver os números</summary>
        <Box
          component="table"
          data-testid="chart-table"
          sx={(theme) => ({
            width: '100%',
            mt: 1,
            borderCollapse: 'collapse',
            '& th, & td': {
              textAlign: 'left',
              padding: '4px 8px',
              borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
            },
            '& td:last-of-type': { textAlign: 'right', ...theme.typography.numeric },
          })}
        >
          <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: 4 }}>
            {title}
          </caption>
          <tbody>
            {points.map((point) => (
              <tr key={point.label}>
                <th scope="row">{point.label}</th>
                <td>{format(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    </Box>
  );
}

/** A dica que segue o ponteiro. Um só por gráfico, posicionada em porcentagem. */
export function Tooltip({
  x,
  label,
  value,
}: {
  x: number;
  label: string;
  value: string;
}) {
  return (
    <Box
      role="status"
      data-testid="chart-tooltip"
      sx={(theme) => ({
        position: 'absolute',
        top: 0,
        left: `${x}%`,
        transform: 'translateX(-50%)',
        px: 1,
        py: 0.5,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        borderRadius: `${theme.brand.radius.sm}px`,
        backgroundColor: theme.vars.palette.surface.overlay,
        border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
        boxShadow: theme.vars.palette.elevation.md,
        fontSize: '0.6875rem',
        zIndex: 2,
      })}
    >
      <Box component="span" sx={{ opacity: 0.7 }}>
        {label}
      </Box>{' '}
      <Box component="span" sx={(theme) => ({ ...theme.typography.numeric })}>
        {value}
      </Box>
    </Box>
  );
}

export function useHover(): {
  hovered: number | null;
  onEnter: (index: number) => void;
  onLeave: () => void;
} {
  const [hovered, setHovered] = useState<number | null>(null);
  return { hovered, onEnter: setHovered, onLeave: () => setHovered(null) };
}
