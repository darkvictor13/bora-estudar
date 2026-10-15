\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Excluir a própria conta (spec 46)
-- =============================================================================
-- A exclusão tem DUAS metades que precisam ser provadas juntas: o que SAI (tudo
-- o que o aluno fez, mais o login) e o que FICA (as liberações de acesso e as
-- notas de simulado, sem identificar ninguém). Provar só a primeira aprova uma
-- função que apaga o histórico; provar só a segunda, uma que não apaga nada.
--
-- Roda depois de TODAS as suítes que usam o Bruno e a Fabi, de propósito: apaga os
-- dois do cenário, e as suítes compartilham estado ("o que uma apagar, a seguinte
-- não encontra"). As que vêm depois (23 em diante) criam as próprias contas.
--
-- O aluno excluído é o Bruno. Antes da chamada o teste SEMEIA o que o cenário
-- não traz (lista de espera, baralho pessoal, grifo, anotação, nota de
-- simulado…), porque um teste que confere "zero linhas" numa tabela que já
-- estava vazia passa sempre. Mais abaixo, um piso mínimo de tabelas com dado
-- falha a suíte se o semeio regredir.
-- =============================================================================

-- ---------- Semeio, como manutenção (sem JWT) ----------
select app_test.act_as_owner();

update public.profiles set theme_preference = 'dark'
 where id = '22222222-2222-4222-8222-222222222222';

insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
select p.id, p.teacher_id, p.name, u.email, '(11) 90000-0000', 'Policial', 'PF'
  from public.profiles p join auth.users u on u.id = p.id
 where p.id = '22222222-2222-4222-8222-222222222222'
on conflict (student_id) do nothing;

insert into public.personal_flashcard_decks (id, student_id, subject, title)
values ('d1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        'Informática', 'Baralho da exclusão')
on conflict (id) do nothing;
insert into public.personal_flashcards (id, deck_id, student_id, front, back)
values ('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222', 'Frente', 'Verso')
on conflict (id) do nothing;
insert into public.flashcard_marks
  (id, student_id, card_kind, personal_deck_id, personal_card_id, side, start_offset, end_offset, quote, style, color)
values ('d1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'personal',
        'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
        'back', 0, 5, 'Verso', 'highlight', 'yellow')
on conflict (id) do nothing;

insert into public.law_marks
  (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset, quote, style, color)
values ('d1000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
        'lai', 'lai-art-1', 0, 8, 16, 'Esta Lei', 'highlight', 'yellow')
on conflict (id) do nothing;

insert into public.summary_topics (id, subject, title, position, source_name, source_hash, blocks)
values ('exclusao-topico', 'Informática', 'Tópico da exclusão', 1, 'fonte', 'hash', '[]'::jsonb)
on conflict (id) do nothing;
insert into public.summary_annotations (user_id, topic_id, notes)
values ('22222222-2222-4222-8222-222222222222', 'exclusao-topico', '[]'::jsonb)
on conflict (user_id, topic_id) do nothing;

-- O ledger da bateria: o cenário traz a sessão, não as respostas.
insert into public.quiz_session_questions
  (quiz_session_id, teacher_id, student_id, study_plan_id, block_id, question_id, execution_order, outcome, phase)
select s.id, s.teacher_id, s.student_id, s.study_plan_id, s.block_id, 910001, 1, 'correct', 'main'
  from public.quiz_sessions s
 where s.student_id = '22222222-2222-4222-8222-222222222222'
 limit 1;

-- Um cupom que o Bruno resgatou: histórico de liberação, e também FICA.
insert into public.coupons (code, description, months_granted) values ('EXCL21', 'cupom da exclusao', 3)
on conflict (code) do nothing;
insert into public.coupon_redemptions (coupon_id, student_id, months, expires_at)
select id, '22222222-2222-4222-8222-222222222222', 3, now() + interval '3 months'
  from public.coupons where code = 'EXCL21'
on conflict do nothing;

-- Um simulado da turma do Bruno, com a nota dele: é o que DEVE ficar.
insert into public.mock_exams (id, teacher_id, class_id, title, exam_date, max_score)
select 'd1000000-0000-4000-8000-000000000005', cs.teacher_id, cs.class_id, 'Simulado da exclusão', current_date, 100
  from public.class_students cs
 where cs.student_id = '22222222-2222-4222-8222-222222222222'
on conflict (id) do nothing;
insert into public.mock_exam_subjects (exam_id, teacher_id, subject, question_count)
values ('d1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Informática', 10)
on conflict do nothing;
insert into public.mock_exam_results (exam_id, teacher_id, student_id, score)
values ('d1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 80)
on conflict do nothing;
insert into public.mock_exam_subject_results (exam_id, teacher_id, student_id, subject, correct_answers)
values ('d1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 'Informática', 8)
on conflict do nothing;

-- ---------- O estado de antes: o que deveria sair, o que deveria ficar, o controle ----------
create temp table before_counts as
select 'bruno'::text as who, t.name as tbl,
       (xpath('/row/n/text()', query_to_xml(
          format('select count(*) as n from public.%I where %I = %L', t.name, t.col, '22222222-2222-4222-8222-222222222222'),
          false, true, '')))[1]::text::bigint as n
  from (values
    ('quiz_session_questions','student_id'),('quiz_sessions','student_id'),('reinforcement_cycles','student_id'),
    ('flashcard_marks','student_id'),('flashcard_reviews','student_id'),('library_flashcard_reviews','student_id'),
    ('law_marks','student_id'),('summary_annotations','user_id'),('personal_flashcard_decks','student_id'),
    ('theory_review_entries','student_id'),('theory_reviews','student_id'),('theory_progress','student_id'),
    ('goal_entries','student_id'),('goals','student_id'),('study_plan_theory_catalogs','student_id'),
    ('study_plan_notebooks','student_id'),('study_plans','student_id'),('class_students','student_id'),
    ('waitlist','student_id'),
    ('access_grants','student_id'),('coupon_redemptions','student_id'),('mock_exam_results','student_id'),('mock_exam_subject_results','student_id')
  ) as t(name, col);

create temp table carla_before as
select 'goals'::text as tbl, count(*) as n from public.goals where student_id = '33333333-3333-4333-8333-333333333333'
union all select 'study_plans', count(*) from public.study_plans where student_id = '33333333-3333-4333-8333-333333333333'
union all select 'goal_entries', count(*) from public.goal_entries where student_id = '33333333-3333-4333-8333-333333333333'
union all select 'access_grants', count(*) from public.access_grants where student_id = '33333333-3333-4333-8333-333333333333';

do $$
declare v_filled integer;
begin
  select count(*) into v_filled from before_counts
   where tbl in ('quiz_session_questions','quiz_sessions','flashcard_marks','law_marks','summary_annotations',
                 'personal_flashcard_decks','theory_reviews','theory_progress','goal_entries','goals',
                 'study_plan_theory_catalogs','study_plan_notebooks','study_plans','class_students','waitlist')
     and n > 0;
  if v_filled < 15 then
    raise exception 'FALHOU: o semeio regrediu — so % das 15 tabelas-chave tinham dado antes da exclusao', v_filled;
  end if;
  if not exists (select 1 from before_counts where tbl = 'access_grants' and n > 0)
     or not exists (select 1 from before_counts where tbl = 'coupon_redemptions' and n > 0)
     or not exists (select 1 from before_counts where tbl = 'mock_exam_results' and n > 0)
     or not exists (select 1 from before_counts where tbl = 'mock_exam_subject_results' and n > 0) then
    raise exception 'FALHOU: o semeio nao deixou historico retido para provar que ele fica';
  end if;
  raise notice '00 OK  o semeio cobre as 15 tabelas-chave e o historico retido';
end $$;

-- ---------- Recusas ----------
set role authenticated;
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora
do $$ begin
  perform public.delete_my_account();
  raise exception 'FALHOU: a professora excluiu a propria conta por autoatendimento';
exception when insufficient_privilege then
  raise notice '01 OK  professor e recusado com 42501';
end $$;

reset role;
set role anon;
do $$ begin
  perform public.delete_my_account();
  raise exception 'FALHOU: anonimo executou delete_my_account';
exception when insufficient_privilege then
  raise notice '02 OK  anon nao tem EXECUTE';
end $$;
reset role;

-- ---------- Excluir ----------
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
select public.delete_my_account();

reset role;
select app_test.act_as_owner();

-- O que SAIU.
do $$
declare r record; v_left bigint;
begin
  for r in select tbl, n from before_counts where who = 'bruno' and tbl not in ('access_grants','coupon_redemptions','mock_exam_results','mock_exam_subject_results') loop
    execute format('select count(*) from public.%I where %I = %L', r.tbl,
                   case when r.tbl = 'summary_annotations' then 'user_id' else 'student_id' end,
                   '22222222-2222-4222-8222-222222222222') into v_left;
    if v_left <> 0 then
      raise exception 'FALHOU: % ainda guarda % linha(s) do aluno excluido', r.tbl, v_left;
    end if;
  end loop;
  -- E o que cascateia sem coluna de aluno direta.
  if exists (select 1 from public.personal_flashcards where deck_id = 'd1000000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU: os cartoes pessoais do aluno sobreviveram';
  end if;
  raise notice '03 OK  tudo o que o aluno fez saiu';
end $$;

-- O que FICOU, sem identificar ninguém.
do $$
declare r record; v_now bigint;
begin
  for r in select tbl, n from before_counts where tbl in ('access_grants','coupon_redemptions','mock_exam_results','mock_exam_subject_results') and n > 0 loop
    execute format('select count(*) from public.%I where student_id = %L', r.tbl, '22222222-2222-4222-8222-222222222222') into v_now;
    if v_now <> r.n then
      raise exception 'FALHOU: % tinha % linha(s) retida(s) e agora tem %', r.tbl, r.n, v_now;
    end if;
  end loop;
  raise notice '04 OK  liberacoes, resgates de cupom e notas de simulado ficaram';
end $$;

do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = '22222222-2222-4222-8222-222222222222';
  if p.name <> 'Conta excluída' or p.teacher_id is not null or p.deleted_at is null
     or p.access_status <> 'suspended' or p.access_expires_at is not null
     or p.plan is not null or p.coupon_used is not null or p.access_origin is not null
     or p.theme_preference is not null then
    raise exception 'FALHOU: o perfil nao ficou anonimo e sem acesso: %', row_to_json(p);
  end if;
  raise notice '05 OK  o perfil e "Conta excluida", sem professor nem acesso';
end $$;

do $$
declare u auth.users;
begin
  select * into u from auth.users where id = '22222222-2222-4222-8222-222222222222';
  if u.email like '%bruno%' or u.email not like 'conta-excluida-%@excluida.invalid'
     or u.encrypted_password is not null or u.phone is not null
     or u.raw_user_meta_data <> '{}'::jsonb or u.deleted_at is null then
    raise exception 'FALHOU: o login nao foi anulado: email=%, banido=%', u.email, u.banned_until;
  end if;
  -- O GoTrue le `banned_until` como time.Time e NAO le `infinity`: com ele, /user e
  -- /logout da conta davam 500 e a listagem admin falhava para todos (QA2-B01).
  if u.banned_until is null or u.banned_until = 'infinity' or u.banned_until < now() + interval '50 years' then
    raise exception 'FALHOU: banned_until deve ser uma data finita bem no futuro, e nao infinity: %', u.banned_until;
  end if;
  if exists (select 1 from auth.users where banned_until = 'infinity') then
    raise exception 'FALHOU: ha usuario com banned_until = infinity, que o GoTrue nao consegue ler';
  end if;
  if exists (select 1 from auth.identities where user_id = u.id)
     or exists (select 1 from auth.sessions where user_id = u.id)
     or exists (select 1 from auth.mfa_factors where user_id = u.id) then
    raise exception 'FALHOU: identidade, sessao ou fator sobreviveu';
  end if;
  raise notice '06 OK  o login foi anulado e o e-mail original saiu';
end $$;

-- O controle: a colega do mesmo professor não perde nada.
do $$
declare r record; v_now bigint;
begin
  for r in select tbl, n from carla_before loop
    execute format('select count(*) from public.%I where student_id = %L', r.tbl, '33333333-3333-4333-8333-333333333333') into v_now;
    if v_now <> r.n then
      raise exception 'FALHOU: a exclusao do Bruno mexeu em % da Carla (% -> %)', r.tbl, r.n, v_now;
    end if;
  end loop;
  raise notice '07 OK  a outra aluna do mesmo professor nao perdeu nada';
end $$;

-- ---------- Idempotência: o JWT sobrevive, e a segunda chamada não faz nada ----------
select deleted_at as deleted_before from public.profiles
 where id = '22222222-2222-4222-8222-222222222222' \gset
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');
select public.delete_my_account();
reset role;
select app_test.act_as_owner();
select (deleted_at is not distinct from :'deleted_before'::timestamptz) as unchanged
  from public.profiles where id = '22222222-2222-4222-8222-222222222222' \gset
select set_config('t.unchanged', :'unchanged', false) \gset
do $$ begin
  if not current_setting('t.unchanged')::boolean then
    raise exception 'FALHOU: a segunda chamada reescreveu deleted_at';
  end if;
  raise notice '08 OK  a retentativa devolve sem tocar em nada';
end $$;

-- ---------- Conta excluída não escreve mais ----------
set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');
do $$
declare v_rows integer;
begin
  update public.profiles set name = 'Voltei' where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: a conta excluida renomeou o perfil';
  end if;
  raise notice '09 OK  UPDATE do nome filtra em silencio (0 linhas)';
end $$;

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('22222222-2222-4222-8222-222222222222', null, 'Voltei',
          (select (auth.jwt() ->> 'email')), '(11) 90000-0000', 'Policial', 'PF');
  raise exception 'FALHOU: a conta excluida recriou a inscricao na lista de espera';
exception when insufficient_privilege then
  raise notice '10 OK  a conta excluida nao recria a lista de espera (WITH CHECK)';
end $$;

-- ---------- Sem acesso vigente também exclui ----------
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, acesso vencido
do $$ begin
  if public.has_active_access() then
    raise exception 'FALHOU: o cenario da Fabi deveria ter acesso vencido';
  end if;
  perform public.delete_my_account();
  raise notice '11 OK  aluno com acesso vencido exclui a conta';
end $$;
reset role;
select app_test.act_as_owner();
do $$ begin
  if (select deleted_at from public.profiles where id = '66666666-6666-4666-8666-666666666666') is null then
    raise exception 'FALHOU: a conta da Fabi nao foi marcada como excluida';
  end if;
end $$;
