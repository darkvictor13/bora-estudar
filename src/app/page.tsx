import { BrandMark } from "@/components/brand/BrandMark";
import { AppearanceControls } from "@/components/theme/AppearanceControls";

import styles from "./page.module.css";

const studyPlan = [
  { discipline: "Matemática", activity: "Funções quadráticas", status: "Em andamento" },
  { discipline: "Português", activity: "Interpretação de texto", status: "Concluído" },
  { discipline: "Biologia", activity: "Ecologia e biomas", status: "Revisar" },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Bora Estudar — início">
          <BrandMark />
          <span>Bora Estudar</span>
        </a>
        <AppearanceControls />
      </header>

      <main className={styles.main} id="inicio">
        <section className={`${styles.hero} be-enter`}>
          <div className={styles.heroCopy}>
            <span className="be-badge be-badge--info">Plano da semana</span>
            <h1>Estudar fica mais claro quando o próximo passo está à vista.</h1>
            <p>
              Organize atividades, acompanhe seu ritmo e mantenha cada disciplina
              avançando no tempo certo.
            </p>
            <div className={styles.actions}>
              <button className="be-button be-button--primary" type="button">
                Começar sessão
              </button>
              <button className="be-button" type="button">
                Ver cronograma
              </button>
            </div>
          </div>

          <article className={`${styles.summaryCard} be-card`}>
            <span className="be-section-label">Progresso semanal</span>
            <strong className="be-metric-value">82%</strong>
            <div className="be-progress" aria-label="82% do plano semanal concluído">
              <span style={{ width: "82%" }} />
            </div>
            <p className={styles.summaryText}>
              <span className="be-badge be-badge--success">+12%</span>
              acima da semana passada
            </p>
          </article>
        </section>

        <section className={styles.grid} aria-label="Visão geral dos estudos">
          <article className={`${styles.metricCard} be-card`}>
            <span className="be-section-label">Tempo focado</span>
            <strong className="be-metric-value">08h 40m</strong>
            <span className={styles.muted}>meta de 10 horas</span>
          </article>

          <article className={`${styles.metricCard} be-card`}>
            <span className="be-section-label">Atividades</span>
            <strong className="be-metric-value">14/18</strong>
            <span className="be-badge be-badge--warning">4 pendentes</span>
          </article>

          <article className={`${styles.formCard} be-card`}>
            <div>
              <span className="be-section-label">Nova atividade</span>
              <h2>O que você vai estudar?</h2>
            </div>
            <div>
              <label className="be-label" htmlFor="atividade">
                Atividade
              </label>
              <input
                className="be-input"
                id="atividade"
                name="atividade"
                placeholder="Ex.: revisar ligações químicas"
              />
            </div>
            <button className="be-button be-button--primary" type="button">
              Adicionar ao plano
            </button>
          </article>
        </section>

        <section className={styles.planSection} aria-labelledby="plano-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className="be-section-label">Hoje</span>
              <h2 id="plano-title">Plano de estudos</h2>
            </div>
            <span className="be-mono">3 atividades</span>
          </div>

          <div className="be-table-wrap">
            <table className="be-table">
              <thead>
                <tr>
                  <th>Disciplina</th>
                  <th>Atividade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {studyPlan.map((item) => (
                  <tr key={item.discipline}>
                    <td>{item.discipline}</td>
                    <td>{item.activity}</td>
                    <td>
                      <span
                        className={`be-badge ${
                          item.status === "Concluído"
                            ? "be-badge--success"
                            : item.status === "Revisar"
                              ? "be-badge--warning"
                              : "be-badge--info"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
