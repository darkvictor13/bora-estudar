\pset pager off
\set ON_ERROR_STOP on
-- Cupom de acesso — spec docs/specs/30-cupom-de-acesso.md
--
-- Cobre CA-01 a CA-07. Cria os próprios cupons e os próprios alunos: as suítes
-- limpam o seed antes de rodar, e o aluno das suítes anteriores já tem
-- assinatura ativa — que é justamente um dos casos de recusa.
--
-- O que estas asserções seguram: que o aluno continua sem escrita em
-- subscriptions, que o cupom esgotado não é resgatado nem com corrida, e que um
-- reenvio não consome um segundo uso.

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888','cupom1@x.com','{"role":"student","name":"Aluno Cupom"}'),
  ('99999999-9999-9999-9999-999999999999','cupom2@x.com','{"role":"student","name":"Aluno Cupom 2"}');

insert into public.coupons (id, code, months, max_uses, valid_until, active) values
  ('d0000000-0000-4000-8000-0000000000c1','TESTE3MESES',   3, null, null, true),
  ('d0000000-0000-4000-8000-0000000000c2','TESTEINATIVO',  3, null, null, false),
  ('d0000000-0000-4000-8000-0000000000c3','TESTEVENCIDO',  3, null, current_date - 1, true),
  ('d0000000-0000-4000-8000-0000000000c4','TESTEESGOTADO', 3, 1, null, true),
  ('d0000000-0000-4000-8000-0000000000c5','TESTEOUTRO',    6, null, null, true);

update public.coupons set current_uses = 1 where code = 'TESTEESGOTADO';

set role authenticated;
select set_config('request.jwt.claim.sub','88888888-8888-8888-8888-888888888888',false);

-- ---------- CA-07: o aluno nao escreve subscriptions ----------
do $$ begin
  insert into public.subscriptions (student_id, status, plan, validity)
  values ('88888888-8888-8888-8888-888888888888','active','na marra',
          daterange(current_date, null, '[)'));
  raise exception 'FALHOU: o aluno liberou o proprio acesso por insert direto';
exception when insufficient_privilege then
  raise notice '01 OK  o aluno nao tem grant de escrita em subscriptions';
end $$;

-- ---------- CA-03: os tres casos de recusa, com a MESMA mensagem ----------
do $$
declare c text; v_msg text;
begin
  foreach c in array array['TESTEINATIVO','TESTEVENCIDO','TESTEESGOTADO','NAOEXISTE'] loop
    begin
      perform public.redeem_coupon(c, gen_random_uuid());
      raise exception 'FALHOU: aceitou o cupom %', c;
    exception when invalid_parameter_value then
      get stacked diagnostics v_msg = message_text;
      if v_msg <> 'cupom invalido ou expirado' then
        raise exception 'FALHOU: % devolveu a mensagem "%"', c, v_msg;
      end if;
    end;
  end loop;
  raise notice '02 OK  inativo, vencido, esgotado e inexistente dao a mesma resposta';
end $$;

-- ---------- CA-01 e CA-02: resgate valido, com o codigo normalizado ----------
do $$
declare v_sub public.subscriptions%rowtype; v_usos integer;
begin
  -- Minusculas e com espaco: a pessoa digita o que esta no papel.
  v_sub := public.redeem_coupon(' teste 3meses ', 'e0000000-0000-4000-8000-0000000000a1'::uuid);

  if v_sub.status <> 'active' then
    raise exception 'FALHOU: assinatura veio %', v_sub.status;
  end if;
  if lower(v_sub.validity) <> current_date then
    raise exception 'FALHOU: validade comeca em %', lower(v_sub.validity);
  end if;
  if upper(v_sub.validity) <> (current_date + interval '3 months')::date then
    raise exception 'FALHOU: validade termina em %', upper(v_sub.validity);
  end if;
  if v_sub.coupon_id <> 'd0000000-0000-4000-8000-0000000000c1' then
    raise exception 'FALHOU: coupon_id ficou %', v_sub.coupon_id;
  end if;

  select current_uses into v_usos from public.coupons where code = 'TESTE3MESES';
  if v_usos <> 1 then raise exception 'FALHOU: % usos apos o resgate', v_usos; end if;

  raise notice '03 OK  cupom normalizado resgatado, com 3 meses e 1 uso';
end $$;

-- ---------- CA-06: replay nao consome outro uso ----------
do $$
declare v_sub public.subscriptions%rowtype; v_usos integer; v_linhas integer;
begin
  v_sub := public.redeem_coupon('TESTE3MESES', 'e0000000-0000-4000-8000-0000000000a1'::uuid);

  select current_uses into v_usos from public.coupons where code = 'TESTE3MESES';
  select count(*) into v_linhas from public.subscriptions
   where student_id = '88888888-8888-8888-8888-888888888888';

  if v_usos <> 1 then raise exception 'FALHOU: o replay consumiu outro uso (%)', v_usos; end if;
  if v_linhas <> 1 then raise exception 'FALHOU: o replay criou % assinaturas', v_linhas; end if;
  if v_sub.id is null then raise exception 'FALHOU: o replay nao devolveu a assinatura'; end if;
  raise notice '04 OK  mesmo request_id devolve a anterior sem consumir uso';
end $$;

-- Mesmo id com OUTRO codigo e recusado antes de qualquer gravacao.
do $$ begin
  perform public.redeem_coupon('TESTEOUTRO', 'e0000000-0000-4000-8000-0000000000a1'::uuid);
  raise exception 'FALHOU: aceitou o mesmo request_id com outro cupom';
exception when unique_violation then
  raise notice '05 OK  mesmo request_id com outro codigo e recusado';
end $$;

-- ---------- CA-04: quem ja tem acesso nao resgata ----------
do $$
declare v_msg text;
begin
  perform public.redeem_coupon('TESTEOUTRO', gen_random_uuid());
  raise exception 'FALHOU: empilhou um segundo cupom sobre acesso ativo';
exception when unique_violation then
  get stacked diagnostics v_msg = message_text;
  if v_msg <> 'voce ja tem acesso liberado' then
    raise exception 'FALHOU: mensagem inesperada "%"', v_msg;
  end if;
  raise notice '06 OK  aluno com acesso ativo nao resgata';
end $$;

-- ---------- CA-05: o mesmo cupom, uma vez por aluno ----------
-- Encerra a assinatura para isolar ESTE caso do anterior.
reset role;
update public.subscriptions set status = 'expired'
 where student_id = '88888888-8888-8888-8888-888888888888';
set role authenticated;
select set_config('request.jwt.claim.sub','88888888-8888-8888-8888-888888888888',false);

do $$
declare v_msg text;
begin
  perform public.redeem_coupon('TESTE3MESES', gen_random_uuid());
  raise exception 'FALHOU: resgatou o mesmo cupom duas vezes';
exception when unique_violation then
  get stacked diagnostics v_msg = message_text;
  if v_msg <> 'voce ja usou este cupom' then
    raise exception 'FALHOU: mensagem inesperada "%"', v_msg;
  end if;
  raise notice '07 OK  o mesmo cupom nao e resgatado duas vezes pelo mesmo aluno';
end $$;

-- Mas OUTRO cupom, sim: o acesso anterior expirou.
do $$
declare v_sub public.subscriptions%rowtype;
begin
  v_sub := public.redeem_coupon('TESTEOUTRO', gen_random_uuid());
  if upper(v_sub.validity) <> (current_date + interval '6 months')::date then
    raise exception 'FALHOU: o cupom de 6 meses deu validade ate %', upper(v_sub.validity);
  end if;
  raise notice '08 OK  outro cupom vale, e os meses saem do cupom';
end $$;

-- ---------- O esgotado continua esgotado para outro aluno ----------
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false);
do $$ begin
  perform public.redeem_coupon('TESTEESGOTADO', gen_random_uuid());
  raise exception 'FALHOU: o cupom esgotado foi resgatado';
exception when invalid_parameter_value then
  raise notice '09 OK  cupom no limite de usos nao e resgatado';
end $$;

-- O cupom sem limite continua valendo para o segundo aluno.
do $$
declare v_usos integer;
begin
  perform public.redeem_coupon('TESTE3MESES', gen_random_uuid());
  select current_uses into v_usos from public.coupons where code = 'TESTE3MESES';
  if v_usos <> 2 then raise exception 'FALHOU: % usos, esperava 2', v_usos; end if;
  raise notice '10 OK  cupom sem limite vale para mais de um aluno';
end $$;

-- ---------- search_path e grants ----------
reset role;
do $$
declare v_falta text;
begin
  select string_agg(p.proname, ', ') into v_falta
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'redeem_coupon'
     and not exists (
       select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%'
     );
  if v_falta is not null then
    raise exception 'FALHOU: redeem_coupon sem set search_path';
  end if;
  raise notice '11 OK  redeem_coupon tem set search_path';
end $$;

do $$ begin
  if has_function_privilege('public','public.redeem_coupon(text,uuid)','execute') then
    raise exception 'FALHOU: PUBLIC ainda executa redeem_coupon';
  end if;
  raise notice '12 OK  execute revogado de PUBLIC';
end $$;
