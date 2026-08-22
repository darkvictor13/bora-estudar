\pset pager off
\set ON_ERROR_STOP on
-- Fronteira da escrita do professor: planejamento abre, execução não.
--
-- Usa os usuários criados pela suíte 01 (prof1 1111…, aluno1 2222…) e o aluno
-- de outro professor da suíte 02 (4444…): o run.sh limpa o seed antes de rodar.

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

-- ---------- PODE: planejamento ----------
insert into public.study_plans (student_id, teacher_id, name, target_exam, start_date, status)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
        'Plano criado pela aplicacao','PCPR', current_date, 'draft');
select '01 OK  criou planejamento' item, count(*)::text valor
  from public.study_plans where name='Plano criado pela aplicacao';

update public.study_plans set name='Plano renomeado', weekly_goals=30
 where name='Plano criado pela aplicacao';
select '02 OK  editou planejamento' item, weekly_goals::text valor
  from public.study_plans where name='Plano renomeado';

insert into public.study_plan_blocks
  (study_plan_id, student_id, teacher_id, subject_name, name, subject_order, block_order)
select id,'22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
       'Nova materia','Bloco novo', 50, 0
  from public.study_plans where name='Plano renomeado';
select '03 OK  criou bloco' item, count(*)::text valor
  from public.study_plan_blocks where name='Bloco novo';

update public.study_plan_blocks set active=false where name='Bloco novo';
select '04 OK  desativou bloco' item, (not active)::text valor
  from public.study_plan_blocks where name='Bloco novo';

update public.study_plan_blocks set deleted_at=now() where name='Bloco novo';
select '05 OK  soft delete do bloco' item, (deleted_at is not null)::text valor
  from public.study_plan_blocks where name='Bloco novo';

-- Liberar o acesso do aluno é escrita de planejamento, não de execução.
insert into public.subscriptions (student_id, status, plan, validity)
values ('22222222-2222-2222-2222-222222222222','active','turma-2026',
        daterange(current_date, null, '[)'));
select '06 OK  liberou acesso do aluno' item, status::text valor
  from public.subscriptions where student_id='22222222-2222-2222-2222-222222222222';

update public.subscriptions set status='suspended'
 where student_id='22222222-2222-2222-2222-222222222222';
select '06b OK  suspendeu acesso' item, status::text valor
  from public.subscriptions where student_id='22222222-2222-2222-2222-222222222222';

-- ---------- NÃO PODE: mover linha para outro dono ----------
do $$ begin
  update public.study_plans set teacher_id='44444444-4444-4444-4444-444444444444'
   where name='Plano renomeado';
  raise exception 'FALHOU: conseguiu trocar o teacher_id';
exception when insufficient_privilege then
  raise notice '07 OK  UPDATE em teacher_id negado (grant por coluna)';
end $$;

do $$ begin
  update public.goals set student_id='44444444-4444-4444-4444-444444444444';
  raise exception 'FALHOU: conseguiu trocar o student_id da meta';
exception when insufficient_privilege then
  raise notice '08 OK  UPDATE em student_id negado (grant por coluna)';
end $$;

-- ---------- NÃO PODE: criar para aluno de outro professor ----------
do $$ begin
  insert into public.study_plans (student_id, teacher_id, name, start_date, status)
  values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          'Plano para quem nao e meu aluno', current_date, 'draft');
  raise exception 'FALHOU: criou planejamento para aluno sem vinculo';
exception when insufficient_privilege then
  raise notice '09 OK  INSERT para aluno sem vinculo negado (WITH CHECK)';
end $$;

-- ---------- NÃO PODE: apagar fisicamente ----------
do $$ begin
  delete from public.study_plans where name='Plano renomeado';
  raise exception 'FALHOU: DELETE fisico permitido';
exception when insufficient_privilege then
  raise notice '10 OK  DELETE fisico negado em study_plans';
end $$;

-- ---------- NÃO PODE: tocar na execução ----------
do $$ begin
  insert into public.quiz_sessions
    (study_plan_id, student_id, teacher_id, block_id, execution_sequence, session_number)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', gen_random_uuid(), 1, 1);
  raise exception 'FALHOU: escreveu em quiz_sessions';
exception when insufficient_privilege then
  raise notice '11 OK  INSERT em quiz_sessions negado (so por RPC)';
end $$;

do $$ begin
  update public.quiz_sessions set duration_minutes=1;
  raise exception 'FALHOU: alterou quiz_sessions';
exception when insufficient_privilege then
  raise notice '12 OK  UPDATE em quiz_sessions negado';
end $$;

do $$ begin
  insert into public.quiz_session_questions
    (quiz_session_id, question_id, execution_order, phase, outcome, answered_at)
  values (gen_random_uuid(), 1, 1, 'main', 'correct', now());
  raise exception 'FALHOU: escreveu no ledger';
exception when insufficient_privilege then
  raise notice '13 OK  INSERT no ledger negado';
end $$;

do $$ begin
  insert into public.audit_log (table_name, record_id, action)
  values ('goals', gen_random_uuid(), 'insert');
  raise exception 'FALHOU: escreveu no audit_log';
exception when insufficient_privilege then
  raise notice '14 OK  INSERT em audit_log negado';
end $$;

-- ---------- NÃO PODE: catálogo (é do admin) ----------
do $$ begin
  insert into public.catalogs (key, name) values ('pirata','Catalogo pirata');
  raise exception 'FALHOU: professor escreveu no catalogo';
exception when insufficient_privilege then
  raise notice '15 OK  professor nao escreve no catalogo';
end $$;

-- ---------- ALUNO não escreve planejamento ----------
-- Atenção ao modo de falha: em UPDATE e DELETE a RLS FILTRA, ela não levanta
-- erro. A linha simplesmente não é visível para a operação e o comando afeta
-- zero linhas. Só o WITH CHECK, no INSERT e no UPDATE, levanta 42501.
-- Um teste que espere exceção aqui passa por engano quando a policy sumir.
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare v_afetadas integer;
begin
  update public.study_plans set name='aluno mandando';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: aluno alterou % planejamento(s)', v_afetadas;
  end if;
  raise notice '16 OK  aluno nao altera planejamento (RLS filtrou, 0 linhas)';
end $$;

do $$ begin
  insert into public.study_plan_blocks
    (study_plan_id, student_id, teacher_id, subject_name, name, subject_order, block_order)
  values (gen_random_uuid(),'22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111','x','y',99,0);
  raise exception 'FALHOU: aluno criou bloco';
exception when insufficient_privilege then
  raise notice '17 OK  aluno nao cria bloco';
end $$;

do $$
declare v_afetadas integer;
begin
  update public.subscriptions set status='active' where student_id=auth.uid();
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: aluno liberou o proprio acesso';
  end if;
  raise notice '18 OK  aluno nao libera o proprio acesso (RLS filtrou, 0 linhas)';
end $$;

-- E o aluno também não consegue se vincular a outro professor para enxergar
-- turma alheia: student_teacher_links não tem grant de escrita para ninguém.
do $$ begin
  insert into public.student_teacher_links (student_id, teacher_id)
  values (auth.uid(), '33333333-3333-3333-3333-333333333333');
  raise exception 'FALHOU: aluno criou vinculo com outro professor';
exception when insufficient_privilege then
  raise notice '19 OK  ninguem escreve em student_teacher_links pelo client';
end $$;

reset role;
