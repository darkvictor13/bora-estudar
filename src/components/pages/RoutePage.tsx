import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/Breadcrumbs";
import { ContextNavigation } from "@/components/navigation/ContextNavigation";
import { RouteState } from "@/components/states/RouteState";
import type { NavigationItem, ResolvedRoute } from "@/lib/routes/types";

type RoutePageProps = {
  breadcrumbs?: BreadcrumbItem[];
  children?: React.ReactNode;
  contextNavigation?: { items: NavigationItem[]; label: string };
  route: ResolvedRoute;
};

export function RoutePage({ breadcrumbs = [], children, contextNavigation, route }: RoutePageProps) {
  return (
    <div className="route-page be-enter">
      <Breadcrumbs items={breadcrumbs} />
      <header className="route-heading">
        <span className="be-section-label">Bora Estudar Concursos</span>
        <h1>{route.title}</h1>
        <p>{route.description}</p>
      </header>
      {contextNavigation ? (
        <ContextNavigation items={contextNavigation.items} label={contextNavigation.label} />
      ) : null}
      {children ?? (
        <RouteState
          kind="empty"
          title={route.emptyTitle}
          description={route.emptyDescription}
        />
      )}
    </div>
  );
}
