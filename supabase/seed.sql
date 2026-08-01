-- Usuários exclusivos do ambiente local de desenvolvimento.
-- Este arquivo é executado por `supabase db reset` depois das migrations.
-- Nunca use estas credenciais conhecidas em um ambiente compartilhado ou de produção.

begin;

create extension if not exists pgcrypto;

select set_config('app.audit_reason', 'seed local de usuários de desenvolvimento', true);
select set_config('app.audit_operation_id', gen_random_uuid()::text, true);

-- IDs estáveis permitem que fixtures e rotas locais apontem para os mesmos perfis.
-- O professor preserva o UUID usado historicamente pelas fixtures do frontend.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'ad000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@boraestudar.local',
    crypt('BoraEstudar#2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Administrador Teste","tipo":"admin","email_verified":true}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd65a965f-0ccb-4a12-ac7b-858519d9df00',
    'authenticated',
    'authenticated',
    'professor@boraestudar.local',
    crypt('BoraEstudar#2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Professor Teste","tipo":"professor","email_verified":true}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'aluno@boraestudar.local',
    crypt('BoraEstudar#2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Aluno Teste","tipo":"aluno","email_verified":true}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  banned_until = null,
  deleted_at = null,
  updated_at = now();

-- O GoTrue exige uma identidade correspondente ao provedor de e-mail.
insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    'ad000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001',
    '{"sub":"ad000000-0000-4000-8000-000000000001","email":"admin@boraestudar.local","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'd65a965f-0ccb-4a12-ac7b-858519d9df00',
    'd65a965f-0ccb-4a12-ac7b-858519d9df00',
    '{"sub":"d65a965f-0ccb-4a12-ac7b-858519d9df00","email":"professor@boraestudar.local","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    '{"sub":"a1000000-0000-4000-8000-000000000001","email":"aluno@boraestudar.local","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do update
set
  user_id = excluded.user_id,
  identity_data = excluded.identity_data,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = now();

-- O gatilho de auth cria todo perfil inicialmente como aluno. O seed promove
-- admin e professor somente depois que os três perfis existem.
insert into public.profiles (id, nome, tipo, ativo)
values
  ('ad000000-0000-4000-8000-000000000001', 'Administrador Teste', 'admin', true),
  ('d65a965f-0ccb-4a12-ac7b-858519d9df00', 'Professor Teste', 'professor', true),
  ('a1000000-0000-4000-8000-000000000001', 'Aluno Teste', 'aluno', true)
on conflict (id) do update
set
  nome = excluded.nome,
  tipo = excluded.tipo,
  ativo = true,
  updated_at = now();

-- O gatilho também cria acesso pendente para qualquer auth.users. Como admin e
-- professor não são alunos, os acessos deles viram histórico por soft delete.
update public.acessos_aluno
set
  deleted_at = now(),
  deleted_by = 'ad000000-0000-4000-8000-000000000001',
  delete_reason = 'acesso criado automaticamente para perfil local não aluno',
  delete_operation_id = gen_random_uuid()
where aluno_id in (
    'ad000000-0000-4000-8000-000000000001',
    'd65a965f-0ccb-4a12-ac7b-858519d9df00'
  )
  and deleted_at is null;

-- O aluno local fica com acesso acadêmico vigente e sem expiração.
update public.acessos_aluno
set
  status = 'ativo',
  plano = 'desenvolvimento-local',
  inicio_em = current_date,
  expira_em = null,
  bloqueado_em = null,
  motivo_bloqueio = null,
  liberado_por = 'ad000000-0000-4000-8000-000000000001'
where aluno_id = 'a1000000-0000-4000-8000-000000000001'
  and status in ('pendente', 'ativo', 'bloqueado')
  and deleted_at is null;

insert into public.acessos_aluno (
  aluno_id,
  status,
  plano,
  inicio_em,
  expira_em,
  liberado_por
)
select
  'a1000000-0000-4000-8000-000000000001',
  'ativo',
  'desenvolvimento-local',
  current_date,
  null,
  'ad000000-0000-4000-8000-000000000001'
where not exists (
  select 1
  from public.acessos_aluno
  where aluno_id = 'a1000000-0000-4000-8000-000000000001'
    and status in ('pendente', 'ativo', 'bloqueado')
    and deleted_at is null
);

-- O professor local recebe o aluno local para que as telas relacionais tenham
-- um vínculo real, autorizado pelas mesmas validações do schema.
insert into public.professor_alunos (
  professor_id,
  aluno_id,
  status,
  inicio_em
)
select
  'd65a965f-0ccb-4a12-ac7b-858519d9df00',
  'a1000000-0000-4000-8000-000000000001',
  'ativo',
  current_date
where not exists (
  select 1
  from public.professor_alunos
  where aluno_id = 'a1000000-0000-4000-8000-000000000001'
    and status = 'ativo'
    and deleted_at is null
);

commit;
