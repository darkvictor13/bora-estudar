-- Anular uma bateria já finalizada (spec 16).
--
-- `quiz_sessions` é SELECT para `authenticated`, e o ledger é append-only: o
-- resultado errado de uma bateria ficava para sempre. Anular NÃO apaga nada — as
-- linhas de `quiz_session_questions` continuam lá, e o que muda é o status da
-- sessão. A função que a v96 chamava de `void_quiz_session` nunca foi portada
-- para o schema de 14/09/2026; esta é a nova.

-- O motivo é texto livre que o professor digita, e todo texto que chega ao banco
-- por uma RPC tem teto: `07_schema` varre as colunas gravadas por `authenticated`,
-- e esta é gravada por uma função de professor. A CHECK mede o valor GRAVADO.
alter table public.quiz_sessions
  add constraint quiz_sessions_void_reason_check check (char_length(void_reason) <= 500);

-- IDEMPOTÊNCIA — natural, e o que a sustenta é o estado final: a CHECK
-- `quiz_sessions_state_check` exige `voided_at` e `voided_by` em toda linha
-- `voided`, e a função devolve a sessão sem tocar em nada quando ela já está
-- `voided`. Isso vem ANTES de conferir o status de origem: a retentativa de quem
-- já anulou não pode receber "a bateria não está finalizada". A linha é travada
-- (`for update`) antes de ler o status, então dois cliques simultâneos se
-- serializam. Não há `request_id`: a tabela `operations` saiu do schema.
--
-- Quem pode: SÓ o professor responsável pela bateria (`teacher_id = auth.uid()`).
-- Bateria inexistente e bateria alheia dão o MESMO erro (42501), para a função
-- não servir de oráculo sobre quais ids existem.
--
-- O que a anulação desfaz, na mesma transação:
--   - a sessão vira `voided`, com quem, quando e o motivo;
--   - a meta que ela fechou volta a `pending`, com `completed_at` nulo, e pode
--     ser refeita: `quiz_sessions_goal_not_cancelled_uidx` ignora `voided`;
--   - o número visível do bloco é liberado, porque
--     `quiz_sessions_number_context_uidx` também ignora `voided`.
--
-- As colunas de saída têm prefixo `new_`: dentro do plpgsql, `RETURNS TABLE` cria
-- variáveis com o nome de cada coluna, e `status` ou `void_reason` soltos ficam
-- ambíguos contra as colunas das tabelas.
--
-- O gatilho `protect_goal_quiz_result` só deixa o status de uma meta de bateria
-- mudar para quem carrega a marca `app.quiz_rpc`, que é o que as RPCs do motor de
-- baterias levantam. É a mesma marca, só dentro desta função e só para este
-- UPDATE: o cliente não a levanta, porque `set_config` não é exposto pela API.
create function public.void_quiz_session(p_quiz_session_id uuid, p_reason text default null)
  returns table (new_status public.quiz_session_status, new_voided_at timestamptz, new_reason text)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_session public.quiz_sessions;
  v_reason  text := coalesce(nullif(btrim(p_reason), ''), 'Anulação administrativa');
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para anular uma bateria.' using errcode = '42501';
  end if;

  select * into v_session from public.quiz_sessions s where s.id = p_quiz_session_id for update;
  if not found or v_session.teacher_id <> v_uid or not public.is_teacher() then
    raise exception 'Somente o professor responsável anula esta bateria.' using errcode = '42501';
  end if;

  -- Já anulada: devolve o que está gravado, sem reescrever motivo nem data.
  if v_session.status = 'voided' then
    return query select v_session.status, v_session.voided_at, v_session.void_reason;
    return;
  end if;

  if v_session.status not in ('completed', 'awaiting_time') then
    raise exception 'Só uma bateria finalizada pode ser anulada.';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'O motivo pode ter até 500 caracteres.';
  end if;

  update public.quiz_sessions s
     set status = 'voided',
         voided_at = now(),
         voided_by = v_uid,
         void_reason = v_reason
   where s.id = v_session.id;

  if v_session.goal_id is not null then
    perform set_config('app.quiz_rpc', '1', true);
    update public.goals g
       set status = 'pending',
           completed_at = null
     where g.id = v_session.goal_id
       and g.status = 'completed';
    perform set_config('app.quiz_rpc', '', true);
  end if;

  return query
    select s.status, s.voided_at, s.void_reason from public.quiz_sessions s where s.id = v_session.id;
end;
$$;

revoke execute on function public.void_quiz_session(uuid, text) from public, anon;
grant execute on function public.void_quiz_session(uuid, text) to authenticated;

comment on function public.void_quiz_session(uuid, text) is
  'Anula uma bateria finalizada sem apagar o ledger, e devolve a meta a pending. Só o professor responsável. Idempotente pelo estado voided.';
