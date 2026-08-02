"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows, fetchAllRowsInBatches } from "@/lib/supabase/pagination";
import {
  StudentAccess,
  Planning,
  Course,
  GoalStatus,
  Goal,
  callRpc,
  useResource,
  useMutationFeedback,
  Feedback,
  StatePanel,
  ResourceGate,
  formText,
  formNumber,
  formatDate,
  labelize,
  badgeClass,
  sortNewestAccess,
  loadStudent,
  loadPlanning,
  SectionTitle,
  Metric,
} from "./shared";
import styles from "../ProfessorDomainPage.module.css";

function StudentSummaryPage({ studentId }: { studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [profile, accessRows, plannings] = await Promise.all([
      loadStudent(studentId),
      fetchAllRows<StudentAccess>((from, to) => supabase.from("acessos_aluno_efetivos").select("id, aluno_id, status, status_efetivo, plano, inicio_em, expira_em, bloqueado_em, motivo_bloqueio, updated_at").eq("aluno_id", studentId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
      fetchAllRows<Planning>((from, to) => supabase.from("planejamentos").select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at").eq("aluno_id", studentId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    ]);
    if (!profile) return null;
    const accesses = sortNewestAccess(accessRows);
    const activePlanning = plannings.find((item) => item.status === "ativo") ?? null;
    let goals: Goal[] = [];
    if (activePlanning) {
      goals = await fetchAllRows<Goal>((from, to) => supabase
        .from("metas")
        .select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em")
        .eq("planejamento_id", activePlanning.id)
        .order("id", { ascending: true })
        .range(from, to));
    }
    return { access: accesses[0] ?? null, activePlanning, goals, planningCount: plannings.length, profile };
  }, [studentId]);
  const resource = useResource(load);

  return (
    <ResourceGate resource={resource} skeleton="dashboard">
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
    const [profile, accesses] = await Promise.all([
      loadStudent(studentId),
      fetchAllRows<StudentAccess>((from, to) => supabase.from("acessos_aluno_efetivos").select("id, aluno_id, status, status_efetivo, plano, inicio_em, expira_em, bloqueado_em, motivo_bloqueio, updated_at").eq("aluno_id", studentId).order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    ]);
    if (!profile) return null;
    return { access: sortNewestAccess(accesses)[0] ?? null, profile };
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
    <ResourceGate resource={resource} skeleton="form">
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
    const [profile, plannings] = await Promise.all([
      loadStudent(studentId),
      fetchAllRows<Planning>((from, to) => supabase
        .from("planejamentos")
        .select("id, professor_id, aluno_id, curso_id, curso_codigo_snapshot, curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais, data_inicio, status, created_at, updated_at")
        .eq("aluno_id", studentId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)),
    ]);
    if (!profile) return null;
    return { plannings, profile };
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
    const [profile, courses] = await Promise.all([
      loadStudent(studentId),
      fetchAllRows<Course>((from, to) => supabase
        .from("cursos")
        .select("id, codigo, nome, area, concurso_alvo, fase, modelo_estudo, metas_semanais_padrao")
        .eq("ativo", true)
        .order("nome")
        .order("id", { ascending: true })
        .range(from, to)),
    ]);
    if (!profile) return null;
    return { courses, profile };
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
      skeleton="form"
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
    const [planning, profile, goals, disciplines] = await Promise.all([
      loadPlanning(studentId, planningId),
      loadStudent(studentId),
      fetchAllRows<{ id: string; status: GoalStatus }>((from, to) => supabase.from("metas").select("id, status").eq("planejamento_id", planningId).order("id", { ascending: true }).range(from, to)),
      fetchAllRows<{ id: string }>((from, to) => supabase.from("planejamento_disciplinas").select("id").eq("planejamento_id", planningId).order("id", { ascending: true }).range(from, to)),
    ]);
    if (!planning || !profile) return null;
    const disciplineIds = disciplines.map((item) => item.id);
    const [notebooks, lessons] = disciplineIds.length
      ? await Promise.all([
          fetchAllRowsInBatches<{ id: string; planejamento_disciplina_id: string }, string>(disciplineIds, (ids, from, to) => supabase.from("planejamento_cadernos").select("id, planejamento_disciplina_id").in("planejamento_disciplina_id", ids).order("id", { ascending: true }).range(from, to)),
          fetchAllRowsInBatches<{ id: string; planejamento_disciplina_id: string }, string>(disciplineIds, (ids, from, to) => supabase.from("planejamento_aulas").select("id, planejamento_disciplina_id").in("planejamento_disciplina_id", ids).order("id", { ascending: true }).range(from, to)),
        ])
      : [[], []];
    return {
      completedGoals: goals.filter((item) => item.status === "concluida").length,
      disciplineCount: disciplines.length,
      lessonCount: lessons.length,
      notebookCount: notebooks.length,
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
    <ResourceGate resource={resource} skeleton="dashboard">
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

function MissingStudentContext() {
  return <StatePanel kind="error" title="Contexto incompleto" description="A rota não informou o aluno necessário para esta operação." />;
}

export function ProfessorStudentRoutes({ route }: { route: ResolvedRoute }) {
  const studentId = route.params.alunoId;
  const planningId = route.params.planejamentoId;

  switch (route.pattern) {
    case "alunos/:alunoId/resumo":
      return studentId ? <StudentSummaryPage key={studentId} studentId={studentId} /> : <MissingStudentContext />;
    case "alunos/:alunoId/acesso":
      return studentId ? <StudentAccessPage key={studentId} studentId={studentId} /> : <MissingStudentContext />;
    case "alunos/:alunoId/planejamentos":
      return studentId ? <PlanningListPage key={studentId} studentId={studentId} /> : <MissingStudentContext />;
    case "alunos/:alunoId/planejamentos/novo":
      return studentId ? <NewPlanningPage key={studentId} studentId={studentId} /> : <MissingStudentContext />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/resumo":
      return studentId && planningId ? <PlanningSummaryPage key={studentId + planningId} planningId={planningId} studentId={studentId} /> : <MissingStudentContext />;
    default:
      return <StatePanel kind="error" title="Tela não reconhecida" description="A rota não pertence ao acompanhamento do aluno." />;
  }
}
