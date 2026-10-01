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
  "/aluno/planejamento",
  "/aluno/teoria",
  "/aluno/disciplinas",
  "/aluno/cadernos",
  "/aluno/estatisticas",
  "/aluno/revisoes",
  "/aluno/flashcards",
  "/aluno/flashcards/estatisticas",
  "/aluno/simulados",
] as const;

/**
 * A semana do aluno com os sete dias abertos.
 *
 * `/aluno` sozinho mostra só o dia de HOJE (ou o primeiro da semana, quando
 * hoje cai fora dela). As metas do cenário se espalham pela semana inteira:
 * sem `dia=todos`, a linha procurada pode estar num dia que a tela escondeu, e
 * o teste falha acusando "linha não encontrada".
 */
export const STUDENT_WEEK_ALL_DAYS = "/aluno?dia=todos";

/** Alcançáveis pelo aluno mesmo sem acesso liberado. */
export const STUDENT_FREE_ROUTES = ["/aluno/conta", "/aluno/lista-espera"] as const;

export const STUDENT_ROUTES = [...STUDENT_STUDY_ROUTES, ...STUDENT_FREE_ROUTES] as const;

export const TEACHER_ROUTES = [
  "/professor",
  "/professor/turmas",
  "/professor/planejamentos",
  "/professor/metas",
  "/professor/teoria",
  "/professor/cadernos",
  "/professor/revisoes",
  "/professor/estatisticas",
  "/professor/simulados",
  "/professor/conta",
] as const;

export const PROTECTED_ROUTES = [...STUDENT_ROUTES, ...TEACHER_ROUTES] as const;

/** Título esperado no `<h1>` de cada tela. */
export const PAGE_TITLES: Record<string, string> = {
  "/aluno": "Minha semana",
  "/aluno/planejamento": "Meu curso",
  "/aluno/teoria": "Aulas",
  "/aluno/disciplinas": "Disciplinas",
  "/aluno/cadernos": "Cadernos TEC",
  "/aluno/estatisticas": "Estatísticas",
  "/aluno/revisoes": "Controle de revisões",
  "/aluno/flashcards": "Flashcards",
  "/aluno/flashcards/estatisticas": "Estatísticas dos flashcards",
  "/aluno/simulados": "Simulados",
  "/aluno/conta": "Meus dados",
  "/aluno/lista-espera": "Lista de espera",
  "/professor": "Meus alunos",
  "/professor/turmas": "Turmas",
  "/professor/planejamentos": "Planejamentos",
  "/professor/metas": "Gerar metas",
  "/professor/teoria": "Catálogo de teoria",
  "/professor/cadernos": "Cadernos TEC",
  "/professor/revisoes": "Revisões",
  "/professor/estatisticas": "Estatísticas",
  "/professor/simulados": "Simulados presenciais",
  "/professor/conta": "Meus dados",
};

export function studentPageOf(studentId: string): string {
  return `/professor/alunos/${studentId}`;
}
