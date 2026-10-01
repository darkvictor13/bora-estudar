import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Card, WEEKDAY_NAMES } from "@bora/ui";
import type { DayGroup } from "@/lib/api";
import type { ScheduleFilter } from "@/lib/domain/schedule";
import { formatMinutes } from "@/lib/domain/week";

export function StudyCalendar({ days, selectedDate, today, filter, subject, subjects, onChange, onToday }: {
  days: readonly DayGroup[];
  selectedDate: string | null;
  today: string;
  filter: ScheduleFilter;
  subject: string;
  subjects: readonly string[];
  onChange: (key: string, value: string | null) => void;
  onToday: () => void;
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Card title="Agenda de estudos" sub="Selecione um dia para abrir suas metas" action={
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" variant="text" onClick={onToday}>Hoje</Button>
          <Button size="small" variant="outlined" onClick={() => onChange("dia", "todos")} aria-pressed={selectedDate === null}>Semana inteira</Button>
        </Box>
      }>
        <Box aria-label="Dias da semana" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))", xl: "repeat(7, minmax(0, 1fr))" }, gap: 1 }}>
          {days.map((day) => {
            const completed = day.goals.filter((goal) => goal.status === "completed").length;
            const planned = day.goals.reduce((sum, goal) => sum + goal.plannedMinutes, 0);
            const names = [...new Set(day.goals.map((goal) => goal.subject))];
            const dateLabel = `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`;
            const selected = day.date === selectedDate;
            return (
              <Button key={day.date} variant={selected ? "contained" : "outlined"}
                onClick={() => onChange("dia", day.date)} aria-pressed={selected}
                aria-label={`${WEEKDAY_NAMES[day.weekday - 1]}, ${dateLabel}${day.date === today ? ", hoje" : ""}, ${completed} de ${day.goals.length} metas concluídas`}
                data-testid="schedule-day" data-date={day.date}
                sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", textTransform: "none", minWidth: 0, p: 1.5, gap: 0.75 }}>
                <Typography component="span" sx={{ fontSize: "0.75rem", fontWeight: 600, color: "inherit" }}>{WEEKDAY_NAMES[day.weekday - 1]}{day.date === today ? " · Hoje" : ""}</Typography>
                <Typography component="span" variant="numeric" sx={{ color: "inherit" }}>{dateLabel}</Typography>
                <Typography component="span" sx={{ fontSize: "0.75rem", color: "inherit", flex: 1 }}>{names.length ? names.join(" · ") : "Dia livre"}</Typography>
                <LinearProgress variant="determinate" value={day.goals.length ? completed / day.goals.length * 100 : 0}
                  aria-label={`${dateLabel}: ${completed} de ${day.goals.length} metas concluídas`}
                  sx={{ mt: 1, height: 4, borderRadius: 1, backgroundColor: "transparent", border: "1px solid currentColor", "& .MuiLinearProgress-bar": { backgroundColor: "currentColor" } }} />
                <Typography component="span" sx={{ fontSize: "0.6875rem", color: "inherit" }}>{completed}/{day.goals.length} metas · {formatMinutes(planned)}</Typography>
              </Button>
            );
          })}
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}>
          <TextField select label="Mostrar" size="small" value={filter} onChange={(event) => onChange("filtro", event.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="all">Todas as metas</MenuItem>
            <MenuItem value="pending">Pendentes e em andamento</MenuItem>
            <MenuItem value="completed">Concluídas</MenuItem>
            <MenuItem value="reviews">Revisões e reforços</MenuItem>
          </TextField>
          <TextField select label="Disciplina" size="small" value={subject} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(event) => onChange("disciplina", event.target.value || null)} sx={{ minWidth: 200, maxWidth: "100%" }}>
            <MenuItem value="">Todas as disciplinas</MenuItem>
            {subjects.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>
        </Box>
      </Card>
    </Box>
  );
}
