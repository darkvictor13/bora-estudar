"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandMark } from "@/components/brand/BrandMark";
import { AppearanceControls } from "@/components/theme/AppearanceControls";
import type { UserRole } from "@/lib/auth/session";
import {
  isNavigationItemActive,
  professorNavigationSections,
} from "@/lib/routes/navigation";
import { professorArea, resolveRoute } from "@/lib/routes/registry";
import type { NavigationItem } from "@/lib/routes/types";

type AppShellProps = {
  areaLabel: string;
  children: React.ReactNode;
  navigation: NavigationItem[];
  role: UserRole;
};

export function AppShell({ areaLabel, children, navigation, role }: AppShellProps) {
  const pathname = usePathname();
  const professorRoute = role === "professor"
    ? resolveRoute(professorArea, pathname.split("/").filter(Boolean).slice(1))
    : null;
  const contextualSections = professorRoute
    ? professorNavigationSections(professorRoute)
    : [];

  useEffect(() => {
    document.documentElement.dataset.profile = role;
  }, [role]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-brand" href={`/${role}`} aria-label="Bora Estudar — início da área">
          <BrandMark />
          <span>
            <strong>Bora Estudar</strong>
            <small>{areaLabel}</small>
          </span>
        </Link>
        <AppearanceControls />
      </header>

      <div className="app-frame">
        <nav className="app-navigation" aria-label={`Navegação — ${areaLabel}`}>
          <div className="app-navigation__primary">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isNavigationItemActive(pathname, item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
          {contextualSections.map((section) => (
            <div
              className="app-navigation__section"
              key={section.label}
              role="group"
              aria-label={section.label}
            >
              <span className="app-navigation__section-label">{section.label}</span>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isNavigationItemActive(pathname, item) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <LogoutButton />
        </nav>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
