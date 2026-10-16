-- O login de quem excluiu a conta não pode ficar banido para sempre em `infinity`.
--
-- `delete_my_account` (20261015150000) gravava `auth.users.banned_until =
-- 'infinity'`. O GoTrue lê essa coluna como `time.Time` e não sabe ler
-- `infinity` ("unsupported Scan, storing driver.Value type string into type
-- *time.Time"): a partir da primeira conta excluída, `GET /auth/v1/user` e
-- `POST /auth/v1/logout` daquela conta davam 500, e `GET /auth/v1/admin/users`
-- falhava para TODOS os usuários — a tela Authentication → Users do Studio
-- inclusive. O app trata 5xx como "não deu para verificar a sessão" e nunca
-- desloga: quem tinha outra aba aberta ficava preso em "Sem conexão".
--
-- Cem anos é o que o próprio GoTrue usa para banir "para sempre" (`ban_duration`
-- em horas, nunca um instante infinito). A migration anterior está aplicada em
-- staging e congelada; esta redefine a função e conserta o que ela já gravou.
--
-- Compatível com o bundle no ar: a assinatura não muda, e a coluna só ganha um
-- valor que o GoTrue consegue ler.

-- ---------- 1. As contas já excluídas ----------
update auth.users
   set banned_until = now() + interval '100 years'
 where banned_until = 'infinity';

-- ---------- 2. A RPC, com a data finita ----------
-- O corpo é o de 20261015150000, linha a linha, exceto o `banned_until`.
create or replace function public.delete_my_account()
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
         banned_until = now() + interval '100 years',
         deleted_at = now()
   where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Apaga o que o aluno fez e anula o login; fica só o histórico sem identificação (liberações e notas de simulado). Idempotente por profiles.deleted_at.';
