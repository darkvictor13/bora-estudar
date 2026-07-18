import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RoutePage } from "@/components/pages/RoutePage";
import { requireStudentAcademicAccess } from "@/lib/auth/guards";
import { standardBreadcrumbs } from "@/lib/routes/navigation";
import { resolveRoute, studentArea } from "@/lib/routes/registry";

type PageProps = { params: Promise<{ segments?: string[] }> };

async function getRoute(params: PageProps["params"]) {
  const { segments = [] } = await params;
  if (!segments.length) redirect("/aluno/inicio");
  await requireStudentAcademicAccess(segments);
  return resolveRoute(studentArea, segments);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const route = await getRoute(params);
  return { title: route?.title ?? "Página não encontrada" };
}

export default async function StudentPage({ params }: PageProps) {
  const route = await getRoute(params);
  if (!route) notFound();
  return <RoutePage route={route} breadcrumbs={standardBreadcrumbs("Aluno", "/aluno/inicio", route)} />;
}
