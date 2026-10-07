\set ON_ERROR_STOP on
begin;
set role authenticated;

select app_test.act_as('22222222-2222-4222-8222-222222222222');
insert into public.personal_flashcard_decks (id, student_id, subject, title)
values ('f1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Direito Constitucional', 'Meu deck');
insert into public.personal_flashcards (id, deck_id, student_id, topic, front, back)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Direitos fundamentais', 'Pergunta', 'Resposta');
insert into public.personal_flashcard_reviews
  (student_id, deck_id, card_id, due_at, interval_minutes, review_count, last_grade, state, step, stability, difficulty, lapses, last_reviewed_at)
values
  ('22222222-2222-4222-8222-222222222222', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', now(), 10, 1, 'good', 'learning', 1, 2.2, 5.1, 0, now());

do $$ begin
  if (select count(*) from public.personal_flashcard_decks) <> 1
     or (select count(*) from public.personal_flashcards) <> 1
     or (select count(*) from public.personal_flashcard_reviews) <> 1 then
    raise exception 'FALHOU: aluno nao enxerga o proprio deck completo';
  end if;
  raise notice '01 OK  aluno cria e le o proprio deck, cartao e revisao';
end $$;

select app_test.act_as('33333333-3333-4333-8333-333333333333');
do $$ begin
  if exists(select 1 from public.personal_flashcard_decks)
     or exists(select 1 from public.personal_flashcards)
     or exists(select 1 from public.personal_flashcard_reviews) then
    raise exception 'FALHOU: conteudo pessoal vazou para outro aluno';
  end if;
  raise notice '02 OK  conteudo pessoal de outro aluno fica invisivel';
end $$;

do $$ begin
  insert into public.personal_flashcards (id, deck_id, student_id, front, back)
  values ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'Tentativa', 'Bloqueada');
  raise exception 'FALHOU: aluno adicionou cartao no deck de outra pessoa';
exception when foreign_key_violation then
  raise notice '03 OK  FK composta impede cartao em deck alheio';
end $$;

delete from public.personal_flashcard_decks where id = 'f1000000-0000-4000-8000-000000000001';
select app_test.act_as('22222222-2222-4222-8222-222222222222');
do $$ begin
  if not exists(select 1 from public.personal_flashcard_decks where id = 'f1000000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU: outro aluno apagou deck invisivel';
  end if;
  raise notice '04 OK  outro aluno nao altera nem apaga o deck';
end $$;

-- Nome repetido (QA-16): o par disciplina + assunto é único por aluno, ignorando
-- maiúsculas e espaço nas pontas. Confere o NOME do índice, porque a PK também
-- é escolhida pelo cliente e um replay com o mesmo `id` dá `23505` em outro lugar.
do $$
declare v_indice text;
begin
  insert into public.personal_flashcard_decks (id, student_id, subject, title)
  values ('f1000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222',
          ' direito constitucional ', 'MEU DECK');
  raise exception 'FALHOU: o deck repetido (outra caixa, espacos) foi aceito';
exception when unique_violation then
  get stacked diagnostics v_indice = constraint_name;
  if v_indice <> 'personal_flashcard_decks_name_per_student_uidx' then
    raise exception 'FALHOU: o 23505 veio de % e nao do indice de nome', v_indice;
  end if;
  raise notice '06 OK  deck repetido, com outra caixa e espaco, e recusado pelo indice de nome';
end $$;

do $$
declare v_indice text;
begin
  insert into public.personal_flashcard_decks (id, student_id, subject, title)
  values ('f1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
          'Outra disciplina', 'Outro assunto');
  raise exception 'FALHOU: o replay com o mesmo id foi aceito';
exception when unique_violation then
  get stacked diagnostics v_indice = constraint_name;
  if v_indice <> 'personal_flashcard_decks_pkey' then
    raise exception 'FALHOU: o replay dava 23505 em % e nao na chave primaria', v_indice;
  end if;
  raise notice '07 OK  o replay com o mesmo id e da chave primaria, e nao do indice de nome';
end $$;

-- Acesso vencido: o que é dele continua visível; escrever, não.
reset role;
select app_test.act_as_owner();
update public.profiles set access_expires_at = now() - interval '1 day'
 where id = '22222222-2222-4222-8222-222222222222';
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');
do $$ begin
  if (select count(*) from public.personal_flashcard_decks) <> 1
     or (select count(*) from public.personal_flashcard_reviews) <> 1 then
    raise exception 'FALHOU: acesso vencido escondeu os decks do proprio aluno';
  end if;
  insert into public.personal_flashcard_decks (id, student_id, subject, title)
  values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', 'Novo', 'Deck novo');
  raise exception 'FALHOU: aluno com acesso vencido criou deck';
exception when insufficient_privilege then
  raise notice '05 OK  acesso vencido le os proprios decks e nao cria';
end $$;

reset role;
rollback;
