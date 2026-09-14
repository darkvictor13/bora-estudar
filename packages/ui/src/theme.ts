import { createTheme, type CssVarsTheme, type Theme } from '@mui/material/styles';
import type * as React from 'react';
import { components } from './components.ts';
import { darkPalette, lightPalette } from './palette.ts';
import { breakpoints, motion, radius, type SchemeTokens, spacingUnit, zIndex } from './tokens.ts';
import { typography } from './typography.ts';

/* ------------------------------------------------------------------ *
 * Extensões tipadas
 * ------------------------------------------------------------------ */
declare module '@mui/material/styles' {
  /**
   * Liga a superfície de CSS variables na TIPAGEM do MUI.
   *
   * O runtime já a liga por `cssVariables` no `createTheme`; os tipos, não — o
   * MUI esconde `theme.vars`, `colorSchemeNode` e `storageManager` atrás desta
   * interface para que quem não usa variáveis não veja props que não
   * funcionam. Sem esta linha, `<ThemeProvider colorSchemeNode={null}>` não
   * compila, e é justamente a prop que impede o MUI de disputar o
   * `data-theme` com a conta.
   */
  interface CssThemeVariables {
    enabled: true;
  }

  /** Chaves nossas dentro da palette — viram CSS variables e trocam com o modo. */
  interface Palette {
    surface: SchemeTokens['surface'];
    accent: SchemeTokens['accent'];
    fill: SchemeTokens['fill'];
    elevation: SchemeTokens['elevation'];
    chart: SchemeTokens['chart'];
  }
  interface PaletteOptions {
    surface?: SchemeTokens['surface'];
    accent?: SchemeTokens['accent'];
    fill?: SchemeTokens['fill'];
    elevation?: SchemeTokens['elevation'];
    chart?: SchemeTokens['chart'];
  }

  /**
   * As duas metades fracas de uma cor de papel: o fundo e o limite do aviso.
   *
   * Ficam DENTRO da cor, e não numa chave irmã, para o MUI emiti-las como
   * `--mui-palette-success-soft` e `--mui-palette-success-border`. Ver
   * `palette.ts`.
   */
  interface PaletteColor {
    soft: string;
    border: string;
  }
  interface SimplePaletteColorOptions {
    soft?: string;
    border?: string;
  }
  /** `cssVariables` está sempre ligado, então `theme.vars` sempre existe. */
  interface Theme {
    vars: CssVarsTheme['vars'];
    brand: { radius: typeof radius; motion: typeof motion };
  }
  interface ThemeOptions {
    brand?: Theme['brand'];
  }

  /** As três variantes da v2 que não têm slot no MUI. Ver `typography.ts`. */
  interface TypographyVariants {
    metric: React.CSSProperties;
    metricLabel: React.CSSProperties;
    numeric: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    metric?: React.CSSProperties;
    metricLabel?: React.CSSProperties;
    numeric?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    metric: true;
    metricLabel: true;
    numeric: true;
  }
}

/**
 * A escala de elevação do MUI aponta para as CSS variables, então as sombras
 * também trocam entre claro e escuro (no preto, sombra difusa não aparece —
 * lá os valores viram borda + glow).
 */
const v = (name: keyof SchemeTokens['elevation']) => `var(--mui-palette-elevation-${name})`;
const shadows = [
  'none',
  v('sm'),
  v('sm'),
  v('md'),
  v('md'),
  ...Array<string>(8).fill(v('lg')),
  ...Array<string>(12).fill(v('xl')),
] as Theme['shadows'];

/**
 * Tema único com os dois modos.
 *
 * QUEM MANDA NO MODO É O ATRIBUTO `data-theme` DO `<html>`, e quem escreve
 * nesse atributo é `apps/web/src/lib/theme.ts` — nunca o MUI. A preferência
 * deste produto mora na conta (`user_preferences.theme`), não no aparelho, e o
 * `<html>` já chega pintado por um script embutido em `index.html` que roda
 * antes do primeiro paint.
 *
 * `colorSchemeSelector: 'data-theme'` faz o MUI emitir os blocos de variável
 * como `:root, [data-theme="light"]` e `[data-theme="dark"]` — exatamente os
 * dois valores que aquele script e aquele módulo já usam. O lado React do
 * `useColorScheme` fica desligado pelo `<ThemeProvider colorSchemeNode={null}
 * storageManager={null}>` do site; sem isso o MUI leria `mui-mode` do
 * `localStorage` na montagem e sobrescreveria, na frente de quem escolheu, o
 * tema que veio da conta.
 *
 * Consequência a lembrar ao escrever override: `theme.palette.*` congela no
 * `defaultColorScheme` (claro). Cor sempre por `theme.vars.palette.*`.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-theme' },
  colorSchemes: {
    dark: { palette: darkPalette },
    light: { palette: lightPalette },
  },
  // Claro é o default do produto: quem nunca escolheu não tem linha em
  // `user_preferences`, e a ausência equivale a claro (R-TEMA-07). O `:root`
  // precisa ser esse modo, porque o script anti-flash só marca o `<html>`
  // quando o tema é escuro.
  defaultColorScheme: 'light',

  breakpoints: { values: breakpoints },
  typography,
  components,
  shadows,
  spacing: spacingUnit,
  shape: { borderRadius: radius.md },
  zIndex,
  transitions: {
    duration: {
      shortest: motion.duration.fast,
      shorter: motion.duration.fast,
      short: motion.duration.normal,
      standard: motion.duration.normal,
      complex: motion.duration.slow,
      enteringScreen: motion.duration.normal,
      leavingScreen: motion.duration.fast,
    },
    easing: {
      easeInOut: motion.easing.standard,
      easeOut: motion.easing.emphasized,
      easeIn: motion.easing.standard,
      sharp: motion.easing.standard,
    },
  },
  brand: { radius, motion },
});

export default theme;
