"use client";

import dynamic from "next/dynamic";

import type { ResolvedRoute } from "@/lib/routes/types";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";

const loading = () => <LoadingSkeleton label="Carregando administração" variant="detail" />;

const AdminOperationRoutes = dynamic(
  () => import("./admin/AdminOperationRoutes").then((module) => module.AdminOperationRoutes),
  { loading },
);
const AdminProfileRoute = dynamic(
  () => import("./admin/AdminProfileRoute").then((module) => module.AdminProfileRoute),
  { loading },
);
const AdminCatalogRoutes = dynamic(
  () => import("./admin/AdminCatalogRoutes").then((module) => module.AdminCatalogRoutes),
  { loading },
);
const AdminAccountRoutes = dynamic(
  () => import("./admin/AdminAccountRoutes").then((module) => module.AdminAccountRoutes),
  { loading },
);

export function AdminDomainPage({ route }: { route: ResolvedRoute }) {
  if (route.pathname.startsWith("catalogo/")) return <AdminCatalogRoutes route={route} />;
  if (route.pathname === "perfil") return <AdminProfileRoute />;
  if (["lista-de-espera", "auditoria"].includes(route.pathname)) return <AdminAccountRoutes route={route} />;
  return <AdminOperationRoutes route={route} />;
}
