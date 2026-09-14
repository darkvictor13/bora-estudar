import type { Components, Theme } from '@mui/material/styles';
import { fontFamily, fontWeight, monoWeight, motion, radius } from './tokens.ts';

const transition = (props: string[]) =>
  props.map((p) => `${p} ${motion.duration.normal}ms ${motion.easing.standard}`).join(', ');

/**
 * Overrides de componente.
 *
 * REGRA: nada de cor literal aqui. Tudo sai de `theme.vars.palette.*`, que
 * são CSS variables — trocam de valor quando o modo muda, sem re-render.
 * Para o que não é cor (só um estilo difere por modo), use `theme.applyStyles`.
 */
export const components: Components<Omit<Theme, 'components'>> = {
  /* ---------------------------------------------------------------- *
   * Base
   * ---------------------------------------------------------------- */
  MuiCssBaseline: {
    styleOverrides: (theme) => ({
      html: {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textSizeAdjust: '100%',
      },
      body: {
        backgroundColor: theme.vars.palette.surface.base,
        color: theme.vars.palette.text.primary,
        minHeight: '100vh',
        /**
         * O `body` NÃO TRANSICIONA, e a ausência é deliberada.
         *
         * Havia aqui `transition: background-color, color`. Duas coisas
         * quebravam:
         *
         * 1. `color` é HERDADO. Animá-lo no `body` anima a cor de cada nó de
         *    texto da aplicação ao mesmo tempo, e durante os 180ms o texto não
         *    é de nenhum dos dois temas — o F-TEMA-07 mediu 2.33:1 num título
         *    que, parado, dá 18:1.
         * 2. A transição pega a PRIMEIRA aplicação do estilo, não só a troca.
         *    O estilo do `body` e as variáveis de cor são injetados pelo
         *    Emotion em tempo de execução; se o `body` chega antes das
         *    variáveis, o fundo sai do branco para o preto ao longo de 180ms —
         *    que é exatamente a piscada que o script embutido de `index.html`
         *    existe para impedir.
         *
         * Trocar de tema é ação explícita e rara. Trocar de uma vez é honesto,
         * é o que a v2 fazia, e não deixa a tela num estado intermediário que
         * nenhum dos dois temas descreve. As transições continuam onde valem:
         * hover, foco, largura da sidebar.
         */
      },
      '::selection': {
        backgroundColor: theme.vars.palette.accent.primarySoftHover,
        color: theme.vars.palette.text.primary,
      },
      '*::-webkit-scrollbar': { width: 10, height: 10 },
      '*::-webkit-scrollbar-track': { background: theme.vars.palette.surface.base },
      '*::-webkit-scrollbar-thumb': {
        background: theme.vars.palette.surface.borderStrong,
        borderRadius: radius.pill,
        border: `2px solid ${theme.vars.palette.surface.base}`,
      },
      '*::-webkit-scrollbar-thumb:hover': { background: theme.vars.palette.text.disabled },
      // Foco visível só por teclado, sempre em verde-água.
      '*:focus-visible': {
        outline: 'none',
        boxShadow: theme.vars.palette.accent.focusRing,
        borderRadius: radius.sm,
      },
      code: { fontFamily: fontFamily.mono, fontSize: '0.875em' },
    }),
  },

  /* ---------------------------------------------------------------- *
   * Superfícies
   * ---------------------------------------------------------------- */
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundImage: 'none', // sem o overlay que o MUI aplica no dark
        backgroundColor: theme.vars.palette.surface.raised,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: radius.lg,
        transition: transition(['background-color', 'border-color']),
      }),
      outlined: ({ theme }) => ({ borderColor: theme.vars.palette.surface.border }),
    },
  },

  MuiCard: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.raised,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: radius.lg,
        transition: transition(['border-color', 'box-shadow', 'transform', 'background-color']),
        // No claro o card já nasce com sombra; no preto, sombra não aparece.
        ...theme.applyStyles('light', { boxShadow: theme.vars.palette.elevation.sm }),
      }),
    },
  },
  MuiCardHeader: {
    styleOverrides: {
      root: { padding: '20px 20px 8px' },
      title: { fontSize: '1rem', fontWeight: fontWeight.semibold },
      subheader: ({ theme }) => ({ fontSize: '0.8125rem', color: theme.vars.palette.text.secondary }),
    },
  },
  MuiCardContent: {
    styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } },
  },
  MuiCardActions: {
    styleOverrides: { root: { padding: '8px 20px 20px', gap: 8 } },
  },

  MuiAppBar: {
    defaultProps: { elevation: 0, color: 'transparent' },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.base,
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: 0,
        color: theme.vars.palette.text.primary,
        // translucidez só onde o blur rende: precisa do valor com alpha.
        ...theme.applyStyles('dark', { backgroundColor: 'rgba(0, 0, 0, 0.72)' }),
        ...theme.applyStyles('light', { backgroundColor: 'rgba(255, 255, 255, 0.78)' }),
      }),
    },
  },

  MuiDrawer: {
    styleOverrides: {
      paper: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.raised,
        borderRadius: 0,
        borderRight: `1px solid ${theme.vars.palette.surface.border}`,
        backgroundImage: 'none',
      }),
    },
  },

  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.overlay,
        borderRadius: radius.xl,
        boxShadow: theme.vars.palette.elevation.xl,
      }),
    },
  },
  MuiDialogTitle: {
    styleOverrides: {
      root: { fontSize: '1.125rem', fontWeight: fontWeight.semibold, padding: '24px 24px 8px' },
    },
  },
  MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px' } } },
  MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8 } } },
  MuiBackdrop: {
    styleOverrides: {
      root: ({ theme }) => ({ backgroundColor: theme.vars.palette.surface.scrim }),
    },
  },

  MuiDivider: {
    styleOverrides: {
      root: ({ theme }) => ({ borderColor: theme.vars.palette.surface.border }),
    },
  },

  /* ---------------------------------------------------------------- *
   * Ações
   * ---------------------------------------------------------------- */
  MuiButtonBase: { defaultProps: { disableRipple: true } },

  MuiButton: {
    defaultProps: { disableElevation: true, variant: 'contained' },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.md,
        fontWeight: fontWeight.semibold,
        textTransform: 'none',
        transition: transition(['background-color', 'border-color', 'color', 'box-shadow']),
        '&.Mui-disabled': {
          color: theme.vars.palette.text.disabled,
          backgroundColor: theme.vars.palette.action.disabledBackground,
          borderColor: 'transparent',
        },
      }),
      sizeSmall: { padding: '5px 12px', fontSize: '0.8125rem' },
      sizeMedium: { padding: '8px 16px' },
      sizeLarge: { padding: '11px 22px', fontSize: '0.9375rem' },

      containedPrimary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.fill.primary,
        color: theme.vars.palette.fill.primaryText,
        '&:hover': {
          backgroundColor: theme.vars.palette.fill.primaryHover,
          boxShadow: theme.vars.palette.elevation.glowPrimary,
        },
        '&:active': { backgroundColor: theme.vars.palette.fill.primaryActive },
      }),
      containedSecondary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.fill.secondary,
        color: theme.vars.palette.fill.secondaryText,
        '&:hover': {
          backgroundColor: theme.vars.palette.fill.secondaryHover,
          boxShadow: theme.vars.palette.elevation.glowSecondary,
        },
        '&:active': { backgroundColor: theme.vars.palette.fill.secondaryActive },
      }),

      outlinedPrimary: ({ theme }) => ({
        borderColor: theme.vars.palette.accent.primaryBorder,
        color: theme.vars.palette.accent.primary,
        '&:hover': {
          borderColor: theme.vars.palette.accent.primary,
          backgroundColor: theme.vars.palette.accent.primarySoft,
        },
      }),
      outlinedSecondary: ({ theme }) => ({
        borderColor: theme.vars.palette.accent.secondaryBorder,
        color: theme.vars.palette.accent.secondary,
        '&:hover': {
          borderColor: theme.vars.palette.accent.secondary,
          backgroundColor: theme.vars.palette.accent.secondarySoft,
        },
      }),
      outlinedInherit: ({ theme }) => ({
        borderColor: theme.vars.palette.surface.controlBorder,
        color: theme.vars.palette.text.primary,
      }),

      textPrimary: ({ theme }) => ({
        color: theme.vars.palette.accent.primary,
        '&:hover': { backgroundColor: theme.vars.palette.accent.primarySoft },
      }),
      textSecondary: ({ theme }) => ({
        color: theme.vars.palette.accent.secondary,
        '&:hover': { backgroundColor: theme.vars.palette.accent.secondarySoft },
      }),
    },
  },

  MuiIconButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.sm,
        color: theme.vars.palette.text.secondary,
        transition: transition(['background-color', 'color']),
        '&:hover': {
          backgroundColor: theme.vars.palette.surface.hover,
          color: theme.vars.palette.text.primary,
        },
      }),
    },
  },

  MuiToggleButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.md,
        borderColor: theme.vars.palette.surface.controlBorder,
        color: theme.vars.palette.text.secondary,
        textTransform: 'none',
        fontWeight: fontWeight.medium,
        '&.Mui-selected': {
          backgroundColor: theme.vars.palette.accent.primarySoft,
          color: theme.vars.palette.accent.primary,
          borderColor: theme.vars.palette.accent.primaryBorder,
          '&:hover': { backgroundColor: theme.vars.palette.accent.primarySoftHover },
        },
      }),
    },
  },

  MuiFab: {
    styleOverrides: {
      primary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.fill.primary,
        color: theme.vars.palette.fill.primaryText,
        '&:hover': { backgroundColor: theme.vars.palette.fill.primaryHover },
      }),
    },
  },

  MuiLink: {
    defaultProps: { underline: 'hover' },
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.accent.secondary,
        textUnderlineOffset: '0.2em',
        transition: transition(['color']),
      }),
    },
  },

  /* ---------------------------------------------------------------- *
   * Formulários
   * ---------------------------------------------------------------- */
  MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },

  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.sunken,
        borderRadius: radius.md,
        transition: transition(['border-color', 'background-color', 'box-shadow']),
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.vars.palette.surface.controlBorder,
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.vars.palette.text.secondary,
        },
        '&.Mui-focused': {
          backgroundColor: theme.vars.palette.surface.raised,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.vars.palette.accent.primary,
            borderWidth: 1,
          },
          boxShadow: theme.vars.palette.accent.primaryFocus,
        },
        '&.Mui-error.Mui-focused': { boxShadow: 'none' },
        '&.Mui-disabled': { backgroundColor: theme.vars.palette.action.disabledBackground },
      }),
      input: ({ theme }) => ({
        /**
         * 16px NO CELULAR, e não é preferência de tamanho.
         *
         * O Safari do iOS dá zoom na página inteira ao focar um campo cuja
         * letra é menor que 16px, e não desfaz o zoom ao sair: a pessoa
         * preenche o segundo campo com a tela deslocada. A v2 resolvia isso na
         * mesma regra, em `mobile-tablet.css`. Acima de `sm` a densidade da v2
         * volta a valer.
         */
        [theme.breakpoints.down('sm')]: { fontSize: '1rem' },
        '&::placeholder': { color: theme.vars.palette.text.disabled, opacity: 1 },
        // mata o autofill azul do Chrome
        '&:-webkit-autofill': {
          WebkitBoxShadow: `0 0 0 1000px ${theme.vars.palette.surface.sunken} inset`,
          WebkitTextFillColor: theme.vars.palette.text.primary,
          caretColor: theme.vars.palette.text.primary,
        },
      }),
    },
  },

  MuiFilledInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.sunken,
        borderRadius: radius.md,
        '&:hover, &.Mui-focused': { backgroundColor: theme.vars.palette.surface.sunken },
      }),
    },
  },

  MuiInputLabel: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.text.secondary,
        '&.Mui-focused': { color: theme.vars.palette.accent.primary },
      }),
    },
  },

  MuiFormHelperText: {
    styleOverrides: { root: { marginLeft: 2, fontSize: '0.75rem' } },
  },

  MuiFormControlLabel: {
    styleOverrides: {
      // O Switch tem padding 0 (para o track ficar justo), então o espaçamento
      // entre controle e texto precisa vir daqui — só quando há label.
      root: { '& .MuiSwitch-root': { marginLeft: 11, marginRight: 9 } },
      label: { fontSize: '0.875rem' },
    },
  },

  MuiCheckbox: {
    defaultProps: { disableRipple: true },
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.surface.controlBorder,
        borderRadius: radius.xs,
        '&.Mui-checked, &.MuiCheckbox-indeterminate': {
          color: theme.vars.palette.accent.primary,
        },
      }),
    },
  },

  MuiRadio: {
    defaultProps: { disableRipple: true },
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.surface.controlBorder,
        '&.Mui-checked': { color: theme.vars.palette.accent.primary },
      }),
    },
  },

  MuiSwitch: {
    styleOverrides: {
      root: { width: 44, height: 24, padding: 0, borderRadius: radius.pill },
      switchBase: ({ theme }) => ({
        padding: 3,
        '&.Mui-checked': {
          transform: 'translateX(20px)',
          color: theme.vars.palette.common.white,
          '& + .MuiSwitch-track': {
            backgroundColor: theme.vars.palette.accent.secondary,
            opacity: 1,
          },
        },
      }),
      thumb: ({ theme }) => ({
        width: 18,
        height: 18,
        boxShadow: 'none',
        backgroundColor: theme.vars.palette.common.white,
      }),
      track: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.controlBorder,
        opacity: 1,
        borderRadius: radius.pill,
      }),
    },
  },

  MuiSlider: {
    styleOverrides: {
      root: ({ theme }) => ({ color: theme.vars.palette.accent.primary, height: 4 }),
      rail: ({ theme }) => ({ backgroundColor: theme.vars.palette.surface.borderStrong, opacity: 1 }),
      thumb: ({ theme }) => ({
        width: 16,
        height: 16,
        backgroundColor: theme.vars.palette.common.white,
        border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
        '&:hover, &.Mui-focusVisible': { boxShadow: theme.vars.palette.accent.primaryFocus },
      }),
      valueLabel: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.overlay,
        color: theme.vars.palette.text.primary,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: radius.sm,
        fontSize: '0.75rem',
      }),
    },
  },

  MuiSelect: {
    styleOverrides: {
      icon: ({ theme }) => ({ color: theme.vars.palette.text.secondary }),
    },
  },

  /* ---------------------------------------------------------------- *
   * Navegação e feedback
   * ---------------------------------------------------------------- */
  MuiTabs: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: 42,
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
      }),
      indicator: ({ theme }) => ({
        height: 2,
        backgroundColor: theme.vars.palette.accent.primary,
        borderRadius: radius.pill,
      }),
    },
  },
  MuiTab: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: 42,
        textTransform: 'none',
        fontWeight: fontWeight.medium,
        color: theme.vars.palette.text.secondary,
        '&:hover': { color: theme.vars.palette.text.primary },
        '&.Mui-selected': {
          color: theme.vars.palette.accent.primary,
          fontWeight: fontWeight.semibold,
        },
      }),
    },
  },

  MuiMenu: {
    styleOverrides: {
      paper: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.overlay,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: radius.md,
        boxShadow: theme.vars.palette.elevation.lg,
        marginTop: 4,
      }),
      list: { padding: 6 },
    },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.sm,
        fontSize: '0.875rem',
        minHeight: 36,
        '&:hover': { backgroundColor: theme.vars.palette.surface.hover },
        '&.Mui-selected': {
          backgroundColor: theme.vars.palette.accent.primarySoft,
          color: theme.vars.palette.accent.primary,
          '&:hover': { backgroundColor: theme.vars.palette.accent.primarySoftHover },
        },
      }),
    },
  },

  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.sm,
        '&:hover': { backgroundColor: theme.vars.palette.surface.hover },
        '&.Mui-selected': {
          backgroundColor: theme.vars.palette.accent.primarySoft,
          '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
            color: theme.vars.palette.accent.primary,
          },
          '&:hover': { backgroundColor: theme.vars.palette.accent.primarySoftHover },
        },
      }),
    },
  },
  MuiListItemIcon: {
    styleOverrides: {
      root: ({ theme }) => ({ color: theme.vars.palette.text.secondary, minWidth: 36 }),
    },
  },

  MuiChip: {
    styleOverrides: {
      // O `.badge` da v2: 11px em DM Mono, com algarismo de largura fixa. É um
      // dos 56 lugares em que o mono é a face do número, e não enfeite — uma
      // coluna de chips de porcentagem só alinha assim.
      root: {
        borderRadius: radius.sm,
        fontFamily: fontFamily.mono,
        fontWeight: monoWeight.medium,
        fontSize: '0.6875rem',
        letterSpacing: '0.01em',
        fontVariantNumeric: 'tabular-nums',
      },
      filled: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.sunken,
        color: theme.vars.palette.text.primary,
        border: `1px solid ${theme.vars.palette.surface.border}`,
      }),
      outlined: ({ theme }) => ({ borderColor: theme.vars.palette.surface.borderStrong }),
      filledPrimary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.accent.primarySoft,
        color: theme.vars.palette.accent.primary,
        borderColor: theme.vars.palette.accent.primaryBorder,
      }),
      filledSecondary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.accent.secondarySoft,
        color: theme.vars.palette.accent.secondary,
        borderColor: theme.vars.palette.accent.secondaryBorder,
      }),
      deleteIcon: { color: 'inherit', opacity: 0.6, '&:hover': { opacity: 1, color: 'inherit' } },
    },
  },

  MuiBadge: {
    styleOverrides: {
      // `.dashboard-tab-count` da v2: contador de aba, 10px em mono.
      badge: {
        fontFamily: fontFamily.mono,
        fontWeight: monoWeight.medium,
        fontSize: '0.625rem',
        fontVariantNumeric: 'tabular-nums',
      },
      colorPrimary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.fill.primary,
        color: theme.vars.palette.fill.primaryText,
      }),
    },
  },

  MuiAvatar: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.sunken,
        color: theme.vars.palette.text.primary,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        fontSize: '0.875rem',
        fontWeight: fontWeight.semibold,
      }),
    },
  },

  MuiTooltip: {
    defaultProps: { arrow: true },
    styleOverrides: {
      tooltip: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.overlay,
        color: theme.vars.palette.text.primary,
        border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
        borderRadius: radius.sm,
        fontSize: '0.75rem',
        padding: '6px 10px',
        boxShadow: theme.vars.palette.elevation.md,
      }),
      arrow: ({ theme }) => ({ color: theme.vars.palette.surface.overlay }),
    },
  },

  MuiAlert: {
    defaultProps: { variant: 'outlined' },
    styleOverrides: {
      root: { borderRadius: radius.md, alignItems: 'center' },

      /**
       * Os quatro papéis, cada um com a PRÓPRIA cor.
       *
       * Antes o sucesso saía em verde-petróleo — a cor de apoio da marca — e
       * os outros três dividiam `surface.hover` de fundo. O resultado era um
       * "sucesso" que parecia informação e três avisos que só se distinguiam
       * pela letra. Aqui cada um usa a tríade do seu papel: `soft` no fundo,
       * `border` no limite, `main` no texto. As três saem de `semantic`.
       */
      outlinedSuccess: ({ theme }) => ({
        borderColor: theme.vars.palette.success.border,
        backgroundColor: theme.vars.palette.success.soft,
        color: theme.vars.palette.success.main,
      }),
      outlinedInfo: ({ theme }) => ({
        borderColor: theme.vars.palette.info.border,
        backgroundColor: theme.vars.palette.info.soft,
        color: theme.vars.palette.info.main,
      }),
      outlinedWarning: ({ theme }) => ({
        borderColor: theme.vars.palette.warning.border,
        backgroundColor: theme.vars.palette.warning.soft,
        color: theme.vars.palette.warning.main,
      }),
      outlinedError: ({ theme }) => ({
        borderColor: theme.vars.palette.error.border,
        backgroundColor: theme.vars.palette.error.soft,
        color: theme.vars.palette.error.main,
      }),
      icon: { color: 'inherit' },
    },
  },

  MuiLinearProgress: {
    styleOverrides: {
      root: ({ theme }) => ({
        height: 6,
        borderRadius: radius.pill,
        backgroundColor: theme.vars.palette.surface.sunken,
      }),
      bar: { borderRadius: radius.pill },
    },
  },

  MuiSkeleton: {
    defaultProps: { animation: 'wave' },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.sunken,
        borderRadius: radius.sm,
      }),
    },
  },

  /* ---------------------------------------------------------------- *
   * Dados
   * ---------------------------------------------------------------- */
  MuiTableCell: {
    styleOverrides: {
      // `td` da v2: 13px, padding 10/14.
      root: ({ theme }) => ({
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        fontSize: '0.8125rem',
        padding: '10px 14px',
      }),
      // `th` da v2: 10px em caixa alta — o cabeçalho é rótulo, não texto.
      head: ({ theme }) => ({
        backgroundColor: theme.vars.palette.surface.sunken,
        color: theme.vars.palette.text.secondary,
        fontWeight: fontWeight.semibold,
        fontSize: '0.625rem',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }),
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: ({ theme }) => ({ '&:hover': { backgroundColor: theme.vars.palette.surface.hover } }),
    },
  },
  MuiTableContainer: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.lg,
        border: `1px solid ${theme.vars.palette.surface.border}`,
      }),
    },
  },

  /* ---------------------------------------------------------------- *
   * Tipografia
   * ---------------------------------------------------------------- */
  MuiTypography: {
    defaultProps: {
      /**
       * As três variantes nossas não estão no mapa do MUI, e variante
       * desconhecida cai em `<span>`. `metric` e `numeric` são números — `<p>`
       * daria um bloco onde o número quase sempre vive dentro de uma linha —, e
       * `metricLabel` é rótulo.
       */
      variantMapping: {
        metric: 'div',
        metricLabel: 'span',
        numeric: 'span',
      },
    },
  },
};
