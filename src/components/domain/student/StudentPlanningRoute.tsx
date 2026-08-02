"use client";

import { currentPlanningWeek, statusLabel } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import {
  Panel,
  StatusBadge,
  Feedback,
  Empty,
  useStudentDomain,
} from "./shared";
import styles from "../StudentDomainPage.module.css";

export function StudentFeatureRoutes({ route }: { route: ResolvedRoute }) {
  const { studentDate, studentTimeZone, workspace } = useStudentDomain();

function planningContent() {
    const planning = workspace.planning;
    if (!planning) return <Empty title="Nenhum planejamento ativo">Seu histórico é preservado, mas apenas o planejamento ativo aparece para execução.</Empty>;
    return <div className={styles.stack}>
      <Panel><div className={styles.detailHeader}><div><span className="be-section-label">{planning.curso_codigo_snapshot}</span><h2>{planning.nome}</h2><p>{planning.curso_nome_snapshot}</p></div><StatusBadge status={planning.status} /></div><dl className={styles.details}><div><dt>Início</dt><dd>{studentDate(planning.data_inicio)}</dd></div><div><dt>Modelo</dt><dd>{statusLabel(planning.modelo_estudo)}</dd></div><div><dt>Fase</dt><dd>{statusLabel(planning.fase)}</dd></div><div><dt>Metas por semana</dt><dd>{planning.metas_semanais}</dd></div><div><dt>Disciplinas</dt><dd>{workspace.disciplines.length}</dd></div><div><dt>Semana atual</dt><dd>{currentPlanningWeek(planning.data_inicio, studentTimeZone)}</dd></div></dl></Panel>
      <Feedback tone="info" message="Esta configuração é uma fotografia do catálogo no momento da criação. Alterações futuras no catálogo não modificam seu histórico." />
    </div>;
  }

  switch (route.pattern) {
    case "planejamento":
      return planningContent();
    default:
      return <Empty title="Tela ainda indisponível">Esta área não pertence a este módulo funcional.</Empty>;
  }
}
