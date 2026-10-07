import ArrowBackIcon from "@mui/icons-material/ChevronLeftOutlined";
import ArrowForwardIcon from "@mui/icons-material/ChevronRightOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { Alert } from "@bora/ui";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatDate } from "@/lib/domain/dates";
import { localDate } from "@/lib/domain/schedule";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function Month({ year, month, studied, startsOn, today }: {
  year: number;
  month: number;
  studied: ReadonlySet<string>;
  startsOn: string;
  today: string;
}) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const studiedCount = Array.from({ length: totalDays }, (_, index) => isoDate(year, month, index + 1))
    .filter((date) => studied.has(date)).length;

  return (
    <Box data-testid="study-streak-month" sx={(theme) => ({
      p: 1.25, borderRadius: `${theme.brand.radius.md}px`,
      border: `1px solid ${theme.vars.palette.surface.border}`,
      backgroundColor: theme.vars.palette.surface.sunken,
      minWidth: 0,
    })}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
        <Typography sx={{ fontWeight: 750, fontSize: "0.84rem" }}>{MONTHS[month]}</Typography>
        <Typography variant="caption" sx={{ color: "success.main", fontWeight: 800 }}>{studiedCount} {studiedCount === 1 ? "dia" : "dias"}</Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0.35 }}>
        {WEEKDAYS.map((name, index) => <Typography key={index} variant="caption" sx={{ textAlign: "center", color: "text.secondary", fontSize: "0.65rem" }}>{name}</Typography>)}
        {Array.from({ length: firstWeekday }, (_, index) => <Box key={`blank-${index}`} />)}
        {Array.from({ length: totalDays }, (_, index) => {
          const day = index + 1;
          const date = isoDate(year, month, day);
          const status = studied.has(date) ? "studied" : date < today && date >= startsOn ? "missed" : "neutral";
          const label = status === "studied" ? "estudado" : status === "missed" ? "sem registro" : date > today ? "futuro" : "sem registro até agora";
          return <Box key={date} component="span" role="img" aria-label={`${day} de ${MONTHS[month]} de ${year}: ${label}`} title={`${formatDate(date)} · ${label}`} sx={(theme) => ({
            aspectRatio: "1", minWidth: 0, display: "grid", placeItems: "center", borderRadius: "50%",
            fontSize: "0.62rem", fontWeight: 800, fontVariantNumeric: "tabular-nums",
            color: status === "studied" ? theme.vars.palette.success.main : status === "missed" ? theme.vars.palette.error.main : theme.vars.palette.text.secondary,
            backgroundColor: status === "studied" ? theme.vars.palette.success.soft : status === "missed" ? theme.vars.palette.error.soft : theme.vars.palette.surface.raised,
            border: `1px solid ${status === "studied" ? theme.vars.palette.success.border : status === "missed" ? theme.vars.palette.error.border : theme.vars.palette.surface.border}`,
          })}>{day}</Box>;
        })}
      </Box>
    </Box>
  );
}

export function StudyStreakDialog({ open, onClose, startsOn }: { open: boolean; onClose: () => void; startsOn: string }) {
  const today = localDate(new Date());
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [view, setView] = useState<"year" | "month">("year");
  const [loadState, setLoadState] = useState<{ year: number; dates: readonly string[]; error: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.loadStudyDays(year).then((result) => {
      if (!cancelled) setLoadState({ year, dates: result, error: false });
    }).catch(() => {
      if (!cancelled) setLoadState({ year, dates: [], error: true });
    });
    return () => { cancelled = true; };
  }, [open, year]);

  const dates = loadState?.year === year ? loadState.dates : [];
  const loading = !loadState || loadState.year !== year;
  const error = loadState?.year === year && loadState.error;
  const studied = new Set(dates);
  const canGoBack = year > Number(startsOn.slice(0, 4));
  const canGoForward = year < Number(today.slice(0, 4));
  const visibleMonths = view === "year" ? Array.from({ length: 12 }, (_, index) => index) : [month];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="study-streak-title">
      <DialogTitle id="study-streak-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}>
        Constância dos estudos
        <IconButton aria-label="Fechar calendário de estudos" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ backgroundColor: "surface.raised" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Conta como dia estudado quando você registra tempo ou questões na plataforma.
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Button size="small" variant={view === "month" ? "contained" : "outlined"} onClick={() => setView("month")}>Mês</Button>
            <Button size="small" variant={view === "year" ? "contained" : "outlined"} onClick={() => setView("year")}>Ano</Button>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton aria-label="Ano anterior" disabled={!canGoBack} onClick={() => setYear((current) => current - 1)}><ArrowBackIcon /></IconButton>
            <Typography sx={{ minWidth: 54, textAlign: "center", fontWeight: 800 }}>{year}</Typography>
            <IconButton aria-label="Próximo ano" disabled={!canGoForward} onClick={() => setYear((current) => current + 1)}><ArrowForwardIcon /></IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary">{studied.size} {studied.size === 1 ? "dia estudado" : "dias estudados"} em {year}</Typography>
        </Box>
        {view === "month" && <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1.5 }}>
          <IconButton aria-label="Mês anterior" onClick={() => { if (month === 0) { setMonth(11); setYear((current) => current - 1); } else setMonth((current) => current - 1); }} disabled={year === Number(startsOn.slice(0, 4)) && month <= Number(startsOn.slice(5, 7)) - 1}><ArrowBackIcon /></IconButton>
          <Typography sx={{ minWidth: 110, textAlign: "center", fontWeight: 750 }}>{MONTHS[month]}</Typography>
          <IconButton aria-label="Próximo mês" onClick={() => { if (month === 11) { setMonth(0); setYear((current) => current + 1); } else setMonth((current) => current + 1); }} disabled={year === Number(today.slice(0, 4)) && month >= Number(today.slice(5, 7)) - 1}><ArrowForwardIcon /></IconButton>
        </Box>}
        {error && <Alert status="error">Não foi possível carregar os dias de estudo. Feche e abra o calendário para tentar novamente.</Alert>}
        {loading ? <Typography color="text.secondary">Carregando dias de estudo…</Typography> : !error && (
          <Box sx={{ display: "grid", gridTemplateColumns: view === "year" ? { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } : "minmax(0, 320px)", justifyContent: "center", gap: 1 }}>
            {visibleMonths.map((index) => <Month key={`${year}-${index}`} year={year} month={index} studied={studied} startsOn={startsOn} today={today} />)}
          </Box>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
          <Typography variant="caption" sx={{ color: "success.main", fontWeight: 700 }}>● Dia estudado</Typography>
          <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>● Dia passado sem registro</Typography>
          <Typography variant="caption" color="text.secondary">● Antes do plano, hoje sem registro ou futuro</Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
