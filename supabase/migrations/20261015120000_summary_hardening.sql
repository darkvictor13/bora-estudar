-- Resumos flash: três correções sobre 20261012205121 e 20261012212626.
-- Migration nova, e não edição das anteriores: o congelamento vale para o que
-- já foi escrito, mesmo que o arquivo não tenha chegado a staging.

-- ---------- 1. O bucket deixa de expor o que não é imagem do resumo ----------
--
-- `summary_assets_read` liberava o bucket INTEIRO a qualquer aluno com acesso
-- vigente, e a carga sobe o `.docx` original para ele (`pf2029/source.docx`):
-- o arquivo pessoal de quem importou ficava baixável por todos. A policy passa
-- a nomear o que se lê: `pf2029/<sha256>.<imagem>`, que é a chave que o
-- importador gera. O original continua guardado, e só o service_role o lê.
drop policy summary_assets_read on storage.objects;
create policy summary_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'flash-summaries'
    and name ~ '^pf2029/[0-9a-f]{64}\.(png|jpe?g|jfif)$'
    and ((select public.has_active_access()) or (select public.is_teacher()))
  );

-- O bucket também passa a recusar o que o importador nunca envia.
update storage.buckets
   set allowed_mime_types = array[
         'image/png', 'image/jpeg',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'flash-summaries';

-- ---------- 2. Salvar anotações sem pôr o conteúdo na URL ----------
--
-- O adaptador comparava o estado anterior com `.eq("notes", JSON.stringify(...))`,
-- e o PostgREST leva o filtro na query string: o teto de 2 MB da coluna cabia no
-- banco e não cabia na URL, que os proxies cortam perto de 8 KB. A comparação
-- vai para o corpo da requisição, numa função.
--
-- IDEMPOTÊNCIA — quem sustenta é a PK (user_id, topic_id), com UMA linha por
-- aluno e tópico, e o estado final como fato: se a linha já guarda `p_next`, a
-- retentativa de quem já gravou devolve `true` em vez de acusar conflito contra
-- o próprio resultado. A busca vem ANTES da checagem de acesso, como nas outras
-- RPCs: gravou, o acesso venceu, a retentativa responde "gravado".
--
-- SECURITY INVOKER: a RLS de `summary_annotations` continua decidindo, e
-- `auth.uid()` é o único dono possível da linha.
create function public.save_summary_notes(
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

revoke execute on function public.save_summary_notes(text, jsonb, jsonb) from public, anon;
grant execute on function public.save_summary_notes(text, jsonb, jsonb) to authenticated;

comment on function public.save_summary_notes(text, jsonb, jsonb) is
  'Grava as anotações do aluno num tópico se o estado anterior ainda for o do banco. Devolve false em conflito.';
