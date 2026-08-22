-- =============================================================================
-- Seed de desenvolvimento local
-- =============================================================================
-- Executado por `supabase db reset` logo após as migrations.
--
--   Papel       E-mail                          Senha
--   ---------   -----------------------------   -----------------
--   admin       admin@boraestudar.local         BoraEstudar#2026!
--   professor   professor@boraestudar.local     BoraEstudar#2026!
--   aluno       aluno@boraestudar.local         BoraEstudar#2026!
--
-- Credenciais públicas e conhecidas. NUNCA use este arquivo em ambiente
-- compartilhado ou de produção.
--
-- Os dados de domínio são criados chamando as MESMAS RPCs que a aplicação usa,
-- com o usuário impersonado via request.jwt.claim.sub. Assim o seed valida o
-- contrato das RPCs a cada reset, em vez de inserir por dentro e mascarar
-- regressões nas regras de negócio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Usuários do GoTrue
-- -----------------------------------------------------------------------------
-- UUIDs estáveis: fixtures, testes e URLs locais continuam válidos entre resets.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000','ad000000-0000-4000-8000-000000000001',
   'authenticated','authenticated','admin@boraestudar.local',
   extensions.crypt('BoraEstudar#2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"admin","name":"Administradora Teste","email_verified":true}'::jsonb,
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000','d65a965f-0ccb-4a12-ac7b-858519d9df00',
   'authenticated','authenticated','professor@boraestudar.local',
   extensions.crypt('BoraEstudar#2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"teacher","name":"Professor Teste","email_verified":true}'::jsonb,
   now(), now(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001',
   'authenticated','authenticated','aluno@boraestudar.local',
   extensions.crypt('BoraEstudar#2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"student","name":"Aluno Teste","email_verified":true}'::jsonb,
   now(), now(), '', '', '', '')
on conflict (id) do update set
  email              = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data  = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  banned_until       = null,
  deleted_at         = null,
  updated_at         = now();

-- O GoTrue exige uma identidade correspondente ao provedor de e-mail,
-- senão o login por senha falha mesmo com o usuário existindo.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',
   '{"sub":"ad000000-0000-4000-8000-000000000001","email":"admin@boraestudar.local","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('d65a965f-0ccb-4a12-ac7b-858519d9df00','d65a965f-0ccb-4a12-ac7b-858519d9df00',
   '{"sub":"d65a965f-0ccb-4a12-ac7b-858519d9df00","email":"professor@boraestudar.local","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
   '{"sub":"a1000000-0000-4000-8000-000000000001","email":"aluno@boraestudar.local","email_verified":true}'::jsonb,
   'email', now(), now(), now())
on conflict (provider_id, provider) do update set
  user_id         = excluded.user_id,
  identity_data   = excluded.identity_data,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at      = now();

-- O gatilho tg_create_profile_for_new_user já criou os profiles a partir do
-- raw_user_meta_data. O upsert abaixo garante o estado final mesmo quando o
-- seed roda sobre uma base que já tinha os usuários (o gatilho é AFTER INSERT
-- e não dispara no ON CONFLICT DO UPDATE acima).
insert into public.profiles (id, role, name, contact_email)
values
  ('ad000000-0000-4000-8000-000000000001','admin',    'Administradora Teste','admin@boraestudar.local'),
  ('d65a965f-0ccb-4a12-ac7b-858519d9df00','teacher','Professor Teste',     'professor@boraestudar.local'),
  ('a1000000-0000-4000-8000-000000000001','student',    'Aluno Teste',         'aluno@boraestudar.local')
on conflict (id) do update set
  role         = excluded.role,
  name          = excluded.name,
  contact_email = excluded.contact_email;


-- -----------------------------------------------------------------------------
-- 2. Vínculo e acesso
-- -----------------------------------------------------------------------------

insert into public.student_teacher_links (student_id, teacher_id)
select 'a1000000-0000-4000-8000-000000000001','d65a965f-0ccb-4a12-ac7b-858519d9df00'
where not exists (
  select 1 from public.student_teacher_links
   where student_id = 'a1000000-0000-4000-8000-000000000001' and ended_at is null
);

-- Acesso acadêmico vigente e sem expiração, para o aluno local nunca esbarrar
-- em bloqueio durante o desenvolvimento.
insert into public.subscriptions (student_id, status, plan, validity)
select 'a1000000-0000-4000-8000-000000000001','active','desenvolvimento-local',
       daterange(current_date, null, '[)')
where not exists (
  select 1 from public.subscriptions
   where student_id = 'a1000000-0000-4000-8000-000000000001' and status = 'active'
);


-- -----------------------------------------------------------------------------
-- 3. Catálogo de questões
-- -----------------------------------------------------------------------------
-- Dois blocos de 30 questões, com tópicos rotativos. É o mínimo para rodar
-- baterias de 15 principais e ainda sobrar questão inédita para a seguinte.

insert into public.catalogs (key, name)
values ('pcpr26','PCPR 2026 — Investigador')
on conflict (key) do nothing;

insert into public.catalog_blocks
  (id, catalog_key, block_key, number, name, subject_key, subject_name, question_count)
values
  ('cb000000-0000-4000-8000-000000000001','pcpr26','pcpr26_forenses_01',1,
   'Bloco 1 — Introdução às Ciências Forenses','forenses','Ciências Forenses',30),
  ('cb000000-0000-4000-8000-000000000002','pcpr26','pcpr26_penal_01',1,
   'Bloco 1 — Teoria Geral do Crime','penal','Direito Penal',30)
on conflict (catalog_key, block_key) do nothing;

insert into public.catalog_questions (block_id, question_id, topic, position)
select 'cb000000-0000-4000-8000-000000000001', 100000 + g,
       (array['Local de crime','Cadeia de custódia','Perícia papiloscópica'])[1 + (g % 3)], g
from generate_series(1,30) g
on conflict (block_id, question_id) do nothing;

insert into public.catalog_questions (block_id, question_id, topic, position)
select 'cb000000-0000-4000-8000-000000000002', 200000 + g,
       (array['Tipicidade','Ilicitude','Culpabilidade'])[1 + (g % 3)], g
from generate_series(1,30) g
on conflict (block_id, question_id) do nothing;


-- -----------------------------------------------------------------------------
-- 4. Planejamento ativo
-- -----------------------------------------------------------------------------

insert into public.study_plans
  (id, student_id, teacher_id, name, area, target_exam, stage, study_model,
   weekly_goals, start_date, status)
values
  ('aaaa0000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001','d65a965f-0ccb-4a12-ac7b-858519d9df00',
   'Plano PCPR 2026','Policial','PCPR — Investigador','Pré-edital',
   'Avanço progressivo', 24, current_date, 'active')
on conflict (id) do nothing;

insert into public.study_plan_blocks
  (id, study_plan_id, student_id, teacher_id, catalog_block_id,
   subject_name, subject_color, subject_target, name, question_count,
   subject_order, block_order)
values
  ('bbbb0000-0000-4000-8000-000000000001','aaaa0000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001','d65a965f-0ccb-4a12-ac7b-858519d9df00',
   'cb000000-0000-4000-8000-000000000001',
   'Ciências Forenses','#6B3FA0',80,'Bloco 1 — Introdução às Ciências Forenses',30,0,0),
  ('bbbb0000-0000-4000-8000-000000000002','aaaa0000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001','d65a965f-0ccb-4a12-ac7b-858519d9df00',
   'cb000000-0000-4000-8000-000000000002',
   'Direito Penal','#1A56DB',80,'Bloco 1 — Teoria Geral do Crime',30,1,0)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 5. Metas da semana 1, criadas pela RPC real
-- -----------------------------------------------------------------------------
-- Impersonar o professor e chamar apply_study_plan_batch faz o seed passar
-- pelas mesmas validações da aplicação. Se uma regra de negócio regredir, o
-- `supabase db reset` falha aqui em vez de produzir dado inválido em silêncio.

do $$
begin
  perform set_config('request.jwt.claim.sub','d65a965f-0ccb-4a12-ac7b-858519d9df00', true);

  if not exists (select 1 from public.study_plan_batches
                  where id = 'cccc0000-0000-4000-8000-000000000001') then
    perform public.apply_study_plan_batch(
      'cccc0000-0000-4000-8000-000000000001'::uuid,
      'aaaa0000-0000-4000-8000-000000000001'::uuid,
      1::smallint,
      'append'::public.batch_mode,
      jsonb_build_array(
        jsonb_build_object('weekday',1,'position',1,'type','theory',
          'title','Teoria — Local de crime','planned_minutes',60,
          'teacher_note','Leitura do capítulo 1 antes da bateria.'),
        jsonb_build_object('weekday',1,'position',2,'type','question_block',
          'block_id','bbbb0000-0000-4000-8000-000000000001',
          'title','Bateria — Introdução às Ciências Forenses','planned_minutes',90),
        jsonb_build_object('weekday',3,'position',1,'type','theory',
          'title','Teoria — Teoria Geral do Crime','planned_minutes',60),
        jsonb_build_object('weekday',3,'position',2,'type','question_block',
          'block_id','bbbb0000-0000-4000-8000-000000000002',
          'title','Bateria — Teoria Geral do Crime','planned_minutes',90),
        jsonb_build_object('weekday',5,'position',1,'type','extra_study',
          'title','Revisão livre da semana','extra_activity','revisao',
          'planned_minutes',45)
      )
    );
  end if;

  perform set_config('request.jwt.claim.sub','', true);
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Resumo
-- -----------------------------------------------------------------------------

do $$
declare
  v_profiles integer; v_goals integer; v_questions integer;
begin
  select count(*) into v_profiles   from public.profiles;
  select count(*) into v_goals    from public.goals where deleted_at is null;
  select count(*) into v_questions from public.catalog_questions;
  raise notice 'Seed local: % profiles, % goals na semana 1, % questoes de catalogo.',
    v_profiles, v_goals, v_questions;
  raise notice 'Login: aluno@boraestudar.local / professor@boraestudar.local / admin@boraestudar.local';
  raise notice 'Senha: BoraEstudar#2026!';
end;
$$;
