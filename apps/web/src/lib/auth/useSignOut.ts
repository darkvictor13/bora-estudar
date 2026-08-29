import { useNavigate } from "react-router";

import { signOut } from "@/lib/auth/actions";
import { forgetTheme } from "@/lib/theme";
import { ROUTES } from "@/lib/routes";

/**
 * Sair e ir para o login.
 *
 * `replace: true` para o botão "voltar" do navegador não trazer a pessoa de
 * volta a uma tela protegida que só mostraria o loader redirecionando outra vez.
 */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  return async () => {
    await signOut();
    // Antes de navegar: a cópia local é do aparelho, e o próximo a usar este
    // computador não herda o tema de quem saiu (R-TEMA-13). Volta ao claro
    // junto, que é o tema de quem não tem sessão (R-TEMA-14).
    forgetTheme();
    await navigate(ROUTES.signIn, { replace: true });
  };
}
