\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Teoria: o catálogo é do professor, o progresso é do aluno
-- =============================================================================
-- Cinco tabelas de catálogo e duas de execução, todas amarradas por FK
-- COMPOSTA. As compostas não são preciosismo: cada uma aqui substitui uma FK de
-- coluna única que deixava escrever dentro do contexto de outra pessoa —
-- inclusive o caso em que a vítima batia em `duplicate key` sem enxergar a
-- linha que estava no caminho, porque a policy de SELECT a escondia.
-- =============================================================================

set role authenticated;

-- ---------- Progresso dentro do planejamento de outro aluno ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  insert into public.theory_progress (student_id, study_plan_id, theory_lesson_id, current_page)
  values ('22222222-2222-4222-8222-222222222222','a2000000-0000-4000-8000-000000000002',
          'b2000000-0000-4000-8000-000000000001', 3);
  raise exception 'FALHOU: Bruno gravou progresso dentro do planejamento da Carla';
exception when foreign_key_violation then
  raise notice '01 OK  theory_progress_study_plan_fk amarra o progresso ao par (plano, aluno)';
end $$;

do $$ begin
  insert into public.theory_reviews (student_id, study_plan_id, theory_lesson_id, review_number)
  values ('22222222-2222-4222-8222-222222222222','a2000000-0000-4000-8000-000000000002',
          'b2000000-0000-4000-8000-000000000001', 2);
  raise exception 'FALHOU: Bruno criou revisao dentro do planejamento da Carla';
exception when foreign_key_violation then
  raise notice '02 OK  theory_reviews_study_plan_fk faz o mesmo pela revisao';
end $$;

-- ---------- Acesso vencido: fecha a escrita, preserva o passado ----------
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$
declare v_pagina integer;
begin
  select current_page into v_pagina from public.theory_progress
   where id = 'b3000000-0000-4000-8000-000000000002';
  if v_pagina <> 7 then
    raise exception 'FALHOU: Fabi perdeu o proprio progresso (pagina %)', coalesce(v_pagina, -1);
  end if;
  raise notice '03 OK  quem venceu continua LENDO o proprio progresso';
end $$;

do $$ begin
  update public.theory_progress set current_page = 30
   where id = 'b3000000-0000-4000-8000-000000000002';
  raise exception 'FALHOU: aluna com acesso vencido avancou a pagina';
exception when insufficient_privilege then
  raise notice '04 OK  o vencimento fecha a escrita no WITH CHECK (42501, nao silencio)';
end $$;

do $$
declare v_afetadas integer;
begin
  -- O USING não olha o acesso, só o dono: apagar o que já era dela continua
  -- valendo. É a diferença entre "venceu" e "sumiu".
  delete from public.theory_progress where id = 'b3000000-0000-4000-8000-000000000002';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 1 then
    raise exception 'FALHOU: Fabi nao conseguiu apagar o proprio progresso';
  end if;
  raise notice '05 OK  e continua apagando o que ja era dela';
end $$;

-- ---------- Regra dentro do catálogo de outro professor ----------
select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$ begin
  insert into public.theory_catalog_subject_rules (catalog_id, teacher_id, subject, subject_key)
  values ('b1000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444',
          'Ciências Forenses','forenses');
  raise exception 'FALHOU: Davi criou regra dentro do catalogo da Ana';
exception when foreign_key_violation then
  raise notice '06 OK  a FK composta amarra a regra ao catalogo DO PROPRIO professor';
end $$;

do $$ begin
  insert into public.theory_review_rules (catalog_id, teacher_id, subject, subject_key, review_number, lesson_spacing)
  values ('b1000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444',
          'Ciências Forenses','forenses',1,3);
  raise exception 'FALHOU: Davi criou regra de revisao no catalogo da Ana';
exception when foreign_key_violation then
  raise notice '07 OK  o mesmo vale para a regra de revisao';
end $$;

do $$
declare v_total integer;
begin
  select count(*) into v_total from public.theory_lessons;
  if v_total <> 0 then
    raise exception 'FALHOU: Davi enxergou % aulas da Ana', v_total;
  end if;
  raise notice '08 OK  a aula de teoria e do professor que a cadastrou';
end $$;

-- ---------- Catálogo de outro professor amarrado ao próprio planejamento ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$ begin
  insert into public.study_plan_theory_catalogs (study_plan_id, catalog_id, teacher_id, student_id)
  values ('a2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002',
          '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
  raise exception 'FALHOU: Ana ligou o catalogo do Davi ao planejamento da Carla';
exception when foreign_key_violation then
  raise notice '09 OK  o planejamento so recebe catalogo do proprio professor';
end $$;

-- ---------- O professor lê o progresso do próprio aluno ----------
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.theory_progress
   where student_id = '22222222-2222-4222-8222-222222222222';
  if v_total <> 1 then
    raise exception 'FALHOU: Ana enxergou % progressos do Bruno, esperava 1', v_total;
  end if;
  raise notice '10 OK  o professor le o progresso de quem ele acompanha';
end $$;

-- ---------- E o aluno lê o catálogo do professor dele ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.theory_lessons;
  if v_total <> 1 then
    raise exception 'FALHOU: Bruno enxergou % aulas, esperava 1', v_total;
  end if;
  raise notice '11 OK  can_access_teacher() da ao aluno o catalogo do professor dele';
end $$;

do $$
declare v_afetadas integer;
begin
  -- Aqui a recusa é SILENCIOSA, e tem de ser conferida por contagem: o grant
  -- de `theory_lessons` é de tabela inteira, então quem barra é o USING da
  -- policy de escrita — e USING falso filtra a linha em vez de levantar.
  update public.theory_lessons set title = 'Aula renomeada pelo aluno'
   where id = 'b2000000-0000-4000-8000-000000000001';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: o aluno reescreveu % aula(s) do professor', v_afetadas;
  end if;
  raise notice '12 OK  o aluno le o catalogo, e nao escreve nele (0 linhas)';
end $$;
