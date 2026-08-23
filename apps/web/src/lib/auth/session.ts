import { redirect } from "react-router";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import { ROUTES, homeForRole } from "@/lib/routes";
import type { Enum } from "@bora/database";

export type UserRole = Enum<"user_role">;

export interface SessionContext {
  readonly user: User;
  readonly profileId: string;
  readonly name: string;
  readonly role: UserRole;
  /** `true` quando o aluno tem assinatura ativa. Professor e admin: sempre. */
  readonly hasAccess: boolean;
}

async function load(): Promise<SessionContext | null> {
  // `getUser()` valida o token no servidor de auth. `getSession()` lê o cookie
  // sem validar e não serve para decisão de acesso.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,name,role")
    .eq("id", user.id)
    .maybeSingle();

  // Sem perfil o gatilho de auth falhou. Tratar como não autenticado é mais
  // seguro do que assumir um papel.
  if (!profile) return null;

  let hasAccess = profile.role !== "student";
  if (profile.role === "student") {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    hasAccess = !!subscription;
  }

  return { user, profileId: profile.id, name: profile.name, role: profile.role, hasAccess };
}

let inFlight: Promise<SessionContext | null> | null = null;

/**
 * Contexto da sessão, ou `null` se não houver ninguém autenticado.
 *
 * Memoiza a consulta EM VOO, e só ela. O React Router dispara os loaders de
 * todas as rotas casadas em paralelo, então o layout da área e a página
 * pedem o contexto no mesmo instante; sem isso seriam duas idas ao servidor de
 * auth e quatro consultas por navegação.
 *
 * A memoização é liberada quando a consulta termina, de propósito. Guardar o
 * contexto entre navegações deixaria `hasAccess` velho: o professor libera o
 * acesso e o aluno continuaria empurrado para a lista de espera até recarregar
 * a página. Cada navegação volta a perguntar — que é o que o Next fazia.
 */
export function getSessionContext(): Promise<SessionContext | null> {
  if (!inFlight) {
    const pending = load();
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
 * O FRAGMENTO VAI JUNTO, e isso não é detalhe. Quem volta do TEC chega em
 * `/aluno#boraQuizResult=…`, e esse fragmento é a única cópia do resultado da
 * bateria neste navegador — a primeira das três ordenações do CLAUDE.md. Um
 * redirecionamento HTTP preserva o fragmento por conta do navegador; o
 * `redirect` do router monta a URL nova só com o caminho e o joga fora. Sem
 * esta concatenação, uma sessão expirada na volta do TEC apagaria uma hora de
 * estudo já respondida, sem deixar de onde recuperar.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) throw redirect(`${ROUTES.signIn}${location.hash}`);
  return session;
}

/**
 * Papéis que atendem a uma exigência.
 *
 * Admin conta como professor, espelhando `is_teacher()` no banco, que é
 * `role in ('teacher','admin')`. Sem isso o admin entra num loop: a home dele
 * é a área do professor, e o layout dessa área o mandava de volta para a
 * própria home. A RLS continua valendo — `can_view_context` não reconhece
 * admin, então ele vê a área vazia em vez de dado de aluno.
 */
function satisfies(actual: UserRole, required: UserRole): boolean {
  return actual === required || (required === "teacher" && actual === "admin");
}

/** Exige um papel específico. Manda para a home do papel real se não bater. */
export async function requireRole(role: UserRole): Promise<SessionContext> {
  const session = await requireSession();
  if (satisfies(session.role, role)) return session;

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
