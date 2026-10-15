-- Resgate de cupom de acesso (spec 30).
--
-- `coupons` existe desde a migration inicial com RLS ligada, zero policy e zero
-- grant, de propósito: validar o código no cliente entregaria a lista de códigos.
-- O resgate é uma RPC que valida, concede e registra numa transação só, e é o
-- único caminho em que o próprio aluno altera o próprio acesso.

-- ---------- 1. O cupom ganha validade e limite de usos ----------
--
-- Nuláveis e sem default: compatíveis com o bundle que já está no ar, e "sem
-- prazo" e "sem limite" continuam sendo o que um cupom antigo significa.
alter table public.coupons
  add column valid_until timestamptz,
  add column max_uses integer,
  add constraint coupons_max_uses_check check (max_uses is null or max_uses > 0);

-- ---------- 2. Quem resgatou o quê ----------
--
-- A PK `(coupon_id, student_id)` é a invariante de "um aluno resgata um cupom uma
-- vez" (R-CUP-07), e é ela que sustenta a idempotência da RPC. As duas FKs são
-- RESTRICT: o resgate é histórico de liberação, como `access_grants`, e fica
-- quando a conta é excluída (spec 46) — apontando para um perfil sem nome,
-- e-mail nem vínculo.
create table public.coupon_redemptions (
  coupon_id   uuid        not null references public.coupons (id)  on delete restrict,
  student_id  uuid        not null references public.profiles (id) on delete restrict,
  months      integer     not null check (months > 0),
  expires_at  timestamptz not null,
  redeemed_at timestamptz not null default now(),
  constraint coupon_redemptions_pkey primary key (coupon_id, student_id)
);

create index coupon_redemptions_student_idx on public.coupon_redemptions (student_id);

alter table public.coupon_redemptions enable row level security;

-- O aluno lê os PRÓPRIOS resgates e mais nada: ninguém escreve direto, a escrita
-- é da RPC. Sem policy de INSERT, UPDATE ou DELETE e sem grant para nenhum.
create policy coupon_redemptions_select on public.coupon_redemptions for select to authenticated
  using (student_id = (select auth.uid()));

revoke all on public.coupon_redemptions from public, anon, authenticated;
grant select on public.coupon_redemptions to authenticated;

-- ---------- 3. A RPC ----------
--
-- IDEMPOTÊNCIA — quem sustenta é a PK `(coupon_id, student_id)` mais
-- `profiles.coupon_used`. A retentativa de quem acabou de resgatar (a resposta se
-- perdeu na rede) encontra o resgate gravado, o acesso ainda vigente e o mesmo
-- código, e DEVOLVE o resultado anterior; só acusa "já usou" quando o acesso
-- daquele cupom já acabou. A busca do resgate vem ANTES da validade do cupom: um
-- cupom que venceu entre a primeira tentativa e a retentativa não pode fazer a
-- pessoa que já resgatou ler "inválido".
--
-- A linha do PERFIL é travada (`for update`) antes de qualquer leitura, então
-- duas chamadas do mesmo aluno se serializam; a do CUPOM é travada antes de
-- contar os usos, então dois alunos disputando o último uso não passam os dois.
--
-- Código inexistente, inativo, vencido e esgotado dão a MESMA frase: distingui-los
-- entregaria um oráculo para adivinhar códigos (R-CUP-04).
--
-- O gatilho `protect_profile_admin_fields` reverte o acesso quando QUEM escreve é o
-- dono da linha — que é exatamente o caso. Como em `delete_my_account`, só para
-- este UPDATE o papel do JWT passa a `service_role` e volta logo depois. O cliente
-- não consegue o mesmo: `set_config` não é exposto pela API, e a troca nunca
-- atravessa o fim da função.
create function public.redeem_coupon(p_code text)
  returns table (access_status public.access_status, access_expires_at timestamptz)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_profile    public.profiles;
  v_code       text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_coupon     public.coupons;
  v_redemption public.coupon_redemptions;
  v_active     boolean;
  v_expires    timestamptz;
  v_claims     text;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para resgatar um cupom.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.role <> 'student' or v_profile.deleted_at is not null then
    raise exception 'Somente aluno resgata cupom.' using errcode = '42501';
  end if;

  if v_code = '' then
    raise exception 'Informe o código do cupom.';
  end if;

  v_active := v_profile.access_status = 'active'
              and (v_profile.access_expires_at is null or v_profile.access_expires_at > now());

  -- Já resgatou ESTE cupom? Antes da validade, para a retentativa funcionar.
  select * into v_coupon from public.coupons c where upper(c.code) = v_code;
  if found then
    select * into v_redemption
      from public.coupon_redemptions r
     where r.coupon_id = v_coupon.id and r.student_id = v_uid;
    if found then
      if v_active and v_profile.coupon_used = v_coupon.code then
        return query select v_profile.access_status, v_profile.access_expires_at;
        return;
      end if;
      raise exception 'Você já usou este cupom.';
    end if;
  end if;

  -- Vale? Travando a linha do cupom antes de contar os usos.
  select * into v_coupon
    from public.coupons c
   where upper(c.code) = v_code
     and c.active
     and (c.valid_until is null or c.valid_until > now())
     for update;
  if not found
     or (v_coupon.max_uses is not null
         and (select count(*) from public.coupon_redemptions r where r.coupon_id = v_coupon.id)
             >= v_coupon.max_uses) then
    raise exception 'Cupom inválido ou expirado.';
  end if;

  if v_active then
    raise exception 'Seu acesso já está liberado.';
  end if;

  v_expires := now() + make_interval(months => v_coupon.months_granted);

  insert into public.coupon_redemptions (coupon_id, student_id, months, expires_at)
  values (v_coupon.id, v_uid, v_coupon.months_granted, v_expires);

  v_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  update public.profiles
     set access_status = 'active',
         access_expires_at = v_expires,
         coupon_used = v_coupon.code,
         access_origin = 'coupon'
   where id = v_uid;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  return query select 'active'::public.access_status, v_expires;
end;
$$;

revoke execute on function public.redeem_coupon(text) from public, anon;
grant execute on function public.redeem_coupon(text) to authenticated;

comment on function public.redeem_coupon(text) is
  'Resgata um cupom de acesso para o aluno que chama. Idempotente pela PK de coupon_redemptions e por profiles.coupon_used.';
