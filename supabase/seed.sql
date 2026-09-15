-- =============================================================================
-- Seed de desenvolvimento local
-- =============================================================================
-- Monta um par professor/aluno com planejamento, disciplinas, cadernos e duas
-- semanas de metas — o suficiente para abrir qualquer tela do aluno com dado
-- de verdade em vez de estado vazio.
--
-- POR QUE POR INSERT, E NÃO PELAS RPCs.
--
-- O seed anterior chamava as MESMAS RPCs que a aplicação usa, de propósito:
-- assim validava o contrato delas a cada `db reset` em vez de inserir por
-- dentro e mascarar regressão de regra. Aquelas RPCs não existem neste schema,
-- e a fronteira mudou junto: planejamento agora é ESCRITA DIRETA com RLS e
-- grant por coluna (ver CLAUDE.md, "A fronteira da escrita é entre planejar e
-- executar"). Inserir aqui é o mesmo caminho que a tela do professor percorre.
--
-- O que continua fora: `quiz_sessions` e o ledger. A execução de bateria é de
-- RPC, as RPCs ainda não voltaram, e fabricar linha de bateria por INSERT
-- produziria desempenho que nenhuma tela consegue explicar.
--
-- Roda como dono do banco, então os gatilhos de proteção o tratam como
-- manutenção — é o que permite carimbar `access_status` sem passar por RPC.
-- =============================================================================

do $$
declare
  v_teacher uuid := '11111111-1111-4111-8111-111111111111';
  v_student uuid := '22222222-2222-4222-8222-222222222222';
  v_plan    uuid := '33333333-3333-4333-8333-333333333333';
  v_hash    text := extensions.crypt('SenhaLocal#2026', extensions.gen_salt('bf'));
  v_starts  date := date_trunc('week', current_date)::date;
  v_subject record;
  v_block   record;
  v_goal    uuid;
begin
  -- ---------------------------------------------------------------------
  -- Contas
  --
  -- `auth.identities` não é opcional: sem a identidade do provedor `email` o
  -- login falha mesmo com o usuário existindo.
  --
  -- O PERFIL NÃO É INSERIDO AQUI: `create_profile_for_new_user` o cria junto
  -- com a conta, com o nome do metadado. O que sobra é exatamente o que o
  -- gatilho NÃO faz, de propósito — promover a professora, liberar os dois
  -- acessos e ligar o aluno a ela. Roda sem JWT, então
  -- `protect_profile_admin_fields` trata como manutenção e deixa passar.
  -- ---------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_teacher, 'authenticated', 'authenticated',
     'professor@local.dev', v_hash, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"role":"teacher","name":"Professora Local","email_verified":true}'::jsonb,
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_student, 'authenticated', 'authenticated',
     'aluno@local.dev', v_hash, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"role":"student","name":"Aluno Local","email_verified":true}'::jsonb,
     now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values
    (v_teacher::text, v_teacher,
     jsonb_build_object('sub', v_teacher::text, 'email', 'professor@local.dev', 'email_verified', true),
     'email', now(), now(), now()),
    (v_student::text, v_student,
     jsonb_build_object('sub', v_student::text, 'email', 'aluno@local.dev', 'email_verified', true),
     'email', now(), now(), now())
  on conflict (provider, provider_id) do nothing;

  update public.profiles
     set role = 'teacher', access_status = 'active', teacher_id = null, plan = null
   where id = v_teacher;

  update public.profiles
     set role = 'student', access_status = 'active', teacher_id = v_teacher, plan = 'Área Fiscal'
   where id = v_student;

  -- ---------------------------------------------------------------------
  -- Disciplinas do professor
  --
  -- O peso decide quanto de cada matéria entra na semana; a meta é o piso de
  -- acerto a partir do qual o desempenho conta como "na meta".
  -- ---------------------------------------------------------------------
  insert into public.subjects (id, teacher_id, name, color, weight, target_score) values
    ('44444444-0001-4000-8000-000000000001', v_teacher, 'Direito Constitucional', '#B23A48', 5, 80),
    ('44444444-0001-4000-8000-000000000002', v_teacher, 'Direito Administrativo',  '#0A6E7F', 4, 75),
    ('44444444-0001-4000-8000-000000000003', v_teacher, 'Português',               '#855000', 3, 85),
    ('44444444-0001-4000-8000-000000000004', v_teacher, 'Raciocínio Lógico',       '#2B5BD7', 2, 70)
  on conflict (id) do nothing;

  -- Três blocos e duas aulas por disciplina, numerados.
  for v_subject in select id, name from public.subjects where teacher_id = v_teacher loop
    insert into public.subject_blocks (subject_id, position, name, link)
    select v_subject.id, g, format('Bloco %s — %s', g, v_subject.name),
           'https://www.tecconcursos.com.br/'
      from generate_series(1, 3) g
    on conflict do nothing;

    insert into public.subject_lessons (subject_id, position, name)
    select v_subject.id, g, format('Aula %s — %s', g, v_subject.name)
      from generate_series(1, 2) g
    on conflict do nothing;
  end loop;

  -- ---------------------------------------------------------------------
  -- Planejamento
  --
  -- Começa na segunda-feira desta semana, para a semana 1 ser sempre a que o
  -- site abre. Um seed que começa numa data fixa envelhece: depois de um mês
  -- o aluno abre na semana 5 e a tela parece vazia.
  -- ---------------------------------------------------------------------
  insert into public.study_plans (
    id, student_id, teacher_id, name, area, target_exam, stage, study_model,
    weekly_goals, starts_on, exam_date, status
  ) values (
    v_plan, v_student, v_teacher, 'Área Fiscal 2026', 'Fiscal',
    'Receita Federal — Auditor', 'Pré-edital', 'Avanço progressivo',
    12, v_starts, (v_starts + 180), 'active'
  ) on conflict (id) do nothing;

  -- Cadernos TEC: um por disciplina, para as metas de bateria terem onde
  -- apontar. `block_id` é a identidade do caderno e o gatilho a congela.
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
      gen_random_uuid(), v_plan, v_student, v_teacher,
      lower(translate(v_subject.name, ' ÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç', '_AAAEEIOOOUCaaaeeiooouc')),
      v_subject.name, v_subject.color, 80,
      format('cad_%s', v_subject.pos), format('Caderno 1 — %s', v_subject.name),
      'https://www.tecconcursos.com.br/', 30, v_subject.pos::int, 1
    ) on conflict do nothing;
  end loop;

  -- ---------------------------------------------------------------------
  -- Catálogo de teoria
  --
  -- Duas disciplinas auditadas (Português e Direito Constitucional) e uma SEM
  -- páginas (Raciocínio Lógico), de propósito: é o caso que faz a tela mostrar
  -- o diagnóstico em vez de inventar número de página, e sem ele ninguém
  -- exercita esse caminho em desenvolvimento.
  -- ---------------------------------------------------------------------
  insert into public.theory_catalogs (id, teacher_id, name, key, description)
  values ('55555555-5555-4555-8555-555555555555', v_teacher,
          'Área Fiscal — MASTER v16', 'area-fiscal-v16',
          'Catálogo auditado de páginas de teoria.')
  on conflict (id) do nothing;

  insert into public.study_plan_theory_catalogs (study_plan_id, catalog_id, teacher_id, student_id)
  values (v_plan, '55555555-5555-4555-8555-555555555555', v_teacher, v_student)
  on conflict (study_plan_id) do nothing;

  -- Cinco aulas por disciplina auditada. O intervalo de teoria é o que o
  -- progresso por página acompanha; `final_questions_start` é onde começam as
  -- questões do próprio PDF.
  insert into public.theory_lessons (
    catalog_id, teacher_id, subject, subject_key, lesson_code, position, title,
    pdf_file, theory_start_page, theory_end_page, pdf_total_pages,
    final_questions_start, has_theory
  )
  select
    '55555555-5555-4555-8555-555555555555', v_teacher, d.nome, d.chave,
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

  -- A disciplina NÃO auditada: aulas sem intervalo de teoria.
  insert into public.theory_lessons (
    catalog_id, teacher_id, subject, subject_key, lesson_code, position, title,
    pdf_file, theory_start_page, theory_end_page, pdf_total_pages, has_theory
  )
  select
    '55555555-5555-4555-8555-555555555555', v_teacher, 'Raciocínio Lógico', 'rlm',
    format('A%s', lpad(g::text, 2, '0')), g,
    format('Aula %s — Raciocínio Lógico', lpad(g::text, 2, '0')),
    format('rlm-aula-%s.pdf', lpad(g::text, 2, '0')),
    null, null, 60, false
  from generate_series(1, 3) g
  on conflict do nothing;

  -- Questões iniciais por disciplina, e as duas revisões da v108.
  insert into public.theory_catalog_subject_rules
    (catalog_id, teacher_id, subject, subject_key, initial_questions)
  values
    ('55555555-5555-4555-8555-555555555555', v_teacher, 'Português', 'portugues', 15),
    ('55555555-5555-4555-8555-555555555555', v_teacher, 'Direito Constitucional', 'direito constitucional', 20)
  on conflict (catalog_id, subject_key) do nothing;

  insert into public.theory_review_rules
    (catalog_id, teacher_id, subject, subject_key, review_number, lesson_spacing, minimum_questions)
  values
    ('55555555-5555-4555-8555-555555555555', v_teacher, 'Português', 'portugues', 1, 2, 15),
    ('55555555-5555-4555-8555-555555555555', v_teacher, 'Português', 'portugues', 2, 4, 10),
    ('55555555-5555-4555-8555-555555555555', v_teacher, 'Direito Constitucional', 'direito constitucional', 1, 3, 20)
  on conflict (catalog_id, subject_key, review_number) do nothing;

  -- ---------------------------------------------------------------------
  -- Metas: duas semanas, quatro por semana
  --
  -- Uma de teoria e uma de bateria por dia útil alternado, para a tela mostrar
  -- os dois tipos e o agrupamento por dia ter mais de um item em algum dia.
  -- ---------------------------------------------------------------------
  for v_subject in
    select s.id, s.name, row_number() over (order by s.weight desc, s.name) as pos
      from public.subjects s where s.teacher_id = v_teacher
  loop
    for v_block in select generate_series(1, 2) as week loop
      -- Teoria
      insert into public.goals (
        study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
        day_position, type, subject, title, description, lesson, planned_minutes, status
      ) values (
        v_plan, v_teacher, v_student, v_block.week, v_subject.pos::int,
        (array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'])[v_subject.pos],
        1, 'theory', v_subject.name,
        format('Teoria — Aula %s de %s', v_block.week, v_subject.name),
        'Leia o capítulo antes de resolver as questões.',
        format('Aula %s — %s', v_block.week, v_subject.name),
        60, 'pending'
      );

      -- Bateria, apontando para o caderno da disciplina
      insert into public.goals (
        study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
        day_position, type, subject, title, block, planned_minutes, status,
        notebook_block_id
      )
      select
        v_plan, v_teacher, v_student, v_block.week, v_subject.pos::int,
        (array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'])[v_subject.pos],
        2, 'question_block', v_subject.name,
        format('Bateria — %s', n.notebook_name), n.notebook_name, 90, 'pending',
        n.block_id
      from public.study_plan_notebooks n
      where n.study_plan_id = v_plan and n.subject_name = v_subject.name
      limit 1;
    end loop;
  end loop;

  -- ---------------------------------------------------------------------
  -- Um pouco de estudo já registrado, para o cabeçalho da semana não abrir
  -- com quatro traços. Só em meta de teoria: bateria é do motor.
  -- ---------------------------------------------------------------------
  for v_goal in
    select id from public.goals
     where study_plan_id = v_plan and week_number = 1 and type = 'theory'
     order by weekday limit 2
  loop
    insert into public.goal_entries (
      goal_id, student_id, teacher_id, minutes, questions, correct_answers, note
    ) values (v_goal, v_student, v_teacher, 55, 20, 16, 'Revisar jurisprudência citada.');

    update public.goals
       set status = 'completed', completed_at = now()
     where id = v_goal;
  end loop;

  -- Histórico espalhado pelos últimos 20 dias, para os gráficos terem SÉRIE.
  --
  -- Um ponto só não é gráfico: a barra sozinha ocupa a largura inteira e não
  -- compara nada com nada. Sem este bloco, a tela de estatísticas em
  -- desenvolvimento mostra sempre o caso degenerado, e ninguém vê o normal.
  --
  -- `created_at` é escrito à mão de propósito — é o que espalha os registros no
  -- calendário. Em produção quem o carimba é o default da coluna.
  insert into public.goal_entries (
    goal_id, student_id, teacher_id, minutes, questions, correct_answers, created_at
  )
  select
    g.id, v_student, v_teacher,
    30 + (d * 7) % 60,
    8 + (d * 3) % 15,
    -- Desempenho subindo ao longo do tempo, entre 55% e 95%: uma série plana
    -- esconderia um eixo y quebrado.
    greatest(1, ((8 + (d * 3) % 15) * (55 + d * 2)) / 100),
    now() - make_interval(days => d)
  from generate_series(0, 19) d
  cross join lateral (
    select id from public.goals
     where study_plan_id = v_plan and type = 'theory'
     order by (week_number * 10 + weekday + d) % 8
     limit 1
  ) g;
end $$;
