-- Gerar a semana numa transação.
--
-- Implementa `docs/specs/04-geracao-semanal.md` (QA-01, QA-05 e QA-17 do QA de
-- 06/10/2026).
--
-- O QUE ESTA MIGRATION FECHA
--
--   QA-01  Regenerar a semana apagava o estudo do aluno. O critério de "o que
--          fica" só olhava `completed`, e `goal_entries_goal_fk` em `cascade`
--          levava o registro da meta em andamento junto, sem erro.
--   QA-05  O adaptador apagava e inseria em duas requisições. Com a segunda
--          caindo, a semana ia de 5 metas para 0. E a retentativa chegava como
--          operação nova.
--   QA-17  `goals.week_number` e `goals.planned_minutes` não tinham CHECK.
--
-- São TRÊS funções públicas, UMA tabela e UM critério:
--
--   `generate_week`            apaga o que não foi feito e insere a semana nova
--   `clear_pending_goals`      apaga o mesmo, sem inserir nada
--   `week_replacement_preview` conta o que fica e o que sai
--   `goal_batches`             o lote: a PK é o `request_id` de `generate_week`
--   `app_private.goal_is_preserved`  o critério, em UM lugar
--
-- O CRITÉRIO
--
-- Fica de pé a meta concluída (concluir já é afirmação do aluno sobre o que
-- fez) e a meta com histórico: linha em `goal_entries`, ou bateria — o mesmo
-- predicado de `freeze_goal_with_sessions`. Sai a pendente, a pulada e a em
-- andamento sem histórico. Não existe modo que apague mais do que isso.
--
-- POR QUE GERAR TEM RPC, E TURMA NÃO
--
-- Apagar e inserir dezenas de linhas precisa acontecer junto ou não acontecer, e
-- um replay depois de sucesso não é inofensivo: a meta nova que ganhou registro
-- seria preservada e a semana inserida de novo. Nenhuma das três defesas da
-- escrita direta dá transação nem idempotência com payload.
--
-- IDEMPOTÊNCIA
--
--   `generate_week`       com payload: `goal_batches.id` (PK) é o `request_id`,
--                         e o replay compara `(study_plan_id, week_number)`.
--   `clear_pending_goals` naturalmente idempotente: só apaga, o critério é
--                         reavaliado sob a trava do plano, e o pior caso (corrida
--                         com um registro) é segurado por `goal_entries_goal_fk`.
--
-- COMPATIBILIDADE COM O BUNDLE QUE JÁ ESTÁ NO AR
--
-- Nenhum grant encolhe. O bundle anterior continua fazendo DELETE + INSERT
-- direto em `goals`, e ainda oferece "Replanejar semana inteira": com a FK em
-- `no action`, apagar meta com registro passa a falhar com 23503 ("O registro
-- depende de outro que não existe.") em vez de levar o estudo junto. A
-- mensagem piora e o dado fica, que é a troca certa. Apagar `study_plans` com
-- estudo registrado também passa a dar 23503 — nenhuma tela apaga planejamento.
--
-- O QUE ESTA MIGRATION FEZ COM OS DADOS (só existe staging, com dado de teste)
--
--   1. Apagou as metas com `week_number` fora de 1..520. O cascade, que ainda
--      vale NESTE ponto do arquivo, levou os registros delas.
--   2. `planned_minutes` negativo virou 0.

delete from public.goals where week_number not between 1 and 520;
update public.goals set planned_minutes = 0 where planned_minutes < 0;

alter table public.goals
  add constraint goals_week_number_check check (week_number between 1 and 520),
  add constraint goals_planned_minutes_check check (planned_minutes >= 0);

-- NO ACTION, e não RESTRICT: o no action confere no fim do comando, e é isso que
-- deixa o apagamento de conta — que desce por `profiles` até `goals` E até
-- `goal_entries` no mesmo comando — continuar passando. `07_schema` confere.
alter table public.goal_entries
  drop constraint goal_entries_goal_fk,
  add constraint goal_entries_goal_fk
    foreign key (goal_id, teacher_id, student_id)
    references public.goals (id, teacher_id, student_id)
    on delete no action;

-- O lote. `id` É o request_id, gerado uma vez na origem (com a prévia): a PK é
-- o que sustenta a idempotência de `generate_week`.
create table public.goal_batches (
  id            uuid primary key,
  study_plan_id uuid not null,
  teacher_id    uuid not null,
  student_id    uuid not null,
  week_number   integer not null,
  created_at    timestamptz not null default now(),
  constraint goal_batches_week_number_check check (week_number between 1 and 520),
  -- Defesa 3: o contexto copiado não diverge do planejamento.
  constraint goal_batches_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete cascade
);

comment on table public.goal_batches is
  'Uma linha por geração de semana. SELECT para o professor dono; quem escreve é `generate_week`.';

-- Índice do lado que referencia, na ordem da FK: é o que o cascade usa.
create index goal_batches_study_plan_idx
  on public.goal_batches (study_plan_id, teacher_id, student_id);

alter table public.goal_batches enable row level security;
create policy goal_batches_select on public.goal_batches for select to authenticated
  using (teacher_id = (select auth.uid()));
grant select on public.goal_batches to authenticated;

-- O CRITÉRIO, UMA VEZ. Fica de pé a meta concluída — concluir já é afirmação
-- do aluno — e a com histórico: registro, ou bateria pelo mesmo predicado de
-- `freeze_goal_with_sessions`.
create or replace function app_private.goal_is_preserved(p_goal_id uuid, p_status public.goal_status)
  returns boolean
  language sql stable set search_path = '' as $$
  select p_status = 'completed'
      or exists (select 1 from public.goal_entries e where e.goal_id = p_goal_id)
      or exists (select 1 from public.quiz_sessions s
                  where s.goal_id = p_goal_id or s.origin_goal_id = p_goal_id);
$$;

-- Em função própria pelo mesmo motivo de `replay_access_grant`: é chamada de
-- dois lugares, e duas cópias da comparação divergem numa alteração futura.
create or replace function app_private.check_goal_batch_replay(
  p_batch public.goal_batches, p_study_plan_id uuid, p_week_number integer
) returns void
  language plpgsql immutable set search_path = '' as $$
begin
  if p_batch.study_plan_id is distinct from p_study_plan_id
     or p_batch.week_number is distinct from p_week_number then
    raise exception 'Este pedido já foi usado para outra semana. Monte a prévia de novo.';
  end if;
end;
$$;

-- A prévia. Definer porque o critério mora em `app_private`, que o cliente não
-- executa (07_schema, teste 04); por isso confere o dono à mão.
create or replace function public.week_replacement_preview(p_study_plan_id uuid, p_week_number integer)
  returns table (goals_total integer, goals_preserved integer)
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if not exists (
    select 1 from public.study_plans p
     where p.id = p_study_plan_id and p.teacher_id = v_uid
       and public.is_teacher() and public.is_teacher_of(p.student_id)
  ) then
    raise exception 'Somente o professor do aluno vê a prévia da semana dele.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select count(*)::integer,
           (count(*) filter (where app_private.goal_is_preserved(g.id, g.status)))::integer
      from public.goals g
     where g.study_plan_id = p_study_plan_id and g.week_number = p_week_number;
end;
$$;

-- GERAR A SEMANA NUMA TRANSAÇÃO. Devolve `true` quando foi replay.
create or replace function public.generate_week(
  p_request_id    uuid,
  p_study_plan_id uuid,
  p_week_number   integer,
  p_goals         jsonb
) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_plan public.study_plans%rowtype;
  v_seen public.goal_batches%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_request_id is null then
    raise exception 'request_id é obrigatório.';
  end if;
  if p_week_number is null or p_week_number not between 1 and 520 then
    raise exception 'A semana precisa ser um número inteiro de 1 a 520.';
  end if;
  if p_goals is null or jsonb_typeof(p_goals) <> 'array' or jsonb_array_length(p_goals) = 0 then
    raise exception 'A semana gerada precisa ter ao menos uma meta.';
  end if;

  -- Trava o plano: duas gerações (duas abas, ou a retentativa que chega com a
  -- primeira ainda rodando) passam uma de cada vez. `no key update` não
  -- bloqueia o `for key share` que a FK pega quando o aluno lança estudo extra.
  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.teacher_id = v_uid
   for no key update;

  if not found or not public.is_teacher() or not public.is_teacher_of(v_plan.student_id) then
    raise exception 'Somente o professor do aluno gera a semana dele.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O REPLAY vem DEPOIS da trava: a retentativa que esperou na linha do plano
  -- enxerga agora o lote que a primeira gravou.
  select * into v_seen from public.goal_batches b where b.id = p_request_id;
  if found then
    perform app_private.check_goal_batch_replay(v_seen, p_study_plan_id, p_week_number);
    return true;
  end if;

  begin
    insert into public.goal_batches (id, study_plan_id, teacher_id, student_id, week_number)
    values (p_request_id, v_plan.id, v_plan.teacher_id, v_plan.student_id, p_week_number);
  exception when unique_violation then
    -- Mesmo id para OUTRO plano, ao mesmo tempo: a trava não os serializou, a PK sim.
    select * into v_seen from public.goal_batches b where b.id = p_request_id;
    perform app_private.check_goal_batch_replay(v_seen, p_study_plan_id, p_week_number);
    return true;
  end;

  -- Sai só o que o critério não preserva. Se o aluno registrar numa destas
  -- metas entre o snapshot e o delete, `goal_entries_goal_fk` (no action) falha
  -- no fim do comando e nada muda.
  begin
    delete from public.goals g
     where g.study_plan_id = v_plan.id
       and g.week_number = p_week_number
       and not app_private.goal_is_preserved(g.id, g.status);
  exception when foreign_key_violation then
    raise exception 'O aluno registrou estudo numa destas metas enquanto a semana era gerada. Monte a prévia de novo.';
  end;

  -- Depois da MAIOR posição que sobrou no dia, e renumeradas por dia na ordem
  -- do lote. Contar as preservadas, como o adaptador fazia, colide.
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number,
    weekday, weekday_name, day_position, type, subject, title,
    description, lesson, block, planned_minutes, notebook_block_id
  )
  select v_plan.id, v_plan.teacher_id, v_plan.student_id, p_week_number,
         x.weekday, x.weekday_name,
         coalesce(kept.max_position, 0)
           + row_number() over (partition by x.weekday order by x.day_position nulls last, e.ord),
         x.type, x.subject, x.title,
         x.description, x.lesson, x.block, x.planned_minutes, x.notebook_block_id
    from jsonb_array_elements(p_goals) with ordinality as e(item, ord)
   cross join lateral jsonb_to_record(e.item) as x(
         weekday integer, weekday_name text, day_position integer,
         type public.goal_type, subject text, title text, description text,
         lesson text, block text, planned_minutes integer, notebook_block_id uuid)
    left join (
         select g.weekday, max(g.day_position) as max_position
           from public.goals g
          where g.study_plan_id = v_plan.id and g.week_number = p_week_number
          group by g.weekday
    ) kept on kept.weekday = x.weekday;

  return false;
end;
$$;

-- NATURALMENTE IDEMPOTENTE, sem request_id: só APAGA, e o critério é
-- reavaliado contra o estado atual sob a trava do plano. A segunda chamada não
-- acha o que apagar; uma chamada depois de o aluno registrar preserva a meta.
-- O pior caso (corrida com o registro) é segurado por `goal_entries_goal_fk`.
-- Apaga exatamente o que `generate_week` substituiria, e nada insere.
create or replace function public.clear_pending_goals(p_study_plan_id uuid, p_week_number integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_plan public.study_plans%rowtype;
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.teacher_id = v_uid
   for no key update;

  if not found or not public.is_teacher() or not public.is_teacher_of(v_plan.student_id) then
    raise exception 'Somente o professor do aluno limpa a semana dele.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.goals g
   where g.study_plan_id = v_plan.id
     and g.week_number = p_week_number
     and not app_private.goal_is_preserved(g.id, g.status);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- BUG-14: revogar de PUBLIC antes do grant nominal, inclusive nas de app_private,
-- que nascem executáveis pelo grantee vazio.
revoke all on function app_private.goal_is_preserved(uuid, public.goal_status)
  from public, anon, authenticated;
revoke all on function app_private.check_goal_batch_replay(public.goal_batches, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.week_replacement_preview(uuid, integer) from public, anon, authenticated;
revoke all on function public.generate_week(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.clear_pending_goals(uuid, integer) from public, anon, authenticated;

grant execute on function public.week_replacement_preview(uuid, integer) to authenticated;
grant execute on function public.generate_week(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.clear_pending_goals(uuid, integer) to authenticated;
