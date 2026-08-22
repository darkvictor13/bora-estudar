/**
 * As rotas, como o teste precisa vê-las.
 *
 * Importa de `@/lib/routes` seria melhor, mas o alias `@/*` é do tsconfig do
 * `apps/web` e não resolve daqui. A lista fica duplicada de propósito: se
 * alguém acrescentar uma tela protegida e esquecer o teste de guarda, o
 * `F-AUTH-01` continua contando 13 rotas e o diff mostra a omissão.
 */

export const STUDENT_STUDY_ROUTES = [
  "/aluno",
  "/aluno/disciplinas",
  "/aluno/cadernos",
  "/aluno/estatisticas",
  "/aluno/revisoes",
] as const;

/** Alcançáveis pelo aluno mesmo sem acesso liberado. */
export const STUDENT_FREE_ROUTES = ["/aluno/conta", "/aluno/lista-espera"] as const;

export const STUDENT_ROUTES = [...STUDENT_STUDY_ROUTES, ...STUDENT_FREE_ROUTES] as const;

export const TEACHER_ROUTES = [
  "/professor",
  "/professor/planejamentos",
  "/professor/metas",
  "/professor/cadernos",
  "/professor/revisoes",
  "/professor/estatisticas",
] as const;

export const PROTECTED_ROUTES = [...STUDENT_ROUTES, ...TEACHER_ROUTES] as const;

/** Título esperado no `<h1>` de cada tela. */
export const PAGE_TITLES: Record<string, string> = {
  "/aluno": "Visão geral",
  "/aluno/disciplinas": "Disciplinas",
  "/aluno/cadernos": "Cadernos TEC",
  "/aluno/estatisticas": "Estatísticas",
  "/aluno/revisoes": "Revisões",
  "/aluno/conta": "Meus dados",
  "/aluno/lista-espera": "Lista de espera",
  "/professor": "Meus alunos",
  "/professor/planejamentos": "Planejamentos",
  "/professor/metas": "Gerar metas",
  "/professor/cadernos": "Cadernos",
  "/professor/revisoes": "Revisões",
  "/professor/estatisticas": "Estatísticas",
};

export function studentPageOf(studentId: string): string {
  return `/professor/alunos/${studentId}`;
}
