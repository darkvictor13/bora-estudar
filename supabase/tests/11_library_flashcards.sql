\set ON_ERROR_STOP on
begin;
set role authenticated;

select app_test.act_as('22222222-2222-4222-8222-222222222222');
insert into public.library_flashcard_reviews
  (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade)
values
  ('22222222-2222-4222-8222-222222222222', 'pf2029-informatica-01',
   '95e686a3-6c71-4ad9-927f-8036025d3f7d', now() + interval '10 minutes', 10, 1, 'good');

do $$ begin
  if (select count(*) from public.library_flashcard_reviews) <> 1 then
    raise exception 'FALHOU: aluno nao le a propria revisao editorial';
  end if;
  raise notice '01 OK  aluno le a propria revisao editorial';
end $$;

update public.library_flashcard_reviews
   set state = 'learning', step = 1, stability = 2.3, difficulty = 5.8,
       lapses = 0, last_reviewed_at = now()
 where student_id = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if not exists (select 1 from public.library_flashcard_reviews
                  where state = 'learning' and step = 1 and stability = 2.3 and difficulty = 5.8) then
    raise exception 'FALHOU: estado da repeticao espacada nao foi salvo';
  end if;
  raise notice '01b OK estado da repeticao espacada persiste';
end $$;

do $$ begin
  insert into public.library_flashcard_reviews
    (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade)
  values
    ('11111111-1111-4111-8111-111111111111', 'pf2029-informatica-01',
     '95e686a3-6c71-4ad9-927f-8036025d3f7d', now(), 1, 1, 'again');
  raise exception 'FALHOU: aluno escreveu revisao de outra pessoa';
exception when insufficient_privilege then
  raise notice '02 OK  aluno so grava a propria revisao';
end $$;

select app_test.act_as('33333333-3333-4333-8333-333333333333');
do $$ begin
  if exists(select 1 from public.library_flashcard_reviews) then
    raise exception 'FALHOU: aluno le revisao de outra pessoa';
  end if;
  raise notice '03 OK  revisao de outro aluno fica invisivel';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');
insert into public.library_flashcard_reviews
  (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade, state, step)
values
  ('22222222-2222-4222-8222-222222222222', 'pf2029-portugues-morfologia',
   '88888888-8888-4888-8888-000000000001', now() + interval '10 minutes', 10, 1, 'good', 'learning', 1);
do $$ begin
  if not exists (select 1 from public.library_flashcard_reviews where deck_id = 'pf2029-portugues-morfologia') then
    raise exception 'FALHOU: revisao de nova materia nao foi salva';
  end if;
  raise notice '03b OK nova materia aceita revisao';
end $$;

reset role;
set role anon;
do $$ begin
  perform 1 from public.library_flashcard_reviews;
  raise exception 'FALHOU: anonimo le revisoes';
exception when insufficient_privilege then
  raise notice '04 OK  anonimo sem acesso';
end $$;
reset role;
rollback;
