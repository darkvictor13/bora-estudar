import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { Badge } from "@bora/ui";
import type { ReactNode } from "react";

import type { Week } from "@/lib/api";
import { formatMinutes } from "@/lib/domain/week";

/**
 * O cabeçalho da semana — o `week-hero` da v2.
 *
 * Os quatro números coloridos são a identidade da tela, e por isso continuam
 * quatro e continuam coloridos. O que mudou foi de onde a cor vem: a v2 tinha
 * quatro degradês escritos à mão (`#0a3828`, `#2d1948`, …) que ignoravam o
 * tema e davam texto branco sobre fundo escuro em qualquer modo. Aqui cada
 * cartão é um PAPEL da paleta — o par `soft`/`main` que o
 * `packages/ui/src/contrast.test.ts` já mede nos dois temas.
 */
function WeekStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note: string;
  tone: "success" | "secondary" | "neutral" | "primary";
}) {
  return (
    <Box
      data-testid="week-stat"
      data-tone={tone}
      sx={(theme) => {
        const paint =
          tone === "neutral"
            ? {
                backgroundColor: theme.vars.palette.surface.sunken,
                color: theme.vars.palette.text.primary,
                borderColor: theme.vars.palette.surface.border,
              }
            : tone === "primary"
              ? {
                  backgroundColor: theme.vars.palette.accent.primarySoft,
                  color: theme.vars.palette.accent.primary,
                  borderColor: theme.vars.palette.accent.primaryBorder,
                }
              : tone === "secondary"
                ? {
                    backgroundColor: theme.vars.palette.accent.secondarySoft,
                    color: theme.vars.palette.accent.secondary,
                    borderColor: theme.vars.palette.accent.secondaryBorder,
                  }
                : {
                    backgroundColor: theme.vars.palette.success.soft,
                    color: theme.vars.palette.success.main,
                    borderColor: theme.vars.palette.success.border,
                  };

        return {
          px: 2,
          py: 1.75,
          borderRadius: `${theme.brand.radius.xl}px`,
          border: "1px solid",
          transition: theme.transitions.create("transform"),
          "&:hover": { transform: "translateY(-2px)" },
          ...paint,
        };
      }}
    >
      {/* `color: inherit` nos três: o cartão define a cor uma vez, e rótulo,
          número e nota a herdam em opacidades diferentes. Repetir o token em
          cada um deixaria três lugares para errar quando o papel mudar. */}
      <Typography
        variant="metricLabel"
        component="p"
        sx={{ color: "inherit", opacity: 0.8, mb: 0.75 }}
      >
        {label}
      </Typography>
      <Typography
        component="p"
        data-testid="week-stat-value"
        sx={{ color: "inherit", fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.03em" }}
      >
        {value}
      </Typography>
      <Typography variant="caption" component="p" sx={{ color: "inherit", opacity: 0.75, mt: 0.25 }}>
        {note}
      </Typography>
    </Box>
  );
}

export function WeekHero({ week }: { week: Week }) {
  const { summary } = week;
  const pct =
    summary.goalsTotal > 0 ? Math.round((summary.goalsCompleted / summary.goalsTotal) * 100) : 0;

  const subjects = new Set(week.days.flatMap((day) => day.goals.map((goal) => goal.subject))).size;
  const planned = week.days
    .flatMap((day) => day.goals)
    .reduce((sum, goal) => sum + goal.plannedMinutes, 0);

  const next = week.days.flatMap((day) => day.goals).find((goal) => goal.status !== "completed");

  return (
    <Box
      data-testid="week-hero"
      sx={(theme) => ({
        p: 2.5,
        mb: 2.5,
        borderRadius: `${theme.brand.radius.xl}px`,
        backgroundColor: theme.vars.palette.surface.raised,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        ...theme.applyStyles("light", { boxShadow: theme.vars.palette.elevation.md }),
      })}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, alignItems: "flex-start" }}>
        <Box>
          <Typography variant="metricLabel" component="p">
            Meta atual
          </Typography>
          <Typography
            component="p"
            sx={{ fontSize: "1.3125rem", fontWeight: 700, letterSpacing: "-0.03em", mt: 0.25 }}
          >
            Semana {week.weekNumber}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.375 }}>
            {subjects} {subjects === 1 ? "disciplina" : "disciplinas"} · {summary.goalsTotal}{" "}
            {summary.goalsTotal === 1 ? "meta" : "metas"} · {formatMinutes(planned)} planejadas
            {next ? ` · próxima: ${next.subject}` : ""}
          </Typography>
        </Box>
        <Badge tone={pct === 100 ? "success" : "accent"}>{pct}%</Badge>
      </Box>

      <LinearProgress
        variant="determinate"
        value={pct}
        aria-label={`${summary.goalsCompleted} de ${summary.goalsTotal} metas concluídas`}
        sx={{ height: 8, borderRadius: 999, my: 1.75 }}
      />

      <Box
        sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1.25,
          [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
        })}
      >
        <WeekStat
          tone="success"
          label="Desempenho"
          // `—` e não `0%`: zero por cento é uma afirmação ("errou tudo"), e
          // ausência de resposta não é.
          value={summary.score === null ? "—" : `${summary.score}%`}
          note={`${summary.correctAnswers}/${summary.questionsAnswered} acertos`}
        />
        <WeekStat
          tone="secondary"
          label="Tempo registrado"
          value={formatMinutes(summary.studiedMinutes)}
          note={`de ${formatMinutes(planned)}`}
        />
        <WeekStat
          tone="neutral"
          label="Questões"
          value={summary.questionsAnswered}
          note={`${summary.goalsCompleted}/${summary.goalsTotal} metas`}
        />
        <WeekStat
          tone="primary"
          label="Sequência"
          value={summary.streakDays}
          note={summary.streakDays === 1 ? "dia de estudo" : "dias de estudo"}
        />
      </Box>
    </Box>
  );
}
