import { supabase } from "@/lib/supabase/client";
import type { MockExam, MockExamInput, MockExamsApi } from "../mock-exams.ts";
import { validScore, validateMockExam } from "../../domain/mock-exams.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { requireSession } from "./session.ts";
import type { Row } from "@bora/database";

function toExam(row: Row<"mock_exams">, className: string): MockExam {
  return { id: row.id, classId: row.class_id, className, title: row.title,
    examDate: row.exam_date, maxScore: row.max_score, published: row.published };
}

export const mockExamsApi: MockExamsApi = {
  async listMockExams() {
    const { data, error } = await supabase.from("mock_exams").select("*").order("exam_date", { ascending: false }).order("id");
    if (error) throwDb(error);
    if (!data?.length) return [];
    const classes = await supabase.from("classes").select("id,name").in("id", [...new Set(data.map((exam) => exam.class_id))]);
    if (classes.error) throwDb(classes.error);
    const names = new Map(classes.data?.map((item) => [item.id, item.name]));
    return data.map((exam) => toExam(exam, names.get(exam.class_id) ?? "Turma"));
  },
  async loadMockExamResults(examId) {
    const { data, error } = await supabase.from("mock_exam_results").select("student_id,student_name,score").eq("exam_id", examId);
    if (error) throwDb(error);
    return (data ?? []).map((row) => ({ studentId: row.student_id, studentName: row.student_name, score: row.score }));
  },
  async createMockExam(input: MockExamInput) {
    const invalid = validateMockExam(input);
    if (invalid) return fail("validation", invalid);
    const session = await requireSession();
    if (session.role !== "teacher") return fail("forbidden", "Somente o professor cadastra simulados.");
    const payload = { id: input.id, teacher_id: session.profileId, class_id: input.classId,
      title: input.title.trim(), exam_date: input.examDate, max_score: input.maxScore };
    const inserted = await supabase.from("mock_exams").insert(payload).select("*").single();
    if (inserted.error && inserted.error.code !== "23505") return failure(translateDbError(inserted.error));
    const result = inserted.error ? await supabase.from("mock_exams").select("*").eq("id", input.id).single() : inserted;
    if (result.error) return failure(translateDbError(result.error));
    const row = result.data;
    if (!row || row.class_id !== input.classId || row.title !== payload.title || row.exam_date !== input.examDate || row.max_score !== input.maxScore) {
      return fail("conflict", "Este identificador já foi usado em outro cadastro. Feche e abra o formulário novamente.");
    }
    return done(toExam(row, "Turma"));
  },
  async saveMockExamScore(examId, studentId, score) {
    const session = await requireSession();
    if (session.role !== "teacher") return fail("forbidden", "Somente o professor lança notas.");
    const exam = await supabase.from("mock_exams").select("max_score,published").eq("id", examId).single();
    if (exam.error) return failure(translateDbError(exam.error));
    if (exam.data.published) return fail("conflict", "Retire a publicação antes de alterar as notas.");
    if (score !== null && !validScore(score, exam.data.max_score)) return fail("validation", "Informe uma nota entre zero e a pontuação máxima, com até duas casas decimais.");
    const existing = await supabase.from("mock_exam_results").select("student_id").eq("exam_id", examId).eq("student_id", studentId).maybeSingle();
    if (existing.error) return failure(translateDbError(existing.error));
    if (!existing.data) {
      const inserted = await supabase.from("mock_exam_results").insert({ exam_id: examId, teacher_id: session.profileId, student_id: studentId, score });
      if (!inserted.error) return done(undefined);
      if (inserted.error.code !== "23505") return failure(translateDbError(inserted.error));
    }
    const updated = await supabase.from("mock_exam_results").update({ score }).eq("exam_id", examId).eq("student_id", studentId).select("student_id").maybeSingle();
    if (updated.error) return failure(translateDbError(updated.error));
    if (!updated.data) return fail("not_found", "Resultado não encontrado ou sem permissão para alterar.");
    return done(undefined);
  },
  async publishMockExam(examId, published) {
    const result = await supabase.from("mock_exams").update({ published }).eq("id", examId).select("id").maybeSingle();
    if (result.error) return failure(translateDbError(result.error));
    if (!result.data) return fail("not_found", "Simulado não encontrado ou sem permissão para publicar.");
    return done(undefined);
  },
};
