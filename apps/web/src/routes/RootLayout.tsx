import { useEffect } from "react";
import { Outlet, useMatches } from "react-router";

const DEFAULT_TITLE = "Bora Estudar";

interface TitleHandle {
  readonly title?: string;
}

/**
 * Casca da aplicação. Só faz uma coisa além de renderizar a rota: o título.
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

  return <Outlet />;
}
