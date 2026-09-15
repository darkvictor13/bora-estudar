\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Cenário das suítes — schema de 14/09/2026
-- =============================================================================
-- As suítes anteriores (01 a 15) foram escritas contra o schema que saiu em
-- `7c597cc`. Elas chamavam `start_quiz_session`, `complete_goal`, `link_student`
-- e liam `catalogs`, `subscriptions`, `user_preferences` e sete views `vw_*` —
-- nada disso existe mais, e `run.sh` abortava antes da primeira asserção.
--
-- O QUE MUDOU DE ALVO. Aquelas suítes exercitavam RPCs: o invariante morava
-- dentro da função, e o teste chamava a função. Este schema quase não tem RPC
-- — a execução de bateria saiu com a extensão e ainda não voltou —, e a
-- fronteira de escrita passou a ser **grant por coluna + RLS + gatilho**. É o
-- que estas suítes verificam, porque é o que hoje sustenta o produto.
--
-- POR QUE AINDA EXISTEM, SE O E2E PASSA. O e2e exercita o cliente autenticado
-- pela tela. Nenhum teste de tela tenta `PATCH /profiles?role=teacher`, que é
-- exatamente o que uma chamada direta à API faria. Estas suítes atacam a
-- fronteira pelo lado de fora da interface.
--
-- O ELENCO, e o motivo de cada um existir:
--
--   Professora Ana  (1111…)  dona do planejamento, das disciplinas e da teoria
--   Aluno Bruno     (2222…)  o aluno de Ana; acesso vigente
--   Aluna Carla     (3333…)  segunda aluna de Ana — prova isolamento ENTRE
--                            alunos do MESMO professor, que é o caso que passa
--                            despercebido
--   Professor Davi  (4444…)  professor de outra turma
--   Aluno Elias     (5555…)  aluno de Davi
--   Aluna Fabi      (6666…)  aluna de Ana com acesso VENCIDO — `has_active_access`
--
-- `app_test.act_as` existe porque os gatilhos leem o papel de
-- `auth.jwt() ->> 'role'`, e não de `session_user`. Setar só
-- `request.jwt.claim.sub`, como as suítes antigas faziam, deixaria `auth.jwt()`
-- nulo — e todo gatilho de proteção trataria o teste como MANUTENÇÃO, passando
-- por cima da checagem que o teste quer exercitar. Um teste assim passa sempre,
-- e não prova nada.
-- =============================================================================

create schema if not exists app_test;

-- Encena quem está chamando: papel `authenticated` no JWT, `sub` e `email` do
-- usuário. SECURITY DEFINER por causa do `auth.users` na leitura do e-mail —
-- `authenticated` não tem grant lá, e a policy da lista de espera compara o
-- e-mail do JWT com o da linha.
create or replace function app_test.act_as(p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  select email into v_email from auth.users where id = p_user;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'email', v_email)::text,
    false);
end;
$$;

-- Volta a ser manutenção: sem JWT, como uma migration ou o seed.
create or replace function app_test.act_as_owner() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', '', false);
end;
$$;

grant usage on schema app_test to authenticated;
grant execute on function app_test.act_as(uuid)  to authenticated;
grant execute on function app_test.act_as_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- Contas
--
-- O perfil é inserido à mão: o gatilho de criação de perfil em `auth.users`
-- não foi portado (ver docs/de-para-schema.md). Quando ele voltar, os INSERT
-- em `public.profiles` saem daqui e a suíte 04 ganha o caso do cadastro.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','ana@x.com',   '{"role":"teacher","name":"Professora Ana"}'),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','bruno@x.com', '{"role":"student","name":"Aluno Bruno"}'),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','carla@x.com', '{"role":"student","name":"Aluna Carla"}'),
  ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-8444-444444444444','authenticated','authenticated','davi@x.com',  '{"role":"teacher","name":"Professor Davi"}'),
  ('00000000-0000-0000-0000-000000000000','55555555-5555-4555-8555-555555555555','authenticated','authenticated','elias@x.com', '{"role":"student","name":"Aluno Elias"}'),
  ('00000000-0000-0000-0000-000000000000','66666666-6666-4666-8666-666666666666','authenticated','authenticated','fabi@x.com',  '{"role":"student","name":"Aluna Fabi"}');

insert into public.profiles (id, name, role, teacher_id, access_status, access_expires_at) values
  ('11111111-1111-4111-8111-111111111111','Professora Ana','teacher', null, 'active', null),
  ('22222222-2222-4222-8222-222222222222','Aluno Bruno',   'student','11111111-1111-4111-8111-111111111111','active', null),
  ('33333333-3333-4333-8333-333333333333','Aluna Carla',   'student','11111111-1111-4111-8111-111111111111','active', null),
  ('44444444-4444-4444-8444-444444444444','Professor Davi','teacher', null, 'active', null),
  ('55555555-5555-4555-8555-555555555555','Aluno Elias',   'student','44444444-4444-4444-8444-444444444444','active', null),
  ('66666666-6666-4666-8666-666666666666','Aluna Fabi',    'student','11111111-1111-4111-8111-111111111111','expired', now() - interval '30 days');

do $$
declare v_total integer;
begin
  select count(*) into v_total from public.profiles;
  if v_total <> 6 then
    raise exception 'FALHOU: o cenario nasceu com % perfis, esperava 6', v_total;
  end if;
  raise notice '01 OK  seis perfis, dois professores e quatro alunos';
end $$;

-- ---------------------------------------------------------------------------
-- Catálogo comum (leitura para qualquer autenticado)
-- ---------------------------------------------------------------------------
insert into public.catalog_blocks (
  catalog_key, catalog_id, catalog_subject_key, subject_name,
  block_number, block_name, question_slots, active_questions, topics
) values
  ('pcpr26_forenses_01','pcpr26','forenses','Ciências Forenses',1,'Bloco 1',60,55,7),
  ('pcpr26_forenses_02','pcpr26','forenses','Ciências Forenses',2,'Bloco 2',60,50,6);

-- ---------------------------------------------------------------------------
-- Disciplinas de Ana
-- ---------------------------------------------------------------------------
insert into public.subjects (id, teacher_id, name, weight, target_score) values
  ('a1000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Ciências Forenses',5,80);

-- ---------------------------------------------------------------------------
-- Planejamentos
-- ---------------------------------------------------------------------------
insert into public.study_plans (id, teacher_id, student_id, name, starts_on, status) values
  ('a2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Plano do Bruno', current_date,'active'),
  ('a2000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','Plano da Carla', current_date,'active'),
  ('a2000000-0000-4000-8000-000000000003','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','Plano do Elias', current_date,'active'),
  ('a2000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666','Plano da Fabi',  current_date,'active');

-- ---------------------------------------------------------------------------
-- Cadernos
-- ---------------------------------------------------------------------------
insert into public.study_plan_notebooks (
  id, study_plan_id, teacher_id, student_id, subject_key, subject_name,
  notebook_key, notebook_name, block_id, catalog_key
) values
  ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   'forenses','Ciências Forenses','forenses_01','Bloco 1',
   'a4000000-0000-4000-8000-000000000001','pcpr26_forenses_01'),
  ('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
   'forenses','Ciências Forenses','forenses_01','Bloco 1',
   'a4000000-0000-4000-8000-000000000002','pcpr26_forenses_02');

-- ---------------------------------------------------------------------------
-- Metas
--
-- Bruno tem as três formas que o resto das suítes precisa distinguir: a meta
-- de bateria (ligada ao caderno), a meta de teoria do professor e o estudo
-- extra que ele mesmo lançou.
-- ---------------------------------------------------------------------------
insert into public.goals (
  id, study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
  day_position, type, subject, title, planned_minutes, notebook_block_id
) values
  ('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   1,1,'Segunda',1,'question_block','Ciências Forenses','Bloco 1 — questões',60,
   'a4000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   1,1,'Segunda',2,'theory','Ciências Forenses','Teoria — aula 1',45,null),
  ('a5000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   1,2,'Terça',1,'extra','Ciências Forenses','Anki',30,null),
  ('a5000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
   1,1,'Segunda',1,'theory','Ciências Forenses','Teoria da Carla',45,null),
  ('a5000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',
   1,1,'Segunda',1,'theory','Ciências Forenses','Teoria da Fabi',45,null),
  -- O segundo estudo extra existe para a suíte 02 poder APAGAR um sem tirar do
  -- caminho o que a 03 usa: as suítes rodam em sessões diferentes, mas no
  -- mesmo banco, e o que uma apaga a outra não encontra.
  ('a5000000-0000-4000-8000-000000000006','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
   1,2,'Terça',2,'extra','Ciências Forenses','Lei seca',30,null);

insert into public.goal_entries (id, goal_id, teacher_id, student_id, minutes, questions, correct_answers) values
  ('a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',45,10,8);

-- ---------------------------------------------------------------------------
-- Uma bateria concluída
--
-- Inserida aqui, como dono do banco, porque `quiz_sessions` é SELECT para
-- `authenticated` e a RPC de execução ainda não voltou. Serve a um invariante
-- só: `freeze_goal_with_sessions`, que precisa de bateria existindo para ter o
-- que congelar.
-- ---------------------------------------------------------------------------
insert into public.quiz_sessions (
  id, teacher_id, student_id, study_plan_id, goal_id, origin_goal_id, block_id,
  subject_key, catalog_key, execution_order, session_number, origin, status,
  duration_minutes, finish_request_id, finish_payload, started_at, finished_at, completed_at
) values (
  'a7000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'a2000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001','forenses','pcpr26_forenses_01',
  1, 1, 'goal', 'completed', 32,
  'a8000000-0000-4000-8000-000000000001', '{"v":1}'::jsonb,
  now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour'
);

-- ---------------------------------------------------------------------------
-- Teoria de Ana
-- ---------------------------------------------------------------------------
insert into public.theory_catalogs (id, teacher_id, name, key) values
  ('b1000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','MASTER v16','master_v16'),
  ('b1000000-0000-4000-8000-000000000002','44444444-4444-4444-8444-444444444444','MASTER do Davi','master_davi');

insert into public.theory_lessons (
  id, teacher_id, catalog_id, subject, subject_key, lesson_code, position, title,
  pdf_file, theory_start_page, theory_end_page, pdf_total_pages
) values
  ('b2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'b1000000-0000-4000-8000-000000000001','Ciências Forenses','forenses','FOR-01',1,
   'Aula 1 — Introdução','forenses-01.pdf',1,40,120);

insert into public.study_plan_theory_catalogs (study_plan_id, catalog_id, teacher_id, student_id) values
  ('a2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');

insert into public.theory_progress (id, student_id, study_plan_id, theory_lesson_id, current_page) values
  ('b3000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',12);

-- Fabi tem progresso de quando o acesso dela ainda estava vigente: é o que
-- prova, na suíte 06, que o vencimento fecha a escrita sem apagar o passado.
insert into public.theory_progress (id, student_id, study_plan_id, theory_lesson_id, current_page) values
  ('b3000000-0000-4000-8000-000000000002','66666666-6666-4666-8666-666666666666',
   'a2000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001',7);

insert into public.theory_reviews (id, student_id, study_plan_id, theory_lesson_id, review_number) values
  ('b4000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
   'a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',1);

-- ---------------------------------------------------------------------------
-- Cupom
-- ---------------------------------------------------------------------------
insert into public.coupons (code, description, months_granted) values
  ('BORA3M','Três meses de acesso',3);

do $$ begin
  raise notice '02 OK  cenario montado: planejamentos, cadernos, metas, bateria e teoria';
end $$;
