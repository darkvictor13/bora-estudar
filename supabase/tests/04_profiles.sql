\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- O perfil, e quem carimba o quê
-- =============================================================================
-- `protect_profile_admin_fields` decide quem é manutenção pelo PAPEL DO JWT, e
-- não por `session_user`. É a correção que o de-para registra: numa conexão do
-- PostgREST `session_user` é sempre `authenticator`, então a checagem antiga
-- dependia de como a conexão tinha sido aberta.
--
-- São DUAS defesas, e esta suíte exercita as duas separadas:
--
--   1. o gatilho `create_profile_for_new_user`, que é quem realmente cria o
--      perfil hoje — e que ignora o `role` do metadado;
--   2. o ramo de INSERT de `protect_profile_admin_fields`, que sobra como
--      defesa em profundidade: `profiles_insert_own` e o grant de INSERT
--      continuam de pé, então um cliente AINDA consegue inserir a própria linha
--      se ela não existir.
--
-- O ramo de UPDATE congela colunas que o grant por coluna já tirou do alcance
-- de `authenticated` (suíte 01) — as duas defesas existem para que um grant
-- esquecido numa migration futura não reabra o buraco sozinho.
-- =============================================================================

-- Uma conta recém-criada no GoTrue. O metadado PEDE professor, de propósito: é
-- o que qualquer um pode mandar na chamada de cadastro.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','77777777-7777-4777-8777-777777777777',
        'authenticated','authenticated','gil@x.com','{"role":"teacher","name":"Gil"}');

-- ---------- O gatilho cria o perfil, e ignora o papel que o cliente pediu ----------
do $$
declare
  v_nome text; v_role public.user_role; v_status public.access_status; v_teacher uuid;
begin
  select name, role, access_status, teacher_id
    into v_nome, v_role, v_status, v_teacher
    from public.profiles where id = '77777777-7777-4777-8777-777777777777';

  if not found then
    raise exception 'FALHOU: a conta nasceu no GoTrue e nao ganhou perfil';
  end if;
  if v_nome is distinct from 'Gil' then
    raise exception 'FALHOU: o gatilho nao trouxe o nome do metadado (veio %)', v_nome;
  end if;
  if v_role <> 'student' then
    raise exception 'FALHOU: o metadado do cliente virou papel % no perfil', v_role;
  end if;
  if v_status <> 'pending' then
    raise exception 'FALHOU: a conta nasceu com acesso %', v_status;
  end if;
  if v_teacher is not null then
    raise exception 'FALHOU: a conta nasceu anexada ao professor %', v_teacher;
  end if;
  raise notice '01 OK  o gatilho cria o perfil aluno, pendente e sem professor';
end $$;

set role authenticated;
select app_test.act_as('77777777-7777-4777-8777-777777777777');

-- ---------- O INSERT do cliente também nasce aluno e pendente ----------
--
-- O perfil de Gil JÁ EXISTE, criado pelo gatilho: para exercitar o ramo de
-- INSERT do `protect_profile_admin_fields` é preciso apagá-lo antes, como
-- manutenção. Não é cenário de produção — é a defesa que segura o dia em que
-- o gatilho for removido ou falhar, e que uma chamada direta à API percorre.
reset role;
delete from public.profiles where id = '77777777-7777-4777-8777-777777777777';
set role authenticated;
select app_test.act_as('77777777-7777-4777-8777-777777777777');

do $$
declare v_role public.user_role; v_status public.access_status; v_plan text; v_cupom text;
begin
  insert into public.profiles (id, name, role, access_status, access_expires_at, plan, coupon_used)
  values ('77777777-7777-4777-8777-777777777777','Gil','teacher','active',
          now() + interval '10 years','Premium','BORA3M');

  select role, access_status, plan, coupon_used
    into v_role, v_status, v_plan, v_cupom
    from public.profiles where id = '77777777-7777-4777-8777-777777777777';

  if v_role <> 'student' then
    raise exception 'FALHOU: a conta nasceu com papel %', v_role;
  end if;
  if v_status <> 'pending' then
    raise exception 'FALHOU: a conta nasceu com acesso %', v_status;
  end if;
  if v_plan is not null or v_cupom is not null then
    raise exception 'FALHOU: a conta nasceu com plano/cupom carimbados';
  end if;
  raise notice '02 OK  o INSERT do cliente tambem nasce aluno e pendente';
end $$;

-- ---------- Ninguém cria perfil para outro ----------
do $$ begin
  insert into public.profiles (id, name) values
    ('88888888-8888-4888-8888-888888888888','Perfil alheio');
  raise exception 'FALHOU: criou perfil no id de outra pessoa';
exception
  when insufficient_privilege then
    raise notice '03 OK  profiles_insert_own so aceita o proprio id';
  when foreign_key_violation then
    raise notice '03 OK  profiles_insert_own so aceita o proprio id (sem conta no GoTrue)';
end $$;

-- ---------- Sem acesso vigente, sem escrita de execução ----------
do $$
declare v_ativo boolean;
begin
  select public.has_active_access() into v_ativo;
  if v_ativo then
    raise exception 'FALHOU: conta pendente passou por has_active_access()';
  end if;
  raise notice '04 OK  conta pendente nao tem acesso vigente';
end $$;

-- ---------- O nome continua sendo do dono ----------
do $$
declare v_nome text;
begin
  update public.profiles set name = 'Gil da Silva'
   where id = '77777777-7777-4777-8777-777777777777';
  select name into v_nome from public.profiles
   where id = '77777777-7777-4777-8777-777777777777';
  if v_nome <> 'Gil da Silva' then
    raise exception 'FALHOU: o nome ficou %', v_nome;
  end if;
  raise notice '05 OK  o dono grava o proprio nome';
end $$;

-- ---------- A policy também amarra o papel, não só o grant ----------
reset role;
do $$
declare v_check text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v_check
    from pg_policy where polname = 'profiles_update_own';
  if v_check is null or v_check not like '%uid%' then
    raise exception 'FALHOU: profiles_update_own nao amarra mais a linha ao dono';
  end if;
  raise notice '06 OK  profiles_update_own continua amarrando a linha ao dono';
end $$;

-- ---------- O gatilho decide pelo JWT, e não por session_user ----------
do $$
declare v_fonte text;
begin
  -- Sem as linhas de comentário: o próprio comentário da função CITA
  -- `session_user` para explicar por que ele não serve, e um `like` cru no
  -- corpo inteiro acusaria a explicação como se fosse o código.
  select string_agg(linha, e'\n') into v_fonte
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   cross join lateral unnest(string_to_array(p.prosrc, e'\n')) as linha
   where n.nspname = 'public' and p.proname = 'protect_profile_admin_fields'
     and btrim(linha) not like '--%';

  if v_fonte like '%session_user%' then
    raise exception 'FALHOU: o gatilho voltou a decidir por session_user';
  end if;
  if v_fonte not like '%auth.jwt()%' then
    raise exception 'FALHOU: o gatilho nao le mais o papel do JWT';
  end if;
  raise notice '07 OK  quem e manutencao sai do JWT, nunca de session_user';
end $$;

-- ---------------------------------------------------------------------------
-- Achar e assumir um aluno
-- ---------------------------------------------------------------------------
-- As três colunas que decidem o que cada pessoa enxerga — `teacher_id`,
-- `access_status` e `access_expires_at` — ficam fora de todo grant, e quem as
-- escreve é RPC. Esta parte da suíte ataca as RPCs pelo lado de fora da
-- interface: nenhuma tela chama `link_student` com o id de um professor.
--
-- Helena (9999…) nasce como toda conta nasce: aluna, pendente e sem professor.
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','99999999-9999-4999-8999-999999999999',
        'authenticated','authenticated','helena@x.com','{"name":"Helena"}');

set role authenticated;

-- ---------- A busca é do professor, e é pelo e-mail INTEIRO ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno, aluno
do $$ begin
  perform public.find_student_by_email('helena@x.com');
  raise exception 'FALHOU: um aluno buscou outro aluno pelo e-mail';
exception when raise_exception then
  if sqlerrm not like '%somente professor busca%' then raise; end if;
  raise notice '08 OK  find_student_by_email e do professor';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_id uuid; v_tem boolean; v_meu boolean; v_total integer;
begin
  select student_id, has_teacher, is_mine into v_id, v_tem, v_meu
    from public.find_student_by_email('  HELENA@X.COM ');
  if v_id is distinct from '99999999-9999-4999-8999-999999999999' then
    raise exception 'FALHOU: a busca exata nao achou Helena (veio %)', coalesce(v_id::text, '<nada>');
  end if;
  if v_tem or v_meu then
    raise exception 'FALHOU: Helena apareceu como ja vinculada';
  end if;

  -- Prefixo não casa: casar parcial é enumeração com outro nome.
  select count(*) into v_total from public.find_student_by_email('helena');
  if v_total <> 0 then
    raise exception 'FALHOU: a busca casou um pedaco do e-mail';
  end if;

  -- Professor não é aluno, e não aparece na busca.
  select count(*) into v_total from public.find_student_by_email('davi@x.com');
  if v_total <> 0 then
    raise exception 'FALHOU: a busca devolveu um professor';
  end if;
  raise notice '09 OK  a busca casa o e-mail inteiro, e so devolve aluno';
end $$;

-- ---------- Vincular é do professor, e o alvo precisa ser aluno ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$ begin
  perform public.link_student('99999999-9999-4999-8999-999999999999');
  raise exception 'FALHOU: um aluno vinculou outro aluno a si mesmo';
exception when raise_exception then
  if sqlerrm not like '%somente professor vincula%' then raise; end if;
  raise notice '10 OK  link_student exige role de professor';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$ begin
  perform public.link_student('44444444-4444-4444-8444-444444444444');
  raise exception 'FALHOU: uma professora vinculou outro professor como aluno';
exception when raise_exception then
  if sqlerrm not like '%perfil de aluno%' then raise; end if;
  raise notice '11 OK  link_student recusa alvo que nao seja aluno';
end $$;

-- ---------- O vínculo é sempre com quem chama ----------
do $$
declare v_args integer; v_teacher uuid;
begin
  -- Não existe parâmetro de `teacher_id`: vincular aluno ao professor alheio
  -- não é recusado por checagem, é inexprimível na assinatura.
  select pronargs into v_args from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'link_student';
  if v_args <> 1 then
    raise exception 'FALHOU: link_student passou a receber % parametros', v_args;
  end if;

  perform public.link_student('99999999-9999-4999-8999-999999999999');
  select teacher_id into v_teacher from public.profiles
   where id = '99999999-9999-4999-8999-999999999999';
  if v_teacher is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'FALHOU: o vinculo ficou com %', coalesce(v_teacher::text, '<nulo>');
  end if;
  raise notice '12 OK  link_student grava auth.uid(), e nao um teacher_id recebido';
end $$;

-- ---------- Vincular não libera acesso ----------
do $$
declare v_status public.access_status;
begin
  select access_status into v_status from public.profiles
   where id = '99999999-9999-4999-8999-999999999999';
  if v_status <> 'pending' then
    raise exception 'FALHOU: assumir o aluno liberou o acesso dele (%)', v_status;
  end if;
  raise notice '13 OK  vincular diz de quem o aluno e; liberar e outro ato';
end $$;

-- ---------- A segunda chamada não é erro, e a de outro professor é ----------
do $$
declare v_total integer;
begin
  perform public.link_student('99999999-9999-4999-8999-999999999999');
  select count(*) into v_total from public.profiles
   where id = '99999999-9999-4999-8999-999999999999'
     and teacher_id = '11111111-1111-4111-8111-111111111111';
  if v_total <> 1 then
    raise exception 'FALHOU: a segunda chamada mexeu no vinculo';
  end if;
  raise notice '14 OK  link_student e idempotente: quem ja e seu continua seu';
end $$;

select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$ begin
  perform public.link_student('99999999-9999-4999-8999-999999999999');
  raise exception 'FALHOU: Davi assumiu a aluna da Ana';
exception when raise_exception then
  if sqlerrm not like '%ja tem professor%' then raise; end if;
  raise notice '15 OK  aluno com professor nao e assumido por outro';
end $$;

-- ---------- Liberar exige o vínculo, e é do professor DELE ----------
do $$ begin
  perform public.set_student_access(
    '99999999-9999-4999-8999-999999999999', 'grant', 3, gen_random_uuid());
  raise exception 'FALHOU: Davi liberou o acesso da aluna da Ana';
exception when raise_exception then
  if sqlerrm not like '%professor do aluno%' then raise; end if;
  raise notice '16 OK  set_student_access exige is_teacher_of';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare
  v_status public.access_status; v_expira timestamptz; v_primeira timestamptz;
  v_chave uuid := 'ac000000-0000-4000-8000-000000000001';
  v_total integer;
begin
  select access_status, access_expires_at into v_status, v_primeira
    from public.set_student_access(
      '99999999-9999-4999-8999-999999999999', 'grant', 3, v_chave);
  if v_status <> 'active' or v_primeira <= now() then
    raise exception 'FALHOU: liberar deu % ate %', v_status, v_primeira;
  end if;

  -- Mesmo id e mesmo payload: devolve o resultado anterior sem reexecutar.
  select access_expires_at into v_expira
    from public.set_student_access(
      '99999999-9999-4999-8999-999999999999', 'grant', 3, v_chave);
  if v_expira is distinct from v_primeira then
    raise exception 'FALHOU: a retentativa somou de novo (% -> %)', v_primeira, v_expira;
  end if;

  select count(*) into v_total from public.access_grants where request_id = v_chave;
  if v_total <> 1 then
    raise exception 'FALHOU: a retentativa gravou % linhas', v_total;
  end if;
  raise notice '17 OK  mesmo request_id e mesmo payload devolve o resultado guardado';
end $$;

do $$ begin
  perform public.set_student_access(
    '99999999-9999-4999-8999-999999999999', 'grant', 6,
    'ac000000-0000-4000-8000-000000000001');
  raise exception 'FALHOU: o mesmo request_id passou com outro payload';
exception when raise_exception then
  if sqlerrm not like '%outro pedido%' then raise; end if;
  raise notice '18 OK  mesmo request_id com payload diferente e rejeitado';
end $$;

-- ---------- Liberar SOMA, e bloquear PRESERVA ----------
do $$
declare v_antes timestamptz; v_depois timestamptz; v_status public.access_status;
begin
  select access_expires_at into v_antes from public.profiles
   where id = '99999999-9999-4999-8999-999999999999';

  select access_expires_at into v_depois
    from public.set_student_access(
      '99999999-9999-4999-8999-999999999999', 'grant', 3,
      'ac000000-0000-4000-8000-000000000002');
  if v_depois <= v_antes then
    raise exception 'FALHOU: liberar de novo nao somou (% -> %)', v_antes, v_depois;
  end if;

  select access_status, access_expires_at into v_status, v_antes
    from public.set_student_access(
      '99999999-9999-4999-8999-999999999999', 'suspend', null,
      'ac000000-0000-4000-8000-000000000003');
  if v_status <> 'suspended' then
    raise exception 'FALHOU: bloquear deixou o status em %', v_status;
  end if;
  if v_antes is distinct from v_depois then
    raise exception 'FALHOU: bloquear apagou a vigencia (% -> %)', v_depois, v_antes;
  end if;
  raise notice '19 OK  liberar soma ao que falta, e bloquear preserva a data';
end $$;

-- ---------- O par `active` com data passada é inexprimível ----------
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.profiles
   where access_status = 'active' and access_expires_at is not null
     and access_expires_at <= now();
  if v_total <> 0 then
    raise exception 'FALHOU: % perfil(is) com acesso ativo e data vencida', v_total;
  end if;
  raise notice '20 OK  status e data nao divergem (era o BUG-07)';
end $$;
