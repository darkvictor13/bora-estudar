\set ON_ERROR_STOP on
-- =============================================================================
-- Vade Mecum e marcações (spec 40)
-- =============================================================================
-- O conteúdo vem de `scripts/load-law-library.mjs`, que o `run.sh` roda logo
-- depois do reset. Tudo aqui é desfeito no fim.
-- =============================================================================
begin;

-- ---------- CA-01: a carga trouxe o arquivo inteiro ----------
do $$ begin
  if (select count(*) from public.legal_norms) <> 46 then
    raise exception 'FALHOU: % normas, esperava 46', (select count(*) from public.legal_norms);
  end if;
  if (select count(*) from public.laws) <> 15
     or (select count(*) from public.law_articles where retired_at is null) <> 768 then
    raise exception 'FALHOU: a biblioteca nao tem as 15 leis e os 768 artigos';
  end if;
  if (select count(*) from public.exam_notices) <> 3 or (select count(*) from public.exam_notice_items) <> 69 then
    raise exception 'FALHOU: os mapas de edital nao tem 3 editais e 69 itens';
  end if;
  if (select sum(article_count) from public.vw_law_library) <> 768 then
    raise exception 'FALHOU: vw_law_library nao conta os artigos';
  end if;
  raise notice '01 OK  46 normas, 15 leis, 768 artigos, 3 editais e 69 itens';
end $$;

-- ---------- R-LEI-05: "tem texto" é calculado, não guardado ----------
do $$ begin
  if (select count(distinct i.norm_id) from public.exam_notice_items i
        join public.laws l on l.norm_id = i.norm_id) <> 15 then
    raise exception 'FALHOU: os mapas nao reconhecem as 15 normas com texto';
  end if;
  raise notice '02 OK  as 15 normas com texto aparecem nos mapas pelo vinculo';
end $$;

-- Um aluno pendente, como na suíte 17.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'b7000000-0000-4000-8000-000000000011',
   'authenticated', 'authenticated', 'gil.leis@x.com', '{"name":"Aluno Gil"}');

set role authenticated;

-- ---------- CA-03: quem lê o texto ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno, ativo
do $$ begin
  if (select count(*) from public.law_articles) <> 768 then
    raise exception 'FALHOU: aluno com acesso vigente nao le os artigos';
  end if;
  raise notice '03 OK  aluno com acesso vigente le os 768 artigos';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora
do $$ begin
  if (select count(*) from public.law_articles) <> 768 then
    raise exception 'FALHOU: professor nao le os artigos';
  end if;
  raise notice '04 OK  professor le os artigos';
end $$;

select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  if (select count(*) from public.law_articles) <> 0 then
    raise exception 'FALHOU: aluna vencida le o texto das leis';
  end if;
  if (select count(*) from public.laws) <> 15 or (select count(*) from public.exam_notice_items) <> 69 then
    raise exception 'FALHOU: aluna vencida perdeu o indice da biblioteca';
  end if;
  raise notice '05 OK  aluna vencida le o indice e nenhum artigo';
end $$;

select app_test.act_as('b7000000-0000-4000-8000-000000000011');  -- Gil, pendente
do $$ begin
  if (select count(*) from public.law_articles) <> 0 then
    raise exception 'FALHOU: aluno pendente le o texto das leis';
  end if;
  raise notice '06 OK  aluno pendente nao le artigo nenhum';
end $$;

-- ---------- CA-04: marcações são do aluno ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
insert into public.law_marks
  (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset, quote, prefix, suffix, style, color)
values
  ('c4000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'lai', 'lai-art-1', 0, 8, 16, 'Esta Lei', 'Art. 1º ', ' dispõe sobre', 'highlight', 'yellow');

do $$ begin
  update public.law_marks set color = 'mint' where id = 'c4000000-0000-4000-8000-000000000001';
  if (select color from public.law_marks where id = 'c4000000-0000-4000-8000-000000000001') <> 'mint' then
    raise exception 'FALHOU: o aluno nao altera a propria marcacao';
  end if;
  raise notice '07 OK  o aluno cria e altera a propria marcacao';
end $$;

-- ---------- CA-05: as colunas de contexto ficam fora do grant ----------
do $$ begin
  update public.law_marks set student_id = '33333333-3333-4333-8333-333333333333'
   where id = 'c4000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o aluno trocou o dono da marcacao';
exception when insufficient_privilege then
  raise notice '08 OK  student_id fora do grant update';
end $$;

do $$ begin
  update public.law_marks set law_id = 'ld', article_id = 'ld-art-1'
   where id = 'c4000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: o aluno moveu a marcacao para outra lei';
exception when insufficient_privilege then
  raise notice '09 OK  law_id e article_id fora do grant update';
end $$;

-- ---------- CA-06: o que o banco recusa ----------
do $$ begin
  insert into public.law_marks
    (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset, quote, style, color)
  values ('c4000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
          'ld', 'lai-art-1', 0, 8, 16, 'Esta Lei', 'highlight', 'yellow');
  raise exception 'FALHOU: marcacao com artigo de outra lei foi aceita';
exception when insufficient_privilege or foreign_key_violation then
  raise notice '10 OK  artigo de outra lei e recusado';
end $$;

do $$ begin
  insert into public.law_marks
    (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset, quote, style, color)
  values ('c4000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
          'lai', 'lai-art-1', 0, 8, 16, 'Esta', 'highlight', 'yellow');
  raise exception 'FALHOU: quote de tamanho errado foi aceito';
exception when check_violation then
  raise notice '11 OK  quote precisa ter o tamanho do trecho';
end $$;

do $$ begin
  insert into public.law_marks
    (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset, quote, style, color)
  values ('c4000000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
          'lai', 'lai-art-1', 0, 8, 16, 'Esta Lei', 'highlight', 'yellow');
  raise exception 'FALHOU: o aluno criou marcacao em nome de outro';
exception when insufficient_privilege then
  raise notice '12 OK  marcacao so nasce para quem escreve';
end $$;

select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla, colega
do $$
declare v_rows integer;
begin
  if (select count(*) from public.law_marks) <> 0 then
    raise exception 'FALHOU: a colega le a marcacao de Bruno';
  end if;
  update public.law_marks set color = 'pink' where id = 'c4000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a colega alterou a marcacao de Bruno'; end if;
  delete from public.law_marks where id = 'c4000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU: a colega apagou a marcacao de Bruno'; end if;
  raise notice '13 OK  a colega le, altera e apaga zero marcacoes de Bruno';
end $$;

-- A vencida lê o que é dela e não escreve.
reset role;
insert into public.law_marks
  (id, student_id, law_id, article_id, paragraph_index, start_offset, end_offset, quote, style, color)
values ('c4000000-0000-4000-8000-000000000005', '66666666-6666-4666-8666-666666666666',
        'lai', 'lai-art-1', 0, 8, 16, 'Esta Lei', 'underline', 'blue');
set role authenticated;
select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  if (select count(*) from public.law_marks) <> 1 then
    raise exception 'FALHOU: a aluna vencida perdeu a leitura das proprias marcacoes';
  end if;
  update public.law_marks set color = 'pink' where id = 'c4000000-0000-4000-8000-000000000005';
  raise exception 'FALHOU: a aluna vencida alterou uma marcacao';
exception when insufficient_privilege then
  raise notice '14 OK  vencida le as proprias marcacoes e nao as altera';
end $$;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_rows integer;
begin
  delete from public.law_marks where id = 'c4000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU: o aluno nao apaga a propria marcacao'; end if;
  raise notice '15 OK  o aluno apaga a propria marcacao';
end $$;

reset role;

-- ---------- R-LEI-03: artigo marcado não se apaga ----------
do $$ begin
  delete from public.law_articles where id = 'lai-art-1';
  raise exception 'FALHOU: um artigo marcado foi apagado';
exception when foreign_key_violation then
  raise notice '16 OK  artigo com marcacao nao se apaga';
end $$;

rollback;
