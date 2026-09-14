/**
 * O contraste prometido pelos tokens, conferido na aritmética.
 *
 * `apps/e2e/tests/theme.spec.ts` mede a página de verdade, que é o que vale —
 * mas ele precisa de navegador, de banco e de uma tela onde o par apareça. Este
 * aqui roda em milissegundos e falha no commit em que alguém trocar um papel de
 * cor por outro parecido, antes de a tela existir.
 *
 * A régua é a mesma: WCAG 2, 4.5:1 em texto normal e 3:1 em limite de
 * componente de interface (1.4.11).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type SchemeTokens, schemes } from './tokens.ts';

type Rgb = readonly [number, number, number];

/**
 * Aceita `#RGB`, `#RRGGBB` e `rgba(r, g, b, a)`.
 *
 * O alfa é COMPOSTO sobre o fundo, não ignorado: comparar uma borda a 12% como
 * se fosse opaca foi exatamente o erro que deixou `borderStrong` passar por
 * limite de campo durante três versões.
 */
function toRgb(color: string, over: Rgb): Rgb {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (rgba?.[1]) {
    const parts = rgba[1].split(',').map((n) => Number(n.trim()));
    const [r = 0, g = 0, b = 0, a = 1] = parts;
    return [r * a + over[0] * (1 - a), g * a + over[1] * (1 - a), b * a + over[2] * (1 - a)];
  }

  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const int = Number.parseInt(full, 16);
  assert.ok(Number.isFinite(int), `cor ilegível: ${color}`);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Achata uma pilha de camadas numa cor opaca. A ÚLTIMA precisa ser opaca.
 *
 * Existe por causa do aviso: o texto dele fica sobre `semantic.*Soft`, que é
 * translúcido, que por sua vez fica sobre a superfície. Medir o texto direto
 * contra a superfície ignora a camada do meio e devolve um número que ninguém
 * vê na tela.
 */
function flatten(layers: readonly string[]): Rgb {
  let composed: Rgb = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    composed = toRgb(layers[i] as string, composed);
  }
  return composed;
}

/** `front` pode ser translúcido; a última camada de `back` precisa ser opaca. */
function ratio(front: string, ...back: readonly string[]): number {
  const backdrop = flatten(back);
  const first = luminance(toRgb(front, backdrop));
  const second = luminance(backdrop);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function check(label: string, front: string, back: readonly string[], floor: number): void {
  const measured = ratio(front, ...back);
  assert.ok(
    measured >= floor,
    `${label}: ${measured.toFixed(2)}:1, abaixo do piso de ${floor}:1 (${front} sobre ${back.join(' sobre ')})`,
  );
}

const MODES: readonly (readonly [string, SchemeTokens])[] = [
  ['claro', schemes.light],
  ['escuro', schemes.dark],
];

for (const [mode, s] of MODES) {
  test(`tema ${mode}: texto sobre superfície passa em AA`, () => {
    // Todas as três superfícies em que texto corrido aparece, não só a base:
    // no claro `raised` é branco puro e é o fundo mais apertado para o âmbar.
    for (const [name, background] of Object.entries({
      base: s.surface.base,
      raised: s.surface.raised,
      overlay: s.surface.overlay,
      sunken: s.surface.sunken,
    })) {
      check(`text.primary sobre surface.${name}`, s.text.primary, [background], 4.5);
      check(`text.secondary sobre surface.${name}`, s.text.secondary, [background], 4.5);
      check(`accent.primary sobre surface.${name}`, s.accent.primary, [background], 4.5);
      check(`accent.secondary sobre surface.${name}`, s.accent.secondary, [background], 4.5);

      for (const role of ['error', 'warning', 'info', 'success'] as const) {
        check(`semantic.${role} sobre surface.${name}`, s.semantic[role], [background], 4.5);
      }
    }
  });

  test(`tema ${mode}: texto sobre preenchimento passa em AA`, () => {
    // O hover e o active são estados normais do botão, não exceção.
    for (const state of ['', 'Hover', 'Active'] as const) {
      check(
        `fill.primaryText sobre fill.primary${state}`,
        s.fill.primaryText,
        [s.fill[`primary${state}` as 'primary']],
        4.5,
      );
      check(
        `fill.secondaryText sobre fill.secondary${state}`,
        s.fill.secondaryText,
        [s.fill[`secondary${state}` as 'secondary']],
        4.5,
      );
    }
  });

  /**
   * 1.4.11: o limite que identifica um controle precisa de 3:1 contra o que
   * está atrás dele. É a regra que `border` e `borderStrong` NÃO cumprem — e
   * não precisam, porque cartão não é componente de interface. Por isso existe
   * `controlBorder`.
   */
  test(`tema ${mode}: limite de controle passa em 3:1`, () => {
    for (const [name, background] of Object.entries({
      base: s.surface.base,
      raised: s.surface.raised,
      sunken: s.surface.sunken,
    })) {
      check(`surface.controlBorder sobre surface.${name}`, s.surface.controlBorder, [background], 3);
    }
  });
}

for (const [mode, s] of MODES) {
  /**
   * O AVISO SE MEDE CONTRA O PRÓPRIO FUNDO.
   *
   * `.alert--success` e companhia são fundo fraco + limite + texto, nas três
   * metades da mesma cor. O fundo é translúcido, então o texto do aviso não
   * está sobre a superfície: está sobre a superfície JÁ TINGIDA. É a diferença
   * entre o número do README e o que a tela mostra.
   */
  test(`tema ${mode}: aviso legível sobre o próprio fundo`, () => {
    for (const [name, background] of Object.entries({
      base: s.surface.base,
      raised: s.surface.raised,
    })) {
      for (const role of ['error', 'warning', 'info', 'success'] as const) {
        check(
          `semantic.${role} sobre ${role}Soft sobre surface.${name}`,
          s.semantic[role],
          [s.semantic[`${role}Soft`], background],
          4.5,
        );
        // O LIMITE DO AVISO FICA DE FORA DOS 3:1, e é a mesma posição que
        // `theme.spec.ts` já toma sobre borda de cartão: a 1.4.11 fala de
        // componente de interface, e um aviso não é um. Quem identifica o
        // aviso é o texto colorido sobre o fundo tingido, medido acima; a
        // borda é acabamento. Cobrar 3:1 aqui reprovaria um desenho correto.
      }
    }
  });
}

test('a composição de alfa é levada em conta', () => {
  // Guarda do próprio medidor: um branco a 10% sobre preto NÃO é branco. Se
  // esta asserção passar a dar 21:1, o alfa parou de ser composto e todos os
  // testes acima viraram decoração.
  const measured = ratio('rgba(255, 255, 255, 0.10)', '#000000');
  assert.ok(measured < 2, `alfa ignorado: ${measured.toFixed(2)}:1`);
});
