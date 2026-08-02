"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows, fetchAllRowsInBatches } from "@/lib/supabase/pagination";

import {
  InlineLoadingIndicator,
  LoadingSkeleton,
  type SkeletonVariant,
} from "@/components/states/LoadingSkeleton";

import styles from "../ProfessorDomainPage.module.css";

export type Profile = {
  ativo: boolean;
  fuso_horario: string;
  id: string;
  nome: string;
  telefone: string | null;
  tipo: "admin" | "professor" | "aluno";
  updated_at: string;
};

export type StudentLink = {
  aluno_id: string;
  id: string;
  inicio_em: string;
  updated_at: string;
};

export type AccessStatus = "pendente" | "ativo" | "bloqueado" | "expirado" | "cancelado";

export type StudentAccess = {
  aluno_id: string;
  bloqueado_em: string | null;
  expira_em: string | null;
  id: string;
  inicio_em: string | null;
  motivo_bloqueio: string | null;
  plano: string;
  status: AccessStatus;
  status_efetivo?: AccessStatus;
  updated_at: string;
};

export type PlanningStatus = "ativo" | "pausado" | "arquivado";
export type StudyModel = "teoria_blocos" | "somente_blocos";
export type CoursePhase = "pre_edital" | "pos_edital";

export type Planning = {
  aluno_id: string;
  created_at: string;
  curso_codigo_snapshot: string;
  curso_id: string;
  curso_nome_snapshot: string;
  data_inicio: string;
  fase: CoursePhase;
  id: string;
  metas_semanais: number;
  modelo_estudo: StudyModel;
  nome: string;
  professor_id: string;
  status: PlanningStatus;
  updated_at: string;
};

export type Course = {
  area: string | null;
  codigo: string;
  concurso_alvo: string | null;
  fase: CoursePhase;
  id: string;
  metas_semanais_padrao: number;
  modelo_estudo: StudyModel;
  nome: string;
};

export type DisciplineMode = "blocos" | "teoria" | "ambos";

export type PlanningDiscipline = {
  ativo: boolean;
  disciplina_codigo_snapshot: string;
  disciplina_cor_snapshot: string | null;
  disciplina_nome_snapshot: string;
  id: string;
  maximo_metas: number;
  meta_percentual: number;
  minimo_metas: number;
  modalidade: DisciplineMode;
  ordem: number;
  peso: number;
  planejamento_id: string;
};

export type PlanningNotebook = {
  ativo: boolean;
  caderno_catalogo_id: string | null;
  deleted_at?: string | null;
  id: string;
  link_tec: string | null;
  nome: string;
  ordem: number;
  planejamento_disciplina_id: string;
  total_questoes: number;
};

export type LessonMaterial = {
  id?: string;
  nome?: string;
  ordem?: number;
  tipo?: "pdf" | "video" | "link" | "outro";
  url?: string | null;
};

export type PlanningLesson = {
  ativo: boolean;
  id: string;
  link_tec: string | null;
  materiais_snapshot: LessonMaterial[];
  nome: string;
  ordem: number;
  planejamento_disciplina_id: string;
  total_questoes: number;
};

export type GoalStatus = "pendente" | "em_andamento" | "concluida" | "pulada" | "cancelada";
export type GoalType = "bloco" | "teoria" | "reforco" | "extra";

export type Goal = {
  acertos: number;
  atividade_extra: string | null;
  concluida_em: string | null;
  descricao: string | null;
  dia_semana: number;
  id: string;
  ordem_dia: number;
  origem_meta_id: string | null;
  planejamento_caderno_id: string | null;
  planejamento_disciplina_id: string | null;
  planejamento_id: string;
  questoes_feitas: number;
  reforco_ignorado_em: string | null;
  semana_numero: number;
  status: GoalStatus;
  tempo_previsto_minutos: number;
  tipo: GoalType;
  titulo: string;
};

export type WaitlistStatus = "aguardando" | "contatado" | "convertido" | "cancelado";

export type WaitlistEntry = {
  aluno_id: string;
  area_interesse: string;
  concurso_foco: string;
  created_at: string;
  id: string;
  professor_id: string | null;
  status: WaitlistStatus;
  updated_at: string;
  whatsapp: string;
};

export type ReviewConfiguration = {
  ativo: boolean;
  id: string;
  planejamento_disciplina_id: string;
  primeira_revisao_intervalo: number;
  segunda_revisao_intervalo: number;
};

export type Review = {
  concluida_em: string | null;
  etapa: "primeira" | "segunda";
  id: string;
  planejamento_aula_origem_id: string;
  planejamento_aula_revisada_id: string;
  prevista_em: string | null;
  status: "pendente" | "concluida" | "cancelada";
};

export type StudentDirectoryEntry = {
  access: StudentAccess | null;
  link: StudentLink;
  planning: Planning | null;
  profile: Profile;
};

export type ResourceState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
};

export const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function errorProperties(error: unknown) {
  if (!error || typeof error !== "object") return { code: "", message: "" };
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
  };
}

export function errorMessage(error: unknown) {
  const { code, message } = errorProperties(error);
  const normalized = message.toLocaleLowerCase("pt-BR");

  if (error instanceof Error && error.name === "RequiredMigrationError") return error.message;
  if (code === "42501" || normalized.includes("sem permissão") || normalized.includes("não autenticado")) {
    return "Permissão negada. O vínculo ou a sua sessão pode ter mudado; atualize a página e tente novamente.";
  }
  if (code === "23505" || normalized.includes("duplicate") || normalized.includes("único")) {
    return "Conflito: já existe um registro com esses dados.";
  }
  if (code === "23514" || code === "22P02" || normalized.includes("inválid") || normalized.includes("obrigat")) {
    return message ? `Validação: ${message}` : "Validação: confira os campos informados.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("conex")) {
    return "Falha de conexão com o Supabase. Verifique sua rede e tente novamente.";
  }
  if (message) return `O Supabase não concluiu a operação: ${message}`;
  return "Ocorreu uma falha interna ao processar a operação.";
}

export class RequiredMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequiredMigrationError";
  }
}

export async function callRpc<T>(
  name: string,
  parameters: Record<string, unknown>,
  missingMigrationMessage?: string,
): Promise<T> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, parameters);
  if (error) {
    const { code, message } = errorProperties(error);
    if (
      missingMigrationMessage
      && (code === "PGRST202" || message.toLowerCase().includes("could not find the function"))
    ) {
      throw new RequiredMigrationError(missingMigrationMessage);
    }
    throw error;
  }
  return data as T;
}

export function useResource<T>(loader: () => Promise<T>) {
  const requestId = useRef(0);
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    error: "",
    loading: true,
    refreshing: false,
  });

  const load = useCallback(async (preserveData: boolean) => {
    const currentRequest = ++requestId.current;
    setState((current) => {
      const canPreserve = preserveData && current.data !== null;
      return {
        data: canPreserve ? current.data : null,
        error: "",
        loading: !canPreserve,
        refreshing: canPreserve,
      };
    });

    try {
      const data = await loader();
      if (currentRequest === requestId.current) {
        setState({ data, error: "", loading: false, refreshing: false });
      }
    } catch (reason) {
      if (currentRequest === requestId.current) {
        setState((current) => ({
          data: preserveData ? current.data : null,
          error: errorMessage(reason),
          loading: false,
          refreshing: false,
        }));
      }
    }
  }, [loader]);

  useEffect(() => {
    // A mudança do contexto (por exemplo, a semana) não deve exibir dados antigos.
    void load(false);
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  return { ...state, reload };
}

export function useMutationFeedback() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function run(key: string, action: () => Promise<unknown>, successMessage: string) {
    setPending(key);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(successMessage);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setPending(null);
    }
  }

  return { error, pending, run, setError, success };
}

export function Feedback({ error, success }: { error: string; success: string }) {
  return (
    <div className={styles.feedback} aria-live="polite">
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {success ? <p className={styles.success} role="status">{success}</p> : null}
    </div>
  );
}

export function StatePanel({
  action,
  description,
  kind = "empty",
  title,
}: {
  action?: ReactNode;
  description: string;
  kind?: "empty" | "error" | "loading";
  title: string;
}) {
  return (
    <section className={`be-card ${styles.state}`} data-kind={kind} aria-live={kind === "loading" ? "polite" : undefined}>
      <span className={styles.stateSymbol} aria-hidden="true">{kind === "loading" ? "…" : kind === "error" ? "!" : "○"}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action}
      </div>
    </section>
  );
}

export function ResourceGate<T>({
  children,
  empty,
  isEmpty,
  resource,
  skeleton = "list",
}: {
  children: (data: T) => ReactNode;
  empty?: { description: string; title: string; action?: ReactNode };
  isEmpty?: (data: T) => boolean;
  resource: ReturnType<typeof useResource<T>>;
  skeleton?: SkeletonVariant;
}) {
  if (resource.loading) return <LoadingSkeleton label="Carregando dados" variant={skeleton} />;
  if (resource.error && resource.data === null) {
    return (
      <StatePanel
        kind="error"
        title="Não foi possível carregar"
        description={resource.error}
        action={<button className="be-button" type="button" onClick={resource.reload}>Tentar novamente</button>}
      />
    );
  }
  if (resource.data === null) return <StatePanel kind="empty" title="Registro não encontrado" description="O recurso não existe ou não está disponível para o seu vínculo atual." />;
  return (
    <>
      {resource.refreshing ? <InlineLoadingIndicator /> : null}
      {resource.error ? <Feedback error={`Não foi possível atualizar os dados. ${resource.error}`} success="" /> : null}
      {empty && isEmpty?.(resource.data)
        ? <StatePanel title={empty.title} description={empty.description} action={empty.action} />
        : children(resource.data)}
    </>
  );
}

export function formText(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

export function formNumber(data: FormData, name: string) {
  return Number(formText(data, name));
}

export function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Não informado";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("pt-BR", includeTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

export function labelize(value: string) {
  return value.replaceAll("_", " ");
}

export function badgeClass(status: string) {
  const success = ["ativo", "concluida", "convertido"].includes(status);
  const warning = ["pendente", "em_andamento", "pausado", "aguardando", "contatado", "expirado"].includes(status);
  const danger = ["bloqueado", "cancelado", "cancelada"].includes(status);
  return `be-badge ${success ? "be-badge--success" : warning ? "be-badge--warning" : danger ? "be-badge--danger" : "be-badge--neutral"}`;
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sortNewestAccess(rows: StudentAccess[]) {
  return [...rows].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function loadStudentDirectory(): Promise<StudentDirectoryEntry[]> {
  const supabase = getSupabaseBrowserClient();
  const links = await fetchAllRows<StudentLink>((from, to) => supabase
    .from("professor_alunos")
    .select("id, aluno_id, inicio_em, updated_at")
    .eq("status", "ativo")
    .order("inicio_em", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to));
  const studentIds = [...new Set(links.map((item) => item.aluno_id))];
  if (!studentIds.length) return [];

  const [profileRows, accessRows, planningRows] = await Promise.all([
    fetchAllRowsInBatches<Profile, string>(studentIds, (ids, from, to) => supabase
      .from("profiles")
      .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
      .in("id", ids)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRowsInBatches<StudentAccess, string>(studentIds, (ids, from, to) => supabase
      .from("acessos_aluno_efetivos")
      .select("id, aluno_id, status, status_efetivo, plano, inicio_em, expira_em, bloqueado_em, motivo_bloqueio, updated_at")
      .in("aluno_id", ids)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRowsInBatches<Planning, string>(studentIds, (ids, from, to) => supabase
      .from("planejamentos")
      .select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at")
      .in("aluno_id", ids)
      .eq("status", "ativo")
      .order("id", { ascending: true })
      .range(from, to)),
  ]);

  const profiles = new Map(profileRows.map((item) => [item.id, item]));
  const accesses = sortNewestAccess(accessRows);
  const plannings = planningRows;

  return links.flatMap((link) => {
    const profile = profiles.get(link.aluno_id);
    if (!profile) return [];
    return [{
      access: accesses.find((item) => item.aluno_id === link.aluno_id) ?? null,
      link,
      planning: plannings.find((item) => item.aluno_id === link.aluno_id) ?? null,
      profile,
    }];
  });
}

export async function loadStudent(studentId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("profiles")
    .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function loadPlanning(studentId: string, planningId: string): Promise<Planning | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("planejamentos")
    .select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at")
    .eq("id", planningId)
    .eq("aluno_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data as Planning | null;
}

export function SectionTitle({ description, title }: { description?: string; title: string }) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`be-card ${styles.metric}`}>
      <span className="be-section-label">{label}</span>
      <strong className="be-metric-value">{value}</strong>
    </div>
  );
}

