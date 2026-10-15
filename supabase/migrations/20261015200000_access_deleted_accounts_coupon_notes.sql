-- Acesso, conta excluída, cupom e anotações: quatro achados do QA de 15/10/2026.
-- Só `create or replace` e comparações novas: compatível com o bundle no ar, e
-- as assinaturas não mudam.

-- ---------- 1. Conta excluída não tem acesso (QA2-A02) ----------
--
-- O JWT de quem excluiu a conta vale até expirar, e o Worker de `/materials`
-- decide o PDF por esta função. `delete_my_account` deixa o perfil `suspended`,
-- mas `link_student` (abaixo) já reabria um perfil excluído como `teacher_id` do
-- professor e a liberação seguinte o punha `active`. Os dois cintos: o vínculo
-- recusa o perfil excluído, e o acesso não é vigente para ele de jeito nenhum.
create or replace function public.has_active_access() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.deleted_at is null
       and p.access_status = 'active'
       and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

-- `set_student_access` não precisa mudar: ele exige `is_teacher_of(aluno)`, que
-- olha `profiles.teacher_id`, e `delete_my_account` zera esse vínculo. Impedir o
-- RE-vínculo é o que o mantém fechado.
create or replace function public.link_student(p_student_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.user_role;
  v_deleted timestamptz;
  v_owner   uuid;
  v_rows    integer;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado';
  end if;
  if not public.is_teacher() then
    raise exception 'somente professor vincula aluno';
  end if;

  select p.role, p.deleted_at into v_role, v_deleted from public.profiles p where p.id = p_student_id;
  if not found or v_deleted is not null then
    -- Conta excluída é "não encontrado", como se o aluno nunca tivesse existido.
    raise exception 'aluno nao encontrado';
  end if;
  -- Vincular um professor a outro é recusado ANTES de qualquer escrita.
  if v_role <> 'student' then
    raise exception 'somente perfil de aluno pode ser vinculado a um professor';
  end if;

  update public.profiles
     set teacher_id = v_uid
   where id = p_student_id
     and teacher_id is null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select p.teacher_id into v_owner from public.profiles p where p.id = p_student_id;
    if v_owner is distinct from v_uid then
      raise exception 'este aluno ja tem professor';
    end if;
  end if;

  update public.waitlist
     set teacher_id = v_uid
   where student_id = p_student_id
     and teacher_id is null;
end;
$$;

-- ---------- 2. Cupom: suspenso não se reativa, e não há oráculo (QA2-A01, A03) ----------
--
-- A ordem passa a ser: perfil, replay, acesso vigente, suspenso, validade do
-- código. O corpo é o de 20261015160000 com os dois testes de estado subidos.
create or replace function public.redeem_coupon(p_code text)
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

  -- Estado do ALUNO antes de olhar o CÓDIGO. Quem já tem acesso recebe a mesma
  -- frase para qualquer código, válido ou não: se a checagem viesse depois da
  -- validade, "já está liberado" contra "inválido" dizia ao aluno com acesso
  -- quais códigos existem (QA2-A03).
  if v_active then
    raise exception 'Seu acesso já está liberado.';
  end if;

  -- Bloqueado pelo professor não se reativa sozinho. O cupom é para quem ainda
  -- não tem acesso (pendente) ou o deixou vencer; `suspended` só nasce de
  -- `set_student_access` (e da exclusão de conta, recusada acima). Sem isto o
  -- bloqueio durava até o próximo cupom, e `access_grants` não registrava nada
  -- (QA2-A01).
  if v_profile.access_status = 'suspended' then
    raise exception 'Seu acesso está bloqueado. Fale com seu professor.';
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



-- ---------- 3. Anotações: o erro vira frase (QA2-A04) ----------
--
-- O corpo é o de 20261015120000, com a validação antes da escrita.
create or replace function public.save_summary_notes(
  p_topic_id text,
  p_previous jsonb,
  p_next     jsonb
) returns boolean
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_current jsonb;
  v_found   boolean;
  v_rows    integer;
begin
  if v_user is null then
    raise exception 'Entre na sua conta para salvar anotações.' using errcode = '42501';
  end if;

  select a.notes into v_current
    from public.summary_annotations a
   where a.user_id = v_user and a.topic_id = p_topic_id;
  v_found := found;

  if v_found and v_current = p_next then
    return true;
  end if;

  if not (select public.has_active_access()) and not (select public.is_teacher()) then
    raise exception 'Seu acesso não está vigente.' using errcode = '42501';
  end if;

  -- A regra de verdade é a CHECK de `summary_annotations`; aqui só se troca o
  -- erro cru (`23514`, `23503`, `23502`) por uma frase que a tela pode mostrar
  -- (QA2-A04). Os números são os da CHECK.
  if p_next is null or jsonb_typeof(p_next) <> 'array'
     or p_previous is null or jsonb_typeof(p_previous) <> 'array' then
    raise exception 'As anotações vieram num formato inválido. Recarregue o resumo.';
  end if;
  if jsonb_array_length(p_next) > 2000 then
    raise exception 'Este resumo já tem anotações demais (o máximo é 2000). Apague algumas antes de continuar.';
  end if;
  if octet_length(p_next::text) > 2097152 then
    raise exception 'As anotações deste resumo passaram do limite de tamanho. Apague algumas antes de continuar.';
  end if;
  if not exists (select 1 from public.summary_topics t where t.id = p_topic_id) then
    raise exception 'Resumo não encontrado.';
  end if;

  if not v_found then
    -- Quem acha que havia anotações, e não há linha, está desatualizado.
    if p_previous <> '[]'::jsonb then
      return false;
    end if;
    insert into public.summary_annotations (user_id, topic_id, notes)
    values (v_user, p_topic_id, p_next)
    on conflict (user_id, topic_id) do nothing;
    get diagnostics v_rows = row_count;
    return v_rows = 1;
  end if;

  update public.summary_annotations
     set notes = p_next
   where user_id = v_user and topic_id = p_topic_id and notes = p_previous;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

