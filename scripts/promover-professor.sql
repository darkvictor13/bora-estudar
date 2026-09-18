-- =============================================================================
-- Promover uma conta a professor
-- =============================================================================
-- Recebe UM e-mail, de alguém que já se cadastrou pelo site, e grava
-- `profiles.role = 'teacher'`.
--
-- POR QUE ISTO NÃO É A TELA.
--
-- Das três operações privilegiadas que o produto não faz, promover é a única
-- que nem sequer está especificada: a spec 13 a manda para spec própria porque
-- abrir isso exige decidir se nasce um papel `admin` em `user_role` —
-- migration de enum, mais policies, e a pergunta de quem concede o primeiro.
-- Até lá, promover é o `update` que o comentário de
-- `20260914190000_profile_on_signup.sql` documenta, e este arquivo é esse
-- update com as conferências que ele não tem.
--
-- `create_profile_for_new_user` ignora o `role` do metadado de propósito:
-- `raw_user_meta_data` é escrito pelo CLIENTE na chamada de cadastro, e quem
-- mandasse `{"role":"teacher"}` nasceria professor. Toda conta nasce ALUNO,
-- PENDENTE e sem professor.
--
-- COMO ELE CONSEGUE ESCREVER. `profiles.role` está fora de todo `GRANT UPDATE`
-- e `protect_profile_admin_fields` congela o campo para o dono da linha — mas
-- o gatilho decide quem age pelo JWT, e rodando como DONO DO BANCO não há JWT
-- nenhum: a sessão é tratada como manutenção e passa. É a mesma porta que
-- `supabase/seed.sql` e `scripts/turma-de-teste.sql` usam. Nada aqui afrouxa
-- grant nem policy.
--
-- O QUE ELE RECUSA FAZER, e é por isso que existe em vez do `update` cru:
--
--   * promover quem tem DADO DE ALUNO — planejamento, meta, registro, bateria,
--     progresso de teoria ou matrícula em turma. `study_plans.student_id`
--     apontando para um professor é linha que nenhuma tela sabe explicar, e o
--     estrago não sai por `delete`: `quiz_sessions` referencia `profiles` com
--     ON DELETE RESTRICT de propósito;
--   * promover quem é aluno de alguém. Um perfil com `role = 'teacher'` e
--     `teacher_id` preenchido continua satisfazendo `is_teacher_of()`, ou
--     seja: um professor que outro professor enxerga e escreve;
--   * promover e-mail sem conta. A pessoa se cadastra pelo site primeiro, para
--     que a senha seja dela e o e-mail, confirmado por ela.
--
-- IDEMPOTENTE. Rodar de novo com quem já é professor não escreve nada.
--
-- COMO RODAR: edite `v_email` e cole o arquivo inteiro no SQL Editor do
-- projeto, ou `node scripts/rodar-sql.mjs promover-professor.sql`.
--
-- @ambiente: qualquer
--   Vale contra qualquer ambiente, inclusive produção: ao contrário de
--   `turma-de-teste.sql`, este não cria conta nenhuma e não inventa dado.
--
-- COMO DESFAZER: a última seção deste arquivo, comentada.
-- =============================================================================

do $$
declare
  -- ---------------------------------------------------------------------
  -- EDITE AQUI
  -- ---------------------------------------------------------------------
  v_email text := 'professora@exemplo.com';

  v_id      uuid;
  v_contas  integer;
  v_perfil  record;
  v_dados   text;
  v_fila    integer;
begin
  v_email := lower(btrim(coalesce(v_email, '')));
  if v_email = '' then
    raise exception 'informe o e-mail em v_email';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. A conta
  --
  -- Contando antes de ler: o e-mail é único no GoTrue, mas a unicidade é
  -- parcial em algumas versões (conta apagada continua na tabela). Um
  -- `select ... into` mudo escolheria uma das duas em silêncio.
  -- ---------------------------------------------------------------------
  select count(*) into v_contas
    from auth.users u
   where lower(btrim(u.email)) = v_email;

  if v_contas = 0 then
    raise exception 'nao existe conta com o e-mail %. A pessoa precisa se cadastrar pelo site antes.', v_email;
  end if;

  if v_contas > 1 then
    raise exception 'existe mais de uma conta com o e-mail %. Resolva a duplicidade antes de promover.', v_email;
  end if;

  select u.id into v_id
    from auth.users u
   where lower(btrim(u.email)) = v_email;

  -- O perfil nasce com a conta desde a `20260914190000`, e a mesma migration
  -- criou o que faltava para trás. Não achar aqui é sinal de gatilho ausente,
  -- não de conta nova.
  select p.role, p.teacher_id, p.name into v_perfil
    from public.profiles p
   where p.id = v_id;

  if not found then
    raise exception 'a conta % existe no GoTrue e nao tem perfil. O gatilho create_profile_for_new_user esta ausente neste ambiente.', v_email;
  end if;

  -- O id fica na sessão para a conferência do fim do arquivo achá-lo sem
  -- repetir o e-mail: parâmetro digitado duas vezes é parâmetro que diverge.
  perform set_config('bora.conta', v_id::text, false);

  if v_perfil.role = 'teacher' then
    raise notice '% ja e professor. Nada a fazer.', v_email;
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- 2. As duas recusas
  -- ---------------------------------------------------------------------
  if v_perfil.teacher_id is not null then
    raise exception 'a conta % e aluno de outro professor. Desvincular e regra de produto que ainda nao existe: use outra conta para o professor.', v_email;
  end if;

  select string_agg(format('%s (%s)', d.tabela, d.linhas), ', ' order by d.tabela)
    into v_dados
    from (
      select 'study_plans' as tabela, count(*) as linhas
        from public.study_plans where student_id = v_id
      union all select 'goals',           count(*) from public.goals           where student_id = v_id
      union all select 'goal_entries',    count(*) from public.goal_entries    where student_id = v_id
      union all select 'quiz_sessions',   count(*) from public.quiz_sessions   where student_id = v_id
      union all select 'theory_progress', count(*) from public.theory_progress where student_id = v_id
      union all select 'theory_reviews',  count(*) from public.theory_reviews  where student_id = v_id
      union all select 'class_students',  count(*) from public.class_students  where student_id = v_id
    ) d
   where d.linhas > 0;

  if v_dados is not null then
    raise exception 'a conta % tem dado de aluno (%). Promove-la deixaria essas linhas apontando para um professor, e quiz_sessions referencia profiles com ON DELETE RESTRICT: nem apagar resolve. Use outra conta.', v_email, v_dados;
  end if;

  -- ---------------------------------------------------------------------
  -- 3. A promoção
  --
  -- `access_status = 'active'` é o que o comentário da `20260914190000`
  -- documenta, e fica. Não é exigência de ninguém hoje: `hasAccess` em
  -- `apps/web/src/lib/auth/session.ts` já é verdadeiro para quem não é aluno,
  -- e `has_active_access()` só entra em WITH CHECK onde quem escreve é o
  -- ALUNO. Deixar pendente seria apostar que isso não muda.
  --
  -- `updated_at` não entra: é mantido pelo gatilho `set_updated_at`, que
  -- existe em toda tabela que tem a coluna.
  -- ---------------------------------------------------------------------
  update public.profiles
     set role              = 'teacher',
         teacher_id        = null,
         access_status     = 'active',
         access_expires_at = null,
         plan              = null,
         coupon_used       = null
   where id = v_id;

  -- A inscrição na lista de espera NÃO é apagada: é dado da pessoa, e apagar
  -- não tem volta. O efeito de deixá-la, dito em voz alta: enquanto
  -- `waitlist_select` mostrar a fila sem dono a qualquer professor (R-VINC-23
  -- fecha isso), o recém-promovido vê a própria inscrição na fila dele.
  select count(*) into v_fila
    from public.waitlist w
   where w.student_id = v_id;

  if v_fila > 0 then
    raise notice 'A conta tem inscricao na lista de espera, e ela ficou. Para remover: delete from public.waitlist where student_id = ''%'';', v_id;
  end if;

  raise notice '% agora e professor.', v_email;
end $$;

-- =============================================================================
-- Conferência
-- =============================================================================
-- A conta que o bloco acima tocou, e o tamanho do corpo docente depois dela.
-- Linha vazia, ou `papel` diferente de `teacher`, é o bloco não ter terminado o
-- que prometeu.
--
-- Uma linha só, e não a lista inteira de professores: numa base que já rodou a
-- suíte e2e são centenas, e a conferência viraria rolagem.

select
  p.name                                                             as conta,
  u.email,
  p.role::text                                                       as papel,
  p.access_status::text                                              as acesso,
  (select count(*) from public.profiles a where a.teacher_id = p.id) as alunos,
  (select count(*) from public.classes  c where c.teacher_id = p.id) as turmas,
  (select count(*) from public.profiles t where t.role = 'teacher')  as professores_na_base
from public.profiles p
join auth.users u on u.id = p.id
where p.id::text = current_setting('bora.conta', true);

-- =============================================================================
-- Como desfazer
-- =============================================================================
-- Rebaixar devolve o papel e o acesso ao estado de quem acabou de se cadastrar.
-- O que o script não criou — planejamento, disciplina, catálogo, turma — ele
-- também não desfaz; se o professor já trabalhou, rebaixar deixa esse acervo
-- apontando para um aluno:
--
--   update public.profiles
--      set role = 'student', access_status = 'pending', access_expires_at = null
--    where id = (select id from auth.users where lower(btrim(email)) = 'professora@exemplo.com');
