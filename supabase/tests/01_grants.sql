\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Grant por coluna, e o que fica fora dele
-- =============================================================================
-- A RLS decide QUAL LINHA, nunca QUAL COLUNA. Tudo o que impede um UPDATE
-- legítimo de carregar junto a troca de dono está aqui — e não aparece em
-- nenhum teste de tela, porque nenhuma tela tenta.
--
-- As tentativas são feitas como o usuário de verdade, com `set role
-- authenticated`. É de propósito que a maioria espere `insufficient_privilege`
-- e não "0 linhas": privilégio de coluna é recusa com erro 42501, que a tela
-- consegue explicar, enquanto a RLS filtra em silêncio.
-- =============================================================================

set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno

-- ---------- profiles: só `name` ----------
do $$ begin
  update public.profiles set name = 'Bruno Corrigido'
   where id = '22222222-2222-4222-8222-222222222222';
  raise notice '01 OK  o dono grava o proprio nome';
end $$;

do $$ begin
  update public.profiles set role = 'teacher'
   where id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: um aluno se promoveu a professor';
exception when insufficient_privilege then
  raise notice '02 OK  role fora do grant update';
end $$;

do $$ begin
  update public.profiles set access_status = 'active', access_expires_at = now() + interval '1 year'
   where id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o aluno estendeu o proprio acesso';
exception when insufficient_privilege then
  raise notice '03 OK  access_status e access_expires_at fora do grant update';
end $$;

do $$ begin
  update public.profiles set teacher_id = '44444444-4444-4444-8444-444444444444'
   where id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o aluno trocou de professor sozinho';
exception when insufficient_privilege then
  raise notice '04 OK  teacher_id fora do grant update';
end $$;

do $$ begin
  update public.profiles set coupon_used = 'BORA3M', plan = 'Premium'
   where id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o aluno carimbou o proprio cupom';
exception when insufficient_privilege then
  raise notice '05 OK  plan e coupon_used fora do grant update';
end $$;

-- ---------- goals: o contexto fica fora ----------
do $$ begin
  update public.goals set study_plan_id = 'a2000000-0000-4000-8000-000000000002'
   where id = 'a5000000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: a meta mudou de planejamento pelo PostgREST';
exception when insufficient_privilege then
  raise notice '06 OK  goals.study_plan_id fora do grant update';
end $$;

do $$ begin
  update public.goals set teacher_id = '44444444-4444-4444-8444-444444444444'
   where id = 'a5000000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: a meta trocou de professor pelo PostgREST';
exception when insufficient_privilege then
  raise notice '07 OK  goals.teacher_id fora do grant update';
end $$;

do $$ begin
  update public.goals set student_id = '33333333-3333-4333-8333-333333333333'
   where id = 'a5000000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: a meta trocou de aluno pelo PostgREST';
exception when insufficient_privilege then
  raise notice '08 OK  goals.student_id fora do grant update';
end $$;

-- ---------- goal_entries: o `goal_id` é contexto, e as geradas não se escrevem ----------
do $$ begin
  update public.goal_entries set goal_id = 'a5000000-0000-4000-8000-000000000001'
   where id = 'a6000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o registro mudou de meta pelo PostgREST';
exception when insufficient_privilege then
  raise notice '09 OK  goal_entries.goal_id fora do grant update';
end $$;

do $$ begin
  update public.goal_entries set minutes = 50
   where id = 'a6000000-0000-4000-8000-000000000001';
  raise notice '10 OK  o aluno corrige os minutos do proprio registro';
end $$;

do $$
declare v_score numeric;
begin
  -- `score` e `wrong_answers` são colunas geradas: o banco recalcula, e quem
  -- tenta escrever leva erro de sintaxe de comando, não de privilégio.
  begin
    update public.goal_entries set score = 100
     where id = 'a6000000-0000-4000-8000-000000000001';
    raise exception 'FALHOU: escreveu numa coluna gerada';
  exception
    when generated_always then null;
    when insufficient_privilege then null;
  end;

  select score into v_score from public.goal_entries
   where id = 'a6000000-0000-4000-8000-000000000001';
  if v_score <> 80.00 then
    raise exception 'FALHOU: score derivado deu %, esperava 80.00', v_score;
  end if;
  raise notice '11 OK  score e wrong_answers sao derivados, e nao se escrevem';
end $$;

-- ---------- theory_progress / theory_reviews ----------
do $$ begin
  update public.theory_progress set current_page = 20
   where id = 'b3000000-0000-4000-8000-000000000001';
  raise notice '12 OK  o aluno avanca a propria pagina';
end $$;

do $$ begin
  update public.theory_progress set study_plan_id = 'a2000000-0000-4000-8000-000000000002'
   where id = 'b3000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o progresso mudou de planejamento';
exception when insufficient_privilege then
  raise notice '13 OK  theory_progress.study_plan_id fora do grant update';
end $$;

do $$ begin
  update public.theory_reviews set review_number = 2
   where id = 'b4000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: a revisao trocou de numero';
exception when insufficient_privilege then
  raise notice '14 OK  theory_reviews.review_number fora do grant update';
end $$;

-- ---------- access_grants: histórico que ninguém escreve nem corrige ----------
do $$ begin
  insert into public.access_grants (student_id, teacher_id, action, months, request_id)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'grant', 12, gen_random_uuid());
  raise exception 'FALHOU: o aluno escreveu a propria liberacao de acesso';
exception when insufficient_privilege then
  raise notice '15 OK  access_grants nao aceita INSERT (quem escreve e set_student_access)';
end $$;

do $$ begin
  update public.access_grants set months = 12
   where id = 'aa000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: uma liberacao foi corrigida depois de gravada';
exception when insufficient_privilege then
  raise notice '16 OK  access_grants nao aceita UPDATE: historico nao se corrige';
end $$;

do $$ begin
  delete from public.access_grants where id = 'aa000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: uma liberacao foi apagada do historico';
exception when insufficient_privilege then
  raise notice '17 OK  access_grants nao aceita DELETE';
end $$;

-- ---------- Execução: leitura e nada mais ----------
do $$ begin
  update public.quiz_sessions set status = 'voided'
   where id = 'a7000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: a bateria foi anulada sem RPC';
exception when insufficient_privilege then
  raise notice '18 OK  quiz_sessions e somente leitura (anular precisa de RPC)';
end $$;

do $$ begin
  delete from public.quiz_sessions where id = 'a7000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: a bateria foi apagada pelo PostgREST';
exception when insufficient_privilege then
  raise notice '19 OK  quiz_sessions nao aceita DELETE';
end $$;

do $$ begin
  insert into public.quiz_session_questions (
    quiz_session_id, teacher_id, student_id, study_plan_id, block_id,
    question_id, execution_order, round, phase, outcome, answered_at
  ) values (
    'a7000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    'a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',
    1, 1, 0, 'main', 'correct', now());
  raise exception 'FALHOU: o ledger aceitou escrita direta';
exception when insufficient_privilege then
  raise notice '20 OK  o ledger e append-only por RPC, nao pelo cliente';
end $$;

-- ---------- Catálogo comum: leitura para todos, escrita para ninguém ----------
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.catalog_blocks;
  if v_total <> 2 then
    raise exception 'FALHOU: o aluno viu % blocos do catalogo, esperava 2', v_total;
  end if;
  raise notice '21 OK  catalog_blocks e catalogo comum, legivel por qualquer autenticado';
end $$;

do $$ begin
  update public.catalog_blocks set active_questions = 0 where catalog_key = 'pcpr26_forenses_01';
  raise exception 'FALHOU: o catalogo comum aceitou escrita do cliente';
exception when insufficient_privilege then
  raise notice '22 OK  catalog_blocks nao aceita escrita';
end $$;

-- ---------- Turmas: o grant de `classes` passou a ser por coluna ----------
--
-- O `WITH CHECK` de `classes_update` já impedia a transferência, mas a RLS
-- decide QUAL LINHA e nunca QUAL COLUNA, e um grant que a interface não usa é o
-- mais barato de restringir. `class_students` ganhou `update (class_id)` para
-- que mudar de turma seja UM comando — em dois, o aluno fica fora de turma
-- nenhuma no meio do caminho.
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana

do $$ begin
  update public.classes set name = 'Turma da Ana (2027)', description = 'Terça e quinta'
   where id = 'a9000000-0000-4000-8000-000000000001';
  raise notice '23 OK  o professor renomeia a propria turma';
end $$;

do $$ begin
  update public.classes set teacher_id = '44444444-4444-4444-8444-444444444444'
   where id = 'a9000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: a turma trocou de dono pelo PostgREST';
exception when insufficient_privilege then
  raise notice '24 OK  classes.teacher_id fora do grant update';
end $$;

do $$ begin
  update public.class_students set student_id = '33333333-3333-4333-8333-333333333333'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: a matricula trocou de aluno pelo PostgREST';
exception when insufficient_privilege then
  raise notice '25 OK  class_students.student_id fora do grant update';
end $$;

do $$ begin
  update public.class_students set teacher_id = '44444444-4444-4444-8444-444444444444'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: a matricula trocou de professor pelo PostgREST';
exception when insufficient_privilege then
  raise notice '26 OK  class_students.teacher_id fora do grant update';
end $$;

do $$
declare v_afetadas integer;
begin
  update public.class_students set class_id = 'a9000000-0000-4000-8000-000000000001'
   where student_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 1 then
    raise exception 'FALHOU: o professor nao consegue mover o proprio aluno de turma';
  end if;
  raise notice '27 OK  class_id e a unica coluna de class_students no grant update';
end $$;

-- ---------- `anon` não tem tabela nenhuma ----------
reset role;
do $$
declare
  v_tabela text;
  v_sobra  text := '';
begin
  for v_tabela in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','v')
  loop
    if has_table_privilege('anon', 'public.' || quote_ident(v_tabela), 'select')
       or has_table_privilege('anon', 'public.' || quote_ident(v_tabela), 'insert')
       or has_table_privilege('anon', 'public.' || quote_ident(v_tabela), 'update')
       or has_table_privilege('anon', 'public.' || quote_ident(v_tabela), 'delete') then
      v_sobra := v_sobra || ' ' || v_tabela;
    end if;
  end loop;

  if v_sobra <> '' then
    raise exception 'FALHOU: anon ainda alcanca:%', v_sobra;
  end if;
  raise notice '28 OK  anon nao tem privilegio em nenhuma tabela de public';
end $$;

-- ---------- `coupons` não foi concedida a ninguém ----------
do $$ begin
  if has_table_privilege('authenticated', 'public.coupons', 'select') then
    raise exception 'FALHOU: authenticated enxerga a tabela de cupons';
  end if;
  raise notice '29 OK  coupons sem grant: o resgate precisa nascer como RPC';
end $$;
