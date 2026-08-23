import { useNavigate } from "react-router";

import { signOut } from "@/lib/auth/actions";
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
    await navigate(ROUTES.signIn, { replace: true });
  };
}
