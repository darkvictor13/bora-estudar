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
import { StudyCalendar } from "@/components/student/StudyCalendar";
import { StudyStreakDialog } from "@/components/student/StudyStreakDialog";
import { formatDayMonth } from "@/lib/domain/dates";
import { calendarDays, dailyQuestionPerformance, localDate, matchesSchedule, scheduleFilter } from "@/lib/domain/schedule";
import { defaultExtraDate } from "@/lib/domain/week";
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
import { fieldWidth } from "@/lib/ui/field-width";

/**
 * A semana do aluno — o `p-dashboard` da v2.
 *
 * A SEMANA ESCOLHIDA MORA NA URL (`?semana=3`), e não em estado de componente.
 * Três coisas saem de graça disso: o botão voltar do navegador funciona, o
 * endereço é compartilhável, e recarregar a página não devolve a pessoa para a
 * semana corrente depois de ela ter ido olhar a anterior.
 */
export async function overviewLoader({ request }: { request: Request }) {
  await requireStudentAccess(request);

  const plan = await api.loadActivePlanOrNull();
  if (!plan) return { plan: null, week: null, weeks: [] as readonly WeekOption[] };

  // AS SEMANAS VÊM PRIMEIRO, e as duas leituras não correm em paralelo de
  // propósito: `?semana=` só vale se for uma das semanas que o seletor oferece.
  // O resto — texto, negativo, `1e9`, uma semana sem meta — cai na CORRENTE, que
  // é o que `loadWeek` abre sem número e o que o seletor mostra (D-13, QA-13).
  // Sem isto o número chegava ao `Date` e `?semana=1e9` derrubava a tela.
  const weeks = await api.listWeeks(plan.id);
  const asked = Number(new URL(request.url).searchParams.get("semana"));
  const weekNumber = weeks.some((option) => option.weekNumber === asked) ? asked : undefined;

  const week = await api.loadWeek(plan.id, weekNumber);

  return { plan, week, weeks };
}

type LoaderData = Awaited<ReturnType<typeof overviewLoader>>;

function DayGroupCard({
  date,
  weekday,
  goals,
  actions,
  performance,
  emptyMessage,
}: {
  date: string;
  weekday: number;
  goals: readonly Goal[];
  actions: Parameters<typeof GoalRow>[0]["actions"];
  performance: ReturnType<typeof dailyQuestionPerformance>;
  emptyMessage?: string;
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
          {formatDayMonth(date)}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Typography variant="numeric" component="span" data-testid="day-count">
            {completed}/{goals.length}
          </Typography>
        </Box>
      </Box>

      {performance.questions > 0 && (
        <Box sx={(theme) => ({
          px: 1.75,
          py: 1,
          borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        })}>
          <Typography variant="caption" component="p" data-testid="day-question-performance" color="text.secondary">
            {performance.questions} questões · {performance.correct} acertos · {performance.wrong} erros · {performance.score}%
          </Typography>
        </Box>
      )}

      <Box sx={{ px: 1.75 }}>
        {goals.length === 0 && <Empty>{emptyMessage}</Empty>}
        {goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} actions={actions} />
        ))}
      </Box>
    </Box>
  );
}

export function Overview({ interactive = true }: { interactive?: boolean }) {
  const { plan, week, weeks } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();
  const { revalidate } = useRevalidator();

  const [recording, setRecording] = useState<Goal | null>(null);
  const [theory, setTheory] = useState<TheoryGoal | null>(null);
  const [theoryPending, setTheoryPending] = useState(false);
  const [theoryNotice, setTheoryNotice] = useState<string | null>(null);
  const [extraDate, setExtraDate] = useState<string | null>(() => {
    if (params.get("estudoExtra") !== "cronometro" || !week) return null;
    // `?dia=` só vale se for uma data da semana vista; senão, hoje (QA-14).
    const askedDay = params.get("dia");
    const selected = askedDay && askedDay >= week.startsOn && askedDay <= week.endsOn && /^\d{4}-\d{2}-\d{2}$/.test(askedDay) ? askedDay : null;
    return defaultExtraDate(week, selected, localDate());
  });
  const [streakOpen, setStreakOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const title = "Minha semana";

  if (!plan || !week) {
    return (
      <>
        <PageHeader title={title} />
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

    // A aula só muda quando o professor publica outra enquanto o modal está aberto.
    setTheoryNotice(
      before && fresh.lesson && fresh.lesson.id !== before
        ? `Nova aula disponível: ${fresh.lesson.lessonCode} — ${fresh.lesson.title}.`
        : null,
    );
    await revalidate();
  }

  /**
   * Registrar questões da teoria: liga o `pending`, chama a API e relê o modal.
   *
   * Devolve a falha, e `null` quando gravou. A falha NÃO vai para o `error` da
   * página, que fica atrás do modal: quem a mostra é o próprio `TheoryDialog`, e
   * quem decide quando a chave de retentativa muda é ele (só depois do sucesso).
   */
  async function recordTheory(
    write: (goalId: string) => Promise<{ ok: boolean; error?: ApiError }>,
  ): Promise<ApiError | null> {
    if (!theory) return null;
    setTheoryPending(true);
    try {
      const result = await write(theory.goalId);
      if (!result.ok && result.error) return result.error;
      await afterTheoryWrite(result, theory.goalId);
      return null;
    } finally {
      setTheoryPending(false);
    }
  }

  const actions = {
    onRecord: (goal: Goal) => setRecording(goal),
    onOpenTheory: (goal: Goal) => void openTheory(goal),
    onComplete: (goal: Goal) => void run(() => api.completeGoal(goal.id, newRequestId())),
    onReopen: (goal: Goal) => void run(() => api.reopenGoal(goal.id, newRequestId())),
    onSkip: (goal: Goal) => void run(() => api.skipGoal(goal.id, newRequestId())),
  };

  const subjects = [...new Set(week.days.flatMap((day) => day.goals.map((g) => g.subject)))];
  const days = calendarDays(week);
  const today = localDate();
  const askedDate = params.get("dia");
  const selectedDate = askedDate === "todos" ? null
    : days.some((day) => day.date === askedDate) ? askedDate
    : days.some((day) => day.date === today) ? today : week.startsOn;
  const filter = scheduleFilter(params.get("filtro"));
  const subject = subjects.includes(params.get("disciplina") ?? "") ? params.get("disciplina")! : "";
  const visibleDays = interactive
    ? days.filter((day) => !selectedDate || day.date === selectedDate)
      .map((day) => ({ ...day, goals: day.goals.filter((goal) => matchesSchedule(goal, filter, subject)) }))
    : week.days;
  const orderedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const currentIndex = orderedWeeks.findIndex((option) => option.weekNumber === week.weekNumber);
  const previous = currentIndex > 0 ? orderedWeeks[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? orderedWeeks[currentIndex + 1] : undefined;
  const theoryGoal = theory
    ? week.days.flatMap((day) => day.goals).find((goal) => goal.id === theory.goalId)
    : null;

  function changeParam(key: string, value: string | null) {
    const updated = new URLSearchParams(params);
    if (value === null) updated.delete(key);
    else updated.set(key, value);
    if (key === "semana") {
      updated.delete("dia");
      updated.delete("disciplina");
    }
    setParams(updated);
  }

  function closeExtraStudy() {
    setExtraDate(null);
    if (!params.has("estudoExtra")) return;
    const updated = new URLSearchParams(params);
    updated.delete("estudoExtra");
    setParams(updated, { replace: true });
  }

  return (
    <>
      <PageHeader
        title={title}
        description={plan.name}
        actions={
          <>
            {interactive && <Button size="small" variant="text" disabled={!previous} onClick={() => previous && changeParam("semana", String(previous.weekNumber))}>Semana anterior</Button>}
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
                changeParam("semana", event.target.value);
              }}
              sx={fieldWidth(200)}
            >
              {weeks.map((option) => (
                <MenuItem key={option.weekNumber} value={String(option.weekNumber)}>
                  Semana {option.weekNumber}
                  {option.isCurrent ? " · atual" : ""}
                </MenuItem>
              ))}
            </TextField>
            {interactive && <Button size="small" variant="text" disabled={!next} onClick={() => next && changeParam("semana", String(next.weekNumber))}>Próxima semana</Button>}
            <Button
              variant="outlined"
              size="small"
              onClick={() => setExtraDate(defaultExtraDate(week, interactive ? selectedDate : null, today))}
            >
              Estudo extra
            </Button>
          </>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}

        <WeekHero week={week} onOpenTheory={(goal) => void openTheory(goal)} onRecord={setRecording} onOpenStreak={() => setStreakOpen(true)} />

        {interactive && <StudyCalendar days={days} selectedDate={selectedDate} today={today}
          filter={filter} subject={subject} subjects={subjects} onChange={changeParam}
          onToday={() => {
            const updated = new URLSearchParams(params);
            updated.delete("semana");
            updated.delete("disciplina");
            updated.delete("filtro");
            updated.set("dia", today);
            setParams(updated);
          }} />}

        {!interactive && week.days.length === 0 ? (
          <Empty icon="🗓">Nenhuma meta para esta semana.</Empty>
        ) : (
          visibleDays.map((day) => (
            <DayGroupCard
              key={day.date}
              date={day.date}
              weekday={day.weekday}
              goals={day.goals}
              actions={actions}
              performance={dailyQuestionPerformance(week, day.date)}
              emptyMessage={filter !== "all" || subject ? "Nenhuma meta corresponde aos filtros neste dia." : "Dia livre: nenhuma meta programada. Você pode registrar um estudo extra."}
            />
          ))
        )}
      </ContentBody>

      <RecordStudyDialog
        // Uma instância por meta: o `requestId` nasce ao abrir (ver o diálogo). O
        // prefixo importa: o `TheoryDialog` irmão usa "closed" na mesma lista, e
        // duas chaves iguais fazem o React acusar duplicata.
        key={`record-${recording?.id ?? "closed"}`}
        goal={recording}
        onClose={() => setRecording(null)}
        onSubmit={(input: RecordStudyInput) => run(() => api.recordStudy(input))}
      />

      <StudyStreakDialog open={streakOpen} onClose={() => setStreakOpen(false)} startsOn={plan.startsOn} />

      <TheoryDialog
        key={theory?.lesson?.id ?? "closed"}
        theory={theory}
        questionStats={theoryGoal ? { answered: theoryGoal.questionsAnswered, correct: theoryGoal.correctAnswers } : null}
        dayPerformance={dailyQuestionPerformance(week, selectedDate ?? today)}
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
        onRecordQuestions={(input) =>
          recordTheory((goalId) => api.recordInitialQuestions({ ...input, goalId }))
        }
        onRecordReview={(input) => recordTheory(() => api.recordReviewQuestions(input))}
      />

      {extraDate !== null && <ExtraStudyDialog
        key={extraDate}
        studyPlanId={plan.id}
        date={extraDate}
        minDate={plan.startsOn}
        maxDate={today}
        subjects={subjects}
        open={extraDate !== null}
        onClose={closeExtraStudy}
        onSubmit={(input: ExtraStudyInput) => run(() => api.recordExtraStudy(input))}
      />}
    </>
  );
}
