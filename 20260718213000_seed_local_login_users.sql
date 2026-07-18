-- Usuários de desenvolvimento para o Supabase local (seed de login).
-- Não aplique esta migration em produção: ela cria credenciais conhecidas.

begin;

create extension if not exists pgcrypto;

-- O professor usa o UUID já configurado como PROFESSOR_PADRAO_ID no frontend.
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
  updated_at = now();

-- A identidade de e-mail é necessária para o GoTrue reconhecer o provedor.
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    'd65a965f-0ccb-4a12-ac7b-858519d9df00',
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
    'a1000000-0000-4000-8000-000000000001',
    '{"sub":"a1000000-0000-4000-8000-000000000001","email":"aluno@boraestudar.local","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict do nothing;

insert into public.profiles (id, nome, tipo, ativo)
values
  ('d65a965f-0ccb-4a12-ac7b-858519d9df00', 'Professor Teste', 'professor', true),
  ('a1000000-0000-4000-8000-000000000001', 'Aluno Teste', 'aluno', true)
on conflict (id) do update
set
  nome = excluded.nome,
  tipo = excluded.tipo,
  ativo = true,
  updated_at = now();

-- O gatilho de novos usuários cria acesso pendente para qualquer usuário.
-- Professor não possui acesso de aluno; o aluno de teste fica liberado.
delete from public.acessos_aluno
where aluno_id = 'd65a965f-0ccb-4a12-ac7b-858519d9df00';

update public.acessos_aluno
set
  status = 'ativo',
  plano = 'desenvolvimento-local',
  inicio_em = current_date,
  expira_em = null,
  bloqueado_em = null,
  motivo_bloqueio = null,
  liberado_por = 'd65a965f-0ccb-4a12-ac7b-858519d9df00',
  updated_at = now()
where aluno_id = 'a1000000-0000-4000-8000-000000000001'
  and status in ('pendente', 'ativo', 'bloqueado');

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
  'd65a965f-0ccb-4a12-ac7b-858519d9df00'
where not exists (
  select 1
  from public.acessos_aluno
  where aluno_id = 'a1000000-0000-4000-8000-000000000001'
    and status in ('pendente', 'ativo', 'bloqueado')
);

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
);

commit;
