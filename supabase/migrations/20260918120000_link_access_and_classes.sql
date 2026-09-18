-- Vínculo, acesso e turmas.
--
-- Implementa `docs/specs/13-vinculo-e-liberacao-de-acesso.md`.
--
-- O QUE ESTA MIGRATION FECHA
--
-- O perfil nasce aluno, pendente e sem professor (`20260914190000`). A partir
-- daí o produto acabava: `profiles.teacher_id`, `access_status` e
-- `access_expires_at` estão fora de todo grant, e não existia RPC que os
-- escrevesse. Um professor que se cadastrasse via lista de alunos vazia para
-- sempre; o aluno, a lista de espera. Nenhum dos dois saía desse estado sem
-- alguém abrir o SQL editor.
--
-- São TRÊS funções e UMA tabela:
--
--   `find_student_by_email`  achar o aluno pelo e-mail INTEIRO (R-VINC-21)
--   `link_student`           assumir o aluno (R-VINC-07)
--   `set_student_access`     liberar e bloquear (R-VINC-15)
--   `access_grants`          o histórico de quem liberou, quando e por quanto
--
-- E QUATRO AJUSTES no que já existia:
--
--   1. `waitlist_select` deixa de mostrar a fila sem dono (R-VINC-23). Com a
--      busca por e-mail no lugar da lista, manter a policy aberta deixaria o
--      diretório de nome, e-mail, WhatsApp e nascimento a uma chamada de API de
--      distância — e bloqueio que só existe na tela é o que este repositório
--      trata como bug.
--   2. `protect_waitlist_identity` ganha UMA exceção (R-VINC-26): `teacher_id`
--      nulo pode virar o `auth.uid()` de quem é professor, uma vez. Sem ela a
--      RPC não escreve a reivindicação — o JWT CONTINUA SENDO O DO CHAMADOR
--      dentro de um `security definer`, porque `auth.jwt()` lê
--      `request.jwt.claims`, que é ajuste de sessão e não muda com o dono da
--      função. A afirmação em contrário no comentário da `20260914190000` está
--      errada.
--   3. `classes` passa a conceder `update` POR COLUNA (R-MATR-02), e
--      `class_students` ganha `update (class_id)` mais a policy que falta
--      (R-MATR-04): mudar de turma é um UPDATE, não apagar e inserir.
--   4. Um aluno está em UMA turma (R-MATR-03), e turma com aluno dentro não é
--      apagada (R-MATR-05).
--
-- POR QUE VÍNCULO E ACESSO VIRAM RPC E TURMA NÃO
--
-- As três colunas de `profiles` que esta migration escreve estão na linha
-- "ninguém escreve" da tabela de fronteira do CLAUDE.md, e estão lá porque
-- decidem o que cada pessoa enxerga e por quanto tempo. `classes` e
-- `class_students` estão na linha de planejamento, com as três defesas montadas
-- desde a migration inicial — `WITH CHECK` amarrando a linha a quem escreve,
-- `is_teacher_of` conferindo pelo ALUNO, e a FK composta `(class_id,
-- teacher_id)` conferindo a turma. Criar RPC ali não acrescentaria garantia
-- nenhuma, e acrescentaria superfície.
--
-- COMPATIBILIDADE COM O BUNDLE QUE JÁ ESTÁ NO AR
--
-- Tabela nova, funções novas, e um grant que ENCOLHE numa coluna que a
-- interface não usa. Nada aqui quebra o bundle anterior: ele não chama estas
-- funções e não escreve em `classes.teacher_id`. A única mudança que ele
-- ENXERGA é `waitlist_select`, e o que ele fazia com a fila sem dono era nada —
-- não existe tela que a leia.

-- ---------------------------------------------------------------------------
-- O histórico de liberação
-- ---------------------------------------------------------------------------

-- Duas ações, e não um booleano chamado `granted`: quem lê a linha sabe o que
-- aconteceu sem consultar a documentação do campo.
create type public.access_grant_action as enum ('grant', 'suspend');

-- Uma linha por liberação e por bloqueio. Responde "desde quando este aluno tem
-- acesso" e "quem o liberou" — a lacuna nº 2 de `lib/api/contract.ts`.
--
-- `on delete restrict`, como `quiz_sessions`: liberação órfã é dado que nenhuma
-- tela consegue explicar.
--
-- SEM FK COMPOSTA, e é a única tabela deste schema que carrega `student_id` e
-- `teacher_id` sem uma. A defesa 3 do CLAUDE.md existe para linha montada por
-- QUEM ESCREVE, e aqui ninguém fora da RPC escreve: não há `insert`, `update`
-- nem `delete` para `authenticated`. Amarrar `(student_id, teacher_id)` a
-- `profiles` seria ainda pior — quebraria no dia em que o aluno trocasse de
-- professor, apagando o histórico de quem o liberou antes.
create table public.access_grants (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  action     public.access_grant_action not null,
  months     integer,
  -- A vigência RESULTANTE, e não a anterior: é o que a tela mostra ao lado de
  -- "liberado em", e o que a retentativa devolve sem reexecutar.
  expires_at timestamptz,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  -- 1, 3, 6 e 12 são as opções da tela; 3 é o padrão, o mesmo valor que a v96
  -- passava como literal. `suspend` não tem prazo a somar, e um `months`
  -- preenchido ali seria um número que ninguém usa e todo mundo lê.
  constraint access_grants_months_check check (
    (action = 'grant'   and months in (1, 3, 6, 12))
    or (action = 'suspend' and months is null)
  )
);

comment on table public.access_grants is
  'Histórico de liberação e bloqueio de acesso. Append-only: SELECT para authenticated, e nada mais — quem escreve é `set_student_access`.';

comment on column public.access_grants.request_id is
  'A chave de retentativa, gerada UMA VEZ na origem. É o UNIQUE dela que sustenta a idempotência de `set_student_access`, não o código da função.';

-- O que sustenta a idempotência de `set_student_access`. Índice, e não
-- `unique` inline, para seguir a convenção `_uidx` do resto do schema.
create unique index access_grants_request_uidx on public.access_grants (request_id);

-- Uma FK precisa de índice do lado que REFERENCIA: com `on delete restrict` é
-- ele que o Postgres usa para descobrir se existe linha dependente.
create index access_grants_student_idx on public.access_grants (student_id, created_at desc);
create index access_grants_teacher_idx on public.access_grants (teacher_id);

alter table public.access_grants enable row level security;

-- O aluno lê o próprio histórico, o professor lê o que ele mesmo concedeu.
-- Nada de INSERT, UPDATE ou DELETE: o histórico não se corrige, e bloquear é
-- linha nova em vez de linha alterada.
create policy access_grants_select on public.access_grants for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()));

grant select on public.access_grants to authenticated;

-- ---------------------------------------------------------------------------
-- Achar o aluno
-- ---------------------------------------------------------------------------

-- NÃO EXISTE LISTA DE CANDIDATOS. O professor acha o aluno pelo e-mail
-- INTEIRO, e o casamento é `lower(btrim(...))` exato: casar parcial é
-- enumeração com outro nome.
--
-- `security definer` porque o e-mail mora em `auth.users`, que a API não expõe
-- e onde `authenticated` não tem — nem deve ter — grant.
--
-- Devolve `student_id`, `name`, `has_teacher` e `is_mine`, e NADA ALÉM. Em
-- particular não devolve QUAL professor: revelar transformaria a busca num mapa
-- de quem é aluno de quem.
--
-- SUPOSIÇÃO REGISTRADA (R-VINC-25): a busca exata continua sendo um oráculo —
-- quem já é professor descobre se um endereço tem conta neste produto. É aceito
-- porque o alvo é restrito, o casamento é exato, não há listagem e não há
-- iteração barata. Merece revisão humana no dia em que qualquer pessoa puder se
-- cadastrar como professora.
create or replace function public.find_student_by_email(p_email text)
  returns table (student_id uuid, name text, has_teacher boolean, is_mine boolean)
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_needle text := lower(btrim(coalesce(p_email, '')));
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado';
  end if;
  if not public.is_teacher() then
    raise exception 'somente professor busca aluno por e-mail';
  end if;

  -- Busca vazia devolve vazio, e não a base inteira.
  if v_needle = '' then
    return;
  end if;

  return query
    select p.id,
           p.name,
           p.teacher_id is not null,
           coalesce(p.teacher_id = v_uid, false)
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.role = 'student'
       and lower(btrim(u.email)) = v_needle
     limit 1;
end;
$$;

comment on function public.find_student_by_email(text) is
  'Acha um aluno pelo e-mail INTEIRO. No máximo uma linha, sem `like` e sem busca por nome. Não diz de QUAL professor o aluno é.';

-- ---------------------------------------------------------------------------
-- Vincular
-- ---------------------------------------------------------------------------

-- O vínculo é o predicado de `is_teacher_of()`, e portanto a entrada das
-- policies de `study_plans`, `goals`, `goal_entries`, `study_plan_notebooks` e
-- `class_students`. Conceder `update (teacher_id)` seria conceder a capacidade
-- de escolher o que se enxerga — por isso a coluna fica fora do grant e quem
-- escreve é esta função, como definer.
--
-- O VÍNCULO É SEMPRE COM QUEM CHAMA: não existe parâmetro de `teacher_id`, e
-- portanto não existe vincular aluno ao professor alheio.
--
-- IDEMPOTENTE POR CONSTRUÇÃO, e o que a sustenta não é o código: é a COLUNA.
-- `profiles.teacher_id` cabe um valor só, e a escrita é um `update ... where id
-- = ? and teacher_id is null` num comando só. Duas chamadas simultâneas
-- serializam no bloqueio de linha, e a segunda vê `row_count = 0` — a exclusão
-- mútua é do Postgres. Não recebe `request_id` porque não há payload a
-- comparar: o único parâmetro já é a identidade do alvo.
create or replace function public.link_student(p_student_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_role  public.user_role;
  v_owner uuid;
  v_rows  integer;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado';
  end if;
  if not public.is_teacher() then
    raise exception 'somente professor vincula aluno';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_student_id;
  if not found then
    raise exception 'aluno nao encontrado';
  end if;
  -- Vincular um professor a outro é recusado ANTES de qualquer escrita.
  if v_role <> 'student' then
    raise exception 'somente perfil de aluno pode ser vinculado a um professor';
  end if;

  update public.profiles
     set teacher_id = v_uid
   where id = p_student_id
     and teacher_id is null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Ou já era meu — e aí a segunda chamada não é erro nenhum —, ou é de
    -- outro. A releitura vem DEPOIS do update de propósito: decidir pelo valor
    -- lido antes seria decidir por um estado que a linha pode ter deixado.
    select p.teacher_id into v_owner from public.profiles p where p.id = p_student_id;
    if v_owner is distinct from v_uid then
      raise exception 'este aluno ja tem professor';
    end if;
  end if;

  -- A linha da lista de espera é reivindicada no mesmo ato. Aluno sem linha na
  -- fila é vinculável do mesmo jeito: o update não acha linha e segue.
  update public.waitlist
     set teacher_id = v_uid
   where student_id = p_student_id
     and teacher_id is null;
end;
$$;

comment on function public.link_student(uuid) is
  'Assume um aluno sem professor, e reivindica a linha dele na lista de espera. Naturalmente idempotente: quem sustenta é a coluna `profiles.teacher_id`, que cabe um valor só.';

-- ---------------------------------------------------------------------------
-- Liberar e bloquear
-- ---------------------------------------------------------------------------

-- O resultado guardado, conferido contra o pedido que chegou.
--
-- Em função própria porque `set_student_access` o devolve de dois lugares — a
-- entrada normal e a corrida perdida no índice único —, e repetir a comparação
-- é a forma de as duas divergirem numa alteração futura.
create or replace function app_private.replay_access_grant(
  p_grant      public.access_grants,
  p_student_id uuid,
  p_action     public.access_grant_action,
  p_months     integer
) returns table (access_status public.access_status, access_expires_at timestamptz)
  language plpgsql immutable set search_path = '' as $$
begin
  if p_grant.student_id is distinct from p_student_id
     or p_grant.action is distinct from p_action
     or p_grant.months is distinct from p_months then
    raise exception 'este request_id ja foi usado com outro pedido';
  end if;

  return query select
    (case p_grant.action when 'grant' then 'active' else 'suspended' end)::public.access_status,
    p_grant.expires_at;
end;
$$;

-- `access_status` e `access_expires_at` ficam fora do `GRANT UPDATE` de
-- `profiles` para que ninguém estenda o próprio acesso nem se promova, e
-- afrouxar o grant para a tela funcionar abriria o buraco que ele fecha.
--
-- LIBERAR SOMA AO QUE AINDA FALTA: `greatest(now(), coalesce(expira, now())) +
-- N meses`. Quem renova antes do fim não perde dia pago, que é como mensalidade
-- funciona — e é o que torna o par `active` com data PASSADA inexprimível, que
-- era o estado que o BUG-07 explorava.
--
-- BLOQUEAR PRESERVA A DATA. Dá para reativar sem redigitar, e fica auditável
-- até quando o acesso valia.
--
-- IDEMPOTÊNCIA COM PAYLOAD: `access_grants.request_id` é UNIQUE, e o payload
-- guardado são as próprias colunas `student_id`, `action` e `months` — mesmo id
-- e mesmo payload devolve o resultado anterior sem reexecutar; payload
-- diferente é rejeitado. Guardar o payload uma segunda vez num `jsonb` seria um
-- segundo caminho afirmando o mesmo fato.
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

  select * into v_seen from public.access_grants g where g.request_id = p_request_id;
  if found then
    return query select * from app_private.replay_access_grant(v_seen, p_student_id, p_action, p_months);
    return;
  end if;

  if p_action = 'grant' then
    select greatest(now(), coalesce(p.access_expires_at, now())) + make_interval(months => p_months)
      into v_expires
      from public.profiles p
     where p.id = p_student_id;

    update public.profiles
       set access_status = 'active',
           access_expires_at = v_expires
     where id = p_student_id;
  else
    select p.access_expires_at into v_expires
      from public.profiles p
     where p.id = p_student_id;

    update public.profiles
       set access_status = 'suspended'
     where id = p_student_id;
  end if;

  begin
    insert into public.access_grants (student_id, teacher_id, action, months, expires_at, request_id)
    values (p_student_id, v_uid, p_action, p_months, v_expires, p_request_id);
  exception when unique_violation then
    -- Duas chamadas com o MESMO `request_id` ao mesmo tempo: a segunda perde a
    -- corrida do índice único e devolve o que a primeira gravou, em vez de
    -- estourar na tela de quem clicou duas vezes.
    select * into v_seen from public.access_grants g where g.request_id = p_request_id;
    return query select * from app_private.replay_access_grant(v_seen, p_student_id, p_action, p_months);
    return;
  end;

  return query select
    (case p_action when 'grant' then 'active' else 'suspended' end)::public.access_status,
    v_expires;
end;
$$;

comment on function public.set_student_access(uuid, public.access_grant_action, integer, uuid) is
  'Libera por N meses (somando ao que ainda falta) ou bloqueia (preservando a data). Segura a retentativa por `access_grants.request_id`, que é UNIQUE.';

-- ---------------------------------------------------------------------------
-- A fila deixa de ser diretório
-- ---------------------------------------------------------------------------

-- A `20260914190000` abriu `waitlist_select` para a inscrição sem professor,
-- porque sem isso ela não apareceria para ninguém além de quem a escreveu — e a
-- fila seria invisível por construção. O preço estava dito lá: nome, e-mail,
-- WhatsApp e nascimento de todo mundo que ainda não tem professor, legíveis por
-- QUALQUER professor.
--
-- Com `find_student_by_email` no lugar da lista, o preço deixa de se pagar.
-- Numa escola física o professor sabe de quem está falando, porque a pessoa
-- está na frente dele.
drop policy waitlist_select on public.waitlist;
create policy waitlist_select on public.waitlist for select to authenticated
  using (
    student_id = (select auth.uid())
    or (public.is_teacher() and teacher_id = (select auth.uid()))
  );

-- A exceção que a RPC precisa, e SÓ ela.
--
-- O gatilho congela o vínculo para todo ator `authenticated`, e o JWT continua
-- sendo o do CHAMADOR dentro de um `security definer`: `auth.jwt()` lê
-- `request.jwt.claims`, que é ajuste de sessão e não muda com o dono da função.
-- Sem esta exceção, `link_student` não conseguiria reivindicar a inscrição.
--
-- A exceção é estreita de propósito: `teacher_id` NULO virando o `auth.uid()`
-- de quem é PROFESSOR, com aluno e e-mail intactos. Qualquer outra alteração de
-- `student_id`, `teacher_id` ou `email` continua barrada, inclusive a de quem
-- já tem dono. E ela não abre caminho pelo PostgREST: `waitlist_update` filtra a
-- linha sem dono antes — `teacher_id = auth.uid()` é nulo quando a coluna é
-- nula, e o comando afeta zero linhas em silêncio.
create or replace function public.protect_waitlist_identity() returns trigger
  language plpgsql set search_path = '' as $$
declare
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_actor not in ('authenticated', 'anon') then
    return new;
  end if;

  if old.teacher_id is null
     and new.teacher_id = (select auth.uid())
     and new.student_id is not distinct from old.student_id
     and lower(new.email) is not distinct from lower(old.email)
     and public.is_teacher() then
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

-- ---------------------------------------------------------------------------
-- Turmas
-- ---------------------------------------------------------------------------

-- UM ALUNO ESTÁ EM UMA TURMA.
--
-- Não precisa ser parcial nem por professor: um aluno tem um professor só
-- (`profiles.teacher_id` é uma coluna), e `class_students_insert` exige
-- `is_teacher_of(student_id)` — então todas as turmas de um aluno são do mesmo
-- professor por construção.
--
-- É também o que transforma a corrida de "mover de turma" em erro em vez de
-- duplicata.
create unique index class_students_one_per_student_uidx
  on public.class_students (student_id);

-- MUDAR DE TURMA É UM `UPDATE`, e não apagar e inserir: em dois comandos o
-- aluno fica fora de turma nenhuma no meio do caminho, e uma falha entre eles o
-- deixa lá.
--
-- A policy espelha a de INSERT — quem escreve é professor, a linha é dele, e o
-- ALUNO é aluno dele. A FK composta `class_students_class_fk` continua
-- garantindo a outra ponta: que a turma de destino é de quem está escrevendo.
create policy class_students_update on public.class_students for update to authenticated
  using (
    public.is_teacher()
    and teacher_id = (select auth.uid())
    and public.is_teacher_of(student_id)
  )
  with check (
    public.is_teacher()
    and teacher_id = (select auth.uid())
    and public.is_teacher_of(student_id)
  );

-- APAGAR TURMA COM ALUNO DENTRO É RECUSADO.
--
-- Por gatilho, e não por FK `restrict`: o `on delete cascade` de
-- `class_students` precisa continuar valendo quando a conta do professor for
-- removida em cascata a partir de `auth.users`, e um `restrict` no meio faria
-- essa remoção falhar.
--
-- A exceção de manutenção é a mesma dos outros gatilhos de proteção, palavra
-- por palavra: quem age sai de `auth.jwt() ->> 'role'`. Sem JWT (migration,
-- psql, seed) é manutenção; `service_role` passa — e é ele quem apaga conta
-- pela API de administração do GoTrue.
--
-- Vale dizer o que isto NÃO promete: apagar a conta de quem já liberou acesso
-- continua falhando, porque `access_grants` referencia `profiles` com `on
-- delete restrict`. É a mesma decisão de `quiz_sessions`, e é deliberada — o
-- que não pode sumir do histórico segura a remoção em vez de sumir junto. O que
-- este gatilho evita é outra coisa: que a REGRA de produto ("esvazie a turma
-- antes") fique escondida atrás de um erro de FK que ninguém consegue traduzir.
create or replace function app_private.protect_class_with_students() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged then
    return old;
  end if;

  if exists (select 1 from public.class_students cs where cs.class_id = old.id) then
    raise exception 'esvazie a turma antes de apaga-la: ainda ha aluno matriculado';
  end if;

  return old;
end;
$$;

create trigger protect_class_with_students
  before delete on public.classes
  for each row execute function app_private.protect_class_with_students();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- `classes` concedia `update` INTEIRO, com `teacher_id` dentro. O `WITH CHECK`
-- de `classes_update` impede a transferência, mas a defesa 2 do CLAUDE.md diz
-- que a RLS decide QUAL LINHA e nunca QUAL COLUNA — e um grant que a interface
-- não usa é o mais barato de restringir.
revoke update on public.classes from authenticated;
grant update (name, description) on public.classes to authenticated;

-- `class_id` é o que muda quando o aluno troca de turma. `student_id` e
-- `teacher_id` são contexto e ficam fora, pelo mesmo motivo de sempre.
grant update (class_id) on public.class_students to authenticated;

-- O schema `app_private` não tem `alter default privileges`, então a função
-- nova nasce executável pelo grantee vazio — o buraco do BUG-14.
revoke all on function app_private.protect_class_with_students() from public, anon, authenticated;
revoke all on function app_private.replay_access_grant(public.access_grants, uuid, public.access_grant_action, integer)
  from public, anon, authenticated;

-- As três de `public` são API, e precisam do revoke ANTES do grant nominal: o
-- default do Postgres concede `EXECUTE` a PUBLIC, que não é `anon` nem
-- `authenticated` — revogar dos dois papéis não tira nada, porque o privilégio
-- vem do grantee vazio que ambos herdam. Foi assim que `reserve_operation`
-- ficou chamável por qualquer autenticado apesar do `revoke`.
revoke all on function public.find_student_by_email(text) from public, anon, authenticated;
revoke all on function public.link_student(uuid) from public, anon, authenticated;
revoke all on function public.set_student_access(uuid, public.access_grant_action, integer, uuid)
  from public, anon, authenticated;

grant execute on function public.find_student_by_email(text) to authenticated;
grant execute on function public.link_student(uuid) to authenticated;
grant execute on function public.set_student_access(uuid, public.access_grant_action, integer, uuid)
  to authenticated;
