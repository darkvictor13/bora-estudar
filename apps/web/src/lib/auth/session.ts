import { redirect } from "react-router";

import { api, type Role, type Session } from "@/lib/api";
import { ROUTES, homeForRole } from "@/lib/routes";
import { forgetTheme } from "@/lib/theme";

export type UserRole = Role;

/**
 * A sessão, mais o que a casca precisa decidir com ela.
 *
 * `Session` vem do contrato e traz `access` — o estado bruto. `hasAccess` é a
 * pergunta que a interface realmente faz, derivada aqui para não nascer
 * repetida em cada layout com uma regra ligeiramente diferente.
 */
export interface SessionContext extends Session {
  /** `true` quando o aluno tem acesso liberado. Professor: sempre. */
  readonly hasAccess: boolean;
}

function withAccess(session: Session): SessionContext {
  return { ...session, hasAccess: session.role !== "student" || session.access === "active" };
}

let inFlight: Promise<SessionContext | null> | null = null;

/**
 * Contexto da sessão, ou `null` se não houver ninguém autenticado.
 *
 * Memoiza a consulta EM VOO, e só ela. O React Router dispara os loaders de
 * todas as rotas casadas em paralelo, então o layout da área e a página pedem
 * o contexto no mesmo instante; sem isso seriam duas idas ao servidor de auth
 * e quatro consultas por navegação.
 *
 * A memoização é liberada quando a consulta termina, de propósito. Guardar o
 * contexto entre navegações deixaria `hasAccess` velho: o professor libera o
 * acesso e o aluno continuaria empurrado para a lista de espera até recarregar
 * a página. Cada navegação volta a perguntar.
 */
export function getSessionContext(): Promise<SessionContext | null> {
  if (!inFlight) {
    const pending = api.loadSession().then((session) => (session ? withAccess(session) : null));
    inFlight = pending;
    void pending.finally(() => {
      if (inFlight === pending) inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Exige sessão. Redireciona para o login se não houver.
 *
 * O `redirect` do React Router devolve uma Response, e quem a LANÇA de dentro
 * de um loader entrega o controle ao router. Por isso `throw` e não `return`:
 * um `return` aqui viraria o valor de retorno desta função, e o loader
 * seguiria em frente com uma sessão inexistente.
 *
 * O FRAGMENTO VAI JUNTO. Um redirecionamento HTTP preserva o `#` por conta do
 * navegador; o `redirect` do router monta a URL nova só com o caminho e o joga
 * fora. Descartar fragmento num redirecionamento de login é perda de estado em
 * qualquer rota que venha a usá-lo.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) {
    // Sem sessão o tema é claro, e a cópia local deste aparelho some junto
    // (R-TEMA-13 e R-TEMA-14). É aqui que a sessão EXPIRADA é notada — o
    // logout limpa por conta própria, mas quem some sozinho passa por aqui.
    forgetTheme();
    throw redirect(`${ROUTES.signIn}${location.hash}`);
  }
  return session;
}

/** Exige um papel específico. Manda para a home do papel real se não bater. */
export async function requireRole(role: UserRole): Promise<SessionContext> {
  const session = await requireSession();
  if (session.role === role) return session;

  // Nunca redirecione para a rota que acabou de recusar a pessoa: é assim que
  // nasce um loop, e o navegador só mostra uma página em branco.
  const home = homeForRole(session.role);
  throw redirect(home === homeForRole(role) ? ROUTES.signIn : home);
}

/**
 * Exige aluno COM acesso liberado.
 *
 * Usada no loader de cada tela de estudo. Não fica no loader do layout porque
 * o layout precisa continuar renderizando a sidebar e as duas telas livres —
 * dados e lista de espera — para quem ainda aguarda liberação.
 */
export async function requireStudentAccess(): Promise<SessionContext> {
  const session = await requireRole("student");
  if (!session.hasAccess) throw redirect(ROUTES.student.waitlist);
  return session;
}

/**
 * Descarta a consulta em voo.
 *
 * Chamada por toda action que muda a identidade — entrar, sair, criar conta,
 * trocar senha, editar o perfil. Sem isso existe uma janela real de corrida: se
 * um loader tinha pedido o contexto ANTES do login terminar, a promessa em voo
 * ainda devolve `null`, e quem acabou de entrar seria mandado de volta para a
 * tela de login.
 */
export function invalidateSession(): void {
  inFlight = null;
}
