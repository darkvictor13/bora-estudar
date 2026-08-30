import { Outlet } from "react-router";

import { getSessionContext } from "@/lib/auth/session";
import { forgetTheme } from "@/lib/theme";

/**
 * Sem sessão o tema é claro (R-TEMA-14).
 *
 * Quem sai pelo botão já teve a cópia local apagada, e quem esbarra numa rota
 * protegida passa por `requireSession`. Sobra um caso: a sessão vence com a aba
 * fechada e a pessoa volta direto para `/entrar`. Nenhum loader protegido roda
 * nesse caminho, então é aqui que a cópia órfã morre.
 *
 * O script embutido de `index.html` já pintou o documento antes disto rodar, e
 * é por isso que este caso — só ele — tem um instante de escuro antes de voltar
 * ao claro. O preço é pago uma vez, na primeira carga depois do vencimento.
 */
export async function publicLayoutLoader() {
  if (!(await getSessionContext())) forgetTheme();
  return null;
}

export function PublicLayout() {
  return (
    <main className="auth">
      <Outlet />
    </main>
  );
}
