\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Invariantes do schema inteiro
-- =============================================================================
-- As outras suítes atacam uma regra por vez. Esta varre o catálogo e pega o que
-- passa despercebido numa migration nova: a tabela que nasceu sem RLS, a função
-- sem `search_path`, o `GRANT ALL` que voltou pelo default do projeto, a FK
-- composta que alguém "simplificou" de volta para coluna única.
--
-- Os números conferidos no fim são os da tabela "Estado dos dois lados" do
-- de-para. Se um deles mudar por uma migration legítima, o conserto é ajustar
-- a tabela do de-para JUNTO — que é exatamente o que esta asserção existe para
-- forçar.
-- =============================================================================

-- ---------- Toda tabela de `public` com RLS ligada ----------
do $$
declare v_sem text;
begin
  select string_agg(c.relname, ', ') into v_sem
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_sem is not null then
    raise exception 'FALHOU: tabela(s) sem RLS: %', v_sem;
  end if;
  raise notice '01 OK  toda tabela de public tem RLS ligada';
end $$;

-- ---------- Toda tabela com RLS tem policy, menos `coupons` ----------
--
-- `coupons` é a exceção DELIBERADA: RLS ligada, zero policy e zero grant, para
-- que nem o professor leia a lista de códigos. Se ela ganhar policy um dia, é
-- porque nasceu a RPC de resgate — e aí esta asserção é o lembrete de revisar.
do $$
declare v_sem text;
begin
  select string_agg(c.relname, ', ') into v_sem
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and c.relname <> 'coupons'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if v_sem is not null then
    raise exception 'FALHOU: RLS ligada e nenhuma policy em: % (tabela invisivel por acidente)', v_sem;
  end if;
  raise notice '02 OK  toda tabela com RLS tem policy, menos coupons (de proposito)';
end $$;

-- ---------- Nenhuma função sem `search_path` fixo ----------
do $$
declare v_sem text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_sem
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app_private')
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%');

  if v_sem is not null then
    raise exception 'FALHOU: funcao sem search_path fixo: %', v_sem;
  end if;
  raise notice '03 OK  nenhuma funcao sem search_path fixo';
end $$;

-- ---------- `app_private` não é API ----------
do $$
declare v_exposta text;
begin
  select string_agg(p.proname, ', ') into v_exposta
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_private'
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));

  if v_exposta is not null then
    raise exception 'FALHOU: funcao de app_private executavel pelo cliente: %', v_exposta;
  end if;
  raise notice '04 OK  app_private roda por gatilho, e ninguem recebe EXECUTE';
end $$;

-- ---------- A view respeita a policy de quem consulta ----------
do $$
declare v_opcoes text;
begin
  select array_to_string(c.reloptions, ',') into v_opcoes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'vw_quiz_session_performance';

  if coalesce(v_opcoes, '') not like '%security_invoker=%' then
    raise exception 'FALHOU: vw_quiz_session_performance sem security_invoker — a view passaria por cima da RLS';
  end if;
  raise notice '05 OK  a view roda com a policy de quem consulta';
end $$;

-- ---------- As FKs que precisam ser compostas continuam compostas ----------
do $$
declare
  v_nome text;
  v_colunas integer;
  v_simples text := '';
begin
  foreach v_nome in array array[
    'class_students_class_fk',
    'goals_study_plan_fk',
    'goals_notebook_block_fk',
    'goal_entries_goal_fk',
    'quiz_sessions_study_plan_fk',
    'quiz_sessions_notebook_fk',
    'quiz_session_questions_session_fk',
    'theory_catalog_subject_rules_catalog_fk',
    'theory_review_rules_catalog_fk',
    'theory_lessons_catalog_fk',
    'study_plan_theory_catalogs_study_plan_fk',
    'study_plan_theory_catalogs_catalog_fk',
    'theory_progress_study_plan_fk',
    'theory_reviews_study_plan_fk'
  ] loop
    select array_length(conkey, 1) into v_colunas
      from pg_constraint where conname = v_nome and contype = 'f';

    if v_colunas is null then
      v_simples := v_simples || ' ' || v_nome || '(sumiu)';
    elsif v_colunas < 2 then
      v_simples := v_simples || ' ' || v_nome || '(virou coluna unica)';
    end if;
  end loop;

  if v_simples <> '' then
    raise exception 'FALHOU: FK que precisa ser composta:%', v_simples;
  end if;
  raise notice '06 OK  as catorze FKs compostas da auditoria continuam compostas';
end $$;

-- ---------- Nada de `GRANT ALL` por default ----------
--
-- O default é POR ROLE QUE CRIA: o `alter default privileges` da migration vale
-- para as tabelas criadas por quem rodou a migration, e é por isso que a
-- entrada de `supabase_admin` — que o projeto cria e este repositório não
-- governa — continua concedendo a anon. O que precisa estar certo é a entrada
-- de quem aplica migration aqui, e ela precisa EXISTIR: sumir é o mesmo que
-- voltar ao default do projeto, e uma asserção que só procura o grant errado
-- passaria em silêncio nesse caso.
do $$
declare v_acl text; v_dono text := 'postgres';
begin
  select array_to_string(d.defaclacl, ',') into v_acl
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    join pg_roles r on r.oid = d.defaclrole
   where n.nspname = 'public' and d.defaclobjtype = 'r' and r.rolname = v_dono;

  if v_acl is null then
    raise exception
      'FALHOU: sumiu o `alter default privileges ... revoke all on tables from anon, '
      'authenticated` de %: a proxima tabela volta a nascer com GRANT ALL', v_dono;
  end if;
  if v_acl like '%anon=%' or v_acl like '%authenticated=%' then
    raise exception 'FALHOU: o default de % voltou a conceder a anon/authenticated: %', v_dono, v_acl;
  end if;
  raise notice '07 OK  tabela criada por migration nao nasce com grant para anon nem authenticated';
end $$;

-- ---------- Os números do de-para ----------
do $$
declare v_tabelas integer; v_enums integer; v_fks integer; v_views integer;
begin
  select count(*) into v_tabelas from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';
  select count(*) into v_enums from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typtype = 'e';
  select count(*) into v_fks from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   where n.nspname = 'public' and c.contype = 'f';
  select count(*) into v_views from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v';

  if v_tabelas <> 24 or v_enums <> 12 or v_fks <> 53 or v_views <> 1 then
    raise exception
      'FALHOU: o schema mudou de tamanho (tabelas %, enums %, FKs %, views %). '
      'Se a mudanca e legitima, atualize a tabela "Estado dos dois lados" de '
      'docs/de-para-schema.md e este numero junto.',
      v_tabelas, v_enums, v_fks, v_views;
  end if;
  raise notice '08 OK  24 tabelas, 12 enums, 53 FKs e 1 view — como o de-para registra';
end $$;
