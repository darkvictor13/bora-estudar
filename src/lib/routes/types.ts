import type { UserRole } from "@/lib/auth/session";

export type RouteDefinition = {
  pattern: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

export type NavigationItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export type ResolvedRoute = RouteDefinition & {
  pathname: string;
  params: Record<string, string>;
};

export type AppArea = {
  role: UserRole;
  label: string;
  routes: RouteDefinition[];
  navigation: NavigationItem[];
};
