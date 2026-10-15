import { createBrowserRouter } from "react-router";

import { RootError, RootLayout, RootLoading } from "@/routes/RootLayout";
import { PublicLayout, publicLayoutLoader } from "@/routes/PublicLayout";

import { NotFound, RouteError } from "@/routes/RouteError";
import { Home, homeLoader } from "@/routes/Home";
import { AuthCallback, authCallbackLoader } from "@/routes/AuthCallback";

import { SignIn, signInLoader } from "@/routes/public/SignIn";

import { ROUTES } from "@/lib/routes";

/**
 * A árvore de rotas, explícita num arquivo.
 *
 * No App Router isto era convenção de diretório: `layout.tsx` aninhava,
 * `(public)` agrupava sem virar segmento de URL, `page.tsx` era a tela. Aqui é
 * uma estrutura de dados, e o que era convenção fica visível: quem exige qual
 * papel está no loader do layout, e a URL de cada tela sai de `ROUTES` — a
 * mesma constante que a sidebar e os redirecionamentos usam, então não existe
 * caminho escrito duas vezes.
 *
 * O `handle.title` substitui o `export const metadata` de cada página; quem o
 * aplica é o efeito em RootLayout.
 *
 * `ErrorBoundary` fica na raiz e, DENTRO de cada área, numa rota sem caminho
 * que só existe para segurar o erro.
 *
 * A camada a mais não é enfeite. O React Router substitui pelo boundary o
 * elemento da ROTA QUE O DECLARA — não o da rota que falhou. Com o boundary no
 * próprio layout da área, um erro no loader de uma tela apagava a sidebar
 * junto, e a pessoa perdia a navegação justamente no momento em que mais
 * precisa dela: para sair dali. Numa rota sem caminho aninhada, o layout
 * continua montado e o erro ocupa só o espaço do conteúdo.
 *
 * CÓDIGO POR ROTA (auditoria de prontidão, M3). Cada tela, e cada um dos dois
 * layouts de área, entra por `lazy: () => import(...)`, e o loader viaja junto
 * com o componente no mesmo chunk: o loader é do módulo da tela e importa o que
 * a tela importa. Antes, um bundle único de 1,45 MB (429 KB gzip) levava ao
 * visitante do login o código do professor, dos gráficos e do leitor de leis.
 * Ficam estáticos só o que a primeira pintura de QUALQUER visita usa: a raiz, o
 * layout público, a Home (que decide para onde ir), o callback do e-mail e a
 * própria tela de entrada.
 */
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    HydrateFallback: RootLoading,
    ErrorBoundary: RootError,
    children: [
      { index: true, loader: homeLoader, Component: Home },

      {
        path: ROUTES.authCallback,
        loader: authCallbackLoader,
        Component: AuthCallback,
      },

      // Documentos legais: públicos, fora do cartão de vidro do acesso (R-LGPD-15).
      {
        path: ROUTES.privacy,
        lazy: () => import("@/routes/public/Privacy").then((m) => ({ Component: m.Privacy })),
        handle: { title: "Política de privacidade · Fronteira Concursos" },
      },
      {
        path: ROUTES.terms,
        lazy: () => import("@/routes/public/Terms").then((m) => ({ Component: m.Terms })),
        handle: { title: "Termos de uso · Fronteira Concursos" },
      },

      {
        loader: publicLayoutLoader,
        Component: PublicLayout,
        children: [
          {
            path: ROUTES.signIn,
            loader: signInLoader,
            Component: SignIn,
            handle: { title: "Entrar · Fronteira Concursos" },
          },
          {
            path: ROUTES.signUp,
            lazy: () => import("@/routes/public/SignUp").then((m) => ({ loader: m.signUpLoader, Component: m.SignUp })),
            handle: { title: "Criar conta · Fronteira Concursos" },
          },
          {
            path: ROUTES.forgotPassword,
            lazy: () => import("@/routes/public/ForgotPassword").then((m) => ({ Component: m.ForgotPassword })),
            handle: { title: "Recuperar senha · Fronteira Concursos" },
          },
          {
            path: ROUTES.resetPassword,
            lazy: () => import("@/routes/public/ResetPassword").then((m) => ({ loader: m.resetPasswordLoader, Component: m.ResetPassword })),
            handle: { title: "Nova senha · Fronteira Concursos" },
          },
        ],
      },

      {
        // O layout não tem caminho, e o React Router não reexecuta o loader de uma
        // rota que continua casada quando só o filho muda: liberado ou suspenso, a
        // barra seguia com os itens do estado antigo até o F5 (QA-09, R-ACC-08).
        // Declarar DESLIGA o padrão inteiro: o `||` devolve o que o router faria
        // sozinho (revalidate(), search nova) e acrescenta a troca de tela.
        shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
          defaultShouldRevalidate || currentUrl.pathname !== nextUrl.pathname,
        lazy: () => import("@/routes/StudentLayout").then((m) => ({ loader: m.studentLayoutLoader, Component: m.StudentLayout })),
        children: [
          {
            ErrorBoundary: RouteError,
            children: [
              {
                path: ROUTES.student.overview,
                lazy: () => import("@/routes/student/Overview").then((m) => ({ loader: m.overviewLoader, Component: m.Overview })),
                handle: { title: "Minha semana · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.planning,
                lazy: () => import("@/routes/student/Planning").then((m) => ({ loader: m.planningLoader, Component: m.Planning })),
                handle: { title: "Meu curso · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.theory,
                lazy: () => import("@/routes/student/Theory").then((m) => ({ loader: m.theoryLoader, Component: m.Theory })),
                handle: { title: "Aulas · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.subjects,
                lazy: () => import("@/routes/student/Subjects").then((m) => ({ loader: m.subjectsLoader, Component: m.Subjects })),
                handle: { title: "Disciplinas · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.laws,
                lazy: () => import("@/routes/student/Laws").then((m) => ({ loader: m.lawsLoader, Component: m.Laws })),
                handle: { title: "Leis · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.flashcards,
                lazy: () => import("@/routes/student/Flashcards").then((m) => ({ loader: m.flashcardsLoader, Component: m.Flashcards })),
                handle: { title: "Flashcards · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.flashcardStatistics,
                lazy: () => import("@/routes/student/FlashcardStatistics").then((m) => ({ loader: m.flashcardStatisticsLoader, Component: m.FlashcardStatistics })),
                handle: { title: "Estatísticas dos flashcards · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.flashSummaries,
                lazy: () => import("@/routes/student/FlashSummaries").then((m) => ({ loader: m.flashSummariesLoader, Component: m.FlashSummaries })),
                handle: { title: "Resumos Flash · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.schedule,
                lazy: () => import("@/routes/student/Schedule").then((m) => ({ Component: m.Schedule })),
                handle: { title: "Minha semana · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.timer,
                lazy: () => import("@/routes/student/Timer").then((m) => ({ loader: m.timerLoader, Component: m.Timer })),
                handle: { title: "Cronômetro · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.mockExams,
                lazy: () => import("@/routes/student/MockExams").then((m) => ({ loader: m.mockExamsLoader, Component: m.MockExams })),
                handle: { title: "Simulados · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.notebooks,
                lazy: () => import("@/routes/student/Notebooks").then((m) => ({ loader: m.studentNotebooksLoader, Component: m.StudentNotebooks })),
                handle: { title: "Cadernos TEC · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.statistics,
                lazy: () => import("@/routes/student/Statistics").then((m) => ({ loader: m.studentStatisticsLoader, Component: m.StudentStatistics })),
                handle: { title: "Estatísticas · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.reviews,
                lazy: () => import("@/routes/student/Reviews").then((m) => ({ loader: m.studentReviewsLoader, Component: m.StudentReviews })),
                handle: { title: "Revisões · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.account,
                lazy: () => import("@/routes/student/Account").then((m) => ({ loader: m.accountLoader, Component: m.Account })),
                handle: { title: "Meus dados · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.waitlist,
                lazy: () => import("@/routes/student/Waitlist").then((m) => ({ loader: m.waitlistLoader, Component: m.Waitlist })),
                handle: { title: "Lista de espera · Fronteira Concursos" },
              },
        ],
          },
        ],
      },

      {
        lazy: () => import("@/routes/TeacherLayout").then((m) => ({ loader: m.teacherLayoutLoader, Component: m.TeacherLayout })),
        children: [
          {
            ErrorBoundary: RouteError,
            children: [
              {
                path: ROUTES.teacher.students,
                lazy: () => import("@/routes/teacher/Students").then((m) => ({ loader: m.teacherStudentsLoader, Component: m.TeacherStudents })),
                handle: { title: "Meus alunos · Fronteira Concursos" },
              },
              {
                path: "/professor/alunos/:studentId",
                lazy: () => import("@/routes/teacher/Student").then((m) => ({ loader: m.teacherStudentLoader, Component: m.TeacherStudent })),
                handle: { title: "Aluno · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.classes,
                lazy: () => import("@/routes/teacher/Classes").then((m) => ({ loader: m.teacherClassesLoader, Component: m.TeacherClasses })),
                handle: { title: "Turmas · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.mockExams,
                lazy: () => import("@/routes/teacher/MockExams").then((m) => ({ loader: m.teacherMockExamsLoader, Component: m.TeacherMockExams })),
                handle: { title: "Simulados presenciais · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.plans,
                lazy: () => import("@/routes/teacher/Plans").then((m) => ({ loader: m.teacherPlansLoader, Component: m.TeacherPlans })),
                handle: { title: "Planejamentos · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.goals,
                lazy: () => import("@/routes/teacher/Goals").then((m) => ({ loader: m.teacherGoalsLoader, Component: m.TeacherGoals })),
                handle: { title: "Gerar metas · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.theory,
                lazy: () => import("@/routes/teacher/Theory").then((m) => ({ loader: m.teacherTheoryLoader, Component: m.TeacherTheory })),
                handle: { title: "Materiais das aulas · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.notebooks,
                lazy: () => import("@/routes/teacher/Notebooks").then((m) => ({ loader: m.teacherNotebooksLoader, Component: m.TeacherNotebooks })),
                handle: { title: "Cadernos · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.reviews,
                lazy: () => import("@/routes/teacher/Reviews").then((m) => ({ loader: m.teacherReviewsLoader, Component: m.TeacherReviews })),
                handle: { title: "Revisões · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.statistics,
                lazy: () => import("@/routes/teacher/Statistics").then((m) => ({ loader: m.teacherStatisticsLoader, Component: m.TeacherStatistics })),
                handle: { title: "Estatísticas · Fronteira Concursos" },
              },
              {
                // A mesma tela de `/aluno/conta`, com texto por papel e sem o cartão
                // Acesso (R-CONTA-09): mesmos campos, mesma action.
                path: ROUTES.teacher.account,
                lazy: () => import("@/routes/student/Account").then((m) => ({ loader: m.accountLoader, Component: m.Account })),
                handle: { title: "Meus dados · Fronteira Concursos" },
              },
        ],
          },
        ],
      },

      // Sem esta rota, uma URL inexistente é tela branca: o servidor devolve o
      // index.html para qualquer caminho, e o router não casaria nada.
      { path: "*", Component: NotFound, handle: { title: "Não encontrado · Fronteira Concursos" } },
    ],
  },
]);
