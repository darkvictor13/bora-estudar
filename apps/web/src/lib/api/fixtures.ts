/**
 * O CONTRATO, CUMPRIDO EM MEMÓRIA.
 *
 * Serve a um propósito só: deixar a interface inteira ser construída e testada
 * antes de o banco existir. Nada aqui vai para produção — `index.ts` escolhe
 * entre esta implementação e a do Supabase por variável de ambiente.
 *
 * Duas regras que a mantêm útil:
 *
 * 1. **Ela MUTA.** Concluir uma meta muda o estado que a próxima leitura
 *    devolve. Um mock que devolve sempre o mesmo objeto esconde exatamente os
 *    defeitos que a UI tem — revalidação que não roda, lista que não reordena,
 *    contador que não soma.
 * 2. **Ela RECUSA.** Concluir meta já concluída devolve `conflict`; acesso
 *    vencido devolve `access_expired`. Uma fixture que aceita tudo faz o
 *    caminho de erro nascer sem tela.
 *
 * O relógio é fixo (`TODAY`): teste que depende de "hoje" falha num dia e passa
 * no outro, e leva meses para alguém descobrir por quê.
 */
import type {
  Account,
  AccountInput,
  ApiError,
  ApiErrorCode,
  BoraApi,
  ClassInput,
  Credentials,
  DayGroup,
  ExtraStudyInput,
  GenerateWeekInput,
  GenerateWeekPreview,
  Goal,
  GoalType,
  GrantAccessInput,
  ImportMasterInput,
  ImportMasterResult,
  IsoDate,
  Notebook,
  QuizSessionSummary,
  RecordInitialQuestionsInput,
  RecordReviewQuestionsInput,
  RecordStudyInput,
  Reinforcement,
  RequestId,
  Result,
  ReviewGridRow,
  SaveReviewSpacingInput,
  SaveTheoryProgressInput,
  Session,
  SignUpInput,
  Statistics,
  StatisticsFilter,
  StudentCard,
  StudentFile,
  StudentListFilter,
  StudentSearchResult,
  StudyEntry,
  StudyPlanInput,
  StudyPlanSummary,
  Subject,
  TeacherClass,
  ThemePreference,
  TheoryCatalog,
  TheoryGoal,
  TheoryLesson,
  TheoryProgress,
  TheoryReview,
  TheorySubjectControl,
  TheorySubjectRule,
  TopicDifficulty,
  Uuid,
  VoidSessionInput,
  WaitlistEntry,
  WaitlistInput,
  Week,
  WeekOption,
  WeekSummary,
  Weekday,
} from "./contract.ts";
import {
  checkAccessMonths,
  checkClassName,
  checkCredentials,
  checkName,
  checkPassword,
  checkSignUp,
  checkStudentEmail,
} from "./validation.ts";

/* ------------------------------------------------------------------ *
 * Relógio e utilidades
 * ------------------------------------------------------------------ */

/** Uma segunda-feira, para a semana começar redonda. */
const TODAY: IsoDate = "2026-09-14";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const TEACHER_ID = "33333333-3333-4333-8333-333333333333";
const CATALOG_ID = "44444444-4444-4444-8444-444444444444";
const CLASS_A_ID = "66666666-6666-4666-8666-000000000001";
const CLASS_B_ID = "66666666-6666-4666-8666-000000000002";

let sequence = 0;
/** Id previsível: o mesmo cenário produz sempre os mesmos ids. */
function nextId(prefix: string): Uuid {
  sequence += 1;
  return `${prefix}${String(sequence).padStart(12, "0")}`.slice(0, 36);
}

function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fail<T>(code: ApiErrorCode, message: string, field?: string): Result<T> {
  const error: ApiError = field === undefined ? { code, message } : { code, message, field };
  return { ok: false, error };
}

function done<T>(data: T): Result<T> {
  return { ok: true, data };
}

/**
 * A latência não é enfeite.
 *
 * Sem ela o loader resolve no mesmo tick e o estado pendente da rota nunca
 * aparece — então ninguém descobre que a tela não tem estado de carregamento
 * até ligar o banco de verdade.
 */
const LATENCY_MS = 40;
function later<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

/**
 * Guarda de retentativa, do mesmo formato do banco.
 *
 * Mesma chave devolve o resultado anterior sem reexecutar. Existe aqui, e não
 * só no adaptador do Supabase, porque é a UI que precisa ser exercitada contra
 * ela: clicar duas vezes em "Concluir" tem de continuar concluindo uma vez.
 */
const replayed = new Map<RequestId, unknown>();
function once<T>(requestId: RequestId, run: () => Result<T>): Result<T> {
  const seen = replayed.get(requestId);
  if (seen !== undefined) return seen as Result<T>;
  const outcome = run();
  if (outcome.ok) replayed.set(requestId, outcome);
  return outcome;
}

/* ------------------------------------------------------------------ *
 * O cenário
 * ------------------------------------------------------------------ */

interface GoalRow {
  id: Uuid;
  type: GoalType;
  status: Goal["status"];
  weekday: Weekday;
  dayPosition: number;
  weekNumber: number;
  subject: string;
  title: string;
  description: string | null;
  lesson: string | null;
  block: string | null;
  plannedMinutes: number;
  completedAt: string | null;
  theoryLessonId: Uuid | null;
  subjectKey: string | null;
}

interface State {
  session: Session | null;
  theme: ThemePreference | null;
  goals: GoalRow[];
  entries: StudyEntry[];
  progress: Map<Uuid, TheoryProgress>;
  reviews: TheoryReview[];
  waitlist: WaitlistEntry | null;
  selectedSubjects: Set<string>;
  /**
   * OS ALUNOS SÃO ESTADO, e não uma constante congelada.
   *
   * Eram um `readonly StudentCard[]` de módulo, e liberar acesso devolvia um
   * objeto novo sem mudar a lista — a tela mostrava "liberado" no aviso e
   * "aguardando" no cartão logo abaixo, que é exatamente o defeito que uma
   * fixture existe para expor.
   */
  students: StudentCard[];
  classes: TeacherClass[];
  /** Quem ainda não é aluno de ninguém. É o que `findStudentByEmail` acha. */
  candidates: StudentSearchResult[];
  /** O e-mail de cada pessoa que a busca alcança, em minúsculas. */
  emails: Map<string, Uuid>;
}

const LESSONS: readonly TheoryLesson[] = [
  {
    id: "55555555-5555-4555-8555-000000000001",
    subject: "Direito Tributário",
    subjectKey: "direito-tributario",
    lessonCode: "DT-01",
    position: 1,
    title: "Competência tributária",
    pdfFile: "dt-01-competencia.pdf",
    theoryStartPage: 3,
    theoryEndPage: 41,
    pdfTotalPages: 88,
    finalQuestionsStart: 42,
    hasTheory: true,
    note: null,
  },
  {
    id: "55555555-5555-4555-8555-000000000002",
    subject: "Direito Tributário",
    subjectKey: "direito-tributario",
    lessonCode: "DT-02",
    position: 2,
    title: "Limitações ao poder de tributar",
    pdfFile: "dt-02-limitacoes.pdf",
    theoryStartPage: 3,
    theoryEndPage: 55,
    pdfTotalPages: 104,
    finalQuestionsStart: 56,
    hasTheory: true,
    note: null,
  },
  {
    id: "55555555-5555-4555-8555-000000000003",
    subject: "Português",
    subjectKey: "portugues",
    lessonCode: "PT-01",
    position: 1,
    title: "Ortografia e acentuação",
    pdfFile: "pt-01-ortografia.pdf",
    theoryStartPage: 2,
    theoryEndPage: 28,
    pdfTotalPages: 60,
    finalQuestionsStart: 29,
    hasTheory: true,
    note: null,
  },
  /**
   * SEM PÁGINA DE PROPÓSITO. Matemática Financeira ficou fora da auditoria da
   * v108.5, e a v2 recusa inventar página nesse caso. A fixture guarda o caso
   * para a tela de diagnóstico existir desde o primeiro dia, e não como
   * remendo depois que alguém reclamar.
   */
  {
    id: "55555555-5555-4555-8555-000000000004",
    subject: "Matemática Financeira",
    subjectKey: "matematica-financeira",
    lessonCode: "MF-01",
    position: 1,
    title: "Juros simples e compostos",
    pdfFile: "mf-01-juros.pdf",
    theoryStartPage: null,
    theoryEndPage: null,
    pdfTotalPages: null,
    finalQuestionsStart: null,
    hasTheory: true,
    note: "Disciplina fora do catálogo auditado v108.5.",
  },
];

const INITIAL_QUESTIONS_REQUIRED = 15;

function seedGoals(): GoalRow[] {
  const rows: GoalRow[] = [];
  const add = (row: Omit<GoalRow, "id">) => rows.push({ id: nextId("9"), ...row });

  add({
    type: "theory",
    status: "completed",
    weekday: 1,
    dayPosition: 1,
    weekNumber: 1,
    subject: "Direito Tributário",
    title: "Teoria — Competência tributária",
    description: null,
    lesson: "Competência tributária",
    block: null,
    plannedMinutes: 90,
    completedAt: `${TODAY}T11:02:00.000Z`,
    theoryLessonId: LESSONS[0]!.id,
    subjectKey: LESSONS[0]!.subjectKey,
  });
  add({
    type: "question_block",
    status: "in_progress",
    weekday: 1,
    dayPosition: 2,
    weekNumber: 1,
    subject: "Direito Tributário",
    title: "Bateria — Competência tributária",
    description: null,
    lesson: null,
    block: "DT · Bloco 1",
    plannedMinutes: 45,
    completedAt: null,
    theoryLessonId: null,
    subjectKey: null,
  });
  add({
    type: "theory",
    status: "pending",
    weekday: 2,
    dayPosition: 1,
    weekNumber: 1,
    subject: "Direito Tributário",
    title: "Teoria — Limitações ao poder de tributar",
    description: null,
    lesson: "Limitações ao poder de tributar",
    block: null,
    plannedMinutes: 90,
    completedAt: null,
    theoryLessonId: LESSONS[1]!.id,
    subjectKey: LESSONS[1]!.subjectKey,
  });
  add({
    type: "theory",
    status: "pending",
    weekday: 3,
    dayPosition: 1,
    weekNumber: 1,
    subject: "Português",
    title: "Teoria — Ortografia e acentuação",
    description: null,
    lesson: "Ortografia e acentuação",
    block: null,
    plannedMinutes: 60,
    completedAt: null,
    theoryLessonId: LESSONS[2]!.id,
    subjectKey: LESSONS[2]!.subjectKey,
  });
  add({
    type: "theory",
    status: "pending",
    weekday: 4,
    dayPosition: 1,
    weekNumber: 1,
    subject: "Matemática Financeira",
    title: "Teoria — Juros simples e compostos",
    description: null,
    lesson: "Juros simples e compostos",
    block: null,
    plannedMinutes: 60,
    completedAt: null,
    theoryLessonId: LESSONS[3]!.id,
    subjectKey: LESSONS[3]!.subjectKey,
  });
  add({
    type: "review",
    status: "pending",
    weekday: 5,
    dayPosition: 1,
    weekNumber: 1,
    subject: "Direito Tributário",
    title: "Revisão 1 — Competência tributária",
    description: null,
    lesson: "Competência tributária",
    block: null,
    plannedMinutes: 30,
    completedAt: null,
    theoryLessonId: LESSONS[0]!.id,
    subjectKey: LESSONS[0]!.subjectKey,
  });
  add({
    type: "mock_exam",
    status: "skipped",
    weekday: 6,
    dayPosition: 1,
    weekNumber: 1,
    subject: "Geral",
    title: "Simulado semanal",
    description: "60 questões, tempo fechado.",
    lesson: null,
    block: null,
    plannedMinutes: 180,
    completedAt: null,
    theoryLessonId: null,
    subjectKey: null,
  });

  return rows;
}

function seedState(): State {
  const goals = seedGoals();
  const first = goals[0]!;
  return {
    session: {
      profileId: STUDENT_ID,
      email: "aluna@exemplo.com.br",
      name: "Aluna de Exemplo",
      role: "student",
      access: "active",
      accessExpiresAt: addDays(TODAY, 120),
      teacherId: TEACHER_ID,
    },
    theme: null,
    goals,
    entries: [
      {
        id: nextId("a"),
        goalId: first.id,
        minutes: 95,
        questions: 18,
        correctAnswers: 14,
        score: 77.78,
        note: "PDF lido até o fim.",
        theoryStage: "questions_done",
        manualLesson: null,
        createdAt: `${TODAY}T11:02:00.000Z`,
      },
    ],
    progress: new Map([
      [
        LESSONS[0]!.id,
        {
          lessonId: LESSONS[0]!.id,
          currentPage: 41,
          theoryDone: true,
          initialQuestionsDone: 18,
          initialQuestionsRequired: INITIAL_QUESTIONS_REQUIRED,
          initialQuestionsComplete: true,
          lessonDone: true,
        },
      ],
      [
        LESSONS[1]!.id,
        {
          lessonId: LESSONS[1]!.id,
          currentPage: 12,
          theoryDone: false,
          initialQuestionsDone: 0,
          initialQuestionsRequired: INITIAL_QUESTIONS_REQUIRED,
          initialQuestionsComplete: false,
          lessonDone: false,
        },
      ],
    ]),
    reviews: [
      {
        id: nextId("b"),
        lessonId: LESSONS[0]!.id,
        lessonTitle: LESSONS[0]!.title,
        subject: LESSONS[0]!.subject,
        reviewNumber: 1,
        minimumQuestions: 15,
        questionsAnswered: 0,
        status: "pending",
        due: true,
      },
    ],
    waitlist: null,
    selectedSubjects: new Set(["direito-tributario", "portugues"]),
    students: seedStudents(),
    classes: seedClasses(),
    candidates: seedCandidates(),
    emails: seedEmails(),
  };
}

let state = seedState();

/** Volta o cenário ao começo. Usada por teste, nunca pela aplicação. */
export function resetFixtures(): void {
  sequence = 0;
  replayed.clear();
  state = seedState();
}

/* ------------------------------------------------------------------ *
 * Projeções
 * ------------------------------------------------------------------ */

function entriesOf(goalId: Uuid): StudyEntry[] {
  return state.entries.filter((entry) => entry.goalId === goalId);
}

function toGoal(row: GoalRow): Goal {
  const entries = entriesOf(row.id);
  const sum = (pick: (entry: StudyEntry) => number) =>
    entries.reduce((total, entry) => total + pick(entry), 0);

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    weekday: row.weekday,
    dayPosition: row.dayPosition,
    subject: row.subject,
    title: row.title,
    description: row.description,
    lesson: row.lesson,
    block: row.block,
    plannedMinutes: row.plannedMinutes,
    dueOn: addDays(TODAY, row.weekday - 1),
    completedAt: row.completedAt,
    spentMinutes: sum((entry) => entry.minutes),
    questionsAnswered: sum((entry) => entry.questions),
    correctAnswers: sum((entry) => entry.correctAnswers),
    entries,
    theory:
      row.theoryLessonId && row.subjectKey
        ? { lessonId: row.theoryLessonId, subjectKey: row.subjectKey }
        : null,
  };
}

function summarize(goals: readonly Goal[]): WeekSummary {
  const questions = goals.reduce((total, goal) => total + goal.questionsAnswered, 0);
  const correct = goals.reduce((total, goal) => total + goal.correctAnswers, 0);
  const days = new Set(
    goals.filter((goal) => goal.entries.length > 0).map((goal) => goal.weekday),
  );

  return {
    score: questions > 0 ? Math.round((correct / questions) * 1000) / 10 : null,
    studiedMinutes: goals.reduce((total, goal) => total + goal.spentMinutes, 0),
    questionsAnswered: questions,
    correctAnswers: correct,
    streakDays: days.size,
    goalsTotal: goals.length,
    goalsCompleted: goals.filter((goal) => goal.status === "completed").length,
  };
}

function buildWeek(weekNumber: number): Week {
  const goals = state.goals
    .filter((row) => row.weekNumber === weekNumber)
    .map(toGoal)
    .sort((a, b) => a.weekday - b.weekday || a.dayPosition - b.dayPosition);

  const days: DayGroup[] = ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
    weekday,
    date: addDays(TODAY, weekday - 1),
    goals: goals.filter((goal) => goal.weekday === weekday),
  }));

  return {
    studyPlanId: PLAN_ID,
    weekNumber,
    startsOn: TODAY,
    endsOn: addDays(TODAY, 6),
    summary: summarize(goals),
    days,
  };
}

function findGoal(goalId: Uuid): GoalRow | undefined {
  return state.goals.find((row) => row.id === goalId);
}

function diagnose(lesson: TheoryLesson): TheoryGoal["diagnosis"] {
  if (lesson.subjectKey === "matematica-financeira") {
    return { kind: "subject_not_audited", subject: lesson.subject };
  }
  if (lesson.hasTheory && lesson.theoryStartPage === null) {
    return { kind: "lesson_without_pages", lesson: lesson.title };
  }
  return { kind: "ok" };
}

function progressOf(lessonId: Uuid): TheoryProgress {
  const known = state.progress.get(lessonId);
  if (known) return known;
  const fresh: TheoryProgress = {
    lessonId,
    currentPage: 0,
    theoryDone: false,
    initialQuestionsDone: 0,
    initialQuestionsRequired: INITIAL_QUESTIONS_REQUIRED,
    initialQuestionsComplete: false,
    lessonDone: false,
  };
  state.progress.set(lessonId, fresh);
  return fresh;
}

/* ------------------------------------------------------------------ *
 * A implementação
 * ------------------------------------------------------------------ */

export const fixturesApi: BoraApi = {
  /* --- Fase 2 --- */

  loadSession: () => later(state.session),

  signIn: (input: Credentials) => {
    const invalid = checkCredentials(input);
    if (invalid) return later<Result<Session>>({ ok: false, error: invalid });
    return later(done(state.session!));
  },

  signUp: (input: SignUpInput) => {
    const invalid = checkSignUp(input);
    if (invalid) return later<Result<Session>>({ ok: false, error: invalid });
    state.session = { ...state.session!, email: input.email, name: input.name.trim() };
    return later(done(state.session));
  },

  signOut: () => {
    state.session = null;
    state.theme = null;
    return later(done(undefined));
  },

  requestPasswordReset: () => later(done(undefined)),
  resetPassword: (password: string) => {
    const invalid = checkPassword(password);
    return later<Result<void>>(invalid ? { ok: false, error: invalid } : done(undefined));
  },

  loadAccount: () =>
    later<Account>({
      profileId: STUDENT_ID,
      name: state.session?.name ?? null,
      email: state.session?.email ?? "",
      plan: "Área Fiscal",
      access: state.session?.access ?? "pending",
      accessExpiresAt: state.session?.accessExpiresAt ?? null,
      teacherName: "Professor de Exemplo",
    }),

  saveAccount: ({ name }: AccountInput) => {
    const invalid = checkName(name);
    if (invalid) return later<Result<Account>>({ ok: false, error: invalid });
    if (state.session) state.session = { ...state.session, name };
    return later(
      done<Account>({
        profileId: STUDENT_ID,
        name,
        email: state.session?.email ?? "",
        plan: "Área Fiscal",
        access: state.session?.access ?? "pending",
        accessExpiresAt: state.session?.accessExpiresAt ?? null,
        teacherName: "Professor de Exemplo",
      }),
    );
  },

  loadThemePreference: () => later(state.theme),
  saveThemePreference: (theme: ThemePreference) => {
    state.theme = theme;
    return later(done(undefined));
  },

  /* --- Fase 3 --- */

  listWeeks: () =>
    later<readonly WeekOption[]>([
      { weekNumber: 1, startsOn: TODAY, endsOn: addDays(TODAY, 6), isCurrent: true },
      { weekNumber: 2, startsOn: addDays(TODAY, 7), endsOn: addDays(TODAY, 13), isCurrent: false },
    ]),

  loadWeek: (_studyPlanId: Uuid, weekNumber = 1) => later(buildWeek(weekNumber)),

  recordStudy: (input: RecordStudyInput) =>
    later(
      once(input.requestId, () => {
        const row = findGoal(input.goalId);
        if (!row) return fail<Goal>("not_found", "Meta não encontrada.");
        if (input.correctAnswers > input.questions) {
          return fail<Goal>(
            "validation",
            "Acertos não podem passar do total de questões.",
            "correctAnswers",
          );
        }

        state.entries.push({
          id: nextId("a"),
          goalId: row.id,
          minutes: input.minutes,
          questions: input.questions,
          correctAnswers: input.correctAnswers,
          score:
            input.questions > 0
              ? Math.round((input.correctAnswers / input.questions) * 10000) / 100
              : 0,
          note: input.note ?? null,
          theoryStage: input.theoryStage ?? null,
          manualLesson: input.manualLesson ?? null,
          createdAt: `${TODAY}T12:00:00.000Z`,
        });
        // Registrar não conclui: move para "em andamento" e para por aí.
        if (row.status === "pending") row.status = "in_progress";
        return done(toGoal(row));
      }),
    ),

  removeStudyEntry: (entryId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const entry = state.entries.find((candidate) => candidate.id === entryId);
        if (!entry) return fail<Goal>("not_found", "Registro não encontrado.");
        state.entries = state.entries.filter((candidate) => candidate.id !== entryId);
        const row = findGoal(entry.goalId)!;
        if (entriesOf(row.id).length === 0 && row.status === "in_progress") row.status = "pending";
        return done(toGoal(row));
      }),
    ),

  completeGoal: (goalId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const row = findGoal(goalId);
        if (!row) return fail<Goal>("not_found", "Meta não encontrada.");
        if (row.status === "completed") {
          return fail<Goal>("conflict", "Esta meta já foi concluída.");
        }
        row.status = "completed";
        row.completedAt = `${TODAY}T12:00:00.000Z`;
        return done(toGoal(row));
      }),
    ),

  reopenGoal: (goalId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const row = findGoal(goalId);
        if (!row) return fail<Goal>("not_found", "Meta não encontrada.");
        row.status = entriesOf(row.id).length > 0 ? "in_progress" : "pending";
        row.completedAt = null;
        return done(toGoal(row));
      }),
    ),

  skipGoal: (goalId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const row = findGoal(goalId);
        if (!row) return fail<Goal>("not_found", "Meta não encontrada.");
        if (row.status === "completed") {
          return fail<Goal>("conflict", "Meta concluída não pode ser pulada.");
        }
        row.status = "skipped";
        return done(toGoal(row));
      }),
    ),

  recordExtraStudy: (input: ExtraStudyInput) =>
    later(
      once(input.requestId, () => {
        const weekday = (((new Date(`${input.date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday;
        const row: GoalRow = {
          id: nextId("9"),
          type: "extra",
          status: "completed",
          weekday,
          dayPosition: 99,
          weekNumber: 1,
          subject: input.subject,
          title: EXTRA_TITLES[input.kind],
          description: input.note ?? null,
          lesson: null,
          block: null,
          plannedMinutes: input.minutes,
          completedAt: `${TODAY}T12:00:00.000Z`,
          theoryLessonId: null,
          subjectKey: null,
        };
        state.goals.push(row);
        state.entries.push({
          id: nextId("a"),
          goalId: row.id,
          minutes: input.minutes,
          questions: input.questions,
          correctAnswers: input.correctAnswers,
          score:
            input.questions > 0
              ? Math.round((input.correctAnswers / input.questions) * 10000) / 100
              : 0,
          note: input.note ?? null,
          theoryStage: null,
          manualLesson: null,
          createdAt: `${TODAY}T12:00:00.000Z`,
        });
        return done(toGoal(row));
      }),
    ),

  loadActivePlan: () => later(PLAN),
  loadSubjects: () => later(SUBJECTS),

  /* --- Fase 4 --- */

  loadTheoryControl: () =>
    later<readonly TheorySubjectControl[]>(
      [...new Set(LESSONS.map((lesson) => lesson.subjectKey))].map((subjectKey) => {
        const lessons = LESSONS.filter((lesson) => lesson.subjectKey === subjectKey);
        const head = lessons[0]!;
        const doneCount = lessons.filter((lesson) => progressOf(lesson.id).lessonDone).length;
        return {
          subject: head.subject,
          subjectKey,
          diagnosis: diagnose(head),
          lessonsTotal: lessons.length,
          lessonsDone: doneCount,
          currentLesson: lessons.find((lesson) => !progressOf(lesson.id).lessonDone) ?? null,
          reviewsDue: state.reviews.filter(
            (review) => review.due && review.subject === head.subject,
          ).length,
        };
      }),
    ),

  loadTheoryGoal: (goalId: Uuid) => {
    const row = findGoal(goalId);
    const lesson = LESSONS.find((candidate) => candidate.id === row?.theoryLessonId) ?? null;
    if (!row || !lesson) {
      return later<TheoryGoal>({
        goalId,
        diagnosis: { kind: "no_catalog_linked" },
        lesson: null,
        progress: null,
        reviews: [],
        nextLessonUnlocked: false,
      });
    }

    const diagnosis = diagnose(lesson);
    if (diagnosis.kind !== "ok") {
      return later<TheoryGoal>({
        goalId,
        diagnosis,
        lesson: null,
        progress: null,
        reviews: [],
        nextLessonUnlocked: false,
      });
    }

    const progress = progressOf(lesson.id);
    return later<TheoryGoal>({
      goalId,
      diagnosis,
      lesson,
      progress,
      reviews: state.reviews.filter((review) => review.lessonId === lesson.id),
      // A próxima aula só abre depois do mínimo de questões iniciais DESTA.
      nextLessonUnlocked: progress.initialQuestionsComplete,
    });
  },

  saveTheoryProgress: (input: SaveTheoryProgressInput) =>
    later(
      once(input.requestId, () => {
        const lesson = LESSONS.find((candidate) => candidate.id === input.lessonId);
        if (!lesson) return fail<TheoryProgress>("not_found", "Aula não encontrada.");

        const current = progressOf(lesson.id);
        const theoryDone =
          lesson.theoryEndPage !== null && input.currentPage >= lesson.theoryEndPage;
        const updated: TheoryProgress = {
          ...current,
          currentPage: input.currentPage,
          theoryDone: current.theoryDone || theoryDone,
          // ENCERRAR SESSÃO NÃO CONCLUI A AULA. Concluir exige teoria lida E o
          // mínimo de questões iniciais — `input.endSession` não entra na conta.
          lessonDone: (current.theoryDone || theoryDone) && current.initialQuestionsComplete,
        };
        state.progress.set(lesson.id, updated);
        return done(updated);
      }),
    ),

  recordInitialQuestions: (input: RecordInitialQuestionsInput) =>
    later(
      once(input.requestId, () => {
        const current = progressOf(input.lessonId);
        const total = current.initialQuestionsDone + input.questions;
        const complete = total >= current.initialQuestionsRequired;
        const updated: TheoryProgress = {
          ...current,
          initialQuestionsDone: total,
          initialQuestionsComplete: complete,
          lessonDone: current.theoryDone && complete,
        };
        state.progress.set(input.lessonId, updated);
        return done(updated);
      }),
    ),

  loadDueReviews: () => later(state.reviews.filter((review) => review.due)),

  recordReviewQuestions: (input: RecordReviewQuestionsInput) =>
    later(
      once(input.requestId, () => {
        const index = state.reviews.findIndex((review) => review.id === input.reviewId);
        if (index < 0) return fail<TheoryReview>("not_found", "Revisão não encontrada.");
        const review = state.reviews[index]!;
        const answered = review.questionsAnswered + input.questions;
        const updated: TheoryReview = {
          ...review,
          questionsAnswered: answered,
          status: answered >= review.minimumQuestions ? "completed" : "in_progress",
          due: answered < review.minimumQuestions,
        };
        state.reviews[index] = updated;
        return done(updated);
      }),
    ),

  /* --- Fase 5 --- */

  loadReviewGrid: () =>
    later<readonly ReviewGridRow[]>(
      [...new Set(LESSONS.map((lesson) => lesson.subjectKey))].map((subjectKey) => {
        const head = LESSONS.find((lesson) => lesson.subjectKey === subjectKey)!;
        return {
          subject: head.subject,
          subjectKey,
          lessonSpacing: 4,
          minimumQuestions: 15,
          reviews: state.reviews.filter((review) => review.subject === head.subject),
          selected: state.selectedSubjects.has(subjectKey),
        };
      }),
    ),

  saveReviewSpacing: (input: SaveReviewSpacingInput) =>
    later(
      input.lessonSpacing < 1
        ? fail<ReviewGridRow>("validation", "O espaçamento mínimo é 1 aula.", "lessonSpacing")
        : done<ReviewGridRow>({
            subject: input.subjectKey,
            subjectKey: input.subjectKey,
            lessonSpacing: input.lessonSpacing,
            minimumQuestions: input.minimumQuestions,
            reviews: [],
            selected: state.selectedSubjects.has(input.subjectKey),
          }),
    ),

  setSelectedSubjects: (_studyPlanId: Uuid, subjectKeys: readonly string[]) => {
    state.selectedSubjects = new Set(subjectKeys);
    return later(done(undefined));
  },

  listReinforcements: () => later(REINFORCEMENTS),

  loadStatistics: (_filter: StatisticsFilter) => later(STATISTICS),

  loadWaitlistEntry: () => later(state.waitlist),

  joinWaitlist: (input: WaitlistInput) => {
    if (input.whatsapp.replace(/\D/g, "").length < 10) {
      return later(fail<WaitlistEntry>("validation", "WhatsApp incompleto.", "whatsapp"));
    }
    state.waitlist = { ...input, studentId: STUDENT_ID, status: "waiting", createdAt: `${TODAY}T09:00:00.000Z` };
    return later(done(state.waitlist));
  },

  redeemCoupon: (code: string) => {
    if (code.trim().toUpperCase() !== "BORA3") {
      return later(fail<Session>("not_found", "Cupom inválido ou já utilizado.", "code"));
    }
    state.session = { ...state.session!, access: "active", accessExpiresAt: addDays(TODAY, 90) };
    return later(done(state.session));
  },

  /* --- Fase 6 --- */

  listStudents: (filter: StudentListFilter) =>
    later(
      state.students.filter((student) => {
        if (filter.classId && student.classId !== filter.classId) return false;
        if (filter.pace && student.pace !== filter.pace) return false;
        if (filter.access && student.access !== filter.access) return false;
        if (filter.search) {
          const needle = filter.search.toLowerCase();
          return (
            (student.name ?? "").toLowerCase().includes(needle) ||
            student.email.toLowerCase().includes(needle)
          );
        }
        return true;
      }),
    ),

  loadStudentFile: (studentId: Uuid) => {
    const card =
      state.students.find((student) => student.studentId === studentId) ?? state.students[0]!;
    return later<StudentFile>({
      card,
      plan: PLAN,
      statistics: STATISTICS,
      sessions: SESSIONS,
      topicDifficulties: TOPICS,
    });
  },

  /**
   * A busca é pelo e-mail INTEIRO, e a fixture é tão exigente quanto o banco.
   *
   * Aceitar prefixo aqui faria a tela nascer com um campo de busca incremental
   * que o adaptador do Supabase recusa — e o defeito só apareceria no dia da
   * integração.
   */
  findStudentByEmail: (email: string) => {
    const invalid = checkStudentEmail(email);
    if (invalid) return later<Result<StudentSearchResult | null>>({ ok: false, error: invalid });

    const id = state.emails.get(email.trim().toLowerCase());
    if (!id) return later(done<StudentSearchResult | null>(null));

    const mine = state.students.find((student) => student.studentId === id);
    if (mine) {
      return later(
        done<StudentSearchResult | null>({
          studentId: mine.studentId,
          name: mine.name,
          hasTeacher: true,
          isMine: true,
        }),
      );
    }

    const candidate = state.candidates.find((person) => person.studentId === id);
    return later(done<StudentSearchResult | null>(candidate ?? null));
  },

  linkStudent: (studentId: Uuid) =>
    later<Result<void>>(
      (() => {
        // Já é seu: a segunda chamada não é erro, e não escreve de novo.
        if (state.students.some((student) => student.studentId === studentId)) {
          return done(undefined);
        }

        const candidate = state.candidates.find((person) => person.studentId === studentId);
        if (!candidate) return fail<void>("not_found", "Aluno não encontrado.");
        if (candidate.hasTeacher) return fail<void>("conflict", "Este aluno já tem professor.");

        state.candidates = state.candidates.filter(
          (person) => person.studentId !== studentId,
        );
        // Nasce SEM ACESSO: vincular diz de quem o aluno é, liberar diz se ele
        // entra. São dois atos, e a tela precisa mostrar o segundo botão.
        state.students = [
          ...state.students,
          {
            studentId: candidate.studentId,
            name: candidate.name,
            email: "",
            access: "pending",
            accessExpiresAt: null,
            classId: null,
            className: null,
            planName: null,
            pace: "on_track",
            progress: 0,
            score: null,
            questionsAnswered: 0,
            studiedMinutes: 0,
            lastActivityAt: null,
          },
        ];
        return done(undefined);
      })(),
    ),

  grantAccess: (input: GrantAccessInput) =>
    later(
      once(input.requestId, () => {
        const invalid = checkAccessMonths(input.months);
        if (invalid) return { ok: false, error: invalid } as Result<StudentCard>;

        const card = state.students.find((student) => student.studentId === input.studentId);
        if (!card) return fail<StudentCard>("not_found", "Aluno não encontrado.");

        // SOMA AO QUE AINDA FALTA, como o banco: quem renova antes do fim não
        // perde dia pago. Uma fixture que zerasse o prazo esconderia o caso.
        const from =
          card.accessExpiresAt && card.accessExpiresAt > TODAY ? card.accessExpiresAt : TODAY;
        return done(patchStudent(card.studentId, {
          access: "active",
          accessExpiresAt: addDays(from, input.months * 30),
        }));
      }),
    ),

  revokeAccess: (studentId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const card = state.students.find((student) => student.studentId === studentId);
        if (!card) return fail<StudentCard>("not_found", "Aluno não encontrado.");
        // A DATA FICA. Bloquear é mudança de status, e apagar a vigência
        // obrigaria a redigitá-la para reativar.
        return done(patchStudent(studentId, { access: "suspended" }));
      }),
    ),

  voidQuizSession: (input: VoidSessionInput) =>
    later(
      once(input.requestId, () => {
        const session = SESSIONS.find((candidate) => candidate.id === input.sessionId);
        if (!session) return fail<QuizSessionSummary>("not_found", "Bateria não encontrada.");
        if (!input.reason.trim()) {
          return fail<QuizSessionSummary>("validation", "Informe o motivo da anulação.", "reason");
        }
        return done<QuizSessionSummary>({ ...session, status: "voided", score: null });
      }),
    ),

  listPlans: () => later<readonly StudyPlanSummary[]>([PLAN]),

  createPlan: (input: StudyPlanInput, requestId: RequestId) =>
    later(
      once(requestId, () =>
        done<StudyPlanSummary>({
          id: nextId("c"),
          name: input.name,
          area: input.area,
          targetExam: input.targetExam ?? null,
          stage: input.stage,
          studyModel: input.studyModel,
          weeklyGoals: input.weeklyGoals,
          startsOn: input.startsOn,
          examDate: input.examDate ?? null,
          status: "active",
        }),
      ),
    ),

  updatePlan: (_planId: Uuid, input: Partial<StudyPlanInput>, requestId: RequestId) =>
    later(once(requestId, () => done<StudyPlanSummary>({ ...PLAN, ...stripUndefined(input) }))),

  activatePlan: (_planId: Uuid, requestId: RequestId) =>
    later(once(requestId, () => done<StudyPlanSummary>({ ...PLAN, status: "active" }))),

  archivePlan: (_planId: Uuid, requestId: RequestId) =>
    later(once(requestId, () => done<StudyPlanSummary>({ ...PLAN, status: "archived" }))),

  previewWeek: (input: GenerateWeekInput) => {
    const existing = state.goals.filter((row) => row.weekNumber === input.weekNumber);
    const preserved = existing.filter((row) => row.status === "completed");
    return later<GenerateWeekPreview>({
      weekNumber: input.weekNumber,
      days: buildWeek(input.weekNumber).days,
      goalsToCreate: 7,
      // No modo seguro, meta concluída não é substituída — é preservada.
      goalsToReplace:
        input.mode === "full" ? existing.length : existing.length - preserved.length,
      goalsPreserved: input.mode === "full" ? 0 : preserved.length,
    });
  },

  generateWeek: (input: GenerateWeekInput) =>
    later(
      once(input.requestId, () => {
        if (input.mode === "safe") {
          // Só sai o que ainda não foi concluído.
          state.goals = state.goals.filter(
            (row) => row.weekNumber !== input.weekNumber || row.status === "completed",
          );
        } else {
          state.goals = state.goals.filter((row) => row.weekNumber !== input.weekNumber);
        }
        state.goals.push(...seedGoals().map((row) => ({ ...row, weekNumber: input.weekNumber })));
        return done(buildWeek(input.weekNumber));
      }),
    ),

  clearPendingGoals: (_studyPlanId: Uuid, weekNumber: number, requestId: RequestId) =>
    later(
      once(requestId, () => {
        state.goals = state.goals.filter(
          (row) => row.weekNumber !== weekNumber || row.status === "completed",
        );
        return done(buildWeek(weekNumber));
      }),
    ),

  listCatalogs: () =>
    later<readonly TheoryCatalog[]>([
      {
        id: CATALOG_ID,
        name: "Área Fiscal v108.5",
        key: "area-fiscal-v108-5",
        description: "Catálogo auditado da área fiscal.",
        active: true,
        lessonCount: LESSONS.length,
        subjectCount: new Set(LESSONS.map((lesson) => lesson.subjectKey)).size,
      },
    ]),

  loadCatalogLessons: () => later(LESSONS),

  loadSubjectRules: () =>
    later<readonly TheorySubjectRule[]>(
      [...new Set(LESSONS.map((lesson) => lesson.subjectKey))].map((subjectKey) => ({
        subject: LESSONS.find((lesson) => lesson.subjectKey === subjectKey)!.subject,
        subjectKey,
        initialQuestions: INITIAL_QUESTIONS_REQUIRED,
        reviews: [
          { reviewNumber: 1, lessonSpacing: 4, minimumQuestions: 15, active: true },
          { reviewNumber: 2, lessonSpacing: 12, minimumQuestions: 15, active: true },
        ],
        active: true,
      })),
    ),

  saveSubjectRule: (_catalogId: Uuid, rule: TheorySubjectRule, requestId: RequestId) =>
    later(
      once(requestId, () =>
        rule.initialQuestions < 1 || rule.initialQuestions > 200
          ? fail<TheorySubjectRule>(
              "validation",
              "As questões iniciais vão de 1 a 200.",
              "initialQuestions",
            )
          : done(rule),
      ),
    ),

  saveLessonOrder: (_catalogId: Uuid, _lessonIds: readonly Uuid[], requestId: RequestId) =>
    later(once(requestId, () => done(undefined))),

  saveLesson: (lesson: TheoryLesson, requestId: RequestId) =>
    later(
      once(requestId, () => {
        if (
          lesson.hasTheory &&
          lesson.theoryStartPage !== null &&
          lesson.theoryEndPage !== null &&
          lesson.theoryEndPage < lesson.theoryStartPage
        ) {
          return fail<TheoryLesson>(
            "validation",
            "A página final não pode ser menor que a inicial.",
            "theoryEndPage",
          );
        }
        return done(lesson);
      }),
    ),

  importMaster: (input: ImportMasterInput) =>
    later(
      once(input.requestId, () =>
        done<ImportMasterResult>({
          lessonsCreated: 128,
          lessonsUpdated: 14,
          // As duas que a auditoria da v108.5 deixou de fora.
          subjectsWithoutPages: ["Matemática Financeira", "Tecnologia da Informação"],
        }),
      ),
    ),

  linkCatalogToPlan: (_studyPlanId: Uuid, _catalogId: Uuid, requestId: RequestId) =>
    later(once(requestId, () => done(undefined))),

  listNotebooks: () => later(NOTEBOOKS),

  saveNotebook: (_studyPlanId: Uuid, notebook: Notebook, requestId: RequestId) =>
    later(once(requestId, () => done(notebook))),

  setNotebookActive: (blockId: Uuid, active: boolean, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const notebook = NOTEBOOKS.find((candidate) => candidate.blockId === blockId);
        if (!notebook) return fail<Notebook>("not_found", "Caderno não encontrado.");
        return done<Notebook>({ ...notebook, active });
      }),
    ),

  deleteNotebook: (blockId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const notebook = NOTEBOOKS.find((candidate) => candidate.blockId === blockId);
        if (!notebook) return fail<Notebook>("not_found", "Caderno não encontrado.");
        // Remover é marcar, nunca apagar: `restoreNotebook` o traz de volta.
        return done<Notebook>({ ...notebook, deleted: true, active: false });
      }),
    ),

  restoreNotebook: (blockId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const notebook = NOTEBOOKS.find((candidate) => candidate.blockId === blockId);
        if (!notebook) return fail<Notebook>("not_found", "Caderno não encontrado.");
        return done<Notebook>({ ...notebook, deleted: false });
      }),
    ),

  /* --- Turmas --- */

  listClasses: () => later(state.classes.map(withCount)),

  createClass: (input: ClassInput, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const invalid = checkClassName(input.name);
        if (invalid) return { ok: false, error: invalid } as Result<TeacherClass>;

        const created: TeacherClass = {
          id: nextId("7"),
          name: input.name.trim(),
          description: input.description?.trim() || null,
          studentCount: 0,
        };
        state.classes = [...state.classes, created];
        return done(created);
      }),
    ),

  renameClass: (classId: Uuid, input: ClassInput, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const invalid = checkClassName(input.name);
        if (invalid) return { ok: false, error: invalid } as Result<TeacherClass>;

        const turma = state.classes.find((candidate) => candidate.id === classId);
        if (!turma) return fail<TeacherClass>("not_found", "Turma não encontrada.");

        const renamed: TeacherClass = {
          ...turma,
          name: input.name.trim(),
          description: input.description?.trim() || null,
        };
        state.classes = state.classes.map((candidate) =>
          candidate.id === classId ? renamed : candidate,
        );
        // O nome está denormalizado no cartão do aluno, como no banco ele vem
        // por junção: renomear precisa aparecer nas duas telas.
        state.students = state.students.map((student) =>
          student.classId === classId ? { ...student, className: renamed.name } : student,
        );
        return done(withCount(renamed));
      }),
    ),

  deleteClass: (classId: Uuid, requestId: RequestId) =>
    later(
      once(requestId, () => {
        const turma = state.classes.find((candidate) => candidate.id === classId);
        if (!turma) return fail<void>("not_found", "Turma não encontrada.");
        // A RECUSA É DO BANCO (gatilho `protect_class_with_students`), e a
        // fixture a repete para o caminho de erro nascer com tela.
        if (studentsOfClass(classId).length > 0) {
          return fail<void>(
            "conflict",
            "Esvazie a turma antes de apagá-la: ainda há aluno matriculado.",
          );
        }
        state.classes = state.classes.filter((candidate) => candidate.id !== classId);
        return done(undefined);
      }),
    ),

  enrollStudent: (classId: Uuid, studentId: Uuid) =>
    later<Result<void>>(
      (() => {
        const student = state.students.find((candidate) => candidate.studentId === studentId);
        if (!student) return fail<void>("not_found", "Aluno não encontrado.");
        // UM ALUNO, UMA TURMA — no banco quem impõe é
        // `class_students_one_per_student_uidx`.
        if (student.classId) {
          return fail<void>("conflict", "Este aluno já está em uma turma. Use “Mover de turma”.");
        }
        return enroll(classId, studentId);
      })(),
    ),

  moveStudent: (classId: Uuid, studentId: Uuid) => later(enroll(classId, studentId)),

  unenrollStudent: (studentId: Uuid) =>
    later<Result<void>>(
      (() => {
        const student = state.students.find((candidate) => candidate.studentId === studentId);
        if (!student) return fail<void>("not_found", "Aluno não encontrado.");
        patchStudent(studentId, { classId: null, className: null });
        return done(undefined);
      })(),
    ),
};

/* ------------------------------------------------------------------ *
 * Escrita no cenário
 * ------------------------------------------------------------------ */

/**
 * Altera um aluno EM LUGAR, e devolve o cartão novo.
 *
 * Devolver um objeto novo sem tocar em `state.students` é o defeito que uma
 * fixture existe para não ter: a tela mostrava "liberado" no aviso e
 * "aguardando" no cartão logo abaixo.
 */
function patchStudent(studentId: Uuid, patch: Partial<StudentCard>): StudentCard {
  const updated = { ...state.students.find((s) => s.studentId === studentId)!, ...patch };
  state.students = state.students.map((student) =>
    student.studentId === studentId ? updated : student,
  );
  return updated;
}

function studentsOfClass(classId: Uuid): readonly StudentCard[] {
  return state.students.filter((student) => student.classId === classId);
}

/** A contagem sai dos alunos, e não de um contador guardado ao lado. */
function withCount(turma: TeacherClass): TeacherClass {
  return { ...turma, studentCount: studentsOfClass(turma.id).length };
}

function enroll(classId: Uuid, studentId: Uuid): Result<void> {
  const turma = state.classes.find((candidate) => candidate.id === classId);
  if (!turma) return fail<void>("not_found", "Turma não encontrada.");
  if (!state.students.some((candidate) => candidate.studentId === studentId)) {
    return fail<void>("not_found", "Aluno não encontrado.");
  }
  patchStudent(studentId, { classId: turma.id, className: turma.name });
  return done(undefined);
}

/* ------------------------------------------------------------------ *
 * Dados sem comportamento
 * ------------------------------------------------------------------ */

const EXTRA_TITLES: Record<ExtraStudyInput["kind"], string> = {
  dry_law: "Lei seca",
  anki: "Anki",
  mock_exam: "Simulado",
  review: "Revisão",
  extra_questions: "Questões extras",
};

/** `exactOptionalPropertyTypes` recusa espalhar `{ campo: undefined }` por cima. */
function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

const PLAN: StudyPlanSummary = {
  id: PLAN_ID,
  name: "Área Fiscal 2027",
  area: "Fiscal",
  targetExam: "Auditor Fiscal Estadual",
  stage: "Pré-edital",
  studyModel: "Avanço progressivo",
  weeklyGoals: 24,
  startsOn: addDays(TODAY, -28),
  examDate: addDays(TODAY, 240),
  status: "active",
};

const SUBJECTS: readonly Subject[] = [
  {
    id: "66666666-6666-4666-8666-000000000001",
    name: "Direito Tributário",
    color: "#0A6E7F",
    weight: 3,
    targetScore: 80,
    blocks: [
      { id: nextId("d"), name: "DT · Bloco 1", position: 1, link: null },
      { id: nextId("d"), name: "DT · Bloco 2", position: 2, link: null },
    ],
    lessons: [
      { id: nextId("e"), name: "Competência tributária", position: 1, link: null },
      { id: nextId("e"), name: "Limitações ao poder de tributar", position: 2, link: null },
    ],
  },
  {
    id: "66666666-6666-4666-8666-000000000002",
    name: "Português",
    color: "#FFB700",
    weight: 2,
    targetScore: 85,
    blocks: [{ id: nextId("d"), name: "PT · Bloco 1", position: 1, link: null }],
    lessons: [{ id: nextId("e"), name: "Ortografia e acentuação", position: 1, link: null }],
  },
];

const REINFORCEMENTS: readonly Reinforcement[] = [
  {
    id: "77777777-7777-4777-8777-000000000001",
    subject: "Direito Tributário",
    blockName: "DT · Bloco 1",
    sourceScore: 47,
    sourceErrors: 8,
    uniqueQuestions: 8,
    completedAt: `${addDays(TODAY, -3)}T19:40:00.000Z`,
  },
];

const STATISTICS: Statistics = {
  score: 72.4,
  questionsAnswered: 1840,
  correctAnswers: 1332,
  studiedMinutes: 9_420,
  goalsCompleted: 96,
  streakDays: 11,
  scoreByWeek: [
    { label: "S1", value: 61 },
    { label: "S2", value: 68 },
    { label: "S3", value: 70 },
    { label: "S4", value: 72 },
  ],
  questionsByWeek: [
    { label: "S1", value: 380 },
    { label: "S2", value: 462 },
    { label: "S3", value: 501 },
    { label: "S4", value: 497 },
  ],
  minutesByDay: [
    { label: "Seg", value: 180 },
    { label: "Ter", value: 150 },
    { label: "Qua", value: 210 },
    { label: "Qui", value: 120 },
    { label: "Sex", value: 165 },
    { label: "Sáb", value: 240 },
    { label: "Dom", value: 60 },
  ],
  minutesByMonth: [
    { label: "Jun", value: 2_100 },
    { label: "Jul", value: 2_640 },
    { label: "Ago", value: 2_400 },
    { label: "Set", value: 2_280 },
  ],
  bySubject: [
    {
      subject: "Direito Tributário",
      questions: 720,
      correctAnswers: 504,
      score: 70,
      targetScore: 80,
    },
    { subject: "Português", questions: 640, correctAnswers: 512, score: 80, targetScore: 85 },
    {
      subject: "Matemática Financeira",
      questions: 480,
      correctAnswers: 316,
      score: 65.8,
      targetScore: 70,
    },
  ],
};

/**
 * Os alunos do professor. FUNÇÃO, e não constante.
 *
 * `seedState()` roda na inicialização do módulo, antes de qualquer `const`
 * declarado abaixo dele — uma constante aqui estaria na zona morta e o módulo
 * quebraria ao carregar. Declaração de função sobe; `const` não.
 */
function seedStudents(): StudentCard[] {
  return [
  {
    studentId: STUDENT_ID,
    name: "Aluna de Exemplo",
    email: "aluna@exemplo.com.br",
    access: "active",
    accessExpiresAt: addDays(TODAY, 120),
    classId: CLASS_A_ID,
    className: "Fiscal 2027 · Turma A",
    planName: "Área Fiscal 2027",
    pace: "on_track",
    progress: 82,
    score: 72.4,
    questionsAnswered: 1840,
    studiedMinutes: 9_420,
    lastActivityAt: `${TODAY}T11:02:00.000Z`,
  },
  {
    studentId: "22222222-2222-4222-8222-000000000002",
    name: "Aluno em Atenção",
    email: "atencao@exemplo.com.br",
    access: "active",
    accessExpiresAt: addDays(TODAY, 30),
    classId: CLASS_A_ID,
    className: "Fiscal 2027 · Turma A",
    planName: "Área Fiscal 2027",
    pace: "attention",
    progress: 58,
    score: 61.2,
    questionsAnswered: 910,
    studiedMinutes: 4_180,
    lastActivityAt: `${addDays(TODAY, -4)}T20:10:00.000Z`,
  },
  {
    studentId: "22222222-2222-4222-8222-000000000003",
    name: "Aluno Atrasado",
    email: "atrasado@exemplo.com.br",
    access: "expired",
    accessExpiresAt: addDays(TODAY, -6),
    classId: null,
    className: null,
    planName: null,
    pace: "behind",
    progress: 21,
    score: null,
    questionsAnswered: 0,
    studiedMinutes: 240,
    lastActivityAt: `${addDays(TODAY, -21)}T08:00:00.000Z`,
  },
  ];
}

function seedClasses(): TeacherClass[] {
  return [
    {
      id: CLASS_A_ID,
      name: "Fiscal 2027 · Turma A",
      description: "Segunda e quarta, 19h",
      studentCount: 2,
    },
    // VAZIA DE PROPÓSITO: é a turma que a tela consegue apagar, e sem ela o
    // caminho de "apagar" nasceria sem cenário.
    { id: CLASS_B_ID, name: "Fiscal 2027 · Turma B", description: null, studentCount: 0 },
  ];
}

/**
 * Quem ainda não é aluno de ninguém.
 *
 * Não existe lista de candidatos no produto — `findStudentByEmail` acha um por
 * vez, pelo e-mail INTEIRO. Isto aqui é a base contra a qual a busca procura, e
 * não uma fila que alguma tela liste.
 */
function seedCandidates(): StudentSearchResult[] {
  return [
    {
      studentId: "22222222-2222-4222-8222-000000000004",
      name: "Candidata Sem Professor",
      hasTeacher: false,
      isMine: false,
    },
    {
      studentId: "22222222-2222-4222-8222-000000000005",
      name: "Aluno de Outro Professor",
      hasTeacher: true,
      isMine: false,
    },
  ];
}

/** O e-mail de cada pessoa que a busca alcança. */
function seedEmails(): Map<string, Uuid> {
  return new Map([
    ["aluna@exemplo.com.br", STUDENT_ID],
    ["atencao@exemplo.com.br", "22222222-2222-4222-8222-000000000002"],
    ["atrasado@exemplo.com.br", "22222222-2222-4222-8222-000000000003"],
    ["candidata@exemplo.com.br", "22222222-2222-4222-8222-000000000004"],
    ["de.outro@exemplo.com.br", "22222222-2222-4222-8222-000000000005"],
  ]);
}

const SESSIONS: readonly QuizSessionSummary[] = [
  {
    id: "88888888-8888-4888-8888-000000000001",
    subject: "Direito Tributário",
    blockName: "DT · Bloco 1",
    status: "completed",
    mainTotal: 15,
    mainCorrect: 7,
    score: 46.7,
    durationMinutes: 38,
    startedAt: `${addDays(TODAY, -3)}T19:00:00.000Z`,
    finishedAt: `${addDays(TODAY, -3)}T19:38:00.000Z`,
  },
  {
    id: "88888888-8888-4888-8888-000000000002",
    subject: "Português",
    blockName: "PT · Bloco 1",
    status: "awaiting_time",
    mainTotal: 15,
    mainCorrect: 12,
    score: 80,
    durationMinutes: null,
    startedAt: `${addDays(TODAY, -1)}T21:00:00.000Z`,
    finishedAt: `${addDays(TODAY, -1)}T21:31:00.000Z`,
  },
];

const TOPICS: readonly TopicDifficulty[] = [
  {
    subject: "Direito Tributário",
    topic: "Imunidades",
    questions: 42,
    errors: 23,
    score: 45.2,
  },
  {
    subject: "Direito Tributário",
    topic: "Competência residual",
    questions: 31,
    errors: 14,
    score: 54.8,
  },
  { subject: "Português", topic: "Crase", questions: 55, errors: 19, score: 65.5 },
];

const NOTEBOOKS: readonly Notebook[] = [
  {
    blockId: "99999999-9999-4999-8999-000000000001",
    subjectKey: "direito-tributario",
    subjectName: "Direito Tributário",
    subjectColor: "#0A6E7F",
    subjectTarget: 80,
    notebookKey: "dt-bloco-1",
    notebookName: "DT · Bloco 1",
    notebookLink: "https://www.tecconcursos.com.br/s/Q1",
    totalQuestions: 120,
    subjectPosition: 1,
    notebookPosition: 1,
    active: true,
    deleted: false,
  },
  {
    blockId: "99999999-9999-4999-8999-000000000002",
    subjectKey: "portugues",
    subjectName: "Português",
    subjectColor: "#FFB700",
    subjectTarget: 85,
    notebookKey: "pt-bloco-1",
    notebookName: "PT · Bloco 1",
    notebookLink: "https://www.tecconcursos.com.br/s/Q2",
    totalQuestions: 90,
    subjectPosition: 2,
    notebookPosition: 1,
    active: true,
    deleted: false,
  },
];
