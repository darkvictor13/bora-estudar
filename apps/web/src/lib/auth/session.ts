import { redirect } from "react-router";

import { api, type Role, type Session } from "@/lib/api";
import { identify } from "@/lib/observability";
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
 * A memoização é liberada quando a consulta termina, de propósito. Guardá-la
 * entre navegações deixaria `hasAccess` velho: o professor libera o acesso e o
 * aluno continuaria empurrado para a lista de espera até recarregar a página.
 * Quem faz o layout perguntar de novo, a cada troca de tela, é o
 * `shouldRevalidate` da rota dele (R-ACC-08, QA-09): sem ele o loader do layout
 * não reexecuta quando só o filho muda.
 */
export function getSessionContext(): Promise<SessionContext | null> {
  if (!inFlight) {
    const pending = api.loadSession().then((session) => {
      // Quem está usando, para o erro não chegar anônimo ao painel. SÓ O ID:
      // `email` e `name` estão aqui e ficam aqui — ver `sendDefaultPii` em
      // `lib/observability.ts`. Fica neste ponto porque é por onde TODA
      // navegação passa, inclusive a primeira carga e a sessão que expirou no
      // meio — que é quando `null` precisa apagar a identidade anterior.
      identify(session ? session.profileId : null);
      return session ? withAccess(session) : null;
    });
    inFlight = pending;
    void pending.finally(() => {
      if (inFlight === pending) inFlight = null;
    });
  }
  return inFlight;
}

/**
 * O destino a que o login devolve: o que o pedido queria abrir.
 *
 * Sai de `request.url`, e NUNCA de `location`: numa navegação do cliente o
 * loader roda antes de a URL mudar, e `location` ainda é a tela de onde a pessoa
 * saiu — o login a devolveria para lá. Por outro lado `request.url` jamais traz
 * `#` (o router o tira), então o fragmento só pode vir de `location`, e só vale
 * quando `location` é este mesmo destino: a PRIMEIRA carga, em que o endereço
 * digitado ainda é o da barra. Numa navegação do cliente o fragmento de
 * `location` é da tela anterior e não é deste destino (R-AUTH-06).
 */
function destinationOf(request: Request): string {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const firstLoad = location.pathname === url.pathname && location.search === url.search;
  return firstLoad ? path + location.hash : path;
}

/**
 * Exige sessão. Redireciona para o login se não houver, levando o destino em
 * `?next=` para o login devolver a pessoa ao que ela queria abrir (R-AUTH-17).
 *
 * O `redirect` do React Router devolve uma Response, e quem a LANÇA de dentro
 * de um loader entrega o controle ao router. Por isso `throw` e não `return`:
 * um `return` aqui viraria o valor de retorno desta função, e o loader
 * seguiria em frente com uma sessão inexistente.
 *
 * O FRAGMENTO VIAJA DENTRO DO `next`. O `redirect` do router monta a URL nova só
 * com o caminho e jogaria o `#` fora; dentro do parâmetro ele sobrevive até o
 * login, que o devolve junto com o destino.
 *
 * O `request` é OBRIGATÓRIO nas três guardas, para o compilador listar todo
 * chamador: o redirect do loader MAIS FUNDO vence (`findRedirect` percorre os
 * resultados de trás para frente), então se só o layout montasse o `next`, o
 * `requireRole` da página redirecionaria sem ele e é esse que valeria.
 */
export async function requireSession(request: Request): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) {
    // Sem sessão o tema é claro, e a cópia local deste aparelho some junto
    // (R-TEMA-13 e R-TEMA-14). É aqui que a sessão EXPIRADA é notada — o
    // logout limpa por conta própria, mas quem some sozinho passa por aqui.
    forgetTheme();
    throw redirect(`${ROUTES.signIn}?next=${encodeURIComponent(destinationOf(request))}`);
  }
  return session;
}

/** Exige um papel específico. Manda para a home do papel real se não bater. */
export async function requireRole(role: UserRole, request: Request): Promise<SessionContext> {
  const session = await requireSession(request);
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
export async function requireStudentAccess(request: Request): Promise<SessionContext> {
  const session = await requireRole("student", request);
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
