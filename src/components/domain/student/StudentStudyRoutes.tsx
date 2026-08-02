"use client";

import Link from "next/link";
import { statusLabel } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import {
  Panel,
  StatusBadge,
  Empty,
  getMaterials,
  useStudentDomain,
} from "./shared";
import styles from "../StudentDomainPage.module.css";

export function StudentFeatureRoutes({ route }: { route: ResolvedRoute }) {
  const { busy, disciplineById, lessonById, progressByLesson, runRpc, studentDate, workspace } = useStudentDomain();

function disciplinesContent() {
    if (!workspace.planning) return <Empty title="Planejamento necessário">As disciplinas são definidas no planejamento ativo.</Empty>;
    if (!workspace.disciplines.length) return <Empty title="Nenhuma disciplina configurada">Seu planejamento ainda não possui disciplinas.</Empty>;
    return <div className={styles.cardGrid}>{workspace.disciplines.map((discipline) => {
      const lessonCount = workspace.lessons.filter((lesson) => lesson.planejamento_disciplina_id === discipline.id).length;
      const notebookCount = workspace.notebooks.filter((notebook) => notebook.planejamento_disciplina_id === discipline.id).length;
      return <Panel key={discipline.id}>
        <div className={styles.disciplineTitle}><span style={{ background: discipline.disciplina_cor_snapshot ?? "var(--color-primary)" }} /><div><strong>{discipline.disciplina_nome_snapshot}</strong><small>{discipline.disciplina_codigo_snapshot}</small></div><StatusBadge status={discipline.ativo ? "ativo" : "pausado"} /></div>
        <dl className={styles.compactDetails}><div><dt>Modalidade</dt><dd>{statusLabel(discipline.modalidade)}</dd></div><div><dt>Meta</dt><dd>{discipline.meta_percentual}%</dd></div><div><dt>Conteúdo</dt><dd>{notebookCount} cadernos · {lessonCount} aulas</dd></div></dl>
        <Link className="be-button" href={`/aluno/disciplinas/${discipline.id}`}>Ver disciplina</Link>
      </Panel>;
    })}</div>;
  }

  function disciplineDetailContent() {
    const discipline = workspace.disciplines.find((item) => item.id === route.params.disciplinaId);
    if (!discipline) return <Empty title="Disciplina não encontrada">Ela não pertence ao planejamento ativo.</Empty>;
    const notebooks = workspace.notebooks.filter((item) => item.planejamento_disciplina_id === discipline.id);
    const lessons = workspace.lessons.filter((item) => item.planejamento_disciplina_id === discipline.id);
    return <div className={styles.stack}>
      <Panel><div className={styles.detailHeader}><div><span className="be-section-label">{discipline.disciplina_codigo_snapshot}</span><h2>{discipline.disciplina_nome_snapshot}</h2></div><StatusBadge status={discipline.ativo ? "ativo" : "pausado"} /></div><dl className={styles.details}><div><dt>Modalidade</dt><dd>{statusLabel(discipline.modalidade)}</dd></div><div><dt>Meta percentual</dt><dd>{discipline.meta_percentual}%</dd></div><div><dt>Metas semanais</dt><dd>{discipline.minimo_metas} a {discipline.maximo_metas}</dd></div><div><dt>Peso</dt><dd>{discipline.peso}</dd></div></dl></Panel>
      <Panel title="Cadernos"><div className={styles.cardList}>{notebooks.length ? notebooks.map((item) => <article className={styles.itemCard} key={item.id}><div className={styles.itemMain}><strong>{item.nome}</strong><small>{item.total_questoes} questões</small></div><StatusBadge status={item.ativo ? "ativo" : "pausado"} />{item.link_tec ? <a className="be-button be-button--ghost" href={item.link_tec} target="_blank" rel="noreferrer">Abrir TEC</a> : null}</article>) : <Empty title="Nenhum caderno">Não há cadernos configurados nesta disciplina.</Empty>}</div></Panel>
      <Panel title="Aulas"><div className={styles.cardList}>{lessons.length ? lessons.map((lesson) => <article className={styles.itemCard} key={lesson.id}><div className={styles.itemMain}><strong>{lesson.nome}</strong><small>{lesson.total_questoes} questões</small></div><Link className="be-button be-button--ghost" href={`/aluno/aulas/${lesson.id}`}>Abrir aula</Link></article>) : <Empty title="Nenhuma aula">Não há aulas configuradas nesta disciplina.</Empty>}</div></Panel>
    </div>;
  }

  function lessonsContent() {
    if (!workspace.lessons.length) return <Empty title="Nenhuma aula disponível">As aulas aparecerão quando forem configuradas no planejamento.</Empty>;
    return <div className={styles.cardList}>{workspace.lessons.map((lesson) => {
      const discipline = disciplineById.get(lesson.planejamento_disciplina_id);
      const progress = progressByLesson.get(lesson.id);
      const completedParts = Number(Boolean(progress?.teoria_concluida_em)) + Number(Boolean(progress?.caderno_concluido_em));
      return <article className={styles.itemCard} key={lesson.id}><div className={styles.itemMain}><span className={styles.itemEyebrow}>{discipline?.disciplina_nome_snapshot}</span><strong>{lesson.nome}</strong><small>{completedParts}/2 etapas concluídas</small></div><StatusBadge status={completedParts === 2 ? "concluida" : completedParts ? "em_andamento" : "pendente"} /><Link className="be-button be-button--ghost" href={`/aluno/aulas/${lesson.id}`}>Estudar</Link></article>;
    })}</div>;
  }

  function lessonDetailContent() {
    const lesson = workspace.lessons.find((item) => item.id === route.params.aulaId);
    if (!lesson) return <Empty title="Aula não encontrada">Ela não pertence ao planejamento ativo.</Empty>;
    const discipline = disciplineById.get(lesson.planejamento_disciplina_id);
    const progress = progressByLesson.get(lesson.id);
    const materials = getMaterials(lesson.materiais_snapshot).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    return <div className={styles.stack}>
      <Panel><span className="be-section-label">{discipline?.disciplina_nome_snapshot}</span><h2>{lesson.nome}</h2><dl className={styles.details}><div><dt>Questões</dt><dd>{lesson.total_questoes}</dd></div><div><dt>Teoria</dt><dd>{progress?.teoria_concluida_em ? studentDate(progress.teoria_concluida_em, true) : "Pendente"}</dd></div><div><dt>Caderno</dt><dd>{progress?.caderno_concluido_em ? studentDate(progress.caderno_concluido_em, true) : "Pendente"}</dd></div></dl><div className={styles.formActions}>{lesson.link_tec ? <a className="be-button" href={lesson.link_tec} target="_blank" rel="noreferrer">Abrir no TEC</a> : null}<button className="be-button" type="button" disabled={busy} onClick={() => void runRpc("registrar_progresso_aula", { p_planejamento_aula_id: lesson.id, p_teoria_concluida: !progress?.teoria_concluida_em, p_caderno_concluido: null }, progress?.teoria_concluida_em ? "Conclusão da teoria desfeita." : "Teoria concluída.")}>{progress?.teoria_concluida_em ? "Desfazer teoria" : "Concluir teoria"}</button><button className="be-button" type="button" disabled={busy} onClick={() => void runRpc("registrar_progresso_aula", { p_planejamento_aula_id: lesson.id, p_teoria_concluida: null, p_caderno_concluido: !progress?.caderno_concluido_em }, progress?.caderno_concluido_em ? "Conclusão do caderno desfeita." : "Caderno concluído.")}>{progress?.caderno_concluido_em ? "Desfazer caderno" : "Concluir caderno"}</button></div></Panel>
      <Panel title="Materiais da aula">{materials.length ? <div className={styles.cardList}>{materials.map((material, index) => <article className={styles.itemCard} key={material.id ?? `${material.nome}-${index}`}><div className={styles.itemMain}><span className={styles.itemEyebrow}>{statusLabel(material.tipo)}</span><strong>{material.nome}</strong></div>{material.url ? <a className="be-button be-button--ghost" href={material.url} target="_blank" rel="noreferrer">Abrir material</a> : <StatusBadge status="pendente" />}</article>)}</div> : <Empty title="Nenhum material">Esta aula não possui materiais anexados.</Empty>}</Panel>
    </div>;
  }


  function reviewsContent() {
    if (!workspace.reviews.length) return <Empty title="Nenhuma revisão disponível">As revisões serão criadas conforme a configuração do planejamento e o avanço nas aulas.</Empty>;
    return <div className={styles.cardList}>{workspace.reviews.map((review) => {
      const origin = lessonById.get(review.planejamento_aula_origem_id);
      const target = lessonById.get(review.planejamento_aula_revisada_id);
      return <article className={styles.itemCard} key={review.id}><div className={styles.itemMain}><span className={styles.itemEyebrow}>{review.etapa === "primeira" ? "Primeira revisão" : "Segunda revisão"}</span><strong>{target?.nome ?? "Aula de revisão"}</strong><small>Origem: {origin?.nome ?? "Aula anterior"} · prevista {studentDate(review.prevista_em)}</small></div><StatusBadge status={review.status} />{["pendente", "concluida"].includes(review.status) ? <button className="be-button" type="button" disabled={busy} onClick={() => void runRpc("concluir_revisao", { p_revisao_id: review.id, p_concluir: review.status !== "concluida" }, review.status === "concluida" ? "Conclusão da revisão desfeita." : "Revisão concluída.")}>{review.status === "concluida" ? "Desfazer" : "Concluir"}</button> : null}</article>;
    })}</div>;
  }

  switch (route.pattern) {
    case "disciplinas":
      return disciplinesContent();
    case "disciplinas/:disciplinaId":
      return disciplineDetailContent();
    case "aulas":
      return lessonsContent();
    case "aulas/:aulaId":
      return lessonDetailContent();
    case "revisoes":
      return reviewsContent();
    default:
      return <Empty title="Tela ainda indisponível">Esta área não pertence a este módulo funcional.</Empty>;
  }
}
