-- =============================================================================
-- A semana gerada numa transação, a liberação de acesso travada, e o estado da
-- meta derivado do banco
-- =============================================================================
-- Cinco correções, todas compatíveis com o bundle que já está no ar: nenhuma
-- coluna muda de forma, nenhuma RPC existente muda de assinatura, e o que o
-- bundle antigo escreve continua sendo aceito.
--
--   1. `set_student_access` trava o perfil ANTES de conferir o `request_id`, e
--      reserva o `request_id` ANTES de mexer no perfil;
--   2. `replace_week_goals` gera a semana numa transação só, e o modo seguro
--      deixa de apagar meta com registro de estudo;
--   3. o estado `pending`/`in_progress` da meta passa a ser derivado de
--      `goal_entries` por gatilho, e não por um segundo UPDATE do cliente;
--   4. estudo extra e reforço que pedem uma casa ocupada vão para o fim do dia;
--   5. o ramo de INSERT de `protect_profile_admin_fields` passa a zerar
--      `teacher_id`, e as três colunas de resultado de `goals` saem do grant.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Liberar e bloquear: trava, reserva, e só então escreve
-- ---------------------------------------------------------------------------
--
-- A versão de `20260918120000` conferia o `request_id`, lia a vigência,
-- ATUALIZAVA o perfil e só então inseria em `access_grants`. O `exception when
-- unique_violation` desfaz apenas o INSERT: o UPDATE, fora do bloco, ficava.
--
-- A corrida era a retentativa depois de timeout, com o MESMO `request_id` —
-- exatamente o caso que a chave existe para cobrir. A segunda chamada passava
-- pela conferência antes do commit da primeira, lia a vigência DEPOIS dele,
-- somava os meses de novo, gravava o perfil, batia no índice único e devolvia
-- o resultado da primeira. O aluno ficava com o dobro do prazo, a tela mostrava
-- o valor certo, e `access_grants` não registrava a diferença.
--
-- Agora são duas mudanças de ordem, e cada uma fecha o buraco sozinha:
--
--   * `for update` no perfil é a primeira leitura. Duas chamadas para o mesmo
--     aluno serializam ali, e a segunda só confere o `request_id` depois do
--     commit da primeira — num comando novo, que enxerga a linha gravada;
--   * a linha de `access_grants` entra ANTES do UPDATE. Se o índice recusar,
--     o perfil ainda não foi tocado.
create or replace function public.set_student_access(
  p_student_id uuid,
  p_action     public.access_grant_action,
  p_months     integer,
  p_request_id uuid
) returns table (access_status public.access_status, access_expires_at timestamptz)
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_seen    public.access_grants%rowtype;
  v_current timestamptz;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado';
  end if;
  if p_request_id is null then
    raise exception 'request_id e obrigatorio';
  end if;
  if not public.is_teacher() then
    raise exception 'somente professor libera acesso';
  end if;
  -- `is_teacher_of` confere pelo ALUNO, e não pelo `teacher_id` que quem chama
  -- escolheu. É o que impõe a ordem "vincular antes de liberar".
  if not public.is_teacher_of(p_student_id) then
    raise exception 'somente o professor do aluno libera o acesso dele';
  end if;

  -- A TRAVA VEM PRIMEIRO. Depois de esperar por ela, o Postgres relê a linha na
  -- versão gravada por quem a segurava.
  select p.access_expires_at into v_current
    from public.profiles p
   where p.id = p_student_id
     for update;

  select * into v_seen from public.access_grants g where g.request_id = p_request_id;
  if found then
    return query select * from app_private.replay_access_grant(v_seen, p_student_id, p_action, p_months);
    return;
  end if;

  -- LIBERAR SOMA AO QUE AINDA FALTA; BLOQUEAR PRESERVA A DATA. As duas regras
  -- estão explicadas em `20260918120000`.
  if p_action = 'grant' then
    v_expires := greatest(now(), coalesce(v_current, now())) + make_interval(months => p_months);
  else
    v_expires := v_current;
  end if;

  -- A RESERVA VEM ANTES DA ESCRITA. Com a trava acima, o índice só recusa aqui
  -- um `request_id` reusado para OUTRO aluno — e aí o replay levanta, e a
  -- transação inteira volta.
  begin
    insert into public.access_grants (student_id, teacher_id, action, months, expires_at, request_id)
    values (p_student_id, v_uid, p_action, p_months, v_expires, p_request_id);
  exception when unique_violation then
    select * into v_seen from public.access_grants g where g.request_id = p_request_id;
    return query select * from app_private.replay_access_grant(v_seen, p_student_id, p_action, p_months);
    return;
  end;

  if p_action = 'grant' then
    update public.profiles
       set access_status = 'active',
           access_expires_at = v_expires
     where id = p_student_id;
  else
    update public.profiles
       set access_status = 'suspended'
     where id = p_student_id;
  end if;

  return query select
    (case p_action when 'grant' then 'active' else 'suspended' end)::public.access_status,
    v_expires;
end;
$$;

comment on function public.set_student_access(uuid, public.access_grant_action, integer, uuid) is
  'Libera por N meses (somando ao que ainda falta) ou bloqueia (preservando a data). Trava o perfil antes de conferir o `request_id`, e reserva o `request_id` antes de escrever no perfil.';

-- ---------------------------------------------------------------------------
-- 2. Gerar a semana numa transação só
-- ---------------------------------------------------------------------------
--
-- O adaptador fazia DELETE e depois INSERT, em duas requisições. Um INSERT que
-- falhava deixava a semana vazia — o defeito exato que a spec 04 descreve da
-- versão anterior, e que `apply_study_plan_batch` tinha resolvido antes de sair
-- com o schema de 14/09/2026.
--
-- E o modo seguro só preservava meta `completed`. Meta `in_progress` TEM
-- registro de estudo, por definição, e o registro saía junto por cascata: o
-- professor regenerava a semana e o tempo que o aluno lançou sumia das
-- estatísticas dele. O modo seguro agora preserva o que o aluno ESTUDOU —
-- concluída ou com registro. O modo completo continua apagando, depois da
-- confirmação que a tela exige.
--
-- Meta com bateria nunca sai, em modo nenhum: `quiz_sessions.goal_id` é `set
-- null`, e uma sessão aberta sem meta viola o CHECK de `quiz_sessions`.
--
-- IDEMPOTÊNCIA COM PAYLOAD. Substituir a semana NÃO é naturalmente idempotente:
-- se o aluno lançar um registro numa das metas novas entre a primeira tentativa
-- e a retentativa, a meta passa a ser preservada, e o reenvio acrescentaria a
-- mesma meta de novo ao dia. Por isso `week_batches.request_id` é UNIQUE, e o
-- payload guardado são as colunas — o planejamento, a semana, o modo e o hash
-- das metas pedidas.
create table public.week_batches (
  id              uuid primary key default gen_random_uuid(),
  study_plan_id   uuid not null,
  teacher_id      uuid not null,
  student_id      uuid not null,
  week_number     integer not null,
  keep_studied    boolean not null,
  -- `md5(p_goals::text)`. O texto de um jsonb é canônico — chaves ordenadas,
  -- espaço normalizado —, então o mesmo pedido dá o mesmo hash.
  goals_hash      text not null,
  -- O resultado, para a retentativa devolver sem reexecutar.
  goals_created   integer not null,
  goals_removed   integer not null,
  goals_preserved integer not null,
  request_id      uuid not null,
  created_at      timestamptz not null default now(),

  -- Composta, como todo contexto denormalizado. `cascade` porque um lote não é
  -- histórico: sem o planejamento, não há o que ele explique.
  constraint week_batches_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete cascade
);

comment on table public.week_batches is
  'Os lotes de geração de semana. Existe para a idempotência de `replace_week_goals`: SELECT para o professor, e nada mais.';

create unique index week_batches_request_uidx on public.week_batches (request_id);
create index week_batches_plan_idx on public.week_batches (study_plan_id, teacher_id, student_id);

alter table public.week_batches enable row level security;

create policy week_batches_select on public.week_batches for select to authenticated
  using (teacher_id = (select auth.uid()));

grant select on public.week_batches to authenticated;

-- SECURITY DEFINER porque grava em `week_batches`, que não tem grant de
-- escrita. Por isso a função confere sozinha o que a RLS conferiria: o
-- planejamento é de quem chama. As defesas de `goals` que não são RLS — FK
-- composta, gatilhos, índice de casa — continuam valendo, porque o INSERT é o
-- mesmo.
create or replace function public.replace_week_goals(
  p_study_plan_id uuid,
  p_week_number   integer,
  p_keep_studied  boolean,
  p_goals         jsonb,
  p_request_id    uuid
) returns table (goals_created integer, goals_removed integer, goals_preserved integer)
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_plan      public.study_plans%rowtype;
  v_hash      text;
  v_seen      public.week_batches%rowtype;
  v_created   integer;
  v_removed   integer;
  v_preserved integer;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado';
  end if;
  if p_request_id is null then
    raise exception 'request_id e obrigatorio';
  end if;
  if p_week_number is null or p_week_number < 1 then
    raise exception 'semana invalida';
  end if;
  if p_keep_studied is null then
    raise exception 'o modo de substituicao e obrigatorio';
  end if;
  if p_goals is null or jsonb_typeof(p_goals) <> 'array' then
    raise exception 'as metas precisam vir numa lista';
  end if;

  -- A TRAVA NO PLANEJAMENTO serializa duas gerações dele: a segunda confere o
  -- `request_id` e lê as metas sobreviventes depois do commit da primeira.
  --
  -- Planejamento alheio e planejamento inexistente recebem a MESMA recusa —
  -- distinguir os dois diria a um professor que o id existe.
  select * into v_plan from public.study_plans p where p.id = p_study_plan_id for update;
  if not found or v_plan.teacher_id is distinct from v_uid then
    raise exception using
      errcode = '42501',
      message = 'somente o professor do planejamento gera a semana';
  end if;

  v_hash := md5(p_goals::text);

  select * into v_seen from public.week_batches b where b.request_id = p_request_id;
  if found then
    if v_seen.study_plan_id is distinct from p_study_plan_id
       or v_seen.week_number is distinct from p_week_number
       or v_seen.keep_studied is distinct from p_keep_studied
       or v_seen.goals_hash is distinct from v_hash then
      raise exception 'este request_id ja foi usado com outro pedido';
    end if;
    return query select v_seen.goals_created, v_seen.goals_removed, v_seen.goals_preserved;
    return;
  end if;

  delete from public.goals g
   where g.study_plan_id = v_plan.id
     and g.week_number = p_week_number
     and not (
       p_keep_studied
       and (g.status = 'completed'
         or exists (select 1 from public.goal_entries e where e.goal_id = g.id))
     )
     and not exists (
       select 1 from public.quiz_sessions s
        where s.goal_id = g.id or s.origin_goal_id = g.id
     );
  get diagnostics v_removed = row_count;

  select count(*) into v_preserved
    from public.goals g
   where g.study_plan_id = v_plan.id and g.week_number = p_week_number;

  -- A POSIÇÃO É DO BANCO. As metas novas entram depois da maior posição que
  -- sobreviveu em cada dia; a que vem no pedido é só a ordem relativa entre
  -- elas.
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
    day_position, type, subject, title, planned_minutes, lesson, block, notebook_block_id
  )
  select v_plan.id, v_plan.teacher_id, v_plan.student_id, p_week_number,
         r.weekday, r.weekday_name,
         coalesce(survivors.max_position, 0) + r.day_position,
         r.type, r.subject, r.title, coalesce(r.planned_minutes, 60),
         r.lesson, r.block, r.notebook_block_id
    from jsonb_to_recordset(p_goals) as r(
           weekday integer, weekday_name text, day_position integer,
           type public.goal_type, subject text, title text, planned_minutes integer,
           lesson text, block text, notebook_block_id uuid)
    left join (
      select g.weekday, max(g.day_position) as max_position
        from public.goals g
       where g.study_plan_id = v_plan.id and g.week_number = p_week_number
       group by g.weekday
    ) survivors on survivors.weekday = r.weekday;
  get diagnostics v_created = row_count;

  -- Com a trava acima, o índice único só recusa aqui um `request_id` reusado
  -- para OUTRO planejamento. Sem `exception when`: a violação sobe e desfaz a
  -- transação inteira, o DELETE e o INSERT junto.
  insert into public.week_batches (
    study_plan_id, teacher_id, student_id, week_number, keep_studied, goals_hash,
    goals_created, goals_removed, goals_preserved, request_id
  ) values (
    v_plan.id, v_plan.teacher_id, v_plan.student_id, p_week_number, p_keep_studied, v_hash,
    v_created, v_removed, v_preserved, p_request_id
  );

  return query select v_created, v_removed, v_preserved;
end;
$$;

comment on function public.replace_week_goals(uuid, integer, boolean, jsonb, uuid) is
  'Substitui as metas de uma semana numa transação só. Com `p_keep_studied`, preserva meta concluída ou com registro de estudo; em modo nenhum apaga meta com bateria. Idempotente por `week_batches.request_id`.';

-- ---------------------------------------------------------------------------
-- 3. O estado da meta acompanha os registros
-- ---------------------------------------------------------------------------
--
-- "Pendente" vira "em andamento" no primeiro registro, e volta a "pendente"
-- quando o último sai. O cliente fazia isso com um segundo UPDATE depois do
-- INSERT do registro: se o segundo falhasse, a meta ficava com um estado que os
-- registros desmentiam.
--
-- SECURITY INVOKER de propósito: o UPDATE passa pela policy, pelo grant por
-- coluna e pelos gatilhos de `goals` como se quem registrou o tivesse escrito.
-- Meta de bateria fica de fora — o estado dela é do motor, e
-- `protect_goal_quiz_result` recusaria.
create or replace function app_private.sync_goal_status_from_entries() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.goals g
       set status = 'in_progress'
     where g.id = new.goal_id
       and g.status = 'pending'
       and g.notebook_block_id is null;
    return new;
  end if;

  update public.goals g
     set status = 'pending'
   where g.id = old.goal_id
     and g.status = 'in_progress'
     and g.notebook_block_id is null
     and not exists (select 1 from public.goal_entries e where e.goal_id = old.goal_id);
  return old;
end;
$$;

create trigger sync_goal_status_from_entries
  after insert or delete on public.goal_entries
  for each row execute function app_private.sync_goal_status_from_entries();

-- ---------------------------------------------------------------------------
-- 4. Estudo extra e reforço não colidem com o que já está no dia
-- ---------------------------------------------------------------------------
--
-- O estudo extra entrava com `day_position = 99`, e `goals_one_per_slot_idx`
-- recusava o SEGUNDO estudo extra do mesmo dia. As duas metas que o ALUNO cria
-- não têm casa escolhida: são acréscimo, e entram no fim do dia. Quando a casa
-- pedida já está ocupada, a meta vai para a próxima livre.
--
-- Só para esses dois tipos. A meta do professor que colide continua recusada
-- pelo índice (`03_goals.sql`, asserção 14): ali a posição é planejamento, e
-- trocá-la em silêncio esconderia o erro de quem planejou.
--
-- Vale também para o bundle que já está no ar, que manda 99.
create or replace function app_private.place_goal_at_end_of_day() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if new.type in ('extra', 'reinforcement')
     and exists (
       select 1 from public.goals g
        where g.study_plan_id = new.study_plan_id
          and g.week_number = new.week_number
          and g.weekday = new.weekday
          and g.day_position = new.day_position
     ) then
    select max(g.day_position) + 1 into new.day_position
      from public.goals g
     where g.study_plan_id = new.study_plan_id
       and g.week_number = new.week_number
       and g.weekday = new.weekday;
  end if;
  return new;
end;
$$;

create trigger place_goal_at_end_of_day
  before insert on public.goals
  for each row execute function app_private.place_goal_at_end_of_day();

-- ---------------------------------------------------------------------------
-- 5. Duas defesas que estavam pela metade
-- ---------------------------------------------------------------------------
--
-- O ramo de INSERT de `protect_profile_admin_fields` é a defesa para o dia em
-- que o gatilho de cadastro falhar ou for removido (ver `04_profiles.sql`).
-- Ele zerava papel, acesso, plano e cupom, e esquecia `teacher_id`: quem criasse
-- o próprio perfil pela API escolheria o professor e pularia `link_student`.
create or replace function public.protect_profile_admin_fields() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  -- Quem está agindo sai do JWT, e só dele. Ver a nota longa na versão de
  -- `20260914150000`.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Toda conta nasce aluno, pendente e sem professor. Papel, acesso e
    -- vínculo são concedidos por quem tem privilégio, nunca pelo dono da linha.
    new.role := 'student';
    new.teacher_id := null;
    new.access_status := 'pending';
    new.access_expires_at := null;
    new.plan := null;
    new.coupon_used := null;
    new.access_origin := null;
    return new;
  end if;

  if (select auth.uid()) = old.id then
    new.role := old.role;
    new.teacher_id := old.teacher_id;
    new.access_status := old.access_status;
    new.access_expires_at := old.access_expires_at;
    new.plan := old.plan;
    new.coupon_used := old.coupon_used;
    new.access_origin := old.access_origin;
  end if;

  return new;
end;
$$;

-- `goals.spent_minutes`, `questions_answered` e `correct_answers` não são lidas
-- nem escritas pela tela: o número sai de `goal_entries`. Deixá-las no grant é
-- deixar pronto o segundo caminho escrevendo o mesmo número. O motor de
-- baterias, quando existir, escreve como definer e não depende deste grant.
revoke update (spent_minutes, questions_answered, correct_answers) on public.goals from authenticated;

-- ---------------------------------------------------------------------------
-- Execução
-- ---------------------------------------------------------------------------

revoke all on function app_private.sync_goal_status_from_entries() from public, anon, authenticated;
revoke all on function app_private.place_goal_at_end_of_day() from public, anon, authenticated;

-- `create or replace` preserva o ACL de `set_student_access` e de
-- `protect_profile_admin_fields`. A função nova precisa do revoke ANTES do
-- grant nominal: o default do Postgres concede EXECUTE a PUBLIC (BUG-14).
revoke all on function public.replace_week_goals(uuid, integer, boolean, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_week_goals(uuid, integer, boolean, jsonb, uuid)
  to authenticated;
