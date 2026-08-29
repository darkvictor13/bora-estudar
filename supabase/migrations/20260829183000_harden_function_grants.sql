-- =============================================================================
-- Endurecimento dos privilégios de função
-- =============================================================================
-- Corrige BUG-14, levantado por `supabase db advisors --linked` na primeira
-- montagem de staging e reproduzido igualmente no banco local.
--
-- Duas famílias de aviso, as duas de segurança. A terceira família do relatório
-- (`auth_rls_initplan`, ~30 policies que reavaliam auth.uid() por linha) é
-- desempenho e fica registrada em docs/bugs-encontrados.md, não corrigida aqui:
-- reescrever 31 policies é mudança de outra natureza e merece migration própria.


-- -----------------------------------------------------------------------------
-- 1. PUBLIC mantinha EXECUTE em toda função de `public`
-- -----------------------------------------------------------------------------
-- A migration inicial fez `revoke all on all functions ... from anon,
-- authenticated` e, na linha 1886, um revoke específico de reserve_operation
-- com o comentário "infraestrutura interna das RPCs, não API pública".
--
-- Nenhum dos dois alcançava o privilégio real. O default do Postgres concede
-- EXECUTE a PUBLIC, e PUBLIC não é `anon` nem `authenticated`: é o grantee
-- vazio, que os dois papéis herdam. O acl das 16 funções ficava `=X/postgres`,
-- e `reserve_operation` era chamável por qualquer autenticado.
--
-- Isso importa porque `operations` tem RLS de select apenas e nenhum
-- `grant insert`: reserve_operation é o ÚNICO caminho de escrita naquela
-- tabela. Aberta, ela permite a um aluno logado gravar linhas arbitrárias —
-- com `target_id` de sua escolha — e queimar um request_id com hash divergente,
-- fazendo o finish_quiz_session legítimo daquele id ser recusado com 23505.
--
-- Revogar de PUBLIC não afeta os grants nominais a `authenticated`, que são
-- outro grantee e continuam valendo. As 11 funções da API pública são
-- reconcedidas logo abaixo, de forma idempotente, para que este arquivo possa
-- ser lido sozinho como o estado final.

revoke execute on all functions in schema public from public;

grant execute on function
  public.activate_study_plan(uuid),
  public.apply_study_plan_batch(uuid, uuid, smallint, public.batch_mode, jsonb),
  public.start_quiz_session(uuid, uuid, uuid),
  public.finish_quiz_session(uuid, uuid, jsonb, boolean),
  public.record_quiz_session_time(uuid, uuid, integer),
  public.void_quiz_session(uuid, uuid, text),
  public.record_reinforcement(uuid, uuid, uuid[], uuid, jsonb),
  public.is_teacher(),
  public.is_teacher_of(uuid),
  public.is_admin(),
  public.can_view_context(uuid, uuid)
to authenticated;

-- As cinco restantes — reserve_operation e as quatro tg_* — ficam sem grant
-- para papel nenhum. Gatilho não precisa: o Postgres confere EXECUTE na criação
-- do trigger, e a execução corre por conta do dono da tabela.


-- -----------------------------------------------------------------------------
-- 2. search_path mutável em duas funções
-- -----------------------------------------------------------------------------
-- Todas as outras 14 declaram `set search_path = ''`. Estas duas escaparam, e
-- uma delas é o gatilho que sustenta o ledger append-only — a fonte única de
-- desempenho do sistema. Sem search_path fixo, quem controlar o search_path da
-- sessão pode resolver um nome não qualificado para um objeto próprio.
--
-- Nenhuma das duas referencia objeto de schema nenhum, então `= ''` é seguro:
-- `now()` é built-in, resolvida por pg_catalog, que está sempre no caminho.

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at is
  'Trigger BEFORE UPDATE: mantém updated_at. O client nunca escreve essa coluna.';

create or replace function public.tg_block_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'quiz_session_questions e append-only: % nao permitido', tg_op
    using errcode = '0A000';
end;
$$;
