\set ON_ERROR_STOP on
-- =============================================================================
-- Grifo nos flashcards (spec 42)
-- =============================================================================
-- Uma tabela para os três tipos de cartão. O que esta suíte ataca é o que a
-- forma polimórfica deixaria passar: linha apontando para dois cartões, par
-- incompleto que a FK de MATCH SIMPLE pula, cartão pessoal de outro aluno, e
-- grifo em cartão que já saiu. Tudo aqui é desfeito no fim.
-- =============================================================================
begin;

-- O cenário: um cartão da biblioteca (da carga), um da aula de Ana, publicada,
-- e um pessoal de Bruno e outro de Carla. Os ids vão por `set_config` porque
-- variável do psql não entra em bloco `do`.
select set_config('t.lib_deck', deck_id, false), set_config('t.lib_card', id::text, false)
  from public.library_flashcards where retired_at is null order by deck_id, position limit 1;
select set_config('t.lib_retired', id::text, false), set_config('t.lib_retired_deck', deck_id, false)
  from public.library_flashcards where retired_at is null order by deck_id, position offset 1 limit 1;

set role authenticated;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
update public.theory_lessons set published = true where id = 'b2000000-0000-4000-8000-000000000001';
insert into public.theory_lesson_flashcards (id, theory_lesson_id, teacher_id, position, topic, front, back) values
  ('c5000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 1, 'Prazo', 'Qual o prazo do inquérito?', 'Dez dias, se preso.'),
  ('c5000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 2, 'Prazo', 'E se solto?', 'Trinta dias.');
update public.theory_lesson_flashcards set deleted = true where id = 'c5000000-0000-4000-8000-000000000002';

select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
insert into public.personal_flashcard_decks (id, student_id, subject, title)
values ('c5100000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'Penal', 'Deck da Carla');
insert into public.personal_flashcards (id, deck_id, student_id, front, back)
values ('c5200000-0000-4000-8000-000000000002', 'c5100000-0000-4000-8000-000000000002',
        '33333333-3333-4333-8333-333333333333', 'Pergunta da Carla', 'Resposta da Carla');

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
insert into public.personal_flashcard_decks (id, student_id, subject, title)
values ('c5100000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Penal', 'Meu deck');
insert into public.personal_flashcards (id, deck_id, student_id, front, back)
values ('c5200000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222', 'O que é crime?', 'Fato típico, ilícito e culpável.');

-- ---------- CA-01: o aluno grifa os três tipos, nos dois lados ----------
insert into public.flashcard_marks
  (id, student_id, card_kind, library_deck_id, library_card_id, side, start_offset, end_offset, quote, style, color)
select 'c5300000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'library',
       current_setting('t.lib_deck'), current_setting('t.lib_card')::uuid, 'back', 0, 1, left(back, 1), 'highlight', 'yellow'
  from public.library_flashcards where id = current_setting('t.lib_card')::uuid;
insert into public.flashcard_marks
  (id, student_id, card_kind, lesson_id, lesson_card_id, side, start_offset, end_offset, quote, prefix, suffix, style, color)
values ('c5300000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'lesson',
        'b2000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
        'back', 0, 9, 'Dez dias,', '', ' se preso.', 'underline', 'mint');
insert into public.flashcard_marks
  (id, student_id, card_kind, personal_deck_id, personal_card_id, side, start_offset, end_offset, quote, prefix, suffix, style, color)
values ('c5300000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'personal',
        'c5100000-0000-4000-8000-000000000001', 'c5200000-0000-4000-8000-000000000001',
        'front', 8, 13, 'crime', 'O que é ', '?', 'outline', 'blue');

do $$ begin
  if (select count(*) from public.flashcard_marks) <> 3 then
    raise exception 'FALHOU: o aluno nao le as tres marcacoes que criou';
  end if;
  update public.flashcard_marks set color = 'pink' where id = 'c5300000-0000-4000-8000-000000000002';
  if (select color from public.flashcard_marks where id = 'c5300000-0000-4000-8000-000000000002') <> 'pink' then
    raise exception 'FALHOU: o aluno nao altera a propria marcacao';
  end if;
  raise notice '01 OK  o aluno grifa cartao da biblioteca, de aula e pessoal, e altera';
end $$;

-- ---------- CA-02: cartão, lado e dono ficam fora do grant de UPDATE ----------
do $$ begin
  update public.flashcard_marks set student_id = '33333333-3333-4333-8333-333333333333'
   where id = 'c5300000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: o aluno trocou o dono da marcacao';
exception when insufficient_privilege then
  raise notice '02 OK  student_id fora do grant update';
end $$;

do $$ begin
  update public.flashcard_marks set side = 'back' where id = 'c5300000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: o aluno trocou o lado da marcacao';
exception when insufficient_privilege then
  raise notice '03 OK  side fora do grant update';
end $$;

do $$ begin
  update public.flashcard_marks set card_kind = 'lesson', lesson_id = 'b2000000-0000-4000-8000-000000000001',
         lesson_card_id = 'c5000000-0000-4000-8000-000000000001'
   where id = 'c5300000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: o aluno moveu a marcacao para outro cartao';
exception when insufficient_privilege then
  raise notice '04 OK  card_kind e as colunas de referencia fora do grant update';
end $$;

do $$ begin
  update public.flashcard_marks set personal_card_id = 'c5200000-0000-4000-8000-000000000002'
   where id = 'c5300000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: o aluno trocou o cartao pessoal da marcacao';
exception when insufficient_privilege then
  raise notice '05 OK  personal_card_id fora do grant update';
end $$;

-- ---------- CA-03: o que o banco recusa ----------
do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, personal_deck_id, personal_card_id, lesson_id, lesson_card_id,
     side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', 'personal',
          'c5100000-0000-4000-8000-000000000001', 'c5200000-0000-4000-8000-000000000001',
          'b2000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
          'front', 8, 13, 'crime', 'highlight', 'yellow');
  raise exception 'FALHOU: marcacao apontando para dois cartoes foi aceita';
exception when check_violation then
  raise notice '06 OK  referencia de outro tipo preenchida junto e recusada';
end $$;

do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, personal_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 'personal',
          'c5200000-0000-4000-8000-000000000001', 'front', 8, 13, 'crime', 'highlight', 'yellow');
  raise exception 'FALHOU: par incompleto foi aceito';
exception when check_violation then
  raise notice '07 OK  par incompleto e recusado';
end $$;

do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, personal_deck_id, personal_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', 'personal',
          'c5100000-0000-4000-8000-000000000002', 'c5200000-0000-4000-8000-000000000002',
          'front', 0, 8, 'Pergunta', 'highlight', 'yellow');
  raise exception 'FALHOU: o aluno grifou o cartao pessoal de outra aluna';
exception when foreign_key_violation then
  raise notice '08 OK  FK com student_id: cartao pessoal so do proprio aluno';
end $$;

do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, personal_deck_id, personal_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'personal',
          'c5100000-0000-4000-8000-000000000001', 'c5200000-0000-4000-8000-000000000001',
          'front', 8, 13, 'cri', 'highlight', 'yellow');
  raise exception 'FALHOU: quote de tamanho errado foi aceito';
exception when check_violation then
  raise notice '09 OK  quote precisa ter o tamanho do trecho';
end $$;

do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, personal_deck_id, personal_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000014', '33333333-3333-4333-8333-333333333333', 'personal',
          'c5100000-0000-4000-8000-000000000002', 'c5200000-0000-4000-8000-000000000002',
          'front', 0, 8, 'Pergunta', 'highlight', 'yellow');
  raise exception 'FALHOU: o aluno criou marcacao em nome de outra';
exception when insufficient_privilege then
  raise notice '10 OK  marcacao so nasce para quem escreve';
end $$;

do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, lesson_id, lesson_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000015', '22222222-2222-4222-8222-222222222222', 'lesson',
          'b2000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002',
          'back', 0, 7, 'Trinta ', 'highlight', 'yellow');
  raise exception 'FALHOU: grifo em cartao de aula apagado foi aceito';
exception when insufficient_privilege then
  raise notice '11 OK  cartao de aula apagado nao recebe grifo';
end $$;

reset role;
update public.library_flashcards set retired_at = now() where id = current_setting('t.lib_retired')::uuid;
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, library_deck_id, library_card_id, side, start_offset, end_offset, quote, style, color)
  select 'c5300000-0000-4000-8000-000000000016', '22222222-2222-4222-8222-222222222222', 'library',
         current_setting('t.lib_retired_deck'), current_setting('t.lib_retired')::uuid, 'front', 0, 1, left(front, 1), 'highlight', 'yellow'
    from (select 'x'::text as front) as fake;
  raise exception 'FALHOU: grifo em cartao retirado da biblioteca foi aceito';
exception when insufficient_privilege then
  raise notice '12 OK  cartao retirado da biblioteca nao recebe grifo';
end $$;

-- Aula despublicada: o cartão some para o aluno, e grifar também.
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
update public.theory_lessons set published = false where id = 'b2000000-0000-4000-8000-000000000001';
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, lesson_id, lesson_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000017', '22222222-2222-4222-8222-222222222222', 'lesson',
          'b2000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
          'front', 0, 4, 'Qual', 'highlight', 'yellow');
  raise exception 'FALHOU: grifo em aula nao publicada foi aceito';
exception when insufficient_privilege then
  raise notice '13 OK  aula nao publicada nao recebe grifo';
end $$;
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
update public.theory_lessons set published = true where id = 'b2000000-0000-4000-8000-000000000001';

-- ---------- CA-01: a colega e a professora não veem nada ----------
do $$
declare v_rows integer;
begin
  if (select count(*) from public.flashcard_marks) <> 0 then
    raise exception 'FALHOU: a professora le o grifo do aluno';
  end if;
  update public.flashcard_marks set color = 'lilac';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a professora alterou grifo do aluno'; end if;
  delete from public.flashcard_marks;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a professora apagou grifo do aluno'; end if;
  raise notice '14 OK  a professora le, altera e apaga zero grifos';
end $$;

select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla, colega
do $$
declare v_rows integer;
begin
  if (select count(*) from public.flashcard_marks) <> 0 then
    raise exception 'FALHOU: a colega le o grifo de Bruno';
  end if;
  update public.flashcard_marks set color = 'lilac';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a colega alterou grifo de Bruno'; end if;
  delete from public.flashcard_marks;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a colega apagou grifo de Bruno'; end if;
  raise notice '15 OK  a colega le, altera e apaga zero grifos';
end $$;

-- ---------- CA-04: acesso vencido lê e não escreve ----------
reset role;
insert into public.flashcard_marks
  (id, student_id, card_kind, library_deck_id, library_card_id, side, start_offset, end_offset, quote, style, color)
select 'c5300000-0000-4000-8000-000000000020', '66666666-6666-4666-8666-666666666666', 'library',
       current_setting('t.lib_deck'), current_setting('t.lib_card')::uuid, 'front', 0, 1, left(front, 1), 'strike', 'peach'
  from public.library_flashcards where id = current_setting('t.lib_card')::uuid;
set role authenticated;
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$
declare v_rows integer;
begin
  if (select count(*) from public.flashcard_marks) <> 1 then
    raise exception 'FALHOU: a aluna vencida perdeu a leitura dos proprios grifos';
  end if;
  delete from public.flashcard_marks where id = 'c5300000-0000-4000-8000-000000000020';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a aluna vencida apagou um grifo'; end if;
  raise notice '16 OK  vencida le os proprios grifos e apaga zero';
end $$;

do $$ begin
  update public.flashcard_marks set color = 'pink' where id = 'c5300000-0000-4000-8000-000000000020';
  raise exception 'FALHOU: a aluna vencida alterou um grifo';
exception when insufficient_privilege then
  raise notice '17 OK  vencida nao altera';
end $$;

do $$ begin
  insert into public.flashcard_marks
    (id, student_id, card_kind, library_deck_id, library_card_id, side, start_offset, end_offset, quote, style, color)
  values ('c5300000-0000-4000-8000-000000000021', '66666666-6666-4666-8666-666666666666', 'library',
          current_setting('t.lib_deck'), current_setting('t.lib_card')::uuid, 'front', 0, 1, 'x', 'strike', 'peach');
  raise exception 'FALHOU: a aluna vencida criou um grifo';
exception when insufficient_privilege then
  raise notice '18 OK  vencida nao cria';
end $$;

-- ---------- CA-05: o que acontece quando o cartão sai ----------
reset role;
-- O grifo do cartão retirado continua (R-GRIFO-14): o que entrou antes da
-- retirada não é apagado por ela.
update public.library_flashcards set retired_at = now() where id = current_setting('t.lib_card')::uuid;
update public.theory_lesson_flashcards set deleted = true where id = 'c5000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.flashcard_marks
       where id in ('c5300000-0000-4000-8000-000000000001', 'c5300000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'FALHOU: retirar ou apagar por marca levou o grifo';
  end if;
  raise notice '19 OK  cartao retirado e cartao apagado por marca mantem os grifos';
end $$;

do $$
declare v_constraint text;
begin
  delete from public.theory_lessons where id = 'b2000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: a aula com grifo foi apagada';
exception when foreign_key_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint <> 'flashcard_marks_lesson_card_fk' then
    raise exception 'FALHOU: a aula foi barrada por %, e nao pelo grifo', v_constraint;
  end if;
  raise notice '20 OK  aula com grifo nao se apaga';
end $$;

set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_rows integer;
begin
  delete from public.personal_flashcards where id = 'c5200000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU: o aluno nao apagou o proprio cartao'; end if;
  if exists (select 1 from public.flashcard_marks where id = 'c5300000-0000-4000-8000-000000000003') then
    raise exception 'FALHOU: o grifo sobreviveu ao cartao pessoal';
  end if;
  raise notice '21 OK  apagar o cartao pessoal leva os grifos';
end $$;

do $$
declare v_rows integer;
begin
  delete from public.flashcard_marks where id = 'c5300000-0000-4000-8000-000000000002';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU: o aluno nao apaga o proprio grifo'; end if;
  raise notice '22 OK  o aluno apaga o proprio grifo';
end $$;

reset role;
rollback;
