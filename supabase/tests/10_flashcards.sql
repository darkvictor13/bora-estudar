\set ON_ERROR_STOP on
begin;
set role authenticated;

select app_test.act_as('11111111-1111-4111-8111-111111111111');
update public.theory_lessons
   set published = true,
       flashcard_cards = '[{"id":"88888888-8888-4888-8888-000000000001","topic":"Teste","front":"Pergunta","back":"Resposta"}]'::jsonb
 where id = 'b2000000-0000-4000-8000-000000000001';

select app_test.act_as('22222222-2222-4222-8222-222222222222');
insert into public.flashcard_reviews
  (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
values
  ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001',
   '88888888-8888-4888-8888-000000000001', now() + interval '10 minutes', 10, 1, 'good');

do $$ begin
  if (select count(*) from public.flashcard_reviews) <> 1 then
    raise exception 'FALHOU: aluno nao le a propria revisao';
  end if;
  raise notice '01 OK  aluno le a propria revisao';
end $$;

do $$ begin
  insert into public.flashcard_reviews
    (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001',
     '88888888-8888-4888-8888-000000000002', now(), 1, 1, 'again');
  raise exception 'FALHOU: aluno avaliou cartao inexistente';
exception when insufficient_privilege then
  raise notice '02 OK  aluno so avalia cartao da aula';
end $$;

do $$ begin
  insert into public.flashcard_reviews
    (student_id, theory_lesson_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('11111111-1111-4111-8111-111111111111', 'b2000000-0000-4000-8000-000000000001',
     '88888888-8888-4888-8888-000000000001', now(), 1, 1, 'again');
  raise exception 'FALHOU: aluno escreveu revisao de outra pessoa';
exception when insufficient_privilege then
  raise notice '03 OK  aluno so grava a propria revisao';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');
update public.theory_lessons set published = false
 where id = 'b2000000-0000-4000-8000-000000000001';
select app_test.act_as('22222222-2222-4222-8222-222222222222');
do $$ begin
  if exists(select 1 from public.flashcard_reviews) then
    raise exception 'FALHOU: aluno le revisao de aula nao publicada';
  end if;
  raise notice '04 OK  revisoes de aula recolhida ficam invisiveis';
end $$;

reset role;
set role anon;
do $$ begin
  perform 1 from public.flashcard_reviews;
  raise exception 'FALHOU: anonimo le revisoes';
exception when insufficient_privilege then
  raise notice '05 OK  anonimo sem acesso';
end $$;
reset role;
rollback;
