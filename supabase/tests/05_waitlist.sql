\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Lista de espera — a única porta que fica aberta para quem ainda não tem acesso
-- =============================================================================
-- `profiles` e `waitlist` ficam fora de `has_active_access()` de propósito: é
-- por elas que um aluno pendente pede acesso, e fechá-las trancaria a porta de
-- entrada. Em troca, as duas amarram identidade — o e-mail do cadastro tem de
-- ser o do JWT, e o vínculo não muda depois.
-- =============================================================================

set role authenticated;
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno

-- ---------- O cadastro é do próprio, com o e-mail do próprio ----------
do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'Aluno Bruno','outro@x.com','41999990000','Fiscal','Receita Federal');
  raise exception 'FALHOU: cadastrou a lista de espera com e-mail de outra pessoa';
exception when insufficient_privilege then
  raise notice '01 OK  o e-mail do cadastro tem de ser o do JWT';
end $$;

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam, status)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'Aluno Bruno','bruno@x.com','41999990000','Fiscal','Receita Federal','released');
  raise exception 'FALHOU: o aluno se liberou sozinho no INSERT';
exception when insufficient_privilege then
  raise notice '02 OK  o cadastro nasce `waiting`, e nao liberado';
end $$;

do $$ begin
  insert into public.waitlist (student_id, teacher_id, name, email, whatsapp, interest_area, target_exam)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
          'Aluno Bruno','bruno@x.com','41999990000','Fiscal','Receita Federal');
  raise notice '03 OK  o aluno se cadastra na lista do proprio professor';
end $$;

-- ---------- O vínculo do cadastro é imutável ----------
do $$ begin
  update public.waitlist set teacher_id = '44444444-4444-4444-8444-444444444444'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o aluno trocou de professor pela lista de espera';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '04 OK  protect_waitlist_identity congela aluno, professor e e-mail';
end $$;

do $$ begin
  update public.waitlist set email = 'terceiro@x.com'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'FALHOU: o e-mail do cadastro mudou depois de criado';
exception when raise_exception then
  if sqlerrm not like '%vinculos do cadastro%' then raise; end if;
  raise notice '05 OK  o e-mail do cadastro tambem e identidade';
end $$;

do $$ begin
  update public.waitlist set whatsapp = '41988887777'
   where student_id = '22222222-2222-4222-8222-222222222222';
  raise notice '06 OK  o que nao e identidade o proprio aluno corrige';
end $$;

-- ---------- Liberar é do professor ----------
do $$
declare v_afetadas integer;
begin
  update public.waitlist set status = 'released'
   where student_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: o aluno se liberou sozinho';
  end if;
  raise notice '07 OK  o aluno nao muda o proprio status (USING exige `waiting` dos dois lados)';
exception when insufficient_privilege then
  raise notice '07 OK  o aluno nao muda o proprio status';
end $$;

-- ---------- Quem não é da turma não enxerga o cadastro ----------
select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.waitlist;
  if v_total <> 0 then
    raise exception 'FALHOU: Davi enxergou % cadastros da turma da Ana', v_total;
  end if;
  raise notice '08 OK  o cadastro so aparece para o aluno e para o professor dele';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_total integer; v_status public.waitlist_status;
begin
  select count(*) into v_total from public.waitlist;
  if v_total <> 1 then
    raise exception 'FALHOU: Ana enxergou % cadastros, esperava 1', v_total;
  end if;

  update public.waitlist set status = 'released'
   where student_id = '22222222-2222-4222-8222-222222222222';
  select status into v_status from public.waitlist
   where student_id = '22222222-2222-4222-8222-222222222222';
  if v_status <> 'released' then
    raise exception 'FALHOU: o professor nao conseguiu liberar o cadastro';
  end if;
  raise notice '09 OK  liberar o cadastro e do professor da turma';
end $$;
