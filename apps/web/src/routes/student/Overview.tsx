import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Empty, PageHeader, WEEKDAY_NAMES } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { ExtraStudyDialog } from "@/components/student/ExtraStudyDialog";
import { GoalRow } from "@/components/student/GoalRow";
import { WeekHero } from "@/components/student/WeekHero";
import {
  api,
  newRequestId,
  type ApiError,
  type ExtraStudyInput,
  type Goal,
  type RecordStudyInput,
  type TheoryGoal,
  type WeekOption,
} from "@/lib/api";
import { RecordStudyDialog } from "@/components/student/RecordStudyDialog";
import { TheoryDialog } from "@/components/student/TheoryDialog";
import { requireStudentAccess } from "@/lib/auth/session";
import { loadActivePlanOrNull } from "@/lib/api/supabase/plan.ts";

/**
 * A semana do aluno — o `p-dashboard` da v2.
 *
 * A SEMANA ESCOLHIDA MORA NA URL (`?semana=3`), e não em estado de componente.
 * Três coisas saem de graça disso: o botão voltar do navegador funciona, o
 * endereço é compartilhável, e recarregar a página não devolve a pessoa para a
 * semana corrente depois de ela ter ido olhar a anterior.
 */
export async function overviewLoader({ request }: { request: Request }) {
  await requireStudentAccess();

  const plan = await loadActivePlanOrNull();
  if (!plan) return { plan: null, week: null, weeks: [] as readonly WeekOption[] };

  const asked = new URL(request.url).searchParams.get("semana");
  const weekNumber = asked ? Number(asked) : undefined;

  const [week, weeks] = await Promise.all([
    api.loadWeek(plan.id, Number.isFinite(weekNumber) ? weekNumber : undefined),
    api.listWeeks(plan.id),
  ]);

  return { plan, week, weeks };
}

type LoaderData = Awaited<ReturnType<typeof overviewLoader>>;

function DayGroupCard({
  date,
  weekday,
  goals,
  actions,
  onExtra,
}: {
  date: string;
  weekday: number;
  goals: readonly Goal[];
  actions: Parameters<typeof GoalRow>[0]["actions"];
  onExtra: (date: string) => void;
}) {
  const completed = goals.filter((goal) => goal.status === "completed").length;

  return (
    <Box
      data-testid="day-group"
      data-date={date}
      sx={(theme) => ({
        mb: 1.25,
        borderRadius: `${theme.brand.radius.lg}px`,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        backgroundColor: theme.vars.palette.surface.raised,
        overflow: "hidden",
      })}
    >
      <Box
        sx={(theme) => ({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
          px: 1.75,
          py: 1.125,
          backgroundColor: theme.vars.palette.surface.sunken,
          borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        })}
      >
        <Typography variant="overline" component="h2" sx={{ fontSize: "0.6875rem" }}>
          {WEEKDAY_NAMES[weekday - 1]}
          {" · "}
          {date.slice(8, 10)}/{date.slice(5, 7)}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Button size="small" variant="text" onClick={() => onExtra(date)}>
            Estudo extra
          </Button>
          <Typography variant="numeric" component="span" data-testid="day-count">
            {completed}/{goals.length} concluídas
          </Typography>
        </Box>
      </Box>

      <Box sx={{ px: 1.75 }}>
        {goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} actions={actions} />
        ))}
      </Box>
    </Box>
  );
}

export function Overview() {
  const { plan, week, weeks } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();
  const { revalidate } = useRevalidator();

  const [recording, setRecording] = useState<Goal | null>(null);
  const [theory, setTheory] = useState<TheoryGoal | null>(null);
  const [theoryPending, setTheoryPending] = useState(false);
  const [theoryNotice, setTheoryNotice] = useState<string | null>(null);
  const [extraDate, setExtraDate] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  if (!plan || !week) {
    return (
      <>
        <PageHeader title="Metas da semana" />
        <ContentBody>
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        </ContentBody>
      </>
    );
  }

  /**
   * Toda ação segue o mesmo caminho: chama, guarda o erro se houver, e revalida.
   *
   * `revalidate()` e não um `setState` com a meta devolvida: a conclusão de uma
   * meta muda o cabeçalho da semana inteiro — desempenho, tempo, sequência —, e
   * costurar isso à mão em três lugares é como nascem os números que divergem.
   */
  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>) {
    const result = await action();
    if (!result.ok && result.error) {
      setError(result.error);
      return result.error;
    }
    setError(null);
    await revalidate();
    return null;
  }

  /**
   * O modal da teoria guarda o `TheoryGoal` em estado, e não no loader.
   *
   * Ele é caro — catálogo, progresso e regras de revisão — e só interessa a
   * quem clicou numa meta de teoria. Carregar tudo no loader faria a semana
   * inteira esperar por dado que a maior parte das visitas não abre.
   */
  async function openTheory(goal: Goal) {
    setTheoryPending(true);
    setTheoryNotice(null);
    try {
      setTheory(await api.loadTheoryGoal(goal.id));
    } catch (failure) {
      setError({
        code: "unknown",
        message: failure instanceof Error ? failure.message : "Não foi possível abrir a teoria.",
      });
    } finally {
      setTheoryPending(false);
    }
  }

  /** Reescreve o modal com o estado que o servidor acabou de confirmar. */
  async function afterTheoryWrite(result: { ok: boolean; error?: ApiError }, goalId: string) {
    if (!result.ok && result.error) {
      setError(result.error);
      return;
    }
    setError(null);

    const before = theory?.lesson?.id ?? null;
    const fresh = await api.loadTheoryGoal(goalId);
    setTheory(fresh);

    // A AULA MUDOU PORQUE A ANTERIOR FECHOU — o passo 7 do piloto da v108.2, e
    // o único momento em que o modal troca de conteúdo sozinho. Sem o aviso, a
    // Aula 02 aparece do nada e a pessoa acha que perdeu o que fez.
    setTheoryNotice(
      before && fresh.lesson && fresh.lesson.id !== before
        ? `Aula concluída. Você está agora em ${fresh.lesson.lessonCode} — ${fresh.lesson.title}.`
        : null,
    );
    await revalidate();
  }

  const actions = {
    onRecord: (goal: Goal) => setRecording(goal),
    onOpenTheory: (goal: Goal) => void openTheory(goal),
    onComplete: (goal: Goal) => void run(() => api.completeGoal(goal.id, newRequestId())),
    onReopen: (goal: Goal) => void run(() => api.reopenGoal(goal.id, newRequestId())),
    onSkip: (goal: Goal) => void run(() => api.skipGoal(goal.id, newRequestId())),
  };

  const subjects = [...new Set(week.days.flatMap((day) => day.goals.map((g) => g.subject)))];
  const weekOf = weeks.find((option) => option.weekNumber === week.weekNumber);

  return (
    <>
      <PageHeader
        title="Metas da semana"
        description={plan.name}
        actions={
          <>
            <TextField
              select
              size="small"
              label="Semana"
              // O testid vai no SELECT, não na raiz do TextField: a raiz é um
              // <div> que não abre o menu no clique, e um seletor que aponta
              // para o lugar errado falha com "timeout" em vez de dizer isso.
              slotProps={{
                select: { inputProps: { "data-testid": "week-select" } },
              }}
              value={String(week.weekNumber)}
              onChange={(event) => {
                params.set("semana", event.target.value);
                setParams(params);
              }}
              sx={{ minWidth: 200 }}
            >
              {weeks.map((option) => (
                <MenuItem key={option.weekNumber} value={String(option.weekNumber)}>
                  Semana {option.weekNumber}
                  {option.isCurrent ? " · atual" : ""}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setExtraDate(weekOf?.startsOn ?? week.startsOn)}
            >
              Estudo extra
            </Button>
          </>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}

        <WeekHero week={week} />

        {week.days.length === 0 ? (
          <Empty icon="🗓">Nenhuma meta para esta semana.</Empty>
        ) : (
          week.days.map((day) => (
            <DayGroupCard
              key={day.date}
              date={day.date}
              weekday={day.weekday}
              goals={day.goals}
              actions={actions}
              onExtra={setExtraDate}
            />
          ))
        )}
      </ContentBody>

      <RecordStudyDialog
        goal={recording}
        onClose={() => setRecording(null)}
        onSubmit={(input: RecordStudyInput) => run(() => api.recordStudy(input))}
      />

      <TheoryDialog
        theory={theory}
        notice={theoryNotice}
        error={null}
        pending={theoryPending}
        onClose={() => setTheory(null)}
        onSaveProgress={(input) => {
          if (!theory) return;
          setTheoryPending(true);
          void api
            .saveTheoryProgress({ ...input, goalId: theory.goalId })
            .then((result) => afterTheoryWrite(result, theory.goalId))
            .finally(() => setTheoryPending(false));
        }}
        onRecordQuestions={(input) => {
          if (!theory) return;
          setTheoryPending(true);
          void api
            .recordInitialQuestions({ ...input, goalId: theory.goalId })
            .then((result) => afterTheoryWrite(result, theory.goalId))
            .finally(() => setTheoryPending(false));
        }}
        onRecordReview={(input) => {
          if (!theory) return;
          setTheoryPending(true);
          void api
            .recordReviewQuestions(input)
            .then((result) => afterTheoryWrite(result, theory.goalId))
            .finally(() => setTheoryPending(false));
        }}
      />

      <ExtraStudyDialog
        studyPlanId={plan.id}
        date={extraDate ?? week.startsOn}
        subjects={subjects}
        open={extraDate !== null}
        onClose={() => setExtraDate(null)}
        onSubmit={(input: ExtraStudyInput) => run(() => api.recordExtraStudy(input))}
      />
    </>
  );
}
