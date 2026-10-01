import PauseIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrowOutlined";
import RestartIcon from "@mui/icons-material/RestartAltOutlined";
import FullscreenIcon from "@mui/icons-material/FullscreenOutlined";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExitOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { addStudyTimerMinutes, advanceStudyTimer, changeStudyTimerMode, displayedStudyTimer, elapsedStudyTimer, EMPTY_TIMER, parseStudyTimer, recordedStudyTimer, recordedStudyTimerMinutes, type StudyTimerMode, type StudyTimerState } from "@/lib/domain/study-timer";
import type { Theme } from "@/lib/theme";

export const STUDY_TIMER_STORAGE_KEY = "fronteira.study-timer.v1";
const STUDY_TIMER_CHANGE_EVENT = "fronteira:study-timer-change";

function saveStudyTimer(timer: StudyTimerState) {
  window.localStorage.setItem(STUDY_TIMER_STORAGE_KEY, JSON.stringify(timer));
  window.dispatchEvent(new Event(STUDY_TIMER_CHANGE_EVENT));
}

export function readStudyTimer(): StudyTimerState {
  if (typeof window === "undefined") return EMPTY_TIMER;
  try {
    const raw = window.localStorage.getItem(STUDY_TIMER_STORAGE_KEY);
    if (!raw) return EMPTY_TIMER;
    return parseStudyTimer(JSON.parse(raw));
  } catch {
    return EMPTY_TIMER;
  }
}

/** Pausa o cronômetro e devolve os minutos de foco prontos para o formulário. */
export function pauseStudyTimerForRecord(): number {
  if (typeof window === "undefined") return 0;
  const now = Date.now();
  const current = readStudyTimer();
  const paused = current.running
    ? { ...current, elapsedMs: elapsedStudyTimer(current, now), startedAt: null, running: false }
    : current;
  saveStudyTimer(paused);
  return recordedStudyTimerMinutes(paused, now);
}

/** Consome o tempo já lançado sem mudar o modo escolhido pelo aluno. */
export function clearRecordedStudyTimer() {
  if (typeof window === "undefined") return;
  const current = readStudyTimer();
  saveStudyTimer(changeStudyTimerMode(current, current.mode, current.focusMinutes));
}

export function formatStudyTimer(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function useStudyTimer() {
  const [timer, setTimer] = useState<StudyTimerState>(readStudyTimer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    saveStudyTimer(timer);
  }, [timer]);

  useEffect(() => {
    const syncTimer = () => {
      const next = readStudyTimer();
      setTimer((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      setNow(Date.now());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STUDY_TIMER_STORAGE_KEY) syncTimer();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(STUDY_TIMER_CHANGE_EVENT, syncTimer);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(STUDY_TIMER_CHANGE_EVENT, syncTimer);
    };
  }, []);

  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      setTimer((state) => advanceStudyTimer(state, current));
    }, 250);
    return () => window.clearInterval(interval);
  }, [timer.running]);

  const elapsedMs = useMemo(
    () => elapsedStudyTimer(timer, now),
    [now, timer],
  );
  const displayMs = useMemo(() => displayedStudyTimer(timer, now), [timer, now]);
  const studyMs = useMemo(() => recordedStudyTimer(timer, now), [timer, now]);

  function start() {
    setTimer((current) => current.running ? current : { ...current, running: true, startedAt: Date.now() });
  }

  function pause() {
    setTimer((current) => {
      if (!current.running || current.startedAt === null) return current;
      return { ...current, elapsedMs: elapsedStudyTimer(current, Date.now()), startedAt: null, running: false };
    });
  }

  function reset() {
    setTimer((current) => changeStudyTimerMode(current, current.mode, current.focusMinutes));
    setNow(Date.now());
  }

  function setMode(mode: StudyTimerMode, focusMinutes?: 25 | 50) {
    setTimer((current) => changeStudyTimerMode(current, mode, focusMinutes ?? current.focusMinutes));
    setNow(Date.now());
  }

  function addMinutes(minutes: number) {
    setTimer((current) => addStudyTimerMinutes(current, minutes));
  }

  return { timer, elapsedMs, displayMs, studyMs, start, pause, reset, setMode, addMinutes };
}

export function StudyTimerFocus({ onClose, fullscreen = false }: { onClose?: () => void; fullscreen?: boolean }) {
  const { timer, displayMs, start, pause, reset, setMode, addMinutes } = useStudyTimer();

  return (
    <Box
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? "true" : undefined}
      aria-label="Cronômetro ampliado"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: 3, md: 4 },
        width: "100%",
        minHeight: fullscreen ? "100dvh" : { xs: 440, md: 560 },
        px: 2,
        py: 6,
        overflow: "hidden",
        color: "#F7FAF9",
        background: "radial-gradient(circle at 50% 35%, #2D3734 0%, #252A29 35%, #1F2423 100%)",
      }}
    >
      {onClose && (
        <IconButton
          onClick={onClose}
          aria-label="Sair da tela cheia"
          sx={{ position: "absolute", top: 18, right: 18, color: "#EAF4F1", border: "1px solid rgba(255,255,255,0.2)" }}
        >
          <FullscreenExitIcon />
        </IconButton>
      )}
      <Box component="img" src="/fronteira-mark.svg" alt="Símbolo da Fronteira Concursos" sx={{ width: { xs: 94, md: 128 }, height: { xs: 94, md: 128 }, filter: "drop-shadow(0 12px 26px rgba(16, 192, 165, 0.2))" }} />
      <Typography sx={{ color: "#C4DCD5", fontWeight: 700 }}>
        {timer.mode === "stopwatch" ? "Tempo livre" : timer.phase === "focus" ? "Pomodoro · foco" : "Pomodoro · pausa"}
      </Typography>
      <Typography
        component="p"
        aria-live="off"
        sx={(theme) => ({
          fontFamily: theme.typography.fontFamily,
          fontSize: { xs: "clamp(3.2rem, 12vw, 5rem)", md: "clamp(5rem, 10vw, 8rem)" },
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: "-0.07em",
          fontVariantNumeric: "tabular-nums",
          color: "#FFFFFF",
          textShadow: "0 6px 30px rgba(0,0,0,0.25)",
        })}
      >
        {formatStudyTimer(displayMs)}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
        <Button variant={timer.mode === "stopwatch" ? "contained" : "outlined"} onClick={() => setMode("stopwatch")} sx={{ color: timer.mode === "stopwatch" ? undefined : "#F7FAF9" }}>Cronômetro</Button>
        <Button variant={timer.mode === "pomodoro" && timer.focusMinutes === 25 ? "contained" : "outlined"} onClick={() => setMode("pomodoro", 25)} sx={{ color: timer.mode === "pomodoro" && timer.focusMinutes === 25 ? undefined : "#F7FAF9" }}>Pomodoro 25/5</Button>
        <Button variant={timer.mode === "pomodoro" && timer.focusMinutes === 50 ? "contained" : "outlined"} onClick={() => setMode("pomodoro", 50)} sx={{ color: timer.mode === "pomodoro" && timer.focusMinutes === 50 ? undefined : "#F7FAF9" }}>Pomodoro 50/10</Button>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <IconButton
          onClick={timer.running ? pause : start}
          aria-label={timer.running ? "Pausar cronômetro" : "Iniciar cronômetro"}
          sx={{ width: 58, height: 58, borderRadius: 2, color: "#07241F", bgcolor: "#69D7BD", "&:hover": { bgcolor: "#8DE8D2" } }}
        >
          {timer.running ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <IconButton
          onClick={reset}
          aria-label="Zerar cronômetro"
          sx={{ width: 58, height: 58, color: "#F7FAF9", border: "1px solid rgba(255,255,255,0.18)", "&:hover": { bgcolor: "rgba(255,255,255,0.1)" } }}
        >
          <RestartIcon />
        </IconButton>
      </Box>
      {timer.mode === "pomodoro" && <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {timer.phase === "focus" && [5, 10, 15].map((minutes) => <Button key={minutes} size="small" variant="outlined" onClick={() => addMinutes(minutes)} sx={{ color: "#F7FAF9" }}>+{minutes} min</Button>)}
        <Typography variant="body2" sx={{ color: "#B9C9C4" }}>{timer.pomodorosCompleted} {timer.pomodorosCompleted === 1 ? "foco concluído" : "focos concluídos"}</Typography>
      </Box>}
      <Typography variant="body2" sx={{ color: "#B9C9C4", textAlign: "center" }}>
        {timer.mode === "pomodoro" && !timer.running && timer.elapsedMs === 0 && timer.pomodorosCompleted > 0 ? "Etapa concluída. Inicie a próxima quando estiver pronto." : "O cronômetro continua disponível enquanto você navega."}
      </Typography>
    </Box>
  );
}

export function StudyTimerBar({ timerHref, recordHref, profileId, theme }: { timerHref: string | undefined; recordHref?: string; profileId: string; theme: Theme }) {
  const { timer, displayMs, studyMs, start, pause, reset, setMode, addMinutes } = useStudyTimer();
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        if (document.fullscreenElement === fullscreenRef.current) void document.exitFullscreen();
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [expanded]);

  function openExpanded() {
    setExpanded(true);
    void fullscreenRef.current?.requestFullscreen?.().catch(() => {
      // O painel ainda ocupa toda a janela se o navegador negar a API de tela cheia.
    });
  }

  function closeExpanded() {
    setExpanded(false);
    if (document.fullscreenElement === fullscreenRef.current) void document.exitFullscreen();
  }

  return (
    <Box
      component="section"
      aria-label="Ferramenta de estudo"
      sx={(theme) => ({
        position: "sticky",
        top: 0,
        zIndex: 11,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 0.5,
        minHeight: 50,
        px: { xs: 1.5, md: 4 },
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        backgroundColor: theme.vars.palette.surface.raised,
        ...theme.applyStyles("dark", { backgroundColor: "#252A29", borderBottomColor: "#3B4441" }),
      })}
    >
      {timerHref && <><IconButton
        size="small"
        aria-label={timer.running ? "Pausar cronômetro" : "Iniciar cronômetro"}
        onClick={timer.running ? pause : start}
        sx={(theme) => ({
          color: theme.vars.palette.fill.primaryText,
          bgcolor: theme.vars.palette.fill.primary,
          borderRadius: 1,
          "&:hover": { bgcolor: theme.vars.palette.accent.primary },
        })}
      >
        {timer.running ? <PauseIcon fontSize="small" /> : <TimerOutlinedIcon fontSize="small" />}
      </IconButton>
      <IconButton size="small" aria-label="Zerar cronômetro" onClick={reset} sx={{ color: "text.primary" }}>
        <RestartIcon fontSize="small" />
      </IconButton>
      <Typography component="span" aria-live="off" sx={(theme) => ({
        px: 1,
        fontFamily: theme.typography.fontFamily,
        fontSize: "1rem",
        fontWeight: 700,
        color: theme.vars.palette.text.primary,
        fontVariantNumeric: "tabular-nums",
      })}>{formatStudyTimer(displayMs)}</Typography>
      <Button size="small" onClick={(event) => setMenuAnchor(event.currentTarget)} aria-label="Modos e tempo do cronômetro" sx={{ minWidth: 0, px: 0.75, fontSize: "0.7rem" }}>
        {timer.mode === "pomodoro" ? timer.phase === "focus" ? "Foco" : "Pausa" : "Livre"}
      </Button>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem selected={timer.mode === "stopwatch"} onClick={() => { setMode("stopwatch"); setMenuAnchor(null); }}>Cronômetro livre</MenuItem>
        <MenuItem selected={timer.mode === "pomodoro" && timer.focusMinutes === 25} onClick={() => { setMode("pomodoro", 25); setMenuAnchor(null); }}>Pomodoro 25/5</MenuItem>
        <MenuItem selected={timer.mode === "pomodoro" && timer.focusMinutes === 50} onClick={() => { setMode("pomodoro", 50); setMenuAnchor(null); }}>Pomodoro 50/10</MenuItem>
        {timer.mode === "pomodoro" && timer.phase === "focus" && [5, 10, 15].map((minutes) => <MenuItem key={minutes} onClick={() => { addMinutes(minutes); setMenuAnchor(null); }}>Adicionar {minutes} minutos</MenuItem>)}
      </Menu>
      {recordHref && studyMs > 0 && <Button component="a" href={recordHref} size="small" variant="outlined" sx={{ whiteSpace: "nowrap" }}>Lançar tempo</Button>}
      <IconButton size="small" aria-label="Ampliar cronômetro" onClick={openExpanded} sx={{ color: "text.primary" }}>
        <FullscreenIcon />
      </IconButton>
      <IconButton component="a" href={timerHref} target="_blank" rel="noopener noreferrer" size="small" aria-label="Abrir cronômetro em nova guia" sx={{ color: "text.secondary" }}>
        <OpenInNewIcon fontSize="small" />
      </IconButton></>}
      <ThemeToggle profileId={profileId} initial={theme} collapsed />
      <Box
        ref={fullscreenRef}
        sx={{ position: "fixed", inset: 0, zIndex: 2000, display: expanded ? "block" : "none", bgcolor: "#1F2423", ":fullscreen": { width: "100vw", height: "100dvh" } }}
      >
        {expanded && <StudyTimerFocus fullscreen onClose={closeExpanded} />}
      </Box>
    </Box>
  );
}
