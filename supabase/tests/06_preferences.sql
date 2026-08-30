\pset pager off
\set ON_ERROR_STOP on
-- Preferência de interface da conta — spec docs/specs/11-tema-claro-escuro.md
--
-- Cobre CA-09 a CA-12. Usa os usuários criados pela suíte 01 (prof1 1111…,
-- aluno1 2222…): o run.sh limpa o seed antes de rodar e as suítes compartilham
-- a base, em sequência.
--
-- O que estas asserções seguram, e que nenhum teste de tela pega: que a
-- preferência é da CONTA e não do aluno (o professor grava a dele), que o
-- grant por coluna recusa mover a linha entre perfis, e que o valor é enum e
-- não texto.

set role authenticated;

-- ---------- PODE: o professor tem preferência, como qualquer perfil ----------
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

insert into public.user_preferences (profile_id) values (auth.uid());
select '01 OK  professor criou a propria linha' item, theme::text valor
  from public.user_preferences where profile_id='11111111-1111-1111-1111-111111111111';

-- ---------- PODE: o aluno cria e troca a dele ----------
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

insert into public.user_preferences (profile_id) values (auth.uid());
select '02 OK  ausencia de escolha nasce light' item, theme::text valor
  from public.user_preferences where profile_id=auth.uid();

update public.user_preferences set theme='dark' where profile_id=auth.uid();
select '03 OK  aluno trocou para dark' item, theme::text valor
  from public.user_preferences where profile_id=auth.uid();

do $$
declare v_antes timestamptz; v_depois timestamptz;
begin
  select updated_at into v_antes from public.user_preferences where profile_id=auth.uid();
  perform pg_sleep(0.01);
  update public.user_preferences set theme='light' where profile_id=auth.uid();
  select updated_at into v_depois from public.user_preferences where profile_id=auth.uid();
  if v_depois <= v_antes then
    raise exception 'FALHOU: updated_at nao avancou — o gatilho nao esta ligado';
  end if;
  raise notice '04 OK  updated_at mantido pelo gatilho';
end $$;

-- ---------- NÃO PODE: escrever a linha de outro perfil ----------
-- O INSERT levanta 42501, porque é o WITH CHECK que barra.
do $$ begin
  insert into public.user_preferences (profile_id, theme)
  values ('11111111-1111-1111-1111-111111111111','dark');
  raise exception 'FALHOU: criou preferencia para outro perfil';
exception when insufficient_privilege then
  raise notice '05 OK  INSERT para outro perfil negado (WITH CHECK)';
end $$;

-- O UPDATE não levanta nada: a RLS FILTRA em silêncio e o comando afeta zero
-- linhas. Um teste que esperasse exceção aqui passaria por engano no dia em
-- que a policy sumisse — por isso conta linhas.
do $$
declare v_afetadas integer;
begin
  update public.user_preferences set theme='dark'
   where profile_id='11111111-1111-1111-1111-111111111111';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: alterou a preferencia de outro perfil (% linhas)', v_afetadas;
  end if;
  raise notice '06 OK  UPDATE em linha alheia filtrado pela RLS (0 linhas)';
end $$;

-- E a linha do professor continua como ele a deixou. A conferência precisa ser
-- feita COM O JWT DELE: a RLS também filtra o SELECT, então contar daqui, como
-- aluno, devolveria zero mesmo que o UPDATE acima tivesse funcionado — a
-- asserção passaria sem provar nada.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_theme text;
begin
  select theme::text into v_theme from public.user_preferences where profile_id=auth.uid();
  if v_theme is distinct from 'light' then
    raise exception 'FALHOU: a preferencia do professor virou % — alguem escreveu nela', v_theme;
  end if;
  raise notice '07 OK  preferencia do professor intacta (light)';
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- NÃO PODE: mover a própria linha para outro perfil ----------
-- `profile_id` está fora do GRANT UPDATE. A RLS recusaria pelo WITH CHECK, mas
-- o grant por coluna recusa antes — é a terceira defesa do CLAUDE.md.
do $$ begin
  update public.user_preferences set profile_id='11111111-1111-1111-1111-111111111111'
   where profile_id=auth.uid();
  raise exception 'FALHOU: moveu a linha para outro perfil';
exception when insufficient_privilege then
  raise notice '08 OK  UPDATE em profile_id negado (grant por coluna)';
end $$;

-- ---------- NÃO PODE: apagar fisicamente ----------
do $$ begin
  delete from public.user_preferences where profile_id=auth.uid();
  raise exception 'FALHOU: DELETE fisico permitido';
exception when insufficient_privilege then
  raise notice '09 OK  DELETE negado em user_preferences';
end $$;

-- ---------- NÃO PODE: valor fora do enum ----------
-- É o que separa enum de texto livre: 'escuro' era um valor válido enquanto a
-- coluna era `text default 'claro'`.
do $$ begin
  update public.user_preferences set theme='escuro' where profile_id=auth.uid();
  raise exception 'FALHOU: aceitou valor fora do enum';
exception when invalid_text_representation then
  raise notice '10 OK  valor fora de light/dark recusado';
end $$;

do $$ begin
  update public.user_preferences set theme='system' where profile_id=auth.uid();
  raise exception 'FALHOU: aceitou um terceiro valor';
exception when invalid_text_representation then
  raise notice '11 OK  nao existe terceiro valor (sem "seguir o sistema")';
end $$;

reset role;

-- ---------- student_preferences perdeu a coluna ----------
do $$
declare v_existe boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='student_preferences' and column_name='theme'
  ) into v_existe;
  if v_existe then
    raise exception 'FALHOU: student_preferences ainda tem a coluna theme';
  end if;
  raise notice '12 OK  student_preferences nao tem mais theme';
end $$;

-- E o resto dela continua de pé: a migration removeu uma coluna, não a tabela.
do $$
declare v_colunas integer;
begin
  select count(*) into v_colunas from information_schema.columns
   where table_schema='public' and table_name='student_preferences'
     and column_name in ('student_id','cycle_config','review_config','updated_at');
  if v_colunas <> 4 then
    raise exception 'FALHOU: student_preferences perdeu coluna alem de theme (% de 4)', v_colunas;
  end if;
  raise notice '13 OK  as demais colunas de student_preferences intactas';
end $$;
