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
  /**
   * Troca o código do link de e-mail por uma sessão.
   *
   * Continua sendo uma rota própria, e não um trecho dentro de
   * `/redefinir-senha`: quem chega do e-mail traz um código de uso único, e
   * separar a troca da tela deixa o destino livre para ser outro no futuro
   * (convite, confirmação de e-mail) sem duplicar a lógica. Ver
   * `routes/AuthCallback.tsx`.
   */
  authCallback: "/confirmar",

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
