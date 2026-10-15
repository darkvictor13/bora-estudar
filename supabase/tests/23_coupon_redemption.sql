\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Resgate de cupom (spec 30)
-- =============================================================================
-- O resgate é o único caminho em que o próprio aluno altera o próprio acesso, e
-- por isso a suíte ataca as DUAS pontas: o que ele PODE fazer (resgatar, e
-- retentar sem consumir duas vezes) e o que NÃO pode (escrever direto, adivinhar
-- código, empilhar cupom, resgatar sendo professor ou conta excluída).
--
-- Usa contas NOVAS, criadas pelo gatilho de cadastro: o Bruno e a Fabi do
-- cenário são apagados pela suíte 21, e conta pendente é o caso real de quem
-- resgata.
-- =============================================================================

select app_test.act_as_owner();

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','79000000-0000-4000-8000-000000000001','authenticated','authenticated','cupom-a@x.com','{"name":"Aluna Cupom A"}'),
  ('00000000-0000-0000-0000-000000000000','79000000-0000-4000-8000-000000000002','authenticated','authenticated','cupom-b@x.com','{"name":"Aluna Cupom B"}'),
  ('00000000-0000-0000-0000-000000000000','79000000-0000-4000-8000-000000000003','authenticated','authenticated','cupom-c@x.com','{"name":"Aluna Cupom C"}'),
  ('00000000-0000-0000-0000-000000000000','79000000-0000-4000-8000-000000000004','authenticated','authenticated','cupom-d@x.com','{"name":"Aluna Cupom D"}');

insert into public.coupons (code, description, months_granted, active, valid_until, max_uses) values
  ('TESTE3',   'tres meses',        3, true,  null,                         null),
  ('INATIVO',  'desativado',        3, false, null,                         null),
  ('VENCIDO',  'venceu ontem',      3, true,  now() - interval '1 day',     null),
  ('ESGOTADO', 'sem usos',          3, true,  null,                         1),
  ('ULTIMO',   'um uso so',         1, true,  null,                         1);

-- ESGOTADO já foi usado por uma aluna do cenário.
insert into public.coupon_redemptions (coupon_id, student_id, months, expires_at)
select id, '55555555-5555-4555-8555-555555555555', 3, now() + interval '3 months'
  from public.coupons where code = 'ESGOTADO';

-- ---------- Resgatar ----------
set role authenticated;
select app_test.act_as('79000000-0000-4000-8000-000000000001');  -- A, pendente
do $$
declare r record; v_exp timestamptz; v_rows integer;
begin
  -- Entrada como a pessoa digita: minúsculas e espaço no meio.
  select * into r from public.redeem_coupon(' teste 3 ');
  if r.access_status <> 'active' then
    raise exception 'FALHOU: o resgate devolveu acesso %', r.access_status;
  end if;
  if r.access_expires_at < now() + interval '89 days' or r.access_expires_at > now() + interval '93 days' then
    raise exception 'FALHOU: a validade concedida foi %', r.access_expires_at;
  end if;
  v_exp := r.access_expires_at;

  if not public.has_active_access() then
    raise exception 'FALHOU: depois do resgate o aluno nao tem acesso vigente';
  end if;
  select count(*) into v_rows from public.coupon_redemptions;
  if v_rows <> 1 then
    raise exception 'FALHOU: o aluno enxerga % resgate(s), esperava so o proprio', v_rows;
  end if;
  raise notice '01 OK  o codigo e normalizado, o acesso e concedido pelo prazo do cupom';

  -- A resposta se perdeu na rede: a retentativa devolve o MESMO resultado.
  select * into r from public.redeem_coupon('TESTE3');
  if r.access_expires_at is distinct from v_exp then
    raise exception 'FALHOU: a retentativa devolveu outra validade (% e %)', v_exp, r.access_expires_at;
  end if;
  raise notice '02 OK  a retentativa de quem acabou de resgatar devolve o resultado anterior';
end $$;

reset role;
do $$
declare v_rows integer; p public.profiles;
begin
  select count(*) into v_rows from public.coupon_redemptions
   where student_id = '79000000-0000-4000-8000-000000000001';
  if v_rows <> 1 then
    raise exception 'FALHOU: a retentativa gravou um segundo resgate (% linhas)', v_rows;
  end if;
  select * into p from public.profiles where id = '79000000-0000-4000-8000-000000000001';
  if p.coupon_used <> 'TESTE3' or p.access_origin <> 'coupon' or p.access_status <> 'active' then
    raise exception 'FALHOU: o perfil nao carimbou o cupom: %', row_to_json(p);
  end if;
  raise notice '03 OK  um unico resgate gravado, e o perfil carimbado com o cupom';
end $$;

-- ---------- Quem já usou o cupom e perdeu o acesso não resgata de novo ----------
select app_test.act_as_owner();
update public.profiles set access_expires_at = now() - interval '1 day'
 where id = '79000000-0000-4000-8000-000000000001';
set role authenticated;
select app_test.act_as('79000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.redeem_coupon('TESTE3');
  raise exception 'FALHOU: o mesmo cupom foi resgatado duas vezes pela mesma aluna';
exception when raise_exception then
  if sqlerrm <> 'Você já usou este cupom.' then raise; end if;
  raise notice '04 OK  o mesmo cupom nao e resgatado duas vezes, mesmo com o acesso vencido';
end $$;

-- ---------- Acesso vigente não empilha cupom ----------
reset role;
select app_test.act_as_owner();
update public.profiles set access_expires_at = now() + interval '1 month'
 where id = '79000000-0000-4000-8000-000000000001';
set role authenticated;
select app_test.act_as('79000000-0000-4000-8000-000000000001');
do $$ begin
  perform public.redeem_coupon('ULTIMO');
  raise exception 'FALHOU: quem tem acesso vigente empilhou outro cupom';
exception when raise_exception then
  if sqlerrm <> 'Seu acesso já está liberado.' then raise; end if;
  raise notice '05 OK  acesso vigente nao resgata outro cupom';
end $$;

-- ---------- A mesma resposta para quatro motivos ----------
select app_test.act_as('79000000-0000-4000-8000-000000000002');  -- B, pendente
do $$
declare v_codigo text;
begin
  foreach v_codigo in array array['NAOEXISTE', 'INATIVO', 'VENCIDO', 'ESGOTADO'] loop
    begin
      perform public.redeem_coupon(v_codigo);
      raise exception 'FALHOU: o cupom % foi aceito', v_codigo;
    exception when raise_exception then
      if sqlerrm <> 'Cupom inválido ou expirado.' then
        raise exception 'FALHOU: % respondeu "%" — a resposta precisa ser a mesma para os quatro casos', v_codigo, sqlerrm;
      end if;
    end;
  end loop;
  raise notice '06 OK  inexistente, inativo, vencido e esgotado dao a mesma resposta';
end $$;

do $$ begin
  perform public.redeem_coupon('   ');
  raise exception 'FALHOU: codigo vazio foi aceito';
exception when raise_exception then
  if sqlerrm <> 'Informe o código do cupom.' then raise; end if;
  raise notice '07 OK  codigo vazio pede o codigo';
end $$;

-- ---------- O limite de usos ----------
do $$ begin
  perform public.redeem_coupon('ULTIMO');  -- B leva o último uso
  raise notice '08 OK  o ultimo uso de um cupom limitado passa';
end $$;

select app_test.act_as('79000000-0000-4000-8000-000000000003');  -- C, pendente
do $$ begin
  perform public.redeem_coupon('ULTIMO');
  raise exception 'FALHOU: o cupom passou do max_uses';
exception when raise_exception then
  if sqlerrm <> 'Cupom inválido ou expirado.' then raise; end if;
  raise notice '09 OK  max_uses: o uso seguinte ao ultimo e recusado';
end $$;

-- ---------- Quem não pode resgatar ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora
do $$ begin
  perform public.redeem_coupon('TESTE3');
  raise exception 'FALHOU: a professora resgatou um cupom';
exception when insufficient_privilege then
  raise notice '10 OK  professor e recusado com 42501';
end $$;

reset role;
set role anon;
do $$ begin
  perform public.redeem_coupon('TESTE3');
  raise exception 'FALHOU: anonimo executou redeem_coupon';
exception when insufficient_privilege then
  raise notice '11 OK  anon nao tem EXECUTE';
end $$;
reset role;

-- Conta excluída: nasce, exclui, e o JWT que sobrou não resgata.
set role authenticated;
select app_test.act_as('79000000-0000-4000-8000-000000000004');  -- D
select public.delete_my_account();
do $$ begin
  perform public.redeem_coupon('TESTE3');
  raise exception 'FALHOU: uma conta excluida resgatou cupom';
exception when insufficient_privilege then
  raise notice '12 OK  conta excluida nao resgata';
end $$;

-- ---------- Ninguém escreve direto ----------
select app_test.act_as('79000000-0000-4000-8000-000000000003');  -- C, ainda pendente
do $$ begin
  insert into public.coupon_redemptions (coupon_id, student_id, months, expires_at)
  select id, '79000000-0000-4000-8000-000000000003', 3, now() + interval '3 months'
    from public.coupons where code = 'TESTE3';
  raise exception 'FALHOU: o aluno gravou o proprio resgate direto';
exception when insufficient_privilege then
  raise notice '13 OK  coupon_redemptions nao aceita INSERT do aluno';
end $$;

do $$ begin
  perform 1 from public.coupons limit 1;
  raise exception 'FALHOU: o aluno leu a tabela de cupons';
exception when insufficient_privilege then
  raise notice '14 OK  coupons nao tem grant: a lista de codigos nao vaza';
end $$;

do $$ begin
  update public.coupon_redemptions set months = 99;
  raise exception 'FALHOU: o aluno alterou um resgate';
exception when insufficient_privilege then
  raise notice '15 OK  coupon_redemptions nao aceita UPDATE';
end $$;

do $$ begin
  update public.profiles set access_status = 'active', coupon_used = 'TESTE3'
   where id = '79000000-0000-4000-8000-000000000003';
  raise exception 'FALHOU: o aluno carimbou o proprio acesso sem resgatar';
exception when insufficient_privilege then
  raise notice '16 OK  o acesso do aluno continua fora do grant: so a RPC o concede';
end $$;

reset role;
select app_test.act_as_owner();
