"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

import { statusLabel, statusTone } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";

import { ButtonSpinner, type SkeletonVariant } from "@/components/states/LoadingSkeleton";

import styles from "../StudentDomainPage.module.css";

export type Profile = {
  id: string;
  nome: string;
  telefone: string | null;
  fuso_horario: string;
  ativo: boolean;
};

export type AcademicAccess = {
  id: string;
  status: string;
  status_efetivo?: string;
  plano: string;
  inicio_em: string | null;
  expira_em: string | null;
  bloqueado_em: string | null;
  motivo_bloqueio: string | null;
};

export type Planning = {
  id: string;
  nome: string;
  curso_codigo_snapshot: string;
  curso_nome_snapshot: string;
  fase: string;
  modelo_estudo: string;
  metas_semanais: number;
  data_inicio: string;
  status: string;
};

export type PlanningDiscipline = {
  id: string;
  disciplina_codigo_snapshot: string;
  disciplina_nome_snapshot: string;
  disciplina_cor_snapshot: string | null;
  modalidade: string;
  meta_percentual: number;
  peso: number;
  minimo_metas: number;
  maximo_metas: number;
  ordem: number;
  ativo: boolean;
};

export type PlanningNotebook = {
  id: string;
  planejamento_disciplina_id: string;
  nome: string;
  link_tec: string | null;
  total_questoes: number;
  ordem: number;
  ativo: boolean;
};

export type LessonMaterial = { id?: string; tipo: string; nome: string; url?: string | null; ordem?: number };

export type PlanningLesson = {
  id: string;
  planejamento_disciplina_id: string;
  nome: string;
  ordem: number;
  link_tec: string | null;
  total_questoes: number;
  materiais_snapshot: LessonMaterial[] | unknown;
  ativo: boolean;
};

export type Goal = {
  id: string;
  planejamento_id: string;
  planejamento_disciplina_id: string | null;
  planejamento_caderno_id: string | null;
  origem_meta_id: string | null;
  tipo: string;
  titulo: string;
  descricao: string | null;
  atividade_extra: string | null;
  semana_numero: number;
  dia_semana: number;
  ordem_dia: number;
  tempo_previsto_minutos: number;
  tempo_gasto_minutos: number | null;
  questoes_feitas: number;
  acertos: number;
  observacao_conclusao: string | null;
  status: string;
  concluida_em: string | null;
  reforco_ignorado_em: string | null;
};

export type LessonProgress = {
  id: string;
  planejamento_aula_id: string;
  teoria_concluida_em: string | null;
  caderno_concluido_em: string | null;
};

export type Review = {
  id: string;
  planejamento_aula_origem_id: string;
  planejamento_aula_revisada_id: string;
  etapa: string;
  status: string;
  prevista_em: string | null;
  concluida_em: string | null;
};

export type WaitlistEntry = {
  id: string;
  professor_id: string | null;
  whatsapp: string;
  area_interesse: string;
  concurso_foco: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type StudentWorkspace = {
  userId: string;
  email: string;
  profile: Profile | null;
  access: AcademicAccess | null;
  planning: Planning | null;
  disciplines: PlanningDiscipline[];
  notebooks: PlanningNotebook[];
  lessons: PlanningLesson[];
  goals: Goal[];
  lessonProgress: LessonProgress[];
  reviews: Review[];
  waitlist: WaitlistEntry | null;
};

export const emptyWorkspace: StudentWorkspace = {
  userId: "",
  email: "",
  profile: null,
  access: null,
  planning: null,
  disciplines: [],
  notebooks: [],
  lessons: [],
  goals: [],
  lessonProgress: [],
  reviews: [],
  waitlist: null,
};

export const DISCIPLINE_COLUMNS = "id,disciplina_codigo_snapshot,disciplina_nome_snapshot,disciplina_cor_snapshot,modalidade,meta_percentual,peso,minimo_metas,maximo_metas,ordem,ativo";
export const GOAL_COLUMNS = "id,planejamento_id,planejamento_disciplina_id,planejamento_caderno_id,origem_meta_id,tipo,titulo,descricao,atividade_extra,semana_numero,dia_semana,ordem_dia,tempo_previsto_minutos,tempo_gasto_minutos,questoes_feitas,acertos,observacao_conclusao,status,concluida_em,reforco_ignorado_em";
export const LESSON_COLUMNS = "id,planejamento_disciplina_id,nome,ordem,link_tec,total_questoes,materiais_snapshot,ativo";
export const NOTEBOOK_COLUMNS = "id,planejamento_disciplina_id,nome,link_tec,total_questoes,ordem,ativo";

export function skeletonVariantForRoute(route: ResolvedRoute): SkeletonVariant {
  if (route.pattern === "inicio") return "dashboard";
  if (["perfil", "lista-de-espera"].includes(route.pattern)) return "form";
  if (route.pattern.includes(":") || ["acesso", "planejamento"].includes(route.pattern)) return "detail";
  return "list";
}

export type GoalLoadMode = "dashboard" | "detail" | "none" | "reinforcements" | "week";

export function resourcesForRoute(pattern: string) {
  const academic = !["acesso", "lista-de-espera", "perfil"].includes(pattern);
  const disciplines = [
    "inicio", "metas", "metas/:metaId", "disciplinas", "disciplinas/:disciplinaId",
    "aulas", "aulas/:aulaId", "planejamento", "reforcos", "revisoes",
  ].includes(pattern);

  let goals: GoalLoadMode = "none";
  if (pattern === "inicio") goals = "dashboard";
  else if (pattern === "metas") goals = "week";
  else if (pattern === "metas/:metaId") goals = "detail";
  else if (pattern === "reforcos") goals = "reinforcements";

  return {
    access: pattern === "acesso",
    disciplines,
    goals,
    lessonProgress: ["aulas", "aulas/:aulaId"].includes(pattern),
    lessons: ["disciplinas", "disciplinas/:disciplinaId", "aulas", "aulas/:aulaId", "revisoes"].includes(pattern),
    notebooks: ["metas/:metaId", "disciplinas", "disciplinas/:disciplinaId"].includes(pattern),
    planning: academic,
    reviews: pattern === "inicio" || pattern === "revisoes",
    waitlist: pattern === "lista-de-espera",
  };
}

export function Panel({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <section className={`be-card ${styles.panel}`}>
      {title || subtitle ? (
        <header className={styles.panelHeader}>
          {title ? <h2>{title}</h2> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <span className={`be-badge be-badge--${statusTone(status)}`}>{statusLabel(status)}</span>;
}

export function Feedback({ message, tone = "info" }: { message: string; tone?: "danger" | "info" | "success" | "warning" }) {
  return <div className={styles.feedback} data-tone={tone} role={tone === "danger" ? "alert" : "status"}>{message}</div>;
}

export function Empty({ children, title }: { children: ReactNode; title: string }) {
  return <div className={styles.empty}><span aria-hidden="true">○</span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="be-button be-button--primary" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? <><ButtonSpinner />Salvando…</> : children}
    </button>
  );
}

export function getMaterials(value: unknown): LessonMaterial[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LessonMaterial => Boolean(item && typeof item === "object" && "nome" in item && "tipo" in item));
}

export function GoalCompletionForm({
  busy,
  goal,
  onComplete,
}: {
  busy: boolean;
  goal: Goal;
  onComplete: (parameters: Record<string, unknown>) => Promise<boolean>;
}) {
  const minimumQuestions = goal.tipo === "teoria" ? 0 : 1;
  const [questions, setQuestions] = useState(minimumQuestions);
  const [hits, setHits] = useState(0);

  return (
    <form className={styles.formGrid} onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onComplete({
        p_meta_id: goal.id,
        p_tempo_minutos: Number(data.get("tempo")),
        p_questoes: questions,
        p_acertos: hits,
        p_observacao: String(data.get("observacao") ?? "") || null,
      });
    }}>
      <label><span className="be-label">Tempo realizado (min)</span><input className="be-input" name="tempo" type="number" min="1" max="1440" defaultValue={goal.tempo_previsto_minutos} required /></label>
      <label><span className="be-label">Questões realizadas</span><input className="be-input" name="questoes" type="number" min={minimumQuestions} value={questions} onChange={(event) => { const next = Math.max(minimumQuestions, Number(event.target.value)); setQuestions(next); setHits((current) => Math.min(current, next)); }} required /></label>
      <label><span className="be-label">Acertos</span><input className="be-input" name="acertos" type="number" min="0" max={questions} value={hits} onChange={(event) => setHits(Math.min(questions, Math.max(0, Number(event.target.value))))} required /></label>
      <label className={styles.spanTwo}><span className="be-label">Observação</span><textarea className="be-input" name="observacao" rows={3} /></label>
      <div className={styles.formActions}><SubmitButton busy={busy}>Concluir meta</SubmitButton></div>
    </form>
  );
}


export type StudentDomainContextValue = {
  busy: boolean;
  disciplineById: Map<string, PlanningDiscipline>;
  lessonById: Map<string, PlanningLesson>;
  notebookById: Map<string, PlanningNotebook>;
  progressByLesson: Map<string, LessonProgress>;
  runRpc: (name: string, parameters: Record<string, unknown>, successMessage: string) => Promise<boolean>;
  selectedWeek: number;
  setWeek: (week: number) => void;
  studentDate: (value: string | null | undefined, includeTime?: boolean) => string;
  studentTimeZone: string;
  workspace: StudentWorkspace;
};

const StudentDomainContext = createContext<StudentDomainContextValue | null>(null);

export function StudentDomainProvider({ children, value }: { children: ReactNode; value: StudentDomainContextValue }) {
  return <StudentDomainContext value={value}>{children}</StudentDomainContext>;
}

export function useStudentDomain() {
  const context = useContext(StudentDomainContext);
  if (!context) throw new Error("O contexto do domínio do aluno não foi inicializado.");
  return context;
}
