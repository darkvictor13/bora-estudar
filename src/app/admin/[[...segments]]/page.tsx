import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminDomainPage } from "@/components/domain/AdminDomainPage";
import { RoutePage } from "@/components/pages/RoutePage";
import { standardBreadcrumbs } from "@/lib/routes/navigation";
import { adminArea, resolveRoute } from "@/lib/routes/registry";

type PageProps = { params: Promise<{ segments?: string[] }> };

async function getRoute(params: PageProps["params"]) {
  const { segments = [] } = await params;
  if (!segments.length) redirect("/admin/inicio");
  return resolveRoute(adminArea, segments);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const route = await getRoute(params);
  return { title: route?.title ?? "Página não encontrada" };
}

export default async function AdminPage({ params }: PageProps) {
  const route = await getRoute(params);
  if (!route) notFound();
  return (
    <RoutePage route={route} breadcrumbs={standardBreadcrumbs("Administração", "/admin/inicio", route)}>
      <AdminDomainPage route={route} />
    </RoutePage>
  );
}
