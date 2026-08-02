"use client";

import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows } from "@/lib/supabase/pagination";
import {
  WaitlistStatus,
  Profile,
  WaitlistEntry,
  AuditEvent,
  expectRows,
  callRpc,
  loadProfiles,
  useRemoteData,
  useRpcAction,
  asText,
  optionalText,
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
    const supabase = getSupabaseBrowserClient();
    const [profiles, entries] = await Promise.all([
      loadProfiles(),
      fetchAllRows<WaitlistEntry>((from, to) => supabase
        .from("lista_espera")
        .select("id,aluno_id,professor_id,whatsapp,area_interesse,concurso_foco,status,created_at,updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)),
    ]);
    return { profiles, entries };
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

export function AdminAccountRoutes({ route }: { route: ResolvedRoute }) {
  if (route.pathname === "lista-de-espera") return <AdminWaitlistPage />;
  if (route.pathname === "auditoria") return <AuditPage />;
  return <EmptyPanel title="Rota administrativa não implementada">A rota solicitada não pertence à operação administrativa.</EmptyPanel>;
}
