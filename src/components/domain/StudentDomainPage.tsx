"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  currentDayInTimeZone,
  currentPlanningWeek,
  dayLabel,
  errorMessage,
  formatDate,
  formatMinutes,
  statusLabel,
  statusTone,
} from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { PhoneField } from "@/components/form/PhoneField";
import {
  ButtonSpinner,
  InlineLoadingIndicator,
  LoadingSkeleton,
  type SkeletonVariant,
} from "@/components/states/LoadingSkeleton";

import styles from "./StudentDomainPage.module.css";

type Profile = {
  id: string;
  nome: string;
  telefone: string | null;
  fuso_horario: string;
  ativo: boolean;
};

type AcademicAccess = {
  id: string;
  status: string;
  status_efetivo?: string;
  plano: string;
  inicio_em: string | null;
  expira_em: string | null;
  bloqueado_em: string | null;
  motivo_bloqueio: string | null;
};

type Planning = {
  id: string;
  nome: string;
  curso_codigo_snapshot: string;
  curso_nome_snapshot: string;
  fase: string;
  modelo_estudo: string;
  metas_semanais: number;
  data_inicio: string;
  status: string;
};

type PlanningDiscipline = {
  id: string;
  disciplina_codigo_snapshot: string;
  disciplina_nome_snapshot: string;
  disciplina_cor_snapshot: string | null;
  modalidade: string;
  meta_percentual: number;
  peso: number;
  minimo_metas: number;
  maximo_metas: number;
  ordem: number;
  ativo: boolean;
};

type PlanningNotebook = {
  id: string;
  planejamento_disciplina_id: string;
  nome: string;
  link_tec: string | null;
  total_questoes: number;
  ordem: number;
  ativo: boolean;
};

type LessonMaterial = { id?: string; tipo: string; nome: string; url?: string | null; ordem?: number };

type PlanningLesson = {
  id: string;
  planejamento_disciplina_id: string;
  nome: string;
  ordem: number;
  link_tec: string | null;
  total_questoes: number;
  materiais_snapshot: LessonMaterial[] | unknown;
  ativo: boolean;
};

type Goal = {
  id: string;
  planejamento_id: string;
  planejamento_disciplina_id: string | null;
  planejamento_caderno_id: string | null;
  origem_meta_id: string | null;
  tipo: string;
  titulo: string;
  descricao: string | null;
  atividade_extra: string | null;
  semana_numero: number;
  dia_semana: number;
  ordem_dia: number;
  tempo_previsto_minutos: number;
  tempo_gasto_minutos: number | null;
  questoes_feitas: number;
  acertos: number;
  observacao_conclusao: string | null;
  status: string;
  concluida_em: string | null;
  reforco_ignorado_em: string | null;
};

type LessonProgress = {
  id: string;
  planejamento_aula_id: string;
  teoria_concluida_em: string | null;
  caderno_concluido_em: string | null;
};

type Review = {
  id: string;
  planejamento_aula_origem_id: string;
  planejamento_aula_revisada_id: string;
  etapa: string;
  status: string;
  prevista_em: string | null;
  concluida_em: string | null;
};

type WaitlistEntry = {
  id: string;
  professor_id: string | null;
  whatsapp: string;
  area_interesse: string;
  concurso_foco: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type StudentWorkspace = {
  userId: string;
  email: string;
  profile: Profile | null;
  access: AcademicAccess | null;
  planning: Planning | null;
  disciplines: PlanningDiscipline[];
  notebooks: PlanningNotebook[];
  lessons: PlanningLesson[];
  goals: Goal[];
  lessonProgress: LessonProgress[];
  reviews: Review[];
  waitlist: WaitlistEntry | null;
};

const emptyWorkspace: StudentWorkspace = {
  userId: "",
  email: "",
  profile: null,
  access: null,
  planning: null,
  disciplines: [],
  notebooks: [],
  lessons: [],
  goals: [],
  lessonProgress: [],
  reviews: [],
  waitlist: null,
};

function skeletonVariantForRoute(route: ResolvedRoute): SkeletonVariant {
  if (route.pattern === "inicio") return "dashboard";
  if (["perfil", "lista-de-espera"].includes(route.pattern)) return "form";
  if (route.pattern.includes(":") || ["acesso", "planejamento"].includes(route.pattern)) return "detail";
  return "list";
}

function Panel({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <section className={`be-card ${styles.panel}`}>
      {title || subtitle ? (
        <header className={styles.panelHeader}>
          {title ? <h2>{title}</h2> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  return <span className={`be-badge be-badge--${statusTone(status)}`}>{statusLabel(status)}</span>;
}

function Feedback({ message, tone = "info" }: { message: string; tone?: "danger" | "info" | "success" | "warning" }) {
  return <div className={styles.feedback} data-tone={tone} role={tone === "danger" ? "alert" : "status"}>{message}</div>;
}

function Empty({ children, title }: { children: ReactNode; title: string }) {
  return <div className={styles.empty}><span aria-hidden="true">○</span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="be-button be-button--primary" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? <><ButtonSpinner />Salvando…</> : children}
    </button>
  );
}

function getMaterials(value: unknown): LessonMaterial[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LessonMaterial => Boolean(item && typeof item === "object" && "nome" in item && "tipo" in item));
}

function GoalCompletionForm({
  busy,
  goal,
  onComplete,
}: {
  busy: boolean;
  goal: Goal;
  onComplete: (parameters: Record<string, unknown>) => Promise<boolean>;
}) {
  const minimumQuestions = goal.tipo === "teoria" ? 0 : 1;
  const [questions, setQuestions] = useState(minimumQuestions);
  const [hits, setHits] = useState(0);

  return (
    <form className={styles.formGrid} onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void onComplete({
        p_meta_id: goal.id,
        p_tempo_minutos: Number(data.get("tempo")),
        p_questoes: questions,
        p_acertos: hits,
        p_observacao: String(data.get("observacao") ?? "") || null,
      });
    }}>
      <label><span className="be-label">Tempo realizado (min)</span><input className="be-input" name="tempo" type="number" min="1" max="1440" defaultValue={goal.tempo_previsto_minutos} required /></label>
      <label><span className="be-label">Questões realizadas</span><input className="be-input" name="questoes" type="number" min={minimumQuestions} value={questions} onChange={(event) => { const next = Math.max(minimumQuestions, Number(event.target.value)); setQuestions(next); setHits((current) => Math.min(current, next)); }} required /></label>
      <label><span className="be-label">Acertos</span><input className="be-input" name="acertos" type="number" min="0" max={questions} value={hits} onChange={(event) => setHits(Math.min(questions, Math.max(0, Number(event.target.value))))} required /></label>
      <label className={styles.spanTwo}><span className="be-label">Observação</span><textarea className="be-input" name="observacao" rows={3} /></label>
      <div className={styles.formActions}><SubmitButton busy={busy}>Concluir meta</SubmitButton></div>
    </form>
  );
}

export function StudentDomainPage({ route }: { route: ResolvedRoute }) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<StudentWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedWeek, setSelectedWeek] = useState(1);

  const loadWorkspace = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setFailure("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Sessão do aluno não encontrada.");

      const userId = authData.user.id;
      const [profileResult, accessResult, planningResult, waitlistResult] = await Promise.all([
        supabase.from("profiles").select("id,nome,telefone,fuso_horario,ativo").eq("id", userId).maybeSingle(),
        supabase.from("acessos_aluno_efetivos").select("*").eq("aluno_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("planejamentos").select("id,nome,curso_codigo_snapshot,curso_nome_snapshot,fase,modelo_estudo,metas_semanais,data_inicio,status").eq("aluno_id", userId).eq("status", "ativo").maybeSingle(),
        supabase.from("lista_espera").select("id,professor_id,whatsapp,area_interesse,concurso_foco,status,created_at,updated_at").eq("aluno_id", userId).maybeSingle(),
      ]);

      const firstError = profileResult.error ?? accessResult.error ?? planningResult.error ?? waitlistResult.error;
      if (firstError) throw firstError;

      const planning = planningResult.data as Planning | null;
      let disciplines: PlanningDiscipline[] = [];
      let notebooks: PlanningNotebook[] = [];
      let lessons: PlanningLesson[] = [];
      let goals: Goal[] = [];
      let lessonProgress: LessonProgress[] = [];
      let reviews: Review[] = [];

      if (planning) {
        const [disciplineResult, goalResult, progressResult, reviewResult] = await Promise.all([
          supabase.from("planejamento_disciplinas").select("id,disciplina_codigo_snapshot,disciplina_nome_snapshot,disciplina_cor_snapshot,modalidade,meta_percentual,peso,minimo_metas,maximo_metas,ordem,ativo").eq("planejamento_id", planning.id).order("ordem"),
          supabase.from("metas").select("id,planejamento_id,planejamento_disciplina_id,planejamento_caderno_id,origem_meta_id,tipo,titulo,descricao,atividade_extra,semana_numero,dia_semana,ordem_dia,tempo_previsto_minutos,tempo_gasto_minutos,questoes_feitas,acertos,observacao_conclusao,status,concluida_em,reforco_ignorado_em").eq("planejamento_id", planning.id).order("semana_numero").order("dia_semana").order("ordem_dia"),
          supabase.from("progresso_aulas").select("id,planejamento_aula_id,teoria_concluida_em,caderno_concluido_em").eq("aluno_id", userId),
          supabase.from("revisoes").select("id,planejamento_aula_origem_id,planejamento_aula_revisada_id,etapa,status,prevista_em,concluida_em").eq("aluno_id", userId).order("prevista_em"),
        ]);
        const planningError = disciplineResult.error ?? goalResult.error ?? progressResult.error ?? reviewResult.error;
        if (planningError) throw planningError;

        disciplines = (disciplineResult.data ?? []) as PlanningDiscipline[];
        goals = (goalResult.data ?? []) as Goal[];
        lessonProgress = (progressResult.data ?? []) as LessonProgress[];
        reviews = (reviewResult.data ?? []) as Review[];

        const disciplineIds = disciplines.map((item) => item.id);
        if (disciplineIds.length) {
          const [notebookResult, lessonResult] = await Promise.all([
            supabase.from("planejamento_cadernos").select("id,planejamento_disciplina_id,nome,link_tec,total_questoes,ordem,ativo").in("planejamento_disciplina_id", disciplineIds).order("ordem"),
            supabase.from("planejamento_aulas").select("id,planejamento_disciplina_id,nome,ordem,link_tec,total_questoes,materiais_snapshot,ativo").in("planejamento_disciplina_id", disciplineIds).order("ordem"),
          ]);
          if (notebookResult.error ?? lessonResult.error) throw notebookResult.error ?? lessonResult.error;
          notebooks = (notebookResult.data ?? []) as PlanningNotebook[];
          lessons = (lessonResult.data ?? []) as PlanningLesson[];
        }
      }

      setWorkspace({
        userId,
        email: authData.user.email ?? "",
        profile: profileResult.data as Profile | null,
        access: accessResult.data as AcademicAccess | null,
        planning,
        disciplines,
        notebooks,
        lessons,
        goals,
        lessonProgress,
        reviews,
        waitlist: waitlistResult.data as WaitlistEntry | null,
      });

      if (planning) {
        const requestedWeek = typeof window === "undefined" ? null : Number(new URLSearchParams(window.location.search).get("semana"));
        const profile = profileResult.data as Profile | null;
        setSelectedWeek(requestedWeek && requestedWeek > 0 ? requestedWeek : currentPlanningWeek(planning.data_inicio, profile?.fuso_horario));
      }
    } catch (error) {
      setFailure(errorMessage(error, "Não foi possível carregar os dados do aluno."));
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace("initial");
  }, [loadWorkspace]);

  const runRpc = useCallback(async (name: string, parameters: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    setFailure("");
    setSuccess("");
    try {
      const { error } = await getSupabaseBrowserClient().rpc(name, parameters);
      if (error) throw error;
      setSuccess(successMessage);
      await loadWorkspace("refresh");
      return true;
    } catch (error) {
      setFailure(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [loadWorkspace]);

  const disciplineById = useMemo(() => new Map(workspace.disciplines.map((item) => [item.id, item])), [workspace.disciplines]);
  const notebookById = useMemo(() => new Map(workspace.notebooks.map((item) => [item.id, item])), [workspace.notebooks]);
  const lessonById = useMemo(() => new Map(workspace.lessons.map((item) => [item.id, item])), [workspace.lessons]);
  const progressByLesson = useMemo(() => new Map(workspace.lessonProgress.map((item) => [item.planejamento_aula_id, item])), [workspace.lessonProgress]);

  function setWeek(next: number) {
    const week = Math.max(1, next);
    setSelectedWeek(week);
    router.replace(`${pathname}?semana=${week}`, { scroll: false });
  }

  if (loading) {
    return (
      <LoadingSkeleton
        label="Carregando dados do aluno"
        variant={skeletonVariantForRoute(route)}
      />
    );
  }

  const messages = <>{refreshing ? <InlineLoadingIndicator /> : null}{failure ? <Feedback message={failure} tone="danger" /> : null}{success ? <Feedback message={success} tone="success" /> : null}</>;

  if (failure && !workspace.userId) {
    return <><Feedback message={failure} tone="danger" /><button className="be-button" type="button" onClick={() => void loadWorkspace("initial")}>Tentar novamente</button></>;
  }

  const studentTimeZone = workspace.profile?.fuso_horario ?? "America/Sao_Paulo";
  const studentDate = (value: string | null | undefined, includeTime = false) => formatDate(value, includeTime, studentTimeZone);

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

  function planningContent() {
    const planning = workspace.planning;
    if (!planning) return <Empty title="Nenhum planejamento ativo">Seu histórico é preservado, mas apenas o planejamento ativo aparece para execução.</Empty>;
    return <div className={styles.stack}>
      <Panel><div className={styles.detailHeader}><div><span className="be-section-label">{planning.curso_codigo_snapshot}</span><h2>{planning.nome}</h2><p>{planning.curso_nome_snapshot}</p></div><StatusBadge status={planning.status} /></div><dl className={styles.details}><div><dt>Início</dt><dd>{studentDate(planning.data_inicio)}</dd></div><div><dt>Modelo</dt><dd>{statusLabel(planning.modelo_estudo)}</dd></div><div><dt>Fase</dt><dd>{statusLabel(planning.fase)}</dd></div><div><dt>Metas por semana</dt><dd>{planning.metas_semanais}</dd></div><div><dt>Disciplinas</dt><dd>{workspace.disciplines.length}</dd></div><div><dt>Semana atual</dt><dd>{currentPlanningWeek(planning.data_inicio, studentTimeZone)}</dd></div></dl></Panel>
      <Feedback tone="info" message="Esta configuração é uma fotografia do catálogo no momento da criação. Alterações futuras no catálogo não modificam seu histórico." />
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

  function reviewsContent() {
    if (!workspace.reviews.length) return <Empty title="Nenhuma revisão disponível">As revisões serão criadas conforme a configuração do planejamento e o avanço nas aulas.</Empty>;
    return <div className={styles.cardList}>{workspace.reviews.map((review) => {
      const origin = lessonById.get(review.planejamento_aula_origem_id);
      const target = lessonById.get(review.planejamento_aula_revisada_id);
      return <article className={styles.itemCard} key={review.id}><div className={styles.itemMain}><span className={styles.itemEyebrow}>{review.etapa === "primeira" ? "Primeira revisão" : "Segunda revisão"}</span><strong>{target?.nome ?? "Aula de revisão"}</strong><small>Origem: {origin?.nome ?? "Aula anterior"} · prevista {studentDate(review.prevista_em)}</small></div><StatusBadge status={review.status} />{["pendente", "concluida"].includes(review.status) ? <button className="be-button" type="button" disabled={busy} onClick={() => void runRpc("concluir_revisao", { p_revisao_id: review.id, p_concluir: review.status !== "concluida" }, review.status === "concluida" ? "Conclusão da revisão desfeita." : "Revisão concluída.")}>{review.status === "concluida" ? "Desfazer" : "Concluir"}</button> : null}</article>;
    })}</div>;
  }

  function accessContent() {
    const access = workspace.access;
    if (!access) return <Empty title="Acesso ainda não registrado">Seu cadastro existe, mas não foi encontrada uma situação de acesso.</Empty>;
    const effectiveStatus = access.status_efetivo ?? access.status;
    const copy: Record<string, string> = {
      pendente: "Seu acesso ainda aguarda liberação. Você pode entrar na lista de espera para solicitar contato.",
      ativo: "Seu acesso acadêmico está liberado dentro do período informado.",
      bloqueado: `Seu acesso está bloqueado${access.motivo_bloqueio ? `: ${access.motivo_bloqueio}` : "."}`,
      expirado: "O período de acesso terminou. Solicite uma renovação ao seu professor ou atendimento.",
      cancelado: "O acesso foi cancelado. Entre na lista de espera se desejar novo atendimento.",
    };
    return <div className={styles.stack}>
      <Panel><div className={styles.detailHeader}><div><span className="be-section-label">Situação acadêmica</span><h2>{statusLabel(effectiveStatus)}</h2></div><StatusBadge status={effectiveStatus} /></div><p>{copy[effectiveStatus] ?? "Consulte o atendimento para obter detalhes."}</p><dl className={styles.details}><div><dt>Plano</dt><dd>{access.plano}</dd></div><div><dt>Início</dt><dd>{studentDate(access.inicio_em)}</dd></div><div><dt>Validade</dt><dd>{access.expira_em ? studentDate(access.expira_em) : "Sem expiração"}</dd></div>{access.bloqueado_em ? <div><dt>Bloqueado em</dt><dd>{studentDate(access.bloqueado_em, true)}</dd></div> : null}</dl></Panel>
      {effectiveStatus !== "ativo" ? <Link className="be-button be-button--primary" href="/aluno/lista-de-espera">Solicitar contato</Link> : null}
    </div>;
  }

  function waitlistContent() {
    const entry = workspace.waitlist;
    return <div className={styles.stack}>
      {entry ? <Panel><div className={styles.detailHeader}><div><span className="be-section-label">Solicitação enviada em {studentDate(entry.created_at)}</span><h2>{entry.concurso_foco}</h2></div><StatusBadge status={entry.status} /></div><p>{entry.status === "aguardando" ? "Recebemos seu interesse e entraremos em contato." : entry.status === "contatado" ? "Nosso time já iniciou seu atendimento." : entry.status === "convertido" ? "Seu atendimento foi concluído. Consulte agora a situação do acesso." : "Sua participação foi encerrada. Salvar os dados abaixo reativa a solicitação como aguardando."}</p></Panel> : <Feedback message="Informe seus interesses para solicitar contato. Nome e e-mail são lidos do seu perfil e não serão duplicados." />}
      <Panel title={entry?.status === "cancelado" ? "Reativar solicitação" : entry ? "Atualizar meus dados" : "Entrar na lista de espera"}>
        <form className={styles.formGrid} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void runRpc("atualizar_minha_lista_espera", { p_whatsapp: String(data.get("whatsapp") ?? ""), p_area_interesse: String(data.get("area") ?? ""), p_concurso_foco: String(data.get("concurso") ?? "") }, entry?.status === "cancelado" ? "Solicitação reativada como aguardando." : entry ? "Dados da lista atualizados." : "Você entrou na lista de espera.");
        }}>
          <label><span className="be-label">Nome</span><input className="be-input" value={workspace.profile?.nome ?? ""} disabled /></label>
          <label><span className="be-label">E-mail</span><input className="be-input" value={workspace.email} disabled /></label>
          <label><span className="be-label">WhatsApp</span><input className="be-input" name="whatsapp" type="tel" defaultValue={entry?.whatsapp ?? ""} required /></label>
          <label><span className="be-label">Área de interesse</span><input className="be-input" name="area" defaultValue={entry?.area_interesse ?? ""} required /></label>
          <label className={styles.spanTwo}><span className="be-label">Concurso em foco</span><input className="be-input" name="concurso" defaultValue={entry?.concurso_foco ?? ""} required /></label>
          <div className={styles.formActions}><SubmitButton busy={busy}>{entry?.status === "cancelado" ? "Reativar na lista" : entry ? "Salvar alterações" : "Entrar na lista"}</SubmitButton>{entry ? <button className="be-button be-button--danger" type="button" disabled={busy} onClick={() => { if (window.confirm("Deseja sair da lista de espera? Seu histórico será preservado.")) void runRpc("soft_delete_lista_espera", { p_id: entry.id, p_reason: "cancelamento solicitado pelo aluno" }, "Participação encerrada."); }}>Sair da lista</button> : null}</div>
        </form>
      </Panel>
    </div>;
  }

  function profileContent() {
    const profile = workspace.profile;
    if (!profile) return <Empty title="Perfil não encontrado">Não foi possível localizar os dados da sua conta.</Empty>;
    return <Panel title="Dados da conta" subtitle="O fuso horário é usado para agenda, sequência e datas de conclusão.">
      <form className={styles.formGrid} onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void runRpc("atualizar_meu_perfil", { p_nome: String(data.get("nome") ?? ""), p_telefone: String(data.get("telefone") ?? "") || null, p_fuso_horario: String(data.get("fuso") ?? "America/Sao_Paulo") }, "Perfil atualizado.");
      }}>
        <label><span className="be-label">Nome</span><input className="be-input" name="nome" minLength={2} defaultValue={profile.nome} required /></label>
        <label><span className="be-label">E-mail</span><input className="be-input" value={workspace.email} disabled /></label>
        <label><span className="be-label">Telefone</span><PhoneField name="telefone" defaultValue={profile.telefone} /></label>
        <label><span className="be-label">Fuso horário</span><select className="be-input" name="fuso" defaultValue={profile.fuso_horario}>{Intl.supportedValuesOf("timeZone").map((timeZone) => <option value={timeZone} key={timeZone}>{timeZone}</option>)}</select></label>
        <div className={styles.formActions}><SubmitButton busy={busy}>Salvar perfil</SubmitButton></div>
      </form>
    </Panel>;
  }

  const content: Record<string, () => ReactNode> = {
    inicio: homeContent,
    metas: goalsContent,
    "metas/:metaId": goalDetailContent,
    disciplinas: disciplinesContent,
    "disciplinas/:disciplinaId": disciplineDetailContent,
    aulas: lessonsContent,
    "aulas/:aulaId": lessonDetailContent,
    planejamento: planningContent,
    reforcos: reinforcementsContent,
    revisoes: reviewsContent,
    acesso: accessContent,
    "lista-de-espera": waitlistContent,
    perfil: profileContent,
  };

  return <div className={styles.workspace}>{messages}{content[route.pattern]?.() ?? <Empty title="Tela ainda indisponível">Esta área será implementada em uma próxima etapa.</Empty>}</div>;
}
