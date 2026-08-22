import type { ReactNode } from "react";

export function Card({
  title,
  sub,
  action,
  children,
}: {
  title?: string | undefined;
  sub?: string | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {(title || action) && (
        <header className="card__header">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="card__sub">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Alert({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "success" | "warning" | undefined;
  children: ReactNode;
}) {
  return (
    <div className={`alert alert--${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "green" | "amber" | "red" | "blue" | undefined;
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string | undefined;
}) {
  return (
    <header className="content__header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}

export function Field({
  label,
  name,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string | undefined;
  hint?: string | undefined;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} name={name} type={type} {...rest} />
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}
