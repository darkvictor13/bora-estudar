import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

/**
 * Raiz: manda cada um para a sua casa.
 *
 * Não renderiza nada — quem não tem sessão vai para o login, quem tem vai para
 * o painel do seu papel.
 */
export default async function RootPage() {
  const session = await getSessionContext();
  redirect(session ? homeForRole(session.role) : ROUTES.signIn);
}
