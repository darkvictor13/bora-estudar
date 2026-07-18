import Link from "next/link";

export type BreadcrumbItem = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length < 2) return null;

  return (
    <nav className="breadcrumbs" aria-label="Navegação estrutural">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href && index < items.length - 1 ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
