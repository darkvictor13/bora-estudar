import assert from "node:assert/strict";
import test from "node:test";

import { addStudyTimerMinutes, advanceStudyTimer, changeStudyTimerMode, displayedStudyTimer, EMPTY_TIMER, parseStudyTimer, pauseTimer, recordedStudyTimerMinutes, resumeTimer } from "./study-timer.ts";

test("cronômetro antigo continua válido e marca o tempo decorrido", () => {
  const old = parseStudyTimer({ elapsedMs: 2_000, startedAt: 10_000, running: true });
  assert.equal(old.mode, "stopwatch");
  assert.equal(displayedStudyTimer(old, 13_000), 5_000);
});

test("pomodoro conclui foco uma vez, pausa e só então inicia intervalo", () => {
  const focus = { ...changeStudyTimerMode(EMPTY_TIMER, "pomodoro", 25), startedAt: 1_000, running: true };
  assert.equal(displayedStudyTimer(focus, 61_000), 24 * 60_000);
  const finished = advanceStudyTimer(focus, 25 * 60_000 + 1_000);
  assert.equal(finished.phase, "break");
  assert.equal(finished.running, false);
  assert.equal(finished.pomodorosCompleted, 1);
  assert.equal(displayedStudyTimer(finished, 25 * 60_000 + 1_000), 5 * 60_000);
  assert.equal(advanceStudyTimer(finished, 99 * 60_000).pomodorosCompleted, 1);
});

test("acréscimo de tempo só altera a etapa de foco", () => {
  const focus = changeStudyTimerMode(EMPTY_TIMER, "pomodoro", 50);
  assert.equal(addStudyTimerMinutes(focus, 10).targetMs, 60 * 60_000);
  assert.equal(addStudyTimerMinutes({ ...focus, phase: "break" }, 10).targetMs, focus.targetMs);
});

test("tempo para lançamento soma focos concluídos e ignora intervalo", () => {
  const stopwatch = { ...EMPTY_TIMER, elapsedMs: 3 * 60_000 + 43_000 };
  assert.equal(recordedStudyTimerMinutes(stopwatch, 0), 4);
  const pomodoro = { ...changeStudyTimerMode(EMPTY_TIMER, "pomodoro", 25), pomodorosCompleted: 2, elapsedMs: 4 * 60_000 };
  assert.equal(recordedStudyTimerMinutes(pomodoro, 0), 54);
  assert.equal(recordedStudyTimerMinutes({ ...pomodoro, phase: "break" }, 0), 50);
});

test("pausar e retomar são idempotentes, e quem pausou não anda", () => {
  const correndo = { ...EMPTY_TIMER, elapsedMs: 1_000, startedAt: 10_000, running: true };
  const pausado = pauseTimer(correndo, 15_000);
  assert.equal(pausado.running, false);
  assert.equal(pausado.startedAt, null);
  assert.equal(pausado.elapsedMs, 6_000);
  assert.deepEqual(pauseTimer(pausado, 99_000), pausado);
  // O tempo de quem pausou não anda.
  assert.equal(displayedStudyTimer(pausado, 99_000), 6_000);

  const retomado = resumeTimer(pausado, 100_000);
  assert.equal(retomado.running, true);
  assert.equal(retomado.startedAt, 100_000);
  assert.deepEqual(resumeTimer(retomado, 200_000), retomado);
  assert.equal(displayedStudyTimer(retomado, 103_000), 9_000);
});
