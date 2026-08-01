"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { todayInTimeZone } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { PhoneField } from "@/components/form/PhoneField";

import styles from "./AdminDomainPage.module.css";

type ProfileKind = "admin" | "professor" | "aluno";
type AccessStatus = "pendente" | "ativo" | "bloqueado" | "expirado" | "cancelado";
type LinkStatus = "ativo" | "encerrado";
type WaitlistStatus = "aguardando" | "contatado" | "convertido" | "cancelado";
type CoursePhase = "pre_edital" | "pos_edital";
type StudyModel = "teoria_blocos" | "somente_blocos";
type SubjectMode = "blocos" | "teoria" | "ambos";
type MaterialKind = "pdf" | "video" | "link" | "outro";

type Profile = {
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

type TeacherStudentLink = {
  id: string;
  professor_id: string;
  aluno_id: string;
  status: LinkStatus;
  inicio_em: string;
  fim_em: string | null;
  created_at: string;
  updated_at: string;
};

type StudentAccess = {
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

type Course = {
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

type Subject = {
  id: string;
  codigo: string;
  nome: string;
  cor: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CourseSubject = {
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

type CatalogNotebook = {
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

type CatalogLesson = {
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

type LessonMaterial = {
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

type WaitlistEntry = {
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

type AuditEvent = {
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

type BackendError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type RemoteData<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
};

type FeedbackState = { kind: "error" | "success"; text: string } | null;

const PROFILE_COLUMNS = "id,nome,tipo,telefone,fuso_horario,ativo,created_at,updated_at,deleted_at";
const COURSE_COLUMNS = "id,codigo,nome,area,concurso_alvo,fase,modelo_estudo,metas_semanais_padrao,ativo,created_at,updated_at,deleted_at";
const SUBJECT_COLUMNS = "id,codigo,nome,cor,ativo,created_at,updated_at,deleted_at";

function backendMessage(reason: unknown) {
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

function expectRows<T>(data: unknown, error: BackendError | null): T[] {
  if (error) throw error;
  if (data === null) return [];
  if (!Array.isArray(data)) throw new Error("O Supabase retornou dados em um formato inesperado.");
  return data as T[];
}

function expectRecord<T>(data: unknown, error: BackendError | null): T | null {
  if (error) throw error;
  if (data === null) return null;
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("O Supabase retornou dados em um formato inesperado.");
  }
  return data as T;
}

async function callRpc(name: string, args: Record<string, unknown>) {
  const { error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
}

async function loadProfiles(): Promise<Profile[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("nome", { ascending: true });
  return expectRows<Profile>(data, error);
}

async function loadLinks(): Promise<TeacherStudentLink[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("professor_alunos")
    .select("id,professor_id,aluno_id,status,inicio_em,fim_em,created_at,updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return expectRows<TeacherStudentLink>(data, error);
}

async function loadAccesses(): Promise<StudentAccess[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("acessos_aluno_efetivos")
    .select("id,aluno_id,status,status_efetivo,plano,inicio_em,expira_em,bloqueado_em,motivo_bloqueio,liberado_por,created_at,updated_at")
    .order("created_at", { ascending: false });
  return expectRows<StudentAccess>(data, error);
}

async function loadCourses(): Promise<Course[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("cursos")
    .select(COURSE_COLUMNS)
    .order("nome", { ascending: true });
  return expectRows<Course>(data, error);
}

async function loadSubjects(): Promise<Subject[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("disciplinas")
    .select(SUBJECT_COLUMNS)
    .order("nome", { ascending: true });
  return expectRows<Subject>(data, error);
}

async function loadCourseSubjects(courseId: string): Promise<CourseSubject[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("curso_disciplinas")
    .select("id,curso_id,disciplina_id,modalidade,meta_padrao,peso_padrao,ordem,ativo,created_at,updated_at,deleted_at")
    .eq("curso_id", courseId)
    .order("ordem", { ascending: true });
  return expectRows<CourseSubject>(data, error);
}

function useRemoteData<T>(loader: () => Promise<T>): RemoteData<T> {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<Omit<RemoteData<T>, "reload">>({
    data: null,
    error: "",
    loading: true,
  });

  useEffect(() => {
    let active = true;
    void loader()
      .then((data) => {
        if (active) setState({ data, error: "", loading: false });
      })
      .catch((reason: unknown) => {
        if (active) setState({ data: null, error: backendMessage(reason), loading: false });
      });
    return () => {
      active = false;
    };
  }, [loader, revision]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, error: "", loading: current.data === null }));
    setRevision((current) => current + 1);
  }, []);

  return { ...state, reload };
}

function useRpcAction(onDone?: () => void) {
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

function asText(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function asNumber(form: FormData, name: string) {
  return Number(asText(form, name));
}

function optionalText(form: FormData, name: string) {
  const value = asText(form, name);
  return value || null;
}

function labelFor(value: string) {
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

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function Status({ value }: { value: string }) {
  const tone = ["ativo", "convertido", "restore"].includes(value)
    ? "success"
    : ["bloqueado", "cancelado", "soft_delete", "excluido"].includes(value)
      ? "danger"
      : ["pendente", "aguardando", "expirado"].includes(value)
        ? "warning"
        : "neutral";
  return <span className={styles.status} data-tone={tone}>{labelFor(value)}</span>;
}

function Feedback({ state }: { state: FeedbackState }) {
  if (!state) return null;
  return (
    <div className={styles.feedback} data-kind={state.kind} role={state.kind === "error" ? "alert" : "status"}>
      {state.text}
    </div>
  );
}

function LoadingPanel() {
  return <div className={styles.state} role="status"><span className={styles.spinner} aria-hidden="true" />Carregando dados do Supabase…</div>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className={styles.state} data-kind="error" role="alert">
      <div><strong>Não foi possível carregar esta tela.</strong><p>{message}</p></div>
      <button className="be-button" type="button" onClick={retry}>Tentar novamente</button>
    </div>
  );
}

function EmptyPanel({ children, title }: { children: ReactNode; title: string }) {
  return <div className={styles.empty}><strong>{title}</strong><p>{children}</p></div>;
}

function RemoteContent<T>({ children, remote }: { children: (data: T) => ReactNode; remote: RemoteData<T> }) {
  if (remote.loading) return <LoadingPanel />;
  if (remote.error) return <ErrorPanel message={remote.error} retry={remote.reload} />;
  if (!remote.data) return <ErrorPanel message="O Supabase não retornou dados para esta tela." retry={remote.reload} />;
  return children(remote.data);
}

function Section({ actions, children, description, title }: { actions?: ReactNode; children: ReactNode; description?: string; title: string }) {
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

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function SubmitButton({ busy, children = "Salvar" }: { busy: boolean; children?: ReactNode }) {
  return <button className="be-button be-button--primary" type="submit" disabled={busy}>{busy ? "Salvando…" : children}</button>;
}

function SoftDeleteControl({
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

function ProfileName({ id, profiles }: { id: string | null; profiles: Map<string, Profile> }) {
  if (!id) return <>Não atribuído</>;
  const profile = profiles.get(id);
  return <>{profile?.nome ?? id}</>;
}

function profileMap(profiles: Profile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

export function AdminDomainPage({ route }: { route: ResolvedRoute }) {
  if (route.pathname === "inicio") return <AdminHome />;
  if (route.pathname === "usuarios") return <UsersPage />;
  if (route.params.usuarioId) return <UserDetailPage key={route.params.usuarioId} userId={route.params.usuarioId} />;
  if (route.pathname === "vinculos") return <LinksPage />;
  if (route.params.vinculoId) return <LinkDetailPage key={route.params.vinculoId} linkId={route.params.vinculoId} />;
  if (route.pathname === "acessos") return <AccessesPage />;
  if (route.pathname === "catalogo/cursos") return <CoursesPage />;
  if (route.pathname === "catalogo/cursos/novo") return <NewCoursePage />;
  if (route.params.cursoId && route.pathname.endsWith("/resumo")) return <CourseSummaryPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.params.cursoId && route.pathname.endsWith("/disciplinas")) return <CourseSubjectsPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.params.cursoId && route.pathname.endsWith("/cadernos")) return <CourseNotebooksPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.params.cursoId && route.pathname.endsWith("/aulas")) return <CourseLessonsPage key={route.params.cursoId} courseId={route.params.cursoId} />;
  if (route.pathname === "catalogo/disciplinas") return <SubjectsPage />;
  if (route.params.disciplinaId) return <SubjectDetailPage key={route.params.disciplinaId} subjectId={route.params.disciplinaId} />;
  if (route.pathname === "lista-de-espera") return <AdminWaitlistPage />;
  if (route.pathname === "auditoria") return <AuditPage />;
  if (route.pathname === "perfil") return <AdminProfilePage />;
  return <EmptyPanel title="Rota administrativa não implementada">A rota solicitada não pertence ao conjunto funcional desta área.</EmptyPanel>;
}

type HomeData = {
  accesses: StudentAccess[];
  audits: AuditEvent[];
  links: TeacherStudentLink[];
  profiles: Profile[];
  waitlist: WaitlistEntry[];
};

function AdminHome() {
  const loader = useCallback(async (): Promise<HomeData> => {
    const supabase = getSupabaseBrowserClient();
    const [profiles, links, accesses, waitlistResult, auditResult] = await Promise.all([
      loadProfiles(),
      loadLinks(),
      loadAccesses(),
      supabase
        .from("lista_espera")
        .select("id,aluno_id,professor_id,whatsapp,area_interesse,concurso_foco,status,created_at,updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_events")
        .select("id,operation_id,table_name,record_id,action,actor_id,reason,before_data,after_data,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    return {
      profiles,
      links,
      accesses,
      waitlist: expectRows<WaitlistEntry>(waitlistResult.data, waitlistResult.error),
      audits: expectRows<AuditEvent>(auditResult.data, auditResult.error),
    };
  }, []);
  const remote = useRemoteData(loader);

  return (
    <RemoteContent remote={remote}>{(data) => {
      const students = data.profiles.filter((profile) => profile.tipo === "aluno" && profile.ativo && !profile.deleted_at);
      const latestAccess = new Map<string, StudentAccess>();
      for (const access of data.accesses) {
        if (!latestAccess.has(access.aluno_id)) latestAccess.set(access.aluno_id, access);
      }
      const activeAccesses = [...latestAccess.values()].filter((access) => access.status_efetivo === "ativo").length;
      const waiting = data.waitlist.filter((entry) => entry.status === "aguardando").length;
      const profiles = profileMap(data.profiles);

      return (
        <div className={styles.stack}>
          <div className={styles.metrics}>
            <Link className={styles.metric} href="/admin/usuarios"><span>Alunos ativos</span><strong>{students.length}</strong><small>Perfis acadêmicos vigentes</small></Link>
            <Link className={styles.metric} href="/admin/vinculos"><span>Vínculos ativos</span><strong>{data.links.filter((link) => link.status === "ativo").length}</strong><small>Professor e aluno</small></Link>
            <Link className={styles.metric} href="/admin/acessos"><span>Acessos liberados</span><strong>{activeAccesses}</strong><small>Estado efetivo hoje</small></Link>
            <Link className={styles.metric} href="/admin/lista-de-espera"><span>Aguardando contato</span><strong>{waiting}</strong><small>Lista de espera</small></Link>
          </div>

          <Section
            title="Operações recentes"
            description="Últimos eventos auditáveis confirmados pelo banco."
            actions={<Link className="be-button" href="/admin/auditoria">Ver auditoria</Link>}
          >
            {data.audits.length === 0 ? (
              <EmptyPanel title="Nenhuma operação registrada">Eventos administrativos aparecerão aqui após a primeira mutação.</EmptyPanel>
            ) : (
              <div className="be-table-wrap">
                <table className="be-table">
                  <thead><tr><th>Ação</th><th>Recurso</th><th>Responsável</th><th>Quando</th></tr></thead>
                  <tbody>{data.audits.map((event) => (
                    <tr key={event.id}>
                      <td><Status value={event.action} /></td>
                      <td><strong>{event.table_name}</strong><small className={styles.blockCode}>{event.record_id}</small></td>
                      <td><ProfileName id={event.actor_id} profiles={profiles} /></td>
                      <td>{dateTimeLabel(event.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      );
    }}</RemoteContent>
  );
}

function UsersPage() {
  const loader = useCallback(() => loadProfiles(), []);
  const remote = useRemoteData(loader);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"todos" | ProfileKind>("todos");
  const [activity, setActivity] = useState<"todos" | "ativos" | "inativos">("todos");

  return (
    <RemoteContent remote={remote}>{(profiles) => {
      const term = search.trim().toLocaleLowerCase("pt-BR");
      const filtered = profiles.filter((profile) => {
        const matchesTerm = !term || profile.nome.toLocaleLowerCase("pt-BR").includes(term) || profile.id.toLocaleLowerCase("pt-BR").includes(term);
        const matchesKind = kind === "todos" || profile.tipo === kind;
        const isActive = profile.ativo && !profile.deleted_at;
        const matchesActivity = activity === "todos" || (activity === "ativos" ? isActive : !isActive);
        return matchesTerm && matchesKind && matchesActivity;
      });

      return (
        <Section title="Diretório de usuários" description={`${filtered.length} de ${profiles.length} perfis visíveis pelas políticas de acesso.`}>
          <div className={styles.filters} role="search">
            <Field label="Buscar por nome ou ID">
              <input className="be-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou UUID" />
            </Field>
            <Field label="Tipo de perfil">
              <select className="be-input" value={kind} onChange={(event) => setKind(event.target.value as "todos" | ProfileKind)}>
                <option value="todos">Todos</option><option value="aluno">Alunos</option><option value="professor">Professores</option><option value="admin">Administradores</option>
              </select>
            </Field>
            <Field label="Situação">
              <select className="be-input" value={activity} onChange={(event) => setActivity(event.target.value as "todos" | "ativos" | "inativos")}>
                <option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos ou excluídos</option>
              </select>
            </Field>
          </div>

          {filtered.length === 0 ? (
            <EmptyPanel title="Nenhum usuário encontrado">Altere a busca ou os filtros para ampliar os resultados.</EmptyPanel>
          ) : (
            <div className="be-table-wrap">
              <table className="be-table">
                <thead><tr><th>Nome</th><th>Perfil</th><th>Situação</th><th>Telefone</th><th>Cadastro</th><th><span className={styles.srOnly}>Abrir</span></th></tr></thead>
                <tbody>{filtered.map((profile) => (
                  <tr key={profile.id}>
                    <td><strong>{profile.nome}</strong><small className={styles.blockCode}>{profile.id}</small></td>
                    <td><Status value={profile.tipo} /></td>
                    <td><Status value={profile.ativo && !profile.deleted_at ? "ativo" : "inativo"} /></td>
                    <td>{profile.telefone || "—"}</td>
                    <td>{dateLabel(profile.created_at)}</td>
                    <td><Link className={styles.textLink} href={`/admin/usuarios/${profile.id}`}>Detalhes</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Section>
      );
    }}</RemoteContent>
  );
}

type UserDetailData = {
  accesses: StudentAccess[];
  links: TeacherStudentLink[];
  profile: Profile | null;
  profiles: Profile[];
};

function UserDetailPage({ userId }: { userId: string }) {
  const loader = useCallback(async (): Promise<UserDetailData> => {
    const supabase = getSupabaseBrowserClient();
    const [profileResult, profiles, links, accesses] = await Promise.all([
      supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
      loadProfiles(), loadLinks(), loadAccesses(),
    ]);
    return { profile: expectRecord<Profile>(profileResult.data, profileResult.error), profiles, links, accesses };
  }, [userId]);
  const remote = useRemoteData(loader);
  const action = useRpcAction(remote.reload);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextKind = asText(form, "tipo") as ProfileKind;
    const nextActive = form.get("ativo") === "on";
    if (!window.confirm(`Confirma alterar este usuário para “${labelFor(nextKind)}” e deixá-lo ${nextActive ? "ativo" : "inativo"}?`)) return;
    await action.run(
      () => callRpc("administrar_perfil", { p_usuario_id: userId, p_tipo: nextKind, p_ativo: nextActive }),
      "Perfil administrativo atualizado e recarregado do Supabase.",
    );
  }

  return (
    <RemoteContent remote={remote}>{(data) => {
      if (!data.profile) return <EmptyPanel title="Usuário não encontrado">O registro não existe ou não está visível para sua sessão.</EmptyPanel>;
      const names = profileMap(data.profiles);
      const links = data.links.filter((link) => link.professor_id === userId || link.aluno_id === userId);
      const accesses = data.accesses.filter((access) => access.aluno_id === userId);
      return (
        <div className={styles.stack}>
          <Section title={data.profile.nome} description={data.profile.id} actions={<Status value={data.profile.ativo && !data.profile.deleted_at ? "ativo" : "inativo"} />}>
            <dl className={styles.details}>
              <div><dt>Perfil</dt><dd>{labelFor(data.profile.tipo)}</dd></div>
              <div><dt>Telefone</dt><dd>{data.profile.telefone || "Não informado"}</dd></div>
              <div><dt>Fuso horário</dt><dd>{data.profile.fuso_horario}</dd></div>
              <div><dt>Atualizado em</dt><dd>{dateTimeLabel(data.profile.updated_at)}</dd></div>
            </dl>
            <div className={styles.note}>O e-mail pertence ao Supabase Auth e não é duplicado em <code>profiles</code>; o contrato de leitura atual não o expõe nesta tela.</div>
          </Section>

          <Section title="Perfil e atividade" description="Somente administradores podem promover usuários ou alterar a atividade do perfil.">
            <form className={styles.formGrid} onSubmit={updateProfile} key={data.profile.updated_at}>
              <Field label="Tipo de perfil">
                <select className="be-input" name="tipo" defaultValue={data.profile.tipo} required>
                  <option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option>
                </select>
              </Field>
              <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={data.profile.ativo} /> Perfil ativo</label>
              <div className={styles.formActions}><SubmitButton busy={action.busy}>Confirmar alteração</SubmitButton></div>
            </form>
            <Feedback state={action.feedback} />
          </Section>

          <Section title="Vínculos" description="Histórico preservado, inclusive vínculos encerrados.">
            {links.length === 0 ? <EmptyPanel title="Sem vínculos">Nenhuma relação professor-aluno foi encontrada.</EmptyPanel> : (
              <ul className={styles.recordList}>{links.map((link) => (
                <li key={link.id}>
                  <div><strong><ProfileName id={link.professor_id} profiles={names} /> → <ProfileName id={link.aluno_id} profiles={names} /></strong><span>{dateLabel(link.inicio_em)} a {dateLabel(link.fim_em)}</span></div>
                  <Status value={link.status} />
                  <Link className={styles.textLink} href={`/admin/vinculos/${link.id}`}>Abrir</Link>
                </li>
              ))}</ul>
            )}
          </Section>

          {data.profile.tipo === "aluno" ? (
            <Section title="Histórico de acesso">
              {accesses.length === 0 ? <EmptyPanel title="Sem acesso registrado">Nenhum estado de acesso está visível para este aluno.</EmptyPanel> : (
                <ul className={styles.recordList}>{accesses.map((access) => (
                  <li key={access.id}><div><strong>{access.plano}</strong><span>{dateLabel(access.inicio_em)} a {dateLabel(access.expira_em)}</span></div><Status value={access.status_efetivo} /></li>
                ))}</ul>
              )}
              <Link className="be-button" href={`/admin/acessos?aluno=${userId}`}>Administrar acesso</Link>
            </Section>
          ) : null}
        </div>
      );
    }}</RemoteContent>
  );
}

type LinksData = { links: TeacherStudentLink[]; profiles: Profile[] };

function LinksPage() {
  const loader = useCallback(async (): Promise<LinksData> => {
    const [links, profiles] = await Promise.all([loadLinks(), loadProfiles()]);
    return { links, profiles };
  }, []);
  const remote = useRemoteData(loader);
  const action = useRpcAction(remote.reload);
  const [status, setStatus] = useState<"todos" | LinkStatus>("ativo");

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const professorId = asText(form, "professor_id");
    const studentId = asText(form, "aluno_id");
    if (!professorId || !studentId) {
      action.setFeedback({ kind: "error", text: "Selecione um professor e um aluno." });
      return;
    }
    const saved = await action.run(
      () => callRpc("vincular_professor_aluno", {
        p_professor_id: professorId,
        p_aluno_id: studentId,
        p_inicio_em: asText(form, "inicio_em"),
      }),
      "Vínculo criado e confirmado pelo Supabase.",
    );
    if (saved) formElement.reset();
  }

  return (
    <RemoteContent remote={remote}>{(data) => {
      const names = profileMap(data.profiles);
      const activeLinkedStudents = new Set(data.links.filter((link) => link.status === "ativo").map((link) => link.aluno_id));
      const teachers = data.profiles.filter((profile) => profile.tipo === "professor" && profile.ativo && !profile.deleted_at);
      const availableStudents = data.profiles.filter((profile) => profile.tipo === "aluno" && profile.ativo && !profile.deleted_at && !activeLinkedStudents.has(profile.id));
      const filtered = data.links.filter((link) => status === "todos" || link.status === status);

      return (
        <div className={styles.stack}>
          <Section title="Criar vínculo" description="Cada aluno pode ter apenas um professor ativo. Vínculos anteriores permanecem no histórico.">
            <form className={styles.formGrid} onSubmit={createLink}>
              <Field label="Professor">
                <select className="be-input" name="professor_id" required defaultValue=""><option value="" disabled>Selecione</option>{teachers.map((profile) => <option value={profile.id} key={profile.id}>{profile.nome}</option>)}</select>
              </Field>
              <Field label="Aluno sem vínculo ativo">
                <select className="be-input" name="aluno_id" required defaultValue=""><option value="" disabled>Selecione</option>{availableStudents.map((profile) => <option value={profile.id} key={profile.id}>{profile.nome}</option>)}</select>
              </Field>
              <Field label="Data de início"><input className="be-input" type="date" name="inicio_em" defaultValue={todayInTimeZone()} required /></Field>
              <div className={styles.formActions}><SubmitButton busy={action.busy}>Criar vínculo</SubmitButton></div>
            </form>
            {teachers.length === 0 ? <p className={styles.helper}>Promova ao menos um perfil ativo para professor antes de criar um vínculo.</p> : null}
            {availableStudents.length === 0 ? <p className={styles.helper}>Não há alunos ativos disponíveis sem vínculo.</p> : null}
            <Feedback state={action.feedback} />
          </Section>

          <Section title="Histórico de vínculos" description={`${filtered.length} registro(s)`} actions={
            <select className="be-input" aria-label="Filtrar situação do vínculo" value={status} onChange={(event) => setStatus(event.target.value as "todos" | LinkStatus)}>
              <option value="todos">Todos</option><option value="ativo">Ativos</option><option value="encerrado">Encerrados</option>
            </select>
          }>
            {filtered.length === 0 ? <EmptyPanel title="Nenhum vínculo">Nenhum registro corresponde ao filtro escolhido.</EmptyPanel> : (
              <div className="be-table-wrap"><table className="be-table">
                <thead><tr><th>Professor</th><th>Aluno</th><th>Situação</th><th>Período</th><th><span className={styles.srOnly}>Abrir</span></th></tr></thead>
                <tbody>{filtered.map((link) => <tr key={link.id}>
                  <td><ProfileName id={link.professor_id} profiles={names} /></td>
                  <td><ProfileName id={link.aluno_id} profiles={names} /></td>
                  <td><Status value={link.status} /></td>
                  <td>{dateLabel(link.inicio_em)} — {dateLabel(link.fim_em)}</td>
                  <td><Link className={styles.textLink} href={`/admin/vinculos/${link.id}`}>Detalhes</Link></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </Section>
        </div>
      );
    }}</RemoteContent>
  );
}

function LinkDetailPage({ linkId }: { linkId: string }) {
  const loader = useCallback(async (): Promise<{ link: TeacherStudentLink | null; profiles: Profile[] }> => {
    const [profiles, result] = await Promise.all([
      loadProfiles(),
      getSupabaseBrowserClient().from("professor_alunos").select("id,professor_id,aluno_id,status,inicio_em,fim_em,created_at,updated_at").eq("id", linkId).is("deleted_at", null).maybeSingle(),
    ]);
    return { profiles, link: expectRecord<TeacherStudentLink>(result.data, result.error) };
  }, [linkId]);
  const remote = useRemoteData(loader);
  const action = useRpcAction(remote.reload);

  async function endLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!window.confirm("Confirma o encerramento? O histórico será preservado e o professor perderá autorização para novas operações sobre este aluno.")) return;
    await action.run(
      () => callRpc("encerrar_vinculo", { p_vinculo_id: linkId, p_fim_em: asText(form, "fim_em") }),
      "Vínculo encerrado. O histórico acadêmico foi preservado.",
    );
  }

  return (
    <RemoteContent remote={remote}>{(data) => {
      if (!data.link) return <EmptyPanel title="Vínculo não encontrado">O vínculo não existe ou não está visível para esta sessão.</EmptyPanel>;
      const names = profileMap(data.profiles);
      return <div className={styles.stack}>
        <Section title="Participantes" actions={<Status value={data.link.status} />}>
          <dl className={styles.details}>
            <div><dt>Professor</dt><dd><ProfileName id={data.link.professor_id} profiles={names} /></dd></div>
            <div><dt>Aluno</dt><dd><ProfileName id={data.link.aluno_id} profiles={names} /></dd></div>
            <div><dt>Início</dt><dd>{dateLabel(data.link.inicio_em)}</dd></div>
            <div><dt>Fim</dt><dd>{dateLabel(data.link.fim_em)}</dd></div>
          </dl>
        </Section>
        {data.link.status === "ativo" ? <Section title="Encerrar vínculo" description="Esta ação retira a autorização do professor, mas não apaga planejamentos nem resultados.">
          <form className={styles.formGrid} onSubmit={endLink}>
            <Field label="Data de encerramento"><input className="be-input" type="date" name="fim_em" min={data.link.inicio_em} defaultValue={todayInTimeZone()} required /></Field>
            <div className={styles.formActions}><button className="be-button be-button--danger" type="submit" disabled={action.busy}>{action.busy ? "Encerrando…" : "Encerrar vínculo"}</button></div>
          </form>
          <Feedback state={action.feedback} />
        </Section> : null}
      </div>;
    }}</RemoteContent>
  );
}

type AccessData = { accesses: StudentAccess[]; profiles: Profile[] };

function AccessesPage() {
  const [requestedStudent] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("aluno") ?? "");
  const loader = useCallback(async (): Promise<AccessData> => {
    const [accesses, profiles] = await Promise.all([loadAccesses(), loadProfiles()]);
    return { accesses, profiles };
  }, []);
  const remote = useRemoteData(loader);
  const action = useRpcAction(remote.reload);
  const [filter, setFilter] = useState<"todos" | AccessStatus>("todos");

  async function manageAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = asText(form, "aluno_id");
    const operation = asText(form, "operacao") as "liberar" | "renovar" | "bloquear" | "cancelar";
    if (!studentId) {
      action.setFeedback({ kind: "error", text: "Selecione o aluno." });
      return;
    }
    if (["bloquear", "cancelar"].includes(operation) && !window.confirm(`Confirma ${operation} o acesso acadêmico deste aluno?`)) return;

    const months = asNumber(form, "meses");
    const withoutExpiration = form.get("sem_expiracao") === "on";
    let rpcName = "";
    let args: Record<string, unknown> = { p_aluno_id: studentId };
    let success = "Acesso atualizado e confirmado pelo Supabase.";
    if (operation === "liberar") {
      rpcName = "liberar_acesso";
      args = { ...args, p_meses: months, p_sem_expiracao: withoutExpiration, p_plano: asText(form, "plano") || "manual" };
      success = "Novo período de acesso liberado.";
    } else if (operation === "renovar") {
      rpcName = "renovar_acesso";
      args = { ...args, p_meses: months };
      success = "Acesso renovado a partir da data definida pelas regras do servidor.";
    } else if (operation === "bloquear") {
      rpcName = "bloquear_acesso";
      args = { ...args, p_motivo: asText(form, "motivo") };
      success = asText(form, "motivo") ? "Acesso bloqueado e motivo registrado." : "Acesso bloqueado.";
    } else {
      rpcName = "cancelar_acesso";
      success = "Acesso cancelado.";
    }
    await action.run(() => callRpc(rpcName, args), success);
  }

  return (
    <RemoteContent remote={remote}>{(data) => {
      const students = data.profiles.filter((profile) => profile.tipo === "aluno" && profile.ativo && !profile.deleted_at);
      const initialStudent = students.some((student) => student.id === requestedStudent) ? requestedStudent ?? "" : "";
      const names = profileMap(data.profiles);
      const latest = new Map<string, StudentAccess>();
      for (const access of data.accesses) if (!latest.has(access.aluno_id)) latest.set(access.aluno_id, access);
      const current = [...latest.values()].filter((access) => filter === "todos" || access.status_efetivo === filter);
      return <div className={styles.stack}>
        <Section title="Administrar acesso" description="Liberação comercial e planejamento acadêmico são operações independentes.">
          <form className={styles.formGrid} onSubmit={manageAccess}>
            <Field label="Aluno"><select className="be-input" name="aluno_id" required defaultValue={initialStudent} key={initialStudent || "sem-aluno"}><option value="" disabled>Selecione</option>{students.map((student) => <option value={student.id} key={student.id}>{student.nome}</option>)}</select></Field>
            <Field label="Operação"><select className="be-input" name="operacao" required defaultValue="liberar"><option value="liberar">Liberar</option><option value="renovar">Renovar</option><option value="bloquear">Bloquear</option><option value="cancelar">Cancelar</option></select></Field>
            <Field label="Meses (liberar/renovar)"><input className="be-input" type="number" min="1" max="120" name="meses" defaultValue="3" required /></Field>
            <Field label="Plano (liberar)"><input className="be-input" name="plano" defaultValue="manual" required /></Field>
            <Field label="Motivo (bloquear, opcional)"><input className="be-input" name="motivo" placeholder="Contexto opcional para o histórico" /></Field>
            <label className={styles.check}><input type="checkbox" name="sem_expiracao" /> Liberar sem expiração</label>
            <div className={styles.formActions}><SubmitButton busy={action.busy}>Executar operação</SubmitButton></div>
          </form>
          <p className={styles.helper}>Campos que não pertencem à operação escolhida são ignorados pela interface. O Supabase repete todas as validações críticas.</p>
          <Feedback state={action.feedback} />
        </Section>

        <Section title="Situação efetiva por aluno" description="A situação expirada é calculada pelo banco a partir da validade." actions={
          <select className="be-input" aria-label="Filtrar situação de acesso" value={filter} onChange={(event) => setFilter(event.target.value as "todos" | AccessStatus)}>
            <option value="todos">Todos</option><option value="pendente">Pendentes</option><option value="ativo">Ativos</option><option value="bloqueado">Bloqueados</option><option value="expirado">Expirados</option><option value="cancelado">Cancelados</option>
          </select>
        }>
          {current.length === 0 ? <EmptyPanel title="Nenhum acesso">Nenhum acesso corresponde ao filtro selecionado.</EmptyPanel> : <div className="be-table-wrap"><table className="be-table">
            <thead><tr><th>Aluno</th><th>Situação</th><th>Plano</th><th>Início</th><th>Expiração</th><th>Observação</th></tr></thead>
            <tbody>{current.map((access) => <tr key={access.id}>
              <td><ProfileName id={access.aluno_id} profiles={names} /></td><td><Status value={access.status_efetivo} /></td><td>{access.plano}</td><td>{dateLabel(access.inicio_em)}</td><td>{access.expira_em ? dateLabel(access.expira_em) : "Sem expiração"}</td><td>{access.motivo_bloqueio || "—"}</td>
            </tr>)}</tbody>
          </table></div>}
        </Section>
      </div>;
    }}</RemoteContent>
  );
}

function CourseEditor({ course, onDone }: { course?: Course; onDone: () => void }) {
  const action = useRpcAction(onDone);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weekly = asNumber(form, "metas_semanais_padrao");
    if (weekly < 1 || weekly > 100) {
      action.setFeedback({ kind: "error", text: "A quantidade semanal deve estar entre 1 e 100." });
      return;
    }
    await action.run(
      () => callRpc("salvar_curso", {
        p_id: course?.id ?? null,
        p_codigo: asText(form, "codigo"),
        p_nome: asText(form, "nome"),
        p_area: optionalText(form, "area"),
        p_concurso_alvo: optionalText(form, "concurso_alvo"),
        p_fase: asText(form, "fase") as CoursePhase,
        p_modelo_estudo: asText(form, "modelo_estudo") as StudyModel,
        p_metas_semanais_padrao: weekly,
        p_ativo: form.get("ativo") === "on",
      }),
      course ? "Curso atualizado e recarregado do catálogo." : "Curso criado no catálogo.",
    );
  }

  return (
    <form className={styles.formGrid} onSubmit={save} key={course?.updated_at ?? "new-course"}>
      <Field label="Código"><input className="be-input" name="codigo" defaultValue={course?.codigo ?? ""} required /></Field>
      <Field label="Nome"><input className="be-input" name="nome" defaultValue={course?.nome ?? ""} required /></Field>
      <Field label="Área"><input className="be-input" name="area" defaultValue={course?.area ?? ""} /></Field>
      <Field label="Concurso-alvo"><input className="be-input" name="concurso_alvo" defaultValue={course?.concurso_alvo ?? ""} /></Field>
      <Field label="Fase"><select className="be-input" name="fase" defaultValue={course?.fase ?? "pre_edital"}><option value="pre_edital">Pré-edital</option><option value="pos_edital">Pós-edital</option></select></Field>
      <Field label="Modelo de estudo"><select className="be-input" name="modelo_estudo" defaultValue={course?.modelo_estudo ?? "teoria_blocos"}><option value="teoria_blocos">Teoria e blocos</option><option value="somente_blocos">Somente blocos</option></select></Field>
      <Field label="Metas semanais padrão"><input className="be-input" name="metas_semanais_padrao" type="number" min="1" max="100" defaultValue={course?.metas_semanais_padrao ?? 24} required /></Field>
      <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={course?.ativo ?? true} /> Curso ativo</label>
      <div className={styles.formActions}><SubmitButton busy={action.busy}>{course ? "Salvar curso" : "Criar curso"}</SubmitButton></div>
      <Feedback state={action.feedback} />
    </form>
  );
}

function CoursesPage() {
  const loader = useCallback(() => loadCourses(), []);
  const remote = useRemoteData(loader);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"todos" | "ativos" | "inativos" | "excluidos">("todos");

  return <RemoteContent remote={remote}>{(courses) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = courses.filter((course) => {
      const matchesTerm = !term || [course.codigo, course.nome, course.area, course.concurso_alvo].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
      const matchesVisibility = visibility === "todos"
        || (visibility === "ativos" && course.ativo && !course.deleted_at)
        || (visibility === "inativos" && !course.ativo && !course.deleted_at)
        || (visibility === "excluidos" && Boolean(course.deleted_at));
      return matchesTerm && matchesVisibility;
    });
    return <Section title="Catálogo de cursos" description={`${filtered.length} curso(s) encontrado(s).`} actions={<Link className="be-button be-button--primary" href="/admin/catalogo/cursos/novo">Novo curso</Link>}>
      <div className={styles.filters} role="search">
        <Field label="Buscar"><input className="be-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, nome, área ou concurso" /></Field>
        <Field label="Situação"><select className="be-input" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="excluidos">Excluídos</option></select></Field>
      </div>
      {filtered.length === 0 ? <EmptyPanel title="Nenhum curso">Cadastre um curso ou altere os filtros.</EmptyPanel> : <div className={styles.cardGrid}>{filtered.map((course) => <article className={styles.catalogCard} key={course.id}>
        <div className={styles.cardTop}><span className={styles.code}>{course.codigo}</span><Status value={course.deleted_at ? "excluido" : course.ativo ? "ativo" : "inativo"} /></div>
        <h3>{course.nome}</h3><p>{course.area || "Área não informada"}{course.concurso_alvo ? ` · ${course.concurso_alvo}` : ""}</p>
        <dl className={styles.compactDetails}><div><dt>Modelo</dt><dd>{labelFor(course.modelo_estudo)}</dd></div><div><dt>Metas/semana</dt><dd>{course.metas_semanais_padrao}</dd></div></dl>
        <div className={styles.actions}><Link className="be-button" href={`/admin/catalogo/cursos/${course.id}/resumo`}>Administrar</Link><SoftDeleteControl deleted={Boolean(course.deleted_at)} id={course.id} label={course.nome} onDone={remote.reload} resource="curso" /></div>
      </article>)}</div>}
    </Section>;
  }}</RemoteContent>;
}

function NewCoursePage() {
  const [saved, setSaved] = useState(false);
  return <Section title="Dados do curso" description="O código identifica o curso nas regras e deve ser único.">
    <CourseEditor onDone={() => setSaved(true)} />
    {saved ? <div className={styles.nextStep} role="status"><strong>Curso salvo.</strong><span>Agora associe disciplinas, cadernos e aulas a partir do catálogo.</span><Link className="be-button" href="/admin/catalogo/cursos">Voltar aos cursos</Link></div> : null}
  </Section>;
}

function CourseSummaryPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().from("cursos").select(COURSE_COLUMNS).eq("id", courseId).maybeSingle();
    return expectRecord<Course>(data, error);
  }, [courseId]);
  const remote = useRemoteData(loader);
  return <RemoteContent remote={remote}>{(course) => course ? <div className={styles.stack}>
    <CourseContext course={course} current="resumo" />
    <Section title="Configuração geral" description="Alterações afetam novas configurações; planejamentos existentes mantêm seus snapshots.">
      {course.deleted_at ? <EmptyPanel title="Curso excluído">Restaure o curso para voltar a editá-lo.</EmptyPanel> : <CourseEditor course={course} onDone={remote.reload} />}
    </Section>
    <Section title="Ciclo de vida" description="A exclusão é lógica, reversível e auditável."><SoftDeleteControl deleted={Boolean(course.deleted_at)} id={course.id} label={course.nome} onDone={remote.reload} resource="curso" /></Section>
  </div> : <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível para esta sessão.</EmptyPanel>}</RemoteContent>;
}

function CourseContext({ course, current }: { course: Course; current: "resumo" | "disciplinas" | "cadernos" | "aulas" }) {
  const base = `/admin/catalogo/cursos/${course.id}`;
  return <div className={styles.context}>
    <div><span className={styles.code}>{course.codigo}</span><strong>{course.nome}</strong></div>
    <nav aria-label={`Configuração de ${course.nome}`}>
      {(["resumo", "disciplinas", "cadernos", "aulas"] as const).map((item) => <Link key={item} href={`${base}/${item}`} aria-current={current === item ? "page" : undefined}>{labelFor(item)}</Link>)}
    </nav>
  </div>;
}

function SubjectEditor({ onDone, subject }: { onDone: () => void; subject?: Subject }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const color = optionalText(form, "cor");
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      action.setFeedback({ kind: "error", text: "A cor deve usar o formato hexadecimal #RRGGBB." });
      return;
    }
    await action.run(() => callRpc("salvar_disciplina", {
      p_id: subject?.id ?? null,
      p_codigo: asText(form, "codigo"),
      p_nome: asText(form, "nome"),
      p_cor: color,
      p_ativo: form.get("ativo") === "on",
    }), subject ? "Disciplina atualizada no catálogo." : "Disciplina criada no catálogo.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={subject?.updated_at ?? "new-subject"}>
    <Field label="Código"><input className="be-input" name="codigo" defaultValue={subject?.codigo ?? ""} required /></Field>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={subject?.nome ?? ""} required /></Field>
    <Field label="Cor hexadecimal (opcional)"><input className="be-input" name="cor" defaultValue={subject?.cor ?? ""} placeholder="#1A56DB" pattern="#[0-9A-Fa-f]{6}" /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={subject?.ativo ?? true} /> Disciplina ativa</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{subject ? "Salvar disciplina" : "Criar disciplina"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

function SubjectsPage() {
  const loader = useCallback(() => loadSubjects(), []);
  const remote = useRemoteData(loader);
  const [search, setSearch] = useState("");
  return <RemoteContent remote={remote}>{(subjects) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = subjects.filter((subject) => !term || subject.nome.toLocaleLowerCase("pt-BR").includes(term) || subject.codigo.toLocaleLowerCase("pt-BR").includes(term));
    return <div className={styles.stack}>
      <Section title="Nova disciplina" description="Disciplinas globais podem ser associadas a vários cursos."><SubjectEditor onDone={remote.reload} /></Section>
      <Section title="Disciplinas globais" description={`${filtered.length} registro(s)`}>
        <div className={styles.filters} role="search"><Field label="Buscar"><input className="be-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código ou nome" /></Field></div>
        {filtered.length === 0 ? <EmptyPanel title="Nenhuma disciplina">Crie a primeira disciplina ou altere a busca.</EmptyPanel> : <div className="be-table-wrap"><table className="be-table"><thead><tr><th>Disciplina</th><th>Cor</th><th>Situação</th><th><span className={styles.srOnly}>Abrir</span></th></tr></thead><tbody>{filtered.map((subject) => <tr key={subject.id}>
          <td><strong>{subject.nome}</strong><small className={styles.blockCode}>{subject.codigo}</small></td>
          <td><span className={styles.color} style={{ backgroundColor: subject.cor ?? "var(--color-border-strong)" }} aria-label={subject.cor ?? "Cor padrão"} /> {subject.cor || "Padrão"}</td>
          <td><Status value={subject.deleted_at ? "excluido" : subject.ativo ? "ativo" : "inativo"} /></td>
          <td><Link className={styles.textLink} href={`/admin/catalogo/disciplinas/${subject.id}`}>Detalhes</Link></td>
        </tr>)}</tbody></table></div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function SubjectDetailPage({ subjectId }: { subjectId: string }) {
  const loader = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().from("disciplinas").select(SUBJECT_COLUMNS).eq("id", subjectId).maybeSingle();
    return expectRecord<Subject>(data, error);
  }, [subjectId]);
  const remote = useRemoteData(loader);
  return <RemoteContent remote={remote}>{(subject) => subject ? <div className={styles.stack}>
    <Section title={subject.nome} description={`Código ${subject.codigo}`} actions={<Status value={subject.deleted_at ? "excluido" : subject.ativo ? "ativo" : "inativo"} />}>
      {subject.deleted_at ? <EmptyPanel title="Disciplina excluída">Restaure o registro para voltar a editá-lo.</EmptyPanel> : <SubjectEditor subject={subject} onDone={remote.reload} />}
    </Section>
    <Section title="Ciclo de vida" description="A exclusão lógica preserva associações e histórico."><SoftDeleteControl deleted={Boolean(subject.deleted_at)} id={subject.id} label={subject.nome} onDone={remote.reload} resource="disciplina" /></Section>
  </div> : <EmptyPanel title="Disciplina não encontrada">O registro não existe ou não está visível.</EmptyPanel>}</RemoteContent>;
}

function CourseSubjectEditor({ courseId, item, onDone, subjects }: { courseId: string; item?: CourseSubject; onDone: () => void; subjects: Subject[] }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const meta = asNumber(form, "meta_padrao");
    const weight = asNumber(form, "peso_padrao");
    const order = asNumber(form, "ordem");
    if (meta < 0 || meta > 100 || weight <= 0 || order < 0) {
      action.setFeedback({ kind: "error", text: "Use meta de 0 a 100, peso maior que zero e ordem não negativa." });
      return;
    }
    await action.run(() => callRpc("salvar_curso_disciplina", {
      p_id: item?.id ?? null,
      p_curso_id: courseId,
      p_disciplina_id: asText(form, "disciplina_id"),
      p_modalidade: asText(form, "modalidade") as SubjectMode,
      p_meta_padrao: meta,
      p_peso_padrao: weight,
      p_ordem: order,
      p_ativo: form.get("ativo") === "on",
    }), item ? "Associação atualizada." : "Disciplina associada ao curso.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? "new-course-subject"}>
    <Field label="Disciplina"><select className="be-input" name="disciplina_id" defaultValue={item?.disciplina_id ?? ""} required><option value="" disabled>Selecione</option>{subjects.filter((subject) => !subject.deleted_at).map((subject) => <option key={subject.id} value={subject.id}>{subject.nome} ({subject.codigo})</option>)}</select></Field>
    <Field label="Modalidade"><select className="be-input" name="modalidade" defaultValue={item?.modalidade ?? "blocos"}><option value="blocos">Blocos</option><option value="teoria">Teoria</option><option value="ambos">Ambos</option></select></Field>
    <Field label="Meta padrão (%)"><input className="be-input" name="meta_padrao" type="number" step="0.01" min="0" max="100" defaultValue={item?.meta_padrao ?? 80} required /></Field>
    <Field label="Peso"><input className="be-input" name="peso_padrao" type="number" step="0.01" min="0.01" defaultValue={item?.peso_padrao ?? 1} required /></Field>
    <Field label="Ordem"><input className="be-input" name="ordem" type="number" min="0" defaultValue={item?.ordem ?? 0} required /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={item?.ativo ?? true} /> Associação ativa</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar associação" : "Associar disciplina"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

type CourseSubjectData = { course: Course | null; items: CourseSubject[]; subjects: Subject[] };

function CourseSubjectsPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async (): Promise<CourseSubjectData> => {
    const [courses, subjects, items] = await Promise.all([loadCourses(), loadSubjects(), loadCourseSubjects(courseId)]);
    return { course: courses.find((course) => course.id === courseId) ?? null, subjects, items };
  }, [courseId]);
  const remote = useRemoteData(loader);
  return <RemoteContent remote={remote}>{(data) => {
    if (!data.course) return <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível.</EmptyPanel>;
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const alreadyLinked = new Set(data.items.filter((item) => !item.deleted_at).map((item) => item.disciplina_id));
    const selectable = data.subjects.filter((subject) => !alreadyLinked.has(subject.id));
    return <div className={styles.stack}>
      <CourseContext course={data.course} current="disciplinas" />
      <Section title="Associar disciplina" description="A modalidade, meta e peso serão usados como padrão em novos planejamentos.">
        {selectable.length === 0 ? <EmptyPanel title="Sem disciplinas disponíveis">Todas as disciplinas vigentes já estão associadas. Crie outra disciplina global ou restaure uma associação.</EmptyPanel> : <CourseSubjectEditor courseId={courseId} subjects={selectable} onDone={remote.reload} />}
      </Section>
      <Section title="Disciplinas do curso" description={`${data.items.length} associação(ões), incluindo o histórico excluído.`}>
        {data.items.length === 0 ? <EmptyPanel title="Nenhuma disciplina associada">Use o formulário acima para montar o curso.</EmptyPanel> : <div className={styles.recordCards}>{data.items.map((item) => {
          const subject = subjects.get(item.disciplina_id);
          return <article className={styles.recordCard} key={item.id}>
            <div className={styles.recordHeader}><div><span className={styles.code}>Ordem {item.ordem}</span><h3>{subject?.nome ?? item.disciplina_id}</h3></div><Status value={item.deleted_at ? "excluido" : item.ativo ? "ativo" : "inativo"} /></div>
            <dl className={styles.compactDetails}><div><dt>Modalidade</dt><dd>{labelFor(item.modalidade)}</dd></div><div><dt>Meta</dt><dd>{item.meta_padrao}%</dd></div><div><dt>Peso</dt><dd>{item.peso_padrao}</dd></div></dl>
            {!item.deleted_at ? <details className={styles.detailsPanel}><summary>Editar configuração</summary><CourseSubjectEditor courseId={courseId} item={item} subjects={data.subjects} onDone={remote.reload} /></details> : null}
            <SoftDeleteControl deleted={Boolean(item.deleted_at)} id={item.id} label={subject?.nome ?? item.id} onDone={remote.reload} resource="curso_disciplina" />
          </article>;
        })}</div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function NotebookEditor({ courseSubjectId, item, onDone }: { courseSubjectId: string; item?: CatalogNotebook; onDone: () => void }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const total = asNumber(form, "total_questoes");
    const order = asNumber(form, "ordem");
    if (total < 0 || order < 0) {
      action.setFeedback({ kind: "error", text: "Total de questões e ordem não podem ser negativos." });
      return;
    }
    await action.run(() => callRpc("salvar_caderno_catalogo", {
      p_id: item?.id ?? null,
      p_curso_disciplina_id: courseSubjectId,
      p_nome: asText(form, "nome"),
      p_link_tec: optionalText(form, "link_tec"),
      p_total_questoes: total,
      p_ordem: order,
      p_ativo: form.get("ativo") === "on",
    }), item ? "Caderno atualizado." : "Caderno adicionado ao catálogo.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? courseSubjectId}>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={item?.nome ?? ""} required /></Field>
    <Field label="Link TEC"><input className="be-input" name="link_tec" type="url" defaultValue={item?.link_tec ?? ""} placeholder="https://…" /></Field>
    <Field label="Total de questões"><input className="be-input" name="total_questoes" type="number" min="0" defaultValue={item?.total_questoes ?? 0} required /></Field>
    <Field label="Ordem"><input className="be-input" name="ordem" type="number" min="0" defaultValue={item?.ordem ?? 0} required /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={item?.ativo ?? true} /> Caderno ativo</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar caderno" : "Adicionar caderno"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

type NotebooksData = { course: Course | null; items: CatalogNotebook[]; links: CourseSubject[]; subjects: Subject[] };

function CourseNotebooksPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async (): Promise<NotebooksData> => {
    const [courses, subjects, links] = await Promise.all([loadCourses(), loadSubjects(), loadCourseSubjects(courseId)]);
    const linkIds = links.map((item) => item.id);
    let items: CatalogNotebook[] = [];
    if (linkIds.length > 0) {
      const { data, error } = await getSupabaseBrowserClient().from("cadernos_catalogo").select("id,curso_disciplina_id,nome,link_tec,total_questoes,ordem,ativo,created_at,updated_at,deleted_at").in("curso_disciplina_id", linkIds).order("ordem", { ascending: true });
      items = expectRows<CatalogNotebook>(data, error);
    }
    return { course: courses.find((course) => course.id === courseId) ?? null, subjects, links, items };
  }, [courseId]);
  const remote = useRemoteData(loader);
  const [selectedLink, setSelectedLink] = useState("");

  return <RemoteContent remote={remote}>{(data) => {
    if (!data.course) return <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível.</EmptyPanel>;
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const links = new Map(data.links.map((link) => [link.id, link]));
    const eligibleLinks = data.links.filter((link) => !link.deleted_at);
    const effectiveSelected = eligibleLinks.some((link) => link.id === selectedLink) ? selectedLink : eligibleLinks[0]?.id ?? "";
    return <div className={styles.stack}>
      <CourseContext course={data.course} current="cadernos" />
      <Section title="Adicionar caderno" description="O caderno pertence a uma disciplina já associada ao curso.">
        {eligibleLinks.length === 0 ? <EmptyPanel title="Associe uma disciplina primeiro">Cadernos exigem uma disciplina vigente no curso.</EmptyPanel> : <>
          <Field label="Disciplina do curso"><select className="be-input" value={effectiveSelected} onChange={(event) => setSelectedLink(event.target.value)}>{eligibleLinks.map((link) => <option key={link.id} value={link.id}>{subjects.get(link.disciplina_id)?.nome ?? link.disciplina_id}</option>)}</select></Field>
          <NotebookEditor courseSubjectId={effectiveSelected} onDone={remote.reload} />
        </>}
      </Section>
      <Section title="Cadernos do curso" description={`${data.items.length} registro(s), incluindo histórico excluído.`}>
        {data.items.length === 0 ? <EmptyPanel title="Nenhum caderno">Adicione o primeiro caderno do catálogo.</EmptyPanel> : <div className={styles.recordCards}>{data.items.map((item) => {
          const link = links.get(item.curso_disciplina_id);
          const subject = link ? subjects.get(link.disciplina_id) : null;
          return <article className={styles.recordCard} key={item.id}>
            <div className={styles.recordHeader}><div><span className={styles.code}>{subject?.nome ?? "Disciplina"} · ordem {item.ordem}</span><h3>{item.nome}</h3></div><Status value={item.deleted_at ? "excluido" : item.ativo ? "ativo" : "inativo"} /></div>
            <p>{item.total_questoes} questões {item.link_tec ? <>· <a className={styles.textLink} href={item.link_tec} target="_blank" rel="noreferrer">Abrir TEC</a></> : null}</p>
            {!item.deleted_at ? <details className={styles.detailsPanel}><summary>Editar caderno</summary><NotebookEditor courseSubjectId={item.curso_disciplina_id} item={item} onDone={remote.reload} /></details> : null}
            <SoftDeleteControl deleted={Boolean(item.deleted_at)} id={item.id} label={item.nome} onDone={remote.reload} resource="caderno_catalogo" />
          </article>;
        })}</div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function LessonEditor({ courseSubjectId, item, onDone }: { courseSubjectId: string; item?: CatalogLesson; onDone: () => void }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const total = asNumber(form, "total_questoes");
    const order = asNumber(form, "ordem");
    if (total < 0 || order < 0) {
      action.setFeedback({ kind: "error", text: "Total de questões e ordem não podem ser negativos." });
      return;
    }
    await action.run(() => callRpc("salvar_aula_catalogo", {
      p_id: item?.id ?? null,
      p_curso_disciplina_id: courseSubjectId,
      p_nome: asText(form, "nome"),
      p_ordem: order,
      p_link_tec: optionalText(form, "link_tec"),
      p_total_questoes: total,
      p_ativo: form.get("ativo") === "on",
    }), item ? "Aula atualizada." : "Aula adicionada ao catálogo.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? courseSubjectId}>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={item?.nome ?? ""} required /></Field>
    <Field label="Link TEC"><input className="be-input" name="link_tec" type="url" defaultValue={item?.link_tec ?? ""} placeholder="https://…" /></Field>
    <Field label="Total de questões"><input className="be-input" name="total_questoes" type="number" min="0" defaultValue={item?.total_questoes ?? 0} required /></Field>
    <Field label="Ordem"><input className="be-input" name="ordem" type="number" min="0" defaultValue={item?.ordem ?? 0} required /></Field>
    <label className={styles.check}><input name="ativo" type="checkbox" defaultChecked={item?.ativo ?? true} /> Aula ativa</label>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar aula" : "Adicionar aula"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

function MaterialEditor({ item, lessonId, onDone }: { item?: LessonMaterial; lessonId: string; onDone: () => void }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = asText(form, "tipo") as MaterialKind;
    const url = optionalText(form, "url");
    if (kind !== "outro" && !url) {
      action.setFeedback({ kind: "error", text: "Informe a URL para materiais PDF, vídeo ou link." });
      return;
    }
    await action.run(() => callRpc("salvar_material_aula", {
      p_id: item?.id ?? null,
      p_aula_id: lessonId,
      p_tipo: kind,
      p_nome: asText(form, "nome"),
      p_url: url,
      p_ordem: asNumber(form, "ordem"),
    }), item ? "Material atualizado." : "Material adicionado à aula.");
  }
  return <form className={styles.formGrid} onSubmit={save} key={item?.updated_at ?? `${lessonId}-new-material`}>
    <Field label="Tipo"><select className="be-input" name="tipo" defaultValue={item?.tipo ?? "pdf"}><option value="pdf">PDF</option><option value="video">Vídeo</option><option value="link">Link</option><option value="outro">Outro</option></select></Field>
    <Field label="Nome"><input className="be-input" name="nome" defaultValue={item?.nome ?? ""} required /></Field>
    <Field label="URL"><input className="be-input" type="url" name="url" defaultValue={item?.url ?? ""} placeholder="Obrigatória, exceto para Outro" /></Field>
    <Field label="Ordem"><input className="be-input" type="number" min="0" name="ordem" defaultValue={item?.ordem ?? 0} required /></Field>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>{item ? "Salvar material" : "Adicionar material"}</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

type LessonsData = {
  course: Course | null;
  lessons: CatalogLesson[];
  links: CourseSubject[];
  materials: LessonMaterial[];
  subjects: Subject[];
};

function CourseLessonsPage({ courseId }: { courseId: string }) {
  const loader = useCallback(async (): Promise<LessonsData> => {
    const [courses, subjects, links] = await Promise.all([loadCourses(), loadSubjects(), loadCourseSubjects(courseId)]);
    const linkIds = links.map((item) => item.id);
    let lessons: CatalogLesson[] = [];
    let materials: LessonMaterial[] = [];
    if (linkIds.length > 0) {
      const lessonResult = await getSupabaseBrowserClient().from("aulas_catalogo").select("id,curso_disciplina_id,nome,ordem,link_tec,total_questoes,ativo,created_at,updated_at,deleted_at").in("curso_disciplina_id", linkIds).order("ordem", { ascending: true });
      lessons = expectRows<CatalogLesson>(lessonResult.data, lessonResult.error);
      const lessonIds = lessons.map((lesson) => lesson.id);
      if (lessonIds.length > 0) {
        const materialResult = await getSupabaseBrowserClient().from("materiais_aula").select("id,aula_id,tipo,nome,url,ordem,created_at,updated_at,deleted_at").in("aula_id", lessonIds).order("ordem", { ascending: true });
        materials = expectRows<LessonMaterial>(materialResult.data, materialResult.error);
      }
    }
    return { course: courses.find((course) => course.id === courseId) ?? null, subjects, links, lessons, materials };
  }, [courseId]);
  const remote = useRemoteData(loader);
  const [selectedLink, setSelectedLink] = useState("");

  return <RemoteContent remote={remote}>{(data) => {
    if (!data.course) return <EmptyPanel title="Curso não encontrado">O curso não existe ou não está visível.</EmptyPanel>;
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const links = new Map(data.links.map((link) => [link.id, link]));
    const eligibleLinks = data.links.filter((link) => !link.deleted_at);
    const effectiveSelected = eligibleLinks.some((link) => link.id === selectedLink) ? selectedLink : eligibleLinks[0]?.id ?? "";
    const materialsByLesson = new Map<string, LessonMaterial[]>();
    for (const material of data.materials) {
      const current = materialsByLesson.get(material.aula_id) ?? [];
      current.push(material);
      materialsByLesson.set(material.aula_id, current);
    }

    return <div className={styles.stack}>
      <CourseContext course={data.course} current="aulas" />
      <Section title="Adicionar aula" description="A aula pertence a uma disciplina do curso e pode possuir vários materiais ordenados.">
        {eligibleLinks.length === 0 ? <EmptyPanel title="Associe uma disciplina primeiro">Aulas exigem uma disciplina vigente no curso.</EmptyPanel> : <>
          <Field label="Disciplina do curso"><select className="be-input" value={effectiveSelected} onChange={(event) => setSelectedLink(event.target.value)}>{eligibleLinks.map((link) => <option key={link.id} value={link.id}>{subjects.get(link.disciplina_id)?.nome ?? link.disciplina_id}</option>)}</select></Field>
          <LessonEditor courseSubjectId={effectiveSelected} onDone={remote.reload} />
        </>}
      </Section>

      <Section title="Aulas e materiais" description={`${data.lessons.length} aula(s) no catálogo.`}>
        {data.lessons.length === 0 ? <EmptyPanel title="Nenhuma aula">Adicione a primeira aula do curso.</EmptyPanel> : <div className={styles.recordCards}>{data.lessons.map((lesson) => {
          const link = links.get(lesson.curso_disciplina_id);
          const subject = link ? subjects.get(link.disciplina_id) : null;
          const materials = materialsByLesson.get(lesson.id) ?? [];
          return <article className={styles.recordCard} key={lesson.id}>
            <div className={styles.recordHeader}><div><span className={styles.code}>{subject?.nome ?? "Disciplina"} · ordem {lesson.ordem}</span><h3>{lesson.nome}</h3></div><Status value={lesson.deleted_at ? "excluido" : lesson.ativo ? "ativo" : "inativo"} /></div>
            <p>{lesson.total_questoes} questões {lesson.link_tec ? <>· <a className={styles.textLink} href={lesson.link_tec} target="_blank" rel="noreferrer">Abrir TEC</a></> : null}</p>
            {!lesson.deleted_at ? <details className={styles.detailsPanel}><summary>Editar aula</summary><LessonEditor courseSubjectId={lesson.curso_disciplina_id} item={lesson} onDone={remote.reload} /></details> : null}

            <div className={styles.subsection}>
              <h4>Materiais</h4>
              {materials.length === 0 ? <p className={styles.helper}>Nenhum material adicionado.</p> : <ul className={styles.materials}>{materials.map((material) => <li key={material.id}>
                <div><Status value={material.tipo} /><strong>{material.nome}</strong>{material.url ? <a className={styles.textLink} href={material.url} target="_blank" rel="noreferrer">Abrir</a> : null}</div>
                {!material.deleted_at ? <details className={styles.detailsPanel}><summary>Editar</summary><MaterialEditor item={material} lessonId={lesson.id} onDone={remote.reload} /></details> : <Status value="excluido" />}
                <SoftDeleteControl deleted={Boolean(material.deleted_at)} id={material.id} label={material.nome} onDone={remote.reload} resource="material_aula" />
              </li>)}</ul>}
              {!lesson.deleted_at ? <details className={styles.detailsPanel}><summary>Adicionar material</summary><MaterialEditor lessonId={lesson.id} onDone={remote.reload} /></details> : null}
            </div>
            <SoftDeleteControl deleted={Boolean(lesson.deleted_at)} id={lesson.id} label={lesson.nome} onDone={remote.reload} resource="aula_catalogo" />
          </article>;
        })}</div>}
      </Section>
    </div>;
  }}</RemoteContent>;
}

function WaitlistEditor({ entry, onDone, profiles }: { entry: WaitlistEntry; onDone: () => void; profiles: Profile[] }) {
  const action = useRpcAction(onDone);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(() => callRpc("administrar_lista_espera", {
      p_lista_id: entry.id,
      p_status: asText(form, "status") as WaitlistStatus,
      p_professor_id: optionalText(form, "professor_id"),
    }), "Atendimento atualizado e recarregado do Supabase.");
  }
  const teachers = profiles.filter((profile) => profile.tipo === "professor" && profile.ativo && !profile.deleted_at);
  return <form className={styles.formGrid} onSubmit={save} key={entry.updated_at}>
    <Field label="Situação"><select className="be-input" name="status" defaultValue={entry.status}><option value="aguardando">Aguardando</option><option value="contatado">Contatado</option><option value="convertido">Convertido</option><option value="cancelado">Cancelado</option></select></Field>
    <Field label="Professor responsável"><select className="be-input" name="professor_id" defaultValue={entry.professor_id ?? ""}><option value="">Manter sem atribuição</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.nome}</option>)}</select></Field>
    <div className={styles.formActions}><SubmitButton busy={action.busy}>Atualizar atendimento</SubmitButton></div>
    <Feedback state={action.feedback} />
  </form>;
}

function AdminWaitlistPage() {
  const loader = useCallback(async (): Promise<{ entries: WaitlistEntry[]; profiles: Profile[] }> => {
    const [profiles, result] = await Promise.all([
      loadProfiles(),
      getSupabaseBrowserClient().from("lista_espera").select("id,aluno_id,professor_id,whatsapp,area_interesse,concurso_foco,status,created_at,updated_at").is("deleted_at", null).order("created_at", { ascending: false }),
    ]);
    return { profiles, entries: expectRows<WaitlistEntry>(result.data, result.error) };
  }, []);
  const remote = useRemoteData(loader);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"todos" | WaitlistStatus>("todos");

  return <RemoteContent remote={remote}>{(data) => {
    const names = profileMap(data.profiles);
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = data.entries.filter((entry) => {
      const student = names.get(entry.aluno_id);
      const matchTerm = !term || [student?.nome, entry.whatsapp, entry.area_interesse, entry.concurso_foco].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
      return matchTerm && (status === "todos" || entry.status === status);
    });
    return <Section title="Atendimento da lista de espera" description="A conversão não libera acesso, não cria vínculo e não cria planejamento automaticamente.">
      <div className={styles.filters} role="search">
        <Field label="Buscar"><input className="be-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aluno, WhatsApp, área ou concurso" /></Field>
        <Field label="Situação"><select className="be-input" value={status} onChange={(event) => setStatus(event.target.value as "todos" | WaitlistStatus)}><option value="todos">Todas</option><option value="aguardando">Aguardando</option><option value="contatado">Contatado</option><option value="convertido">Convertido</option><option value="cancelado">Cancelado</option></select></Field>
      </div>
      {filtered.length === 0 ? <EmptyPanel title="Nenhum registro">Nenhum atendimento corresponde aos filtros.</EmptyPanel> : <div className={styles.recordCards}>{filtered.map((entry) => <article className={styles.recordCard} key={entry.id}>
        <div className={styles.recordHeader}><div><span className={styles.code}>{dateLabel(entry.created_at)}</span><h3><ProfileName id={entry.aluno_id} profiles={names} /></h3></div><Status value={entry.status} /></div>
        <dl className={styles.compactDetails}><div><dt>WhatsApp</dt><dd>{entry.whatsapp}</dd></div><div><dt>Área</dt><dd>{entry.area_interesse}</dd></div><div><dt>Concurso</dt><dd>{entry.concurso_foco}</dd></div><div><dt>Professor</dt><dd><ProfileName id={entry.professor_id} profiles={names} /></dd></div></dl>
        <details className={styles.detailsPanel}><summary>Administrar atendimento</summary><WaitlistEditor entry={entry} profiles={data.profiles} onDone={remote.reload} /></details>
      </article>)}</div>}
    </Section>;
  }}</RemoteContent>;
}

function jsonText(value: unknown) {
  if (value === null || value === undefined) return "Sem dados";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Não foi possível apresentar este estado.";
  }
}

function AuditPage() {
  const loader = useCallback(async (): Promise<{ events: AuditEvent[]; profiles: Profile[] }> => {
    const [profiles, result] = await Promise.all([
      loadProfiles(),
      getSupabaseBrowserClient().from("audit_events").select("id,operation_id,table_name,record_id,action,actor_id,reason,before_data,after_data,created_at").order("created_at", { ascending: false }).limit(250),
    ]);
    return { profiles, events: expectRows<AuditEvent>(result.data, result.error) };
  }, []);
  const remote = useRemoteData(loader);
  const [term, setTerm] = useState("");
  const [actor, setActor] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [table, setTable] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return <RemoteContent remote={remote}>{(data) => {
    const names = profileMap(data.profiles);
    const tables = [...new Set(data.events.map((event) => event.table_name))].sort();
    const normalizedTerm = term.trim().toLocaleLowerCase("pt-BR");
    const filtered = data.events.filter((event) => {
      const searchable = [event.id, event.operation_id, event.record_id, event.reason, names.get(event.actor_id ?? "")?.nome].join(" ").toLocaleLowerCase("pt-BR");
      const day = event.created_at.slice(0, 10);
      return (!normalizedTerm || searchable.includes(normalizedTerm))
        && (!actor || event.actor_id === actor)
        && (!actionFilter || event.action === actionFilter)
        && (!table || event.table_name === table)
        && (!from || day >= from)
        && (!to || day <= to);
    });
    return <Section title="Trilha de auditoria" description={`Exibindo ${filtered.length} de até ${data.events.length} eventos mais recentes.`} actions={<button className="be-button" type="button" onClick={remote.reload}>Atualizar</button>}>
      <div className={styles.filtersWide} role="search">
        <Field label="ID, operação, registro, motivo ou ator"><input className="be-input" type="search" value={term} onChange={(event) => setTerm(event.target.value)} /></Field>
        <Field label="Ator"><select className="be-input" value={actor} onChange={(event) => setActor(event.target.value)}><option value="">Todos</option>{data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.nome}</option>)}</select></Field>
        <Field label="Recurso"><select className="be-input" value={table} onChange={(event) => setTable(event.target.value)}><option value="">Todos</option>{tables.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
        <Field label="Ação"><select className="be-input" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="">Todas</option><option value="insert">Criação</option><option value="update">Atualização</option><option value="soft_delete">Exclusão lógica</option><option value="restore">Restauração</option></select></Field>
        <Field label="De"><input className="be-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="Até"><input className="be-input" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></Field>
      </div>
      {filtered.length === 0 ? <EmptyPanel title="Nenhum evento">Altere os filtros ou execute uma operação administrativa auditável.</EmptyPanel> : <div className={styles.auditList}>{filtered.map((event) => <article className={styles.auditCard} key={event.id}>
        <div className={styles.auditHeader}><div><Status value={event.action} /><strong>{event.table_name}</strong><span>{dateTimeLabel(event.created_at)}</span></div><ProfileName id={event.actor_id} profiles={names} /></div>
        <dl className={styles.auditMeta}><div><dt>Registro</dt><dd>{event.record_id}</dd></div><div><dt>Operação</dt><dd>{event.operation_id}</dd></div>{event.reason ? <div><dt>Motivo</dt><dd>{event.reason}</dd></div> : null}</dl>
        <details className={styles.detailsPanel}><summary>Comparar estado anterior e posterior</summary><div className={styles.jsonGrid}><div><h4>Antes</h4><pre>{jsonText(event.before_data)}</pre></div><div><h4>Depois</h4><pre>{jsonText(event.after_data)}</pre></div></div></details>
      </article>)}</div>}
    </Section>;
  }}</RemoteContent>;
}

function AdminProfilePage() {
  const loader = useCallback(async (): Promise<{ email: string; profile: Profile | null }> => {
    const supabase = getSupabaseBrowserClient();
    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw authResult.error;
    if (!authResult.data.user) return { email: "", profile: null };
    const profileResult = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", authResult.data.user.id).maybeSingle();
    return { email: authResult.data.user.email ?? "", profile: expectRecord<Profile>(profileResult.data, profileResult.error) };
  }, []);
  const remote = useRemoteData(loader);
  const action = useRpcAction(remote.reload);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = asText(form, "nome");
    if (name.length < 2) {
      action.setFeedback({ kind: "error", text: "O nome deve possuir ao menos dois caracteres." });
      return;
    }
    await action.run(() => callRpc("atualizar_meu_perfil", {
      p_nome: name,
      p_telefone: optionalText(form, "telefone"),
      p_fuso_horario: asText(form, "fuso_horario") || "America/Sao_Paulo",
    }), "Seu perfil foi atualizado e recarregado do Supabase.");
  }

  return <RemoteContent remote={remote}>{(data) => data.profile ? <Section title="Dados da conta" description="Nome, telefone e fuso são mantidos no perfil; o e-mail vem do Supabase Auth.">
    <form className={styles.formGrid} onSubmit={save} key={data.profile.updated_at}>
      <Field label="Nome"><input className="be-input" name="nome" minLength={2} defaultValue={data.profile.nome} required autoComplete="name" /></Field>
      <Field label="E-mail"><input className="be-input" value={data.email} readOnly disabled /></Field>
      <Field label="Telefone"><PhoneField name="telefone" defaultValue={data.profile.telefone} /></Field>
      <Field label="Fuso horário"><input className="be-input" name="fuso_horario" defaultValue={data.profile.fuso_horario} required list="admin-timezones" /><datalist id="admin-timezones"><option value="America/Sao_Paulo" /><option value="America/Manaus" /><option value="America/Recife" /><option value="America/Fortaleza" /><option value="America/Rio_Branco" /></datalist></Field>
      <div className={styles.formActions}><SubmitButton busy={action.busy}>Salvar perfil</SubmitButton></div>
      <Feedback state={action.feedback} />
    </form>
  </Section> : <EmptyPanel title="Perfil não encontrado">A sessão existe, mas o perfil não está disponível pelas políticas atuais.</EmptyPanel>}</RemoteContent>;
}
