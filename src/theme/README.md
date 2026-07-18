# Tema Bora Estudar para Next.js

> Integrado neste projeto em `src/theme`, com fontes e atributos de aparência
> configurados no layout raiz.

Este pacote foi extraido dos estilos embutidos em `index.html`, `aluno.html` e
`professor.html`. Ele preserva o tema claro, o tema escuro, a identidade da
marca, as diferencas visuais entre aluno e professor e os padroes recorrentes
de componentes.

## Identidade visual

- Direcao: dashboard editorial, limpo, compacto e funcional.
- Fundo claro: bege/cinza quente (`#F5F4F0`); professor usa `#FAFAF8`.
- Superficies: brancas, com borda suave e sombra curta.
- Cor primaria: azul `#1A56DB`; no escuro, azul claro `#7DA2FF`.
- Texto: quase preto quente (`#1A1916`), nunca preto puro na interface.
- Formas: cantos de 10 a 16 px; pills usam `999px`.
- Movimento: rapido e discreto, normalmente entre 120 e 220 ms.
- Densidade: texto base de 14 px; controles e tabelas usam 12-13 px.

## Arquivos

- `tokens.css`: tokens semanticos, temas claro/escuro e perfis aluno/professor.
- `primitives.css`: reset e classes opcionais para botoes, cards, campos,
  badges, tabelas, progresso e marca.
- `tokens.ts`: valores para graficos, canvas e estilos calculados em JavaScript.
- `BrandMark.tsx`: componente React da marca circular BE.
- `icon.svg`: favicon pronto para copiar para `src/app/icon.svg`.

## Instalacao no App Router

Copie a pasta para o novo projeto, por exemplo em `src/theme`, e importe no
arquivo `src/app/globals.css`:

```css
@import "../theme/tokens.css";
@import "../theme/primitives.css";
```

Carregue as fontes pelo `next/font/google` no `src/app/layout.tsx`:

```tsx
import { DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--next-font-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--next-font-mono",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Depois, no fim do `globals.css`, conecte as variaveis do Next aos tokens:

```css
:root {
  --font-sans: var(--next-font-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--next-font-mono), ui-monospace, monospace;
}
```

O `next/font` hospeda as fontes junto com a aplicacao e evita depender do link
do Google Fonts presente nos HTMLs originais.

## Temas e perfis

Use atributos no elemento `html`:

```tsx
<html lang="pt-BR" data-theme="dark" data-profile="aluno">
```

Valores suportados:

- `data-theme="dark"`: ativa o tema escuro. Sem o atributo, usa o claro.
- `data-profile="aluno"`: aplica os pequenos ajustes escuros da area do aluno.
- `data-profile="professor"`: usa fundo `#FAFAF8`, bordas e raios do professor.

Os aliases `--bg`, `--surface`, `--text`, `--accent`, `--green`, etc. foram
mantidos para permitir colar gradualmente CSS dos prototipos. Em codigo novo,
prefira nomes semanticos como `--color-background` e `--color-primary`.

## Tipografia

| Uso | Familia | Tamanho/peso predominante |
| --- | --- | --- |
| Corpo e controles | DM Sans | 14 px / 400-500 |
| Titulos de pagina | DM Sans | 20-22 px / 700 |
| Titulos de card | DM Sans | 13-14 px / 500-700 |
| Labels em caixa alta | DM Sans | 10-11 px / 600-700 |
| Numeros e indicadores | DM Mono | 11-24 px / 400-500 |
| Logotipo textual | DM Mono | 8.5-9.5 px / 700 |
| Letras do emblema | Arial | 11 px / 700 |

Os prototipos tambem contêm tamanhos intermediarios (8 a 36 px), mas a escala
em `tokens.css` cobre os degraus realmente recorrentes e evita perpetuar valores
isolados.

## Paleta de disciplinas e graficos

A lista completa esta exportada como `disciplineColors` em `tokens.ts`. Ela e
categorica: use as cores para distinguir disciplinas/series, nao como estados.
Estados devem usar `success`, `warning`, `danger` e `primary`.

Os cards de resumo usam quatro gradientes escuros:

- verde: `#0A3828` para `#0D4A30`;
- roxo: `#2D1948` para `#421A82`;
- cinza: `#232A37` para `#323A48`;
- azul: `#0F2D6A` para `#1946A8`.

## Receitas de componentes

```tsx
<button className="be-button be-button--primary">Salvar</button>

<label className="be-label" htmlFor="nome">Nome</label>
<input className="be-input" id="nome" />

<article className="be-card">
  <span className="be-section-label">Desempenho</span>
  <strong className="be-metric-value">82%</strong>
</article>

<span className="be-badge be-badge--success">Concluido</span>
```

## Layout e responsividade observados

- Sidebar: 220 px aberta, 64 px recolhida; em telas pequenas, 210/58 px.
- Cabecalho: superficie branca, borda inferior e posicao sticky.
- Conteudo: 32 px nas laterais; abaixo de 700 px, 16 px.
- Cards: espacamento interno mais comum de 16 ou 20 px.
- Grids: quatro colunas viram duas; grids de duas/tres colunas viram uma.
- Breakpoints existentes nos prototipos: 520, 560, 600, 620, 640, 680, 700,
  720, 800, 820, 900, 950, 980, 1050 e 1100 px.

Para o novo projeto, vale consolidar esses pontos em quatro faixas (`640`,
`768`, `1024`, `1280`) sempre que isso nao mudar o comportamento das telas.

## Elementos especiais encontrados

- Login: fundo quase preto com gradiente azul, card escuro, botao primario pill.
- Emblema BE: gradiente radial azul, borda ciano e brilho externo.
- Feedback: azul para informacao, verde para sucesso, ambar para atencao e
  vermelho para erro/destruicao.
- Icones: SVGs lineares, normalmente entre 16 e 18 px; nao ha uma fonte de
  icones nem biblioteca visual vinculada nos HTMLs.
- Scrollbar: 4 px, thumb na cor da borda forte.
- Animacao de entrada: fade com deslocamento vertical de 6 px em 180 ms.

## Observacao sobre o favicon

Os HTMLs usam um SVG em base64 com o mesmo emblema BE. Copie o `icon.svg`
extraido para `src/app/icon.svg`, em vez de manter o data URI dentro do layout.
O componente `BrandMark` reproduz a mesma aparencia na interface.
