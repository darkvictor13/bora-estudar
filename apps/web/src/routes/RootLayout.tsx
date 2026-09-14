import { theme } from "@bora/ui";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { useEffect } from "react";
import { Outlet, useMatches } from "react-router";

const DEFAULT_TITLE = "Bora Estudar";

interface TitleHandle {
  readonly title?: string;
}

/**
 * Casca da aplicação: o tema e o título.
 *
 * ## O tema
 *
 * O MUI entra aqui com a parte dele DESLIGADA. As três props abaixo não são
 * afinação; são o que impede duas fontes da verdade sobre a mesma escolha.
 *
 * Neste produto a preferência de tema mora na CONTA (`user_preferences.theme`),
 * e quem escreve `data-theme` no `<html>` é `lib/theme.ts` — o script embutido
 * de `index.html` antes do primeiro paint, e o loader do layout logo depois. O
 * `useColorScheme` do MUI faz o mesmo trabalho a partir do `localStorage`, numa
 * chave própria (`mui-mode`) e num efeito de montagem. Com os dois ligados, a
 * última carga de página de quem escolheu escuro numa máquina e claro noutra
 * seria decidida por quem rodasse por último.
 *
 * - `colorSchemeNode={null}` — o MUI não escreve o atributo. Ele continua
 *   GERANDO as duas folhas de variável (`:root, [data-theme="light"]` e
 *   `[data-theme="dark"]`, por `colorSchemeSelector: 'data-theme'` no tema);
 *   só não decide qual vale.
 * - `storageManager={null}` — nada de `mui-mode` no `localStorage`.
 * - `storageWindow={null}` — sem ouvinte de `storage`, que reagiria a outra aba.
 *
 * Consequência ao escrever componente: `theme.palette.*` congela no modo claro,
 * porque é o `defaultColorScheme`. Cor sempre por `theme.vars.palette.*`, que é
 * CSS variable e troca junto com o atributo — sem re-render de árvore.
 *
 * ## O título
 *
 * No Next cada página exportava `metadata`. Numa SPA quem manda no
 * `document.title` é o cliente, e fazer isso em 19 componentes seria 19 lugares
 * para esquecer. Aqui o título é declarado no `handle` da rota (ver router.tsx)
 * e aplicado num único efeito, lendo a rota mais específica que casou.
 */
export function RootLayout() {
  const matches = useMatches();

  useEffect(() => {
    const titled = [...matches]
      .reverse()
      .find((match) => (match.handle as TitleHandle | undefined)?.title);
    const title = (titled?.handle as TitleHandle | undefined)?.title;
    document.title = title ?? DEFAULT_TITLE;
  }, [matches]);

  return (
    <ThemeProvider theme={theme} colorSchemeNode={null} storageManager={null} storageWindow={null}>
      <CssBaseline />
      <Outlet />
    </ThemeProvider>
  );
}
