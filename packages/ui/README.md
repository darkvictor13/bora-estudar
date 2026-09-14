# `@bora/ui` — Âmbar / Verde-petróleo, claro e escuro

Tema Material UI 7 com **dois modos**: escuro sobre preto puro (o modo da
marca) e claro sobre off-white. **Âmbar** (`#FFB700`) é a cor de ação,
**verde-petróleo** (`#0A6E7F`, matiz 188°) é o apoio.

As fontes são as da v2: **DM Sans** no texto, **DM Mono** no número.

## Uso, dentro do monorepo

```tsx
import { theme } from '@bora/ui';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';

<ThemeProvider theme={theme} colorSchemeNode={null} storageManager={null} storageWindow={null}>
  <CssBaseline /> {/* obrigatório: fundo, scrollbar e anel de foco */}
  {children}
</ThemeProvider>
```

## Quem decide o modo — e por que não é o MUI

**O atributo `data-theme` do `<html>` manda, e quem escreve nele é o produto.**

Neste produto a preferência mora na CONTA, não no aparelho: o script embutido de
`apps/web/index.html` pinta antes do primeiro paint a partir de uma cópia local,
e o loader do layout reconcilia com o que veio do banco. O `useColorScheme` do
MUI faria o mesmo trabalho a partir do `localStorage`, numa chave própria
(`mui-mode`) e num efeito de montagem — e com os dois ligados, a última carga de
página seria decidida por quem rodasse por último.

Por isso o tema usa `colorSchemeSelector: 'data-theme'`, que faz o MUI **gerar**
as duas folhas de variável:

```css
:root, [data-theme="light"] { --mui-palette-surface-base: #F5F6F7; … }
[data-theme="dark"]         { --mui-palette-surface-base: #000000; … }
```

…e as três props do `ThemeProvider` acima o impedem de **escolher** entre elas:

| Prop | O que desliga |
| --- | --- |
| `colorSchemeNode={null}` | escrever o atributo no `<html>` |
| `storageManager={null}` | ler e gravar `mui-mode` no `localStorage` |
| `storageWindow={null}` | reagir ao evento `storage` de outra aba |

`defaultColorScheme` é `light`, e é ele que vai para o `:root`: quem nunca
escolheu não tem linha no banco, e a ausência equivale a claro.

O playground é a exceção — lá não há conta, então ele deixa o MUI gerir o modo
normalmente.

## Como o tema está montado

`createTheme` usa `cssVariables` + `colorSchemes`, então **cada cor vira uma CSS
variable** (`--mui-palette-surface-raised`, …) e trocar de modo é só trocar o
atributo do `<html>` — sem re-render da árvore React.

Isso impõe uma regra aos overrides de componente: eles leem
`theme.vars.palette.*`, nunca `theme.palette.*`. `theme.palette.X` devolve o
valor de um modo só e congelaria a cor.

```tsx
// ✅
root: ({ theme }) => ({ backgroundColor: theme.vars.palette.surface.raised })
// ❌ congela no modo padrão
root: ({ theme }) => ({ backgroundColor: theme.palette.surface.raised })
```

Quando o que muda não é uma cor, use `theme.applyStyles`:

```tsx
...theme.applyStyles('light', { boxShadow: theme.vars.palette.elevation.sm })
```

## Tokens da palette

Além das chaves padrão do MUI, a palette carrega quatro grupos nossos — todos
viram CSS variables e trocam com o modo:

| Grupo | Para quê |
| --- | --- |
| `surface.*` | `base`, `raised`, `overlay`, `sunken`, `border`, `borderStrong`, **`controlBorder`**, `hover`, `selected`, `scrim` |
| `accent.*` | Versão **legível** do amarelo e do verde naquele modo — texto, ícones, traços, foco |
| `fill.*` | Preenchimentos da marca (amarelo e verde vivos) mais o texto que vai por cima |
| `elevation.*` | `sm`, `md`, `lg`, `xl`, `glowPrimary`, `glowSecondary` |

Cada cor de papel (`error`, `warning`, `info`, `success`, `primary`, `secondary`)
carrega também `soft` e `border` — o fundo fraco e o limite do aviso. Ficam
dentro da cor, e não numa chave irmã, para o MUI emiti-las como
`--mui-palette-success-soft`.

```tsx
<Box sx={{ bgcolor: 'surface.sunken', color: 'accent.primary' }} />
<Button sx={{ boxShadow: (t) => t.vars.palette.elevation.glowPrimary }} />
```

O que não é cor fica em `theme.brand` (`radius`, `motion`), porque não depende do modo.

## A decisão de cor que importa: `fill` ≠ `accent`

Nenhuma das duas cores da marca funciona como **texto** nos dois modos, e cada
uma falha de um lado diferente:

- `#FFB700` sobre branco dá **1.6:1** — o âmbar some no modo claro.
- `#0A6E7F` sobre preto dá **3.6:1** — o petróleo some no modo escuro.

Mas as duas funcionam perfeitamente como *preenchimento*, porque aí o que se lê
é o texto por cima delas. Daí a separação em dois grupos:

|  | Escuro | Claro |
| --- | --- | --- |
| `fill.primary` (botão, badge, logo) | `#FFB700` | `#FFB700` |
| `fill.secondary` | `#0A6E7F` | `#0A6E7F` |
| `accent.primary` (texto, ícone, aba, checkbox) | `#FFB700` | `#855000` |
| `accent.secondary` (link, foco, sucesso) | `#46BCCE` | `#0A6E7F` |

**Os fills são idênticos nos dois modos** — âmbar com texto quase-preto
(`#1A1400`, 10.5:1) e petróleo com texto branco (5.9:1). É o acento de texto que
se move: o âmbar fecha até um bronze no claro, o petróleo clareia até um
turquesa no escuro.

Isso tem uma consequência que vale conhecer antes de adotar: **verde-petróleo é
uma cor escura por natureza.** O "petróleo" de verdade mora nos degraus 700–900
da escala, e sobre preto ele não se lê. Onde ele aparece com a cara original é
no preenchimento (botão secundário, switch, avatar) e no modo claro. Como texto
sobre preto, ele necessariamente vira `petrol[400]`, um turquesa.

Pelo mesmo motivo, `accent.primary` no claro é um bronze (`#855000`), não um
âmbar. Se preferir cinza-escuro nos controles pequenos do modo claro em vez de
bronze, é um valor só em `tokens.ts` (`light.accent.primary`).

### As semânticas tiveram que se mexer

Com âmbar na marca, o laranja de alerta viraria "outro âmbar", e petróleo como
"sucesso" é ambíguo. Então:

| Papel | Antes | Agora | Por quê |
| --- | --- | --- | --- |
| `warning` | laranja-âmbar | laranja-avermelhado (matiz 25) | separar do âmbar da marca |
| `success` | o próprio verde da marca | verde de verdade (matiz 150) | petróleo não lê como "deu certo" |
| `info` | azul (212) | azul-violeta (222) | separar do petróleo |

## Contraste (WCAG, medido)

**`npm test` mede.** `src/contrast.test.ts` percorre os dois schemes e reprova o
commit — não é uma tabela conferida no olho, e não depende de navegador nem de
tela existente. A página de preview recalcula os mesmos números no cliente.

Fundo escuro `#000000`, fundo claro `#F5F6F7`:

| Token | Escuro | Claro |
| --- | --- | --- |
| `accent.primary` | 12.0:1 AAA | 6.2:1 AA |
| `accent.secondary` | 9.3:1 AAA | 5.5:1 AA |
| `text.primary` | 19.4:1 AAA | 15.8:1 AAA |
| `text.secondary` | 10.6:1 AAA | 5.9:1 AA |
| `error` / `warning` / `info` / `success` | 6.9 / 9.0 / 7.8 / 10.8 | 5.3 / 5.9 / 5.4 / 5.8 |
| `fill.primary` + texto por cima | 10.5:1 AAA | 10.5:1 AAA |
| `fill.secondary` + texto por cima | 5.9:1 AA | 5.9:1 AA |
| `surface.controlBorder` sobre a superfície | 5.4–6.2:1 | 3.1–3.8:1 |

### Três coisas que o teste pegou, e que a tabela não pegava

**1. `border` e `borderStrong` não servem de limite de campo.** São alfa de 12%
e 18–24%: dão 1.3:1 e 1.8:1 sobre a superfície. A 1.4.11 pede 3:1 em componente
de interface — campo, caixa de seleção, botão sem preenchimento —, e não pede
nada em borda de cartão. Daí `surface.controlBorder`, um cinza OPACO, para onde
apontam `MuiOutlinedInput`, `MuiToggleButton`, `MuiCheckbox`, `MuiRadio`,
`MuiSwitch` e `Button` contornado sem cor.

**2. O preenchimento de petróleo escurece no hover.** Ele clareava para
`petrol[600]`, e branco sobre `#128EA1` dá **3.88:1** — reprova AA num estado
que é normal, não excepcional. Agora vai para `petrol[800]` (9.1:1). O âmbar
continua clareando, porque lá o texto é quase-preto: **a direção do hover segue
a cor do texto, não o hábito.**

**3. Aviso se mede contra o próprio fundo.** O texto de um `Alert` não está
sobre a superfície: está sobre a superfície já tingida por `semantic.*Soft`, que
é translúcido. O teste compõe as duas camadas. (O limite do aviso fica fora dos
3:1 pelo mesmo motivo que borda de cartão fica: aviso não é componente de
interface.)

## Regras de uso

1. **Âmbar é ação e seleção.** No máximo um botão âmbar preenchido por tela.
   Texto sobre âmbar é sempre quase-preto, nunca branco.
2. **Petróleo é apoio, link e anel de foco** — e sobre ele o texto é sempre
   branco. Separar foco (petróleo) de ação (âmbar) evita confundir "onde estou"
   com "o que clicar". O anel de foco é idêntico nos dois modos.
3. **Hierarquia por superfície.** No escuro a sombra difusa some, então a
   profundidade vem de `base → sunken → raised → overlay` mais a borda de 1px.
   No claro as sombras de `elevation.*` voltam a existir.
4. `MuiPaper` tem `backgroundImage: none` — sem isso o MUI clareia o paper por
   overlay no modo escuro e o preto "suja".
5. **Limite de controle é `surface.controlBorder`**, nunca `border` nem
   `borderStrong` — esses dois são acabamento de cartão e não alcançam 3:1.
6. **Número em mono.** `Chip`, `Badge` e a variante `numeric` já apontam para
   DM Mono com `tabular-nums`; é o que faz coluna de porcentagem e de tempo
   alinhar. **DM Mono não tem negrito** (300/400/500), então todo peso passa por
   `monoWeight` — pedir 700 faz o navegador sintetizar um falso-negrito, que
   engorda o traço de forma irregular justamente no que precisa ser lido com
   precisão.

## Tipografia

A escala é a da v2, em `rem` sobre **16px** — a raiz não é fixada em 14px, que
sequestraria a preferência de quem aumentou a letra no navegador e mudaria o que
`rem` significa para o MUI. A densidade vem dos valores:

| Variante | px | De onde, na v2 |
| --- | --- | --- |
| `h1` | 20 (18 abaixo de 700px) | `.page-title` |
| `h4` | 14 | `.card-title` |
| `body1` | 14 | `html, body` |
| `body2` | 13 | `td`, `.alert`, `.empty`, `.page-sub` |
| `button` | 13 | `.btn` |
| `caption` | 12 | `.card-sub`, `.form-label` |
| `overline` | 11 | `.section-title` |
| `metric` | 26 | `.metric-value` — sans, peso 300 |
| `metricLabel` | 10 | `.metric-label`, `th` |
| `numeric` | 12 | `.mono` — DM Mono, `tabular-nums` |

Os breakpoints são os quatro pontos em que a v2 quebra o layout: `sm` 561, `md`
701, `lg` 821, `xl` 1025 — os `max-width` de 560, 700, 820 e 1024 mais um.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `tokens.ts` | Escalas `amber` / `petrol` + os dois schemes + raio, tipografia, motion |
| `palette.ts` | Converte cada scheme em `PaletteOptions` (`lightPalette`, `darkPalette`) |
| `typography.ts` | Escala tipográfica da v2 (DM Sans / DM Mono) + as variantes `metric`, `metricLabel` e `numeric` |
| `contrast.test.ts` | Mede as promessas de contraste dos tokens |
| `components.ts` | Overrides de ~37 componentes, todos via `theme.vars` |
| `theme.ts` | `createTheme` com `colorSchemes` + augmentation dos tipos |
| `index.ts` | Barrel |
| `playground/` + `index.html` | Página de preview (`npm run dev`) |

## Scripts

```bash
npm run dev        # preview em http://localhost:5174
npm run typecheck  # valida o tema e os overrides
npm test           # mede o contraste dos tokens nos dois modos
```

## Limitação conhecida

`theme.shadows` (o array de 25 níveis usado pela prop `elevation`) aponta para
`var(--mui-palette-elevation-*)`, então também troca com o modo. Mas o array em
si não é por-scheme: se precisar de degraus realmente distintos por modo, use
`theme.vars.palette.elevation.*` direto no `sx` em vez da prop `elevation`.

## Voltar para a paleta anterior

As escalas `yellow` (amarelo vivo) e `aqua` (turquesa) continuam exportadas em
`tokens.ts`, sem ninguém apontando para elas. Para voltar, troque as referências
`amber` → `yellow` e `petrol` → `aqua` dentro de `dark` e `light`, e reveja os
degraus: o amarelo vivo pede `yellow[800]` como acento claro, e o turquesa pede
`aqua[400]` no escuro e `aqua[800]` no claro.
