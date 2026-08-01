import styles from "./LoadingSkeleton.module.css";

export type SkeletonVariant = "dashboard" | "detail" | "form" | "list";

type LoadingSkeletonProps = {
  includeHeading?: boolean;
  label?: string;
  variant?: SkeletonVariant;
};

function SkeletonLine({ size = "medium" }: { size?: "long" | "medium" | "short" }) {
  return <span className={styles.line} data-size={size} />;
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.rows}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.row} key={index}>
          <span className={styles.avatar} />
          <div className={styles.rowText}>
            <SkeletonLine size={index % 2 === 0 ? "medium" : "long"} />
            <SkeletonLine size="short" />
          </div>
          <span className={styles.action} />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className={styles.metrics}>
        {Array.from({ length: 4 }, (_, index) => (
          <div className={styles.metric} key={index}>
            <SkeletonLine size="short" />
            <span className={styles.value} />
            <SkeletonLine size="medium" />
          </div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHeading}>
          <div className={styles.headingText}>
            <SkeletonLine size="medium" />
            <SkeletonLine size="long" />
          </div>
          <span className={styles.button} />
        </div>
        <SkeletonRows count={3} />
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className={styles.panel}>
      <div className={styles.filters}>
        <span />
        <span />
      </div>
      <SkeletonRows />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className={styles.panel}>
      <div className={styles.headingText}>
        <SkeletonLine size="medium" />
        <SkeletonLine size="long" />
      </div>
      <div className={styles.form}>
        {Array.from({ length: 4 }, (_, index) => (
          <div className={styles.field} key={index}>
            <SkeletonLine size="short" />
            <span className={styles.input} />
          </div>
        ))}
      </div>
      <span className={styles.button} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.detailStack}>
      <div className={styles.panel}>
        <div className={styles.panelHeading}>
          <div className={styles.headingText}>
            <SkeletonLine size="short" />
            <SkeletonLine size="medium" />
          </div>
          <span className={styles.badge} />
        </div>
        <div className={styles.detailGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>
              <SkeletonLine size="short" />
              <SkeletonLine size="medium" />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.panel}>
        <SkeletonRows count={2} />
      </div>
    </div>
  );
}

export function LoadingSkeleton({
  includeHeading = false,
  label = "Carregando conteúdo",
  variant = "list",
}: LoadingSkeletonProps) {
  return (
    <div className={styles.root} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.visuallyHidden}>{label}</span>
      <div aria-hidden="true">
        {includeHeading ? (
          <div className={styles.pageHeading}>
            <SkeletonLine size="short" />
            <SkeletonLine size="medium" />
            <SkeletonLine size="long" />
          </div>
        ) : null}
        <div className={styles.content}>
          {variant === "dashboard" ? <DashboardSkeleton /> : null}
          {variant === "list" ? <ListSkeleton /> : null}
          {variant === "form" ? <FormSkeleton /> : null}
          {variant === "detail" ? <DetailSkeleton /> : null}
        </div>
      </div>
    </div>
  );
}

export function InlineLoadingIndicator({ label = "Atualizando dados" }: { label?: string }) {
  return (
    <div className={styles.indicator} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ButtonSpinner() {
  return <span className={styles.buttonSpinner} aria-hidden="true" />;
}
