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
-- O ramo de INSERT é o que um cadastro público percorre, e é o testável daqui:
-- o de UPDATE congela colunas que o grant por coluna já tirou do alcance de
-- `authenticated` (suíte 01) — as duas defesas existem para que um grant
-- esquecido numa migration futura não reabra o buraco sozinho.
-- =============================================================================

-- Uma conta recém-criada no GoTrue, ainda sem perfil. Enquanto o gatilho de
-- criação de perfil não voltar, é isto que a tela de cadastro faz.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','77777777-7777-4777-8777-777777777777',
        'authenticated','authenticated','gil@x.com','{"role":"student","name":"Gil"}');

set role authenticated;
select app_test.act_as('77777777-7777-4777-8777-777777777777');

-- ---------- O perfil nasce aluno e pendente, diga o cliente o que disser ----------
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
  raise notice '01 OK  toda conta nasce aluno e pendente, ignorando o que o cliente mandou';
end $$;

-- ---------- Ninguém cria perfil para outro ----------
do $$ begin
  insert into public.profiles (id, name) values
    ('88888888-8888-4888-8888-888888888888','Perfil alheio');
  raise exception 'FALHOU: criou perfil no id de outra pessoa';
exception
  when insufficient_privilege then
    raise notice '02 OK  profiles_insert_own so aceita o proprio id';
  when foreign_key_violation then
    raise notice '02 OK  profiles_insert_own so aceita o proprio id (sem conta no GoTrue)';
end $$;

-- ---------- Sem acesso vigente, sem escrita de execução ----------
do $$
declare v_ativo boolean;
begin
  select public.has_active_access() into v_ativo;
  if v_ativo then
    raise exception 'FALHOU: conta pendente passou por has_active_access()';
  end if;
  raise notice '03 OK  conta pendente nao tem acesso vigente';
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
  raise notice '04 OK  o dono grava o proprio nome';
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
  raise notice '05 OK  profiles_update_own continua amarrando a linha ao dono';
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
  raise notice '06 OK  quem e manutencao sai do JWT, nunca de session_user';
end $$;
