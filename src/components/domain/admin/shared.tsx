"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows } from "@/lib/supabase/pagination";

import {
  ButtonSpinner,
  InlineLoadingIndicator,
  LoadingSkeleton,
  type SkeletonVariant,
} from "@/components/states/LoadingSkeleton";

import styles from "../AdminDomainPage.module.css";

export type ProfileKind = "admin" | "professor" | "aluno";
export type AccessStatus = "pendente" | "ativo" | "bloqueado" | "expirado" | "cancelado";
export type LinkStatus = "ativo" | "encerrado";
export type WaitlistStatus = "aguardando" | "contatado" | "convertido" | "cancelado";
export type CoursePhase = "pre_edital" | "pos_edital";
export type StudyModel = "teoria_blocos" | "somente_blocos";
export type SubjectMode = "blocos" | "teoria" | "ambos";
export type MaterialKind = "pdf" | "video" | "link" | "outro";

export type Profile = {
  id: string;
  nome: string;
  tipo: ProfileKind;
  telefone: string | null;
  fuso_horario: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TeacherStudentLink = {
  id: string;
  professor_id: string;
  aluno_id: string;
  status: LinkStatus;
  inicio_em: string;
  fim_em: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentAccess = {
  id: string;
  aluno_id: string;
  status: AccessStatus;
  status_efetivo: AccessStatus;
  plano: string;
  inicio_em: string | null;
  expira_em: string | null;
  bloqueado_em: string | null;
  motivo_bloqueio: string | null;
  liberado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  codigo: string;
  nome: string;
  area: string | null;
  concurso_alvo: string | null;
  fase: CoursePhase;
  modelo_estudo: StudyModel;
  metas_semanais_padrao: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Subject = {
  id: string;
  codigo: string;
  nome: string;
  cor: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CourseSubject = {
  id: string;
  curso_id: string;
  disciplina_id: string;
  modalidade: SubjectMode;
  meta_padrao: number;
  peso_padrao: number;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CatalogNotebook = {
  id: string;
  curso_disciplina_id: string;
  nome: string;
  link_tec: string | null;
  total_questoes: number;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CatalogLesson = {
  id: string;
  curso_disciplina_id: string;
  nome: string;
  ordem: number;
  link_tec: string | null;
  total_questoes: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LessonMaterial = {
  id: string;
  aula_id: string;
  tipo: MaterialKind;
  nome: string;
  url: string | null;
  ordem: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WaitlistEntry = {
  id: string;
  aluno_id: string;
  professor_id: string | null;
  whatsapp: string;
  area_interesse: string;
  concurso_foco: string;
  status: WaitlistStatus;
  created_at: string;
  updated_at: string;
};

export type AuditEvent = {
  id: string;
  operation_id: string;
  table_name: string;
  record_id: string;
  action: "insert" | "update" | "soft_delete" | "restore";
  actor_id: string | null;
  reason: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
};

export type BackendError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

export type RemoteData<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
};

export type FeedbackState = { kind: "error" | "success"; text: string } | null;

export const PROFILE_COLUMNS = "id,nome,tipo,telefone,fuso_horario,ativo,created_at,updated_at,deleted_at";
export const COURSE_COLUMNS = "id,codigo,nome,area,concurso_alvo,fase,modelo_estudo,metas_semanais_padrao,ativo,created_at,updated_at,deleted_at";
export const SUBJECT_COLUMNS = "id,codigo,nome,cor,ativo,created_at,updated_at,deleted_at";

export function backendMessage(reason: unknown) {
  const error = reason as Partial<BackendError> | null;
  const raw = error?.message?.trim() || "Falha interna ao processar a operação.";
  const code = error?.code ?? "";
  const normalized = raw.toLocaleLowerCase("pt-BR");

  if (code === "42501" || normalized.includes("permiss") || normalized.includes("autoriz")) {
    return "Você não tem permissão para executar esta operação. Atualize a sessão e confirme seu perfil.";
  }
  if (code === "23505" || normalized.includes("duplicate") || normalized.includes("unique")) {
    return "Já existe um registro com esses dados. Revise os campos únicos e tente novamente.";
  }
  if (code.startsWith("23") || normalized.includes("inválid") || normalized.includes("obrigat")) {
    return raw;
  }
  if (normalized.includes("fetch") || normalized.includes("network") || normalized.includes("conex")) {
    return "Não foi possível conectar ao Supabase. Verifique sua conexão e tente novamente.";
  }
  return raw;
}

export function expectRows<T>(data: unknown, error: BackendError | null): T[] {
  if (error) throw error;
  if (data === null) return [];
  if (!Array.isArray(data)) throw new Error("O Supabase retornou dados em um formato inesperado.");
  return data as T[];
}

export function expectRecord<T>(data: unknown, error: BackendError | null): T | null {
  if (error) throw error;
  if (data === null) return null;
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("O Supabase retornou dados em um formato inesperado.");
  }
  return data as T;
}

export async function callRpc(name: string, args: Record<string, unknown>) {
  const { error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
}

export async function loadProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  return fetchAllRows<Profile>((from, to) => supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("nome", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
}

export async function loadLinks(): Promise<TeacherStudentLink[]> {
  const supabase = getSupabaseBrowserClient();
  return fetchAllRows<TeacherStudentLink>((from, to) => supabase
    .from("professor_alunos")
    .select("id,professor_id,aluno_id,status,inicio_em,fim_em,created_at,updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to));
}

export async function loadAccesses(): Promise<StudentAccess[]> {
  const supabase = getSupabaseBrowserClient();
  return fetchAllRows<StudentAccess>((from, to) => supabase
    .from("acessos_aluno_efetivos")
    .select("id,aluno_id,status,status_efetivo,plano,inicio_em,expira_em,bloqueado_em,motivo_bloqueio,liberado_por,created_at,updated_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to));
}

export async function loadCourses(): Promise<Course[]> {
  const supabase = getSupabaseBrowserClient();
  return fetchAllRows<Course>((from, to) => supabase
    .from("cursos")
    .select(COURSE_COLUMNS)
    .order("nome", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
}

export async function loadSubjects(): Promise<Subject[]> {
  const supabase = getSupabaseBrowserClient();
  return fetchAllRows<Subject>((from, to) => supabase
    .from("disciplinas")
    .select(SUBJECT_COLUMNS)
    .order("nome", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
}

export async function loadCourseSubjects(courseId: string): Promise<CourseSubject[]> {
  const supabase = getSupabaseBrowserClient();
  return fetchAllRows<CourseSubject>((from, to) => supabase
    .from("curso_disciplinas")
    .select("id,curso_id,disciplina_id,modalidade,meta_padrao,peso_padrao,ordem,ativo,created_at,updated_at,deleted_at")
    .eq("curso_id", courseId)
    .order("ordem", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
}

export function useRemoteData<T>(loader: () => Promise<T>): RemoteData<T> {
  const requestId = useRef(0);
  const [state, setState] = useState<Omit<RemoteData<T>, "reload">>({
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
          error: backendMessage(reason),
          loading: false,
          refreshing: false,
        }));
      }
    }
  }, [loader]);

  useEffect(() => {
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

export function useRpcAction(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ kind: "success", text: success });
      onDone?.();
      return true;
    } catch (reason) {
      setFeedback({ kind: "error", text: backendMessage(reason) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, feedback, run, setFeedback };
}

export function asText(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export function asNumber(form: FormData, name: string) {
  return Number(asText(form, name));
}

export function optionalText(form: FormData, name: string) {
  const value = asText(form, name);
  return value || null;
}

export function labelFor(value: string) {
  const labels: Record<string, string> = {
    admin: "Administrador",
    professor: "Professor",
    aluno: "Aluno",
    ativo: "Ativo",
    inativo: "Inativo",
    pendente: "Pendente",
    bloqueado: "Bloqueado",
    expirado: "Expirado",
    cancelado: "Cancelado",
    encerrado: "Encerrado",
    aguardando: "Aguardando",
    contatado: "Contatado",
    convertido: "Convertido",
    pre_edital: "Pré-edital",
    pos_edital: "Pós-edital",
    teoria_blocos: "Teoria e blocos",
    somente_blocos: "Somente blocos",
    blocos: "Blocos",
    teoria: "Teoria",
    ambos: "Ambos",
    insert: "Criação",
    update: "Atualização",
    soft_delete: "Exclusão lógica",
    restore: "Restauração",
    pdf: "PDF",
    video: "Vídeo",
    link: "Link",
    outro: "Outro",
    excluido: "Excluído",
    resumo: "Resumo",
    disciplinas: "Disciplinas",
    cadernos: "Cadernos",
    aulas: "Aulas",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

export function dateTimeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function Status({ value }: { value: string }) {
  const tone = ["ativo", "convertido", "restore"].includes(value)
    ? "success"
    : ["bloqueado", "cancelado", "soft_delete", "excluido"].includes(value)
      ? "danger"
      : ["pendente", "aguardando", "expirado"].includes(value)
        ? "warning"
        : "neutral";
  return <span className={styles.status} data-tone={tone}>{labelFor(value)}</span>;
}

export function Feedback({ state }: { state: FeedbackState }) {
  if (!state) return null;
  return (
    <div className={styles.feedback} data-kind={state.kind} role={state.kind === "error" ? "alert" : "status"}>
      {state.text}
    </div>
  );
}

export function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className={styles.state} data-kind="error" role="alert">
      <div><strong>Não foi possível carregar esta tela.</strong><p>{message}</p></div>
      <button className="be-button" type="button" onClick={retry}>Tentar novamente</button>
    </div>
  );
}

export function EmptyPanel({ children, title }: { children: ReactNode; title: string }) {
  return <div className={styles.empty}><strong>{title}</strong><p>{children}</p></div>;
}

export function RemoteContent<T>({
  children,
  remote,
  skeleton = "list",
}: {
  children: (data: T) => ReactNode;
  remote: RemoteData<T>;
  skeleton?: SkeletonVariant;
}) {
  if (remote.loading) return <LoadingSkeleton label="Carregando dados" variant={skeleton} />;
  if (remote.error && remote.data === null) return <ErrorPanel message={remote.error} retry={remote.reload} />;
  if (remote.data === null) return <ErrorPanel message="O servidor não retornou dados para esta tela." retry={remote.reload} />;
  return (
    <>
      {remote.refreshing ? <InlineLoadingIndicator /> : null}
      {remote.error ? <Feedback state={{ kind: "error", text: `Não foi possível atualizar os dados. ${remote.error}` }} /> : null}
      {children(remote.data)}
    </>
  );
}

export function Section({ actions, children, description, title }: { actions?: ReactNode; children: ReactNode; description?: string; title: string }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

export function SubmitButton({
  busy,
  busyLabel = "Salvando…",
  children = "Salvar",
  disabled = false,
}: {
  busy: boolean;
  busyLabel?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className="be-button be-button--primary" type="submit" disabled={busy || disabled} aria-busy={busy}>
      {busy ? <><ButtonSpinner />{busyLabel}</> : children}
    </button>
  );
}

export function SoftDeleteControl({
  deleted,
  id,
  label,
  onDone,
  resource,
}: {
  deleted: boolean;
  id: string;
  label: string;
  onDone: () => void;
  resource: "curso" | "disciplina" | "curso_disciplina" | "caderno_catalogo" | "aula_catalogo" | "material_aula";
}) {
  const action = useRpcAction(onDone);

  async function handle() {
    const verb = deleted ? "restaurar" : "excluir";
    if (!deleted && !window.confirm(`Confirma a exclusão lógica de “${label}”? O histórico será preservado.`)) return;
    const reason = window.prompt(`Informe o motivo para ${verb} este registro:`)?.trim();
    if (!reason) {
      action.setFeedback({ kind: "error", text: "O motivo é obrigatório para esta operação auditável." });
      return;
    }
    await action.run(
      () => callRpc(`${deleted ? "restore" : "soft_delete"}_${resource}`, { p_id: id, p_reason: reason }),
      deleted ? "Registro restaurado e confirmado pelo Supabase." : "Registro excluído logicamente e mantido no histórico.",
    );
  }

  return (
    <div className={styles.inlineAction}>
      <button className={`be-button ${deleted ? "" : "be-button--danger"}`} type="button" disabled={action.busy} onClick={() => void handle()}>
        {action.busy ? "Processando…" : deleted ? "Restaurar" : "Excluir"}
      </button>
      <Feedback state={action.feedback} />
    </div>
  );
}

export function ProfileName({ id, profiles }: { id: string | null; profiles: Map<string, Profile> }) {
  if (!id) return <>Não atribuído</>;
  const profile = profiles.get(id);
  return <>{profile?.nome ?? id}</>;
}

export function profileMap(profiles: Profile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}
