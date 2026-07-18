import Link from "next/link";

export type RouteStateKind =
  | "empty"
  | "loading"
  | "connection-error"
  | "denied"
  | "pending"
  | "blocked"
  | "expired"
  | "not-found";

type RouteStateProps = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  kind: RouteStateKind;
  title: string;
};

export function RouteState({ actionHref, actionLabel, description, kind, title }: RouteStateProps) {
  return (
    <section className="route-state be-card" data-state={kind} aria-live={kind === "loading" ? "polite" : undefined}>
      <span className="route-state__symbol" aria-hidden="true">
        {kind === "loading" ? "…" : kind === "empty" ? "○" : "!"}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {actionHref && actionLabel ? <Link className="be-button" href={actionHref}>{actionLabel}</Link> : null}
      </div>
    </section>
  );
}
