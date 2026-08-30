\pset pager off
\set ON_ERROR_STOP on
-- Vínculo do aluno e liberação de acesso — spec docs/specs/13-vinculo-e-liberacao-de-acesso.md
--
-- Cobre CA-08 a CA-16. Cria os próprios usuários (prof3 5555…, alunos 6666… e
-- 7777…) em vez de reaproveitar os das suítes anteriores: aluno1 e aluno2 já
-- têm professor vigente, e o que se testa aqui é justamente o caminho de quem
-- ainda não tem.
--
-- O que estas asserções seguram, e que nenhum teste de tela pega: que o vínculo
-- nasce sempre com quem chamou, que a fila não vira diretório de alunos
-- alheios, que o professor continua sem escrita em student_teacher_links, e que
-- liberar acesso sem vínculo é recusado pelo WITH CHECK.

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555','prof3@x.com','{"role":"teacher","name":"Prof Elis"}'),
  ('66666666-6666-6666-6666-666666666666','aluno3@x.com','{"role":"student","name":"Aluno Fabio"}'),
  ('77777777-7777-7777-7777-777777777777','aluno4@x.com','{"role":"student","name":"Aluno Gabi"}');

-- Os dois alunos se inscrevem na lista de espera, sem professor.
insert into public.waitlist (student_id, name, email, whatsapp, interest_area, focus_exam)
values
  ('66666666-6666-6666-6666-666666666666','Aluno Fabio','aluno3@x.com','41999990001','Policial','PCPR'),
  ('77777777-7777-7777-7777-777777777777','Aluno Gabi','aluno4@x.com','41999990002','Policial','PCPR');

set role authenticated;

-- ---------- CA-08: só professor vincula ----------
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false);
do $$ begin
  perform public.link_student('77777777-7777-7777-7777-777777777777',
                              'd0000000-0000-4000-8000-000000000001'::uuid);
  raise exception 'FALHOU: um aluno vinculou outro aluno';
exception when insufficient_privilege then
  raise notice '01 OK  link_student negado para quem nao e professor (42501)';
end $$;

-- ---------- A fila: o candidato aparece para um professor qualquer ----------
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false);
do $$
declare v_fila integer;
begin
  select count(*) into v_fila from public.waitlist
   where student_id in ('66666666-6666-6666-6666-666666666666',
                        '77777777-7777-7777-7777-777777777777');
  if v_fila <> 2 then
    raise exception 'FALHOU: o professor viu % candidatos de 2', v_fila;
  end if;
  raise notice '02 OK  os dois candidatos aparecem na fila do professor';
end $$;

-- O aluno de OUTRO professor não entra na fila: ele já tem vínculo vigente.
do $$
declare v_alheio integer;
begin
  select count(*) into v_alheio from public.waitlist
   where student_id = '22222222-2222-2222-2222-222222222222';
  if v_alheio <> 0 then
    raise exception 'FALHOU: aluno com professor vigente apareceu na fila';
  end if;
  raise notice '03 OK  aluno ja vinculado nao entra na fila (student_has_teacher)';
end $$;

-- ---------- CA-08: alvo precisa ser aluno ----------
do $$ begin
  perform public.link_student('11111111-1111-1111-1111-111111111111',
                              'd0000000-0000-4000-8000-000000000002'::uuid);
  raise exception 'FALHOU: vinculou um professor como se fosse aluno';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '04 OK  alvo que nao e aluno recusado: %', sqlerrm;
end $$;

do $$ begin
  perform public.link_student('00000000-0000-4000-8000-0000000000ff',
                              'd0000000-0000-4000-8000-000000000003'::uuid);
  raise exception 'FALHOU: vinculou um perfil inexistente';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '05 OK  perfil inexistente recusado: %', sqlerrm;
end $$;

-- ---------- CA-10: o vínculo nasce com quem chamou ----------
do $$
declare v_link public.student_teacher_links%rowtype;
begin
  select * into v_link from public.link_student(
    '66666666-6666-6666-6666-666666666666','d0000000-0000-4000-8000-000000000004'::uuid);
  if v_link.teacher_id <> '55555555-5555-5555-5555-555555555555' then
    raise exception 'FALHOU: teacher_id ficou % em vez de quem chamou', v_link.teacher_id;
  end if;
  if v_link.ended_at is not null then
    raise exception 'FALHOU: o vinculo nasceu encerrado';
  end if;
  raise notice '06 OK  vinculo criado com auth.uid() como teacher_id';
end $$;

-- ---------- CA-09: replay devolve o mesmo vínculo ----------
do $$
declare v_link public.student_teacher_links%rowtype; v_linhas integer;
begin
  select * into v_link from public.link_student(
    '66666666-6666-6666-6666-666666666666','d0000000-0000-4000-8000-000000000004'::uuid);
  select count(*) into v_linhas from public.student_teacher_links
   where student_id='66666666-6666-6666-6666-666666666666' and ended_at is null;
  if v_linhas <> 1 then
    raise exception 'FALHOU: o replay criou uma segunda linha (%)', v_linhas;
  end if;
  raise notice '07 OK  replay devolveu o mesmo vinculo, sem segunda linha';
end $$;

-- Mesmo com request_id NOVO, vincular de novo devolve o vínculo existente em
-- vez de esbarrar no índice. É o caminho de quem clica duas vezes com a página
-- recarregada no meio.
do $$
declare v_link public.student_teacher_links%rowtype; v_linhas integer;
begin
  select * into v_link from public.link_student(
    '66666666-6666-6666-6666-666666666666','d0000000-0000-4000-8000-000000000005'::uuid);
  select count(*) into v_linhas from public.student_teacher_links
   where student_id='66666666-6666-6666-6666-666666666666' and ended_at is null;
  if v_linhas <> 1 then
    raise exception 'FALHOU: request_id novo duplicou o vinculo (%)', v_linhas;
  end if;
  raise notice '08 OK  vincular de novo o mesmo par devolve o vinculo existente';
end $$;

-- ---------- CA-13: o candidato reivindicado sai da fila do outro ----------
-- A linha da lista de espera passou a ter teacher_id do prof3.
do $$
declare v_claim uuid;
begin
  select teacher_id into v_claim from public.waitlist
   where student_id='66666666-6666-6666-6666-666666666666';
  if v_claim is distinct from '55555555-5555-5555-5555-555555555555' then
    raise exception 'FALHOU: a lista de espera nao foi reivindicada (%)', v_claim;
  end if;
  raise notice '09 OK  link_student reivindicou a linha da lista de espera';
end $$;

-- Do ponto de vista do prof1, esse candidato agora está fora da fila.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_visivel integer;
begin
  select count(*) into v_visivel from public.waitlist
   where student_id='66666666-6666-6666-6666-666666666666';
  if v_visivel <> 0 then
    raise exception 'FALHOU: candidato reivindicado ainda visivel para outro professor';
  end if;
  raise notice '10 OK  candidato reivindicado sai da fila dos outros professores';
end $$;

-- Mas o que continua sem dono aparece para ele.
do $$
declare v_visivel integer;
begin
  select count(*) into v_visivel from public.waitlist
   where student_id='77777777-7777-7777-7777-777777777777';
  if v_visivel <> 1 then
    raise exception 'FALHOU: candidato livre invisivel para outro professor';
  end if;
  raise notice '11 OK  candidato sem dono continua visivel para qualquer professor';
end $$;

-- ---------- CA-09: aluno que já tem professor é recusado ----------
do $$ begin
  perform public.link_student('66666666-6666-6666-6666-666666666666',
                              'd0000000-0000-4000-8000-000000000006'::uuid);
  raise exception 'FALHOU: vinculou aluno que ja tem professor';
exception when raise_exception then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice '12 OK  aluno com professor vigente recusado: %', sqlerrm;
end $$;

-- ---------- CA-11: ninguém escreve direto em student_teacher_links ----------
do $$ begin
  insert into public.student_teacher_links (student_id, teacher_id)
  values ('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111');
  raise exception 'FALHOU: INSERT direto em student_teacher_links permitido';
exception when insufficient_privilege then
  raise notice '13 OK  INSERT direto em student_teacher_links negado';
end $$;

do $$ begin
  update public.student_teacher_links set ended_at = now();
  raise exception 'FALHOU: UPDATE direto em student_teacher_links permitido';
exception when insufficient_privilege then
  raise notice '14 OK  UPDATE direto em student_teacher_links negado';
end $$;

do $$ begin
  delete from public.student_teacher_links;
  raise exception 'FALHOU: DELETE em student_teacher_links permitido';
exception when insufficient_privilege then
  raise notice '15 OK  DELETE em student_teacher_links negado';
end $$;

-- ---------- CA-12: a policy nova é só de leitura ----------
-- O grant de UPDATE em waitlist existe para o dono; quem barra o professor é o
-- WITH CHECK de waitlist_own, que exige student_id = auth.uid(). A policy nova
-- é `for select` e não acrescenta caminho de escrita.
-- Os dois caminhos, porque eles falham de formas DIFERENTES e um teste que
-- cobrisse só um passaria por engano no dia em que a policy sumisse.
--
-- Candidato que não é aluno dele: a policy de UPDATE aplicável é a
-- `waitlist_own`, cujo `using` não casa — a linha não fica visível para a
-- operação e o comando afeta ZERO linhas, em silêncio, sem erro. Por isso conta
-- linhas com `get diagnostics`, como manda o CLAUDE.md.
do $$
declare v_afetadas integer;
begin
  update public.waitlist set focus_exam = 'invadido'
   where student_id = '77777777-7777-7777-7777-777777777777';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: professor escreveu na lista de espera alheia (% linhas)', v_afetadas;
  end if;
  raise notice '16 OK  UPDATE em candidato alheio filtrado pela RLS (0 linhas)';
end $$;

-- Aluno DELE: aqui o `using` casa por `is_teacher_of`, e quem barra é o
-- `with check (student_id = auth.uid())` — que levanta 42501 de verdade.
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false);
do $$ begin
  update public.waitlist set focus_exam = 'invadido'
   where student_id = '66666666-6666-6666-6666-666666666666';
  raise exception 'FALHOU: professor escreveu na lista de espera do proprio aluno';
exception when insufficient_privilege then
  raise notice '16b OK  UPDATE na lista de espera do proprio aluno negado (WITH CHECK)';
end $$;

-- E a linha continua como o aluno a deixou.
do $$
declare v_exam text;
begin
  select focus_exam into v_exam from public.waitlist
   where student_id='66666666-6666-6666-6666-666666666666';
  if v_exam is distinct from 'PCPR' then
    raise exception 'FALHOU: a lista de espera do aluno virou % — alguem escreveu nela', v_exam;
  end if;
  raise notice '16c OK  a lista de espera do aluno ficou intacta';
end $$;

-- ---------- CA-14: liberar acesso sem vínculo é recusado ----------
-- É o WITH CHECK de subscriptions_teacher_insert exigindo is_teacher_of. O
-- banco impõe a ordem: vincular antes, liberar depois.
do $$ begin
  insert into public.subscriptions (student_id, status, plan, validity)
  values ('77777777-7777-7777-7777-777777777777','active','turma',
          daterange(current_date, (current_date + interval '3 months')::date, '[)'));
  raise exception 'FALHOU: liberou acesso de aluno sem vinculo';
exception when insufficient_privilege then
  raise notice '17 OK  liberar acesso sem vinculo negado (WITH CHECK)';
end $$;

-- ---------- Liberar acesso do próprio aluno funciona ----------
insert into public.subscriptions (student_id, status, plan, validity)
values ('66666666-6666-6666-6666-666666666666','active','turma-2026',
        daterange(current_date, (current_date + interval '3 months')::date, '[)'));
select '18 OK  professor liberou o acesso do proprio aluno' item, status::text valor
  from public.subscriptions where student_id='66666666-6666-6666-6666-666666666666';

-- ---------- CA-15: uma ativa por aluno, e student_id fora do grant ----------
do $$ begin
  insert into public.subscriptions (student_id, status, plan, validity)
  values ('66666666-6666-6666-6666-666666666666','active','segunda',
          daterange(current_date, null, '[)'));
  raise exception 'FALHOU: aceitou duas assinaturas ativas para o mesmo aluno';
exception when unique_violation then
  raise notice '19 OK  segunda assinatura ativa bloqueada pelo indice parcial';
end $$;

do $$ begin
  update public.subscriptions set student_id='77777777-7777-7777-7777-777777777777'
   where student_id='66666666-6666-6666-6666-666666666666';
  raise exception 'FALHOU: moveu a assinatura para outro aluno';
exception when insufficient_privilege then
  raise notice '20 OK  UPDATE em student_id negado (grant por coluna)';
end $$;

do $$ begin
  delete from public.subscriptions where student_id='66666666-6666-6666-6666-666666666666';
  raise exception 'FALHOU: DELETE em subscriptions permitido';
exception when insufficient_privilege then
  raise notice '21 OK  DELETE em subscriptions negado';
end $$;

-- ---------- Suspender preserva a vigência ----------
do $$
declare v_antes daterange; v_depois daterange; v_status text;
begin
  select validity into v_antes from public.subscriptions
   where student_id='66666666-6666-6666-6666-666666666666' and status='active';

  update public.subscriptions set status='suspended'
   where student_id='66666666-6666-6666-6666-666666666666' and status='active';

  select status::text, validity into v_status, v_depois from public.subscriptions
   where student_id='66666666-6666-6666-6666-666666666666';

  if v_status <> 'suspended' then
    raise exception 'FALHOU: status ficou % em vez de suspended', v_status;
  end if;
  if v_depois is distinct from v_antes then
    raise exception 'FALHOU: suspender apagou a vigencia';
  end if;
  raise notice '22 OK  suspender troca o status e preserva a vigencia';
end $$;

reset role;

-- ---------- CA-16: privilégios das funções novas ----------
do $$
declare v_publico integer;
begin
  select count(*) into v_publico
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='link_student'
     and has_function_privilege('public', p.oid, 'execute');
  if v_publico <> 0 then
    raise exception 'FALHOU: link_student chamavel por PUBLIC';
  end if;
  raise notice '23 OK  link_student sem execute para PUBLIC';
end $$;

-- student_has_teacher PRECISA de execute para authenticated: a expressão de uma
-- policy é avaliada com o privilégio de quem consulta, não do dono da tabela.
-- Sem o grant, todo select em waitlist morre com permission denied. Mas PUBLIC
-- continua fora, como em toda função deste schema.
do $$
declare v_auth boolean; v_publico boolean;
begin
  select has_function_privilege('authenticated', p.oid, 'execute'),
         has_function_privilege('public', p.oid, 'execute')
    into v_auth, v_publico
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='student_has_teacher';
  if not v_auth then
    raise exception 'FALHOU: sem execute para authenticated, a policy de waitlist quebra';
  end if;
  if v_publico then
    raise exception 'FALHOU: student_has_teacher chamavel por PUBLIC';
  end if;
  raise notice '24 OK  student_has_teacher com execute para authenticated e sem PUBLIC';
end $$;

do $$
declare v_sem integer;
begin
  select count(*) into v_sem
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname in ('link_student','student_has_teacher')
     and not exists (
       select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%'
     );
  if v_sem <> 0 then
    raise exception 'FALHOU: % funcao(oes) sem set search_path = ''''', v_sem;
  end if;
  raise notice '25 OK  as duas declaram set search_path = ''''';
end $$;

-- ---------- A policy nova existe e é de leitura ----------
do $$
declare v_cmd text;
begin
  select cmd into v_cmd from pg_policies
   where schemaname='public' and tablename='waitlist' and policyname='waitlist_teacher_read';
  if v_cmd is null then
    raise exception 'FALHOU: a policy waitlist_teacher_read nao existe';
  end if;
  if v_cmd <> 'SELECT' then
    raise exception 'FALHOU: waitlist_teacher_read virou % em vez de SELECT', v_cmd;
  end if;
  raise notice '26 OK  waitlist_teacher_read existe e e for select';
end $$;
