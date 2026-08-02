"use client";

import Link from "next/link";
import { currentDayInTimeZone, dayLabel, formatMinutes, statusLabel } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import {
  PlanningDiscipline,
  Goal,
  Panel,
  StatusBadge,
  Feedback,
  Empty,
  SubmitButton,
  GoalCompletionForm,
  useStudentDomain,
} from "./shared";
import styles from "../StudentDomainPage.module.css";

export function StudentFeatureRoutes({ route }: { route: ResolvedRoute }) {
  const { busy, disciplineById, notebookById, runRpc, selectedWeek, setWeek, studentDate, studentTimeZone, workspace } = useStudentDomain();

function homeContent() {
    if (!workspace.planning) return <Empty title="Nenhum planejamento ativo">Quando seu professor ativar um planejamento, a semana de estudos aparecerá aqui.</Empty>;
    const weekGoals = workspace.goals.filter((goal) => goal.semana_numero === selectedWeek);
    const completed = weekGoals.filter((goal) => goal.status === "concluida").length;
    const pendingReviews = workspace.reviews.filter((review) => review.status === "pendente").length;
    const pendingReinforcements = workspace.goals.filter((goal) => goal.tipo === "reforco" && ["pendente", "em_andamento"].includes(goal.status)).length;
    const today = currentDayInTimeZone(studentTimeZone);
    const todayGoals = weekGoals.filter((goal) => goal.dia_semana === today);

    return <div className={styles.stack}>
      <div className={styles.metrics}>
        <Panel><span className="be-section-label">Semana</span><strong className="be-metric-value">{selectedWeek}</strong><small>{workspace.planning.nome}</small></Panel>
        <Panel><span className="be-section-label">Metas concluídas</span><strong className="be-metric-value">{completed}/{weekGoals.length}</strong><small>na semana atual</small></Panel>
        <Panel><span className="be-section-label">Revisões</span><strong className="be-metric-value">{pendingReviews}</strong><small>pendentes</small></Panel>
        <Panel><span className="be-section-label">Reforços</span><strong className="be-metric-value">{pendingReinforcements}</strong><small>agendados</small></Panel>
      </div>
      <Panel title={`Hoje · ${dayLabel(today)}`} subtitle="Atividades previstas para o dia.">
        {todayGoals.length ? <div className={styles.cardList}>{todayGoals.map((goal) => <GoalCard key={goal.id} goal={goal} discipline={goal.planejamento_disciplina_id ? disciplineById.get(goal.planejamento_disciplina_id) : undefined} />)}</div> : <Empty title="Dia livre">Não há metas programadas para hoje.</Empty>}
      </Panel>
    </div>;
  }

  function GoalCard({ goal, discipline }: { goal: Goal; discipline?: PlanningDiscipline }) {
    return <article className={styles.itemCard}>
      <div className={styles.itemMain}>
        <span className={styles.itemEyebrow}>{discipline?.disciplina_nome_snapshot ?? statusLabel(goal.tipo)}</span>
        <strong>{goal.titulo}</strong>
        <small>{formatMinutes(goal.tempo_previsto_minutos)} · {dayLabel(goal.dia_semana)}</small>
      </div>
      <StatusBadge status={goal.status} />
      <Link className="be-button be-button--ghost" href={`/aluno/metas/${goal.id}`}>Abrir</Link>
    </article>;
  }


  function goalsContent() {
    if (!workspace.planning) return <Empty title="Planejamento necessário">As metas serão exibidas depois que um planejamento for ativado.</Empty>;
    const goals = workspace.goals.filter((goal) => goal.semana_numero === selectedWeek);
    return <div className={styles.stack}>
      <div className={styles.toolbar}>
        <button className="be-button" type="button" onClick={() => setWeek(selectedWeek - 1)} disabled={selectedWeek === 1}>← Semana anterior</button>
        <strong className="be-mono">Semana {selectedWeek}</strong>
        <button className="be-button" type="button" onClick={() => setWeek(selectedWeek + 1)}>Próxima semana →</button>
      </div>
      <Panel title="Registrar estudo extra" subtitle="Atividade concluída fora das metas regulares; entra apenas no tempo estudado.">
        <form className={styles.formGrid} onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const saved = await runRpc("registrar_estudo_extra", {
            p_planejamento_id: workspace.planning?.id,
            p_semana: selectedWeek,
            p_dia: Number(data.get("dia")),
            p_atividade: String(data.get("atividade") ?? ""),
            p_tempo_minutos: Number(data.get("tempo")),
            p_observacao: String(data.get("observacao") ?? "") || null,
          }, "Estudo extra registrado.");
          if (saved) form.reset();
        }}>
          <label><span className="be-label">Atividade</span><input className="be-input" name="atividade" required maxLength={160} /></label>
          <label><span className="be-label">Dia</span><select className="be-input" name="dia" defaultValue="1">{Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{dayLabel(index + 1)}</option>)}</select></label>
          <label><span className="be-label">Tempo realizado (min)</span><input className="be-input" name="tempo" type="number" min="1" max="1440" defaultValue="60" required /></label>
          <label className={styles.spanTwo}><span className="be-label">Observação</span><textarea className="be-input" name="observacao" rows={2} /></label>
          <div className={styles.formActions}><SubmitButton busy={busy}>Registrar estudo</SubmitButton></div>
        </form>
      </Panel>
      <Panel title={`Agenda da semana ${selectedWeek}`} subtitle={`${goals.length} atividade(s) programada(s).`}>
        {goals.length ? <div className={styles.dayGrid}>{Array.from({ length: 7 }, (_, index) => index + 1).map((day) => {
          const dayGoals = goals.filter((goal) => goal.dia_semana === day);
          return <section key={day} className={styles.dayColumn}><h3>{dayLabel(day)}</h3>{dayGoals.length ? dayGoals.map((goal) => <GoalCard key={goal.id} goal={goal} discipline={goal.planejamento_disciplina_id ? disciplineById.get(goal.planejamento_disciplina_id) : undefined} />) : <small>Sem atividades</small>}</section>;
        })}</div> : <Empty title="Nenhuma meta nesta semana">Consulte outra semana ou aguarde o planejamento do professor.</Empty>}
      </Panel>
    </div>;
  }

  function goalDetailContent() {
    const goal = workspace.goals.find((item) => item.id === route.params.metaId);
    if (!goal) return <Empty title="Meta não encontrada">Ela pode ter sido removida ou não pertence ao seu planejamento.</Empty>;
    const discipline = goal.planejamento_disciplina_id ? disciplineById.get(goal.planejamento_disciplina_id) : undefined;
    const notebook = goal.planejamento_caderno_id ? notebookById.get(goal.planejamento_caderno_id) : undefined;
    return <div className={styles.stack}>
      <Panel>
        <div className={styles.detailHeader}><div><span className="be-section-label">{statusLabel(goal.tipo)}</span><h2>{goal.titulo}</h2></div><StatusBadge status={goal.status} /></div>
        <dl className={styles.details}>
          <div><dt>Disciplina</dt><dd>{discipline?.disciplina_nome_snapshot ?? "Atividade livre"}</dd></div>
          <div><dt>Caderno</dt><dd>{notebook?.nome ?? "Não se aplica"}</dd></div>
          <div><dt>Agenda</dt><dd>Semana {goal.semana_numero}, {dayLabel(goal.dia_semana)}</dd></div>
          <div><dt>Tempo previsto</dt><dd>{formatMinutes(goal.tempo_previsto_minutos)}</dd></div>
          {goal.concluida_em ? <div><dt>Conclusão</dt><dd>{studentDate(goal.concluida_em, true)}</dd></div> : null}
          {goal.questoes_feitas ? <div><dt>Questões</dt><dd>{goal.acertos} acertos em {goal.questoes_feitas}</dd></div> : null}
        </dl>
        {goal.descricao ? <p>{goal.descricao}</p> : null}
        {goal.observacao_conclusao ? <Feedback message={goal.observacao_conclusao} /> : null}
      </Panel>
      {["pendente", "em_andamento"].includes(goal.status) ? <Panel title="Concluir meta" subtitle="O resultado só será mostrado como salvo após a confirmação do servidor.">
        <GoalCompletionForm busy={busy} goal={goal} onComplete={(parameters) => runRpc("concluir_meta", parameters, "Meta concluída.")} />
      </Panel> : null}
      {goal.status === "concluida" ? <Panel title="Desfazer conclusão" subtitle="O resultado atual será preservado no histórico como desfeito.">
        <form className={styles.inlineForm} onSubmit={(event) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get("motivo") ?? "");
          void runRpc("desfazer_conclusao_meta", { p_meta_id: goal.id, p_motivo: reason }, "Conclusão desfeita.");
        }}>
          <label><span className="be-label">Motivo</span><input className="be-input" name="motivo" required /></label>
          <button className="be-button be-button--danger" type="submit" disabled={busy}>Desfazer</button>
        </form>
      </Panel> : null}
    </div>;
  }


  function reinforcementsContent() {
    if (!workspace.planning) return <Empty title="Planejamento necessário">Sugestões de reforço dependem de metas concluídas.</Empty>;
    const reinforcements = workspace.goals.filter((goal) => goal.tipo === "reforco");
    const activeOrigins = new Set(reinforcements.filter((goal) => ["pendente", "em_andamento"].includes(goal.status)).map((goal) => goal.origem_meta_id));
    const resolvedOrigins = new Set(reinforcements.filter((goal) => {
      if (goal.status !== "concluida" || !goal.origem_meta_id || goal.questoes_feitas < 1 || !goal.planejamento_disciplina_id) return false;
      const target = disciplineById.get(goal.planejamento_disciplina_id)?.meta_percentual;
      return target != null && (goal.acertos / goal.questoes_feitas) * 100 >= target;
    }).map((goal) => goal.origem_meta_id));
    const eligible = workspace.goals.filter((goal) => {
      if (goal.tipo !== "bloco" || goal.status !== "concluida" || goal.questoes_feitas < 1 || activeOrigins.has(goal.id) || resolvedOrigins.has(goal.id)) return false;
      const target = goal.planejamento_disciplina_id ? disciplineById.get(goal.planejamento_disciplina_id)?.meta_percentual : null;
      return target != null && (goal.acertos / goal.questoes_feitas) * 100 < target;
    });
    const suggestions = eligible.filter((goal) => !goal.reforco_ignorado_em);
    const ignored = eligible.filter((goal) => Boolean(goal.reforco_ignorado_em));

    function ReinforcementSuggestion({ goal }: { goal: Goal }) {
      const discipline = goal.planejamento_disciplina_id ? disciplineById.get(goal.planejamento_disciplina_id) : undefined;
      const rate = Math.round((goal.acertos / goal.questoes_feitas) * 100);
      const highPriority = rate < (discipline?.meta_percentual ?? 0) * 0.75;
      return (
        <article className={styles.itemCard}>
          <div className={styles.itemMain}><span className={styles.itemEyebrow}>{discipline?.disciplina_nome_snapshot}</span><strong>{goal.titulo}</strong><small>{rate}% de aproveitamento · meta {discipline?.meta_percentual}%</small></div>
          <span className={`be-badge be-badge--${highPriority ? "danger" : "warning"}`}>{highPriority ? "Prioridade alta" : "Atenção"}</span>
          <form className={styles.inlineForm} onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const week = Number(data.get("semana"));
            const day = Number(data.get("dia"));
            if (!window.confirm(`Agendar este reforço para a semana ${week}, ${dayLabel(day)}?`)) return;
            void runRpc("agendar_reforco", { p_meta_origem_id: goal.id, p_semana: week, p_dia: day }, "Reforço agendado.");
          }}>
            <label><span className="be-label">Semana</span><input className="be-input" name="semana" type="number" min="1" defaultValue={goal.semana_numero + 1} required /></label>
            <label><span className="be-label">Dia</span><select className="be-input" name="dia" defaultValue={goal.dia_semana}>{Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{dayLabel(index + 1)}</option>)}</select></label>
            <div className={styles.rowActions}><button className="be-button be-button--primary" type="submit" disabled={busy}>Confirmar agenda</button><button className="be-button be-button--ghost" type="button" disabled={busy} onClick={() => void runRpc("ignorar_reforco", { p_meta_origem_id: goal.id, p_ignorar: true }, "Sugestão ignorada.")}>Ignorar</button></div>
          </form>
        </article>
      );
    }

    return <div className={styles.stack}>
      <Panel title="Sugestões de reforço" subtitle="Geradas a partir de blocos concluídos abaixo da meta da disciplina.">
        {suggestions.length ? <div className={styles.cardList}>{suggestions.map((goal) => <ReinforcementSuggestion goal={goal} key={goal.id} />)}</div> : <Empty title="Nenhuma sugestão">Você não possui blocos elegíveis aguardando reforço.</Empty>}
      </Panel>
      {ignored.length ? <Panel title="Sugestões ignoradas" subtitle="Reative uma deficiência quando quiser voltar a agendá-la."><div className={styles.cardList}>{ignored.map((goal) => <article className={styles.itemCard} key={goal.id}><div className={styles.itemMain}><strong>{goal.titulo}</strong><small>Ignorada em {studentDate(goal.reforco_ignorado_em, true)}</small></div><StatusBadge status="cancelado" /><button className="be-button" type="button" disabled={busy} onClick={() => void runRpc("ignorar_reforco", { p_meta_origem_id: goal.id, p_ignorar: false }, "Sugestão reativada.")}>Reativar sugestão</button></article>)}</div></Panel> : null}
      <Panel title="Reforços agendados e históricos">
        {reinforcements.length ? <div className={styles.cardList}>{reinforcements.map((goal) => <article className={styles.itemCard} key={goal.id}><div className={styles.itemMain}><strong>{goal.titulo}</strong><small>Semana {goal.semana_numero} · {dayLabel(goal.dia_semana)}</small></div><StatusBadge status={goal.status} /><Link className="be-button be-button--ghost" href={`/aluno/metas/${goal.id}`}>Abrir</Link>{["pendente", "em_andamento"].includes(goal.status) ? <button className="be-button be-button--danger" type="button" disabled={busy} onClick={() => { const reason = window.prompt("Informe o motivo do cancelamento:"); if (reason) void runRpc("cancelar_reforco", { p_reforco_id: goal.id, p_motivo: reason }, "Reforço cancelado."); }}>Cancelar</button> : null}</article>)}</div> : <Empty title="Nenhum reforço agendado">Os reforços confirmados aparecerão aqui.</Empty>}
      </Panel>
    </div>;
  }

  switch (route.pattern) {
    case "inicio":
      return homeContent();
    case "metas":
      return goalsContent();
    case "metas/:metaId":
      return goalDetailContent();
    case "reforcos":
      return reinforcementsContent();
    default:
      return <Empty title="Tela ainda indisponível">Esta área não pertence a este módulo funcional.</Empty>;
  }
}
