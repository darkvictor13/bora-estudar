/**
 * Contraste WCAG, medido na página de verdade.
 *
 * Existe porque `R-TEMA-15` promete AA nos dois temas, e promessa de contraste
 * conferida no olho regride sem ninguém notar: basta alguém trocar um papel de
 * cor por outro parecido. Aqui os pares saem de `getComputedStyle`, com o fundo
 * RESOLVIDO — um elemento quase sempre tem `background-color: rgba(0,0,0,0)`, e
 * comparar texto contra transparente não mede nada.
 *
 * A composição de alfa é feita no navegador, onde estão os elementos; a
 * aritmética da razão fica aqui, onde a mensagem de falha é legível.
 */
import type { Page } from "@playwright/test";

export type Rgb = readonly [number, number, number];

export interface Sample {
  readonly label: string;
  readonly color: Rgb;
  readonly background: Rgb;
  readonly fontSizePx: number;
  readonly fontWeight: number;
}

export interface BorderSample {
  readonly label: string;
  readonly border: Rgb;
  readonly background: Rgb;
}

/** Componente sRGB linearizado, como a WCAG 2 define. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Texto grande, na definição da WCAG: 24px, ou 18.66px em negrito. O piso dele
 * é 3:1 em vez de 4.5:1.
 */
export function isLarge({ fontSizePx, fontWeight }: Sample): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export function describe(sample: Sample | BorderSample, ratio: number): string {
  const front = "color" in sample ? sample.color : sample.border;
  return `${sample.label}: ${ratio.toFixed(2)}:1 (rgb(${front.join()}) sobre rgb(${sample.background.join()}))`;
}

export interface Collected {
  readonly text: readonly Sample[];
  readonly borders: readonly BorderSample[];
}

export interface Spec {
  readonly selector: string;
  readonly kind: "text" | "border";
}

/**
 * Colhe os pares na página.
 *
 * A função passada ao `evaluate` é serializada e roda no navegador: NADA do
 * escopo deste módulo viaja junto, então tudo de que ela precisa está escrito
 * dentro dela. É por isso que a composição de alfa aparece aqui em vez de
 * reusar as funções acima.
 */
export async function collect(page: Page, specs: readonly Spec[]): Promise<Collected> {
  return page.evaluate((list: readonly Spec[]): Collected => {
    interface Parsed {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    const parse = (css: string): Parsed | null => {
      const numbers = css.match(/[\d.]+/g);
      if (!numbers) return null;
      const [r, g, b, a] = numbers.map(Number);
      if (r === undefined || g === undefined || b === undefined) return null;
      return { r, g, b, a: a ?? 1 };
    };

    const flatten = (top: Parsed, under: readonly [number, number, number]) =>
      [
        Math.round(top.r * top.a + under[0] * (1 - top.a)),
        Math.round(top.g * top.a + under[1] * (1 - top.a)),
        Math.round(top.b * top.a + under[2] * (1 - top.a)),
      ] as [number, number, number];

    /**
     * O fundo efetivo: sobe pelos ancestrais até achar algo opaco, compondo
     * cada camada translúcida pelo caminho. Sem isto, quase todo elemento
     * devolveria `rgba(0,0,0,0)` e a medição seria ficção.
     */
    const backgroundOf = (element: Element): [number, number, number] => {
      const layers: Parsed[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const parsed = parse(getComputedStyle(node).backgroundColor);
        if (!parsed || parsed.a === 0) continue;
        layers.push(parsed);
        if (parsed.a === 1) break;
      }

      let composed: [number, number, number] = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        composed = flatten(layers[i] as Parsed, composed);
      }
      return composed;
    };

    /**
     * `opacity` NÃO aparece em `getComputedStyle().color` — ela é aplicada ao
     * elemento inteiro, depois. Sem multiplicá-la no alfa, os três rótulos da
     * sidebar que usam opacity seriam medidos como se fossem opacos, e o teste
     * aprovaria um contraste que ninguém tem.
     */
    const over = (css: string, backdrop: [number, number, number], opacity = 1) => {
      const parsed = parse(css);
      return parsed ? flatten({ ...parsed, a: parsed.a * opacity }, backdrop) : null;
    };

    /** A opacity herda pela árvore: o rótulo dentro de um bloco a 50% fica a 50%. */
    const opacityOf = (element: Element): number => {
      let total = 1;
      for (let node: Element | null = element; node; node = node.parentElement) {
        total *= Number(getComputedStyle(node).opacity);
      }
      return total;
    };

    const visible = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };

    const text: Sample[] = [];
    const borders: BorderSample[] = [];

    for (const spec of list) {
      for (const element of document.querySelectorAll(spec.selector)) {
        if (!visible(element)) continue;
        const style = getComputedStyle(element);
        const excerpt = element.textContent?.trim().slice(0, 28) ?? "";
        const label = excerpt ? `${spec.selector} "${excerpt}"` : spec.selector;

        if (spec.kind === "text") {
          // Elemento sem texto PRÓPRIO não pinta letra nenhuma: medir a cor
          // dele seria medir uma cor que ninguém vê.
          const own = [...element.childNodes].some(
            (node) => node.nodeType === 3 && (node.textContent?.trim().length ?? 0) > 0,
          );
          if (!own) continue;

          const background = backgroundOf(element);
          const color = over(style.color, background, opacityOf(element));
          if (!color) continue;

          text.push({
            label,
            color,
            background,
            fontSizePx: parseFloat(style.fontSize),
            fontWeight: Number(style.fontWeight) || 400,
          });
        } else {
          if (parseFloat(style.borderTopWidth) === 0) continue;
          // A borda fica ENTRE o fundo do elemento e o de trás dele. O de trás
          // é o caso apertado: é contra ele que o limite precisa aparecer.
          const behind = element.parentElement
            ? backgroundOf(element.parentElement)
            : ([255, 255, 255] as [number, number, number]);
          const border = over(style.borderTopColor, behind, opacityOf(element));
          if (!border) continue;
          borders.push({ label, border, background: behind });
        }
      }
    }

    return { text, borders };
  }, specs);
}
