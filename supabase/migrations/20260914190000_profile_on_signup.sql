-- O perfil nasce com a conta.
--
-- O PROBLEMA QUE ESTA MIGRATION FECHA
--
-- `20260914150000_initial_schema.sql` não portou `bora_criar_perfil_novo_aluno()`,
-- o gatilho de `auth.users` que criava a linha em `profiles`. Sem ele o
-- cadastro criava o usuário no GoTrue e parava aí: `currentSession()` lia
-- `profiles` pelo `auth.uid()`, não achava nada, e a pessoa que tinha acabado
-- de confirmar o e-mail lia "Entramos, mas seu perfil não foi encontrado." —
-- com a conta funcionando no GoTrue e o produto inteiro fechado.
--
-- Estava registrado como pendência em `docs/de-para-schema.md` ("o primeiro
-- item a resolver antes de qualquer tela de cadastro funcionar"), e o
-- `test.fixme` de `F-AUTH-08` em `apps/e2e/tests/auth.spec.ts` era o lugar onde
-- a falta continuava visível. Os dois saem junto com esta migration.
--
-- A DECISÃO DE PRODUTO QUE FALTAVA: A QUAL PROFESSOR O ALUNO É ANEXADO
--
-- O gatilho de origem anexava quem se cadastrava ao professor MAIS ANTIGO da
-- base — uma regra que ninguém escolheu, que dependia da ordem de criação das
-- contas e que entregava os dados de um aluno a quem por acaso tivesse entrado
-- primeiro. Aqui ela morre: **o perfil nasce sem professor**. O vínculo é ato
-- de alguém, não efeito colateral de um `order by created_at limit 1`.
--
-- A consequência é a lista de espera, que passa a aceitar inscrição SEM
-- vínculo — `waitlist.teacher_id` deixa de ser `not null`. É a fila de quem
-- ainda não tem professor, que é exatamente o estado de quem acabou de se
-- cadastrar.
--
-- O QUE O GATILHO NÃO FAZ, E POR QUÊ
--
-- Não lê `role` do metadado. `raw_user_meta_data` é escrito pelo CLIENTE na
-- chamada de cadastro: quem mandasse `{"role":"teacher"}` nasceria professor,
-- e professor enxerga aluno. Toda conta nasce ALUNO e PENDENTE aqui, e promover
-- é trabalho privilegiado — o mesmo lugar onde liberar acesso já mora. O
-- `name` vem do metadado porque é o nome da própria pessoa, que ela já pode
-- alterar pelo `grant update (name)`.

-- ---------------------------------------------------------------------------
-- O gatilho
-- ---------------------------------------------------------------------------

-- `security definer` não é conveniência: quem insere em `auth.users` é o
-- `supabase_auth_admin`, e ele não tem — nem deve ter — grant em
-- `public.profiles`. O dono da função é quem escreve.
--
-- AFTER, e não BEFORE: `profiles.id` referencia `auth.users(id)`, e num BEFORE
-- a linha do usuário ainda não existe para a FK conferir.
create or replace function app_private.create_profile_for_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  -- `on conflict do nothing` para o caso de alguém já ter criado o perfil
  -- (o seed, uma rotina administrativa): o gatilho completa, não sobrescreve.
  insert into public.profiles (id, name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function app_private.create_profile_for_new_user() is
  'Cria a linha em `profiles` quando uma conta nasce no GoTrue. Sempre aluno, sempre pendente, sempre sem professor.';

create trigger create_profile_for_new_user
  after insert on auth.users
  for each row execute function app_private.create_profile_for_new_user();

-- O schema `app_private` não tem `alter default privileges`, então a função
-- nova nasce executável pelo grantee vazio — o mesmo buraco do BUG-14, que o
-- `revoke ... from public` do arquivo anterior fechou para as funções que
-- existiam ATÉ ali. Esta precisa do seu.
revoke all on function app_private.create_profile_for_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- As contas que já existem sem perfil
-- ---------------------------------------------------------------------------
--
-- Staging acumulou contas criadas entre a migration de 14/09 e esta: elas
-- entram no GoTrue e batem na mesma parede. Todas viram ALUNO PENDENTE, sem
-- professor — inclusive as que pediram `{"role":"teacher"}` no metadado, pelo
-- mesmo motivo que o gatilho não lê o campo. Promover quem for professor é um
-- `update` deliberado, feito por quem tem a chave:
--
--   update public.profiles set role = 'teacher', access_status = 'active'
--    where id = (select id from auth.users where email = 'quem@for.com');
insert into public.profiles (id, name)
select u.id, nullif(btrim(coalesce(u.raw_user_meta_data ->> 'name', '')), '')
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null;

-- ---------------------------------------------------------------------------
-- A lista de espera sem professor
-- ---------------------------------------------------------------------------

alter table public.waitlist alter column teacher_id drop not null;

comment on column public.waitlist.teacher_id is
  'Nulo enquanto ninguém assumiu a inscrição: é o estado de quem acabou de se cadastrar.';

-- `p.teacher_id = waitlist.teacher_id` recusava a inscrição sem vínculo, e não
-- por regra: `null = null` é `null`, e um WITH CHECK que não é `true` barra. O
-- `is not distinct from` mantém a regra que importa — a inscrição é na lista do
-- professor a que a pessoa está ligada, e de ninguém mais — e deixa passar o
-- par nulo/nulo.
drop policy waitlist_insert_student on public.waitlist;
create policy waitlist_insert_student on public.waitlist for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'waiting'
    and lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role = 'student'
         and p.teacher_id is not distinct from waitlist.teacher_id
    )
  );

-- Sem esta cláusula a inscrição sem professor não apareceria para NINGUÉM além
-- de quem a escreveu, e a fila de entrada seria invisível por construção.
--
-- O preço, dito em voz alta: enquanto `user_role` não tiver 'admin', "quem
-- cuida da fila" é todo mundo que é professor — os dois leem nome, e-mail,
-- WhatsApp e nascimento de quem ainda não é aluno de ninguém. É aceitável
-- porque a fila é justamente o que não tem dono; deixa de ser no dia em que a
-- inscrição ganhar um, e aí esta cláusula sai.
drop policy waitlist_select on public.waitlist;
create policy waitlist_select on public.waitlist for select to authenticated
  using (
    student_id = (select auth.uid())
    or (public.is_teacher() and (teacher_id = (select auth.uid()) or teacher_id is null))
  );

-- `protect_waitlist_identity` congelava o vínculo para TODO MUNDO, sem exceção
-- de manutenção — o único gatilho de proteção do schema sem ela. Com a
-- inscrição podendo nascer sem professor, isso deixaria a fila num beco: o
-- `teacher_id` nulo não teria como virar um id, nem por RPC `security definer`,
-- nem por rotina administrativa.
--
-- A exceção é a mesma de `protect_profile_admin_fields`, palavra por palavra:
-- quem age sai do JWT. Sem JWT (migration, psql, seed) é manutenção;
-- `service_role` e a RPC que rodar como definer passam; `authenticated` e
-- `anon` são usuário final e continuam barrados.
create or replace function public.protect_waitlist_identity() returns trigger
  language plpgsql set search_path = '' as $$
declare
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_actor not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.teacher_id is distinct from old.teacher_id
     or lower(new.email) is distinct from lower(old.email) then
    raise exception 'os vinculos do cadastro nao podem ser alterados';
  end if;
  return new;
end;
$$;
