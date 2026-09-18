-- =============================================================================
-- Criar uma turma: um professor, uma lista de alunos
-- =============================================================================
-- Recebe o e-mail do professor e um ARRAY de e-mails de alunos — todos de
-- contas que já existem — e faz, em um comando, o que a escola precisa e o
-- produto não tem por onde fazer:
--
--   1. VINCULA cada aluno ao professor (`profiles.teacher_id`);
--   2. reivindica a inscrição deles na lista de espera, se houver;
--   3. LIBERA o acesso, garantindo N meses a partir de hoje (`v_meses`);
--   4. cria a turma em `classes` e MATRICULA os alunos em `class_students`.
--
-- POR QUE ISTO NÃO É A TELA DO PROFESSOR.
--
-- Os passos 1 e 3 escrevem colunas de `profiles` que estão fora de todo
-- `GRANT UPDATE` — `teacher_id`, `access_status` e `access_expires_at` — e não
-- existe RPC que as escreva: `grantAccess` e `revokeAccess` LANÇAM em
-- `apps/web/src/lib/api/supabase/teacher-students.ts` dizendo exatamente isso.
-- É o que a spec 13 especifica como `link_student` e `set_student_access`, e
-- que ainda não foi implementado.
--
-- Os passos 2 e 4, ao contrário, são escrita que o professor JÁ PODE fazer
-- pela API — `classes` e `class_students` têm policy, grant e FK composta
-- desde a migration inicial. O que falta neles é contrato e tela, não
-- permissão. Este script os faz junto porque turma sem vínculo não existe: o
-- `WITH CHECK` de `class_students_insert` exige `is_teacher_of(student_id)`, e
-- essa ordem é imposta pelo banco.
--
-- COMO ELE CONSEGUE ESCREVER. Rodando como DONO DO BANCO não há JWT, e tanto
-- `protect_profile_admin_fields` quanto `protect_waitlist_identity` tratam
-- sessão sem JWT como manutenção. É a mesma porta de `supabase/seed.sql` e de
-- `scripts/turma-de-teste.sql`. Nada aqui afrouxa grant ou policy.
--
-- O QUE ELE RECUSA FAZER:
--
--   * criar conta. Aluno sem cadastro é recusado com a lista de quem falta —
--     a senha tem de ser da pessoa. Para um cenário descartável com contas
--     inventadas, o arquivo é `scripts/turma-de-teste.sql`;
--   * roubar aluno de outro professor. Um aluno tem um professor só, e o
--     script recusa a lista inteira dizendo quais;
--   * matricular quem não é aluno, inclusive o próprio professor.
--
-- IDEMPOTENTE, e a chave é o NOME DA TURMA por professor: rodar de novo com o
-- mesmo nome reusa a turma que existe. `classes` não tem unique em
-- `(teacher_id, name)` — a tela ainda não existe para impedir duas iguais —,
-- então se houver duas com o mesmo nome o script pega a mais antiga.
--
-- COMO RODAR: edite o bloco EDITE AQUI e cole o arquivo inteiro no SQL Editor
-- do projeto, ou `node scripts/rodar-sql.mjs criar-turma.sql`.
--
-- @ambiente: qualquer
--   Vale contra qualquer ambiente, inclusive produção: não cria conta nenhuma
--   e só toca em quem está na lista.
--
-- COMO DESFAZER: a última seção deste arquivo, comentada.
-- =============================================================================

do $$
declare
  -- ---------------------------------------------------------------------
  -- EDITE AQUI
  -- ---------------------------------------------------------------------
  v_professor text := 'professora@exemplo.com';

  v_alunos text[] := array[
    'aluno.um@exemplo.com',
    'aluno.dois@exemplo.com'
  ];

  v_turma     text := 'Turma 2026 — Manhã';
  v_descricao text := null;

  -- Meses de acesso a garantir, contados de hoje. `null` não mexe no acesso
  -- de ninguém — é o caso de quem está sendo só organizado em turma. Os
  -- valores aceitos são os de `R-VINC-16`, e 3 é o padrão que a v96 usava.
  -- É um PISO, não uma soma: ver a seção 4.
  v_meses integer := 3;

  v_teacher     uuid;
  v_class       uuid;
  v_emails      text[];
  v_ids         uuid[];
  v_perfil      record;
  v_pendencia   text;
  v_permanentes text;
  v_movidos     integer;
  v_nova        boolean := false;
begin
  v_professor := lower(btrim(coalesce(v_professor, '')));
  v_turma     := btrim(coalesce(v_turma, ''));

  if v_professor = '' then
    raise exception 'informe o e-mail do professor em v_professor';
  end if;

  if v_turma = '' then
    raise exception 'informe o nome da turma em v_turma';
  end if;

  if v_meses is not null and v_meses not in (1, 3, 6, 12) then
    raise exception 'v_meses aceita 1, 3, 6, 12 ou null (nao mexer no acesso); veio %', v_meses;
  end if;

  -- Normaliza e tira repetido de uma vez: e-mail digitado duas vezes na lista
  -- não pode virar duas contagens nem duas mensagens de erro.
  select array_agg(distinct lower(btrim(e))) into v_emails
    from unnest(coalesce(v_alunos, '{}'::text[])) e
   where btrim(coalesce(e, '')) <> '';

  if v_emails is null then
    raise exception 'informe ao menos um e-mail de aluno em v_alunos';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. O professor
  -- ---------------------------------------------------------------------
  select p.id, p.role into v_perfil
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(btrim(u.email)) = v_professor;

  if not found then
    raise exception 'nao existe conta com o e-mail %. A pessoa precisa se cadastrar pelo site antes.', v_professor;
  end if;

  if v_perfil.role <> 'teacher' then
    raise exception 'a conta % nao e professor. Rode scripts/promover-professor.sql antes.', v_professor;
  end if;

  v_teacher := v_perfil.id;

  -- ---------------------------------------------------------------------
  -- 2. Os alunos, conferidos ANTES de qualquer escrita
  --
  -- As três recusas listam TODOS os e-mails que falham, e não o primeiro:
  -- quem está montando uma turma de trinta corrige uma vez, não trinta.
  -- ---------------------------------------------------------------------
  select string_agg(e, ', ' order by e) into v_pendencia
    from unnest(v_emails) e
   where not exists (
     select 1
       from auth.users u
       join public.profiles p on p.id = u.id
      where lower(btrim(u.email)) = e
   );

  if v_pendencia is not null then
    raise exception 'sem conta neste ambiente: %. Cada aluno se cadastra pelo site antes de entrar na turma.', v_pendencia;
  end if;

  select array_agg(p.id), string_agg(u.email, ', ') filter (where p.role <> 'student')
    into v_ids, v_pendencia
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(btrim(u.email)) = any(v_emails);

  if v_pendencia is not null then
    raise exception 'estas contas nao sao de aluno: %. Professor nao entra na propria turma.', v_pendencia;
  end if;

  select string_agg(u.email, ', ' order by u.email) into v_pendencia
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = any(v_ids)
     and p.teacher_id is not null
     and p.teacher_id <> v_teacher;

  if v_pendencia is not null then
    raise exception 'estes alunos ja sao de outro professor: %. Um aluno tem um professor so, e desvincular e regra de produto que ainda nao existe.', v_pendencia;
  end if;

  -- ---------------------------------------------------------------------
  -- 3. O vínculo
  --
  -- `teacher_id is null` na cláusula, e não um `update` cego: quem já é aluno
  -- deste professor não é reescrito, e a rerodada não conta como mudança.
  -- ---------------------------------------------------------------------
  update public.profiles
     set teacher_id = v_teacher
   where id = any(v_ids)
     and teacher_id is null;

  -- A inscrição na lista de espera passa a ser deste professor. Aluno sem
  -- linha na fila segue igual: o update não acha linha e o script continua.
  update public.waitlist
     set teacher_id = v_teacher
   where student_id = any(v_ids)
     and teacher_id is null;

  -- ---------------------------------------------------------------------
  -- 4. O acesso
  --
  -- `v_meses` é um PISO, e não uma soma: "esta turma tem pelo menos N meses
  -- de acesso a partir de hoje". Quem já tem vigência maior não a perde.
  --
  -- É uma divergência deliberada de `R-VINC-17`, que manda SOMAR ao que
  -- ainda falta. A regra da spec depende do `request_id` de `R-VINC-29` para
  -- saber que a segunda chamada é a mesma liberação; um script colado no SQL
  -- Editor não tem esse id, e somando cegamente a rerodada — que o cabeçalho
  -- deste arquivo promete inócua — daria três meses de acesso de graça, em
  -- silêncio. Errar para o lado do piso é visível e corrigível; errar para o
  -- lado da soma não aparece em lugar nenhum.
  --
  -- PARA RENOVAR SOMANDO, que é o caso de quem paga mensalidade, a conta é a
  -- da spec e vai à mão até a RPC existir:
  --
  --   update public.profiles
  --      set access_status = 'active',
  --          access_expires_at = greatest(now(), coalesce(access_expires_at, now()))
  --                              + make_interval(months => 3)
  --    where id = '...';
  --
  -- Quem está `active` com vencimento NULO fica de fora dos dois: nulo é
  -- "não vence" para `has_active_access()`, e gravar data ENCURTARIA o acesso
  -- dessa pessoa. É o estado do seed e da turma de teste.
  -- ---------------------------------------------------------------------
  if v_meses is not null then
    select string_agg(u.email, ', ' order by u.email) into v_permanentes
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = any(v_ids)
       and p.access_status = 'active'
       and p.access_expires_at is null;

    update public.profiles
       set access_status     = 'active',
           access_expires_at = greatest(
             coalesce(access_expires_at, now()),
             now() + make_interval(months => v_meses)
           )
     where id = any(v_ids)
       and not (access_status = 'active' and access_expires_at is null);

    if v_permanentes is not null then
      raise notice 'acesso sem vencimento preservado (nao vence; somar meses encurtaria): %', v_permanentes;
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 5. A turma
  -- ---------------------------------------------------------------------
  select c.id into v_class
    from public.classes c
   where c.teacher_id = v_teacher
     and lower(btrim(c.name)) = lower(v_turma)
   order by c.created_at
   limit 1;

  if v_class is null then
    insert into public.classes (teacher_id, name, description)
    values (v_teacher, v_turma, nullif(btrim(coalesce(v_descricao, '')), ''))
    returning id into v_class;
    v_nova := true;
  elsif nullif(btrim(coalesce(v_descricao, '')), '') is not null then
    update public.classes
       set description = btrim(v_descricao)
     where id = v_class;
  end if;

  -- ---------------------------------------------------------------------
  -- 6. A matrícula
  --
  -- Apagar a matrícula anterior é MUDAR DE TURMA, e matrícula não é
  -- histórico: `class_students` é a única das tabelas desta spec com `delete`
  -- concedido, e o que não pode sumir — planejamento, metas, ledger — não tem
  -- `delete` para `authenticated` em lugar nenhum.
  --
  -- Em duas turmas ao mesmo tempo o banco hoje deixa — o índice único por
  -- aluno é `R-MATR-03`, ainda não implementado. Mover em vez de somar é o
  -- que mantém este script compatível com ele.
  -- ---------------------------------------------------------------------
  delete from public.class_students
   where student_id = any(v_ids)
     and class_id <> v_class;
  get diagnostics v_movidos = row_count;

  insert into public.class_students (class_id, student_id, teacher_id)
  select v_class, s.id, v_teacher
    from unnest(v_ids) as s(id)
  on conflict (class_id, student_id) do nothing;

  -- O id fica na sessão para a conferência do fim do arquivo achá-lo sem
  -- repetir o nome da turma: parâmetro digitado duas vezes é parâmetro que
  -- diverge.
  perform set_config('bora.turma', v_class::text, false);

  raise notice 'Turma "%" (%): % aluno(s), % movido(s) de outra turma.',
    v_turma,
    case when v_nova then 'criada agora' else 'ja existia' end,
    cardinality(v_ids),
    v_movidos;
end $$;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Uma linha por aluno da turma, com o que cada tela vai encontrar. `vinculado`
-- falso significa turma montada sobre vínculo que não existe — estado que o
-- `WITH CHECK` de `class_students_insert` impediria pela API, e que este
-- script, rodando como dono, não teria quem impedisse.

select
  c.name                                                   as turma,
  tp.name                                                  as professor,
  p.name                                                   as aluno,
  u.email,
  p.access_status::text                                    as acesso,
  coalesce(to_char(p.access_expires_at, 'DD/MM/YYYY'), '—') as vence_em,
  p.teacher_id = c.teacher_id                              as vinculado,
  (select count(*) from public.study_plans sp where sp.student_id = p.id) as planejamentos
from public.class_students cs
join public.classes  c  on c.id  = cs.class_id
join public.profiles p  on p.id  = cs.student_id
join public.profiles tp on tp.id = c.teacher_id
join auth.users      u  on u.id  = p.id
where c.id = current_setting('bora.turma', true)::uuid
order by p.name;

-- =============================================================================
-- Como desfazer
-- =============================================================================
-- Desmatricular e apagar a turma NÃO desfaz o vínculo nem o acesso — são atos
-- diferentes, e é de propósito: o aluno continua sendo do professor mesmo sem
-- turma. Os três, na ordem:
--
--   delete from public.class_students
--    where class_id = (select id from public.classes
--                       where teacher_id = (select id from auth.users where lower(btrim(email)) = 'professora@exemplo.com')
--                         and name = 'Turma 2026 — Manhã');
--
--   delete from public.classes
--    where teacher_id = (select id from auth.users where lower(btrim(email)) = 'professora@exemplo.com')
--      and name = 'Turma 2026 — Manhã';
--
--   update public.profiles
--      set teacher_id = null, access_status = 'pending', access_expires_at = null
--    where id in (select id from auth.users where lower(btrim(email)) = any (array['aluno.um@exemplo.com']));
--
-- Apagar a turma com aluno dentro é recusado no dia em que `R-MATR-05` existir
-- (gatilho `protect_class_with_students`); hoje o `on delete cascade` de
-- `class_students` leva as matrículas junto, em silêncio.
