import type { BreadcrumbItem } from "@/components/navigation/Breadcrumbs";
import type { NavigationItem, NavigationSection, ResolvedRoute } from "./types";

function compactId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function standardBreadcrumbs(areaLabel: string, areaHref: string, route: ResolvedRoute): BreadcrumbItem[] {
  return [{ href: areaHref, label: areaLabel }, { label: route.title }];
}

export function professorBreadcrumbs(route: ResolvedRoute): BreadcrumbItem[] {
  const studentId = route.params.alunoId;
  const planningId = route.params.planejamentoId;
  const items: BreadcrumbItem[] = [{ href: "/professor/alunos", label: "Alunos" }];

  if (!studentId) {
    if (route.pattern !== "alunos") items.push({ label: route.title });
    return items;
  }

  const studentBase = `/professor/alunos/${studentId}`;
  items.push({ href: `${studentBase}/resumo`, label: `Aluno ${compactId(studentId)}` });

  if (planningId) {
    const planningBase = `${studentBase}/planejamentos/${planningId}`;
    items.push({ href: `${planningBase}/resumo`, label: `Planejamento ${compactId(planningId)}` });
  } else if (route.pattern.includes("planejamentos")) {
    items.push({ href: `${studentBase}/planejamentos`, label: "Planejamentos" });
  }

  items.push({ label: route.title });
  return items;
}

function professorStudentNavigation(studentId: string): NavigationItem[] {
  const studentBase = `/professor/alunos/${studentId}`;

  return [
    ["resumo", "Resumo"],
    ["acesso", "Acesso"],
    ["planejamentos", "Planejamentos"],
    ["planejamentos/novo", "Novo planejamento"],
  ].map(([path, label]) => ({ href: `${studentBase}/${path}`, label, exact: true }));
}

function professorPlanningNavigation(studentId: string, planningId: string): NavigationItem[] {
  const planningBase = `/professor/alunos/${studentId}/planejamentos/${planningId}`;

  return [
    ["resumo", "Resumo"],
    ["disciplinas", "Disciplinas"],
    ["cadernos", "Cadernos"],
    ["aulas", "Aulas"],
    ["metas", "Metas"],
    ["metas/gerar", "Gerar metas"],
    ["reforcos", "Reforços"],
    ["revisoes", "Revisões"],
  ].map(([path, label]) => ({ href: `${planningBase}/${path}`, label, exact: true }));
}

export function professorNavigationSections(route: ResolvedRoute): NavigationSection[] {
  const studentId = route.params.alunoId;
  if (!studentId) return [];

  const sections: NavigationSection[] = [{
    label: "Aluno selecionado",
    items: professorStudentNavigation(studentId),
  }];
  const planningId = route.params.planejamentoId;

  if (planningId) {
    sections.push({
      label: "Planejamento selecionado",
      items: professorPlanningNavigation(studentId, planningId),
    });
  }

  return sections;
}

export function professorContextNavigation(route: ResolvedRoute): NavigationItem[] | null {
  const sections = professorNavigationSections(route);
  return sections.at(-1)?.items ?? null;
}

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
