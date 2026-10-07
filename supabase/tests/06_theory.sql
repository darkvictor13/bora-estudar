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
exception when insufficient_privilege then
  -- Desde o 5c `authenticated` não tem INSERT em `theory_reviews`: a revisão nasce em
  -- `record_initial_questions`, e o privilégio é conferido antes da FK. A FK composta
  -- `theory_reviews_study_plan_fk` continua na lista de compostas de `07_schema.sql`.
  raise notice '02 OK  theory_reviews nao aceita INSERT do aluno, nem no planejamento de outro';
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

-- ---------- Catálogo compartilhado pela turma ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_afetadas integer;
begin
  update public.classes
     set theory_catalog_id = 'b1000000-0000-4000-8000-000000000001'
   where id = 'a9000000-0000-4000-8000-000000000001';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 1 then
    raise exception 'FALHOU: Ana nao vinculou o proprio catalogo a turma';
  end if;
  raise notice '13 OK  professora vincula o proprio catalogo a propria turma';
end $$;

do $$ begin
  update public.classes
     set theory_catalog_id = 'b1000000-0000-4000-8000-000000000002'
   where id = 'a9000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: Ana vinculou catalogo de outro professor a turma';
exception when foreign_key_violation then
  raise notice '14 OK  FK composta recusa catalogo de outro professor';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_catalogo uuid;
declare v_afetadas integer;
begin
  select theory_catalog_id into v_catalogo from public.classes
   where id = 'a9000000-0000-4000-8000-000000000001';
  if v_catalogo is distinct from 'b1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'FALHOU: aluno nao le o catalogo da sua turma';
  end if;
  update public.classes set theory_catalog_id = null
   where id = 'a9000000-0000-4000-8000-000000000001';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: aluno alterou o catalogo da turma';
  end if;
  raise notice '15 OK  aluno le o vinculo da turma e nao pode altera-lo';
end $$;

-- =============================================================================
-- As questões da teoria à prova de retentativa (QA-04, PR 5b)
-- =============================================================================
-- Bruno, plano a2…01, meta a5…02, aula b2…01. Não há regra de disciplina, então o
-- mínimo é 15. As chaves de retentativa usam o prefixo c5…

-- ---------- 16: a primeira entrada ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_row record; v_registros integer; v_aula uuid;
begin
  select * into v_row from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000001'::uuid, 'a5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000001', 10, 8);
  if v_row.initial_questions_done <> 10 or v_row.initial_questions_required <> 15
     or v_row.lesson_done then
    raise exception 'FALHOU: 10 questoes deram done=%, required=%, lesson_done=%',
      v_row.initial_questions_done, v_row.initial_questions_required, v_row.lesson_done;
  end if;
  select count(*), max(theory_lesson_id::text)::uuid into v_registros, v_aula
    from public.goal_entries where request_id = 'c5000000-0000-4000-8000-000000000001';
  if v_registros <> 1 or v_aula is distinct from 'b2000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'FALHOU: o registro nao entrou no ledger com a aula (% linha(s), aula %)',
      v_registros, v_aula;
  end if;
  raise notice '16 OK  record_initial_questions soma, exige 15 sem regra e grava a aula no ledger';
end $$;

-- ---------- 17: o replay ----------
do $$
declare v_row record; v_registros integer; v_soma integer;
begin
  select * into v_row from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000001'::uuid, 'a5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000001', 10, 8);
  select count(*) into v_registros from public.goal_entries
   where request_id = 'c5000000-0000-4000-8000-000000000001';
  select initial_questions_done into v_soma from public.theory_progress
   where id = 'b3000000-0000-4000-8000-000000000001';
  if v_row.initial_questions_done <> 10 or v_registros <> 1 or v_soma <> 10 then
    raise exception 'FALHOU: o replay somou de novo (done=%, % registro(s), coluna %)',
      v_row.initial_questions_done, v_registros, v_soma;
  end if;
  raise notice '17 OK  o replay devolve o estado sem somar e sem gravar de novo';
end $$;

-- ---------- 18: a mesma chave com outro payload ----------
do $$ begin
  perform * from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000001'::uuid, 'a5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000001', 9, 8);
  raise exception 'FALHOU: a mesma chave com outro payload foi aceita';
exception when unique_violation then
  raise notice '18 OK  a mesma chave com outro payload e recusada (23505)';
end $$;

-- ---------- 19: o mínimo fecha a aula e cria as revisões ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
insert into public.theory_review_rules
  (catalog_id, teacher_id, subject, subject_key, review_number, lesson_spacing, minimum_questions)
values
  ('b1000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Ciências Forenses','forenses',1,1,15),
  ('b1000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Ciências Forenses','forenses',2,2,15);

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_row record; v_revisoes integer; v_antiga integer;
begin
  select * into v_row from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000002'::uuid, 'a5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000001', 5, 5);
  if v_row.initial_questions_done <> 15 or not v_row.lesson_done then
    raise exception 'FALHOU: 10 + 5 deram done=%, lesson_done=%',
      v_row.initial_questions_done, v_row.lesson_done;
  end if;
  select count(*) into v_revisoes from public.theory_reviews
   where student_id = '22222222-2222-4222-8222-222222222222'
     and study_plan_id = 'a2000000-0000-4000-8000-000000000001'
     and theory_lesson_id = 'b2000000-0000-4000-8000-000000000001';
  select questions_answered into v_antiga from public.theory_reviews
   where id = 'b4000000-0000-4000-8000-000000000001';
  if v_revisoes <> 2 or v_antiga <> 0 then
    raise exception 'FALHOU: esperava a revisao da fixture intacta e a 2 nova (% revisao(oes), antiga com %)',
      v_revisoes, v_antiga;
  end if;
  raise notice '19 OK  atingir o minimo fecha a aula e cria as revisoes na mesma transacao (a da fixture fica)';
end $$;

-- ---------- 20: acesso vencido ----------
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  perform * from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000003'::uuid, 'a5000000-0000-4000-8000-000000000005',
    'b2000000-0000-4000-8000-000000000001', 5, 5);
  raise exception 'FALHOU: aluna com acesso vencido registrou questoes iniciais';
exception when insufficient_privilege then
  raise notice '20 OK  acesso vencido recebe 42501 em record_initial_questions';
end $$;

-- ---------- 21: meta alheia, e a chave de outro ----------
select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
do $$ begin
  perform * from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000004'::uuid, 'a5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000001', 5, 5);
  raise exception 'FALHOU: Carla registrou questoes na meta do Bruno';
exception when no_data_found then
  raise notice '21a OK meta alheia e inexistente dao o mesmo erro (P0002)';
end $$;

do $$ begin
  perform * from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000001'::uuid, 'a5000000-0000-4000-8000-000000000004',
    'b2000000-0000-4000-8000-000000000001', 10, 8);
  raise exception 'FALHOU: Carla recebeu o replay da chave do Bruno';
exception when unique_violation then
  raise notice '21b OK a chave de outro aluno e recusada sem devolver o estado dele';
end $$;

-- ---------- 22: aula em rascunho ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
insert into public.theory_lessons (
  id, teacher_id, catalog_id, subject, subject_key, lesson_code, position, title,
  pdf_file, theory_start_page, theory_end_page, pdf_total_pages, published
) values
  ('b2000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'b1000000-0000-4000-8000-000000000001','Ciências Forenses','forenses','FOR-02',2,
   'Aula 2 — Rascunho','forenses-02.pdf',1,40,120,false);

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  perform * from public.record_initial_questions(
    'c5000000-0000-4000-8000-000000000005'::uuid, 'a5000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002', 5, 5);
  raise exception 'FALHOU: Bruno registrou questoes numa aula em rascunho';
exception when no_data_found then
  raise notice '22 OK  aula nao publicada nao recebe registro (P0002)';
end $$;

-- ---------- 23: a faixa ----------
do $$
declare v_caso record;
begin
  for v_caso in
    select * from (values
      ('zero questoes', 0, 0), ('501 questoes', 501, 0), ('acertos acima do total', 5, 6)
    ) as t(descricao, questoes, acertos)
  loop
    begin
      perform * from public.record_initial_questions(
        gen_random_uuid(), 'a5000000-0000-4000-8000-000000000002',
        'b2000000-0000-4000-8000-000000000001', v_caso.questoes, v_caso.acertos);
      raise exception 'FALHOU: record_initial_questions aceitou %', v_caso.descricao;
    exception when check_violation then null;
    end;
  end loop;
  raise notice '23 OK  record_initial_questions recusa a faixa fora de 1 a 500 e acerto acima do total (23514)';
end $$;

-- ---------- 24: a revisão, em sequência ----------
do $$
declare v_row record; v_registros integer; v_aceitou boolean := false;
begin
  select * into v_row from public.record_review_questions(
    'c5000000-0000-4000-8000-000000000011'::uuid, 'b4000000-0000-4000-8000-000000000001', 10, 8);
  if v_row.questions_answered <> 10 or v_row.status <> 'in_progress' then
    raise exception 'FALHOU: 10 questoes de revisao deram % e %', v_row.questions_answered, v_row.status;
  end if;

  select * into v_row from public.record_review_questions(
    'c5000000-0000-4000-8000-000000000011'::uuid, 'b4000000-0000-4000-8000-000000000001', 10, 8);
  if v_row.questions_answered <> 10 then
    raise exception 'FALHOU: o replay da revisao somou de novo (%)', v_row.questions_answered;
  end if;

  begin
    perform * from public.record_review_questions(
      'c5000000-0000-4000-8000-000000000011'::uuid, 'b4000000-0000-4000-8000-000000000001', 9, 8);
    raise exception 'FALHOU: a mesma chave de revisao com outro payload foi aceita';
  exception when unique_violation then null;
  end;

  select * into v_row from public.record_review_questions(
    'c5000000-0000-4000-8000-000000000012'::uuid, 'b4000000-0000-4000-8000-000000000001', 5, 5);
  if v_row.questions_answered <> 15 or v_row.status <> 'completed' then
    raise exception 'FALHOU: 10 + 5 deram % e %', v_row.questions_answered, v_row.status;
  end if;

  -- O `raise exception` de FALHOU tem o mesmo SQLSTATE (P0001) que a recusa
  -- esperada: sem a bandeira, o próprio handler o engoliria.
  begin
    perform * from public.record_review_questions(
      'c5000000-0000-4000-8000-000000000013'::uuid, 'b4000000-0000-4000-8000-000000000001', 1, 1);
    v_aceitou := true;
  exception when raise_exception then
    if sqlerrm not like '%conclu%' then
      raise exception 'FALHOU: a recusa da revisao concluida veio com outra mensagem: %', sqlerrm;
    end if;
  end;
  if v_aceitou then
    raise exception 'FALHOU: revisao concluida aceitou novo registro';
  end if;

  -- O replay do envio que FECHOU a revisão devolve a revisão, e não o conflito.
  select * into v_row from public.record_review_questions(
    'c5000000-0000-4000-8000-000000000012'::uuid, 'b4000000-0000-4000-8000-000000000001', 5, 5);
  if v_row.questions_answered <> 15 or v_row.status <> 'completed' then
    raise exception 'FALHOU: o replay do envio que concluiu devolveu % e %',
      v_row.questions_answered, v_row.status;
  end if;

  select count(*) into v_registros from public.theory_review_entries
   where theory_review_id = 'b4000000-0000-4000-8000-000000000001';
  if v_registros <> 2 then
    raise exception 'FALHOU: o ledger da revisao tem % linha(s), esperava 2', v_registros;
  end if;
  raise notice '24 OK  revisao: soma, replay, payload diferente, fechamento, ja concluida e replay do fechamento';
end $$;

-- ---------- 25: revisão com acesso vencido ----------
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  perform * from public.record_review_questions(
    'c5000000-0000-4000-8000-000000000021'::uuid, 'b4000000-0000-4000-8000-000000000002', 5, 5);
  raise exception 'FALHOU: aluna com acesso vencido registrou questoes de revisao';
exception when insufficient_privilege then
  raise notice '25 OK  acesso vencido recebe 42501 em record_review_questions';
end $$;

-- ---------- 26: o ledger da revisão não aceita escrita direta ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_lidas integer;
begin
  begin
    insert into public.theory_review_entries
      (theory_review_id, student_id, questions, correct_answers, request_id)
    values ('b4000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
            5, 5, gen_random_uuid());
    raise exception 'FALHOU: Bruno inseriu direto em theory_review_entries';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_lidas from public.theory_review_entries;
  if v_lidas <> 2 then
    raise exception 'FALHOU: Bruno le % linha(s) do ledger da revisao, esperava 2', v_lidas;
  end if;
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_lidas integer;
begin
  select count(*) into v_lidas from public.theory_review_entries;
  if v_lidas <> 2 then
    raise exception 'FALHOU: a professora le % linha(s) do ledger da revisao, esperava 2', v_lidas;
  end if;
end $$;

select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
do $$
declare v_lidas integer;
begin
  select count(*) into v_lidas from public.theory_review_entries;
  if v_lidas <> 0 then
    raise exception 'FALHOU: Carla le % linha(s) do ledger da revisao do Bruno', v_lidas;
  end if;
  raise notice '26 OK  theory_review_entries: sem INSERT direto; Bruno e Ana leem, Carla nao ve nada';
end $$;
