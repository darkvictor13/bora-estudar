import type { PaletteOptions } from '@mui/material/styles';
import { amber, neutral, petrol, type SchemeTokens, schemes } from './tokens.ts';

/**
 * Converte um scheme de tokens em `PaletteOptions` do MUI.
 *
 * As chaves `surface`, `accent`, `fill` e `elevation` são extensões nossas:
 * como ficam dentro da palette, o MUI gera CSS variables para elas
 * (`--mui-palette-surface-raised`, etc.) e elas trocam sozinhas com o modo.
 */
const toPalette = (s: SchemeTokens, mode: 'light' | 'dark'): PaletteOptions => ({
  mode,

  // primary.main é o âmbar VIVO nos dois modos: ele só aparece como
  // preenchimento, e o quase-preto sobre #FFB700 passa 10.5:1 em qualquer fundo.
  primary: {
    main: s.fill.primary,
    light: amber[300],
    dark: amber[700],
    contrastText: s.fill.primaryText,
    soft: s.accent.primarySoft,
    border: s.accent.primaryBorder,
  },
  secondary: {
    main: s.fill.secondary,
    light: petrol[500],
    dark: petrol[800],
    contrastText: s.fill.secondaryText,
    soft: s.accent.secondarySoft,
    border: s.accent.secondaryBorder,
  },

  // `soft` e `border` são extensões nossas, e existem por uma razão prática:
  // aviso deste produto é sempre a tríade fundo-fraco + limite + texto, nunca
  // um bloco chapado. Os três valores já estavam em `semantic`, mas fora da
  // palette — e fora da palette o MUI não gera CSS variable, então nem
  // `theme.vars` nem o CSS legado alcançavam. Ver a augmentation de
  // `PaletteColor` em theme.ts.
  error: {
    main: s.semantic.error,
    soft: s.semantic.errorSoft,
    border: s.semantic.errorBorder,
    contrastText: s.semantic.contrastText,
  },
  warning: {
    main: s.semantic.warning,
    soft: s.semantic.warningSoft,
    border: s.semantic.warningBorder,
    contrastText: s.semantic.contrastText,
  },
  info: {
    main: s.semantic.info,
    soft: s.semantic.infoSoft,
    border: s.semantic.infoBorder,
    contrastText: s.semantic.contrastText,
  },
  success: {
    main: s.semantic.success,
    soft: s.semantic.successSoft,
    border: s.semantic.successBorder,
    contrastText: s.semantic.contrastText,
  },

  background: {
    default: s.surface.base,
    paper: s.surface.raised,
  },
  text: {
    primary: s.text.primary,
    secondary: s.text.secondary,
    disabled: s.text.disabled,
  },
  divider: s.surface.border,

  action: {
    active: s.text.secondary,
    hover: s.surface.hover,
    hoverOpacity: 0.06,
    selected: s.surface.selected,
    selectedOpacity: 0.12,
    disabled: s.text.disabled,
    disabledBackground: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,18,20,0.07)',
    focus: s.accent.secondarySoft,
    focusOpacity: 0.2,
  },

  grey: {
    50: neutral[50],
    100: neutral[100],
    200: neutral[200],
    300: neutral[300],
    400: neutral[400],
    500: neutral[500],
    600: neutral[600],
    700: neutral[700],
    800: neutral[800],
    900: neutral[900],
    A100: neutral[100],
    A200: neutral[200],
    A400: neutral[400],
    A700: neutral[700],
  },

  // Extensões — ver a augmentation de `Palette` em theme.ts.
  surface: s.surface,
  accent: s.accent,
  fill: s.fill,
  elevation: s.elevation,
  chart: s.chart,
});

export const darkPalette = toPalette(schemes.dark, 'dark');
export const lightPalette = toPalette(schemes.light, 'light');
