/** Um pedaço da seleção do navegador, em posição de caractere do texto de `element`. */
export interface SelectedText {
  readonly element: HTMLElement;
  readonly start: number;
  readonly end: number;
}

/**
 * Converte a seleção atual em posições no texto de cada elemento marcável
 * (`selector`) que ela atravessa, dentro de `root`. Seleção que começa ou
 * termina fora de `root` não conta: o trecho seria de outro texto.
 */
export function selectedTexts(root: HTMLElement, selector: string): SelectedText[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return [];

  const result: SelectedText[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (!range.intersectsNode(element)) continue;
    const whole = document.createRange();
    whole.selectNodeContents(element);
    const portion = range.cloneRange();
    if (portion.compareBoundaryPoints(Range.START_TO_START, whole) < 0) {
      portion.setStart(whole.startContainer, whole.startOffset);
    }
    if (portion.compareBoundaryPoints(Range.END_TO_END, whole) > 0) {
      portion.setEnd(whole.endContainer, whole.endOffset);
    }
    const prefix = whole.cloneRange();
    prefix.setEnd(portion.startContainer, portion.startOffset);
    const start = prefix.toString().length;
    const end = start + portion.toString().length;
    if (end > start) result.push({ element, start, end });
  }
  return result;
}
