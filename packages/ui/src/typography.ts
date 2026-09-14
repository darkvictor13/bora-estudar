import type { TypographyVariantsOptions } from '@mui/material/styles';
import { fontFamily, fontWeight, monoWeight } from './tokens.ts';

/**
 * A ESCALA DA v2, EM rem SOBRE 16px.
 *
 * A v2 é densa por duas razões somadas: `html,body{font-size:14px}` e os
 * paddings. Daqui sai a primeira. A raiz continua nos 16px do navegador de
 * propósito — fixá-la em 14px sequestra a preferência de quem aumentou o
 * tamanho da letra, e o MUI calcula `pxToRem` presumindo 16 —, então a
 * densidade vem dos valores, não da raiz: `body1` é 0.875rem, que dá os mesmos
 * 14px, e quem aumentou a fonte do navegador continua vendo texto maior.
 *
 * O mapa para a v2, em pixels:
 *
 * | variante      | px | de onde                          |
 * |---------------|----|----------------------------------|
 * | h1            | 20 | `.page-title` (18 abaixo de 700px) |
 * | h4            | 14 | `.card-title`                    |
 * | body1         | 14 | `html,body`                      |
 * | body2         | 13 | `td`, `.alert`, `.empty`, `.page-sub` |
 * | button        | 13 | `.btn`                           |
 * | caption       | 12 | `.card-sub`, `.form-label`       |
 * | overline      | 11 | `.section-title`                 |
 * | metric        | 26 | `.metric-value`                  |
 * | metricLabel   | 10 | `.metric-label`, `th`            |
 * | numeric       | 12 | `.mono`                          |
 */
export const typography: TypographyVariantsOptions = {
  fontFamily: fontFamily.sans,
  fontWeightRegular: fontWeight.regular,
  fontWeightMedium: fontWeight.medium,
  fontWeightBold: fontWeight.bold,

  // Título da página. Abaixo de 700px a v2 desce para 18px; o valor mora aqui
  // e não em `responsiveFontSizes` porque aquele SOBE a partir do declarado,
  // e nesta escala não há para onde subir.
  h1: {
    fontSize: '1.25rem',
    lineHeight: 1.3,
    fontWeight: fontWeight.bold,
    letterSpacing: '-0.025em',
    '@media (max-width:700px)': { fontSize: '1.125rem' },
  },
  h2: { fontSize: '1rem', lineHeight: 1.35, fontWeight: fontWeight.bold, letterSpacing: '-0.02em' },
  h3: {
    fontSize: '0.9375rem',
    lineHeight: 1.4,
    fontWeight: fontWeight.semibold,
    letterSpacing: '-0.015em',
  },
  h4: { fontSize: '0.875rem', lineHeight: 1.4, fontWeight: fontWeight.semibold },
  h5: { fontSize: '0.8125rem', lineHeight: 1.45, fontWeight: fontWeight.semibold },
  h6: { fontSize: '0.75rem', lineHeight: 1.45, fontWeight: fontWeight.semibold },

  subtitle1: { fontSize: '0.875rem', lineHeight: 1.5, fontWeight: fontWeight.medium },
  subtitle2: { fontSize: '0.8125rem', lineHeight: 1.5, fontWeight: fontWeight.medium },

  body1: { fontSize: '0.875rem', lineHeight: 1.6 },
  body2: { fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--mui-palette-text-secondary)' },

  button: {
    fontSize: '0.8125rem',
    lineHeight: 1.2,
    fontWeight: fontWeight.medium,
    textTransform: 'none',
  },
  caption: { fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--mui-palette-text-secondary)' },
  overline: {
    fontSize: '0.6875rem',
    lineHeight: 1.4,
    fontWeight: fontWeight.bold,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  },

  /**
   * O NÚMERO GRANDE DE UM KPI — `.metric-value` e `.desemp-pct` da v2.
   *
   * Sans, e leve: 26px em peso 300. Não é mono de propósito. Mono alinha
   * COLUNA de número, que é o caso de `numeric`; aqui o número aparece
   * sozinho, e o traço fino do 300 é o que impede um KPI de gritar mais alto
   * que o título da página.
   */
  metric: {
    fontFamily: fontFamily.sans,
    fontSize: '1.625rem',
    lineHeight: 1.15,
    fontWeight: 300,
    letterSpacing: '-0.03em',
  },

  /** O rótulo acima do número, e o `th` da tabela: 10px, versalete de caixa alta. */
  metricLabel: {
    fontFamily: fontFamily.sans,
    fontSize: '0.625rem',
    lineHeight: 1.4,
    fontWeight: fontWeight.semibold,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--mui-palette-text-secondary)',
  },

  /**
   * A FACE DOS NÚMEROS — o `.mono` da v2, que ela repete em 56 lugares.
   *
   * É o que faz coluna de porcentagem e de tempo alinhar: no mono todo
   * algarismo ocupa a mesma largura, então `9%` e `100%` empilhados não
   * dançam. Sem isto as tabelas e os KPIs perdem um alinhamento que ninguém
   * consegue nomear olhando a tela, mas que some.
   *
   * Peso 500 é o teto: DM Mono não publica negrito (ver `monoWeight`).
   */
  numeric: {
    fontFamily: fontFamily.mono,
    fontSize: '0.75rem',
    lineHeight: 1.4,
    fontWeight: monoWeight.medium,
    letterSpacing: '0.01em',
    fontVariantNumeric: 'tabular-nums',
  },
};
