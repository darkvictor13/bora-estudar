import { useCallback, useState } from "react";

import { readCollapsed, writeCollapsed } from "./sidebar-state.ts";

/**
 * Estado recolhido da sidebar, compartilhado pelos dois layouts.
 *
 * O valor inicial é lido no inicializador do `useState`, e não num efeito:
 * efeito roda DEPOIS da pintura, e a sidebar apareceria aberta por um quadro
 * antes de recolher. É o mesmo raciocínio de `adoptTheme` no loader.
 */
export function useSidebar(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(window.innerWidth));

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current);
      return !current;
    });
  }, []);

  return { collapsed, toggle };
}
