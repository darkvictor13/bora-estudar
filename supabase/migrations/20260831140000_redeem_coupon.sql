-- Cupom de acesso — spec docs/specs/30-cupom-de-acesso.md
--
-- A tabela `coupons` está no schema desde a migration inicial e nenhuma tela
-- jamais a leu. Sem cupom, o aluno que se cadastra fica na lista de espera até
-- um professor liberar o acesso à mão — não existe caminho para experimentar o
-- produto sozinho.
--
-- Na v96 o cupom era um objeto no JavaScript do navegador (`CUPONS_ACESSO_TESTE`)
-- e aplicá-lo era um upsert direto em `profiles`, gravando `status_acesso` e
-- `plano_expira_em`. Quem abrisse o console liberava o próprio acesso pelo tempo
-- que quisesse. Aqui é RPC: o aluno não tem — e não passa a ter — grant de
-- escrita em `subscriptions`.
--
-- IDEMPOTÊNCIA COM PAYLOAD: recebe `request_id` e passa por `reserve_operation`.
-- É a primeira das duas formas do CLAUDE.md, e é o que impede um reenvio de
-- consumir um segundo uso do cupom.
--
-- Compatível com o bundle no ar: função nova, nenhuma tabela alterada.
-- `select` em `coupons` já era concedido desde a migration inicial.

create or replace function public.redeem_coupon(
  p_code       text,
  p_request_id uuid
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  -- Sem espaço e em maiúsculas, como `normalizarCupomAcesso` da v96: a pessoa
  -- digita o que está no papel, e "cupom 3meses" é o mesmo que "CUPOM3MESES".
  v_code        text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_coupon      public.coupons%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_reservation record;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado' using errcode = '28000';
  end if;

  if v_code = '' then
    raise exception 'cupom invalido ou expirado' using errcode = '22023';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'redeem_coupon', v_uid, v_code
  );

  -- Replay: devolve a assinatura que o resgate anterior criou, sem consumir
  -- outro uso do cupom.
  if not v_reservation.reserved then
    select * into v_subscription from public.subscriptions
     where id = (v_reservation.previous->>'subscription_id')::uuid;
    return v_subscription;
  end if;

  -- `for update` porque `current_uses` é lido e escrito: sem o bloqueio, dois
  -- resgates simultâneos do último uso passariam os dois pela verificação.
  -- A `check` coupon_uses_within_limit é a garantia final.
  select * into v_coupon from public.coupons c
   where upper(regexp_replace(c.code, '\s', '', 'g')) = v_code
   for update;

  -- Inexistente, inativo, expirado e esgotado recebem A MESMA resposta.
  -- Distinguir os casos entregaria um oráculo para adivinhar códigos válidos.
  if not found
     or not v_coupon.active
     or (v_coupon.valid_until is not null and v_coupon.valid_until < current_date)
     or (v_coupon.max_uses is not null and v_coupon.current_uses >= v_coupon.max_uses)
  then
    raise exception 'cupom invalido ou expirado' using errcode = '22023';
  end if;

  -- Empilhar cupons viraria uma forma de renovar sozinho para sempre.
  if exists (
    select 1 from public.subscriptions s
     where s.student_id = v_uid and s.status = 'active'
  ) then
    raise exception 'voce ja tem acesso liberado' using errcode = '23505';
  end if;

  -- O mesmo cupom, uma vez por aluno. O critério é `subscriptions.coupon_id`:
  -- não é preciso tabela nova para saber quem usou o quê.
  if exists (
    select 1 from public.subscriptions s
     where s.student_id = v_uid and s.coupon_id = v_coupon.id
  ) then
    raise exception 'voce ja usou este cupom' using errcode = '23505';
  end if;

  insert into public.subscriptions (student_id, status, plan, validity, coupon_id)
  values (
    v_uid, 'active', 'cupom',
    daterange(
      current_date,
      (current_date + (v_coupon.months || ' months')::interval)::date,
      '[)'
    ),
    v_coupon.id
  )
  returning * into v_subscription;

  -- Na MESMA transação que a assinatura: duas gravações separadas dariam um
  -- cupom consumido sem acesso concedido, ou o contrário.
  update public.coupons
     set current_uses = current_uses + 1
   where id = v_coupon.id;

  update public.operations
     set result = jsonb_build_object(
           'subscription_id', v_subscription.id,
           'coupon_id', v_coupon.id,
           'months', v_coupon.months
         )
   where request_id = p_request_id;

  return v_subscription;
end;
$$;

comment on function public.redeem_coupon(text, uuid) is
  'Resgata um cupom e cria a assinatura ativa do próprio aluno. Idempotente por request_id. Único caminho de escrita do aluno em subscriptions.';

-- O default do Postgres concede EXECUTE a PUBLIC, que não é anon nem
-- authenticated: revogar dos dois papéis não tiraria nada. Foi assim que
-- reserve_operation ficou chamável por qualquer autenticado — BUG-14.
revoke execute on function public.redeem_coupon(text, uuid) from public;
grant execute on function public.redeem_coupon(text, uuid) to authenticated;
