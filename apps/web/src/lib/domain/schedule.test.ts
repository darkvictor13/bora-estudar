import assert from "node:assert/strict";
import { test } from "node:test";
import type { Goal, StudyEntry } from "../api/contract.ts";
import { calendarDays, dailyQuestionPerformance, entryDay, localDate, matchesSchedule, scheduleFilter } from "./schedule.ts";

const goal: Goal = {
  id: "goal", type: "review", status: "pending", weekday: 3, dayPosition: 1,
  subject: "Português", title: "Revisar", description: null, lesson: null, block: null,
  plannedMinutes: 30, dueOn: null, completedAt: null, spentMinutes: 0,
  questionsAnswered: 0, correctAnswers: 0, entries: [], theory: null,
};

test("agenda mantém a semana iniciada na quarta e inclui dias livres na virada do mês", () => {
  const days = calendarDays({ startsOn: "2026-09-30", days: [{ date: "2026-09-30", weekday: 3, goals: [goal] }] });
  assert.equal(days.length, 7);
  assert.equal(days[0]?.goals[0], goal);
  assert.equal(days[6]?.date, "2026-10-06");
  assert.deepEqual(days.map((day) => day.weekday), [3, 4, 5, 6, 7, 1, 2]);
  assert.equal(days[1]?.goals.length, 0);
});

test("pendências incluem estudo em andamento, mas não metas puladas ou concluídas", () => {
  assert.equal(matchesSchedule(goal, "pending", ""), true);
  assert.equal(matchesSchedule({ ...goal, status: "in_progress" }, "pending", ""), true);
  assert.equal(matchesSchedule({ ...goal, status: "skipped" }, "pending", ""), false);
  assert.equal(matchesSchedule({ ...goal, status: "completed" }, "pending", ""), false);
});

test("filtros combinam disciplina e situação sem perder reforços da revisão", () => {
  assert.equal(matchesSchedule(goal, "reviews", "Português"), true);
  assert.equal(matchesSchedule(goal, "reviews", "Matemática"), false);
  assert.equal(matchesSchedule({ ...goal, type: "reinforcement" }, "reviews", ""), true);
  assert.equal(matchesSchedule({ ...goal, type: "theory" }, "reviews", ""), false);
  assert.equal(matchesSchedule({ ...goal, status: "completed" }, "completed", "Português"), true);
  assert.equal(scheduleFilter("inválido"), "all");
});

test("hoje mantém a data local inclusive perto da meia-noite", () => {
  assert.equal(localDate(new Date(2026, 8, 24, 23, 59)), "2026-09-24");
});

test("aproveitamento diário usa a data da resposta e só conta questões", () => {
  const answered = {
    id: "entry-1", goalId: "goal", minutes: 0, questions: 10, correctAnswers: 7,
    score: 70, note: null, theoryStage: "questions_in_progress" as const,
    manualLesson: null, createdAt: "2026-09-15T12:00:00.000Z", studiedOn: null,
  };
  const reading = { ...answered, id: "entry-2", questions: 0, correctAnswers: 0, minutes: 40 };
  const day = { date: "2026-09-14", weekday: 1 as const, goals: [{ ...goal, entries: [answered, reading] }] };
  assert.deepEqual(dailyQuestionPerformance({ days: [day] }, "2026-09-15"), {
    questions: 10, correct: 7, wrong: 3, score: 70,
  });
  assert.equal(dailyQuestionPerformance({ days: [day] }, "2026-09-14").score, null);
});

const entry: StudyEntry = {
  id: "e", goalId: "goal", minutes: 20, questions: 10, correctAnswers: 8, score: 80,
  note: null, theoryStage: null, manualLesson: null,
  createdAt: "2026-09-14T15:00:00.000Z", studiedOn: null,
};

test("o dia de um registro é o estudado, ou o dia local do lançamento", () => {
  assert.equal(entryDay({ ...entry, studiedOn: "2026-09-13" }), "2026-09-13");
  assert.equal(entryDay(entry), localDate(new Date(entry.createdAt)));
  // Sem a chave (quem monta o registro à mão) também vale.
  assert.equal(entryDay({ createdAt: entry.createdAt }), localDate(new Date(entry.createdAt)));
});

test("o desempenho do dia põe o extra de ontem em ontem, e não no dia do lançamento", () => {
  const week = { days: [{ date: "2026-09-14", weekday: 1 as const, goals: [{ ...goal, entries: [{ ...entry, studiedOn: "2026-09-13" }] }] }] };
  assert.equal(dailyQuestionPerformance(week, "2026-09-13").questions, 10);
  assert.equal(dailyQuestionPerformance(week, localDate(new Date(entry.createdAt))).questions, 0);
});
