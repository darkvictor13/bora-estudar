import { useState, type ReactNode } from "react";

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
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={isPassword ? "field__control" : undefined}>
        {/* Alternar o `type` do PRÓPRIO input, e nada mais: a senha nunca
            existe em dois lugares, e o `autoComplete` que o campo já tinha
            continua valendo — o gerenciador de senhas não pode perder o campo
            só porque o texto ficou visível (R-UI-09, R-UI-12). */}
        <input
          id={id}
          name={name}
          type={isPassword && revealed ? "text" : type}
          {...rest}
        />
        {isPassword && (
          // `type="button"` não é detalhe: um <button> sem tipo dentro de
          // <form> SUBMETE, e aqui submeteria o login ao tentar ver a senha.
          <button
            type="button"
            className="field__reveal"
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? "Ocultar" : "Mostrar"}
          </button>
        )}
      </div>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}
