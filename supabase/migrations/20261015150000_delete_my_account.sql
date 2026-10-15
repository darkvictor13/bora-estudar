-- Excluir a própria conta (spec 46).
--
-- Excluir NÃO é `delete from auth.users`. Cinco tabelas de histórico referenciam
-- `profiles` com ON DELETE RESTRICT (`access_grants`, `mock_exams`,
-- `mock_exam_results`, `mock_exam_subject_results`, `quiz_sessions`), de modo
-- que o DELETE falharia para todo aluno que já teve acesso liberado. A regra
-- aqui é outra: apagar TUDO o que o aluno fez, e deixar, sem identificar
-- ninguém, só o que serve de métrica — as liberações de acesso e as notas de
-- simulado. O perfil fica como registro "Conta excluída", e o login é anulado.
--
-- Por que o perfil FICA, e a FK `profiles.id -> auth.users` não é tocada:
-- remover essa FK para permitir um perfil sem login quebraria o que depende do
-- cascade (a limpeza do e2e, `truncate auth.users cascade` do `db:test`, os
-- scripts de operação). Anular o login mantém a FK e o cascade como estão, e é
-- o que o próprio GoTrue faz no soft delete (`deleted_at`, e-mail trocado,
-- identidades, sessões e fatores removidos).

-- ---------- 1. Marca de exclusão ----------
--
-- Nulável, sem default: compatível com o bundle que já está no ar. Fora de todo
-- grant de UPDATE (`authenticated` só atualiza `name`). O INSERT do cliente é
-- concedido na tabela inteira, então o gatilho zera a coluna também.
alter table public.profiles add column deleted_at timestamptz;

create or replace function public.protect_profile_admin_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  -- Quem está agindo sai do JWT, e só dele. O banco de origem testava
  -- `session_user = 'postgres'`, que numa conexão do PostgREST é sempre
  -- `authenticator` — a checagem dependia de como a conexão foi aberta. E
  -- `current_user` não serve: dentro de SECURITY DEFINER ele é o DONO da
  -- função, então daria privilegiado para todo mundo.
  --
  -- Sem JWT (migration, psql, seed) é trabalho de manutenção e passa;
  -- `service_role` passa; `authenticated` e `anon` são usuário final e não.
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Toda conta nasce aluno, pendente e sem professor. Papel, acesso e
    -- vínculo são concedidos por quem tem privilégio, nunca pelo próprio dono
    -- da linha.
    new.role := 'student';
    new.teacher_id := null;
    new.access_status := 'pending';
    new.access_expires_at := null;
    new.plan := null;
    new.coupon_used := null;
    new.access_origin := null;
    new.deleted_at := null;
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
    new.deleted_at := old.deleted_at;
  end if;

  return new;
end;
$$;

-- ---------- 2. Conta excluída não escreve mais ----------
--
-- O JWT de quem excluiu vale até expirar. `has_active_access()` já é falso (a
-- conta fica `suspended`), o que fecha toda escrita de execução; sobram as duas
-- escritas que NÃO pedem acesso vigente — o nome e a lista de espera — e que
-- recriariam, em segundos, o dado que acabou de ser apagado.
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);

alter policy waitlist_insert_student on public.waitlist
  with check (
    student_id = (select auth.uid())
    and status = 'waiting'
    and lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role = 'student'
         and p.deleted_at is null
         and not (p.teacher_id is distinct from waitlist.teacher_id)
    )
  );

-- ---------- 3. A RPC ----------
--
-- IDEMPOTÊNCIA — quem sustenta é `profiles.deleted_at`, com o estado final como
-- fato: preenchida, a retentativa devolve sem tocar em nada. Isso importa de
-- verdade aqui, porque o JWT sobrevive à exclusão por até uma hora. A linha do
-- perfil é travada (`for update`) ANTES da leitura de `deleted_at`, então duas
-- chamadas simultâneas se serializam em vez de apagar duas vezes.
--
-- SECURITY DEFINER: apaga o que o cliente não tem grant para apagar (o ledger
-- de baterias não tem DELETE para ninguém) e escreve em `auth`.
--
-- O gatilho `protect_profile_admin_fields` reverte `teacher_id`, o acesso e o
-- plano quando QUEM escreve é o dono da linha — que é exatamente o caso. Para
-- este UPDATE, e só ele, o papel do JWT passa a `service_role` e volta ao que
-- era logo depois. O cliente não consegue o mesmo: `set_config` não é exposto
-- pela API, e a troca nunca atravessa o fim da função.
--
-- A lista de tabelas é EXPLÍCITA, e não um laço sobre o catálogo, para que cada
-- uma esteja à vista de quem revisa. A suíte 07 compara o catálogo de FKs para
-- `profiles` com as duas listas (apagadas e retidas) e reprova a tabela nova
-- que não esteja em nenhuma.
--
-- APAGADAS: quiz_session_questions, quiz_sessions, reinforcement_cycles,
--   flashcard_marks, flashcard_reviews, library_flashcard_reviews, law_marks,
--   summary_annotations, personal_flashcard_decks (e os cartões, revisões e
--   marcas pessoais, por cascade), theory_reviews (e theory_review_entries),
--   theory_progress, goal_entries, goals, study_plan_theory_catalogs,
--   study_plan_notebooks, study_plans (e goal_batches, por cascade),
--   class_students, waitlist.
-- RETIDAS, sem identificar ninguém: access_grants, mock_exam_results,
--   mock_exam_subject_results. (`mock_exams` é do professor, não do aluno.)
create function public.delete_my_account()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile public.profiles;
  v_claims  text;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para excluí-la.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;

  -- Já excluída: nada a fazer, e nada a acusar.
  if v_profile.deleted_at is not null then
    return;
  end if;

  if v_profile.role <> 'student' then
    raise exception 'A conta de professor não é excluída por aqui. Fale com o suporte.'
      using errcode = '42501';
  end if;

  -- O que o aluno fez. Ordem: o que as FKs RESTRICT seguram primeiro, as metas
  -- só depois dos registros delas, e o planejamento por último.
  delete from public.quiz_session_questions where student_id = v_uid;
  delete from public.quiz_sessions           where student_id = v_uid;
  delete from public.reinforcement_cycles    where student_id = v_uid;

  delete from public.flashcard_marks            where student_id = v_uid;
  delete from public.flashcard_reviews          where student_id = v_uid;
  delete from public.library_flashcard_reviews  where student_id = v_uid;
  delete from public.law_marks                  where student_id = v_uid;
  delete from public.summary_annotations        where user_id    = v_uid;
  delete from public.personal_flashcard_decks   where student_id = v_uid;

  delete from public.theory_review_entries where student_id = v_uid;
  delete from public.theory_reviews        where student_id = v_uid;
  delete from public.theory_progress       where student_id = v_uid;

  delete from public.goal_entries               where student_id = v_uid;
  delete from public.goals                      where student_id = v_uid;
  delete from public.study_plan_theory_catalogs where student_id = v_uid;
  delete from public.study_plan_notebooks       where student_id = v_uid;
  delete from public.study_plans                where student_id = v_uid;

  delete from public.class_students where student_id = v_uid;
  delete from public.waitlist       where student_id = v_uid;

  -- O perfil vira o registro anônimo que as tabelas retidas apontam.
  v_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  update public.profiles
     set name = 'Conta excluída',
         teacher_id = null,
         access_status = 'suspended',
         access_expires_at = null,
         plan = null,
         coupon_used = null,
         access_origin = null,
         theme_preference = null,
         deleted_at = now()
   where id = v_uid;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  -- O login deixa de existir. Mesmo conjunto do soft delete do GoTrue.
  delete from auth.identities       where user_id = v_uid;
  delete from auth.sessions         where user_id = v_uid;
  delete from auth.refresh_tokens   where user_id = v_uid::text;
  delete from auth.mfa_factors      where user_id = v_uid;
  delete from auth.one_time_tokens  where user_id = v_uid;
  delete from auth.audit_log_entries
   where payload ->> 'actor_id' = v_uid::text
      or payload -> 'traits' ->> 'user_id' = v_uid::text;

  update auth.users
     set email = 'conta-excluida-' || v_uid::text || '@excluida.invalid',
         phone = null,
         encrypted_password = null,
         raw_user_meta_data = '{}'::jsonb,
         last_sign_in_at = null,
         banned_until = 'infinity',
         deleted_at = now()
   where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Apaga o que o aluno fez e anula o login; fica só o histórico sem identificação (liberações e notas de simulado). Idempotente por profiles.deleted_at.';
