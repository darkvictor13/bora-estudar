import { theme } from "@bora/ui";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useEffect, type ReactNode } from "react";
import { Outlet, useMatches } from "react-router";

import { RouteError } from "@/routes/RouteError";

const DEFAULT_TITLE = "Fronteira Concursos";

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
    <ThemeShell>
      <Outlet />
    </ThemeShell>
  );
}

function ThemeShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme} colorSchemeNode={null} storageManager={null} storageWindow={null}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

/**
 * O `ErrorBoundary` da raiz, COM o tema em volta.
 *
 * O boundary substitui o elemento da rota que o declara — e na raiz esse
 * elemento é o `RootLayout`, que é quem fornece o tema. Sem embrulhar de novo,
 * o erro de um loader de layout (a sessão que não pôde ser verificada, a
 * leitura de `profiles` que falhou) chegava a `RouteError` sem
 * `theme.vars`, a própria tela de erro quebrava, e a pessoa via uma página em
 * branco.
 */
export function RootError() {
  return (
    <ThemeShell>
      <RouteError />
    </ThemeShell>
  );
}

/**
 * A primeira carga: o que a pessoa vê enquanto a sessão, o perfil e os loaders
 * não terminam (QA-26, R-UI-17).
 *
 * Sem `HydrateFallback` o React Router 8 renderiza `null` e avisa no console, e
 * a tela fica branca até a cascata sessão -> perfil -> loaders acabar. Como o
 * `ErrorBoundary`, o fallback SUBSTITUI o `RootLayout` — que é quem fornece o
 * tema —, e por isso embrulha o seu próprio `ThemeShell`.
 *
 * Três coisas que não entram aqui, cada uma por um motivo:
 * - `h1`: F-TEMA-03 afirma zero `h1` enquanto o perfil está preso, e a tela
 *   ainda não é nenhuma tela;
 * - `Alert`: o testid `alert` é de aviso ao usuário, e a suíte o confundiria;
 * - `Outlet`: proibido num fallback de hidratação.
 *
 * `index.html` traz o mesmo texto dentro de `#root`, para o branco que vem
 * ANTES do bundle; este é o que o substitui depois dele.
 */
export function RootLoading() {
  return (
    <ThemeShell>
      <Box
        role="status"
        data-testid="app-loading"
        sx={(theme) => ({
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          p: 2,
          textAlign: "center",
          backgroundColor: theme.vars.palette.surface.base,
        })}
      >
        <Typography variant="body1">Carregando a Fronteira Concursos…</Typography>
        <Typography variant="body2">Se demorar, confira a conexão e recarregue a página.</Typography>
      </Box>
    </ThemeShell>
  );
}
