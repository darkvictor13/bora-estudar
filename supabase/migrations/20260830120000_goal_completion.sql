-- Conclusão de meta sem bateria — spec docs/specs/12-conclusao-de-meta.md
--
-- O aluno não tinha como dizer que estudou. Três das cinco metas semanais do
-- seed — duas de teoria e uma de estudo extra — ficavam `pending` para sempre,
-- porque nenhuma action escreve em `goals` e o aluno não tem grant nessa tabela.
-- Com isso, "X de Y metas concluídas" e o progresso na ficha do professor
-- descreviam o produto, não o aluno.
--
-- A escolha central está em R-CONC-01: concluir meta é EXECUÇÃO, porque move
-- `goals.status` — a mesma coluna que `record_quiz_session_time` e
-- `void_quiz_session` escrevem. Vai por RPC. A alternativa barata seria um
-- `grant update (status, completed_at, spent_minutes, student_note)` para o
-- aluno; ela abriria um segundo caminho de escrita para a mesma coluna e
-- deixaria fechar uma meta `question_block` sem nenhuma linha no ledger, que é
-- o estado que `quiz_session_goal_uidx` e a máquina de estados da bateria
-- existem para tornar inexprimível.
--
-- Compatível com o bundle que já está no ar: a coluna nasce nullable e sem
-- default, as duas `check` incidem sobre colunas que nenhum arquivo do site ou
-- da extensão escreve hoje, a view mantém nome, tipo e posição de todas as
-- colunas, e as duas funções são novas — não substituem nenhuma.

-- =============================================================================
-- 1. COLUNA E CONSTRAINTS
-- =============================================================================

alter table public.goals add column if not exists spent_minutes integer;

comment on column public.goals.spent_minutes is
  'Tempo declarado pelo aluno em meta SEM bateria. Meta de bateria tira o tempo de quiz_sessions.duration_minutes.';

-- 240 minutos é o teto da v96 (`interpretarTempoRegistro`, aluno.js:2748).
-- `record_quiz_session_time` continua aceitando até 1440 para bateria: alinhar
-- os dois é mudança na spec 05, já implantada. Ver R-CONC-10.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'goal_spent_minutes_range'
  ) then
    alter table public.goals add constraint goal_spent_minutes_range
      check (spent_minutes is null or spent_minutes between 1 and 240);
  end if;
end;
$$;

-- `student_note` é o ÚNICO campo de texto livre desta feature: texto que humano
-- escreve para humano ler. O limite é higiene — era num campo assim que a v96
-- codificava `TIPO_REFORCO:1` e o resultado da bateria em base64.
-- A coluna existe desde a migration inicial e nenhuma tela jamais a escreveu,
-- então a constraint valida contra zero linhas preenchidas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'goal_student_note_length'
  ) then
    alter table public.goals add constraint goal_student_note_length
      check (student_note is null or length(student_note) <= 2000);
  end if;
end;
$$;

-- =============================================================================
-- 2. A VIEW PASSA A ENXERGAR O TEMPO DECLARADO
-- =============================================================================
-- `minutes_spent` vira o tempo da bateria quando há bateria e o tempo declarado
-- quando não há. Nome, tipo e posição não mudam — `sum(integer)` é bigint e
-- `coalesce(bigint, integer)` continua bigint —, então `create or replace`
-- basta; inserir coluna no meio exigiria `drop` e `create`.
--
-- `with (security_invoker = true)` é REPETIDO de propósito: `create or replace
-- view` não herda as opções da view anterior, e sem ele a view voltaria a rodar
-- com privilégio do dono e vazaria dado entre alunos.
--
-- `questions_answered` e `correct_answers` continuam vindo só do ledger e
-- continuam 0 para meta sem bateria: meta de teoria não tem desempenho, tem
-- tempo (R-CONC-19).
create or replace view public.vw_goal_performance
with (security_invoker = true) as
select
  g.id            as goal_id,
  g.student_id,
  g.teacher_id,
  g.study_plan_id,
  g.status,
  coalesce(sum(d.main_count), 0)   as questions_answered,
  coalesce(sum(d.main_correct), 0) as correct_answers,
  coalesce(sum(s.duration_minutes), g.spent_minutes) as minutes_spent
from public.goals g
left join public.quiz_sessions s
       on s.goal_id = g.id and s.status = 'completed'
left join public.vw_quiz_session_performance d
       on d.quiz_session_id = s.id
where g.deleted_at is null
group by g.id;

-- =============================================================================
-- 3. CONCLUIR
-- =============================================================================
-- Idempotência COM PAYLOAD: `request_id` + `reserve_operation`, com hash de
-- (goal_id, minutos, observação). Mesmo id e mesmo payload devolvem o estado
-- anterior sem reexecutar; payload diferente é recusado com 23505.
create or replace function public.complete_goal(
  p_goal_id       uuid,
  p_request_id    uuid,
  p_spent_minutes integer,
  p_note          text default null
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_goal        public.goals%rowtype;
  v_note        text := nullif(btrim(coalesce(p_note, '')), '');
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  if p_spent_minutes is null or p_spent_minutes < 1 or p_spent_minutes > 240 then
    raise exception 'tempo em minutos deve estar entre 1 e 240';
  end if;
  if length(coalesce(v_note, '')) > 2000 then
    raise exception 'observacao passa de 2000 caracteres';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'complete_goal', p_goal_id,
    p_goal_id::text || '|' || p_spent_minutes::text || '|' || coalesce(v_note, '')
  );

  select * into v_goal from public.goals g
   where g.id = p_goal_id and g.deleted_at is null
   for update;
  if not found then raise exception 'meta nao encontrada'; end if;
  if v_goal.student_id <> v_uid then
    raise exception 'somente o aluno pode concluir a propria meta' using errcode='42501';
  end if;

  -- Replay: devolve o estado atual sem regravar nada.
  if not v_reservation.reserved then return v_goal; end if;

  -- Meta de bateria conclui-se pela bateria. Sem esta linha, o aluno fecharia
  -- uma meta de questões sem nenhuma linha em quiz_session_questions.
  if v_goal.type = 'question_block' then
    raise exception 'meta de bateria conclui-se pela bateria';
  end if;

  if not exists (
    select 1 from public.study_plans p
     where p.id = v_goal.study_plan_id and p.status = 'active' and p.deleted_at is null
  ) then
    raise exception 'planejamento nao esta active';
  end if;

  -- `in_progress` só existe para meta de bateria, posto por start_quiz_session;
  -- `skipped` e `cancelled` não têm quem os escreva. Só `pending` conclui.
  if v_goal.status <> 'pending' then
    raise exception 'meta nao esta pendente (status %)', v_goal.status;
  end if;

  update public.goals
     set status        = 'completed',
         completed_at  = now(),
         spent_minutes = p_spent_minutes,
         student_note  = v_note
   where id = p_goal_id
   returning * into v_goal;

  update public.operations
     set result = jsonb_build_object('goal_id', p_goal_id, 'status', 'completed')
   where request_id = p_request_id;

  return v_goal;
end;
$$;

comment on function public.complete_goal(uuid, uuid, integer, text) is
  'Conclui meta que não seja de bateria. Idempotente por request_id + reserve_operation (payload: goal_id|minutos|observacao).';

-- =============================================================================
-- 4. DESFAZER
-- =============================================================================
-- Idempotência COM PAYLOAD: o payload é só o goal_id, mas a operação continua
-- passando por `reserve_operation` — é ela que faz o duplo clique devolver o
-- estado em vez de reabrir uma meta que já foi concluída de novo no intervalo.
create or replace function public.reopen_goal(
  p_goal_id    uuid,
  p_request_id uuid
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_goal        public.goals%rowtype;
  v_sessions    integer;
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'reopen_goal', p_goal_id, p_goal_id::text
  );

  select * into v_goal from public.goals g
   where g.id = p_goal_id and g.deleted_at is null
   for update;
  if not found then raise exception 'meta nao encontrada'; end if;
  if v_goal.student_id <> v_uid then
    raise exception 'somente o aluno pode reabrir a propria meta' using errcode='42501';
  end if;

  if not v_reservation.reserved then return v_goal; end if;

  if v_goal.type = 'question_block' then
    raise exception 'meta de bateria reabre-se pela anulacao da bateria';
  end if;

  -- Cinto e suspensório (R-CONC-06). A linha acima já barra `question_block`;
  -- esta torna impossível reabrir por engano uma meta que tenha ledger atrás
  -- dela, qualquer que seja o tipo. Cancelada e anulada não contam, que é o
  -- mesmo critério de `quiz_session_goal_uidx`.
  select count(*) into v_sessions
    from public.quiz_sessions b
   where b.goal_id = p_goal_id and b.status not in ('cancelled','voided');
  if v_sessions > 0 then
    raise exception 'meta com bateria registrada reabre-se pela anulacao da bateria';
  end if;

  if not exists (
    select 1 from public.study_plans p
     where p.id = v_goal.study_plan_id and p.status = 'active' and p.deleted_at is null
  ) then
    raise exception 'planejamento nao esta active';
  end if;

  if v_goal.status <> 'completed' then
    raise exception 'meta nao esta concluida (status %)', v_goal.status;
  end if;

  -- `student_note` é PRESERVADA de propósito (R-CONC-13): o que o aluno
  -- escreveu sobre o estudo continua valendo; o que se desfaz é a afirmação de
  -- que terminou.
  update public.goals
     set status        = 'pending',
         completed_at  = null,
         spent_minutes = null
   where id = p_goal_id
   returning * into v_goal;

  update public.operations
     set result = jsonb_build_object('goal_id', p_goal_id, 'status', 'pending')
   where request_id = p_request_id;

  return v_goal;
end;
$$;

comment on function public.reopen_goal(uuid, uuid) is
  'Devolve a pendente uma meta concluída que não seja de bateria. Idempotente por request_id + reserve_operation (payload: goal_id).';

-- =============================================================================
-- 5. GRANTS
-- =============================================================================
-- O default do Postgres concede EXECUTE a PUBLIC, que não é `anon` nem
-- `authenticated`: revogar dos dois papéis não tiraria nada, porque o
-- privilégio vem do grantee vazio que ambos herdam. Foi assim que
-- `reserve_operation` ficou chamável por qualquer autenticado — BUG-14.
revoke execute on function public.complete_goal(uuid, uuid, integer, text) from public;
revoke execute on function public.reopen_goal(uuid, uuid)                   from public;

grant execute on function
  public.complete_goal(uuid, uuid, integer, text),
  public.reopen_goal(uuid, uuid)
to authenticated;

-- Nenhum grant novo em `goals`. A tabela continua com insert/update apenas para
-- o professor, restrita por WITH CHECK e por grant de coluna, e sem DELETE para
-- ninguém.
