"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** `false` deixa o item visível mas inerte, para o aluno sem acesso liberado. */
  readonly enabled?: boolean | undefined;
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

export function Sidebar({
  groups,
  userName,
  roleLabel,
  signOutAction,
}: {
  groups: readonly NavGroup[];
  userName: string;
  roleLabel: string;
  signOutAction: () => Promise<never>;
}) {
  const pathname = usePathname();

  // Casa a rota mais específica: sem isso "/aluno" ficaria marcada como atual
  // em todas as subpáginas.
  const currentHref = groups
    .flatMap((g) => g.items)
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <div className="sidebar__brand">
        Bora Estudar
        <span>Concursos</span>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="sidebar__group">
          <p className="sidebar__title">{group.title}</p>
          {group.items.map((item) => {
            const disabled = item.enabled === false;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sidebar__link"
                aria-current={item.href === currentHref ? "page" : undefined}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="sidebar__foot">
        <div className="sidebar__user">
          {userName}
          <span>{roleLabel}</span>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn--ghost btn--block btn--sm" style={{ color: "#cbd5e1" }}>
            Sair
          </button>
        </form>
      </div>
    </nav>
  );
}
