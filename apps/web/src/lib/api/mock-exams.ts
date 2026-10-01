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

/**
 * As notas de um simulado, nas duas granularidades, numa leitura só.
 *
 * Para o PROFESSOR, cada linha traz o aluno de verdade. Para o ALUNO, só a
 * própria linha traz o id e o nome dele; as dos colegas chegam com um id de
 * ocasião (`colega-N`) e o nome `Colega`. O id de ocasião só vale dentro desta
 * leitura — é o que casa a nota geral de alguém com os acertos dessa mesma
 * pessoa por matéria — e por isso as duas listas vêm juntas.
 */
export interface MockExamScores {
  readonly results: readonly MockExamResult[];
  readonly subjectResults: readonly MockExamSubjectResult[];
}

export interface MockExamsApi {
  listMockExams(): Promise<readonly MockExam[]>;
  loadMockExamScores(examId: string): Promise<MockExamScores>;
  listMockExamSubjects(examId: string): Promise<readonly MockExamSubject[]>;
  createMockExam(input: MockExamInput): Promise<Result<MockExam>>;
  saveMockExamScore(examId: string, studentId: string, score: number | null): Promise<Result<void>>;
  saveMockExamSubject(examId: string, subject: string, questionCount: number): Promise<Result<void>>;
  saveMockExamSubjectScore(examId: string, studentId: string, subject: string, correctAnswers: number | null): Promise<Result<void>>;
  publishMockExam(examId: string, published: boolean): Promise<Result<void>>;
}
