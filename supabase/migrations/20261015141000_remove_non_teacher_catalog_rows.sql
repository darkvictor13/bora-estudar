-- Apaga o que quem NÃO é professor gravou no catálogo de teoria.
--
-- Até `20261015130000` as policies `*_write` conferiam só `teacher_id =
-- auth.uid()`, e qualquer conta recém-cadastrada gravava nessas tabelas com o
-- próprio id. A policy já foi corrigida; esta migration remove as linhas que o
-- furo deixou. Por definição elas são lixo: catálogo, aula e regra só existem
-- para um professor, e nenhuma tela mostra a de quem não é.
--
-- Nada de aluno, planejamento ou meta é tocado. O critério é o papel ATUAL do
-- dono (`profiles.role`): um professor que já foi aluno não perde nada, e a
-- linha de um perfil que nunca foi professor sai. A ordem respeita as FKs: as
-- tabelas filhas primeiro, o catálogo por último. `theory_lessons.catalog_id`
-- e `classes.theory_catalog_id` são `SET NULL`, e nenhuma delas pode apontar
-- para o catálogo de um não-professor sem passar pela mesma regra.

delete from public.study_plan_theory_catalogs
 where teacher_id not in (select id from public.profiles where role = 'teacher');

delete from public.theory_review_rules
 where teacher_id not in (select id from public.profiles where role = 'teacher');

delete from public.theory_catalog_subject_rules
 where teacher_id not in (select id from public.profiles where role = 'teacher');

delete from public.theory_subject_rules
 where teacher_id not in (select id from public.profiles where role = 'teacher');

delete from public.theory_lessons
 where teacher_id not in (select id from public.profiles where role = 'teacher');

delete from public.theory_catalogs
 where teacher_id not in (select id from public.profiles where role = 'teacher');
