\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Lista de espera — a única porta que fica aberta para quem ainda não tem acesso
-- =============================================================================
-- `profiles` e `waitlist` ficam fora de `has_active_access()` de propósito: é
-- por elas que um aluno pendente pede acesso, e fechá-las trancaria a porta de
-- entrada. Em troca, as duas amarram identidade — o e-mail do cadastro tem de
-- ser o do JWT, e o vínculo não muda depois.
-- =============================================================================

set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno

-- ---------- O cadastro é do próprio, com o e-mail do próprio ----------
do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'Aluno Bruno','outro@x.com','41999990000','Fiscal','Receita Federal');
  raise exception 'FALHOU: cadastrou a lista de espera com e-mail de outra pessoa';
exception when insufficient_privilege then
  raise notice '01 OK  o e-mail do cadastro tem de ser o do JWT';
end $$;

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam, status)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'Aluno Bruno','bruno@x.com','41999990000','Fiscal','Receita Federal','released');
  raise exception 'FALHOU: o aluno se liberou sozinho no INSERT';
exception when insufficient_privilege then
  raise notice '02 OK  o cadastro nasce `waiting`, e nao liberado';
end $$;

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'Aluno Bruno','bruno@x.com','41999990000','Fiscal','Receita Federal');
  raise notice '03 OK  o aluno se cadastra na lista do proprio professor';
end $$;

-- ---------- O vínculo do cadastro é imutável ----------
do $$ begin
  update public.waitlist set teacher_id = '44444444-4444-4444-8444-444444444444'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o aluno trocou de professor pela lista de espera';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '04 OK  protect_waitlist_identity congela aluno, professor e e-mail';
end $$;

do $$ begin
  update public.waitlist set email = 'terceiro@x.com'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o e-mail do cadastro mudou depois de criado';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '05 OK  o e-mail do cadastro tambem e identidade';
end $$;

do $$ begin
  update public.waitlist set whatsapp = '41988887777'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise notice '06 OK  o que nao e identidade o proprio aluno corrige';
end $$;

-- ---------- Liberar é do professor ----------
do $$
declare v_afetadas integer;
begin
  update public.waitlist set status = 'released'
   where student_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: o aluno se liberou sozinho';
  end if;
  raise notice '07 OK  o aluno nao muda o proprio status (USING exige `waiting` dos dois lados)';
exception when insufficient_privilege then
  raise notice '07 OK  o aluno nao muda o proprio status';
end $$;

-- ---------- Quem não é da turma não enxerga o cadastro ----------
select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.waitlist;
  if v_total <> 0 then
    raise exception 'FALHOU: Davi enxergou % cadastros da turma da Ana', v_total;
  end if;
  raise notice '08 OK  o cadastro so aparece para o aluno e para o professor dele';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_total integer; v_status public.waitlist_status;
begin
  select count(*) into v_total from public.waitlist;
  if v_total <> 1 then
    raise exception 'FALHOU: Ana enxergou % cadastros, esperava 1', v_total;
  end if;

  update public.waitlist set status = 'released'
   where student_id = '22222222-2222-4222-8222-222222222222';
  select status into v_status from public.waitlist
   where student_id = '22222222-2222-4222-8222-222222222222';
  if v_status <> 'released' then
    raise exception 'FALHOU: o professor nao conseguiu liberar o cadastro';
  end if;
  raise notice '09 OK  liberar o cadastro e do professor da turma';
end $$;

-- ---------------------------------------------------------------------------
-- A fila de quem ainda não tem professor
-- ---------------------------------------------------------------------------
-- Gil (7777…) vem da suíte 04: cadastrou-se, ganhou perfil pelo gatilho e está
-- `pending` SEM PROFESSOR — que é o estado de toda conta nova desde a migration
-- `20260914190000`. A suíte 04 vinculou HELENA, e não ele, justamente para que
-- esta continue tendo uma inscrição sem dono para exercitar. É a inscrição que o `not null` de `teacher_id` recusava, e
-- que o `p.teacher_id = waitlist.teacher_id` da policy recusaria depois dele:
-- `null = null` é `null`, e WITH CHECK que não é `true` barra.
-- ---------------------------------------------------------------------------

select app_test.act_as('77777777-7777-4777-8777-777777777777');  -- Gil

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',
          'Gil da Silva','gil@x.com','41999991111','Fiscal','Receita Federal');
  raise exception 'FALHOU: entrou na fila de uma professora a que nao esta ligado';
exception when insufficient_privilege then
  raise notice '10 OK  sem vinculo, so a fila sem dono e aceita';
end $$;

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('77777777-7777-4777-8777-777777777777', null,
          'Gil da Silva','gil@x.com','41999991111','Fiscal','Receita Federal');
  raise notice '11 OK  quem acabou de se cadastrar entra na fila sem professor';
end $$;

-- ---------- A fila sem dono deixou de ser um diretório ----------
--
-- Até 18/09/2026 `waitlist_select` mostrava toda inscrição sem professor a
-- QUALQUER professor — nome, e-mail, WhatsApp e nascimento de quem ainda não é
-- aluno de ninguém. Era o preço de a fila ser visível, e ele deixou de se pagar
-- quando `find_student_by_email` entrou no lugar da lista: a busca casa o
-- endereço INTEIRO e devolve no máximo uma pessoa.
select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.waitlist where teacher_id is null;
  if v_total <> 0 then
    raise exception 'FALHOU: Davi ainda enxerga % inscricoes sem professor', v_total;
  end if;
  raise notice '12 OK  a fila sem dono nao e legivel por professor nenhum';
end $$;

-- ---------- E não aparece para outro aluno ----------
select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.waitlist where student_id <> '33333333-3333-4333-8333-333333333333';
  if v_total <> 0 then
    raise exception 'FALHOU: Carla enxergou % inscricoes alheias', v_total;
  end if;
  raise notice '13 OK  aluno nenhum enxerga a fila, com ou sem professor';
end $$;

-- ---------- Assumir a inscrição é trabalho privilegiado ----------
--
-- `protect_waitlist_identity` congelava o vínculo para TODO MUNDO, e com
-- `teacher_id` nulável isso deixaria a fila num beco: nulo nunca viraria id,
-- nem por RPC `security definer`. A exceção é a mesma de
-- `protect_profile_admin_fields` — quem age sai do JWT.
-- Contado, e não esperando exceção: a inscrição sem dono nem CHEGA ao gatilho
-- para Ana — `waitlist_update` a filtra antes, porque `teacher_id = auth.uid()`
-- é `null` quando a coluna é nula. É a armadilha que o CLAUDE.md descreve:
-- UPDATE recusado por policy afeta zero linhas, em silêncio.
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_afetadas integer;
begin
  update public.waitlist set teacher_id = '11111111-1111-4111-8111-111111111111'
   where student_id = '77777777-7777-4777-8777-777777777777';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: uma professora assumiu a inscricao pela API';
  end if;
  raise notice '14 OK  professor nenhum assume a inscricao pelo PostgREST';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '14 OK  professor nenhum assume a inscricao pelo PostgREST';
end $$;

-- `reset role` junto com o `act_as_owner`: o papel do JWT é o que o GATILHO lê,
-- mas quem a RLS filtra é o PAPEL DO BANCO. Continuar como `authenticated` sem
-- JWT deixaria a linha invisível, e o teste passaria sem escrever nada.
reset role;
select app_test.act_as_owner();
do $$
declare v_teacher uuid;
begin
  update public.waitlist set teacher_id = '11111111-1111-4111-8111-111111111111'
   where student_id = '77777777-7777-4777-8777-777777777777';
  select teacher_id into v_teacher from public.waitlist
   where student_id = '77777777-7777-4777-8777-777777777777';
  if v_teacher is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'FALHOU: a manutencao nao conseguiu assumir a inscricao';
  end if;
  raise notice '15 OK  a manutencao (e a RPC que rodar como definer) assume a inscricao';
end $$;

-- ---------- A RPC assume a inscrição; o gatilho continua barrando o resto ----------
--
-- É a exceção de R-VINC-26, e ela é estreita: `teacher_id` NULO virando o
-- `auth.uid()` de quem é professor, com aluno e e-mail intactos. Íris entra aqui
-- em vez de Gil porque o teste 15 já assumiu a inscrição dele como manutenção —
-- e um `update ... where teacher_id is null` que não acha linha não prova nada.
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'authenticated','authenticated','iris@x.com','{"name":"Iris"}');

set role authenticated;
select app_test.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');  -- Íris
insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
        'Iris da Silva','iris@x.com','41999992222','Fiscal','Receita Federal');

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_teacher uuid; v_total integer;
begin
  perform public.link_student('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  select teacher_id into v_teacher from public.waitlist
   where student_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_teacher is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'FALHOU: a RPC nao reivindicou a linha da fila (ficou %)',
      coalesce(v_teacher::text, '<nulo>');
  end if;

  -- E agora a inscrição aparece para Ana, porque ela tem dono.
  select count(*) into v_total from public.waitlist
   where student_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_total <> 1 then
    raise exception 'FALHOU: a inscricao assumida nao aparece para quem a assumiu';
  end if;
  raise notice '16 OK  link_student assume a inscricao apesar do gatilho';
end $$;

do $$ begin
  update public.waitlist set email = 'outra@x.com'
   where student_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FALHOU: a excecao da RPC abriu o e-mail do cadastro';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '17 OK  a excecao vale so para teacher_id nulo, e so uma vez';
end $$;

do $$ begin
  update public.waitlist set teacher_id = '44444444-4444-4444-8444-444444444444'
   where student_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FALHOU: a inscricao ja assumida trocou de professor';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '18 OK  inscricao com dono nao muda de dono';
end $$;
