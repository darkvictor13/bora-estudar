# `@bora/ui` — identidade Fronteira Concursos

Tema Material UI 7 usado pelo site nos modos claro e escuro. O nome técnico do
pacote continua `@bora/ui` para preservar os imports existentes; a marca visível
na aplicação é **Fronteira Concursos**.

## Cores

A referência visual é a marca enviada em 24/09/2026: verdes vivos no símbolo e
cinza quase preto ao redor. O modo claro usa superfícies brancas e verde suave,
com ações em verde fechado e texto branco. O modo escuro usa fundo verde profundo,
cartões em outro degrau do mesmo verde e ações em turquesa com texto escuro.

| Papel | Claro | Escuro |
| --- | --- | --- |
| `surface.base` | `#F2F8F5` | `#0B1715` |
| `surface.raised` | `#FFFFFF` | `#12231F` |
| `fill.primary` | `#057661` | `#2DE1C0` |
| `accent.primary` | `#057661` | `#75EAD5` |
| `fill.secondary` | `#146A4A` | `#146A4A` |

Componentes usam `theme.vars.palette.*`, de modo que acompanham a troca de tema
sem manter cores literais em cada tela. Os estados de hover, foco, seleção,
bordas, gráficos e avisos usam os papéis definidos em `tokens.ts`. Cores de erro,
alerta e informação continuam distinguíveis da marca.

O contraste de texto, botões, controles e avisos é medido em `contrast.test.ts`
nos dois modos. Texto normal exige pelo menos 4,5:1; o limite de controles,
3:1. O símbolo vetorial exibido pelo site está em
`apps/web/public/fronteira-mark.svg`.

## Uso

```tsx
import { theme } from '@bora/ui';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';

<ThemeProvider theme={theme} colorSchemeNode={null} storageManager={null} storageWindow={null}>
  <CssBaseline />
  {children}
</ThemeProvider>
```

`theme.vars.palette.*` é obrigatório para cores que mudam com o modo: usar
`theme.palette.*` congela no esquema padrão. A tipografia usa DM Sans para texto
e DM Mono para números. O site controla o modo por `data-theme` no `<html>`.

```bash
npm run typecheck
npm test
```
