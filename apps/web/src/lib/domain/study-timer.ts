export type StudyTimerMode = "stopwatch" | "pomodoro";
export type PomodoroPhase = "focus" | "break";

export interface StudyTimerState {
  readonly elapsedMs: number;
  readonly startedAt: number | null;
  readonly running: boolean;
  readonly mode: StudyTimerMode;
  readonly phase: PomodoroPhase;
  readonly focusMinutes: 25 | 50;
  readonly targetMs: number;
  readonly pomodorosCompleted: number;
}

const minute = 60_000;
export const EMPTY_TIMER: StudyTimerState = {
  elapsedMs: 0, startedAt: null, running: false,
  mode: "stopwatch", phase: "focus", focusMinutes: 25,
  targetMs: 25 * minute, pomodorosCompleted: 0,
};

export function parseStudyTimer(raw: unknown): StudyTimerState {
  if (!raw || typeof raw !== "object") return EMPTY_TIMER;
  const value = raw as Partial<StudyTimerState>;
  const focusMinutes = value.focusMinutes === 50 ? 50 : 25;
  const mode = value.mode === "pomodoro" ? "pomodoro" : "stopwatch";
  const phase = value.phase === "break" ? "break" : "focus";
  const startedAt = typeof value.startedAt === "number" && Number.isFinite(value.startedAt) ? value.startedAt : null;
  return {
    elapsedMs: typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0 ? value.elapsedMs : 0,
    startedAt,
    running: value.running === true && startedAt !== null,
    mode,
    phase,
    focusMinutes,
    targetMs: typeof value.targetMs === "number" && Number.isFinite(value.targetMs) && value.targetMs > 0 ? value.targetMs : (phase === "focus" ? focusMinutes : focusMinutes === 25 ? 5 : 10) * minute,
    pomodorosCompleted: typeof value.pomodorosCompleted === "number" && Number.isInteger(value.pomodorosCompleted) && value.pomodorosCompleted >= 0 ? value.pomodorosCompleted : 0,
  };
}

export function elapsedStudyTimer(state: StudyTimerState, now: number): number {
  return state.elapsedMs + (state.running && state.startedAt !== null ? Math.max(0, now - state.startedAt) : 0);
}

/** Tempo de foco que pode virar registro de estudo; intervalos não entram. */
export function recordedStudyTimer(state: StudyTimerState, now: number): number {
  if (state.mode === "stopwatch") return elapsedStudyTimer(state, now);
  const completedFocus = state.pomodorosCompleted * state.focusMinutes * minute;
  const currentFocus = state.phase === "focus" ? Math.min(elapsedStudyTimer(state, now), state.targetMs) : 0;
  return completedFocus + currentFocus;
}

export function recordedStudyTimerMinutes(state: StudyTimerState, now: number): number {
  const milliseconds = recordedStudyTimer(state, now);
  return milliseconds > 0 ? Math.max(1, Math.ceil(milliseconds / minute)) : 0;
}

export function displayedStudyTimer(state: StudyTimerState, now: number): number {
  const elapsed = elapsedStudyTimer(state, now);
  return state.mode === "pomodoro" ? Math.max(0, state.targetMs - elapsed) : elapsed;
}

export function advanceStudyTimer(state: StudyTimerState, now: number): StudyTimerState {
  if (!state.running || state.mode !== "pomodoro" || elapsedStudyTimer(state, now) < state.targetMs) return state;
  const nextPhase: PomodoroPhase = state.phase === "focus" ? "break" : "focus";
  return {
    ...state,
    phase: nextPhase,
    pomodorosCompleted: state.pomodorosCompleted + (state.phase === "focus" ? 1 : 0),
    elapsedMs: 0,
    startedAt: null,
    running: false,
    targetMs: (nextPhase === "focus" ? state.focusMinutes : state.focusMinutes === 25 ? 5 : 10) * minute,
  };
}

export function changeStudyTimerMode(state: StudyTimerState, mode: StudyTimerMode, focusMinutes: 25 | 50 = state.focusMinutes): StudyTimerState {
  return { ...state, mode, focusMinutes, phase: "focus", elapsedMs: 0, startedAt: null, running: false, targetMs: focusMinutes * minute, pomodorosCompleted: 0 };
}

export function addStudyTimerMinutes(state: StudyTimerState, minutes: number): StudyTimerState {
  if (state.mode !== "pomodoro" || state.phase !== "focus" || !Number.isInteger(minutes) || minutes <= 0) return state;
  return { ...state, targetMs: state.targetMs + minutes * minute };
}
