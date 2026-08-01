import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProfessorDomainPage } from "@/components/domain/ProfessorDomainPage";
import { RoutePage } from "@/components/pages/RoutePage";
import { requireProfessorStudentLink } from "@/lib/auth/guards";
import { professorBreadcrumbs, professorContextNavigation } from "@/lib/routes/navigation";
import { professorArea, resolveRoute } from "@/lib/routes/registry";

type PageProps = { params: Promise<{ segments?: string[] }> };

async function getRoute(params: PageProps["params"]) {
  const { segments = [] } = await params;
  if (!segments.length) redirect("/professor/alunos");
  const route = resolveRoute(professorArea, segments);
  if (route?.params.alunoId) await requireProfessorStudentLink(route.params.alunoId);
  return route;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const route = await getRoute(params);
  return { title: route?.title ?? "Página não encontrada" };
}

export default async function ProfessorPage({ params }: PageProps) {
  const route = await getRoute(params);
  if (!route) notFound();
  const contextualItems = professorContextNavigation(route);
  return (
    <RoutePage
      route={route}
      breadcrumbs={professorBreadcrumbs(route)}
      contextNavigation={contextualItems ? { items: contextualItems, label: "Navegação do contexto selecionado" } : undefined}
    >
      <ProfessorDomainPage route={route} />
    </RoutePage>
  );
}
