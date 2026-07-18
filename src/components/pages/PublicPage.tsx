import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";
import { AppearanceControls } from "@/components/theme/AppearanceControls";

type PublicPageProps = {
  children?: React.ReactNode;
  description: string;
  title: string;
};

export function PublicPage({ children, description, title }: PublicPageProps) {
  return (
    <main className="public-page">
      <header className="public-header">
        <Link className="app-brand" href="/" aria-label="Bora Estudar — início">
          <BrandMark />
          <strong>Bora Estudar</strong>
        </Link>
        <AppearanceControls />
      </header>
      <section className="public-card be-card be-enter">
        <span className="be-section-label">Bora Estudar Concursos</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </section>
    </main>
  );
}
