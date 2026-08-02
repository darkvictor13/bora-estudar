"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { currentPlanningWeek, errorMessage, formatDate } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchAllRows, fetchAllRowsInBatches } from "@/lib/supabase/pagination";
import { InlineLoadingIndicator, LoadingSkeleton } from "@/components/states/LoadingSkeleton";

import {
  Empty,
  Feedback,
  DISCIPLINE_COLUMNS,
  GOAL_COLUMNS,
  LESSON_COLUMNS,
  NOTEBOOK_COLUMNS,
  StudentDomainProvider,
  emptyWorkspace,
  resourcesForRoute,
  skeletonVariantForRoute,
  type AcademicAccess,
  type Goal,
  type LessonProgress,
  type Planning,
  type PlanningDiscipline,
  type PlanningLesson,
  type PlanningNotebook,
  type Profile,
  type Review,
  type StudentWorkspace,
  type WaitlistEntry,
} from "./student/shared";
import styles from "./StudentDomainPage.module.css";

const loading = () => <LoadingSkeleton label="Carregando módulo do aluno" variant="detail" />;
const StudentGoalRoutes = dynamic(() => import("./student/StudentGoalRoutes").then((module) => module.StudentFeatureRoutes), { loading });
const StudentStudyRoutes = dynamic(() => import("./student/StudentStudyRoutes").then((module) => module.StudentFeatureRoutes), { loading });
const StudentPlanningRoute = dynamic(() => import("./student/StudentPlanningRoute").then((module) => module.StudentFeatureRoutes), { loading });
const StudentAccessRoutes = dynamic(() => import("./student/StudentAccessRoutes").then((module) => module.StudentFeatureRoutes), { loading });
const StudentProfileRoute = dynamic(() => import("./student/StudentProfileRoute").then((module) => module.StudentFeatureRoutes), { loading });

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
  const loadRequestId = useRef(0);
  const selectedWeekRef = useRef(1);

  const loadWorkspace = useCallback(async (
    mode: "initial" | "refresh" = "refresh",
    weekOverride?: number,
  ) => {
    const requestId = ++loadRequestId.current;
    if (mode === "initial") {
      setLoading(true);
      setWorkspace(emptyWorkspace);
    } else {
      setRefreshing(true);
    }
    setFailure("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Sessão do aluno não encontrada.");

      const userId = authData.user.id;
      const needs = resourcesForRoute(route.pattern);
      const [profileResult, accessResult, planningResult, waitlistResult] = await Promise.all([
        supabase.from("profiles").select("id,nome,telefone,fuso_horario,ativo").eq("id", userId).maybeSingle(),
        needs.access
          ? supabase.from("acessos_aluno_efetivos").select("*").eq("aluno_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        needs.planning
          ? supabase.from("planejamentos").select("id,nome,curso_codigo_snapshot,curso_nome_snapshot,fase,modelo_estudo,metas_semanais,data_inicio,status").eq("aluno_id", userId).eq("status", "ativo").maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        needs.waitlist
          ? supabase.from("lista_espera").select("id,professor_id,whatsapp,area_interesse,concurso_foco,status,created_at,updated_at").eq("aluno_id", userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const firstError = profileResult.error ?? accessResult.error ?? planningResult.error ?? waitlistResult.error;
      if (firstError) throw firstError;

      const planning = planningResult.data as Planning | null;
      const profile = profileResult.data as Profile | null;
      const requestedWeek = weekOverride
        ?? (typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("semana")));
      const queryWeek = requestedWeek > 0
        ? requestedWeek
        : planning ? currentPlanningWeek(planning.data_inicio, profile?.fuso_horario) : 1;
      let disciplines: PlanningDiscipline[] = [];
      let notebooks: PlanningNotebook[] = [];
      let lessons: PlanningLesson[] = [];
      let goals: Goal[] = [];
      let lessonProgress: LessonProgress[] = [];
      let reviews: Review[] = [];

      if (planning) {
        if (needs.disciplines) {
          disciplines = await fetchAllRows<PlanningDiscipline>((from, to) => supabase
            .from("planejamento_disciplinas")
            .select(DISCIPLINE_COLUMNS)
            .eq("planejamento_id", planning.id)
            .order("ordem")
            .order("id", { ascending: true })
            .range(from, to));
        }

        if (needs.goals === "dashboard") {
          const [weekGoals, activeReinforcements] = await Promise.all([
            fetchAllRows<Goal>((from, to) => supabase.from("metas").select(GOAL_COLUMNS).eq("planejamento_id", planning.id).eq("semana_numero", queryWeek).order("dia_semana").order("ordem_dia").order("id", { ascending: true }).range(from, to)),
            fetchAllRows<Goal>((from, to) => supabase.from("metas").select(GOAL_COLUMNS).eq("planejamento_id", planning.id).eq("tipo", "reforco").in("status", ["pendente", "em_andamento"]).order("id", { ascending: true }).range(from, to)),
          ]);
          goals = [...new Map([...weekGoals, ...activeReinforcements].map((goal) => [goal.id, goal])).values()];
        } else if (needs.goals === "week") {
          goals = await fetchAllRows<Goal>((from, to) => supabase.from("metas").select(GOAL_COLUMNS).eq("planejamento_id", planning.id).eq("semana_numero", queryWeek).order("dia_semana").order("ordem_dia").order("id", { ascending: true }).range(from, to));
        } else if (needs.goals === "detail") {
          goals = await fetchAllRows<Goal>((from, to) => supabase.from("metas").select(GOAL_COLUMNS).eq("planejamento_id", planning.id).eq("id", route.params.metaId).order("id", { ascending: true }).range(from, to));
        } else if (needs.goals === "reinforcements") {
          goals = await fetchAllRows<Goal>((from, to) => supabase.from("metas").select(GOAL_COLUMNS).eq("planejamento_id", planning.id).in("tipo", ["bloco", "reforco"]).order("semana_numero", { ascending: false }).order("dia_semana").order("id", { ascending: true }).range(from, to));
        }

        const disciplineIds = disciplines.map((item) => item.id);
        if (disciplineIds.length && needs.notebooks) {
          notebooks = await fetchAllRowsInBatches<PlanningNotebook, string>(disciplineIds, (ids, from, to) => supabase
            .from("planejamento_cadernos")
            .select(NOTEBOOK_COLUMNS)
            .in("planejamento_disciplina_id", ids)
            .order("ordem")
            .order("id", { ascending: true })
            .range(from, to));
        }
        if (disciplineIds.length && needs.lessons) {
          lessons = await fetchAllRowsInBatches<PlanningLesson, string>(disciplineIds, (ids, from, to) => supabase
            .from("planejamento_aulas")
            .select(LESSON_COLUMNS)
            .in("planejamento_disciplina_id", ids)
            .order("ordem")
            .order("id", { ascending: true })
            .range(from, to));
        }
        if (needs.lessonProgress && lessons.length) {
          lessonProgress = await fetchAllRowsInBatches<LessonProgress, string>(lessons.map((lesson) => lesson.id), (ids, from, to) => supabase
            .from("progresso_aulas")
            .select("id,planejamento_aula_id,teoria_concluida_em,caderno_concluido_em")
            .eq("aluno_id", userId)
            .in("planejamento_aula_id", ids)
            .order("id", { ascending: true })
            .range(from, to));
        }
        if (needs.reviews) {
          reviews = await fetchAllRows<Review>((from, to) => {
            let query = supabase
              .from("revisoes")
              .select("id,planejamento_aula_origem_id,planejamento_aula_revisada_id,etapa,status,prevista_em,concluida_em")
              .eq("aluno_id", userId);
            if (route.pattern === "inicio") query = query.eq("status", "pendente");
            return query.order("prevista_em").order("id", { ascending: true }).range(from, to);
          });
        }
      }

      if (requestId !== loadRequestId.current) return;
      setWorkspace({
        userId,
        email: authData.user.email ?? "",
        profile,
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
        selectedWeekRef.current = Math.max(1, queryWeek);
        setSelectedWeek(selectedWeekRef.current);
      }
    } catch (error) {
      if (requestId === loadRequestId.current) {
        setFailure(errorMessage(error, "Não foi possível carregar os dados do aluno."));
      }
    } finally {
      if (requestId === loadRequestId.current) {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    }
  }, [route.params.metaId, route.pattern]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorkspace("initial");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      loadRequestId.current += 1;
    };
  }, [loadWorkspace]);

  const runRpc = useCallback(async (name: string, parameters: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    setFailure("");
    setSuccess("");
    try {
      const { error } = await getSupabaseBrowserClient().rpc(name, parameters);
      if (error) throw error;
      setSuccess(successMessage);
      await loadWorkspace("refresh", selectedWeekRef.current);
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
    selectedWeekRef.current = week;
    setSelectedWeek(week);
    router.replace(`${pathname}?semana=${week}`, { scroll: false });
    void loadWorkspace("refresh", week);
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


  const contextValue = {
    busy,
    disciplineById,
    lessonById,
    notebookById,
    progressByLesson,
    runRpc,
    selectedWeek,
    setWeek,
    studentDate,
    studentTimeZone,
    workspace,
  };

  let content: ReactNode;
  if (["inicio", "metas", "metas/:metaId", "reforcos"].includes(route.pattern)) content = <StudentGoalRoutes route={route} />;
  else if (["disciplinas", "disciplinas/:disciplinaId", "aulas", "aulas/:aulaId", "revisoes"].includes(route.pattern)) content = <StudentStudyRoutes route={route} />;
  else if (route.pattern === "planejamento") content = <StudentPlanningRoute route={route} />;
  else if (["acesso", "lista-de-espera"].includes(route.pattern)) content = <StudentAccessRoutes route={route} />;
  else if (route.pattern === "perfil") content = <StudentProfileRoute route={route} />;
  else content = <Empty title="Tela ainda indisponível">Esta área será implementada em uma próxima etapa.</Empty>;

  return <StudentDomainProvider value={contextValue}><div className={styles.workspace}>{messages}{content}</div></StudentDomainProvider>;
}
