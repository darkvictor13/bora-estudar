export type Uuid = string;
export type IsoDate = string;

export interface ResultError {
  readonly code: string;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ResultError };

export interface MockExam {
  readonly id: string;
  readonly classId: string;
  readonly className: string;
  readonly title: string;
  readonly examDate: string;
  readonly maxScore: number;
  readonly published: boolean;
}

export interface MockExamInput {
  readonly id: string;
  readonly classId: string;
  readonly title: string;
  readonly examDate: string;
  readonly maxScore: number;
}

export interface MockExamResult {
  readonly studentId: string;
  readonly studentName: string;
  readonly score: number | null;
}

export interface StatisticsFilter {
  readonly studyPlanId?: Uuid;
  readonly year?: number;
}

export interface ClassQuestionDistribution {
  readonly scores: readonly number[];
  readonly enrolledStudents: number;
  readonly studentsWithQuestions: number;
  readonly minimumQuestions: number;
}

export interface SeriesPoint {
  readonly label: string;
  readonly value: number;
}

export interface SubjectPerformance {
  readonly subject: string;
  readonly questions: number;
  readonly correctAnswers: number;
  readonly score: number;
  readonly targetScore: number;
}

export interface DailyQuestionPerformance {
  readonly date: IsoDate;
  readonly questions: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly score: number;
}

export interface Statistics {
  readonly score: number | null;
  readonly questionsAnswered: number;
  readonly correctAnswers: number;
  readonly studiedMinutes: number;
  readonly goalsCompleted: number;
  readonly streakDays: number;
  readonly scoreByWeek: readonly SeriesPoint[];
  readonly questionsByWeek: readonly SeriesPoint[];
  readonly dailyQuestions: readonly DailyQuestionPerformance[];
  readonly minutesByDay: readonly SeriesPoint[];
  readonly minutesByMonth: readonly SeriesPoint[];
  readonly bySubject: readonly SubjectPerformance[];
}
