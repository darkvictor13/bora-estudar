-- Escrita de catálogo de teoria é do PROFESSOR, e não de quem tem o próprio id.
--
-- As seis policies `*_write` (FOR ALL) conferiam só `teacher_id = auth.uid()`.
-- Um aluno recém-cadastrado, sem acesso nenhum, inseria em `theory_catalogs` e
-- `theory_subject_rules` com o próprio id no `teacher_id` — verificado com
-- `authenticated` e a linha de aluno criada pelo gatilho de cadastro. Não vaza
-- nada entre contas (a linha fica com quem a criou), mas o cadastro é aberto e
-- as tabelas não têm teto de linhas: qualquer pessoa podia gravar sem limite, e
-- a regra "quem planeja é professor" valia só no front.
--
-- As outras tabelas de planejamento (`goals`, `study_plans`, …) já são
-- seguradas pela FK composta com `study_plans`, cujo INSERT exige
-- `is_teacher_of`. Estas seis não têm esse pai, então a trava é o papel.
--
-- `alter policy` troca a expressão sem abrir janela sem policy. O `FOR ALL`
-- também governa o SELECT dessas tabelas, e isso não tira leitura legítima: a
-- policy `*_select` separada (`can_access_teacher`) segue valendo para o
-- aluno, e a única linha que um não-professor enxergava por aqui era a que ele
-- mesmo gravou.

alter policy theory_catalogs_write on public.theory_catalogs
  using ((select public.is_teacher()) and teacher_id = (select auth.uid()))
  with check ((select public.is_teacher()) and teacher_id = (select auth.uid()));

alter policy theory_lessons_write on public.theory_lessons
  using ((select public.is_teacher()) and teacher_id = (select auth.uid()))
  with check ((select public.is_teacher()) and teacher_id = (select auth.uid()));

alter policy theory_subject_rules_write on public.theory_subject_rules
  using ((select public.is_teacher()) and teacher_id = (select auth.uid()))
  with check ((select public.is_teacher()) and teacher_id = (select auth.uid()));

alter policy theory_review_rules_write on public.theory_review_rules
  using ((select public.is_teacher()) and teacher_id = (select auth.uid()))
  with check ((select public.is_teacher()) and teacher_id = (select auth.uid()));

alter policy theory_catalog_subject_rules_write on public.theory_catalog_subject_rules
  using ((select public.is_teacher()) and teacher_id = (select auth.uid()))
  with check ((select public.is_teacher()) and teacher_id = (select auth.uid()));

alter policy study_plan_theory_catalogs_write on public.study_plan_theory_catalogs
  using ((select public.is_teacher()) and teacher_id = (select auth.uid()))
  with check (
    (select public.is_teacher())
    and teacher_id = (select auth.uid())
    and exists (
      select 1 from public.study_plans p
       where p.id = study_plan_theory_catalogs.study_plan_id
         and p.teacher_id = (select auth.uid())
         and p.student_id = study_plan_theory_catalogs.student_id
    )
  );
