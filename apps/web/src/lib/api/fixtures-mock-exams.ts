import type { MockExam, MockExamResult, MockExamSubject, MockExamSubjectResult, MockExamsApi } from "./mock-exams.ts";
import type { Session, StudentCard, TeacherClass, Result } from "./contract.ts";
import { validateMockExam, validScore } from "../domain/mock-exams.ts";

export function createMockExamFixtures(context: {
  session: () => Session | null;
  students: () => readonly StudentCard[];
  classes: () => readonly TeacherClass[];
}): MockExamsApi {
  const firstClass = context.classes()[0];
  let exams: MockExam[] = firstClass ? [{ id: "77777777-7777-4777-8777-000000000001", classId: firstClass.id,
    className: firstClass.name, title: "Simulado presencial · Conhecimentos gerais", examDate: "2026-09-20", maxScore: 100, published: true }] : [];
  const results = new Map<string, MockExamResult[]>(exams[0] ? [[exams[0].id,
    context.students().filter((s) => s.classId === firstClass?.id).map((s, i) => ({ studentId: s.studentId, studentName: s.name ?? "Aluno", score: i ? 72 : 85 }))]] : []);
  const subjects = new Map<string, MockExamSubject[]>(exams[0] ? [[exams[0].id, [
    { examId: exams[0].id, subject: "Língua Portuguesa", questionCount: 20 },
    { examId: exams[0].id, subject: "Direito Constitucional", questionCount: 10 },
    { examId: exams[0].id, subject: "Informática", questionCount: 10 },
  ]]] : []);
  const subjectResults = new Map<string, MockExamSubjectResult[]>(exams[0] ? [[exams[0].id,
    context.students().filter((s) => s.classId === firstClass?.id).flatMap((s, i) => [
      { studentId: s.studentId, subject: "Língua Portuguesa", correctAnswers: i ? 13 : 17 },
      { studentId: s.studentId, subject: "Direito Constitucional", correctAnswers: i ? 8 : 6 },
      { studentId: s.studentId, subject: "Informática", correctAnswers: i ? 5 : 9 },
    ])]] : []);
  const ok = <T>(data: T): Result<T> => ({ ok: true, data });
  const fail = <T>(message: string): Result<T> => ({ ok: false, error: { code: "validation", message } });
  const teacher = () => context.session()?.role === "teacher";
  const visible = (exam: MockExam) => teacher() || (context.session()?.access === "active" && exam.published
    && context.students().some((s) => s.studentId === context.session()?.profileId && s.classId === exam.classId));
  return {
    async listMockExams() { return exams.filter(visible).sort((a, b) => b.examDate.localeCompare(a.examDate)); },
    async loadMockExamResults(id) { return exams.some((e) => e.id === id && visible(e)) ? [...(results.get(id) ?? [])] : []; },
    async listMockExamSubjects(id) { return exams.some((e) => e.id === id && visible(e)) ? [...(subjects.get(id) ?? [])] : []; },
    async loadMockExamSubjectResults(id) { return exams.some((e) => e.id === id && visible(e)) ? [...(subjectResults.get(id) ?? [])] : []; },
    async createMockExam(input) {
      if (!teacher()) return fail("Somente o professor cadastra simulados.");
      const invalid = validateMockExam(input);
      if (invalid) return fail(invalid);
      const turma = context.classes().find((c) => c.id === input.classId);
      if (!turma) return fail("Turma não encontrada.");
      const previous = exams.find((e) => e.id === input.id);
      if (previous) return previous.title === input.title.trim() && previous.classId === input.classId && previous.maxScore === input.maxScore && previous.examDate === input.examDate
        ? ok(previous) : fail("Identificador já utilizado por outro simulado.");
      const exam = { ...input, title: input.title.trim(), className: turma.name, published: false };
      exams.push(exam);
      return ok(exam);
    },
    async saveMockExamScore(examId, studentId, score) {
      if (!teacher()) return fail("Somente o professor lança notas.");
      const exam = exams.find((e) => e.id === examId);
      const student = context.students().find((s) => s.studentId === studentId && s.classId === exam?.classId);
      if (!exam || !student) return fail("Aluno não pertence à turma do simulado.");
      if (exam.published) return fail("Retire a publicação antes de alterar as notas.");
      if (score !== null && !validScore(score, exam.maxScore)) return fail("Nota inválida.");
      results.set(examId, [...(results.get(examId) ?? []).filter((r) => r.studentId !== studentId), { studentId, studentName: student.name ?? "Aluno", score }]);
      return ok(undefined);
    },
    async saveMockExamSubject(examId, subject, questionCount) {
      const exam = exams.find((e) => e.id === examId);
      if (!teacher() || !exam) return fail("Simulado não encontrado.");
      if (exam.published) return fail("Retire a publicação antes de alterar as matérias.");
      const name = subject.trim();
      if (!name || name.length > 100 || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 1000) return fail("Matéria ou total de questões inválido.");
      if ((subjectResults.get(examId) ?? []).some((r) => r.subject === name && r.correctAnswers > questionCount)) return fail("Há acertos lançados acima do novo total de questões.");
      subjects.set(examId, [...(subjects.get(examId) ?? []).filter((s) => s.subject !== name), { examId, subject: name, questionCount }].sort((a, b) => a.subject.localeCompare(b.subject, "pt-BR")));
      return ok(undefined);
    },
    async saveMockExamSubjectScore(examId, studentId, subject, correctAnswers) {
      const exam = exams.find((e) => e.id === examId);
      const student = context.students().find((s) => s.studentId === studentId && s.classId === exam?.classId);
      const item = (subjects.get(examId) ?? []).find((s) => s.subject === subject);
      if (!teacher() || !exam || !student || !item) return fail("Aluno ou matéria não pertence ao simulado.");
      if (exam.published) return fail("Retire a publicação antes de alterar os acertos.");
      if (correctAnswers !== null && (!Number.isInteger(correctAnswers) || correctAnswers < 0 || correctAnswers > item.questionCount)) return fail("Acertos inválidos.");
      subjectResults.set(examId, [...(subjectResults.get(examId) ?? []).filter((r) => r.studentId !== studentId || r.subject !== subject),
        ...(correctAnswers === null ? [] : [{ studentId, subject, correctAnswers }])]);
      return ok(undefined);
    },
    async publishMockExam(id, published) {
      if (!teacher() || !exams.some((e) => e.id === id)) return fail("Simulado não encontrado.");
      exams = exams.map((e) => e.id === id ? { ...e, published } : e);
      return ok(undefined);
    },
  };
}
