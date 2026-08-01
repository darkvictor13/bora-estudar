"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavigationItemActive } from "@/lib/routes/navigation";
import type { NavigationItem } from "@/lib/routes/types";

export function ContextNavigation({ items, label }: { items: NavigationItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="context-navigation" aria-label={label}>
      {items.map((item) => {
        const active = isNavigationItemActive(pathname, item);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</Link>;
      })}
    </nav>
  );
}
