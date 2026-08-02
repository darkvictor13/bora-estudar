"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows, fetchAllRowsInBatches } from "@/lib/supabase/pagination";
import {
  Profile,
  WaitlistEntry,
  callRpc,
  useResource,
  useMutationFeedback,
  Feedback,
  StatePanel,
  ResourceGate,
  formText,
  formatDate,
  labelize,
  badgeClass,
  loadStudentDirectory,
  SectionTitle,
  Metric,
} from "./shared";
import styles from "../ProfessorDomainPage.module.css";

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
    const entries = await fetchAllRows<WaitlistEntry>((from, to) => supabase
      .from("lista_espera")
      .select("id, aluno_id, professor_id, whatsapp, area_interesse, concurso_foco, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to));
    if (!entries.length) return [];
    const studentIds = [...new Set(entries.map((item) => item.aluno_id))];
    const profileRows = await fetchAllRowsInBatches<Profile, string>(studentIds, (ids, from, to) => supabase
      .from("profiles")
      .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
      .in("id", ids)
      .order("id", { ascending: true })
      .range(from, to));
    const profiles = new Map(profileRows.map((item) => [item.id, item]));
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

export function ProfessorDirectoryRoutes({ route }: { route: ResolvedRoute }) {
  switch (route.pattern) {
    case "inicio": return <StudentDirectoryPage home />;
    case "alunos": return <StudentDirectoryPage />;
    case "lista-de-espera": return <WaitlistPage />;
    default: return <StatePanel kind="error" title="Tela não reconhecida" description="A rota não pertence ao diretório do professor." />;
  }
}
