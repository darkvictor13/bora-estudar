import type { ReactNode } from "react";
import { Sidebar, type NavGroup } from "@/components/Sidebar";
import { Alert } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const session = await requireRole("student");

  const groups: NavGroup[] = [
    {
      title: "Estudo",
      items: [
        { href: ROUTES.student.overview, label: "Visão geral", enabled: session.hasAccess },
        { href: ROUTES.student.subjects, label: "Disciplinas", enabled: session.hasAccess },
        { href: ROUTES.student.notebooks, label: "Cadernos TEC", enabled: session.hasAccess },
        { href: ROUTES.student.statistics, label: "Estatísticas", enabled: session.hasAccess },
        { href: ROUTES.student.reviews, label: "Revisões", enabled: session.hasAccess },
      ],
    },
    {
      title: "Conta",
      items: [
        { href: ROUTES.student.account, label: "Meus dados" },
        { href: ROUTES.student.waitlist, label: "Lista de espera" },
      ],
    },
  ];

  return (
    <div className="shell">
      <Sidebar
        groups={groups}
        userName={session.name}
        roleLabel="Aluno"
        signOutAction={signOut}
      />
      <main className="content">
        {!session.hasAccess && (
          <Alert kind="warning">
            Seu acesso ainda não foi liberado. Você pode editar seus dados e entrar na lista de
            espera enquanto aguarda.
          </Alert>
        )}
        {children}
      </main>
    </div>
  );
}
