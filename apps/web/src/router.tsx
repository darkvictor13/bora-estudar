import { createBrowserRouter } from "react-router";

import { RootError, RootLayout, RootLoading } from "@/routes/RootLayout";
import { PublicLayout, publicLayoutLoader } from "@/routes/PublicLayout";
import { StudentLayout, studentLayoutLoader } from "@/routes/StudentLayout";
import { TeacherLayout, teacherLayoutLoader } from "@/routes/TeacherLayout";
import { NotFound, RouteError } from "@/routes/RouteError";
import { Home, homeLoader } from "@/routes/Home";
import { AuthCallback, authCallbackLoader } from "@/routes/AuthCallback";

import { SignIn, signInLoader } from "@/routes/public/SignIn";
import { SignUp, signUpLoader } from "@/routes/public/SignUp";
import { ForgotPassword } from "@/routes/public/ForgotPassword";
import { ResetPassword, resetPasswordLoader } from "@/routes/public/ResetPassword";

import { Overview, overviewLoader } from "@/routes/student/Overview";
import { Planning, planningLoader } from "@/routes/student/Planning";
import { Subjects, subjectsLoader } from "@/routes/student/Subjects";
import { Theory, theoryLoader } from "@/routes/student/Theory";
import { Laws, lawsLoader } from "@/routes/student/Laws";
import { Flashcards, flashcardsLoader } from "@/routes/student/Flashcards";
import { FlashcardStatistics, flashcardStatisticsLoader } from "@/routes/student/FlashcardStatistics";
import { FlashSummaries, flashSummariesLoader } from "@/routes/student/FlashSummaries";
import { Schedule } from "@/routes/student/Schedule";
import { Timer, timerLoader } from "@/routes/student/Timer";
import { MockExams, mockExamsLoader } from "@/routes/student/MockExams";
import { TeacherMockExams, teacherMockExamsLoader } from "@/routes/teacher/MockExams";
import { StudentNotebooks, studentNotebooksLoader } from "@/routes/student/Notebooks";
import { StudentStatistics, studentStatisticsLoader } from "@/routes/student/Statistics";
import { StudentReviews, studentReviewsLoader } from "@/routes/student/Reviews";
import { Account, accountLoader } from "@/routes/student/Account";
import { Waitlist, waitlistLoader } from "@/routes/student/Waitlist";

import { TeacherStudents, teacherStudentsLoader } from "@/routes/teacher/Students";
import { TeacherStudent, teacherStudentLoader } from "@/routes/teacher/Student";
import { TeacherClasses, teacherClassesLoader } from "@/routes/teacher/Classes";
import { TeacherPlans, teacherPlansLoader } from "@/routes/teacher/Plans";
import { TeacherGoals, teacherGoalsLoader } from "@/routes/teacher/Goals";
import { TeacherNotebooks, teacherNotebooksLoader } from "@/routes/teacher/Notebooks";
import { TeacherTheory, teacherTheoryLoader } from "@/routes/teacher/Theory";
import { TeacherReviews, teacherReviewsLoader } from "@/routes/teacher/Reviews";
import { TeacherStatistics, teacherStatisticsLoader } from "@/routes/teacher/Statistics";

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
            loader: signUpLoader,
            Component: SignUp,
            handle: { title: "Criar conta · Fronteira Concursos" },
          },
          {
            path: ROUTES.forgotPassword,
            Component: ForgotPassword,
            handle: { title: "Recuperar senha · Fronteira Concursos" },
          },
          {
            path: ROUTES.resetPassword,
            loader: resetPasswordLoader,
            Component: ResetPassword,
            handle: { title: "Nova senha · Fronteira Concursos" },
          },
        ],
      },

      {
        loader: studentLayoutLoader,
        // O layout não tem caminho, e o React Router não reexecuta o loader de uma
        // rota que continua casada quando só o filho muda: liberado ou suspenso, a
        // barra seguia com os itens do estado antigo até o F5 (QA-09, R-ACC-08).
        // Declarar DESLIGA o padrão inteiro: o `||` devolve o que o router faria
        // sozinho (revalidate(), search nova) e acrescenta a troca de tela.
        shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
          defaultShouldRevalidate || currentUrl.pathname !== nextUrl.pathname,
        Component: StudentLayout,
        children: [
          {
            ErrorBoundary: RouteError,
            children: [
              {
                path: ROUTES.student.overview,
                loader: overviewLoader,
                Component: Overview,
                handle: { title: "Minha semana · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.planning,
                loader: planningLoader,
                Component: Planning,
                handle: { title: "Meu curso · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.theory,
                loader: theoryLoader,
                Component: Theory,
                handle: { title: "Aulas · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.subjects,
                loader: subjectsLoader,
                Component: Subjects,
                handle: { title: "Disciplinas · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.laws,
                loader: lawsLoader,
                Component: Laws,
                handle: { title: "Leis · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.flashcards,
                loader: flashcardsLoader,
                Component: Flashcards,
                handle: { title: "Flashcards · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.flashcardStatistics,
                loader: flashcardStatisticsLoader,
                Component: FlashcardStatistics,
                handle: { title: "Estatísticas dos flashcards · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.flashSummaries,
                loader: flashSummariesLoader,
                Component: FlashSummaries,
                handle: { title: "Resumos Flash · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.schedule,
                Component: Schedule,
                handle: { title: "Minha semana · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.timer,
                loader: timerLoader,
                Component: Timer,
                handle: { title: "Cronômetro · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.mockExams,
                loader: mockExamsLoader,
                Component: MockExams,
                handle: { title: "Simulados · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.notebooks,
                loader: studentNotebooksLoader,
                Component: StudentNotebooks,
                handle: { title: "Cadernos TEC · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.statistics,
                loader: studentStatisticsLoader,
                Component: StudentStatistics,
                handle: { title: "Estatísticas · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.reviews,
                loader: studentReviewsLoader,
                Component: StudentReviews,
                handle: { title: "Revisões · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.account,
                loader: accountLoader,
                Component: Account,
                handle: { title: "Meus dados · Fronteira Concursos" },
              },
              {
                path: ROUTES.student.waitlist,
                loader: waitlistLoader,
                Component: Waitlist,
                handle: { title: "Lista de espera · Fronteira Concursos" },
              },
        ],
          },
        ],
      },

      {
        loader: teacherLayoutLoader,
        Component: TeacherLayout,
        children: [
          {
            ErrorBoundary: RouteError,
            children: [
              {
                path: ROUTES.teacher.students,
                loader: teacherStudentsLoader,
                Component: TeacherStudents,
                handle: { title: "Meus alunos · Fronteira Concursos" },
              },
              {
                path: "/professor/alunos/:studentId",
                loader: teacherStudentLoader,
                Component: TeacherStudent,
                handle: { title: "Aluno · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.classes,
                loader: teacherClassesLoader,
                Component: TeacherClasses,
                handle: { title: "Turmas · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.mockExams,
                loader: teacherMockExamsLoader,
                Component: TeacherMockExams,
                handle: { title: "Simulados presenciais · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.plans,
                loader: teacherPlansLoader,
                Component: TeacherPlans,
                handle: { title: "Planejamentos · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.goals,
                loader: teacherGoalsLoader,
                Component: TeacherGoals,
                handle: { title: "Gerar metas · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.theory,
                loader: teacherTheoryLoader,
                Component: TeacherTheory,
                handle: { title: "Materiais das aulas · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.notebooks,
                loader: teacherNotebooksLoader,
                Component: TeacherNotebooks,
                handle: { title: "Cadernos · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.reviews,
                loader: teacherReviewsLoader,
                Component: TeacherReviews,
                handle: { title: "Revisões · Fronteira Concursos" },
              },
              {
                path: ROUTES.teacher.statistics,
                loader: teacherStatisticsLoader,
                Component: TeacherStatistics,
                handle: { title: "Estatísticas · Fronteira Concursos" },
              },
              {
                // A mesma tela de `/aluno/conta`, com texto por papel e sem o cartão
                // Acesso (R-CONTA-09): mesmos campos, mesma action.
                path: ROUTES.teacher.account,
                loader: accountLoader,
                Component: Account,
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
