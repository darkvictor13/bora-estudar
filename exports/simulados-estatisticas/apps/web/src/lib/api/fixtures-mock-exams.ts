import type { MockExam, MockExamResult, MockExamsApi } from "./mock-exams.ts";
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
  const ok = <T>(data: T): Result<T> => ({ ok: true, data });
  const fail = <T>(message: string): Result<T> => ({ ok: false, error: { code: "validation", message } });
  const teacher = () => context.session()?.role === "teacher";
  const visible = (exam: MockExam) => teacher() || (context.session()?.access === "active" && exam.published
    && context.students().some((s) => s.studentId === context.session()?.profileId && s.classId === exam.classId));
  return {
    async listMockExams() { return exams.filter(visible).sort((a, b) => b.examDate.localeCompare(a.examDate)); },
    async loadMockExamResults(id) { return exams.some((e) => e.id === id && visible(e)) ? [...(results.get(id) ?? [])] : []; },
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
    async publishMockExam(id, published) {
      if (!teacher() || !exams.some((e) => e.id === id)) return fail("Simulado não encontrado.");
      exams = exams.map((e) => e.id === id ? { ...e, published } : e);
      return ok(undefined);
    },
  };
}
