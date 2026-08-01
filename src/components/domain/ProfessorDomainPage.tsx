"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { PhoneField } from "@/components/form/PhoneField";

import styles from "./ProfessorDomainPage.module.css";

type Profile = {
  ativo: boolean;
  fuso_horario: string;
  id: string;
  nome: string;
  telefone: string | null;
  tipo: "admin" | "professor" | "aluno";
  updated_at: string;
};

type StudentLink = {
  aluno_id: string;
  id: string;
  inicio_em: string;
  updated_at: string;
};

type AccessStatus = "pendente" | "ativo" | "bloqueado" | "expirado" | "cancelado";

type StudentAccess = {
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

type PlanningStatus = "ativo" | "pausado" | "arquivado";
type StudyModel = "teoria_blocos" | "somente_blocos";
type CoursePhase = "pre_edital" | "pos_edital";

type Planning = {
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

type Course = {
  area: string | null;
  codigo: string;
  concurso_alvo: string | null;
  fase: CoursePhase;
  id: string;
  metas_semanais_padrao: number;
  modelo_estudo: StudyModel;
  nome: string;
};

type DisciplineMode = "blocos" | "teoria" | "ambos";

type PlanningDiscipline = {
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

type PlanningNotebook = {
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

type LessonMaterial = {
  id?: string;
  nome?: string;
  ordem?: number;
  tipo?: "pdf" | "video" | "link" | "outro";
  url?: string | null;
};

type PlanningLesson = {
  ativo: boolean;
  id: string;
  link_tec: string | null;
  materiais_snapshot: LessonMaterial[];
  nome: string;
  ordem: number;
  planejamento_disciplina_id: string;
  total_questoes: number;
};

type GoalStatus = "pendente" | "em_andamento" | "concluida" | "pulada" | "cancelada";
type GoalType = "bloco" | "teoria" | "reforco" | "extra";

type Goal = {
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

type WaitlistStatus = "aguardando" | "contatado" | "convertido" | "cancelado";

type WaitlistEntry = {
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

type ReviewConfiguration = {
  ativo: boolean;
  id: string;
  planejamento_disciplina_id: string;
  primeira_revisao_intervalo: number;
  segunda_revisao_intervalo: number;
};

type Review = {
  concluida_em: string | null;
  etapa: "primeira" | "segunda";
  id: string;
  planejamento_aula_origem_id: string;
  planejamento_aula_revisada_id: string;
  prevista_em: string | null;
  status: "pendente" | "concluida" | "cancelada";
};

type StudentDirectoryEntry = {
  access: StudentAccess | null;
  link: StudentLink;
  planning: Planning | null;
  profile: Profile;
};

type ResourceState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
};

const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function errorProperties(error: unknown) {
  if (!error || typeof error !== "object") return { code: "", message: "" };
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
  };
}

function errorMessage(error: unknown) {
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

class RequiredMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequiredMigrationError";
  }
}

async function callRpc<T>(
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

function useResource<T>(loader: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: "", loading: true });

  useEffect(() => {
    let active = true;
    // A mudança do contexto (por exemplo, a semana) não deve exibir dados antigos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => ({ ...current, error: "", loading: true }));
    void loader().then(
      (data) => {
        if (active) setState({ data, error: "", loading: false });
      },
      (reason: unknown) => {
        if (active) setState({ data: null, error: errorMessage(reason), loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [loader, revision]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, error: "", loading: true }));
    setRevision((current) => current + 1);
  }, []);

  return { ...state, reload };
}

function useMutationFeedback() {
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

function Feedback({ error, success }: { error: string; success: string }) {
  return (
    <div className={styles.feedback} aria-live="polite">
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {success ? <p className={styles.success} role="status">{success}</p> : null}
    </div>
  );
}

function StatePanel({
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

function ResourceGate<T>({
  children,
  empty,
  isEmpty,
  resource,
}: {
  children: (data: T) => ReactNode;
  empty?: { description: string; title: string; action?: ReactNode };
  isEmpty?: (data: T) => boolean;
  resource: ReturnType<typeof useResource<T>>;
}) {
  if (resource.loading) return <StatePanel kind="loading" title="Carregando dados" description="Consultando o Supabase com as permissões da sua sessão." />;
  if (resource.error) {
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
  if (empty && isEmpty?.(resource.data)) return <StatePanel title={empty.title} description={empty.description} action={empty.action} />;
  return <>{children(resource.data)}</>;
}

function formText(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function formNumber(data: FormData, name: string) {
  return Number(formText(data, name));
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Não informado";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("pt-BR", includeTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function badgeClass(status: string) {
  const success = ["ativo", "concluida", "convertido"].includes(status);
  const warning = ["pendente", "em_andamento", "pausado", "aguardando", "contatado", "expirado"].includes(status);
  const danger = ["bloqueado", "cancelado", "cancelada"].includes(status);
  return `be-badge ${success ? "be-badge--success" : warning ? "be-badge--warning" : danger ? "be-badge--danger" : "be-badge--neutral"}`;
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sortNewestAccess(rows: StudentAccess[]) {
  return [...rows].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

async function loadStudentDirectory(): Promise<StudentDirectoryEntry[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: linksData, error: linksError } = await supabase
    .from("professor_alunos")
    .select("id, aluno_id, inicio_em, updated_at")
    .eq("status", "ativo")
    .order("inicio_em", { ascending: false });
  if (linksError) throw linksError;
  const links = asRows<StudentLink>(linksData);
  const studentIds = links.map((item) => item.aluno_id);
  if (!studentIds.length) return [];

  const [profilesResult, accessResult, planningResult] = await Promise.all([
    supabase.from("profiles").select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at").in("id", studentIds),
    supabase.from("acessos_aluno_efetivos").select("id, aluno_id, status, status_efetivo, plano, inicio_em, expira_em, bloqueado_em, motivo_bloqueio, updated_at").in("aluno_id", studentIds),
    supabase.from("planejamentos").select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at").in("aluno_id", studentIds).eq("status", "ativo"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (accessResult.error) throw accessResult.error;
  if (planningResult.error) throw planningResult.error;

  const profiles = new Map(asRows<Profile>(profilesResult.data).map((item) => [item.id, item]));
  const accesses = sortNewestAccess(asRows<StudentAccess>(accessResult.data));
  const plannings = asRows<Planning>(planningResult.data);

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

async function loadStudent(studentId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("profiles")
    .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

async function loadPlanning(studentId: string, planningId: string): Promise<Planning | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("planejamentos")
    .select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at")
    .eq("id", planningId)
    .eq("aluno_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data as Planning | null;
}

function SectionTitle({ description, title }: { description?: string; title: string }) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`be-card ${styles.metric}`}>
      <span className="be-section-label">{label}</span>
      <strong className="be-metric-value">{value}</strong>
    </div>
  );
}

function ProfessorProfilePage() {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? { email: userData.user.email ?? "", profile: data as Profile } : null;
  }, []);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run("profile", () => callRpc("atualizar_meu_perfil", {
      p_fuso_horario: formText(data, "timezone"),
      p_nome: formText(data, "name"),
      p_telefone: formText(data, "phone") || null,
    }), "Perfil atualizado com confirmação do Supabase.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate resource={resource}>
      {(record) => (
        <section className={`be-card ${styles.formCard}`}>
          <SectionTitle title="Dados do professor" description="Nome, telefone e fuso usados pela sua conta." />
          <form className={styles.form} onSubmit={save}>
            <label className={styles.field} htmlFor="professor-profile-name">
              <span>Nome</span>
              <input className="be-input" id="professor-profile-name" name="name" defaultValue={record.profile.nome} minLength={2} required />
            </label>
            <label className={styles.field} htmlFor="professor-profile-email">
              <span>E-mail</span>
              <input className="be-input" id="professor-profile-email" value={record.email} readOnly disabled />
            </label>
            <label className={styles.field} htmlFor="professor-profile-phone">
              <span>Telefone</span>
              <PhoneField id="professor-profile-phone" name="phone" defaultValue={record.profile.telefone} />
            </label>
            <label className={styles.field} htmlFor="professor-profile-timezone">
              <span>Fuso horário</span>
              <input className="be-input" id="professor-profile-timezone" name="timezone" defaultValue={record.profile.fuso_horario} required />
            </label>
            <div className={styles.fullWidth}>
              <span className={badgeClass(record.profile.ativo ? "ativo" : "inativo")}>{record.profile.ativo ? "Perfil ativo" : "Perfil inativo"}</span>
              <p className={styles.hint}>Última confirmação do servidor: {formatDate(record.profile.updated_at, true)}</p>
            </div>
            <Feedback error={mutation.error} success={mutation.success} />
            <div className={`${styles.actions} ${styles.fullWidth}`}>
              <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>
                {mutation.pending ? "Salvando..." : "Salvar perfil"}
              </button>
            </div>
          </form>
        </section>
      )}
    </ResourceGate>
  );
}

function StudentDirectoryPage({ home = false }: { home?: boolean }) {
  const load = useCallback(() => loadStudentDirectory(), []);
  const resource = useResource(load);
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState("todos");

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.length === 0}
      empty={{ title: "Nenhum aluno vinculado", description: "Quando um administrador criar um vínculo ativo, o aluno aparecerá aqui." }}
    >
      {(entries) => {
        const filtered = entries.filter((entry) => {
          const status = entry.access?.status_efetivo ?? entry.access?.status ?? "sem_acesso";
          return entry.profile.nome.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
            && (accessFilter === "todos" || status === accessFilter);
        });
        const active = entries.filter((entry) => (entry.access?.status_efetivo ?? entry.access?.status) === "ativo").length;
        const planned = entries.filter((entry) => entry.planning?.status === "ativo").length;

        return (
          <div className={styles.stack}>
            {home ? (
              <div className={styles.metrics}>
                <Metric label="Alunos vinculados" value={entries.length} />
                <Metric label="Acessos ativos" value={active} />
                <Metric label="Planos ativos" value={planned} />
              </div>
            ) : null}
            <section className="be-card">
              <SectionTitle
                title={home ? "Acompanhamentos recentes" : "Alunos vinculados"}
                description="A lista reflete somente vínculos ativos permitidos pela RLS."
              />
              <div className={styles.filters}>
                <label className={styles.field} htmlFor="student-search">
                  <span>Buscar por nome</span>
                  <input className="be-input" id="student-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome do aluno" />
                </label>
                <label className={styles.field} htmlFor="student-access-filter">
                  <span>Situação do acesso</span>
                  <select className="be-input" id="student-access-filter" value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="ativo">Ativo</option>
                    <option value="pendente">Pendente</option>
                    <option value="bloqueado">Bloqueado</option>
                    <option value="expirado">Expirado</option>
                    <option value="cancelado">Cancelado</option>
                    <option value="sem_acesso">Sem registro</option>
                  </select>
                </label>
              </div>
              {filtered.length ? (
                <div className="be-table-wrap">
                  <table className="be-table">
                    <thead><tr><th>Aluno</th><th>Acesso</th><th>Planejamento ativo</th><th>Vínculo desde</th><th><span className={styles.visuallyHidden}>Ações</span></th></tr></thead>
                    <tbody>
                      {filtered.map((entry) => {
                        const status = entry.access?.status_efetivo ?? entry.access?.status ?? "sem_acesso";
                        return (
                          <tr key={entry.link.id}>
                            <td><strong>{entry.profile.nome}</strong></td>
                            <td><span className={badgeClass(status)}>{labelize(status)}</span></td>
                            <td>{entry.planning?.nome ?? "Nenhum"}</td>
                            <td>{formatDate(entry.link.inicio_em)}</td>
                            <td><Link className="be-button" href={`/professor/alunos/${entry.profile.id}/resumo`}>Abrir aluno</Link></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <StatePanel title="Nenhum resultado" description="Altere os filtros para consultar os demais alunos vinculados." />}
            </section>
          </div>
        );
      }}
    </ResourceGate>
  );
}

function WaitlistPage() {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: listData, error: listError } = await supabase
      .from("lista_espera")
      .select("id, aluno_id, professor_id, whatsapp, area_interesse, concurso_foco, status, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (listError) throw listError;
    const entries = asRows<WaitlistEntry>(listData);
    if (!entries.length) return [];
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
      .in("id", entries.map((item) => item.aluno_id));
    if (profilesError) throw profilesError;
    const profiles = new Map(asRows<Profile>(profilesData).map((item) => [item.id, item]));
    return entries.flatMap((entry) => {
      const profile = profiles.get(entry.aluno_id);
      return profile ? [{ entry, profile }] : [];
    });
  }, []);
  const resource = useResource(load);
  const mutation = useMutationFeedback();
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");

  async function updateStatus(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`waitlist-${id}`, () => callRpc("administrar_lista_espera", {
      p_lista_id: id,
      p_status: formText(data, "status"),
    }), "Lista de espera atualizada com confirmação do Supabase.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.length === 0}
      empty={{ title: "Nenhum aluno aguardando", description: "A RLS exibirá aqui apenas inscrições de alunos com vínculo ativo com você." }}
    >
      {(records) => {
        const filtered = records.filter(({ entry, profile }) => (
          (statusFilter === "todos" || entry.status === statusFilter)
          && [profile.nome, entry.whatsapp, entry.area_interesse, entry.concurso_foco]
            .some((value) => value.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
        ));
        return (
          <section className="be-card">
            <SectionTitle title="Acompanhamento da lista" description="A situação comercial não libera acesso, não cria vínculo e não cria planejamento automaticamente." />
            <div className={styles.filters}>
              <label className={styles.field} htmlFor="waitlist-search"><span>Buscar</span><input className="be-input" id="waitlist-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aluno, WhatsApp, área ou concurso" /></label>
              <label className={styles.field} htmlFor="waitlist-status"><span>Situação</span><select className="be-input" id="waitlist-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="todos">Todas</option><option value="aguardando">Aguardando</option><option value="contatado">Contatado</option><option value="convertido">Convertido</option><option value="cancelado">Cancelado</option></select></label>
            </div>
            <Feedback error={mutation.error} success={mutation.success} />
            {filtered.length ? (
              <div className={styles.cardGrid}>
                {filtered.map(({ entry, profile }) => (
                  <article className={styles.itemCard} key={entry.id}>
                    <div className={styles.itemHeader}><div><h3>{profile.nome}</h3><p>Inscrição em {formatDate(entry.created_at)}</p></div><span className={badgeClass(entry.status)}>{labelize(entry.status)}</span></div>
                    <dl className={styles.details}><div><dt>WhatsApp</dt><dd>{entry.whatsapp}</dd></div><div><dt>Área</dt><dd>{entry.area_interesse}</dd></div><div><dt>Concurso</dt><dd>{entry.concurso_foco}</dd></div></dl>
                    <form className={styles.inlineForm} onSubmit={(event) => updateStatus(event, entry.id)}>
                      <label className={styles.field} htmlFor={`waitlist-entry-${entry.id}`}><span>Atualizar situação</span><select className="be-input" id={`waitlist-entry-${entry.id}`} name="status" defaultValue={entry.status}><option value="aguardando">Aguardando</option><option value="contatado">Contatado</option><option value="convertido">Convertido</option><option value="cancelado">Cancelado</option></select></label>
                      <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `waitlist-${entry.id}` ? "Salvando..." : "Salvar"}</button>
                    </form>
                    <Link className="be-button be-button--ghost" href={`/professor/alunos/${entry.aluno_id}/resumo`}>Abrir acompanhamento</Link>
                  </article>
                ))}
              </div>
            ) : <StatePanel title="Nenhum resultado" description="Nenhuma inscrição corresponde aos filtros atuais." />}
          </section>
        );
      }}
    </ResourceGate>
  );
}

function StudentSummaryPage({ studentId }: { studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [profile, accessResult, planningResult] = await Promise.all([
      loadStudent(studentId),
      supabase.from("acessos_aluno_efetivos").select("id, aluno_id, status, status_efetivo, plano, inicio_em, expira_em, bloqueado_em, motivo_bloqueio, updated_at").eq("aluno_id", studentId).order("updated_at", { ascending: false }),
      supabase.from("planejamentos").select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at").eq("aluno_id", studentId).order("updated_at", { ascending: false }),
    ]);
    if (!profile) return null;
    if (accessResult.error) throw accessResult.error;
    if (planningResult.error) throw planningResult.error;
    const accesses = sortNewestAccess(asRows<StudentAccess>(accessResult.data));
    const plannings = asRows<Planning>(planningResult.data);
    const activePlanning = plannings.find((item) => item.status === "ativo") ?? null;
    let goals: Goal[] = [];
    if (activePlanning) {
      const { data, error } = await supabase
        .from("metas")
        .select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em")
        .eq("planejamento_id", activePlanning.id);
      if (error) throw error;
      goals = asRows<Goal>(data);
    }
    return { access: accesses[0] ?? null, activePlanning, goals, planningCount: plannings.length, profile };
  }, [studentId]);
  const resource = useResource(load);

  return (
    <ResourceGate resource={resource}>
      {(data) => {
        const accessStatus = data.access?.status_efetivo ?? data.access?.status ?? "sem_acesso";
        const pending = data.goals.filter((item) => ["pendente", "em_andamento"].includes(item.status)).length;
        const completed = data.goals.filter((item) => item.status === "concluida").length;
        return (
          <div className={styles.stack}>
            <section className={`be-card ${styles.personCard}`}>
              <div><span className="be-section-label">Aluno vinculado</span><h2>{data.profile.nome}</h2><p>{data.profile.telefone ?? "Telefone não informado"} · {data.profile.fuso_horario}</p></div>
              <span className={badgeClass(accessStatus)}>{labelize(accessStatus)}</span>
            </section>
            <div className={styles.metrics}>
              <Metric label="Planejamentos" value={data.planningCount} />
              <Metric label="Metas pendentes" value={pending} />
              <Metric label="Metas concluídas" value={completed} />
            </div>
            <section className="be-card">
              <SectionTitle title="Planejamento atual" />
              {data.activePlanning ? (
                <div className={styles.summaryLine}>
                  <div><strong>{data.activePlanning.nome}</strong><p>{data.activePlanning.curso_nome_snapshot} · {data.activePlanning.metas_semanais} metas por semana</p></div>
                  <Link className="be-button be-button--primary" href={`/professor/alunos/${studentId}/planejamentos/${data.activePlanning.id}/resumo`}>Abrir planejamento</Link>
                </div>
              ) : <StatePanel title="Sem planejamento ativo" description="Crie um planejamento ou ative um planejamento preservado no histórico." action={<Link className="be-button be-button--primary" href={`/professor/alunos/${studentId}/planejamentos/novo`}>Criar planejamento</Link>} />}
            </section>
          </div>
        );
      }}
    </ResourceGate>
  );
}

function StudentAccessPage({ studentId }: { studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [profile, accessResult] = await Promise.all([
      loadStudent(studentId),
      supabase.from("acessos_aluno_efetivos").select("id, aluno_id, status, status_efetivo, plano, inicio_em, expira_em, bloqueado_em, motivo_bloqueio, updated_at").eq("aluno_id", studentId).order("updated_at", { ascending: false }),
    ]);
    if (!profile) return null;
    if (accessResult.error) throw accessResult.error;
    return { access: sortNewestAccess(asRows<StudentAccess>(accessResult.data))[0] ?? null, profile };
  }, [studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function submitAccess(event: FormEvent<HTMLFormElement>, operation: "release" | "renew" | "block") {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const actions = {
      release: () => callRpc("liberar_acesso", {
        p_aluno_id: studentId,
        p_meses: formNumber(data, "months"),
        p_plano: formText(data, "plan") || "manual",
        p_sem_expiracao: data.has("withoutExpiration"),
      }),
      renew: () => callRpc("renovar_acesso", { p_aluno_id: studentId, p_meses: formNumber(data, "months") }),
      block: () => callRpc("bloquear_acesso", { p_aluno_id: studentId, p_motivo: formText(data, "reason") }),
    };
    const messages = { release: "Acesso liberado.", renew: "Acesso renovado.", block: "Acesso bloqueado." };
    const saved = await mutation.run(operation, actions[operation], `${messages[operation]} O estado exibido foi confirmado pelo Supabase.`);
    if (saved) resource.reload();
  }

  async function cancelAccess() {
    if (!window.confirm("Cancelar o acesso acadêmico deste aluno? O planejamento e o histórico serão preservados.")) return;
    const saved = await mutation.run("cancel", () => callRpc("cancelar_acesso", { p_aluno_id: studentId }), "Acesso cancelado; o histórico acadêmico foi preservado.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate resource={resource}>
      {(data) => {
        const status = data.access?.status_efetivo ?? data.access?.status ?? "sem_acesso";
        return (
          <div className={styles.stack}>
            <section className={`be-card ${styles.personCard}`}><div><span className="be-section-label">Aluno</span><h2>{data.profile.nome}</h2><p>Acesso comercial separado do planejamento acadêmico.</p></div><span className={badgeClass(status)}>{labelize(status)}</span></section>
            {data.access ? (
              <dl className={`be-card ${styles.details}`}>
                <div><dt>Plano</dt><dd>{data.access.plano}</dd></div><div><dt>Início</dt><dd>{formatDate(data.access.inicio_em)}</dd></div><div><dt>Validade</dt><dd>{data.access.expira_em ? formatDate(data.access.expira_em) : "Sem expiração"}</dd></div><div><dt>Motivo do bloqueio</dt><dd>{data.access.motivo_bloqueio ?? "Não se aplica"}</dd></div>
              </dl>
            ) : <StatePanel title="Sem registro de acesso" description="Use a liberação para criar um novo acesso acadêmico." />}
            <Feedback error={mutation.error} success={mutation.success} />
            <div className={styles.cardGrid}>
              <form className={`be-card ${styles.formCard}`} onSubmit={(event) => submitAccess(event, "release")}>
                <SectionTitle title="Liberar acesso" description="Cria uma nova liberação ativa, com ou sem vencimento." />
                <label className={styles.field} htmlFor="access-plan"><span>Plano</span><input className="be-input" id="access-plan" name="plan" defaultValue="manual" required /></label>
                <label className={styles.field} htmlFor="access-months"><span>Meses</span><input className="be-input" id="access-months" name="months" type="number" min="1" defaultValue="3" required /></label>
                <label className={styles.check}><input name="withoutExpiration" type="checkbox" /> Sem data de expiração</label>
                <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === "release" ? "Liberando..." : "Liberar acesso"}</button>
              </form>
              <form className={`be-card ${styles.formCard}`} onSubmit={(event) => submitAccess(event, "renew")}>
                <SectionTitle title="Renovar acesso" description="Se já venceu, os meses contam a partir de hoje." />
                <label className={styles.field} htmlFor="renew-months"><span>Meses adicionais</span><input className="be-input" id="renew-months" name="months" type="number" min="1" defaultValue="3" required /></label>
                <button className="be-button" type="submit" disabled={mutation.pending !== null}>{mutation.pending === "renew" ? "Renovando..." : "Renovar"}</button>
              </form>
              <form className={`be-card ${styles.formCard}`} onSubmit={(event) => submitAccess(event, "block")}>
                <SectionTitle title="Bloquear acesso" description="O motivo fica registrado na operação." />
                <label className={styles.field} htmlFor="block-reason"><span>Motivo</span><textarea className="be-input" id="block-reason" name="reason" rows={3} required /></label>
                <button className="be-button be-button--danger" type="submit" disabled={mutation.pending !== null}>{mutation.pending === "block" ? "Bloqueando..." : "Bloquear"}</button>
              </form>
              <section className={`be-card ${styles.formCard}`}>
                <SectionTitle title="Cancelar acesso" description="Cancela a liberação atual, mas preserva planejamentos e resultados." />
                <button className="be-button be-button--danger" type="button" onClick={cancelAccess} disabled={mutation.pending !== null}>{mutation.pending === "cancel" ? "Cancelando..." : "Cancelar acesso"}</button>
              </section>
            </div>
          </div>
        );
      }}
    </ResourceGate>
  );
}

function PlanningListPage({ studentId }: { studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [profile, planningResult] = await Promise.all([
      loadStudent(studentId),
      supabase
        .from("planejamentos")
        .select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at")
        .eq("aluno_id", studentId)
        .order("updated_at", { ascending: false }),
    ]);
    if (!profile) return null;
    if (planningResult.error) throw planningResult.error;
    return { plannings: asRows<Planning>(planningResult.data), profile };
  }, [studentId]);
  const resource = useResource(load);
  const [status, setStatus] = useState("todos");

  return (
    <ResourceGate resource={resource}>
      {(data) => {
        const filtered = data.plannings.filter((item) => status === "todos" || item.status === status);
        return (
          <div className={styles.stack}>
            <section className={`be-card ${styles.personCard}`}>
              <div><span className="be-section-label">Aluno</span><h2>{data.profile.nome}</h2><p>Histórico preservado de planejamentos ativos, pausados e arquivados.</p></div>
              <Link className="be-button be-button--primary" href={`/professor/alunos/${studentId}/planejamentos/novo`}>Novo planejamento</Link>
            </section>
            {data.plannings.length ? (
              <section className="be-card">
                <div className={styles.toolbar}>
                  <SectionTitle title="Planejamentos" description="Ativar um planejamento arquiva o planejamento anteriormente ativo na mesma transação." />
                  <label className={styles.compactField} htmlFor="planning-status-filter"><span>Situação</span><select className="be-input" id="planning-status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todas</option><option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="arquivado">Arquivado</option></select></label>
                </div>
                {filtered.length ? (
                  <div className={styles.cardGrid}>
                    {filtered.map((planning) => (
                      <article className={styles.itemCard} key={planning.id}>
                        <div className={styles.itemHeader}><div><h3>{planning.nome}</h3><p>{planning.curso_nome_snapshot}</p></div><span className={badgeClass(planning.status)}>{planning.status}</span></div>
                        <dl className={styles.details}><div><dt>Início</dt><dd>{formatDate(planning.data_inicio)}</dd></div><div><dt>Metas semanais</dt><dd>{planning.metas_semanais}</dd></div><div><dt>Modelo</dt><dd>{labelize(planning.modelo_estudo)}</dd></div></dl>
                        <Link className="be-button" href={`/professor/alunos/${studentId}/planejamentos/${planning.id}/resumo`}>Abrir planejamento</Link>
                      </article>
                    ))}
                  </div>
                ) : <StatePanel title="Nenhum resultado" description="Nenhum planejamento corresponde à situação escolhida." />}
              </section>
            ) : (
              <StatePanel
                title="Nenhum planejamento"
                description="Crie o primeiro planejamento a partir de um curso ativo. O Supabase copiará a configuração do catálogo."
                action={<Link className="be-button be-button--primary" href={`/professor/alunos/${studentId}/planejamentos/novo`}>Criar planejamento</Link>}
              />
            )}
          </div>
        );
      }}
    </ResourceGate>
  );
}

function NewPlanningPage({ studentId }: { studentId: string }) {
  const router = useRouter();
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [profile, coursesResult] = await Promise.all([
      loadStudent(studentId),
      supabase
        .from("cursos")
        .select("id, codigo, nome, area, concurso_alvo, fase, modelo_estudo, metas_semanais_padrao")
        .eq("ativo", true)
        .order("nome"),
    ]);
    if (!profile) return null;
    if (coursesResult.error) throw coursesResult.error;
    return { courses: asRows<Course>(coursesResult.data), profile };
  }, [studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();
  const [selectedCourse, setSelectedCourse] = useState("");
  const [weeklyGoals, setWeeklyGoals] = useState("");

  async function createPlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await mutation.run("create-planning", async () => {
      const response = await callRpc<Planning | Planning[]>("criar_planejamento", {
        p_aluno_id: studentId,
        p_curso_id: formText(data, "course"),
        p_data_inicio: formText(data, "startDate"),
        p_metas_semanais: formNumber(data, "weeklyGoals"),
        p_nome: formText(data, "name"),
      });
      const created = Array.isArray(response) ? response[0] : response;
      if (!created?.id) throw new Error("O Supabase não devolveu o planejamento criado.");
      router.push(`/professor/alunos/${studentId}/planejamentos/${created.id}/resumo`);
    }, "Planejamento criado com o snapshot do catálogo.");
    if (!result) return;
  }

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.courses.length === 0}
      empty={{ title: "Nenhum curso ativo", description: "Um administrador precisa cadastrar e ativar um curso antes da criação do planejamento." }}
    >
      {(data) => {
        const course = data.courses.find((item) => item.id === selectedCourse);
        return (
          <section className={`be-card ${styles.formCard}`}>
            <SectionTitle title={`Novo planejamento para ${data.profile.nome}`} description="A criação copia disciplinas, cadernos, aulas e materiais do curso para uma configuração própria e congelada." />
            <form className={styles.form} onSubmit={createPlanning}>
              <label className={styles.field} htmlFor="new-planning-course"><span>Curso</span><select className="be-input" id="new-planning-course" name="course" value={selectedCourse} onChange={(event) => { const next = event.target.value; setSelectedCourse(next); const selected = data.courses.find((item) => item.id === next); setWeeklyGoals(selected ? String(selected.metas_semanais_padrao) : ""); }} required><option value="">Selecione um curso</option>{data.courses.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}</select></label>
              <label className={styles.field} htmlFor="new-planning-name"><span>Nome do planejamento</span><input className="be-input" id="new-planning-name" name="name" required /></label>
              <label className={styles.field} htmlFor="new-planning-start"><span>Data de início</span><input className="be-input" id="new-planning-start" name="startDate" type="date" required /></label>
              <label className={styles.field} htmlFor="new-planning-goals"><span>Metas por semana</span><input className="be-input" id="new-planning-goals" name="weeklyGoals" type="number" min="1" max="100" value={weeklyGoals} onChange={(event) => setWeeklyGoals(event.target.value)} required /></label>
              {course ? (
                <dl className={`${styles.details} ${styles.fullWidth}`}>
                  <div><dt>Modelo de estudo</dt><dd>{labelize(course.modelo_estudo)}</dd></div><div><dt>Fase</dt><dd>{labelize(course.fase)}</dd></div><div><dt>Área</dt><dd>{course.area ?? "Não informada"}</dd></div><div><dt>Concurso</dt><dd>{course.concurso_alvo ?? "Não informado"}</dd></div>
                </dl>
              ) : null}
              <Feedback error={mutation.error} success={mutation.success} />
              <div className={`${styles.actions} ${styles.fullWidth}`}><Link className="be-button be-button--ghost" href={`/professor/alunos/${studentId}/planejamentos`}>Cancelar</Link><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending ? "Criando..." : "Criar planejamento"}</button></div>
            </form>
          </section>
        );
      }}
    </ResourceGate>
  );
}

function PlanningSummaryPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const router = useRouter();
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [planning, profile, goalsResult, disciplinesResult, notebooksResult, lessonsResult] = await Promise.all([
      loadPlanning(studentId, planningId),
      loadStudent(studentId),
      supabase.from("metas").select("id, status").eq("planejamento_id", planningId),
      supabase.from("planejamento_disciplinas").select("id").eq("planejamento_id", planningId),
      supabase.from("planejamento_cadernos").select("id, planejamento_disciplina_id"),
      supabase.from("planejamento_aulas").select("id, planejamento_disciplina_id"),
    ]);
    if (!planning || !profile) return null;
    if (goalsResult.error) throw goalsResult.error;
    if (disciplinesResult.error) throw disciplinesResult.error;
    if (notebooksResult.error) throw notebooksResult.error;
    if (lessonsResult.error) throw lessonsResult.error;
    const disciplines = asRows<{ id: string }>(disciplinesResult.data);
    const disciplineIds = new Set(disciplines.map((item) => item.id));
    const goals = asRows<{ id: string; status: GoalStatus }>(goalsResult.data);
    return {
      completedGoals: goals.filter((item) => item.status === "concluida").length,
      disciplineCount: disciplines.length,
      lessonCount: asRows<{ id: string; planejamento_disciplina_id: string }>(lessonsResult.data).filter((item) => disciplineIds.has(item.planejamento_disciplina_id)).length,
      notebookCount: asRows<{ id: string; planejamento_disciplina_id: string }>(notebooksResult.data).filter((item) => disciplineIds.has(item.planejamento_disciplina_id)).length,
      planning,
      profile,
      totalGoals: goals.length,
    };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function updatePlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run("update-planning", () => callRpc("atualizar_planejamento", {
      p_fase: formText(data, "phase"),
      p_metas_semanais: formNumber(data, "weeklyGoals"),
      p_modelo_estudo: formText(data, "model"),
      p_nome: formText(data, "name"),
      p_planejamento_id: planningId,
      p_status: formText(data, "status"),
    }), "Planejamento atualizado com confirmação do Supabase.");
    if (saved) resource.reload();
  }

  async function deletePlanning(event: FormEvent<HTMLFormElement>, planning: Planning, completedGoals: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const confirmation = formText(data, "confirmation");
    if (completedGoals > 0 && confirmation !== planning.nome) {
      mutation.setError(`Para excluir um planejamento com histórico, digite exatamente: ${planning.nome}`);
      return;
    }
    if (completedGoals === 0 && !data.has("understood")) {
      mutation.setError("Confirme que compreende a exclusão lógica do planejamento e de suas metas.");
      return;
    }
    const deleted = await mutation.run("delete-planning", () => callRpc("excluir_planejamento", {
      p_confirmar_historico: completedGoals > 0,
      p_motivo: formText(data, "reason"),
      p_planejamento_id: planningId,
    }, "A RPC excluir_planejamento ainda não está disponível. Aplique a migration de fundação antes de usar esta ação."), "Planejamento excluído logicamente.");
    if (deleted) router.push(`/professor/alunos/${studentId}/planejamentos`);
  }

  return (
    <ResourceGate resource={resource}>
      {(data) => (
        <div className={styles.stack}>
          <section className={`be-card ${styles.personCard}`}><div><span className="be-section-label">Planejamento de {data.profile.nome}</span><h2>{data.planning.nome}</h2><p>{data.planning.curso_codigo_snapshot} · {data.planning.curso_nome_snapshot}</p></div><span className={badgeClass(data.planning.status)}>{data.planning.status}</span></section>
          <div className={styles.metrics}><Metric label="Disciplinas" value={data.disciplineCount} /><Metric label="Cadernos" value={data.notebookCount} /><Metric label="Aulas" value={data.lessonCount} /><Metric label="Metas" value={data.totalGoals} /></div>
          <Feedback error={mutation.error} success={mutation.success} />
          <section className={`be-card ${styles.formCard}`}>
            <SectionTitle title="Configuração geral" description="Ativação, pausa e arquivamento são confirmados pelo servidor; ativar arquiva outro planejamento ativo." />
            <form className={styles.form} onSubmit={updatePlanning}>
              <label className={styles.field} htmlFor="planning-name"><span>Nome</span><input className="be-input" id="planning-name" name="name" defaultValue={data.planning.nome} required /></label>
              <label className={styles.field} htmlFor="planning-goals"><span>Metas por semana</span><input className="be-input" id="planning-goals" name="weeklyGoals" type="number" min="1" max="100" defaultValue={data.planning.metas_semanais} required /></label>
              <label className={styles.field} htmlFor="planning-status"><span>Situação</span><select className="be-input" id="planning-status" name="status" defaultValue={data.planning.status}><option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="arquivado">Arquivado</option></select></label>
              <label className={styles.field} htmlFor="planning-phase"><span>Fase</span><select className="be-input" id="planning-phase" name="phase" defaultValue={data.planning.fase}><option value="pre_edital">Pré-edital</option><option value="pos_edital">Pós-edital</option></select></label>
              <label className={styles.field} htmlFor="planning-model"><span>Modelo de estudo</span><select className="be-input" id="planning-model" name="model" defaultValue={data.planning.modelo_estudo}><option value="teoria_blocos">Teoria e blocos</option><option value="somente_blocos">Somente blocos</option></select></label>
              <div className={styles.readonlyField}><span>Data de início</span><strong>{formatDate(data.planning.data_inicio)}</strong></div>
              <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === "update-planning" ? "Salvando..." : "Salvar configuração"}</button></div>
            </form>
          </section>
          <section className={`be-card ${styles.dangerZone}`}>
            <SectionTitle title="Excluir planejamento" description={`Serão excluídas logicamente ${data.totalGoals} metas; ${data.completedGoals} estão concluídas. A operação mantém rastreabilidade de auditoria.`} />
            <form className={styles.form} onSubmit={(event) => deletePlanning(event, data.planning, data.completedGoals)}>
              <label className={`${styles.field} ${styles.fullWidth}`} htmlFor="delete-planning-reason"><span>Motivo da exclusão</span><textarea className="be-input" id="delete-planning-reason" name="reason" rows={3} required /></label>
              {data.completedGoals > 0 ? (
                <label className={`${styles.field} ${styles.fullWidth}`} htmlFor="delete-planning-confirmation"><span>Digite “{data.planning.nome}” para confirmar a remoção do histórico concluído</span><input className="be-input" id="delete-planning-confirmation" name="confirmation" autoComplete="off" required /></label>
              ) : (
                <label className={`${styles.check} ${styles.fullWidth}`}><input name="understood" type="checkbox" required /> Entendo que o planejamento e suas metas deixarão de aparecer nas áreas ativas.</label>
              )}
              <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--danger" type="submit" disabled={mutation.pending !== null}>{mutation.pending === "delete-planning" ? "Excluindo..." : "Excluir planejamento"}</button></div>
            </form>
          </section>
        </div>
      )}
    </ResourceGate>
  );
}

function PlanningDisciplinesPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const { data, error } = await supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem");
    if (error) throw error;
    return { disciplines: asRows<PlanningDiscipline>(data), planning };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function saveDiscipline(event: FormEvent<HTMLFormElement>, disciplineId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const minimum = formNumber(data, "minimum");
    const maximum = formNumber(data, "maximum");
    if (maximum < minimum) {
      mutation.setError("Validação: o máximo de metas deve ser maior ou igual ao mínimo.");
      return;
    }
    const saved = await mutation.run(`discipline-${disciplineId}`, () => callRpc("atualizar_planejamento_disciplina", {
      p_ativo: data.has("active"),
      p_id: disciplineId,
      p_maximo_metas: maximum,
      p_meta_percentual: formNumber(data, "target"),
      p_minimo_metas: minimum,
      p_modalidade: formText(data, "mode"),
      p_ordem: formNumber(data, "order"),
      p_peso: formNumber(data, "weight"),
    }), "Disciplina atualizada com os valores confirmados pelo Supabase.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.disciplines.length === 0}
      empty={{ title: "Nenhuma disciplina", description: "O curso usado neste planejamento não forneceu disciplinas ativas para o snapshot." }}
    >
      {(data) => (
        <div className={styles.stack}>
          <section className="be-card"><SectionTitle title={data.planning.nome} description="Estas configurações pertencem ao planejamento e não mudam quando o catálogo global for editado." /><dl className={styles.details}><div><dt>Modelo</dt><dd>{labelize(data.planning.modelo_estudo)}</dd></div><div><dt>Total semanal</dt><dd>{data.planning.metas_semanais}</dd></div></dl></section>
          <Feedback error={mutation.error} success={mutation.success} />
          <div className={styles.cardGrid}>
            {data.disciplines.map((discipline) => (
              <form className={`be-card ${styles.formCard}`} key={discipline.id} onSubmit={(event) => saveDiscipline(event, discipline.id)}>
                <div className={styles.itemHeader}>
                  <div className={styles.disciplineName}>{discipline.disciplina_cor_snapshot ? <span className={styles.colorDot} style={{ backgroundColor: discipline.disciplina_cor_snapshot }} aria-hidden="true" /> : null}<div><h3>{discipline.disciplina_nome_snapshot}</h3><p>{discipline.disciplina_codigo_snapshot}</p></div></div>
                  <span className={badgeClass(discipline.ativo ? "ativo" : "inativo")}>{discipline.ativo ? "ativa" : "inativa"}</span>
                </div>
                <div className={styles.form}>
                  <label className={styles.field} htmlFor={`discipline-mode-${discipline.id}`}><span>Modalidade</span><select className="be-input" id={`discipline-mode-${discipline.id}`} name="mode" defaultValue={discipline.modalidade}><option value="blocos">Blocos</option>{data.planning.modelo_estudo !== "somente_blocos" ? <option value="teoria">Teoria</option> : null}{data.planning.modelo_estudo !== "somente_blocos" ? <option value="ambos">Ambos</option> : null}</select></label>
                  <label className={styles.field} htmlFor={`discipline-target-${discipline.id}`}><span>Meta percentual</span><input className="be-input" id={`discipline-target-${discipline.id}`} name="target" type="number" min="0" max="100" step="0.01" defaultValue={discipline.meta_percentual} required /></label>
                  <label className={styles.field} htmlFor={`discipline-weight-${discipline.id}`}><span>Peso</span><input className="be-input" id={`discipline-weight-${discipline.id}`} name="weight" type="number" min="0.01" step="0.01" defaultValue={discipline.peso} required /></label>
                  <label className={styles.field} htmlFor={`discipline-min-${discipline.id}`}><span>Mínimo de metas</span><input className="be-input" id={`discipline-min-${discipline.id}`} name="minimum" type="number" min="0" defaultValue={discipline.minimo_metas} required /></label>
                  <label className={styles.field} htmlFor={`discipline-max-${discipline.id}`}><span>Máximo de metas</span><input className="be-input" id={`discipline-max-${discipline.id}`} name="maximum" type="number" min="0" defaultValue={discipline.maximo_metas} required /></label>
                  <label className={styles.field} htmlFor={`discipline-order-${discipline.id}`}><span>Ordem</span><input className="be-input" id={`discipline-order-${discipline.id}`} name="order" type="number" min="0" defaultValue={discipline.ordem} required /></label>
                  <label className={`${styles.check} ${styles.fullWidth}`}><input name="active" type="checkbox" defaultChecked={discipline.ativo} /> Disciplina ativa para novas gerações</label>
                </div>
                <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `discipline-${discipline.id}` ? "Salvando..." : "Salvar disciplina"}</button>
              </form>
            ))}
          </div>
        </div>
      )}
    </ResourceGate>
  );
}

function PlanningNotebooksPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const { data: disciplinesData, error: disciplinesError } = await supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem");
    if (disciplinesError) throw disciplinesError;
    const disciplines = asRows<PlanningDiscipline>(disciplinesData);
    if (!disciplines.length) return { deletedNotebooks: [], disciplines, notebooks: [], planning };
    const { data: notebooksData, error: notebooksError } = await supabase
      .from("planejamento_cadernos")
      .select("id, planejamento_disciplina_id, caderno_catalogo_id, nome, link_tec, total_questoes, ordem, ativo, deleted_at")
      .in("planejamento_disciplina_id", disciplines.map((item) => item.id))
      .order("ordem");
    if (notebooksError) throw notebooksError;
    const notebooks = asRows<PlanningNotebook>(notebooksData);
    return {
      deletedNotebooks: notebooks.filter((item) => Boolean(item.deleted_at)),
      disciplines,
      notebooks: notebooks.filter((item) => !item.deleted_at),
      planning,
    };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function createNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await mutation.run("new-notebook", () => callRpc("salvar_planejamento_caderno", {
      p_ativo: data.has("active"),
      p_caderno_id: null,
      p_link_tec: formText(data, "link") || null,
      p_nome: formText(data, "name"),
      p_ordem: formNumber(data, "order"),
      p_planejamento_disciplina_id: formText(data, "discipline"),
      p_total_questoes: formNumber(data, "questions"),
    }, "A RPC salvar_planejamento_caderno ainda não está disponível. Aplique a migration de fundação antes de adicionar cadernos personalizados."), "Caderno personalizado criado no planejamento.");
    if (saved) {
      form.reset();
      resource.reload();
    }
  }

  async function updateNotebook(event: FormEvent<HTMLFormElement>, notebookId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`notebook-${notebookId}`, () => callRpc("atualizar_planejamento_caderno", {
      p_ativo: data.has("active"),
      p_id: notebookId,
      p_link_tec: formText(data, "link") || null,
      p_nome: formText(data, "name"),
      p_ordem: formNumber(data, "order"),
      p_total_questoes: formNumber(data, "questions"),
    }), "Caderno atualizado com confirmação do Supabase.");
    if (saved) resource.reload();
  }

  async function deleteNotebook(event: FormEvent<HTMLFormElement>, notebook: PlanningNotebook) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.has("understood")) {
      mutation.setError("Confirme que o caderno deixará de participar das próximas gerações.");
      return;
    }
    const saved = await mutation.run(`delete-notebook-${notebook.id}`, () => callRpc<PlanningNotebook>("soft_delete_planejamento_caderno", { p_id: notebook.id, p_reason: formText(data, "reason") }), "Caderno excluído logicamente; metas históricas foram preservadas.");
    if (saved) resource.reload();
  }

  async function restoreNotebook(notebook: PlanningNotebook) {
    const saved = await mutation.run(`restore-notebook-${notebook.id}`, () => callRpc("restore_planejamento_caderno", { p_id: notebook.id, p_reason: "restauração solicitada pelo professor" }), "Caderno restaurado e novamente disponível no planejamento.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate resource={resource}>
      {(data) => (
        <div className={styles.stack}>
          <section className={`be-card ${styles.formCard}`}>
            <SectionTitle title="Adicionar caderno personalizado" description="O novo caderno pertence somente a este planejamento e não altera o catálogo global." />
            {data.disciplines.length ? (
              <form className={styles.form} onSubmit={createNotebook}>
                <label className={styles.field} htmlFor="new-notebook-discipline"><span>Disciplina</span><select className="be-input" id="new-notebook-discipline" name="discipline" required><option value="">Selecione</option>{data.disciplines.map((item) => <option key={item.id} value={item.id}>{item.disciplina_nome_snapshot}</option>)}</select></label>
                <label className={styles.field} htmlFor="new-notebook-name"><span>Nome</span><input className="be-input" id="new-notebook-name" name="name" required /></label>
                <label className={styles.field} htmlFor="new-notebook-link"><span>Link TEC</span><input className="be-input" id="new-notebook-link" name="link" type="url" /></label>
                <label className={styles.field} htmlFor="new-notebook-questions"><span>Total de questões</span><input className="be-input" id="new-notebook-questions" name="questions" type="number" min="0" defaultValue="0" required /></label>
                <label className={styles.field} htmlFor="new-notebook-order"><span>Ordem</span><input className="be-input" id="new-notebook-order" name="order" type="number" min="0" defaultValue="0" required /></label>
                <label className={styles.check}><input name="active" type="checkbox" defaultChecked /> Ativo para novas gerações</label>
                <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === "new-notebook" ? "Criando..." : "Adicionar caderno"}</button></div>
              </form>
            ) : <StatePanel title="Nenhuma disciplina" description="O planejamento precisa ter uma disciplina antes de receber cadernos." />}
          </section>
          <Feedback error={mutation.error} success={mutation.success} />
          {data.deletedNotebooks.length ? (
            <section className={`be-card ${styles.restorePanel}`}>
              <SectionTitle title="Cadernos excluídos" description="Registros confirmados pelo Supabase podem ser restaurados mesmo após recarregar a página." />
              <div className={styles.list}>{data.deletedNotebooks.map((item) => <div className={styles.summaryLine} key={item.id}><div><strong>{item.nome}</strong><p>Excluído logicamente; histórico preservado.</p></div><button className="be-button" type="button" onClick={() => restoreNotebook(item)} disabled={mutation.pending !== null}>{mutation.pending === `restore-notebook-${item.id}` ? "Restaurando..." : "Restaurar"}</button></div>)}</div>
            </section>
          ) : null}
          {data.notebooks.length ? (
            <div className={styles.cardGrid}>
              {data.notebooks.map((notebook) => {
                const discipline = data.disciplines.find((item) => item.id === notebook.planejamento_disciplina_id);
                const externalUrl = safeExternalUrl(notebook.link_tec);
                return (
                  <article className={`be-card ${styles.formCard}`} key={notebook.id}>
                    <div className={styles.itemHeader}><div><span className="be-section-label">{discipline?.disciplina_nome_snapshot ?? "Disciplina"}</span><h3>{notebook.nome}</h3><p>{notebook.caderno_catalogo_id ? "Copiado do catálogo" : "Personalizado"}</p></div><span className={badgeClass(notebook.ativo ? "ativo" : "inativo")}>{notebook.ativo ? "ativo" : "inativo"}</span></div>
                    <form className={styles.form} onSubmit={(event) => updateNotebook(event, notebook.id)}>
                      <label className={`${styles.field} ${styles.fullWidth}`} htmlFor={`notebook-name-${notebook.id}`}><span>Nome</span><input className="be-input" id={`notebook-name-${notebook.id}`} name="name" defaultValue={notebook.nome} required /></label>
                      <label className={`${styles.field} ${styles.fullWidth}`} htmlFor={`notebook-link-${notebook.id}`}><span>Link TEC</span><input className="be-input" id={`notebook-link-${notebook.id}`} name="link" type="url" defaultValue={notebook.link_tec ?? ""} /></label>
                      <label className={styles.field} htmlFor={`notebook-questions-${notebook.id}`}><span>Total de questões</span><input className="be-input" id={`notebook-questions-${notebook.id}`} name="questions" type="number" min="0" defaultValue={notebook.total_questoes} required /></label>
                      <label className={styles.field} htmlFor={`notebook-order-${notebook.id}`}><span>Ordem</span><input className="be-input" id={`notebook-order-${notebook.id}`} name="order" type="number" min="0" defaultValue={notebook.ordem} required /></label>
                      <label className={`${styles.check} ${styles.fullWidth}`}><input name="active" type="checkbox" defaultChecked={notebook.ativo} /> Ativo para novas gerações</label>
                      <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `notebook-${notebook.id}` ? "Salvando..." : "Salvar"}</button>{externalUrl ? <a className="be-button be-button--ghost" href={externalUrl} target="_blank" rel="noreferrer">Abrir TEC</a> : null}</div>
                    </form>
                    <details className={styles.destructiveDetails}>
                      <summary>Excluir caderno</summary>
                      <form className={styles.compactForm} onSubmit={(event) => deleteNotebook(event, notebook)}>
                        <label className={styles.field} htmlFor={`notebook-delete-reason-${notebook.id}`}><span>Motivo</span><input className="be-input" id={`notebook-delete-reason-${notebook.id}`} name="reason" required /></label>
                        <label className={styles.check}><input name="understood" type="checkbox" required /> Entendo que ele não participará de novas metas.</label>
                        <button className="be-button be-button--danger" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `delete-notebook-${notebook.id}` ? "Excluindo..." : "Confirmar exclusão lógica"}</button>
                      </form>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : <StatePanel title="Nenhum caderno" description="Adicione um caderno personalizado a uma disciplina do planejamento." />}
        </div>
      )}
    </ResourceGate>
  );
}

function PlanningLessonsPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const { data: disciplinesData, error: disciplinesError } = await supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem");
    if (disciplinesError) throw disciplinesError;
    const disciplines = asRows<PlanningDiscipline>(disciplinesData);
    if (!disciplines.length) return { disciplines, lessons: [], planning };
    const { data: lessonsData, error: lessonsError } = await supabase
      .from("planejamento_aulas")
      .select("id, planejamento_disciplina_id, nome, ordem, link_tec, total_questoes, materiais_snapshot, ativo")
      .in("planejamento_disciplina_id", disciplines.map((item) => item.id))
      .order("ordem");
    if (lessonsError) throw lessonsError;
    return { disciplines, lessons: asRows<PlanningLesson>(lessonsData), planning };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function updateLesson(event: FormEvent<HTMLFormElement>, lessonId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`lesson-${lessonId}`, () => callRpc("atualizar_planejamento_aula", {
      p_ativo: data.has("active"),
      p_id: lessonId,
      p_link_tec: formText(data, "link") || null,
      p_nome: formText(data, "name"),
      p_ordem: formNumber(data, "order"),
      p_total_questoes: formNumber(data, "questions"),
    }), "Aula atualizada no snapshot do planejamento.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.lessons.length === 0}
      empty={{ title: "Nenhuma aula", description: "Este planejamento não possui aulas copiadas do catálogo." }}
    >
      {(data) => (
        <div className={styles.stack}>
          <section className="be-card"><SectionTitle title={`Aulas de ${data.planning.nome}`} description="Nomes, links, quantidades e materiais são a configuração congelada deste planejamento." /></section>
          <Feedback error={mutation.error} success={mutation.success} />
          <div className={styles.cardGrid}>
            {data.lessons.map((lesson) => {
              const discipline = data.disciplines.find((item) => item.id === lesson.planejamento_disciplina_id);
              const externalUrl = safeExternalUrl(lesson.link_tec);
              return (
                <article className={`be-card ${styles.formCard}`} key={lesson.id}>
                  <div className={styles.itemHeader}><div><span className="be-section-label">{discipline?.disciplina_nome_snapshot ?? "Disciplina"}</span><h3>{lesson.nome}</h3><p>{lesson.materiais_snapshot.length} material(is) copiado(s)</p></div><span className={badgeClass(lesson.ativo ? "ativo" : "inativo")}>{lesson.ativo ? "ativa" : "inativa"}</span></div>
                  <form className={styles.form} onSubmit={(event) => updateLesson(event, lesson.id)}>
                    <label className={`${styles.field} ${styles.fullWidth}`} htmlFor={`lesson-name-${lesson.id}`}><span>Nome</span><input className="be-input" id={`lesson-name-${lesson.id}`} name="name" defaultValue={lesson.nome} required /></label>
                    <label className={`${styles.field} ${styles.fullWidth}`} htmlFor={`lesson-link-${lesson.id}`}><span>Link TEC</span><input className="be-input" id={`lesson-link-${lesson.id}`} name="link" type="url" defaultValue={lesson.link_tec ?? ""} /></label>
                    <label className={styles.field} htmlFor={`lesson-questions-${lesson.id}`}><span>Total de questões</span><input className="be-input" id={`lesson-questions-${lesson.id}`} name="questions" type="number" min="0" defaultValue={lesson.total_questoes} required /></label>
                    <label className={styles.field} htmlFor={`lesson-order-${lesson.id}`}><span>Ordem</span><input className="be-input" id={`lesson-order-${lesson.id}`} name="order" type="number" min="0" defaultValue={lesson.ordem} required /></label>
                    <label className={`${styles.check} ${styles.fullWidth}`}><input name="active" type="checkbox" defaultChecked={lesson.ativo} /> Aula ativa</label>
                    <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `lesson-${lesson.id}` ? "Salvando..." : "Salvar aula"}</button>{externalUrl ? <a className="be-button be-button--ghost" href={externalUrl} target="_blank" rel="noreferrer">Abrir TEC</a> : null}</div>
                  </form>
                  {lesson.materiais_snapshot.length ? (
                    <details className={styles.materials}><summary>Materiais copiados</summary><ul>{[...lesson.materiais_snapshot].sort((left, right) => (left.ordem ?? 0) - (right.ordem ?? 0)).map((material, index) => { const url = safeExternalUrl(material.url); return <li key={material.id ?? `${lesson.id}-${index}`}><span className="be-badge be-badge--neutral">{material.tipo ?? "outro"}</span>{url ? <a href={url} target="_blank" rel="noreferrer">{material.nome ?? "Abrir material"}</a> : <span>{material.nome ?? "Material sem nome"}</span>}</li>; })}</ul></details>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </ResourceGate>
  );
}

function useWeek(pathname: string) {
  const router = useRouter();
  const [week, setWeek] = useState(1);

  useEffect(() => {
    const candidate = Number(new URLSearchParams(window.location.search).get("semana"));
    if (Number.isInteger(candidate) && candidate >= 1) {
      // Sincroniza a URL somente quando a rota contextual muda.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWeek(candidate);
    }
  }, [pathname]);

  function changeWeek(next: number) {
    const valid = Math.max(1, Math.floor(next || 1));
    setWeek(valid);
    router.replace(`/professor/${pathname}?semana=${valid}`, { scroll: false });
  }

  return { changeWeek, week };
}

function WeekPicker({ changeWeek, week }: { changeWeek: (week: number) => void; week: number }) {
  return (
    <div className={styles.weekPicker} aria-label="Selecionar semana do planejamento">
      <button className="be-button" type="button" onClick={() => changeWeek(week - 1)} disabled={week <= 1} aria-label="Semana anterior">←</button>
      <label className={styles.compactField} htmlFor="planning-week"><span>Semana</span><input className="be-input" id="planning-week" type="number" min="1" value={week} onChange={(event) => changeWeek(Number(event.target.value))} /></label>
      <button className="be-button" type="button" onClick={() => changeWeek(week + 1)} aria-label="Próxima semana">→</button>
    </div>
  );
}

function PlanningGoalsPage({ planningId, routePath, studentId }: { planningId: string; routePath: string; studentId: string }) {
  const { changeWeek, week } = useWeek(routePath);
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const [disciplinesResult, notebooksResult, goalsResult] = await Promise.all([
      supabase.from("planejamento_disciplinas").select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo").eq("planejamento_id", planningId).order("ordem"),
      supabase.from("planejamento_cadernos").select("id, planejamento_disciplina_id, caderno_catalogo_id, nome, link_tec, total_questoes, ordem, ativo, deleted_at"),
      supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).eq("semana_numero", week).order("dia_semana").order("ordem_dia"),
    ]);
    if (disciplinesResult.error) throw disciplinesResult.error;
    if (notebooksResult.error) throw notebooksResult.error;
    if (goalsResult.error) throw goalsResult.error;
    const disciplines = asRows<PlanningDiscipline>(disciplinesResult.data);
    const ids = new Set(disciplines.map((item) => item.id));
    return {
      disciplines,
      goals: asRows<Goal>(goalsResult.data),
      notebooks: asRows<PlanningNotebook>(notebooksResult.data).filter((item) => ids.has(item.planejamento_disciplina_id)),
      planning,
    };
  }, [planningId, studentId, week]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function updateGoal(event: FormEvent<HTMLFormElement>, goalId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`goal-${goalId}`, () => callRpc("atualizar_meta", {
      p_descricao: formText(data, "description") || null,
      p_dia: formNumber(data, "day"),
      p_meta_id: goalId,
      p_ordem: formNumber(data, "order"),
      p_semana: week,
      p_tempo_previsto_minutos: formNumber(data, "minutes"),
      p_titulo: formText(data, "title"),
    }), "Meta atualizada com confirmação do Supabase.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate resource={resource}>
      {(data) => (
        <div className={styles.stack}>
          <section className={`be-card ${styles.toolbar}`}>
            <SectionTitle title={`Agenda de ${data.planning.nome}`} description={`${data.goals.length} atividade(s) encontrada(s) na semana ${week}.`} />
            <div className={styles.toolbarActions}><WeekPicker changeWeek={changeWeek} week={week} /><Link className="be-button be-button--primary" href={`/professor/alunos/${studentId}/planejamentos/${planningId}/metas/gerar?semana=${week}`}>Gerar ou substituir</Link></div>
          </section>
          <Feedback error={mutation.error} success={mutation.success} />
          {data.goals.length ? (
            <div className={styles.goalDays}>
              {dayNames.map((day, dayIndex) => {
                const dayGoals = data.goals.filter((goal) => goal.dia_semana === dayIndex + 1);
                if (!dayGoals.length) return null;
                return (
                  <section className="be-card" key={day}>
                    <div className={styles.dayHeading}><h2>{day}</h2><span className="be-badge be-badge--neutral">{dayGoals.length} meta(s)</span></div>
                    <div className={styles.list}>
                      {dayGoals.map((goal) => {
                        const discipline = data.disciplines.find((item) => item.id === goal.planejamento_disciplina_id);
                        const notebook = data.notebooks.find((item) => item.id === goal.planejamento_caderno_id);
                        const editable = goal.status !== "concluida";
                        return (
                          <article className={styles.goalCard} key={goal.id}>
                            <div className={styles.itemHeader}>
                              <div><span className="be-section-label">{discipline?.disciplina_nome_snapshot ?? labelize(goal.tipo)}</span><h3>{goal.titulo}</h3><p>{notebook?.nome ?? labelize(goal.tipo)} · {goal.tempo_previsto_minutos} min · ordem {goal.ordem_dia}</p></div>
                              <div className={styles.badges}><span className="be-badge be-badge--info">{labelize(goal.tipo)}</span><span className={badgeClass(goal.status)}>{labelize(goal.status)}</span></div>
                            </div>
                            {editable ? (
                              <details className={styles.editor}>
                                <summary>Editar agenda e conteúdo</summary>
                                <form className={styles.form} onSubmit={(event) => updateGoal(event, goal.id)}>
                                  <label className={`${styles.field} ${styles.fullWidth}`} htmlFor={`goal-title-${goal.id}`}><span>Título</span><input className="be-input" id={`goal-title-${goal.id}`} name="title" defaultValue={goal.titulo} required /></label>
                                  <label className={`${styles.field} ${styles.fullWidth}`} htmlFor={`goal-description-${goal.id}`}><span>Descrição</span><textarea className="be-input" id={`goal-description-${goal.id}`} name="description" rows={2} defaultValue={goal.descricao ?? ""} /></label>
                                  <label className={styles.field} htmlFor={`goal-day-${goal.id}`}><span>Dia</span><select className="be-input" id={`goal-day-${goal.id}`} name="day" defaultValue={goal.dia_semana}>{dayNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
                                  <label className={styles.field} htmlFor={`goal-order-${goal.id}`}><span>Ordem do dia</span><input className="be-input" id={`goal-order-${goal.id}`} name="order" type="number" min="1" defaultValue={goal.ordem_dia} required /></label>
                                  <label className={styles.field} htmlFor={`goal-minutes-${goal.id}`}><span>Tempo previsto</span><input className="be-input" id={`goal-minutes-${goal.id}`} name="minutes" type="number" min="1" max="240" defaultValue={goal.tempo_previsto_minutos} required /></label>
                                  <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `goal-${goal.id}` ? "Salvando..." : "Salvar meta"}</button></div>
                                </form>
                              </details>
                            ) : (
                              <p className={styles.hint}>Meta concluída em {formatDate(goal.concluida_em, true)}. O professor não sobrescreve resultados concluídos.</p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <StatePanel title="Nenhuma meta nesta semana" description="Gere a agenda semanal ou consulte outra semana." action={<Link className="be-button be-button--primary" href={`/professor/alunos/${studentId}/planejamentos/${planningId}/metas/gerar?semana=${week}`}>Gerar metas</Link>} />
          )}
        </div>
      )}
    </ResourceGate>
  );
}

type GenerationPrefill = {
  days: number[];
  minutes: number;
  selected: boolean;
  title: string;
  type: "bloco" | "teoria";
};

function predominant<T extends string | number>(values: T[], fallback: T) {
  if (!values.length) return fallback;
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

function GenerateGoalsPage({ planningId, routePath, studentId }: { planningId: string; routePath: string; studentId: string }) {
  const router = useRouter();
  const { changeWeek, week } = useWeek(routePath);
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const [disciplinesResult, currentResult, previousResult] = await Promise.all([
      supabase.from("planejamento_disciplinas").select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo").eq("planejamento_id", planningId).eq("ativo", true).order("ordem"),
      supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).eq("semana_numero", week).in("tipo", ["bloco", "teoria"]),
      week > 1
        ? supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).eq("semana_numero", week - 1).in("tipo", ["bloco", "teoria"])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (disciplinesResult.error) throw disciplinesResult.error;
    if (currentResult.error) throw currentResult.error;
    if (previousResult.error) throw previousResult.error;
    return {
      currentGoals: asRows<Goal>(currentResult.data),
      disciplines: asRows<PlanningDiscipline>(disciplinesResult.data),
      planning,
      previousGoals: asRows<Goal>(previousResult.data),
    };
  }, [planningId, studentId, week]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();
  const [prefill, setPrefill] = useState<Record<string, GenerationPrefill>>({});
  const [prefillRevision, setPrefillRevision] = useState(0);

  function copyPreviousWeek(disciplines: PlanningDiscipline[], previousGoals: Goal[]) {
    if (!previousGoals.length) {
      mutation.setError("A semana anterior não possui metas normais para usar como prévia.");
      return;
    }
    const next: Record<string, GenerationPrefill> = {};
    disciplines.forEach((discipline) => {
      const goals = previousGoals.filter((goal) => goal.planejamento_disciplina_id === discipline.id);
      if (!goals.length) return;
      next[discipline.id] = {
        days: [...new Set(goals.map((goal) => goal.dia_semana))].sort(),
        minutes: predominant(goals.map((goal) => goal.tempo_previsto_minutos), 60),
        selected: true,
        title: "",
        type: predominant(goals.map((goal) => goal.tipo === "teoria" ? "teoria" : "bloco"), "bloco"),
      };
    });
    setPrefill(next);
    setPrefillRevision((current) => current + 1);
  }

  async function generate(event: FormEvent<HTMLFormElement>, disciplines: PlanningDiscipline[], planning: Planning, completedGoals: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selected = disciplines.filter((discipline) => data.has(`selected-${discipline.id}`));
    if (!selected.length) {
      mutation.setError("Validação: selecione pelo menos uma disciplina.");
      return;
    }
    const rules = selected.map((discipline) => ({
      descricao: formText(data, `description-${discipline.id}`) || undefined,
      dias_permitidos: dayNames.map((_, index) => index + 1).filter((day) => data.has(`day-${discipline.id}-${day}`)),
      planejamento_disciplina_id: discipline.id,
      tempo_previsto_minutos: formNumber(data, `minutes-${discipline.id}`),
      tipo: formText(data, `type-${discipline.id}`),
      titulo: formText(data, `title-${discipline.id}`) || undefined,
    }));
    if (rules.some((rule) => rule.dias_permitidos.length === 0)) {
      mutation.setError("Validação: toda disciplina selecionada precisa de pelo menos um dia permitido.");
      return;
    }
    const fullReplan = data.has("fullReplan");
    if (fullReplan && completedGoals > 0 && formText(data, "historyConfirmation") !== "REPLANEJAR") {
      mutation.setError("Para remover metas concluídas, digite REPLANEJAR no campo de confirmação.");
      return;
    }
    const saved = await mutation.run("generate-goals", () => callRpc("gerar_metas_semana", {
      p_confirmar_historico: fullReplan && completedGoals > 0,
      p_disciplinas: rules,
      p_planejamento_id: planningId,
      p_replanejar_tudo: fullReplan,
      p_semana: week,
      p_total_metas: planning.metas_semanais,
    }, "A RPC gerar_metas_semana ainda não está disponível. Aplique a migration de fundação antes de gerar metas automaticamente."), "Semana gerada de forma transacional pelo Supabase.");
    if (saved) router.push(`/professor/alunos/${studentId}/planejamentos/${planningId}/metas?semana=${week}`);
  }

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.disciplines.length === 0}
      empty={{ title: "Nenhuma disciplina ativa", description: "Ative e configure ao menos uma disciplina antes de gerar metas." }}
    >
      {(data) => {
        const completedGoals = data.currentGoals.filter((goal) => goal.status === "concluida").length;
        return (
          <div className={styles.stack}>
            <section className={`be-card ${styles.toolbar}`}><SectionTitle title="Gerar metas da semana" description={`O Supabase distribuirá exatamente ${data.planning.metas_semanais} metas por mínimos, pesos, máximos e maiores restos.`} /><WeekPicker changeWeek={changeWeek} week={week} /></section>
            {data.planning.status !== "ativo" ? <StatePanel kind="error" title="Planejamento não está ativo" description="A geração transacional aceita somente planejamento ativo. Ative-o no resumo antes de continuar." /> : null}
            <Feedback error={mutation.error} success={mutation.success} />
            <form className={styles.stack} onSubmit={(event) => generate(event, data.disciplines, data.planning, completedGoals)} key={`${week}-${prefillRevision}`}>
              <section className={`be-card ${styles.generationIntro}`}>
                <div><strong>Semana {week}</strong><p>Existem {data.currentGoals.length} metas normais, incluindo {completedGoals} concluída(s).</p></div>
                <button className="be-button" type="button" onClick={() => copyPreviousWeek(data.disciplines, data.previousGoals)}>Copiar prévia da semana {Math.max(1, week - 1)}</button>
              </section>
              <div className={styles.cardGrid}>
                {data.disciplines.map((discipline) => {
                  const previous = prefill[discipline.id];
                  const allowedTheory = data.planning.modelo_estudo !== "somente_blocos" && discipline.modalidade !== "blocos";
                  const allowedBlock = discipline.modalidade !== "teoria";
                  const defaultType = previous?.type && ((previous.type === "teoria" && allowedTheory) || (previous.type === "bloco" && allowedBlock)) ? previous.type : allowedBlock ? "bloco" : "teoria";
                  return (
                    <fieldset className={`be-card ${styles.ruleCard}`} key={discipline.id}>
                      <legend>{discipline.disciplina_nome_snapshot}</legend>
                      <label className={styles.check}><input name={`selected-${discipline.id}`} type="checkbox" defaultChecked={previous?.selected ?? true} /> Incluir na distribuição</label>
                      <dl className={styles.ruleMetrics}><div><dt>Mínimo</dt><dd>{discipline.minimo_metas}</dd></div><div><dt>Máximo</dt><dd>{discipline.maximo_metas}</dd></div><div><dt>Peso</dt><dd>{discipline.peso}</dd></div></dl>
                      <label className={styles.field} htmlFor={`generation-type-${discipline.id}`}><span>Tipo</span><select className="be-input" id={`generation-type-${discipline.id}`} name={`type-${discipline.id}`} defaultValue={defaultType}>{allowedBlock ? <option value="bloco">Bloco</option> : null}{allowedTheory ? <option value="teoria">Teoria</option> : null}</select></label>
                      <label className={styles.field} htmlFor={`generation-minutes-${discipline.id}`}><span>Tempo previsto</span><input className="be-input" id={`generation-minutes-${discipline.id}`} name={`minutes-${discipline.id}`} type="number" min="1" max="240" defaultValue={previous?.minutes ?? 60} required /></label>
                      <fieldset className={styles.dayOptions}><legend>Dias permitidos</legend>{dayNames.map((day, index) => <label className={styles.check} key={day}><input name={`day-${discipline.id}-${index + 1}`} type="checkbox" defaultChecked={previous ? previous.days.includes(index + 1) : index < 5} /> {day.slice(0, 3)}</label>)}</fieldset>
                      <label className={styles.field} htmlFor={`generation-title-${discipline.id}`}><span>Título personalizado (opcional)</span><input className="be-input" id={`generation-title-${discipline.id}`} name={`title-${discipline.id}`} defaultValue={previous?.title ?? ""} /></label>
                      <label className={styles.field} htmlFor={`generation-description-${discipline.id}`}><span>Descrição (opcional)</span><textarea className="be-input" id={`generation-description-${discipline.id}`} name={`description-${discipline.id}`} rows={2} /></label>
                    </fieldset>
                  );
                })}
              </div>
              <section className={`be-card ${styles.dangerZone}`}>
                <SectionTitle title="Modo de substituição" description="A substituição comum preserva concluídas. O replanejamento completo também remove as concluídas e exige confirmação destacada." />
                <label className={styles.check}><input name="fullReplan" type="checkbox" /> Replanejar toda a semana, inclusive o histórico concluído</label>
                {completedGoals > 0 ? <label className={styles.field} htmlFor="full-replan-confirmation"><span>Somente para replanejamento completo: digite REPLANEJAR</span><input className="be-input" id="full-replan-confirmation" name="historyConfirmation" autoComplete="off" /></label> : null}
              </section>
              <div className={styles.actions}><Link className="be-button be-button--ghost" href={`/professor/alunos/${studentId}/planejamentos/${planningId}/metas?semana=${week}`}>Cancelar</Link><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null || data.planning.status !== "ativo"}>{mutation.pending === "generate-goals" ? "Gerando..." : `Gerar ${data.planning.metas_semanais} metas`}</button></div>
            </form>
          </div>
        );
      }}
    </ResourceGate>
  );
}

function percentage(goal: Goal) {
  return goal.questoes_feitas > 0 ? (goal.acertos * 100) / goal.questoes_feitas : 0;
}

function PlanningReinforcementsPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const [disciplinesResult, goalsResult] = await Promise.all([
      supabase.from("planejamento_disciplinas").select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo").eq("planejamento_id", planningId).order("ordem"),
      supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).in("tipo", ["bloco", "reforco"]).order("semana_numero", { ascending: false }).order("dia_semana"),
    ]);
    if (disciplinesResult.error) throw disciplinesResult.error;
    if (goalsResult.error) throw goalsResult.error;
    return { disciplines: asRows<PlanningDiscipline>(disciplinesResult.data), goals: asRows<Goal>(goalsResult.data), planning };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function schedule(event: FormEvent<HTMLFormElement>, originId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`schedule-${originId}`, () => callRpc("agendar_reforco", {
      p_dia: formNumber(data, "day"),
      p_meta_origem_id: originId,
      p_semana: formNumber(data, "week"),
    }), "Reforço agendado sem alterar o resultado da meta original.");
    if (saved) resource.reload();
  }

  async function cancel(event: FormEvent<HTMLFormElement>, reinforcementId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`cancel-reinforcement-${reinforcementId}`, () => callRpc("cancelar_reforco", {
      p_motivo: formText(data, "reason"),
      p_reforco_id: reinforcementId,
    }), "Reforço cancelado; o histórico foi preservado.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate resource={resource}>
      {(data) => {
        const reinforcements = data.goals.filter((goal) => goal.tipo === "reforco");
        const suggestions = data.goals.filter((goal) => {
          if (goal.tipo !== "bloco" || goal.status !== "concluida" || goal.questoes_feitas < 1 || !goal.planejamento_disciplina_id) return false;
          const discipline = data.disciplines.find((item) => item.id === goal.planejamento_disciplina_id);
          if (!discipline || percentage(goal) >= discipline.meta_percentual) return false;
          const related = reinforcements.filter((item) => item.origem_meta_id === goal.id);
          const active = related.some((item) => ["pendente", "em_andamento"].includes(item.status));
          const resolved = related.some((item) => item.status === "concluida" && percentage(item) >= discipline.meta_percentual);
          return !active && !resolved;
        });

        return (
          <div className={styles.stack}>
            <section className="be-card"><SectionTitle title="Sugestões de reforço" description="A sugestão vem de bloco concluído abaixo da meta percentual. Agendar preserva a origem e impede duplicidade ativa." />
              {suggestions.length ? (
                <div className={styles.list}>
                  {suggestions.map((origin) => {
                    const discipline = data.disciplines.find((item) => item.id === origin.planejamento_disciplina_id);
                    const achieved = percentage(origin);
                    const highPriority = discipline ? achieved < discipline.meta_percentual * 0.75 : false;
                    return (
                      <article className={styles.goalCard} key={origin.id}>
                        <div className={styles.itemHeader}><div><span className="be-section-label">{discipline?.disciplina_nome_snapshot ?? "Disciplina"}</span><h3>{origin.titulo}</h3><p>{origin.acertos}/{origin.questoes_feitas} acertos · {achieved.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de aproveitamento · meta {discipline?.meta_percentual ?? 0}%</p></div><div className={styles.badges}>{origin.reforco_ignorado_em ? <span className="be-badge be-badge--neutral">ignorado pelo aluno</span> : null}<span className={highPriority ? "be-badge be-badge--danger" : "be-badge be-badge--warning"}>{highPriority ? "prioridade alta" : "atenção"}</span></div></div>
                        <form className={styles.inlineForm} onSubmit={(event) => schedule(event, origin.id)}>
                          <label className={styles.field} htmlFor={`reinforcement-week-${origin.id}`}><span>Semana</span><input className="be-input" id={`reinforcement-week-${origin.id}`} name="week" type="number" min="1" defaultValue={origin.semana_numero + 1} required /></label>
                          <label className={styles.field} htmlFor={`reinforcement-day-${origin.id}`}><span>Dia</span><select className="be-input" id={`reinforcement-day-${origin.id}`} name="day" defaultValue={origin.dia_semana}>{dayNames.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
                          <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `schedule-${origin.id}` ? "Agendando..." : origin.reforco_ignorado_em ? "Reativar e agendar" : "Agendar reforço"}</button>
                        </form>
                      </article>
                    );
                  })}
                </div>
              ) : <StatePanel title="Nenhuma sugestão aberta" description="Não há blocos elegíveis abaixo da meta sem um reforço ativo ou resolvido." />}
            </section>
            <Feedback error={mutation.error} success={mutation.success} />
            <section className="be-card"><SectionTitle title="Reforços agendados" description="Concluídos permanecem no histórico; apenas pendentes ou em andamento podem ser cancelados." />
              {reinforcements.length ? (
                <div className={styles.list}>
                  {reinforcements.map((reinforcement) => {
                    const discipline = data.disciplines.find((item) => item.id === reinforcement.planejamento_disciplina_id);
                    const cancellable = ["pendente", "em_andamento"].includes(reinforcement.status);
                    return (
                      <article className={styles.goalCard} key={reinforcement.id}>
                        <div className={styles.itemHeader}><div><span className="be-section-label">{discipline?.disciplina_nome_snapshot ?? "Disciplina"}</span><h3>{reinforcement.titulo}</h3><p>Semana {reinforcement.semana_numero} · {dayNames[reinforcement.dia_semana - 1]} · origem preservada</p></div><span className={badgeClass(reinforcement.status)}>{labelize(reinforcement.status)}</span></div>
                        {cancellable ? <details className={styles.destructiveDetails}><summary>Cancelar reforço</summary><form className={styles.inlineForm} onSubmit={(event) => cancel(event, reinforcement.id)}><label className={styles.field} htmlFor={`reinforcement-reason-${reinforcement.id}`}><span>Motivo</span><input className="be-input" id={`reinforcement-reason-${reinforcement.id}`} name="reason" required /></label><button className="be-button be-button--danger" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `cancel-reinforcement-${reinforcement.id}` ? "Cancelando..." : "Confirmar cancelamento"}</button></form></details> : null}
                      </article>
                    );
                  })}
                </div>
              ) : <StatePanel title="Nenhum reforço agendado" description="Reforços criados para metas elegíveis aparecerão aqui." />}
            </section>
          </div>
        );
      }}
    </ResourceGate>
  );
}

function PlanningReviewsPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const { data: disciplinesData, error: disciplinesError } = await supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem");
    if (disciplinesError) throw disciplinesError;
    const disciplines = asRows<PlanningDiscipline>(disciplinesData);
    if (!disciplines.length) return { configurations: [], disciplines, lessons: [], planning, reviews: [] };
    const disciplineIds = disciplines.map((item) => item.id);
    const [configurationsResult, lessonsResult] = await Promise.all([
      supabase.from("configuracoes_revisao").select("id, planejamento_disciplina_id, primeira_revisao_intervalo, segunda_revisao_intervalo, ativo").in("planejamento_disciplina_id", disciplineIds),
      supabase.from("planejamento_aulas").select("id, planejamento_disciplina_id, nome, ordem, link_tec, total_questoes, materiais_snapshot, ativo").in("planejamento_disciplina_id", disciplineIds),
    ]);
    if (configurationsResult.error) throw configurationsResult.error;
    if (lessonsResult.error) throw lessonsResult.error;
    const lessons = asRows<PlanningLesson>(lessonsResult.data);
    let reviews: Review[] = [];
    if (lessons.length) {
      const lessonIds = lessons.map((item) => item.id);
      const { data, error } = await supabase
        .from("revisoes")
        .select("id, planejamento_aula_origem_id, planejamento_aula_revisada_id, etapa, status, prevista_em, concluida_em")
        .eq("aluno_id", studentId)
        .in("planejamento_aula_origem_id", lessonIds)
        .order("prevista_em");
      if (error) throw error;
      reviews = asRows<Review>(data);
    }
    return { configurations: asRows<ReviewConfiguration>(configurationsResult.data), disciplines, lessons, planning, reviews };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function saveConfiguration(event: FormEvent<HTMLFormElement>, disciplineId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run(`review-config-${disciplineId}`, () => callRpc("salvar_configuracao_revisao", {
      p_ativo: data.has("active"),
      p_planejamento_disciplina_id: disciplineId,
      p_primeira_intervalo: formNumber(data, "first"),
      p_segunda_intervalo: formNumber(data, "second"),
    }), "Configuração de revisão atualizada; aluno e professor consultarão a mesma fonte.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate
      resource={resource}
      isEmpty={(data) => data.disciplines.length === 0}
      empty={{ title: "Nenhuma disciplina", description: "Não há disciplinas disponíveis para configurar revisões." }}
    >
      {(data) => (
        <div className={styles.stack}>
          <section className="be-card"><SectionTitle title="Configuração por disciplina" description="Intervalos aceitam de 0 a 60 aulas; zero desativa a respectiva etapa." /></section>
          <Feedback error={mutation.error} success={mutation.success} />
          <div className={styles.cardGrid}>
            {data.disciplines.map((discipline) => {
              const configuration = data.configurations.find((item) => item.planejamento_disciplina_id === discipline.id);
              return (
                <form className={`be-card ${styles.formCard}`} key={discipline.id} onSubmit={(event) => saveConfiguration(event, discipline.id)}>
                  <div className={styles.itemHeader}><div><h3>{discipline.disciplina_nome_snapshot}</h3><p>{configuration ? "Configuração salva" : "Ainda não configurada"}</p></div><span className={badgeClass(configuration?.ativo ? "ativo" : "inativo")}>{configuration?.ativo ? "ativa" : "inativa"}</span></div>
                  <div className={styles.form}>
                    <label className={styles.field} htmlFor={`review-first-${discipline.id}`}><span>Primeira revisão (aulas)</span><input className="be-input" id={`review-first-${discipline.id}`} name="first" type="number" min="0" max="60" defaultValue={configuration?.primeira_revisao_intervalo ?? 0} required /></label>
                    <label className={styles.field} htmlFor={`review-second-${discipline.id}`}><span>Segunda revisão (aulas)</span><input className="be-input" id={`review-second-${discipline.id}`} name="second" type="number" min="0" max="60" defaultValue={configuration?.segunda_revisao_intervalo ?? 0} required /></label>
                    <label className={`${styles.check} ${styles.fullWidth}`}><input name="active" type="checkbox" defaultChecked={configuration?.ativo ?? true} /> Configuração ativa</label>
                  </div>
                  <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>{mutation.pending === `review-config-${discipline.id}` ? "Salvando..." : "Salvar configuração"}</button>
                </form>
              );
            })}
          </div>
          <section className="be-card">
            <SectionTitle title="Revisões do aluno" description="A conclusão e o desfazimento pertencem ao aluno; o professor acompanha o estado confirmado pelo Supabase." />
            {data.reviews.length ? (
              <div className="be-table-wrap"><table className="be-table"><thead><tr><th>Aula de origem</th><th>Aula revisada</th><th>Etapa</th><th>Prevista</th><th>Situação</th></tr></thead><tbody>{data.reviews.map((review) => { const origin = data.lessons.find((lesson) => lesson.id === review.planejamento_aula_origem_id); const reviewed = data.lessons.find((lesson) => lesson.id === review.planejamento_aula_revisada_id); return <tr key={review.id}><td>{origin?.nome ?? "Aula indisponível"}</td><td>{reviewed?.nome ?? "Aula indisponível"}</td><td>{labelize(review.etapa)}</td><td>{formatDate(review.prevista_em)}</td><td><span className={badgeClass(review.status)}>{labelize(review.status)}</span></td></tr>; })}</tbody></table></div>
            ) : <StatePanel title="Nenhuma revisão" description="As revisões criadas conforme o progresso do aluno aparecerão aqui." />}
          </section>
        </div>
      )}
    </ResourceGate>
  );
}

function MissingContext() {
  return <StatePanel kind="error" title="Contexto incompleto" description="A rota não informou o aluno ou o planejamento necessário para esta operação." />;
}

export function ProfessorDomainPage({ route }: { route: ResolvedRoute }) {
  const studentId = route.params.alunoId;
  const planningId = route.params.planejamentoId;

  switch (route.pattern) {
    case "inicio":
      return <StudentDirectoryPage home />;
    case "alunos":
      return <StudentDirectoryPage />;
    case "lista-de-espera":
      return <WaitlistPage />;
    case "perfil":
      return <ProfessorProfilePage />;
    case "alunos/:alunoId/resumo":
      return studentId ? <StudentSummaryPage key={studentId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/acesso":
      return studentId ? <StudentAccessPage key={studentId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos":
      return studentId ? <PlanningListPage key={studentId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/novo":
      return studentId ? <NewPlanningPage key={studentId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/resumo":
      return studentId && planningId ? <PlanningSummaryPage key={`${studentId}-${planningId}`} planningId={planningId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/disciplinas":
      return studentId && planningId ? <PlanningDisciplinesPage key={`${studentId}-${planningId}`} planningId={planningId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/cadernos":
      return studentId && planningId ? <PlanningNotebooksPage key={`${studentId}-${planningId}`} planningId={planningId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/aulas":
      return studentId && planningId ? <PlanningLessonsPage key={`${studentId}-${planningId}`} planningId={planningId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/metas":
      return studentId && planningId ? <PlanningGoalsPage key={`${studentId}-${planningId}`} planningId={planningId} routePath={route.pathname} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/metas/gerar":
      return studentId && planningId ? <GenerateGoalsPage key={`${studentId}-${planningId}`} planningId={planningId} routePath={route.pathname} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/reforcos":
      return studentId && planningId ? <PlanningReinforcementsPage key={`${studentId}-${planningId}`} planningId={planningId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/revisoes":
      return studentId && planningId ? <PlanningReviewsPage key={`${studentId}-${planningId}`} planningId={planningId} studentId={studentId} /> : <MissingContext />;
    case "alunos/:alunoId/desempenho":
    case "alunos/:alunoId/planejamentos/:planejamentoId/desempenho":
      return <StatePanel title="Desempenho será implementado depois" description="Esta entrega mantém as rotas de desempenho sem cálculos parciais ou divergentes." />;
    default:
      return <StatePanel kind="error" title="Tela não reconhecida" description="A rota não possui uma implementação de domínio para o professor." />;
  }
}
