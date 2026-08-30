\pset pager off
\set ON_ERROR_STOP on
-- Grant por coluna em profiles — spec docs/specs/27-dados-do-professor.md
--
-- Cobre CA-01 a CA-03. Usa os usuários da suíte 01.
--
-- O que estas asserções seguram, e que nenhum teste de tela pega: que a frase
-- "para trocar o e-mail, fale com o professor" é verdade na fronteira, e não só
-- na tela; e que ninguém vira professor por conta própria.

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

-- ---------- CA-02: o dono grava nome e telefone ----------
do $$
declare v_nome text;
begin
  update public.profiles set name = 'Aluno Bruno Corrigido', phone = '41999998888'
   where id = '22222222-2222-2222-2222-222222222222';

  select name into v_nome from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if v_nome <> 'Aluno Bruno Corrigido' then
    raise exception 'FALHOU: o nome ficou %', v_nome;
  end if;
  raise notice '01 OK  o dono grava nome e telefone';
end $$;

-- ---------- CA-01: contact_email esta fora do grant ----------
do $$ begin
  update public.profiles set contact_email = 'outro@x.com'
   where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FALHOU: o dono trocou o proprio e-mail de contato';
exception when insufficient_privilege then
  raise notice '02 OK  contact_email esta fora do grant update';
end $$;

-- ---------- CA-01 e R-CONTA-08: ninguem vira professor ----------
do $$ begin
  update public.profiles set role = 'teacher'
   where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FALHOU: um aluno se promoveu a professor';
exception when insufficient_privilege then
  raise notice '03 OK  role esta fora do grant update';
end $$;

-- A policy tambem recusa, e as duas defesas valem: um grant esquecido numa
-- migration futura nao reabre o buraco sozinho.
reset role;
do $$
declare v_check text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v_check
    from pg_policy where polname = 'profiles_update_own';
  if v_check is null or v_check not like '%role%' then
    raise exception 'FALHOU: profiles_update_own nao protege mais o papel';
  end if;
  raise notice '04 OK  a policy tambem amarra o papel (defesa dupla)';
end $$;

-- ---------- CA-03: ninguem escreve o perfil de outro ----------
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare v_afetadas integer;
begin
  -- UPDATE filtra em silencio: a linha nao fica visivel para a operacao e o
  -- comando afeta zero linhas, sem erro. Conta-se a linha, nao se espera
  -- excecao — e a armadilha que o CLAUDE.md descreve.
  update public.profiles set name = 'Invadido'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: o aluno alterou % perfil(is) alheio(s)', v_afetadas;
  end if;
  raise notice '05 OK  ninguem escreve o perfil de outro (0 linhas)';
end $$;

-- ---------- O professor tambem grava o proprio ----------
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_nome text;
begin
  update public.profiles set name = 'Prof Ana Corrigida'
   where id = '11111111-1111-1111-1111-111111111111';

  select name into v_nome from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if v_nome <> 'Prof Ana Corrigida' then
    raise exception 'FALHOU: o professor nao gravou o proprio nome (%)', v_nome;
  end if;
  raise notice '06 OK  o professor grava o proprio nome';
end $$;

-- ---------- A check da tabela continua sendo o minimo absoluto ----------
do $$ begin
  update public.profiles set name = 'A'
   where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALHOU: aceitou nome de 1 caractere';
exception when check_violation then
  raise notice '07 OK  nome com menos de 2 caracteres e recusado pela constraint';
end $$;

-- Devolve os nomes, porque as suites seguintes leem estes usuarios.
update public.profiles set name = 'Prof Ana'
 where id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
update public.profiles set name = 'Aluno Bruno'
 where id = '22222222-2222-2222-2222-222222222222';

reset role;
