"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { todayInTimeZone } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows } from "@/lib/supabase/pagination";
import {
  ProfileKind,
  AccessStatus,
  LinkStatus,
  Profile,
  TeacherStudentLink,
  StudentAccess,
  WaitlistEntry,
  AuditEvent,
  PROFILE_COLUMNS,
  expectRows,
  expectRecord,
  callRpc,
  loadProfiles,
  loadLinks,
  loadAccesses,
  useRemoteData,
  useRpcAction,
  asText,
  asNumber,
  labelFor,
  dateLabel,
  dateTimeLabel,
  Status,
  Feedback,
  EmptyPanel,
  RemoteContent,
  Section,
  Field,
  SubmitButton,
  ProfileName,
  profileMap,
} from "./shared";
import styles from "../AdminDomainPage.module.css";

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
    const [profiles, links, accesses, waitlist, auditResult] = await Promise.all([
      loadProfiles(),
      loadLinks(),
      loadAccesses(),
      fetchAllRows<WaitlistEntry>((from, to) => supabase
        .from("lista_espera")
        .select("id,aluno_id,professor_id,whatsapp,area_interesse,concurso_foco,status,created_at,updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)),
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
      waitlist,
      audits: expectRows<AuditEvent>(auditResult.data, auditResult.error),
    };
  }, []);
  const remote = useRemoteData(loader);

  return (
    <RemoteContent remote={remote} skeleton="dashboard">{(data) => {
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
    <RemoteContent remote={remote} skeleton="detail">{(data) => {
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
    <RemoteContent remote={remote} skeleton="detail">{(data) => {
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

export function AdminOperationRoutes({ route }: { route: ResolvedRoute }) {
  if (route.pathname === "inicio") return <AdminHome />;
  if (route.pathname === "usuarios") return <UsersPage />;
  if (route.params.usuarioId) return <UserDetailPage key={route.params.usuarioId} userId={route.params.usuarioId} />;
  if (route.pathname === "vinculos") return <LinksPage />;
  if (route.params.vinculoId) return <LinkDetailPage key={route.params.vinculoId} linkId={route.params.vinculoId} />;
  if (route.pathname === "acessos") return <AccessesPage />;
  return <EmptyPanel title="Rota operacional não implementada">A rota solicitada não pertence à operação administrativa.</EmptyPanel>;
}
