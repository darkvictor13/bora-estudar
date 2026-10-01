/**
 * Design tokens — fonte única de verdade.
 *
 * Duas camadas:
 *  1. ESCALAS cruas (aqua / petrol / neutral) — iguais nos dois modos.
 *  2. SCHEMES (light / dark) — o papel que cada cor cumpre em cada modo.
 *
 * Componentes nunca leem a camada 1 direto: leem `theme.vars.palette.*`,
 * que é gerado a partir da camada 2 e troca sozinho quando o modo muda.
 */

/* ------------------------------------------------------------------ *
 * 1. Escalas
 * ------------------------------------------------------------------ */

/**
 * Âmbar — cor de ação. Mais quente e um pouco mais fechada que o amarelo puro,
 * o que a torna legível como texto até uns dois degraus mais cedo.
 */
export const amber = {
  50: '#FFF9E8',
  100: '#FEEEBE',
  200: '#FDDF87',
  300: '#FDD053',
  400: '#FFC629',
  500: '#FFB700', // fill da marca, nos dois modos
  600: '#DB9200',
  700: '#B27100',
  800: '#855000', // acento legível no claro (6.2:1 sobre surface.base)
  900: '#5A3402',
} as const;

/** Verde folha de apoio, mais fechado que o verde principal. */
export const petrol = {
  50: '#EEF8F4',
  100: '#D8EEE5',
  200: '#B4DFCD',
  300: '#8DCDB5',
  400: '#66BC9A',
  500: '#3EA77F',
  600: '#22865F',
  700: '#146A4A',
  800: '#0C5037',
  900: '#073A29',
} as const;

/* --- Paleta anterior (amarelo vivo + turquesa). Nada aponta mais para elas;
       ficam aqui para comparar ou voltar atrás trocando as referências
       de `amber`/`petrol` nos schemes abaixo. --- */

export const yellow = {
  50: '#FFFBE5',
  100: '#FFF4B8',
  200: '#FFEC85',
  300: '#FFE452',
  400: '#FFDC2B',
  500: '#FFD400',
  600: '#E6BC00',
  700: '#B89400',
  800: '#7D6400',
  900: '#5C4A00',
} as const;

export const aqua = {
  50: '#E7FDF9',
  100: '#C7F9F0',
  200: '#9BF3E3',
  300: '#75EAD5',
  400: '#58E4CA',
  500: '#2DE1C0',
  600: '#14C8A7',
  700: '#0A9E83',
  800: '#057661',
  900: '#045244',
} as const;

/** Neutros, do branco (0) ao preto (1000). */
export const neutral = {
  0: '#FFFFFF',
  25: '#FAFBFC',
  50: '#F5F6F7',
  75: '#EFF1F3',
  100: '#DCDFE3',
  200: '#B4B9C0',
  300: '#868C94',
  400: '#5A5F66',
  500: '#3D4147',
  600: '#2A2D31',
  700: '#1C1E21',
  800: '#141517',
  900: '#0E0F10',
  950: '#08090A',
  1000: '#000000',
} as const;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** hexToRgba('#FFD400', 0.12) -> 'rgba(255, 212, 0, 0.12)' */
export const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

/** Preto de referência do modo claro — usado nas sombras e bordas. */
const ink = '#0F1214';

/* ------------------------------------------------------------------ *
 * 2. Schemes
 * ------------------------------------------------------------------ */

export interface SchemeTokens {
  /** Hierarquia de superfícies e traços. */
  surface: {
    base: string;
    raised: string;
    overlay: string;
    sunken: string;
    border: string;
    borderStrong: string;
    /**
     * O LIMITE DE UM CONTROLE — campo, caixa de seleção, botão sem
     * preenchimento. Separado de `border` e `borderStrong` porque cumpre uma
     * regra que os outros dois não precisam cumprir: a WCAG 1.4.11 exige 3:1
     * em componente de interface, e borda de cartão não é componente de
     * interface.
     *
     * `border` (12% de alfa) dá 1.3:1 sobre branco e `borderStrong` (24%) dá
     * 1.8:1 — os dois somem como limite de campo. Este é um cinza OPACO, o
     * mesmo nos dois modos, e é medido: 3.4:1 sobre `raised` e 3.1:1 sobre
     * `base` no claro, 6.2:1 sobre `base` no escuro.
     */
    controlBorder: string;
    hover: string;
    selected: string;
    scrim: string;
  };
  text: { primary: string; secondary: string; disabled: string };
  /**
   * Acentos prontos para uso. `primary`/`secondary` são a versão LEGÍVEL
   * do verde naquele modo. O verde claro da marca precisa fechar como texto
   * sobre superfícies brancas.
   */
  accent: {
    primary: string;
    primarySoft: string;
    primarySoftHover: string;
    primaryBorder: string;
    primaryFocus: string;
    secondary: string;
    secondarySoft: string;
    secondarySoftHover: string;
    secondaryBorder: string;
    focusRing: string;
  };
  /** Preenchimentos da marca, com texto contrastante em cada modo. */
  fill: {
    primary: string;
    primaryHover: string;
    primaryActive: string;
    primaryText: string;
    secondary: string;
    secondaryHover: string;
    secondaryActive: string;
    secondaryText: string;
  };
  semantic: {
    error: string;
    errorSoft: string;
    errorBorder: string;
    warning: string;
    warningSoft: string;
    warningBorder: string;
    info: string;
    infoSoft: string;
    infoBorder: string;
    success: string;
    successSoft: string;
    successBorder: string;
    contrastText: string;
  };
  elevation: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    glowPrimary: string;
    glowSecondary: string;
  };
  /**
   * AS CORES DE GRÁFICO, QUE NÃO SÃO AS DE INTERFACE.
   *
   * `series` segue o verde principal. O degrau muda com o tema para manter
   * visibilidade contra a superfície clara ou escura.
   *
   * Uma cor só porque todo gráfico deste produto tem UMA SÉRIE. Duas séries
   * pediriam a segunda fatia da paleta categórica, e aí a validação precisa
   * medir também a separação entre elas sob daltonismo.
   */
  chart: {
    series: string;
    grid: string;
    axis: string;
  };
}

/** Modo escuro da Fronteira: grafite profundo com funções em verde. */
export const dark: SchemeTokens = {
  surface: {
    base: '#0C1014',
    raised: '#171D20',
    overlay: '#222B2C',
    sunken: '#090D10',
    border: 'rgba(202, 218, 208, 0.18)',
    borderStrong: 'rgba(202, 218, 208, 0.32)',
    controlBorder: neutral[300],  // 6.2:1 no preto
    hover: 'rgba(255, 255, 255, 0.06)',
    selected: hexToRgba(petrol[400], 0.16),
    scrim: 'rgba(0, 0, 0, 0.72)',
  },
  text: {
    primary: '#F7FAF7',
    secondary: '#C5D0C7',
    disabled: neutral[400],
  },
  accent: {
    primary: '#81D2A8',
    primarySoft: hexToRgba(petrol[400], 0.12),
    primarySoftHover: hexToRgba(petrol[400], 0.20),
    primaryBorder: hexToRgba(petrol[300], 0.42),
    primaryFocus: `0 0 0 3px ${hexToRgba(petrol[300], 0.30)}`,
    // O verde de apoio sobe até o 400 para aparecer no fundo escuro.
    secondary: petrol[400],
    secondarySoft: hexToRgba(petrol[500], 0.18),
    secondarySoftHover: hexToRgba(petrol[500], 0.26),
    secondaryBorder: hexToRgba(petrol[400], 0.45),
    focusRing: `0 0 0 3px ${hexToRgba(petrol[400], 0.45)}`,
  },
  fill: {
    primary: '#0D4D36',
    primaryHover: '#14664A',
    primaryActive: '#093C2B',
    primaryText: neutral[0],
    secondary: petrol[700],
    // O texto é branco; o hover escurece para manter o contraste.
    secondaryHover: petrol[800],
    secondaryActive: petrol[900],
    secondaryText: neutral[0],
  },
  semantic: {
    error: '#FF5A5A',
    errorSoft: 'rgba(255, 90, 90, 0.10)',
    errorBorder: 'rgba(255, 90, 90, 0.40)',
    // Laranja-avermelhado (matiz 25) para não virar "outro âmbar".
    warning: '#FF8A3D',
    warningSoft: 'rgba(255, 138, 61, 0.10)',
    warningBorder: 'rgba(255, 138, 61, 0.40)',
    // Azul para separar informação das ações verdes.
    info: '#6E9BFF',
    infoSoft: 'rgba(110, 155, 255, 0.10)',
    infoBorder: 'rgba(110, 155, 255, 0.40)',
    // O estado de sucesso permanece distinguível do verde de ação.
    success: '#2FD38C',
    successSoft: 'rgba(47, 211, 140, 0.10)',
    successBorder: 'rgba(47, 211, 140, 0.40)',
    contrastText: neutral[1000],
  },
  chart: {
    series: petrol[400],
    grid: 'rgba(255, 255, 255, 0.10)',
    axis: neutral[200],
  },
  // No preto a sombra difusa some: a profundidade vem da superfície + borda.
  elevation: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.60), 0 0 0 1px rgba(255, 255, 255, 0.06)',
    md: '0 4px 12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.07)',
    lg: '0 12px 32px rgba(0, 0, 0, 0.70), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    xl: '0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.09)',
    glowPrimary: `0 0 0 1px ${hexToRgba(petrol[400], 0.35)}, 0 6px 24px ${hexToRgba(petrol[500], 0.16)}`,
    glowSecondary: `0 0 0 1px ${hexToRgba(petrol[400], 0.4)}, 0 6px 24px ${hexToRgba(petrol[500], 0.25)}`,
  },
};

/** Modo claro da Fronteira: superfícies suaves e verde legível. */
export const light: SchemeTokens = {
  surface: {
    base: '#F2F4F5',
    raised: neutral[0],
    overlay: neutral[0],
    sunken: '#E7EAED',
    border: hexToRgba(ink, 0.18),
    borderStrong: hexToRgba(ink, 0.32),
    // Um degrau mais fechado que no escuro: `neutral[300]` dá 2.99:1 sobre
    // `sunken`, e 2.99 reprova. O 400 dá 5.7:1 ali e 6.4:1 no branco.
    controlBorder: neutral[400],
    hover: hexToRgba(ink, 0.05),
    selected: hexToRgba(petrol[700], 0.10),
    scrim: hexToRgba(ink, 0.45),
  },
  text: {
    primary: neutral[800],
    secondary: neutral[500],
    disabled: '#9AA0A8',
  },
  accent: {
    primary: petrol[800],
    primarySoft: hexToRgba(petrol[600], 0.11),
    primarySoftHover: hexToRgba(petrol[600], 0.20),
    primaryBorder: hexToRgba(petrol[800], 0.42),
    primaryFocus: `0 0 0 3px ${hexToRgba(petrol[600], 0.28)}`,
    secondary: petrol[700],
    secondarySoft: hexToRgba(petrol[500], 0.16),
    secondarySoftHover: hexToRgba(petrol[500], 0.26),
    secondaryBorder: hexToRgba(petrol[600], 0.5),
    focusRing: `0 0 0 3px ${hexToRgba(petrol[600], 0.4)}`,
  },
  fill: {
    primary: petrol[800],
    primaryHover: petrol[900],
    primaryActive: '#052D20',
    primaryText: neutral[0],
    secondary: petrol[700],
    // Escurece no hover pelo mesmo motivo do escuro — ver o comentário lá.
    secondaryHover: petrol[800],
    secondaryActive: petrol[900],
    secondaryText: neutral[0],
  },
  semantic: {
    error: '#BE3131',
    errorSoft: 'rgba(190, 49, 49, 0.08)',
    errorBorder: 'rgba(190, 49, 49, 0.35)',
    warning: '#9C4600',
    warningSoft: 'rgba(156, 70, 0, 0.08)',
    warningBorder: 'rgba(156, 70, 0, 0.32)',
    info: '#2B5BD7',
    infoSoft: 'rgba(43, 91, 215, 0.08)',
    infoBorder: 'rgba(43, 91, 215, 0.32)',
    success: '#0A6E44',
    successSoft: 'rgba(10, 110, 68, 0.08)',
    successBorder: 'rgba(10, 110, 68, 0.32)',
    contrastText: neutral[0],
  },
  // Tom fechado para aparecer sobre a superfície clara.
  chart: {
    series: petrol[700],
    grid: hexToRgba(ink, 0.1),
    axis: neutral[400],
  },
  elevation: {
    sm: `0 1px 2px ${hexToRgba(ink, 0.08)}, 0 0 0 1px ${hexToRgba(ink, 0.06)}`,
    md: `0 4px 12px ${hexToRgba(ink, 0.1)}, 0 0 0 1px ${hexToRgba(ink, 0.06)}`,
    lg: `0 12px 32px ${hexToRgba(ink, 0.12)}, 0 0 0 1px ${hexToRgba(ink, 0.07)}`,
    xl: `0 24px 64px ${hexToRgba(ink, 0.16)}, 0 0 0 1px ${hexToRgba(ink, 0.08)}`,
    glowPrimary: `0 0 0 1px ${hexToRgba(petrol[800], 0.40)}, 0 6px 20px ${hexToRgba(petrol[600], 0.18)}`,
    glowSecondary: `0 0 0 1px ${hexToRgba(petrol[700], 0.45)}, 0 6px 20px ${hexToRgba(petrol[600], 0.3)}`,
  },
};

export const schemes = { light, dark } as const;
export type ColorSchemeName = keyof typeof schemes;

/* ------------------------------------------------------------------ *
 * 3. Tokens sem cor (iguais nos dois modos)
 * ------------------------------------------------------------------ */

/** Base de 8px. theme.spacing(1) === 8px. */
export const spacingUnit = 8;

export const radius = {
  xs: 4,
  sm: 8,
  md: 10, // botões e inputs
  lg: 14, // cards
  xl: 20, // dialogs, sheets
  pill: 999,
} as const;

/**
 * As duas fontes da v2. Auto-hospedadas por `@fontsource` — nada sai para
 * `fonts.googleapis.com`, que a suíte e2e proíbe.
 *
 * O nome do arquivo variável é `DM Sans Variable`; o estático é `DM Sans`.
 * Os dois entram na pilha porque `@fontsource-variable/dm-sans` declara o
 * primeiro e o segundo cobre quem já tenha a fonte instalada no sistema.
 */
export const fontFamily = {
  sans: '"DM Sans Variable", "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/**
 * DM MONO NÃO TEM NEGRITO. Publica 300, 400 e 500, e nada além.
 *
 * A v2 pedia 700, 800 e 900 em 19 dos 56 lugares onde usa o mono, e o
 * navegador sintetizava um falso-negrito: traço engordado de forma irregular,
 * justamente no que precisa ser lido com precisão — algarismo. Todo peso de
 * mono passa por aqui; a ênfase vem do tamanho e da cor.
 */
export const monoWeight = {
  light: 300,
  regular: 400,
  medium: 500,
} as const;

/**
 * Os quatro pontos em que a v2 quebra o layout, nos nomes do MUI.
 *
 * `@media(max-width:1024px)`, `820px`, `700px` e `560px` viram o teto de `lg`,
 * `md`, `sm` e `xs` — o MUI define o breakpoint pelo PISO, então o valor aqui é
 * o `max-width` da v2 mais um. `theme.breakpoints.down('md')` devolve
 * exatamente o `max-width:700px` de onde `.page-title` cai para 18px.
 */
export const breakpoints = {
  xs: 0,
  sm: 561,
  md: 701,
  lg: 821,
  xl: 1025,
} as const;

export const motion = {
  duration: { fast: 120, normal: 180, slow: 280 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export const zIndex = {
  appBar: 1100,
  drawer: 1200,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500,
} as const;
