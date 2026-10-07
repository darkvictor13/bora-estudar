-- =============================================================================
-- Fecha a escrita direta que as RPCs do 5a e do 5b substituíram (QA-04, PR 5c)
-- =============================================================================
-- Implementa `docs/specs/12-conclusao-de-meta.md` (R-CONC-27),
-- `docs/specs/19-estudo-extra-avulso.md` (R-EXTRA-06) e
-- `docs/specs/32-fluxo-da-teoria.md` (R-TEO-20).
--
-- O QUE FECHA
--
--   goal_entries     INSERT e UPDATE para `authenticated`, professor incluído
--                    (D-19). O registro nasce em `record_goal_entry`,
--                    `record_extra_study` ou `record_initial_questions`, e não
--                    se edita: corrigir é apagar e registrar de novo.
--   goals            o ramo do aluno em `goals_insert`. Estudo extra é
--                    `record_extra_study`; o aluno não insere meta.
--   theory_progress  as colunas de contagem e de conclusão, no INSERT e no
--                    UPDATE. Sobra a leitura: `current_page`, `theory_done` e
--                    `theory_done_at`.
--   theory_reviews   INSERT e UPDATE. A revisão nasce em
--                    `record_initial_questions` e avança em
--                    `record_review_questions`.
--
-- O QUE FICA: DELETE nas quatro, como antes (a policy decide, e o aluno só
-- apaga com acesso vigente nas de `goal_entries` e `goals`); SELECT; e, em
-- `theory_progress`, a escrita direta da leitura do PDF.
--
-- COMPATIBILIDADE COM O BUNDLE NO AR: o bundle do 5b não escreve em nada disto
-- — as quatro RPCs são SECURITY DEFINER e não dependem destes grants. Esta
-- migration SÓ PODE SER APLICADA depois de o 5b estar em staging: uma aba aberta
-- com o bundle anterior passa a receber `42501` ao registrar estudo.
--
-- O QUE ESTA MIGRATION FEZ COM OS DADOS: nenhum alterado; nenhuma constraint
-- nova. Só policies e privilégios.
-- =============================================================================

-- 1. goal_entries. Revogar no nível da TABELA leva junto os grants de coluna
--    (os do 5a e os da migration inicial). Sem policy de INSERT e de UPDATE, a
--    tabela fica como `quiz_session_questions`: SELECT, DELETE pela policy, e
--    escrita por RPC.
drop policy goal_entries_insert on public.goal_entries;
drop policy goal_entries_update on public.goal_entries;
revoke insert, update on public.goal_entries from authenticated;

-- 2. goals: só o professor insere direto. A condição do ramo do professor é a
--    vigente (nenhum PR anterior a mexeu); sai só o `or (...)` do aluno.
alter policy goals_insert on public.goals
  with check (teacher_id = (select auth.uid()));

-- 3. theory_progress. O UPDATE é por COLUNA: revoga-se coluna a coluna. O INSERT
--    é de TABELA, e revogar coluna de um grant de tabela não tira nada — por
--    isso revoga-se a tabela e concedem-se as colunas de novo. `id`, `created_at`
--    e `updated_at` têm default e não precisam de privilégio.
revoke update (initial_questions_done, initial_questions_complete,
               initial_questions_complete_at, lesson_done, lesson_done_at)
  on public.theory_progress from authenticated;
revoke insert on public.theory_progress from authenticated;
grant insert (student_id, study_plan_id, theory_lesson_id,
              current_page, theory_done, theory_done_at)
  on public.theory_progress to authenticated;

-- 4. theory_reviews: sobra o DELETE do dono. A policy `for all` dá lugar a uma
--    de DELETE; SELECT já tem a sua.
drop policy theory_reviews_write on public.theory_reviews;
create policy theory_reviews_delete on public.theory_reviews
  for delete to authenticated
  using (student_id = (select auth.uid()));
revoke insert, update on public.theory_reviews from authenticated;
