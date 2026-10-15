/** Simulado e ranking fictícios, exclusivamente no banco local, sem reset. */
import pg from "pg";

const teacherId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const classId = "99999999-0001-4000-8000-000000000001";
const examId = "99999999-0002-4000-8000-000000000001";
const title = "Simulado Área Policial — Demonstração (dados fictícios)";
const subjects = ["Direito Constitucional", "Direito Administrativo", "Português", "Raciocínio Lógico"];
const results = [
  [24, 24, 23, 22], [23, 23, 22, 21], [22, 21, 21, 20], [21, 19, 18, 17],
  [19, 20, 17, 16], [18, 17, 18, 16], [17, 16, 17, 15], [16, 15, 16, 14],
  [15, 14, 15, 13], [14, 13, 13, 12], [13, 12, 12, 10], [12, 11, 10, 9],
];
const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
try {
  await db.query("begin");
  const existing = await db.query("select title from public.mock_exams where id=$1", [examId]);
  if (existing.rowCount) {
    if (existing.rows[0].title !== title) throw new Error("Identificador já usado por outro simulado.");
    console.log("O simulado de demonstração já existe; dados preservados.");
  } else {
    if ((await db.query("select id from public.profiles where id = any($1::uuid[])", [[teacherId, studentId]])).rowCount !== 2) {
      throw new Error("As contas locais de aluno e professor precisam existir antes da demonstração.");
    }
    await db.query("insert into public.classes(id,teacher_id,name,description) values($1,$2,$3,$4)",
      [classId, teacherId, "Turma de Demonstração — Área Policial", "Participantes e notas fictícios para apresentação da plataforma."]);
    await db.query("insert into public.mock_exams(id,teacher_id,class_id,title,exam_date,max_score) values($1,$2,$3,$4,$5,100)",
      [examId, teacherId, classId, title, "2026-10-12"]);
    for (let i = 0; i < results.length; i++) {
      const id = i === 3 ? studentId : `99999999-0003-4000-8000-${String(i + 1).padStart(12, "0")}`;
      if (id !== studentId) {
        // Sem senha nem identidade de login: são apenas participantes fictícios.
        await db.query(`insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'{}',$3::jsonb,now(),now())`,
        [id, `participante-demo-${i + 1}@example.invalid`, JSON.stringify({ name: `Participante fictício ${String(i + 1).padStart(2, "0")}` })]);
        await db.query("update public.profiles set teacher_id=$1 where id=$2", [teacherId, id]);
      }
      await db.query("insert into public.class_students(class_id,student_id,teacher_id) values($1,$2,$3)", [classId, id, teacherId]);
      await db.query("insert into public.mock_exam_results(exam_id,teacher_id,student_id,score) values($1,$2,$3,$4)", [examId, teacherId, id, results[i].reduce((a, b) => a + b, 0)]);
    }
    for (let j = 0; j < subjects.length; j++) {
      await db.query("insert into public.mock_exam_subjects(exam_id,teacher_id,subject,question_count) values($1,$2,$3,25)", [examId, teacherId, subjects[j]]);
      for (let i = 0; i < results.length; i++) {
        const id = i === 3 ? studentId : `99999999-0003-4000-8000-${String(i + 1).padStart(12, "0")}`;
        await db.query("insert into public.mock_exam_subject_results(exam_id,teacher_id,student_id,subject,correct_answers) values($1,$2,$3,$4,$5)", [examId, teacherId, id, subjects[j], results[i][j]]);
      }
    }
    await db.query("update public.mock_exams set published=true where id=$1", [examId]);
    console.log("Criado simulado fictício: 12 participantes, 4 disciplinas, 100 questões; Aluno Local com 75 pontos (4º lugar).");
  }
  await db.query("commit");
  await db.query("begin");
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: studentId, role: "authenticated" })]);
  await db.query("set local role authenticated");
  const board = await db.query("select participant,is_self,score from public.mock_exam_scoreboard($1) where subject is null order by score desc", [examId]);
  if (board.rows.length !== 12 || board.rows.findIndex(row => row.is_self) !== 3) throw new Error("O ranking não corresponde à demonstração esperada.");
  console.log("Verificado com as permissões do aluno: ranking disponível, posição 4/12.");
  await db.query("rollback");
} catch (error) {
  await db.query("rollback");
  throw error;
} finally { await db.end(); }
