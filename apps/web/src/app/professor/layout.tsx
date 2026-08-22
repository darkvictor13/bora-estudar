import type { ReactNode } from "react";

import { Sidebar, type NavGroup } from "@/components/Sidebar";
import { signOut } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const session = await requireRole("teacher");

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
      <main className="content">{children}</main>
    </div>
  );
}
