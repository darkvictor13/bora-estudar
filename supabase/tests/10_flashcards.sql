\set ON_ERROR_STOP on
-- =============================================================================
-- Cartões de aula: do professor, revisados pelo aluno, e o histórico não some
-- =============================================================================
-- O cartão é linha, não elemento de um `jsonb`: o banco garante id único, a
-- revisão aponta para ele por FK, e remover é marca. O que esta suíte ataca é
-- justamente o que o array deixava passar — id repetido, histórico órfão
-- quando o array era regravado, e histórico apagado junto com a aula.
-- =============================================================================
begin;
set role authenticated;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
update public.theory_lessons set published = true
 where id = 'b2000000-0000-4000-8000-000000000001';
insert into public.theory_lesson_flashcards (id, theory_lesson_id, teacher_id, position, topic, front, back) values
  ('88888888-8888-4888-8888-000000000001', 'b2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 1, 'Teste', 'Pergunta', 'Resposta'),
  ('88888888-8888-4888-8888-000000000003', 'b2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 2, 'Teste', 'Outra', 'Outra resposta');

do $$ begin
  insert into public.theory_lesson_flashcards (id, theory_lesson_id, teacher_id, position, front, back) values
    ('88888888-8888-4888-8888-000000000001', 'b2000000-0000-4000-8000-000000000001',
     '11111111-1111-4111-8111-111111111111', 3, 'Repetido', 'Repetido');
  raise exception 'FALHOU: aceitou dois cartoes com o mesmo id';
exception when unique_violation then
  raise notice '01 OK  cartao tem id unico';
end $$;

select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$ begin
  insert into public.theory_lesson_flashcards (id, theory_lesson_id, teacher_id, position, front, back) values
    ('88888888-8888-4888-8888-000000000009', 'b2000000-0000-4000-8000-000000000001',
     '44444444-4444-4444-8444-444444444444', 1, 'Intruso', 'Intruso');
  raise exception 'FALHOU: Davi pendurou cartao na aula da Ana';
exception when foreign_key_violation then
  raise notice '02 OK  FK composta: cartao so entra na aula do proprio professor';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
insert into public.flashcard_reviews
  (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
values
  ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001',
   '88888888-8888-4888-8888-000000000001', now() + interval '10 minutes', 10, 1, 'good');

do $$ begin
  if (select count(*) from public.flashcard_reviews) <> 1 then
    raise exception 'FALHOU: aluno nao le a propria revisao';
  end if;
  if (select count(*) from public.theory_lesson_flashcards) <> 2 then
    raise exception 'FALHOU: aluno nao le os cartoes da aula publicada';
  end if;
  raise notice '03 OK  aluno le os cartoes e a propria revisao';
end $$;

do $$ begin
  insert into public.flashcard_reviews
    (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001',
     '88888888-8888-4888-8888-000000000002', now(), 1, 1, 'again');
  raise exception 'FALHOU: aluno avaliou cartao inexistente';
exception when insufficient_privilege then
  raise notice '04 OK  aluno so avalia cartao da aula';
end $$;

do $$ begin
  insert into public.flashcard_reviews
    (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('11111111-1111-4111-8111-111111111111', 'b2000000-0000-4000-8000-000000000001',
     '88888888-8888-4888-8888-000000000001', now(), 1, 1, 'again');
  raise exception 'FALHOU: aluno escreveu revisao de outra pessoa';
exception when insufficient_privilege then
  raise notice '05 OK  aluno so grava a propria revisao';
end $$;

do $$ declare v_afetadas integer; begin
  update public.theory_lesson_flashcards set front = 'Pichado';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then raise exception 'FALHOU: aluno editou cartao do professor'; end if;
  raise notice '06 OK  aluno nao edita cartao (0 linhas)';
end $$;

-- ---------- O professor remove o cartão: marca, e o histórico fica ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$ begin
  delete from public.theory_lesson_flashcards where id = '88888888-8888-4888-8888-000000000001';
  raise exception 'FALHOU: professor apagou cartao de verdade';
exception when insufficient_privilege then
  raise notice '07 OK  cartao nao se apaga: remover e marcar';
end $$;
update public.theory_lesson_flashcards set deleted = true
 where id = '88888888-8888-4888-8888-000000000001';

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  if exists (select 1 from public.theory_lesson_flashcards where id = '88888888-8888-4888-8888-000000000001') then
    raise exception 'FALHOU: aluno ainda ve o cartao removido';
  end if;
  if (select count(*) from public.flashcard_reviews) <> 1 then
    raise exception 'FALHOU: remover o cartao levou o historico do aluno';
  end if;
  raise notice '08 OK  cartao removido some da tela, e a revisao continua';
end $$;

do $$ declare v_afetadas integer; begin
  update public.flashcard_reviews set review_count = 2
   where card_id = '88888888-8888-4888-8888-000000000001';
  raise exception 'FALHOU: aluno revisou cartao removido';
exception when insufficient_privilege then
  raise notice '09 OK  cartao removido nao recebe revisao nova';
end $$;

-- ---------- Apagar a aula não leva o histórico junto ----------
reset role;
select app_test.act_as_owner();
do $$ begin
  delete from public.theory_lessons where id = 'b2000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: apagou a aula e o historico de revisao do aluno';
exception when foreign_key_violation then
  raise notice '10 OK  aula com historico de revisao nao se apaga';
end $$;
set role authenticated;

-- ---------- Aula recolhida: lê o histórico, não escreve ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
update public.theory_lessons set published = false
 where id = 'b2000000-0000-4000-8000-000000000001';
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  if exists (select 1 from public.theory_lesson_flashcards) then
    raise exception 'FALHOU: aluno le cartao de aula nao publicada';
  end if;
  if (select count(*) from public.flashcard_reviews) <> 1 then
    raise exception 'FALHOU: recolher a aula escondeu o historico do aluno';
  end if;
  insert into public.flashcard_reviews
    (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001',
     '88888888-8888-4888-8888-000000000003', now(), 1, 1, 'good');
  raise exception 'FALHOU: aluno revisou cartao de aula recolhida';
exception when insufficient_privilege then
  raise notice '11 OK  aula recolhida: historico visivel, revisao nova recusada';
end $$;

-- ---------- Acesso vencido: lê, não escreve ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
update public.theory_lessons set published = true
 where id = 'b2000000-0000-4000-8000-000000000001';
reset role;
select app_test.act_as_owner();
update public.profiles set access_expires_at = now() - interval '1 day'
 where id = '22222222-2222-4222-8222-222222222222';
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  if (select count(*) from public.flashcard_reviews) <> 1 then
    raise exception 'FALHOU: acesso vencido escondeu o historico';
  end if;
  insert into public.flashcard_reviews
    (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001',
     '88888888-8888-4888-8888-000000000003', now(), 1, 1, 'good');
  raise exception 'FALHOU: aluno com acesso vencido gravou revisao';
exception when insufficient_privilege then
  raise notice '12 OK  acesso vencido le o historico e nao grava';
end $$;

reset role;
set role anon;
do $$ begin
  perform 1 from public.flashcard_reviews;
  raise exception 'FALHOU: anonimo le revisoes';
exception when insufficient_privilege then
  raise notice '13 OK  anonimo sem acesso';
end $$;
reset role;
rollback;
