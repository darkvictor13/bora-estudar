"use client";

import dynamic from "next/dynamic";

import type { ResolvedRoute } from "@/lib/routes/types";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";

const loading = () => <LoadingSkeleton label="Carregando área do professor" variant="detail" />;

const ProfessorDirectoryRoutes = dynamic(
  () => import("./professor/ProfessorDirectoryRoutes").then((module) => module.ProfessorDirectoryRoutes),
  { loading },
);
const ProfessorProfileRoute = dynamic(
  () => import("./professor/ProfessorProfileRoute").then((module) => module.ProfessorProfileRoute),
  { loading },
);
const ProfessorStudentRoutes = dynamic(
  () => import("./professor/ProfessorStudentRoutes").then((module) => module.ProfessorStudentRoutes),
  { loading },
);
const ProfessorPlanningRoutes = dynamic(
  () => import("./professor/ProfessorPlanningRoutes").then((module) => module.ProfessorPlanningRoutes),
  { loading },
);

function DomainMessage({ description, title }: { description: string; title: string }) {
  return <section className="be-card"><h2>{title}</h2><p>{description}</p></section>;
}

export function ProfessorDomainPage({ route }: { route: ResolvedRoute }) {
  if (["inicio", "alunos", "lista-de-espera"].includes(route.pattern)) {
    return <ProfessorDirectoryRoutes route={route} />;
  }
  if (route.pattern === "perfil") return <ProfessorProfileRoute />;
  if ([
    "alunos/:alunoId/resumo",
    "alunos/:alunoId/acesso",
    "alunos/:alunoId/planejamentos",
    "alunos/:alunoId/planejamentos/novo",
    "alunos/:alunoId/planejamentos/:planejamentoId/resumo",
  ].includes(route.pattern)) {
    return <ProfessorStudentRoutes route={route} />;
  }
  if (["alunos/:alunoId/desempenho", "alunos/:alunoId/planejamentos/:planejamentoId/desempenho"].includes(route.pattern)) {
    return <DomainMessage title="Desempenho será implementado depois" description="Esta entrega mantém as rotas de desempenho sem cálculos parciais ou divergentes." />;
  }
  if (route.pattern.startsWith("alunos/:alunoId/planejamentos/:planejamentoId/")) {
    return <ProfessorPlanningRoutes route={route} />;
  }
  return <DomainMessage title="Tela não reconhecida" description="A rota não possui uma implementação de domínio para o professor." />;
}
