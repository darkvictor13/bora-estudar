/** Tokens para graficos, estilos inline e bibliotecas que nao leem CSS variables. */
export const theme = {
  fonts: {
    sans: "DM Sans",
    mono: "DM Mono",
  },
  light: {
    background: "#F5F4F0",
    surface: "#FFFFFF",
    border: "#E4E2DC",
    borderStrong: "#CCC9C1",
    text: "#1A1916",
    textMuted: "#6B6860",
    textSubtle: "#A8A69F",
    primary: "#1A56DB",
    primaryHover: "#3B6FE8",
    primarySoft: "#EBF0FD",
    success: "#1A7A4A",
    successSoft: "#E4F5EE",
    warning: "#9A5A00",
    warningSoft: "#FEF3E2",
    danger: "#B83232",
    dangerSoft: "#FDECEC",
  },
  dark: {
    background: "#0C0F16",
    surface: "#141820",
    surfaceRaised: "#151922",
    surfaceMuted: "#1B202B",
    border: "#293041",
    text: "#F4F1EA",
    textMuted: "#C8C3B8",
    textSubtle: "#8D877C",
    primary: "#7DA2FF",
    primaryHover: "#9BB8FF",
    primarySoft: "#17233F",
    success: "#72D8A5",
    successSoft: "#12291E",
    warning: "#F4BC64",
    warningSoft: "#332514",
    danger: "#FF8E8E",
    dangerSoft: "#351C1F",
  },
  brand: {
    blueTop: "#155FFF",
    blueCenter: "#0B42B8",
    blueBottom: "#061E5E",
    electricBlue: "#176BFF",
    cyan: "#32B9FF",
    white: "#F7F9FF",
  },
  statusGradients: {
    green: ["#0A3828", "#0D4A30"],
    purple: ["#2D1948", "#421A82"],
    gray: ["#232A37", "#323A48"],
    blue: ["#0F2D6A", "#1946A8"],
  },
  radii: {
    xs: 6,
    sm: 8,
    md: 10,
    lg: 16,
    xl: 22,
    pill: 999,
  },
} as const;

/** Paleta usada para identificar disciplinas e series de graficos. */
export const disciplineColors = [
  "#1A56DB", "#1A7A4A", "#9A3A00", "#6B3FA0", "#B83232", "#0F6E56",
  "#2F5D62", "#7E22CE", "#365314", "#0B63CE", "#C2410C", "#6D4C41",
  "#B91C1C", "#047857", "#0E7490", "#166534", "#2563EB", "#4338CA",
  "#4B5563", "#4F46E5", "#7C3AED", "#854D0E", "#BE123C", "#0F766E",
] as const;

export type DisciplineColor = (typeof disciplineColors)[number];
