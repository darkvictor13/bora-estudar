/**
 * Rotas explícitas.
 *
 * A versão anterior usava catch-all por papel (`/aluno/[[...segments]]`), que
 * centralizava o controle de acesso mas custava legibilidade e code splitting:
 * qualquer tela puxava o bundle de todas as outras. Aqui cada tela é um
 * arquivo, e o controle de acesso vive no proxy mais no layout de cada área.
 */

export const ROUTES = {
  home: "/",

  // Públicas
  signIn: "/entrar",
  signUp: "/cadastro",
  forgotPassword: "/recuperar-senha",
  resetPassword: "/redefinir-senha",

  // Aluno
  student: {
    overview: "/aluno",
    subjects: "/aluno/disciplinas",
    notebooks: "/aluno/cadernos",
    statistics: "/aluno/estatisticas",
    reviews: "/aluno/revisoes",
    account: "/aluno/conta",
    waitlist: "/aluno/lista-espera",
  },

  // Professor
  teacher: {
    students: "/professor",
    student: (id: string) => `/professor/alunos/${id}`,
    plans: "/professor/planejamentos",
    notebooks: "/professor/cadernos",
    goals: "/professor/metas",
    reviews: "/professor/revisoes",
    statistics: "/professor/estatisticas",
  },
} as const;

/**
 * Telas que o aluno alcança mesmo sem acesso liberado.
 *
 * Sem assinatura ativa o aluno é empurrado para a lista de espera, mas precisa
 * conseguir editar os próprios dados e se inscrever. Espelha o
 * `data-acesso-livre="1"` do painel antigo.
 */
export const STUDENT_ROUTES_WITHOUT_ACCESS: readonly string[] = [
  ROUTES.student.account,
  ROUTES.student.waitlist,
];

export function homeForRole(role: "student" | "teacher" | "admin"): string {
  return role === "student" ? ROUTES.student.overview : ROUTES.teacher.students;
}
