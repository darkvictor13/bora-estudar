/**
 * TURMAS — a única família de escrita do professor que NÃO passa por RPC.
 *
 * `classes` e `class_students` estão na linha de PLANEJAMENTO da tabela de
 * fronteira do CLAUDE.md, ao lado de `study_plans`, e as três defesas já estão
 * montadas desde a migration inicial:
 *
 *  1. `WITH CHECK` amarrando a linha a quem escreve (`teacher_id = auth.uid()`);
 *  2. `is_teacher_of(student_id)`, que confere o vínculo pelo ALUNO — sem ele,
 *     qualquer professor matriculava aluno alheio na própria turma;
 *  3. a FK composta `class_students_class_fk (class_id, teacher_id)`, que
 *     confere a outra ponta: que a turma de destino é de quem está escrevendo.
 *
 * Uma RPC aqui não acrescentaria garantia nenhuma, e acrescentaria superfície.
 *
 * ## Duas regras que moram no banco, e não neste arquivo
 *
 * - **Um aluno está em uma turma** — `class_students_one_per_student_uidx`.
 *   Matricular quem já está em outra é `23505`, e é por isso que MOVER é um
 *   `UPDATE` e não um par apagar/inserir.
 * - **Turma com aluno dentro não é apagada** — o gatilho
 *   `protect_class_with_students`. A mensagem dele já está em português e já é
 *   dirigida a quem clicou, então `translateDbError` a repassa inteira.
 */
import { supabase } from "@/lib/supabase/client";

import type { ClassInput, RequestId, Result, TeacherClass, Uuid } from "../contract.ts";
import { checkClassName } from "../validation.ts";
import { done, fail, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

interface ClassRow {
  id: string;
  name: string;
  description: string | null;
}

/**
 * As turmas do professor, com quantos alunos cada uma tem.
 *
 * Duas consultas, e não uma por turma: a contagem sai de um único `select` em
 * `class_students` e é somada aqui. Com dez turmas, a forma ingênua seriam onze
 * idas ao servidor para desenhar uma lista.
 */
export async function listClasses(): Promise<readonly TeacherClass[]> {
  const session = await requireSession();

  const [classes, members] = await Promise.all([
    supabase
      .from("classes")
      .select("id,name,description")
      .eq("teacher_id", session.profileId)
      .order("name"),
    supabase.from("class_students").select("class_id").eq("teacher_id", session.profileId),
  ]);

  if (classes.error) throwDb(classes.error);
  if (members.error) throwDb(members.error);

  const countByClass = new Map<string, number>();
  for (const row of members.data ?? []) {
    countByClass.set(row.class_id, (countByClass.get(row.class_id) ?? 0) + 1);
  }

  return ((classes.data ?? []) as ClassRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    studentCount: countByClass.get(row.id) ?? 0,
  }));
}

function toClass(row: ClassRow, studentCount: number): TeacherClass {
  return { id: row.id, name: row.name, description: row.description, studentCount };
}

export function createClass(input: ClassInput, requestId: RequestId): Promise<Result<TeacherClass>> {
  return once(requestId, async () => {
    const invalid = checkClassName(input.name);
    if (invalid) return failure<TeacherClass>(invalid);

    const session = await requireSession();

    const { data, error } = await supabase
      .from("classes")
      .insert({
        teacher_id: session.profileId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
      })
      .select("id,name,description")
      .single();

    if (error) return failure(translateDbError(error));
    return done(toClass(data as ClassRow, 0));
  });
}

/**
 * Renomeia — e só. `teacher_id` ficou FORA do `grant update` de `classes` em
 * 18/09/2026: o `WITH CHECK` já impedia a transferência, mas a RLS decide qual
 * LINHA e nunca qual COLUNA, e um grant que a interface não usa é o mais barato
 * de restringir.
 */
export function renameClass(
  classId: Uuid,
  input: ClassInput,
  requestId: RequestId,
): Promise<Result<TeacherClass>> {
  return once(requestId, async () => {
    const invalid = checkClassName(input.name);
    if (invalid) return failure<TeacherClass>(invalid);

    const { data, error } = await supabase
      .from("classes")
      .update({ name: input.name.trim(), description: input.description?.trim() || null })
      .eq("id", classId)
      .select("id,name,description")
      .maybeSingle();

    if (error) return failure(translateDbError(error));
    // A RLS FILTRA EM SILÊNCIO: um UPDATE recusado por policy afeta zero linhas
    // e não levanta erro nenhum. Sem esta conferência a tela diria "salvo".
    if (!data) return fail<TeacherClass>("not_found", "Turma não encontrada, ou não é sua.");

    const members = await supabase
      .from("class_students")
      .select("student_id")
      .eq("class_id", classId);
    if (members.error) return failure(translateDbError(members.error));

    return done(toClass(data as ClassRow, (members.data ?? []).length));
  });
}

export function deleteClass(classId: Uuid, requestId: RequestId): Promise<Result<void>> {
  return once(requestId, async () => {
    const { error, count } = await supabase
      .from("classes")
      .delete({ count: "exact" })
      .eq("id", classId);

    if (error) {
      // `P0001` num `delete from classes` só pode vir de um lugar:
      // `protect_class_with_students`. A frase é reescrita aqui, e não no
      // gatilho, porque as mensagens de `raise exception` deste schema são
      // todas sem acento — e a fixture precisa recusar com a MESMA frase que o
      // Supabase, senão o teste que fixou uma delas passa a mentir.
      if (error.code === "P0001") {
        return fail<void>(
          "conflict",
          "Esvazie a turma antes de apagá-la: ainda há aluno matriculado.",
        );
      }
      return failure(translateDbError(error));
    }
    if (count === 0) return fail<void>("not_found", "Turma não encontrada, ou não é sua.");
    return done(undefined);
  });
}

export async function enrollStudent(classId: Uuid, studentId: Uuid): Promise<Result<void>> {
  const session = await requireSession();

  const { error } = await supabase.from("class_students").insert({
    class_id: classId,
    student_id: studentId,
    teacher_id: session.profileId,
  });

  if (error) {
    // `23505` aqui é sempre a mesma coisa: o aluno já está numa turma. A frase
    // genérica de `translateDbError` ("este registro já existe") não diria a
    // quem clicou o que fazer em seguida.
    if (error.code === "23505") {
      return fail<void>("conflict", "Este aluno já está em uma turma. Use “Mover de turma”.");
    }
    return failure(translateDbError(error));
  }
  return done(undefined);
}

/**
 * Muda o aluno de turma.
 *
 * UM `UPDATE`, e não apagar e inserir: em dois comandos o aluno fica fora de
 * turma nenhuma no meio do caminho, e uma falha entre eles o deixa lá.
 * `class_id` é a única coluna no grant — `student_id` e `teacher_id` são
 * contexto e ficam de fora.
 */
export async function moveStudent(classId: Uuid, studentId: Uuid): Promise<Result<void>> {
  const { error, count } = await supabase
    .from("class_students")
    .update({ class_id: classId }, { count: "exact" })
    .eq("student_id", studentId);

  if (error) return failure(translateDbError(error));
  // Zero linhas é o aluno que ainda não está em turma nenhuma — ou a policy
  // filtrando em silêncio. Nos dois casos, matricular é o caminho.
  if (count === 0) return enrollStudent(classId, studentId);
  return done(undefined);
}

/**
 * Desmatricular APAGA a linha.
 *
 * Matrícula em turma não é histórico: o que não pode sumir — planejamento,
 * metas, ledger, `access_grants` — não tem `delete` para `authenticated` em
 * lugar nenhum, e `class_students` sempre teve.
 */
export async function unenrollStudent(studentId: Uuid): Promise<Result<void>> {
  const { error } = await supabase.from("class_students").delete().eq("student_id", studentId);

  if (error) return failure(translateDbError(error));
  return done(undefined);
}
