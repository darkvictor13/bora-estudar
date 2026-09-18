-- =============================================================================
-- Turma de teste — professor + Aluno Teste A, B e C
-- =============================================================================
-- Monta, num ambiente DESCARTÁVEL (staging), uma turma inteira com dado de
-- verdade: um professor, três alunos vinculados a ele, acesso liberado nos
-- quatro, uma turma em `classes` com os três matriculados, e um planejamento
-- próprio por aluno — disciplinas, cadernos, catálogo de teoria, duas semanas
-- de metas e histórico de estudo.
--
-- POR QUE ISTO NÃO É A TELA DO PROFESSOR.
--
-- Três das coisas que a turma precisa não saem da tela AQUI, e por dois
-- motivos diferentes:
--
--   * promover alguém a professor — não existe caminho no produto, ponto.
--     `create_profile_for_new_user` ignora o `role` do metadado de propósito
--     (quem mandasse `{"role":"teacher"}` no cadastro nasceria professor), e
--     abrir isso é spec própria;
--   * liberar acesso e vincular aluno a professor — desde `20260918120000`
--     existem `set_student_access` e `link_student`, e a tela do professor as
--     chama. Só que as duas exigem um professor LOGADO, e aqui o professor é
--     uma das contas que este script acabou de inventar.
--
-- As três são trabalho privilegiado. Este script as faz como DONO DO BANCO,
-- que é o que `supabase/seed.sql` também faz: sem JWT,
-- `protect_profile_admin_fields` trata a sessão como manutenção e deixa passar.
-- Nada aqui afrouxa grant ou policy.
--
-- O que continua fora, pelo mesmo motivo do seed: `quiz_sessions` e o ledger.
-- A execução de bateria é de RPC, as RPCs ainda não voltaram, e fabricar linha
-- de bateria por INSERT produziria desempenho que nenhuma tela explica.
--
-- IDEMPOTENTE. Todos os ids são fixos e todo INSERT tem `on conflict do
-- nothing` ou guarda por `not exists`. Rodar duas vezes não duplica nada.
--
-- COMO RODAR: `node scripts/rodar-sql.mjs turma-de-teste.sql` (ver o cabeçalho
-- de lá), ou colando este arquivo inteiro no SQL Editor do projeto de staging.
--
-- @ambiente: staging
--   O runner recusa este arquivo fora do projeto de staging, e é o único dos
--   três marcado assim: ele CRIA CONTAS.
--
-- COMO DESFAZER: a última seção deste arquivo, comentada.
-- =============================================================================

do $$
declare
  -- `7e57` é TEST em hexadecimal legível: sobra deste script no banco é sempre
  -- identificável de relance, sem consultar tabela nenhuma.
  v_teacher  uuid := '7e570000-0000-4000-8000-000000000001';
  v_class    uuid := '7e570000-0000-4000-8000-0000000000c1';
  v_catalog  uuid := '7e570000-0000-4000-8000-0000000000ca';

  -- Senha única dos quatro. Ambiente descartável, credencial de teste — a
  -- mesma escolha de `TEST_PASSWORD` em `apps/e2e/fixtures/scenario.ts`.
  v_password text := 'TurmaTeste#2026';

  -- `gen_salt('bf')` custa ~100 ms. O hash carrega o próprio salt, então um
  -- valor serve para os quatro usuários.
  v_hash     text := extensions.crypt(v_password, extensions.gen_salt('bf'));

  -- A semana 1 é sempre a que o site abre. Um cenário que começa numa data
  -- fixa envelhece: depois de um mês o aluno abre na semana 5 e a tela parece
  -- vazia.
  v_starts   date := date_trunc('week', current_date)::date;

  v_weekdays text[] := array[
    'Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira',
    'Sexta-feira','Sábado','Domingo'
  ];

  v_student  record;
  v_subject  record;
  v_week     integer;
  v_goal     uuid;
  v_day      integer;
  v_intruso  text;
begin
  -- ---------------------------------------------------------------------
  -- 0. Um e-mail da turma ocupado por OUTRA conta
  --
  -- Os ids são fixos; os e-mails também. Se alguém já cadastrou um deles pelo
  -- site, a conta tem id sorteado pelo GoTrue e o `on conflict` abaixo pularia
  -- a inserção em silêncio — o script seguiria e quebraria adiante, numa FK,
  -- acusando outra coisa. Falhar aqui, dizendo qual e-mail, custa uma consulta.
  -- ---------------------------------------------------------------------
  select string_agg(u.email, ', ') into v_intruso
    from auth.users u
   where u.email like '%@staging.bora-estudar.dev'
     and u.id not in (
       v_teacher,
       '7e570000-0000-4000-8000-0000000000a1',
       '7e570000-0000-4000-8000-0000000000a2',
       '7e570000-0000-4000-8000-0000000000a3'
     );

  if v_intruso is not null then
    raise exception 'ja existe conta com e-mail da turma de teste e id diferente: %. Apague-a antes de rodar.', v_intruso;
  end if;

  -- ---------------------------------------------------------------------
  -- 1. As quatro contas
  --
  -- `auth.identities` não é opcional: sem a identidade do provedor `email` o
  -- login falha mesmo com o usuário existindo.
  --
  -- Os quatro campos de token vão como '' e não como NULL: o GoTrue lê essas
  -- colunas para dentro de `string` em Go, e NULL ali quebra o login com
  -- "converting NULL to string is unsupported".
  --
  -- `email_confirmed_at` já preenchido: a conta nasce confirmada e nenhum
  -- e-mail é disparado para um domínio que não existe.
  --
  -- O PERFIL NÃO É INSERIDO AQUI. `create_profile_for_new_user` o cria junto
  -- com a conta, sempre ALUNO, sempre `pending`, sempre sem professor.
  -- ---------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  select
    '00000000-0000-0000-0000-000000000000', c.id, 'authenticated', 'authenticated',
    c.email, v_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', c.name, 'email_verified', true),
    now(), now(), '', '', '', ''
  from (values
    (v_teacher,                                   'Professor Teste', 'professor.teste@staging.bora-estudar.dev'),
    ('7e570000-0000-4000-8000-0000000000a1'::uuid, 'Aluno Teste A',  'aluno.teste.a@staging.bora-estudar.dev'),
    ('7e570000-0000-4000-8000-0000000000a2'::uuid, 'Aluno Teste B',  'aluno.teste.b@staging.bora-estudar.dev'),
    ('7e570000-0000-4000-8000-0000000000a3'::uuid, 'Aluno Teste C',  'aluno.teste.c@staging.bora-estudar.dev')
  ) as c(id, name, email)
  on conflict (id) do nothing;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  select
    u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'email', now(), now(), now()
  from auth.users u
  where u.email like '%@staging.bora-estudar.dev'
  on conflict (provider, provider_id) do nothing;

  -- ---------------------------------------------------------------------
  -- 2. O que o gatilho recusa fazer: papel, acesso e vínculo
  -- ---------------------------------------------------------------------
  update public.profiles
     set role = 'teacher', access_status = 'active', teacher_id = null, plan = null
   where id = v_teacher;

  update public.profiles p
     set role = 'student',
         access_status = 'active',
         access_expires_at = null,
         teacher_id = v_teacher,
         plan = 'Área Fiscal'
   where p.id in (
     '7e570000-0000-4000-8000-0000000000a1',
     '7e570000-0000-4000-8000-0000000000a2',
     '7e570000-0000-4000-8000-0000000000a3'
   );

  -- ---------------------------------------------------------------------
  -- 3. A turma
  --
  -- `classes` tem policy de escrita para o professor, mas ainda não tem tela:
  -- quem lê é a lista de alunos, por `class_students -> classes(name)` em
  -- `lib/api/supabase/teacher-students.ts`. Sem estas duas linhas a coluna
  -- "Turma" da lista aparece vazia.
  -- ---------------------------------------------------------------------
  insert into public.classes (id, teacher_id, name, description)
  values (v_class, v_teacher, 'Turma de Teste',
          'Turma montada por scripts/turma-de-teste.sql para exercitar staging.')
  on conflict (id) do nothing;

  insert into public.class_students (class_id, student_id, teacher_id)
  select v_class, p.id, v_teacher
    from public.profiles p
   where p.teacher_id = v_teacher
  on conflict (class_id, student_id) do nothing;

  -- ---------------------------------------------------------------------
  -- 4. Disciplinas do professor, compartilhadas pelos três planejamentos
  --
  -- O peso decide quanto de cada matéria entra na semana; a meta é o piso de
  -- acerto a partir do qual o desempenho conta como "na meta".
  -- ---------------------------------------------------------------------
  insert into public.subjects (id, teacher_id, name, color, weight, target_score) values
    ('7e570000-0000-4000-8000-0000000000d1', v_teacher, 'Direito Constitucional', '#B23A48', 5, 80),
    ('7e570000-0000-4000-8000-0000000000d2', v_teacher, 'Direito Administrativo',  '#0A6E7F', 4, 75),
    ('7e570000-0000-4000-8000-0000000000d3', v_teacher, 'Português',               '#855000', 3, 85),
    ('7e570000-0000-4000-8000-0000000000d4', v_teacher, 'Raciocínio Lógico',       '#2B5BD7', 2, 70)
  on conflict (id) do nothing;

  -- `subject_blocks` e `subject_lessons` não têm unique: a guarda é o
  -- `not exists`, não um `on conflict` que não tem em que se apoiar.
  for v_subject in select id, name from public.subjects where teacher_id = v_teacher loop
    insert into public.subject_blocks (subject_id, position, name, link)
    select v_subject.id, g, format('Bloco %s — %s', g, v_subject.name),
           'https://www.tecconcursos.com.br/'
      from generate_series(1, 3) g
     where not exists (
       select 1 from public.subject_blocks b where b.subject_id = v_subject.id
     );

    insert into public.subject_lessons (subject_id, position, name)
    select v_subject.id, g, format('Aula %s — %s', g, v_subject.name)
      from generate_series(1, 2) g
     where not exists (
       select 1 from public.subject_lessons l where l.subject_id = v_subject.id
     );
  end loop;

  -- ---------------------------------------------------------------------
  -- 5. Catálogo de teoria do professor
  --
  -- Duas disciplinas auditadas e uma SEM páginas (Raciocínio Lógico), de
  -- propósito: é o caso que faz a tela mostrar o diagnóstico em vez de
  -- inventar número de página, e sem ele ninguém exercita esse caminho.
  -- ---------------------------------------------------------------------
  insert into public.theory_catalogs (id, teacher_id, name, key, description)
  values (v_catalog, v_teacher, 'Área Fiscal — Teste', 'area-fiscal-teste',
          'Catálogo da turma de teste.')
  on conflict (id) do nothing;

  insert into public.theory_lessons (
    catalog_id, teacher_id, subject, subject_key, lesson_code, position, title,
    pdf_file, theory_start_page, theory_end_page, pdf_total_pages,
    final_questions_start, has_theory
  )
  select
    v_catalog, v_teacher, d.nome, d.chave,
    format('A%s', lpad(g::text, 2, '0')), g,
    format('Aula %s — %s', lpad(g::text, 2, '0'), d.nome),
    format('%s-aula-%s.pdf', d.chave, lpad(g::text, 2, '0')),
    5, 5 + (g * 12), 5 + (g * 12) + 20, 5 + (g * 12) + 1, true
  from (values
    ('Português', 'portugues'),
    ('Direito Constitucional', 'direito constitucional')
  ) as d(nome, chave)
  cross join generate_series(1, 5) g
  on conflict do nothing;

  insert into public.theory_lessons (
    catalog_id, teacher_id, subject, subject_key, lesson_code, position, title,
    pdf_file, theory_start_page, theory_end_page, pdf_total_pages, has_theory
  )
  select
    v_catalog, v_teacher, 'Raciocínio Lógico', 'rlm',
    format('A%s', lpad(g::text, 2, '0')), g,
    format('Aula %s — Raciocínio Lógico', lpad(g::text, 2, '0')),
    format('rlm-aula-%s.pdf', lpad(g::text, 2, '0')),
    null, null, 60, false
  from generate_series(1, 3) g
  on conflict do nothing;

  insert into public.theory_catalog_subject_rules
    (catalog_id, teacher_id, subject, subject_key, initial_questions)
  values
    (v_catalog, v_teacher, 'Português', 'portugues', 15),
    (v_catalog, v_teacher, 'Direito Constitucional', 'direito constitucional', 20)
  on conflict (catalog_id, subject_key) do nothing;

  insert into public.theory_review_rules
    (catalog_id, teacher_id, subject, subject_key, review_number, lesson_spacing, minimum_questions)
  values
    (v_catalog, v_teacher, 'Português', 'portugues', 1, 2, 15),
    (v_catalog, v_teacher, 'Português', 'portugues', 2, 4, 10),
    (v_catalog, v_teacher, 'Direito Constitucional', 'direito constitucional', 1, 3, 20)
  on conflict (catalog_id, subject_key, review_number) do nothing;

  -- ---------------------------------------------------------------------
  -- 6. Um planejamento completo por aluno
  --
  -- Os três nascem iguais em estrutura. O nome leva o sufixo do aluno porque
  -- dois planejamentos com o MESMO nome na tela do professor não têm como ser
  -- distinguidos numa lista — e `study_plans_name_per_student_uidx` é por
  -- aluno, então não seria o banco a reclamar.
  -- ---------------------------------------------------------------------
  for v_student in
    select p.id, p.name, s.plan_id, s.letra
      from (values
        ('7e570000-0000-4000-8000-0000000000a1'::uuid, '7e570000-0000-4000-8000-0000000000b1'::uuid, 'A'),
        ('7e570000-0000-4000-8000-0000000000a2'::uuid, '7e570000-0000-4000-8000-0000000000b2'::uuid, 'B'),
        ('7e570000-0000-4000-8000-0000000000a3'::uuid, '7e570000-0000-4000-8000-0000000000b3'::uuid, 'C')
      ) as s(student_id, plan_id, letra)
      join public.profiles p on p.id = s.student_id
  loop
    insert into public.study_plans (
      id, student_id, teacher_id, class_id, name, area, target_exam, stage,
      study_model, weekly_goals, starts_on, exam_date, status
    ) values (
      v_student.plan_id, v_student.id, v_teacher, v_class,
      format('Área Fiscal 2026 — %s', v_student.letra), 'Fiscal',
      'Receita Federal — Auditor', 'Pré-edital', 'Avanço progressivo',
      12, v_starts, (v_starts + 180), 'active'
    ) on conflict (id) do nothing;

    insert into public.study_plan_theory_catalogs (study_plan_id, catalog_id, teacher_id, student_id)
    values (v_student.plan_id, v_catalog, v_teacher, v_student.id)
    on conflict (study_plan_id) do nothing;

    -- Cadernos TEC: um por disciplina, para as metas de bateria terem onde
    -- apontar. `block_id` é a identidade do caderno e o gatilho a congela.
    if not exists (
      select 1 from public.study_plan_notebooks n where n.study_plan_id = v_student.plan_id
    ) then
      for v_subject in
        select id, name, color, row_number() over (order by weight desc, name) as pos
          from public.subjects where teacher_id = v_teacher
      loop
        insert into public.study_plan_notebooks (
          block_id, study_plan_id, student_id, teacher_id,
          subject_key, subject_name, subject_color, subject_target,
          notebook_key, notebook_name, notebook_link, total_questions,
          subject_position, notebook_position
        ) values (
          gen_random_uuid(), v_student.plan_id, v_student.id, v_teacher,
          lower(translate(v_subject.name, ' ÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç', '_AAAEEIOOOUCaaaeeiooouc')),
          v_subject.name, v_subject.color, 80,
          format('cad_%s', v_subject.pos), format('Caderno 1 — %s', v_subject.name),
          'https://www.tecconcursos.com.br/', 30, v_subject.pos::int, 1
        );
      end loop;
    end if;

    -- Metas: duas semanas, uma de teoria e uma de bateria por disciplina.
    -- `goals_one_per_slot_idx` é (plano, semana, dia, posição) — o `on
    -- conflict do nothing` se apoia nele para a rerodada não duplicar.
    for v_subject in
      select s.id, s.name, row_number() over (order by s.weight desc, s.name) as pos
        from public.subjects s where s.teacher_id = v_teacher
    loop
      for v_week in 1..2 loop
        insert into public.goals (
          study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
          day_position, type, subject, title, description, lesson, planned_minutes, status
        ) values (
          v_student.plan_id, v_teacher, v_student.id, v_week, v_subject.pos::int,
          v_weekdays[v_subject.pos], 1, 'theory', v_subject.name,
          format('Teoria — Aula %s de %s', v_week, v_subject.name),
          'Leia o capítulo antes de resolver as questões.',
          format('Aula %s — %s', v_week, v_subject.name),
          60, 'pending'
        ) on conflict do nothing;

        insert into public.goals (
          study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
          day_position, type, subject, title, block, planned_minutes, status,
          notebook_block_id
        )
        select
          v_student.plan_id, v_teacher, v_student.id, v_week, v_subject.pos::int,
          v_weekdays[v_subject.pos], 2, 'question_block', v_subject.name,
          format('Bateria — %s', n.notebook_name), n.notebook_name, 90, 'pending',
          n.block_id
        from public.study_plan_notebooks n
        where n.study_plan_id = v_student.plan_id and n.subject_name = v_subject.name
        limit 1
        on conflict do nothing;
      end loop;
    end loop;

    -- -------------------------------------------------------------------
    -- Estudo já registrado, para o cabeçalho da semana não abrir com quatro
    -- traços e os gráficos terem SÉRIE. Um ponto só não é gráfico.
    --
    -- Guardado por `not exists`: `goal_entries` não tem unique nenhuma, e sem
    -- a guarda cada rerodada somaria um histórico em cima do outro.
    --
    -- Só em meta de teoria: bateria é do motor, e o motor ainda não voltou.
    -- -------------------------------------------------------------------
    if not exists (
      select 1 from public.goal_entries e where e.student_id = v_student.id
    ) then
      for v_goal in
        select id from public.goals
         where study_plan_id = v_student.plan_id and week_number = 1 and type = 'theory'
         order by weekday limit 2
      loop
        insert into public.goal_entries (
          goal_id, student_id, teacher_id, minutes, questions, correct_answers, note
        ) values (v_goal, v_student.id, v_teacher, 55, 20, 16, 'Revisar jurisprudência citada.');

        update public.goals
           set status = 'completed', completed_at = now()
         where id = v_goal;
      end loop;

      -- Histórico espalhado pelos últimos 20 dias. `created_at` é escrito à
      -- mão de propósito — é o que espalha os registros no calendário; em
      -- produção quem o carimba é o default da coluna.
      for v_day in 0..19 loop
        insert into public.goal_entries (
          goal_id, student_id, teacher_id, minutes, questions, correct_answers, created_at
        )
        select
          g.id, v_student.id, v_teacher,
          30 + (v_day * 7) % 60,
          8 + (v_day * 3) % 15,
          -- Desempenho subindo entre 55% e 95%: uma série plana esconderia um
          -- eixo y quebrado.
          greatest(1, ((8 + (v_day * 3) % 15) * (55 + v_day * 2)) / 100),
          now() - make_interval(days => v_day)
        from public.goals g
        where g.study_plan_id = v_student.plan_id and g.type = 'theory'
        order by (g.week_number * 10 + g.weekday + v_day) % 8
        limit 1;
      end loop;
    end if;
  end loop;

  raise notice 'Turma de teste pronta. Senha dos quatro: %', v_password;
end $$;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Uma linha por conta, com o que cada tela vai encontrar. Se qualquer coluna
-- vier zerada, o script não terminou o que prometeu.

select
  p.name                                                as conta,
  u.email,
  p.role::text                                          as papel,
  p.access_status::text                                 as acesso,
  coalesce(tp.name, '—')                                as professor,
  coalesce(c.name, '—')                                 as turma,
  (select count(*) from public.study_plans sp where sp.student_id = p.id)   as planejamentos,
  (select count(*) from public.goals g where g.student_id = p.id)           as metas,
  (select count(*) from public.goal_entries e where e.student_id = p.id)    as registros
from public.profiles p
join auth.users u on u.id = p.id
left join public.profiles tp on tp.id = p.teacher_id
left join public.class_students cs on cs.student_id = p.id
left join public.classes c on c.id = cs.class_id
where u.email like '%@staging.bora-estudar.dev'
order by p.role desc, p.name;

-- =============================================================================
-- Como desfazer
-- =============================================================================
-- `profiles.id` referencia `auth.users(id)` com `on delete cascade`, e tudo
-- que pende do perfil cai junto — planejamento, cadernos, metas, registros,
-- matrícula, disciplinas e catálogo do professor. Apagar as quatro contas
-- apaga a turma inteira:
--
--   delete from auth.users where email like '%@staging.bora-estudar.dev';
--
-- Só rode isso num ambiente descartável. Em produção, `quiz_sessions`
-- referencia `profiles` com ON DELETE RESTRICT de propósito — a bateria não
-- pode perder o dono — e o delete falharia, que é o comportamento correto.
