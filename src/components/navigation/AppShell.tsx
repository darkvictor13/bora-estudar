"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandMark } from "@/components/brand/BrandMark";
import { AppearanceControls } from "@/components/theme/AppearanceControls";
import type { NavigationItem } from "@/lib/routes/types";
import type { UserRole } from "@/lib/auth/session";

type AppShellProps = {
  areaLabel: string;
  children: React.ReactNode;
  navigation: NavigationItem[];
  role: UserRole;
};

export function AppShell({ areaLabel, children, navigation, role }: AppShellProps) {
  const pathname = usePathname();

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
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
          <LogoutButton />
        </nav>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
