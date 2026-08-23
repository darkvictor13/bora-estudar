import { redirect } from "react-router";

import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

/**
 * Raiz: manda cada um para a sua casa.
 *
 * Não renderiza nada — quem não tem sessão vai para o login, quem tem vai para
 * o painel do seu papel.
 */
export async function homeLoader() {
  const session = await getSessionContext();
  throw redirect(session ? homeForRole(session.role) : ROUTES.signIn);
}

export function Home() {
  return null;
}
