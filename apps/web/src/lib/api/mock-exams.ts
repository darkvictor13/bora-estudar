import type { Result } from "./contract.ts";

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

export interface MockExamSubject {
  readonly examId: string;
  readonly subject: string;
  readonly questionCount: number;
}

export interface MockExamSubjectResult {
  readonly studentId: string;
  readonly subject: string;
  readonly correctAnswers: number;
}

export interface MockExamsApi {
  listMockExams(): Promise<readonly MockExam[]>;
  loadMockExamResults(examId: string): Promise<readonly MockExamResult[]>;
  listMockExamSubjects(examId: string): Promise<readonly MockExamSubject[]>;
  loadMockExamSubjectResults(examId: string): Promise<readonly MockExamSubjectResult[]>;
  createMockExam(input: MockExamInput): Promise<Result<MockExam>>;
  saveMockExamScore(examId: string, studentId: string, score: number | null): Promise<Result<void>>;
  saveMockExamSubject(examId: string, subject: string, questionCount: number): Promise<Result<void>>;
  saveMockExamSubjectScore(examId: string, studentId: string, subject: string, correctAnswers: number | null): Promise<Result<void>>;
  publishMockExam(examId: string, published: boolean): Promise<Result<void>>;
}
