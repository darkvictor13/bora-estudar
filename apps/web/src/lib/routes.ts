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
    planning: "/aluno/planejamento",
    theory: "/aluno/teoria",
    laws: "/aluno/leis",
    flashcards: "/aluno/flashcards",
    flashcardStatistics: "/aluno/flashcards/estatisticas",
    flashcardsForLesson: (lessonId: string) => `/aluno/flashcards?aula=${encodeURIComponent(lessonId)}`,
    flashSummaries: "/aluno/resumos-flash",
    flashSummaryForLesson: (lessonId: string) => `/aluno/resumos-flash?aula=${encodeURIComponent(lessonId)}`,
    schedule: "/aluno/cronograma",
    timer: "/aluno/cronometro",
    mockExams: "/aluno/simulados",
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
    classes: "/professor/turmas",
    mockExams: "/professor/simulados",
    plans: "/professor/planejamentos",
    theory: "/professor/teoria",
    notebooks: "/professor/cadernos",
    goals: "/professor/metas",
    reviews: "/professor/revisoes",
    statistics: "/professor/estatisticas",
    account: "/professor/conta",
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

/**
 * A casa de cada papel.
 *
 * Só dois papéis desde o schema de 14/09/2026: `user_role` é
 * `('teacher','student')`, e `admin` deixou de existir. Quem procurar o
 * tratamento especial que existia aqui — admin caindo na área do professor,
 * BUG-01 — não vai achar, porque não há mais o que tratar.
 */
export function homeForRole(role: "student" | "teacher"): string {
  return role === "student" ? ROUTES.student.overview : ROUTES.teacher.students;
}

/** Telas que não exigem sessão. Nenhuma é destino de VOLTA. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  ROUTES.signIn,
  ROUTES.signUp,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.authCallback,
]);

/** Só serve para o `URL` resolver o caminho. `.invalid` nunca resolve (RFC 2606). */
const BASE = "https://app.invalid";

/**
 * Devolve `raw` quando ele é um caminho interno de tela que exige sessão, e
 * `fallback` em qualquer outro caso.
 *
 * Existe para todo `?next=`: QA-02, em `/confirmar`, e QA-25, no login, que
 * devolve a pessoa ao link profundo. O valor vem da URL e não pode virar
 * redirecionamento aberto.
 *
 * Resolver contra `BASE` é o que faz `\`, TAB e `..` valerem aqui o que valem
 * no navegador: `/\host` e `/<TAB>/host` viram outra origem, `/aluno/../x`
 * vira `/x`. Conferir só as duas barras iniciais do texto cru deixava os dois
 * primeiros passarem.
 *
 * O `fallback` NÃO é validado: é constante de `ROUTES`, escolhida por quem
 * chama. Passar por aqui um valor vindo de fora, como fallback, anularia a
 * proteção.
 */
export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  // Não troque por `trim()`: o navegador descarta espaço e controle nas pontas,
  // e é isso que faz `" //evil"` virar `//evil`. Recusar é mais curto do que
  // reproduzir o parser.
  if (!raw || !raw.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  // O mesmo teste com que o React Router decide que a URL é absoluta
  // (react-router/dist/development/lib/router/url.js). Pega `/.//host`, que o
  // `URL` normaliza para `//host` e ainda considera a mesma origem.
  if (/^[\\/]{2}/.test(url.pathname)) return fallback;

  const key = routeKey(url.pathname);
  if (key === null || PUBLIC_PATHS.has(key)) return fallback;

  return url.pathname + url.search + url.hash;
}

/** Como o React Router casa a rota: decodificado, sem barra no fim, sem caixa. */
function routeKey(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname).replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return null; // `%` malformado: não há caminho a devolver
  }
}
