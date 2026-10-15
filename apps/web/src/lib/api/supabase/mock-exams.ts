import { supabase } from "@/lib/supabase/client";
import type { MockExam, MockExamInput, MockExamsApi } from "../mock-exams.ts";
import { PEER_NAME, peerId, validScore, validateMockExam } from "../../domain/mock-exams.ts";
import { done, fail, failure, throwDb, settle, translateDbError } from "./errors.ts";
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
  async loadMockExamScores(examId) {
    const session = await requireSession();
    if (session.role === "teacher") {
      // O nome vem de `profiles`, que o professor lê para os próprios alunos — a
      // tabela de notas não guarda cópia dele.
      const [results, subjectResults] = await Promise.all([
        supabase.from("mock_exam_results").select("student_id,score,student:profiles(name)").eq("exam_id", examId),
        supabase.from("mock_exam_subject_results").select("student_id,subject,correct_answers").eq("exam_id", examId),
      ]);
      if (results.error) throwDb(results.error);
      if (subjectResults.error) throwDb(subjectResults.error);
      return {
        results: (results.data ?? []).map((row) => ({ studentId: row.student_id,
          studentName: row.student?.name?.trim() || "Aluno", score: row.score })),
        subjectResults: (subjectResults.data ?? []).map((row) => ({ studentId: row.student_id,
          subject: row.subject, correctAnswers: row.correct_answers })),
      };
    }
    // O aluno não lê as notas da turma nas tabelas — a RLS só lhe mostra a
    // própria linha. O placar inteiro vem anônimo, da função.
    const { data, error } = await supabase.rpc("mock_exam_scoreboard", { p_exam_id: examId });
    if (error) throwDb(error);
    const rows = data ?? [];
    const idOf = (row: { is_self: boolean; participant: number }) => row.is_self ? session.profileId : peerId(row.participant);
    return {
      results: rows.filter((row) => row.subject === null).map((row) => ({ studentId: idOf(row),
        studentName: row.is_self ? session.name?.trim() || "Você" : PEER_NAME, score: Number(row.score) })),
      subjectResults: rows.filter((row) => row.subject !== null).map((row) => ({ studentId: idOf(row),
        subject: row.subject ?? "", correctAnswers: Number(row.score) })),
    };
  },
  async listMockExamSubjects(examId) {
    const { data, error } = await supabase.from("mock_exam_subjects").select("exam_id,subject,question_count")
      .eq("exam_id", examId).order("subject");
    if (error) throwDb(error);
    return (data ?? []).map((row) => ({ examId: row.exam_id, subject: row.subject, questionCount: row.question_count }));
  },
  createMockExam(input: MockExamInput) {
    return settle(async () => {
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
    });
  },
  saveMockExamScore(examId, studentId, score) {
    return settle(async () => {
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
    });
  },
  saveMockExamSubject(examId, subject, questionCount) {
    return settle(async () => {
      const session = await requireSession();
      if (session.role !== "teacher") return fail("forbidden", "Somente o professor cadastra matérias.");
      const name = subject.trim();
      if (!name || name.length > 100 || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 1000)
        return fail("validation", "Informe a matéria e um total de 1 a 1.000 questões.");
      const exam = await supabase.from("mock_exams").select("published").eq("id", examId).single();
      if (exam.error) return failure(translateDbError(exam.error));
      if (exam.data.published) return fail("conflict", "Retire a publicação antes de alterar as matérias.");
      const existing = await supabase.from("mock_exam_subjects").select("subject").eq("exam_id", examId).eq("subject", name).maybeSingle();
      if (existing.error) return failure(translateDbError(existing.error));
      const saved = existing.data
        ? await supabase.from("mock_exam_subjects").update({ question_count: questionCount }).eq("exam_id", examId).eq("subject", name)
        : await supabase.from("mock_exam_subjects").insert({ exam_id: examId, teacher_id: session.profileId, subject: name, question_count: questionCount });
      return saved.error ? failure(translateDbError(saved.error)) : done(undefined);
    });
  },
  saveMockExamSubjectScore(examId, studentId, subject, correctAnswers) {
    return settle(async () => {
      const session = await requireSession();
      if (session.role !== "teacher") return fail("forbidden", "Somente o professor lança acertos.");
      const exam = await supabase.from("mock_exams").select("published").eq("id", examId).single();
      if (exam.error) return failure(translateDbError(exam.error));
      if (exam.data.published) return fail("conflict", "Retire a publicação antes de alterar os acertos.");
      const found = await supabase.from("mock_exam_subjects").select("question_count").eq("exam_id", examId).eq("subject", subject).single();
      if (found.error) return failure(translateDbError(found.error));
      if (correctAnswers !== null && (!Number.isInteger(correctAnswers) || correctAnswers < 0 || correctAnswers > found.data.question_count))
        return fail("validation", `Informe de 0 a ${found.data.question_count} acertos inteiros.`);
      if (correctAnswers === null) {
        const deleted = await supabase.from("mock_exam_subject_results").delete().eq("exam_id", examId).eq("student_id", studentId).eq("subject", subject);
        return deleted.error ? failure(translateDbError(deleted.error)) : done(undefined);
      }
      const existing = await supabase.from("mock_exam_subject_results").select("student_id")
        .eq("exam_id", examId).eq("student_id", studentId).eq("subject", subject).maybeSingle();
      if (existing.error) return failure(translateDbError(existing.error));
      const saved = existing.data
        ? await supabase.from("mock_exam_subject_results").update({ correct_answers: correctAnswers })
          .eq("exam_id", examId).eq("student_id", studentId).eq("subject", subject)
        : await supabase.from("mock_exam_subject_results").insert({ exam_id: examId, teacher_id: session.profileId,
          student_id: studentId, subject, correct_answers: correctAnswers });
      return saved.error ? failure(translateDbError(saved.error)) : done(undefined);
    });
  },
  async publishMockExam(examId, published) {
    const result = await supabase.from("mock_exams").update({ published }).eq("id", examId).select("id").maybeSingle();
    if (result.error) return failure(translateDbError(result.error));
    if (!result.data) return fail("not_found", "Simulado não encontrado ou sem permissão para publicar.");
    return done(undefined);
  },
};
