import { Outlet, useLoaderData } from "react-router";

import { Sidebar, type NavGroup } from "@/components/Sidebar";
import { useSignOut } from "@/lib/auth/useSignOut";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function teacherLayoutLoader() {
  const session = await requireRole("teacher");
  return { name: session.name };
}

type LoaderData = Awaited<ReturnType<typeof teacherLayoutLoader>>;

export function TeacherLayout() {
  const session = useLoaderData() as LoaderData;
  const signOut = useSignOut();

  const groups: NavGroup[] = [
    {
      title: "Turma",
      items: [
        { href: ROUTES.teacher.students, label: "Meus alunos" },
        { href: ROUTES.teacher.plans, label: "Planejamentos" },
        { href: ROUTES.teacher.goals, label: "Gerar metas" },
      ],
    },
    {
      title: "Conteúdo",
      items: [
        { href: ROUTES.teacher.notebooks, label: "Cadernos" },
        { href: ROUTES.teacher.reviews, label: "Revisões" },
        { href: ROUTES.teacher.statistics, label: "Estatísticas" },
      ],
    },
  ];

  return (
    <div className="shell">
      <Sidebar
        groups={groups}
        userName={session.name}
        roleLabel="Professor"
        signOutAction={signOut}
      />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
