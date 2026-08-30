\pset pager off
\set ON_ERROR_STOP on
-- Revisão espaçada — spec docs/specs/24-revisao-espacada.md
--
-- Cobre CA-04 a CA-07. Cria a própria disciplina ("Revisão Teste", subject_order
-- 90) com quatro blocos: as suítes compartilham a base, e uma grade precisa de
-- vários blocos na mesma disciplina, que o bloco único da suíte 01 não dá.
--
-- O que estas asserções seguram, e que nenhum teste de tela pega: que o aluno
-- não escreve o próprio espaçamento, que as colunas de contexto estão fora do
-- grant, que desmarcar não apaga, e que quem não é dono nem professor leva 42501.

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

-- Quatro blocos da mesma disciplina, em ordem. O quarto nasce excluído: ele
-- prova que bloco fora do planejamento é recusado.
insert into public.study_plan_blocks (id,study_plan_id,student_id,teacher_id,
        subject_name,name,subject_order,block_order,deleted_at)
values
  ('bbbb0000-0000-0000-0000-000000000091','aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
   'Revisão Teste','Aula 1',90,0,null),
  ('bbbb0000-0000-0000-0000-000000000092','aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
   'Revisão Teste','Aula 2',90,1,null),
  ('bbbb0000-0000-0000-0000-000000000093','aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
   'Revisão Teste','Aula 3',90,2,null),
  ('bbbb0000-0000-0000-0000-000000000094','aaaa0000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
   'Revisão Teste','Aula 4 excluída',90,3,now());

-- ---------- CA-04: o professor com vínculo escreve ----------
do $$ begin
  insert into public.review_spacings (study_plan_id, student_id, teacher_id,
                                      subject_name, first_interval, second_interval)
  values ('aaaa0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111','Revisão Teste',2,3);
  raise notice '01 OK  o professor do aluno define o espacamento';
end $$;

-- Uma disciplina por planejamento: o índice parcial recusa a segunda linha.
do $$ begin
  insert into public.review_spacings (study_plan_id, student_id, teacher_id,
                                      subject_name, first_interval, second_interval)
  values ('aaaa0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111','Revisão Teste',9,9);
  raise exception 'FALHOU: aceitou dois espacamentos para a mesma disciplina';
exception when unique_violation then
  raise notice '02 OK  um espacamento por (plano, disciplina)';
end $$;

-- 0 a 60: 61 é recusado pela check, não pela tela.
do $$ begin
  insert into public.review_spacings (study_plan_id, student_id, teacher_id,
                                      subject_name, first_interval, second_interval)
  values ('aaaa0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111','Fora da faixa',61,0);
  raise exception 'FALHOU: aceitou espacamento 61';
exception when check_violation then
  raise notice '03 OK  espacamento fora de 0..60 recusado pela constraint';
end $$;

-- ---------- CA-04: o aluno não escreve o próprio espaçamento ----------
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  insert into public.review_spacings (study_plan_id, student_id, teacher_id,
                                      subject_name, first_interval, second_interval)
  values ('aaaa0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111','Aluno Inventou',1,1);
  raise exception 'FALHOU: o aluno definiu o proprio espacamento';
exception when insufficient_privilege then
  raise notice '04 OK  o aluno nao escreve review_spacings (42501)';
end $$;

-- Mas lê o que o professor definiu.
do $$
declare v_r1 smallint;
begin
  select first_interval into v_r1 from public.review_spacings
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001' and subject_name='Revisão Teste';
  if v_r1 is distinct from 2 then
    raise exception 'FALHOU: o aluno leu % em vez de 2', coalesce(v_r1::text,'nada');
  end if;
  raise notice '05 OK  o aluno le o espacamento definido pelo professor';
end $$;

-- ---------- CA-05: colunas de contexto fora do grant ----------
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  update public.review_spacings
     set student_id = '44444444-4444-4444-4444-444444444444'
   where subject_name = 'Revisão Teste';
  raise exception 'FALHOU: o professor moveu a linha para outro aluno';
exception when insufficient_privilege then
  raise notice '06 OK  student_id esta fora do grant update';
end $$;

do $$ begin
  update public.review_spacings set subject_name = 'Outra' where subject_name = 'Revisão Teste';
  raise exception 'FALHOU: o professor trocou a disciplina da linha';
exception when insufficient_privilege then
  raise notice '07 OK  subject_name esta fora do grant update';
end $$;

-- O que ESTÁ no grant funciona.
do $$
declare v_r2 smallint;
begin
  update public.review_spacings set second_interval = 4 where subject_name = 'Revisão Teste';
  select second_interval into v_r2 from public.review_spacings where subject_name = 'Revisão Teste';
  if v_r2 <> 4 then raise exception 'FALHOU: o intervalo nao mudou'; end if;
  raise notice '08 OK  o professor altera os dois intervalos';
end $$;

-- Um professor SEM vínculo não enxerga a linha. UPDATE filtra em silêncio: o
-- comando afeta zero linhas e não levanta nada. Conta-se a linha, não se espera
-- exceção — é a armadilha que o CLAUDE.md descreve.
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false);
do $$
declare v_lidas integer; v_afetadas integer;
begin
  select count(*) into v_lidas from public.review_spacings
   where study_plan_id = 'aaaa0000-0000-0000-0000-000000000001';
  if v_lidas <> 0 then
    raise exception 'FALHOU: professor alheio leu % espacamento(s)', v_lidas;
  end if;

  update public.review_spacings set first_interval = 99
   where study_plan_id = 'aaaa0000-0000-0000-0000-000000000001';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: professor alheio alterou % linha(s)', v_afetadas;
  end if;
  raise notice '09 OK  professor sem vinculo nao le nem altera (0 linhas)';
end $$;

-- ---------- CA-06: set_review_done é idempotente ----------
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare v_id1 uuid; v_id2 uuid; v_vivas integer;
begin
  v_id1 := (public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
              'bbbb0000-0000-0000-0000-000000000091'::uuid, 1::smallint, true)).id;
  v_id2 := (public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
              'bbbb0000-0000-0000-0000-000000000091'::uuid, 1::smallint, true)).id;

  if v_id1 is distinct from v_id2 then
    raise exception 'FALHOU: a segunda chamada criou outra linha';
  end if;

  select count(*) into v_vivas from public.review_completions
   where study_plan_block_id='bbbb0000-0000-0000-0000-000000000091' and deleted_at is null;
  if v_vivas <> 1 then
    raise exception 'FALHOU: % linha(s) viva(s) apos duas marcacoes', v_vivas;
  end if;
  raise notice '10 OK  marcar duas vezes deixa uma linha so';
end $$;

-- Desmarcar escreve deleted_at e NÃO apaga.
do $$
declare v_vivas integer; v_total integer;
begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            'bbbb0000-0000-0000-0000-000000000091'::uuid, 1::smallint, false);

  select count(*) filter (where deleted_at is null), count(*)
    into v_vivas, v_total
    from public.review_completions
   where study_plan_block_id='bbbb0000-0000-0000-0000-000000000091';

  if v_vivas <> 0 then raise exception 'FALHOU: sobrou marcacao viva'; end if;
  if v_total <> 1 then raise exception 'FALHOU: a linha foi apagada fisicamente'; end if;
  raise notice '11 OK  desmarcar escreve deleted_at e nao apaga';
end $$;

-- Desmarcar de novo é no-op, não erro: a RPC leva a um estado.
do $$ begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            'bbbb0000-0000-0000-0000-000000000091'::uuid, 1::smallint, false);
  raise notice '12 OK  desmarcar o que nao estava marcado e no-op';
end $$;

-- Remarcar revive a MESMA linha: o índice parcial só admite uma viva.
do $$
declare v_total integer; v_vivas integer;
begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            'bbbb0000-0000-0000-0000-000000000091'::uuid, 1::smallint, true);
  select count(*) filter (where deleted_at is null), count(*)
    into v_vivas, v_total
    from public.review_completions
   where study_plan_block_id='bbbb0000-0000-0000-0000-000000000091';
  if v_vivas <> 1 or v_total <> 1 then
    raise exception 'FALHOU: remarcar deixou % viva(s) de % total', v_vivas, v_total;
  end if;
  raise notice '13 OK  remarcar revive a mesma linha';
end $$;

-- ---------- CA-07: quem marca ----------
-- O professor do aluno também marca: é ele quem conduz a revisão em atendimento.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_quem uuid;
begin
  v_quem := (public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
               'bbbb0000-0000-0000-0000-000000000092'::uuid, 2::smallint, true)).completed_by;
  if v_quem <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FALHOU: completed_by ficou %', v_quem;
  end if;
  raise notice '14 OK  o professor do aluno marca, e fica registrado quem marcou';
end $$;

-- Um terceiro não marca.
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$ begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            'bbbb0000-0000-0000-0000-000000000093'::uuid, 1::smallint, true);
  raise exception 'FALHOU: um estranho marcou revisao alheia';
exception when insufficient_privilege then
  raise notice '15 OK  quem nao e dono nem professor leva 42501';
end $$;

-- ---------- Recusas de argumento ----------
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            'bbbb0000-0000-0000-0000-000000000091'::uuid, 3::smallint, true);
  raise exception 'FALHOU: aceitou ordinal 3';
exception when invalid_parameter_value then
  raise notice '16 OK  ordinal fora de 1..2 recusado';
end $$;

do $$ begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            'bbbb0000-0000-0000-0000-000000000094'::uuid, 1::smallint, true);
  raise exception 'FALHOU: aceitou marcar revisao de bloco excluido';
exception when no_data_found then
  raise notice '17 OK  bloco excluido recusado';
end $$;

-- Bloco de outro planejamento, mesmo existindo.
do $$ begin
  perform public.set_review_done('aaaa0000-0000-0000-0000-000000000001'::uuid,
            gen_random_uuid(), 1::smallint, true);
  raise exception 'FALHOU: aceitou bloco inexistente';
exception when no_data_found then
  raise notice '18 OK  bloco fora do planejamento recusado';
end $$;

-- ---------- A marcação sobrevive à mudança do espaçamento ----------
-- A chave é o BLOCO, não a linha da grade: é a divergência deliberada da v96,
-- onde `disciplina:linha:tipo:aula` órfãava tudo ao mexer no intervalo.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare v_vivas integer;
begin
  update public.review_spacings set first_interval = 1, second_interval = 1
   where subject_name = 'Revisão Teste';

  select count(*) into v_vivas from public.review_completions
   where study_plan_id='aaaa0000-0000-0000-0000-000000000001' and deleted_at is null;
  if v_vivas <> 2 then
    raise exception 'FALHOU: sobraram % marcacoes de 2 apos mudar o espacamento', v_vivas;
  end if;
  raise notice '19 OK  mudar o espacamento nao perde marcacao';
end $$;

-- ---------- A auditoria registrou ----------
do $$
declare v_linhas integer;
begin
  select count(*) into v_linhas from public.audit_log
   where table_name in ('review_spacings','review_completions');
  if v_linhas = 0 then
    raise exception 'FALHOU: nada foi auditado';
  end if;
  raise notice '20 OK  espacamento e marcacao entram no audit_log (% linhas)', v_linhas;
end $$;

-- ---------- search_path e grants da função ----------
reset role;
do $$
declare v_falta text;
begin
  select string_agg(p.proname, ', ') into v_falta
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_review_done'
     and not exists (
       select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%'
     );
  if v_falta is not null then
    raise exception 'FALHOU: sem set search_path: %', v_falta;
  end if;
  raise notice '21 OK  set_review_done tem set search_path';
end $$;

do $$
declare v_publico boolean;
begin
  select has_function_privilege('public','public.set_review_done(uuid,uuid,smallint,boolean)','execute')
    into v_publico;
  if v_publico then
    raise exception 'FALHOU: PUBLIC ainda executa set_review_done';
  end if;
  raise notice '22 OK  execute revogado de PUBLIC';
end $$;
