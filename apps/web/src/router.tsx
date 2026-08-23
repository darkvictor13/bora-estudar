import { createBrowserRouter } from "react-router";

import { RootLayout } from "@/routes/RootLayout";
import { PublicLayout } from "@/routes/PublicLayout";
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
import { Subjects, subjectsLoader } from "@/routes/student/Subjects";
import { StudentNotebooks, studentNotebooksLoader } from "@/routes/student/Notebooks";
import { StudentStatistics, studentStatisticsLoader } from "@/routes/student/Statistics";
import { StudentReviews, studentReviewsLoader } from "@/routes/student/Reviews";
import { Account, accountLoader } from "@/routes/student/Account";
import { Waitlist, waitlistLoader } from "@/routes/student/Waitlist";

import { TeacherStudents, teacherStudentsLoader } from "@/routes/teacher/Students";
import { TeacherStudent, teacherStudentLoader } from "@/routes/teacher/Student";
import { TeacherPlans, teacherPlansLoader } from "@/routes/teacher/Plans";
import { TeacherGoals, teacherGoalsLoader } from "@/routes/teacher/Goals";
import { TeacherNotebooks, teacherNotebooksLoader } from "@/routes/teacher/Notebooks";
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
 * `ErrorBoundary` fica na raiz e nas duas áreas: um erro de loader dentro da
 * área do aluno renderiza a mensagem COM a sidebar em volta, em vez de trocar a
 * aplicação inteira por uma tela de erro.
 */
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, loader: homeLoader, Component: Home },

      {
        path: ROUTES.authCallback,
        loader: authCallbackLoader,
        Component: AuthCallback,
      },

      {
        Component: PublicLayout,
        children: [
          {
            path: ROUTES.signIn,
            loader: signInLoader,
            Component: SignIn,
            handle: { title: "Entrar · Bora Estudar" },
          },
          {
            path: ROUTES.signUp,
            loader: signUpLoader,
            Component: SignUp,
            handle: { title: "Criar conta · Bora Estudar" },
          },
          {
            path: ROUTES.forgotPassword,
            Component: ForgotPassword,
            handle: { title: "Recuperar senha · Bora Estudar" },
          },
          {
            path: ROUTES.resetPassword,
            loader: resetPasswordLoader,
            Component: ResetPassword,
            handle: { title: "Nova senha · Bora Estudar" },
          },
        ],
      },

      {
        loader: studentLayoutLoader,
        Component: StudentLayout,
        ErrorBoundary: RouteError,
        children: [
          {
            path: ROUTES.student.overview,
            loader: overviewLoader,
            Component: Overview,
            handle: { title: "Visão geral · Bora Estudar" },
          },
          {
            path: ROUTES.student.subjects,
            loader: subjectsLoader,
            Component: Subjects,
            handle: { title: "Disciplinas · Bora Estudar" },
          },
          {
            path: ROUTES.student.notebooks,
            loader: studentNotebooksLoader,
            Component: StudentNotebooks,
            handle: { title: "Cadernos TEC · Bora Estudar" },
          },
          {
            path: ROUTES.student.statistics,
            loader: studentStatisticsLoader,
            Component: StudentStatistics,
            handle: { title: "Estatísticas · Bora Estudar" },
          },
          {
            path: ROUTES.student.reviews,
            loader: studentReviewsLoader,
            Component: StudentReviews,
            handle: { title: "Revisões · Bora Estudar" },
          },
          {
            path: ROUTES.student.account,
            loader: accountLoader,
            Component: Account,
            handle: { title: "Meus dados · Bora Estudar" },
          },
          {
            path: ROUTES.student.waitlist,
            loader: waitlistLoader,
            Component: Waitlist,
            handle: { title: "Lista de espera · Bora Estudar" },
          },
        ],
      },

      {
        loader: teacherLayoutLoader,
        Component: TeacherLayout,
        ErrorBoundary: RouteError,
        children: [
          {
            path: ROUTES.teacher.students,
            loader: teacherStudentsLoader,
            Component: TeacherStudents,
            handle: { title: "Meus alunos · Bora Estudar" },
          },
          {
            path: "/professor/alunos/:studentId",
            loader: teacherStudentLoader,
            Component: TeacherStudent,
            handle: { title: "Aluno · Bora Estudar" },
          },
          {
            path: ROUTES.teacher.plans,
            loader: teacherPlansLoader,
            Component: TeacherPlans,
            handle: { title: "Planejamentos · Bora Estudar" },
          },
          {
            path: ROUTES.teacher.goals,
            loader: teacherGoalsLoader,
            Component: TeacherGoals,
            handle: { title: "Gerar metas · Bora Estudar" },
          },
          {
            path: ROUTES.teacher.notebooks,
            loader: teacherNotebooksLoader,
            Component: TeacherNotebooks,
            handle: { title: "Cadernos · Bora Estudar" },
          },
          {
            path: ROUTES.teacher.reviews,
            loader: teacherReviewsLoader,
            Component: TeacherReviews,
            handle: { title: "Revisões · Bora Estudar" },
          },
          {
            path: ROUTES.teacher.statistics,
            loader: teacherStatisticsLoader,
            Component: TeacherStatistics,
            handle: { title: "Estatísticas · Bora Estudar" },
          },
        ],
      },

      // Sem esta rota, uma URL inexistente é tela branca: o servidor devolve o
      // index.html para qualquer caminho, e o router não casaria nada.
      { path: "*", Component: NotFound, handle: { title: "Não encontrado · Bora Estudar" } },
    ],
  },
]);
