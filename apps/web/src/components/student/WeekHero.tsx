import ArrowForwardIcon from "@mui/icons-material/ArrowForwardOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

import type { Goal, Week } from "@/lib/api";
import { formatMinutes } from "@/lib/domain/week";

type StatTone = "answers" | "questions" | "time" | "streak";

const STAT_TONES = {
  answers: {
    light: { background: "linear-gradient(145deg, #D7F2E4 0%, #ACDCC9 62%, #8FC8B4 100%)", border: "#82BBA7", text: "#103D30" },
    dark: { background: "linear-gradient(145deg, #1A4B3B 0%, #102D25 68%, #0B201A 100%)", border: "#437B64", text: "#E5FFF0" },
  },
  questions: {
    light: { background: "linear-gradient(145deg, #65ECD8 0%, #18B9A4 62%, #0C9786 100%)", border: "#0B9C89", text: "#092F2B" },
    dark: { background: "linear-gradient(145deg, #0C786B 0%, #0B4A43 68%, #07362F 100%)", border: "#2FAF9B", text: "#F4FFFC" },
  },
  time: {
    light: { background: "linear-gradient(145deg, #378F80 0%, #14594F 65%, #0C4139 100%)", border: "#145A50", text: "#FFFFFF" },
    dark: { background: "linear-gradient(145deg, #2A6E63 0%, #12332F 68%, #0A2420 100%)", border: "#427F72", text: "#FFFFFF" },
  },
  streak: {
    light: { background: "linear-gradient(145deg, #3C5250 0%, #172324 67%, #0D1516 100%)", border: "#273E3B", text: "#FFFFFF" },
    dark: { background: "linear-gradient(145deg, #304944 0%, #0C1014 70%, #050708 100%)", border: "#4E7569", text: "#E8FFF2" },
  },
} as const;

function WeekStat({ label, value, note, tone, onClick }: { label: string; value: string | number; note: string; tone: StatTone; onClick?: (() => void) | undefined }) {
  const paint = STAT_TONES[tone];
  return (
    <Box component={onClick ? "button" : "div"} type={onClick ? "button" : undefined} onClick={onClick} aria-label={onClick ? `${label}: ${value} ${note}. Abrir calendário de constância` : undefined} data-testid="week-stat" sx={(theme) => ({
      minWidth: 0,
      width: "100%",
      textAlign: "left",
      cursor: onClick ? "pointer" : "default",
      p: { xs: 1.25, md: 1.5 },
      borderRadius: `${theme.brand.radius.lg}px`,
      border: `1px solid ${paint.light.border}`,
      backgroundImage: paint.light.background,
      color: paint.light.text,
      transform: "translateY(0)",
      boxShadow: "0 14px 24px -14px rgba(18, 60, 50, 0.62), 0 3px 7px -4px rgba(8, 42, 35, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -3px 6px rgba(8, 42, 35, 0.16)",
      transition: theme.transitions.create(["transform", "box-shadow"]),
      "&:hover": onClick ? { transform: "translateY(-2px)", boxShadow: "0 18px 30px -15px rgba(18, 60, 50, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -3px 7px rgba(8, 42, 35, 0.18)" } : undefined,
      "&:focus-visible": onClick ? { outline: `3px solid ${theme.vars.palette.accent.primary}`, outlineOffset: 3 } : undefined,
      ...theme.applyStyles("dark", {
        borderColor: paint.dark.border,
        backgroundImage: paint.dark.background,
        color: paint.dark.text,
        boxShadow: "0 15px 26px -13px rgba(0, 0, 0, 0.95), 0 3px 8px -4px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -3px 7px rgba(0, 0, 0, 0.32)",
      }),
    })}>
      <Typography variant="metricLabel" component="p" sx={{ mb: 0.25, color: "inherit" }}>{label}</Typography>
      <Typography component="p" data-testid="week-stat-value" sx={{ fontSize: { xs: "1.125rem", md: "1.35rem" }, fontWeight: 800, letterSpacing: "-0.035em", color: "inherit" }}>
        {value}
      </Typography>
      <Typography variant="caption" component="p" sx={{ color: "inherit" }}>{note}</Typography>
    </Box>
  );
}

/** A próxima atividade tem prioridade; os números da semana dão contexto. */
export function WeekHero({
  week,
  onOpenTheory,
  onRecord,
  onOpenStreak,
}: {
  week: Week;
  onOpenTheory?: (goal: Goal) => void;
  onRecord?: (goal: Goal) => void;
  onOpenStreak?: () => void;
}) {
  const { summary } = week;
  const goals = week.days.flatMap((day) => day.goals);
  const actionable = goals.filter((goal) => goal.type !== "question_block");
  const next = actionable.find((goal) => goal.type === "theory" && goal.status === "in_progress")
    ?? actionable.find((goal) => goal.type === "theory" && goal.status === "pending")
    ?? actionable.find((goal) => goal.status === "in_progress")
    ?? actionable.find((goal) => goal.status === "pending")
    ?? null;
  const planned = goals.reduce((sum, goal) => sum + goal.plannedMinutes, 0);
  const pct = summary.goalsTotal > 0
    ? Math.round((summary.goalsCompleted / summary.goalsTotal) * 100)
    : 0;
  const canOpenTheory = next?.type === "theory" && Boolean(next.theory) && Boolean(onOpenTheory);
  const canRecord = Boolean(next && onRecord);

  return (
    <Box
      data-testid="week-hero"
      sx={(theme) => ({
        mb: 2.5,
        borderRadius: `${theme.brand.radius.xl}px`,
        backgroundColor: theme.vars.palette.surface.raised,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        overflow: "hidden",
        ...theme.applyStyles("dark", {
          backgroundImage: `radial-gradient(ellipse at 88% 0%, ${theme.vars.palette.accent.primarySoftHover}, transparent 58%), linear-gradient(145deg, ${theme.vars.palette.surface.overlay}, ${theme.vars.palette.surface.raised} 62%, ${theme.vars.palette.surface.sunken})`,
          boxShadow: "0 22px 42px -28px rgba(0, 0, 0, 0.95), 0 5px 14px -10px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }),
        ...theme.applyStyles("light", { boxShadow: theme.vars.palette.elevation.md }),
      })}
    >
      <Box sx={(theme) => ({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        p: { xs: 2, md: 2.75 },
        borderLeft: `4px solid ${theme.vars.palette.accent.primary}`,
      })}>
        <Box sx={{ flex: "1 1 340px", minWidth: 0 }}>
          <Typography variant="metricLabel" component="p" sx={(theme) => ({ color: theme.vars.palette.accent.primary })}>
            {next ? "PRÓXIMO PASSO" : "SEMANA CONCLUÍDA"}
          </Typography>
          <Typography component="h2" sx={{ fontSize: { xs: "1.4rem", md: "1.8rem" }, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.035em", mt: 0.5 }}>
            {next ? (next.lesson ?? next.title) : "Bom trabalho nesta semana"}
          </Typography>
          <Typography variant="body2" component="p" sx={{ mt: 0.75 }}>
            {next
              ? `${next.subject} · ${next.type === "theory" ? "Aula" : "Atividade"} · ${formatMinutes(next.plannedMinutes)} previstos`
              : "Todas as atividades planejadas foram concluídas."}
          </Typography>
        </Box>
        {(canOpenTheory || canRecord) && next && (
          <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => canOpenTheory ? onOpenTheory?.(next) : onRecord?.(next)}>
            {canOpenTheory ? "Abrir aula" : "Registrar estudo"}
          </Button>
        )}
      </Box>

      <Box sx={(theme) => ({
        px: { xs: 2, md: 2.75 },
        pb: 2,
        borderTop: `1px solid ${theme.vars.palette.surface.border}`,
        backgroundColor: theme.vars.palette.surface.sunken,
        ...theme.applyStyles("dark", {
          backgroundImage: `linear-gradient(165deg, ${theme.vars.palette.surface.raised}, ${theme.vars.palette.surface.sunken} 72%)`,
          boxShadow: "inset 0 5px 12px -10px rgba(0, 0, 0, 0.95)",
        }),
      })}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, pt: 1.75, mb: 0.75 }}>
          <Typography variant="body2" component="p" sx={{ fontWeight: 600 }}>Semana {week.weekNumber}</Typography>
          <Typography variant="body2" component="p">{summary.goalsCompleted} de {summary.goalsTotal} atividades · {pct}%</Typography>
        </Box>
        <LinearProgress variant="determinate" value={pct} aria-label={`${summary.goalsCompleted} de ${summary.goalsTotal} metas concluídas`} sx={{ height: 5, borderRadius: 999 }} />
        <Box sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 2,
          mt: 2,
          [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
        })}>
          <WeekStat label="ACERTOS" value={`${summary.correctAnswers}/${summary.questionsAnswered}`} note={summary.score === null ? "Ainda sem questões" : `${summary.score}% de aproveitamento`} tone="answers" />
          <WeekStat label="QUESTÕES FEITAS" value={summary.questionsAnswered} note="nesta semana" tone="questions" />
          <WeekStat label="TEMPO ESTUDADO" value={formatMinutes(summary.studiedMinutes)} note={`de ${formatMinutes(planned)} planejadas`} tone="time" />
          <WeekStat label="SEQUÊNCIA" value={summary.streakDays} note={summary.streakDays === 1 ? "dia de estudo" : "dias de estudo"} tone="streak" onClick={onOpenStreak} />
        </Box>
      </Box>
    </Box>
  );
}
