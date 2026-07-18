import type { BreadcrumbItem } from "@/components/navigation/Breadcrumbs";
import type { NavigationItem, ResolvedRoute } from "./types";

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

export function professorContextNavigation(route: ResolvedRoute): NavigationItem[] | null {
  const studentId = route.params.alunoId;
  if (!studentId) return null;
  const studentBase = `/professor/alunos/${studentId}`;
  const planningId = route.params.planejamentoId;

  if (!planningId) {
    return [
      ["resumo", "Resumo"], ["acesso", "Acesso"],
      ["planejamentos", "Planejamentos"], ["desempenho", "Desempenho"],
    ].map(([path, label]) => ({ href: `${studentBase}/${path}`, label }));
  }

  const planningBase = `${studentBase}/planejamentos/${planningId}`;
  return [
    ["resumo", "Resumo"], ["disciplinas", "Disciplinas"], ["cadernos", "Cadernos"],
    ["aulas", "Aulas"], ["metas", "Metas"], ["reforcos", "Reforços"],
    ["revisoes", "Revisões"], ["desempenho", "Desempenho"],
  ].map(([path, label]) => ({ href: `${planningBase}/${path}`, label }));
}
