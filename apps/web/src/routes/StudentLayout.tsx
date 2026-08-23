import { Outlet, useLoaderData } from "react-router";

import { Sidebar, type NavGroup } from "@/components/Sidebar";
import { Alert } from "@/components/ui";
import { useSignOut } from "@/lib/auth/useSignOut";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function studentLayoutLoader() {
  const session = await requireRole("student");
  return { name: session.name, hasAccess: session.hasAccess };
}

type LoaderData = Awaited<ReturnType<typeof studentLayoutLoader>>;

export function StudentLayout() {
  const session = useLoaderData() as LoaderData;
  const signOut = useSignOut();

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
      <Sidebar groups={groups} userName={session.name} roleLabel="Aluno" signOutAction={signOut} />
      <main className="content">
        {!session.hasAccess && (
          <Alert kind="warning">
            Seu acesso ainda não foi liberado. Você pode editar seus dados e entrar na lista de
            espera enquanto aguarda.
          </Alert>
        )}
        <Outlet />
      </main>
    </div>
  );
}
