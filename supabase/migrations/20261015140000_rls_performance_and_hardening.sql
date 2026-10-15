-- Desempenho das policies e dois endurecimentos pequenos.
--
-- 1. Índices nas FKs que as policies e os cascades usam;
-- 2. `is_teacher()` e `has_active_access()` em subselect nas policies;
-- 3. o INSERT de `profiles` também zera `teacher_id` e `access_origin`;
-- 4. `replay_access_grant` deixa de se declarar IMMUTABLE.

-- ---------- 1. Índices ----------
--
-- O Postgres não indexa a coluna referenciadora de uma FK. Estas são as que
-- (a) as policies filtram em toda leitura (`profiles.teacher_id`,
-- `goal_entries.student_id/teacher_id`) e (b) o cascade a partir de `profiles`
-- varre inteira a cada exclusão de conta. Hoje as tabelas são pequenas e o
-- planner nem escolheria o índice; o custo aparece com volume, e criar índice
-- depois, em tabela grande, trava escrita.
create index profiles_teacher_idx                      on public.profiles (teacher_id)                      where teacher_id is not null;
create index class_students_teacher_idx                on public.class_students (teacher_id);
create index subjects_teacher_idx                      on public.subjects (teacher_id);
create index study_plan_notebooks_student_idx          on public.study_plan_notebooks (student_id);
create index goal_entries_student_idx                  on public.goal_entries (student_id);
create index goal_entries_teacher_idx                  on public.goal_entries (teacher_id);
create index study_plan_theory_catalogs_student_idx    on public.study_plan_theory_catalogs (student_id);
create index study_plan_theory_catalogs_teacher_idx    on public.study_plan_theory_catalogs (teacher_id);
create index theory_catalog_subject_rules_teacher_idx  on public.theory_catalog_subject_rules (teacher_id);
create index theory_review_rules_teacher_idx           on public.theory_review_rules (teacher_id);

-- ---------- 2. `(select …)` nas policies ----------
--
-- `is_teacher()` e `has_active_access()` não recebem argumento: dentro de um
-- subselect o Postgres os avalia UMA vez por instrução (InitPlan) e não uma por
-- linha. As policies já faziam isso com `auth.uid()`; estas ficaram de fora.
-- `can_access_teacher(teacher_id)` e `is_teacher_of(student_id)` recebem a
-- coluna e dependem da linha, então ficam como estão.
--
-- Gerado do catálogo (`pg_get_expr` de cada policy, trocando só as chamadas
-- sem argumento ainda soltas) e conferido linha a linha; o corpo das policies
-- não muda em mais nada.
alter policy class_students_delete on public.class_students
  using (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy class_students_insert on public.class_students
  with check (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid)) AND is_teacher_of(student_id)));

alter policy class_students_update on public.class_students
  using (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid)) AND is_teacher_of(student_id)))
  with check (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid)) AND is_teacher_of(student_id)));

alter policy classes_delete on public.classes
  using (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy classes_insert on public.classes
  with check (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy classes_update on public.classes
  using (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))))
  with check (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy flashcard_reviews_insert on public.flashcard_reviews
  with check (((student_id = ( SELECT auth.uid() AS uid)) AND (select public.has_active_access()) AND (EXISTS ( SELECT 1    FROM (theory_lesson_flashcards card      JOIN theory_lessons lesson ON ((lesson.id = card.theory_lesson_id)))   WHERE ((card.id = flashcard_reviews.card_id) AND (card.theory_lesson_id = flashcard_reviews.theory_lesson_id) AND (NOT card.deleted) AND lesson.active AND lesson.published)))));

alter policy flashcard_reviews_update on public.flashcard_reviews
  using ((student_id = ( SELECT auth.uid() AS uid)))
  with check (((student_id = ( SELECT auth.uid() AS uid)) AND (select public.has_active_access()) AND (EXISTS ( SELECT 1    FROM (theory_lesson_flashcards card      JOIN theory_lessons lesson ON ((lesson.id = card.theory_lesson_id)))   WHERE ((card.id = flashcard_reviews.card_id) AND (card.theory_lesson_id = flashcard_reviews.theory_lesson_id) AND (NOT card.deleted) AND lesson.active AND lesson.published)))));

alter policy goal_entries_delete on public.goal_entries
  using (((teacher_id = ( SELECT auth.uid() AS uid)) OR ((student_id = ( SELECT auth.uid() AS uid)) AND (select public.has_active_access()))));

alter policy goals_delete on public.goals
  using (((teacher_id = ( SELECT auth.uid() AS uid)) OR ((student_id = ( SELECT auth.uid() AS uid)) AND (type = ANY (ARRAY['extra'::goal_type, 'reinforcement'::goal_type])) AND (select public.has_active_access()))));

alter policy goals_update on public.goals
  using (((teacher_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) OR ((student_id = ( SELECT auth.uid() AS uid)) AND (select public.has_active_access()))));

alter policy mock_exam_results_insert on public.mock_exam_results
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()) AND is_teacher_of(student_id)));

alter policy mock_exam_results_select on public.mock_exam_results
  using ((((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())) OR ((student_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM mock_exams e   WHERE (e.id = mock_exam_results.exam_id))))));

alter policy mock_exam_results_update on public.mock_exam_results
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()) AND is_teacher_of(student_id)));

alter policy mock_exam_subject_results_delete on public.mock_exam_subject_results
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy mock_exam_subject_results_insert on public.mock_exam_subject_results
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()) AND is_teacher_of(student_id)));

alter policy mock_exam_subject_results_select on public.mock_exam_subject_results
  using ((((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())) OR ((student_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1    FROM mock_exams e   WHERE (e.id = mock_exam_subject_results.exam_id))))));

alter policy mock_exam_subject_results_update on public.mock_exam_subject_results
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()) AND is_teacher_of(student_id)));

alter policy mock_exam_subjects_delete on public.mock_exam_subjects
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy mock_exam_subjects_insert on public.mock_exam_subjects
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM mock_exams e   WHERE ((e.id = mock_exam_subjects.exam_id) AND (e.teacher_id = mock_exam_subjects.teacher_id) AND (NOT e.published))))));

alter policy mock_exam_subjects_update on public.mock_exam_subjects
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy mock_exams_insert on public.mock_exams
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy mock_exams_select on public.mock_exams
  using ((((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())) OR (published AND (select public.has_active_access()) AND (EXISTS ( SELECT 1    FROM (class_students cs      JOIN profiles p ON ((p.id = cs.student_id)))   WHERE ((cs.class_id = mock_exams.class_id) AND (cs.teacher_id = mock_exams.teacher_id) AND (cs.student_id = ( SELECT auth.uid() AS uid)) AND (p.teacher_id = mock_exams.teacher_id) AND (p.role = 'student'::user_role)))))));

alter policy mock_exams_update on public.mock_exams
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy subject_blocks_delete on public.subject_blocks
  using (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_blocks.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))));

alter policy subject_blocks_insert on public.subject_blocks
  with check (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_blocks.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))));

alter policy subject_blocks_update on public.subject_blocks
  using (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_blocks.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))))
  with check (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_blocks.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))));

alter policy subject_lessons_delete on public.subject_lessons
  using (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_lessons.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))));

alter policy subject_lessons_insert on public.subject_lessons
  with check (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_lessons.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))));

alter policy subject_lessons_update on public.subject_lessons
  using (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_lessons.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))))
  with check (((select public.is_teacher()) AND (EXISTS ( SELECT 1    FROM subjects s   WHERE ((s.id = subject_lessons.subject_id) AND (s.teacher_id = ( SELECT auth.uid() AS uid)))))));

alter policy subjects_delete on public.subjects
  using (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy subjects_insert on public.subjects
  with check (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy subjects_update on public.subjects
  using (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))))
  with check (((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy theory_lesson_flashcards_insert on public.theory_lesson_flashcards
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy theory_lesson_flashcards_update on public.theory_lesson_flashcards
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy theory_progress_write on public.theory_progress
  using ((student_id = ( SELECT auth.uid() AS uid)))
  with check (((student_id = ( SELECT auth.uid() AS uid)) AND (select public.has_active_access())));

alter policy waitlist_delete_teacher on public.waitlist
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher())));

alter policy waitlist_select on public.waitlist
  using (((student_id = ( SELECT auth.uid() AS uid)) OR ((select public.is_teacher()) AND (teacher_id = ( SELECT auth.uid() AS uid)))));

alter policy waitlist_update on public.waitlist
  using ((((student_id = ( SELECT auth.uid() AS uid)) AND (status = 'waiting'::waitlist_status)) OR ((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()))))
  with check ((((student_id = ( SELECT auth.uid() AS uid)) AND (status = 'waiting'::waitlist_status)) OR ((teacher_id = ( SELECT auth.uid() AS uid)) AND (select public.is_teacher()))));


-- ---------- 3. O INSERT de `profiles` não carimba vínculo nem origem ----------
--
-- O perfil nasce pelo gatilho de cadastro, mas o INSERT do cliente continua
-- concedido (suíte 04 o exercita de propósito) e o ramo de INSERT daqui só
-- zerava papel, acesso, plano e cupom. `teacher_id` ficava como o cliente
-- mandasse: quem inserisse a própria linha escolhia o professor sem passar por
-- `link_student`. `access_origin` também. Inalcançável hoje, porque o perfil já
-- existe; o ramo existe justamente para o dia em que deixar de existir.
create or replace function public.protect_profile_admin_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  -- Quem está agindo sai do JWT, e só dele. O banco de origem testava
  -- `session_user = 'postgres'`, que numa conexão do PostgREST é sempre
  -- `authenticator` — a checagem dependia de como a conexão foi aberta. E
  -- `current_user` não serve: dentro de SECURITY DEFINER ele é o DONO da
  -- função, então daria privilegiado para todo mundo.
  --
  -- Sem JWT (migration, psql, seed) é trabalho de manutenção e passa;
  -- `service_role` passa; `authenticated` e `anon` são usuário final e não.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Toda conta nasce aluno, pendente e sem professor. Papel, acesso e
    -- vínculo são concedidos por quem tem privilégio, nunca pelo próprio dono
    -- da linha.
    new.role := 'student';
    new.teacher_id := null;
    new.access_status := 'pending';
    new.access_expires_at := null;
    new.plan := null;
    new.coupon_used := null;
    new.access_origin := null;
    return new;
  end if;

  if (select auth.uid()) = old.id then
    new.role := old.role;
    new.teacher_id := old.teacher_id;
    new.access_status := old.access_status;
    new.access_expires_at := old.access_expires_at;
    new.plan := old.plan;
    new.coupon_used := old.coupon_used;
    new.access_origin := old.access_origin;
  end if;

  return new;
end;
$$;

-- ---------- 4. `replay_access_grant` não é IMMUTABLE ----------
--
-- O `supabase db lint` acusa: a função faz cast para enum, que é STABLE. Não lê
-- tabela, então o risco real era só o planner tratar como constante algo que
-- depende do catálogo de tipos.
alter function app_private.replay_access_grant(public.access_grants, uuid, public.access_grant_action, integer) stable;
