"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows, fetchAllRowsInBatches } from "@/lib/supabase/pagination";
import {
  Planning,
  PlanningDiscipline,
  PlanningNotebook,
  PlanningLesson,
  Goal,
  ReviewConfiguration,
  Review,
  dayNames,
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
  safeExternalUrl,
  loadPlanning,
  SectionTitle,
} from "./shared";
import styles from "../ProfessorDomainPage.module.css";

function PlanningDisciplinesPage({ planningId, studentId }: { planningId: string; studentId: string }) {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const disciplines = await fetchAllRows<PlanningDiscipline>((from, to) => supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem")
      .order("id", { ascending: true })
      .range(from, to));
    return { disciplines, planning };
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
    const disciplines = await fetchAllRows<PlanningDiscipline>((from, to) => supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem")
      .order("id", { ascending: true })
      .range(from, to));
    if (!disciplines.length) return { deletedNotebooks: [], disciplines, notebooks: [], planning };
    const notebooks = await fetchAllRowsInBatches<PlanningNotebook, string>(disciplines.map((item) => item.id), (ids, from, to) => supabase
      .from("planejamento_cadernos")
      .select("id, planejamento_disciplina_id, caderno_catalogo_id, nome, link_tec, total_questoes, ordem, ativo, deleted_at")
      .in("planejamento_disciplina_id", ids)
      .order("ordem")
      .order("id", { ascending: true })
      .range(from, to));
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
    <ResourceGate resource={resource} skeleton="form">
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
    const disciplines = await fetchAllRows<PlanningDiscipline>((from, to) => supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem")
      .order("id", { ascending: true })
      .range(from, to));
    if (!disciplines.length) return { disciplines, lessons: [], planning };
    const lessons = await fetchAllRowsInBatches<PlanningLesson, string>(disciplines.map((item) => item.id), (ids, from, to) => supabase
      .from("planejamento_aulas")
      .select("id, planejamento_disciplina_id, nome, ordem, link_tec, total_questoes, materiais_snapshot, ativo")
      .in("planejamento_disciplina_id", ids)
      .order("ordem")
      .order("id", { ascending: true })
      .range(from, to));
    return { disciplines, lessons, planning };
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
    const [disciplines, goals] = await Promise.all([
      fetchAllRows<PlanningDiscipline>((from, to) => supabase.from("planejamento_disciplinas").select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo").eq("planejamento_id", planningId).order("ordem").order("id", { ascending: true }).range(from, to)),
      fetchAllRows<Goal>((from, to) => supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).eq("semana_numero", week).order("dia_semana").order("ordem_dia").order("id", { ascending: true }).range(from, to)),
    ]);
    const disciplineIds = disciplines.map((item) => item.id);
    const notebooks = disciplineIds.length
      ? await fetchAllRowsInBatches<PlanningNotebook, string>(disciplineIds, (ids, from, to) => supabase.from("planejamento_cadernos").select("id, planejamento_disciplina_id, caderno_catalogo_id, nome, link_tec, total_questoes, ordem, ativo, deleted_at").in("planejamento_disciplina_id", ids).order("ordem").order("id", { ascending: true }).range(from, to))
      : [];
    return {
      disciplines,
      goals,
      notebooks,
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
    const [disciplines, currentGoals, previousGoals] = await Promise.all([
      fetchAllRows<PlanningDiscipline>((from, to) => supabase.from("planejamento_disciplinas").select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo").eq("planejamento_id", planningId).eq("ativo", true).order("ordem").order("id", { ascending: true }).range(from, to)),
      fetchAllRows<Goal>((from, to) => supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).eq("semana_numero", week).in("tipo", ["bloco", "teoria"]).order("id", { ascending: true }).range(from, to)),
      week > 1
        ? fetchAllRows<Goal>((from, to) => supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).eq("semana_numero", week - 1).in("tipo", ["bloco", "teoria"]).order("id", { ascending: true }).range(from, to))
        : Promise.resolve([] as Goal[]),
    ]);
    return {
      currentGoals,
      disciplines,
      planning,
      previousGoals,
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
      skeleton="form"
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
    const [disciplines, goals] = await Promise.all([
      fetchAllRows<PlanningDiscipline>((from, to) => supabase.from("planejamento_disciplinas").select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo").eq("planejamento_id", planningId).order("ordem").order("id", { ascending: true }).range(from, to)),
      fetchAllRows<Goal>((from, to) => supabase.from("metas").select("id, planejamento_id, planejamento_disciplina_id, planejamento_caderno_id, origem_meta_id, tipo, titulo, descricao, atividade_extra, semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos, questoes_feitas, acertos, status, concluida_em, reforco_ignorado_em").eq("planejamento_id", planningId).in("tipo", ["bloco", "reforco"]).order("semana_numero", { ascending: false }).order("dia_semana").order("id", { ascending: true }).range(from, to)),
    ]);
    return { disciplines, goals, planning };
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
  const [reviewDisciplineId, setReviewDisciplineId] = useState("");
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const planning = await loadPlanning(studentId, planningId);
    if (!planning) return null;
    const disciplines = await fetchAllRows<PlanningDiscipline>((from, to) => supabase
      .from("planejamento_disciplinas")
      .select("id, planejamento_id, disciplina_codigo_snapshot, disciplina_nome_snapshot, disciplina_cor_snapshot, modalidade, meta_percentual, peso, minimo_metas, maximo_metas, ordem, ativo")
      .eq("planejamento_id", planningId)
      .order("ordem")
      .order("id", { ascending: true })
      .range(from, to));
    if (!disciplines.length) return { configurations: [], disciplines, lessons: [], planning, reviews: [] };
    const disciplineIds = disciplines.map((item) => item.id);
    const [configurations, lessons] = await Promise.all([
      fetchAllRowsInBatches<ReviewConfiguration, string>(disciplineIds, (ids, from, to) => supabase.from("configuracoes_revisao").select("id, planejamento_disciplina_id, primeira_revisao_intervalo, segunda_revisao_intervalo, ativo").in("planejamento_disciplina_id", ids).order("id", { ascending: true }).range(from, to)),
      fetchAllRowsInBatches<PlanningLesson, string>(disciplineIds, (ids, from, to) => supabase.from("planejamento_aulas").select("id, planejamento_disciplina_id, nome, ordem, link_tec, total_questoes, materiais_snapshot, ativo").in("planejamento_disciplina_id", ids).order("ordem").order("id", { ascending: true }).range(from, to)),
    ]);
    let reviews: Review[] = [];
    if (lessons.length) {
      const lessonIds = lessons.map((item) => item.id);
      reviews = await fetchAllRowsInBatches<Review, string>(lessonIds, (ids, from, to) => supabase
        .from("revisoes")
        .select("id, planejamento_aula_origem_id, planejamento_aula_revisada_id, etapa, status, prevista_em, concluida_em")
        .eq("aluno_id", studentId)
        .in("planejamento_aula_origem_id", ids)
        .order("prevista_em")
        .order("id", { ascending: true })
        .range(from, to));
    }
    return { configurations, disciplines, lessons, planning, reviews };
  }, [planningId, studentId]);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function createReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run("create-review", () => callRpc<Review>("criar_revisao", {
      p_etapa: formText(data, "stage"),
      p_planejamento_aula_origem_id: formText(data, "originLesson"),
      p_planejamento_aula_revisada_id: formText(data, "reviewedLesson"),
      p_prevista_em: formText(data, "scheduledDate"),
    }, "A migration criar_revisao ainda não foi aplicada ao Supabase."), "Revisão criada e disponibilizada para o aluno.");
    if (saved) resource.reload();
  }

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
      {(data) => {
        const eligibleDisciplines = data.disciplines.filter((discipline) => (
          discipline.ativo
          && data.lessons.filter((lesson) => lesson.ativo && lesson.planejamento_disciplina_id === discipline.id).length >= 2
        ));
        const selectedDisciplineId = eligibleDisciplines.some((discipline) => discipline.id === reviewDisciplineId)
          ? reviewDisciplineId
          : (eligibleDisciplines[0]?.id ?? "");
        const reviewLessons = data.lessons.filter((lesson) => (
          lesson.ativo && lesson.planejamento_disciplina_id === selectedDisciplineId
        ));

        return (
        <div className={styles.stack}>
          <section className="be-card">
            <SectionTitle title="Criar revisão" description="Atribua uma revisão específica usando duas aulas distintas da mesma disciplina. O aluno é identificado pelo planejamento e a revisão começa pendente." />
            {eligibleDisciplines.length ? (
              <form className={styles.form} key={`create-review-${selectedDisciplineId}`} onSubmit={createReview}>
                <label className={styles.field} htmlFor="review-discipline"><span>Disciplina</span><select className="be-input" id="review-discipline" value={selectedDisciplineId} onChange={(event) => setReviewDisciplineId(event.target.value)}>{eligibleDisciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.disciplina_nome_snapshot}</option>)}</select></label>
                <label className={styles.field} htmlFor="review-origin-lesson"><span>Aula de origem</span><select className="be-input" id="review-origin-lesson" name="originLesson" defaultValue={reviewLessons[0]?.id} required>{reviewLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.ordem}. {lesson.nome}</option>)}</select></label>
                <label className={styles.field} htmlFor="review-reviewed-lesson"><span>Aula a revisar</span><select className="be-input" id="review-reviewed-lesson" name="reviewedLesson" defaultValue={reviewLessons[1]?.id} required>{reviewLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.ordem}. {lesson.nome}</option>)}</select></label>
                <label className={styles.field} htmlFor="review-stage"><span>Etapa</span><select className="be-input" id="review-stage" name="stage" defaultValue="primeira"><option value="primeira">Primeira revisão</option><option value="segunda">Segunda revisão</option></select></label>
                <label className={styles.field} htmlFor="review-scheduled-date"><span>Data prevista</span><input className="be-input" id="review-scheduled-date" name="scheduledDate" type="date" required /></label>
                <div className={`${styles.actions} ${styles.fullWidth}`}><button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null || data.planning.status === "arquivado"}>{mutation.pending === "create-review" ? "Criando..." : "Criar revisão"}</button></div>
              </form>
            ) : <StatePanel title="Aulas insuficientes" description="Cadastre ao menos duas aulas ativas na mesma disciplina para criar uma revisão." />}
            {data.planning.status === "arquivado" ? <p className={styles.hint}>Este planejamento está arquivado e aceita somente consulta ao histórico.</p> : null}
          </section>
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
        );
      }}
    </ResourceGate>
  );
}

function MissingPlanningContext() {
  return <StatePanel kind="error" title="Contexto incompleto" description="A rota não informou o aluno ou o planejamento necessário para esta operação." />;
}

export function ProfessorPlanningRoutes({ route }: { route: ResolvedRoute }) {
  const studentId = route.params.alunoId;
  const planningId = route.params.planejamentoId;
  if (!studentId || !planningId) return <MissingPlanningContext />;
  const key = studentId + planningId;

  switch (route.pattern) {
    case "alunos/:alunoId/planejamentos/:planejamentoId/disciplinas":
      return <PlanningDisciplinesPage key={key} planningId={planningId} studentId={studentId} />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/cadernos":
      return <PlanningNotebooksPage key={key} planningId={planningId} studentId={studentId} />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/aulas":
      return <PlanningLessonsPage key={key} planningId={planningId} studentId={studentId} />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/metas":
      return <PlanningGoalsPage key={key} planningId={planningId} routePath={route.pathname} studentId={studentId} />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/metas/gerar":
      return <GenerateGoalsPage key={key} planningId={planningId} routePath={route.pathname} studentId={studentId} />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/reforcos":
      return <PlanningReinforcementsPage key={key} planningId={planningId} studentId={studentId} />;
    case "alunos/:alunoId/planejamentos/:planejamentoId/revisoes":
      return <PlanningReviewsPage key={key} planningId={planningId} studentId={studentId} />;
    default:
      return <StatePanel kind="error" title="Tela não reconhecida" description="A rota não pertence ao planejamento selecionado." />;
  }
}
