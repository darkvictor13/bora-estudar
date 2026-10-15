\set ON_ERROR_STOP on
-- =============================================================================
-- Biblioteca de resumos flash e anotações (migrations 20261012205121,
-- 20261012212626 e 20261015120000)
-- =============================================================================
-- O que esta suíte ataca: o texto do resumo só com acesso vigente, o bucket que
-- NÃO entrega o `.docx` original, e a anotação — que é do aluno, não do
-- professor, e não se perde por causa de uma segunda aba nem de um payload que
-- não cabe na URL. Tudo aqui é desfeito no fim.
-- =============================================================================
begin;

insert into public.summary_topics (id, subject, title, position, source_name, source_hash, blocks)
values ('teste-resumo', 'Direito Penal', 'Inquérito', 0, 'teste.docx', 'abc',
        '[{"type":"paragraph","text":"Texto do resumo."}]');

-- Os dois objetos do bucket: a imagem que o importador gera e o original.
insert into storage.objects (bucket_id, name) values
  ('flash-summaries', 'pf2029/' || repeat('a', 64) || '.png'),
  ('flash-summaries', 'pf2029/source.docx');

-- Fabi tem uma anotação antiga, de quando o acesso vigorava.
insert into public.summary_annotations (user_id, topic_id, notes)
values ('66666666-6666-4666-8666-666666666666', 'teste-resumo',
        '[{"id":"velha","path":"0","start":0,"end":5,"quote":"Texto","style":"bold","color":"#146a4a","comment":""}]');

-- ---------- 01: o texto do resumo só com acesso vigente (ou professor) ----------
set role authenticated;

do $$ begin
  perform app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno, vigente
  if (select count(*) from public.summary_topics) <> 1 then
    raise exception 'FALHOU: o aluno com acesso nao le o resumo';
  end if;
  perform app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencido
  if (select count(*) from public.summary_topics) <> 0 then
    raise exception 'FALHOU: o aluno com acesso vencido le o texto do resumo';
  end if;
  perform app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora
  if (select count(*) from public.summary_topics) <> 1 then
    raise exception 'FALHOU: o professor nao le o resumo';
  end if;
  raise notice '01 OK  texto do resumo: vigente e professor leem, vencido nao';
end $$;

-- ---------- 02: o catálogo não tem escrita para ninguém de fora da carga ----------
do $$ begin
  perform app_test.act_as('11111111-1111-4111-8111-111111111111');  -- até a professora
  begin
    insert into public.summary_topics (id, subject, title, position, source_name, source_hash, blocks)
    values ('invasor', 'X', 'X', 1, 'x', 'x', '[]');
    raise exception 'FALHOU: authenticated inseriu um resumo';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.summary_topics set title = 'alterado';
    raise exception 'FALHOU: authenticated alterou um resumo';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.summary_topics;
    raise exception 'FALHOU: authenticated apagou um resumo';
  exception when insufficient_privilege then null;
  end;
  raise notice '02 OK  summary_topics e so leitura: INSERT, UPDATE e DELETE dao 42501';
end $$;

-- ---------- 03: anônimo não lê o resumo nem chama a função ----------
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.summary_topics;
    raise exception 'FALHOU: anon leu summary_topics';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_summary_notes('teste-resumo', '[]', '[]');
    raise exception 'FALHOU: anon executou save_summary_notes';
  exception when insufficient_privilege then null;
  end;
  raise notice '03 OK  anon nao le o resumo nem executa a RPC de anotacao';
end $$;
reset role;
set role authenticated;

-- ---------- 04: salvar, replay, estado anterior e conflito ----------
do $$
declare
  v_um   jsonb := '[{"id":"a","path":"0","start":0,"end":5,"quote":"Texto","style":"highlight","color":"#ffee00","comment":""}]';
  v_dois jsonb := '[{"id":"a","path":"0","start":0,"end":5,"quote":"Texto","style":"highlight","color":"#ffee00","comment":""},
                    {"id":"b","path":"0","start":6,"end":9,"quote":"do ","style":"bold","color":"#146a4a","comment":""}]';
begin
  perform app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno

  if not public.save_summary_notes('teste-resumo', '[]', v_um) then
    raise exception 'FALHOU: a primeira gravacao (sem linha) foi recusada';
  end if;
  if not public.save_summary_notes('teste-resumo', '[]', v_um) then
    raise exception 'FALHOU: o replay de quem ja gravou acusou conflito contra o proprio resultado';
  end if;
  -- Outra aba ainda acha que não há nada, e quer gravar outra coisa.
  if public.save_summary_notes('teste-resumo', '[]', v_dois) then
    raise exception 'FALHOU: estado anterior desatualizado sobrescreveu a anotacao';
  end if;
  if not public.save_summary_notes('teste-resumo', v_um, v_dois) then
    raise exception 'FALHOU: a gravacao com o estado anterior correto foi recusada';
  end if;
  if (select notes from public.summary_annotations
       where user_id = '22222222-2222-4222-8222-222222222222' and topic_id = 'teste-resumo') <> v_dois then
    raise exception 'FALHOU: o que ficou gravado nao e o ultimo estado aceito';
  end if;
  -- Quem acha que havia anotação e não há linha nenhuma está desatualizado.
  perform app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
  if public.save_summary_notes('teste-resumo', v_um, v_dois) then
    raise exception 'FALHOU: gravou numa linha que nao existe a partir de um estado que nunca foi dela';
  end if;
  raise notice '04 OK  save_summary_notes: grava, replay devolve true, estado antigo da conflito';
end $$;

-- ---------- 05: o corpo grande passa — nada disso depende de URL ----------
do $$
declare
  v_antes jsonb;
  v_muitas jsonb;
begin
  perform app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
  select jsonb_agg(jsonb_build_object(
           'id', i::text, 'path', '0', 'start', i * 10, 'end', i * 10 + 5,
           'quote', repeat('q', 40), 'style', 'comment', 'color', '#d4aa20',
           'comment', repeat('c', 200)))
    into v_muitas from generate_series(1, 300) i;
  if length(v_muitas::text) < 80000 then
    raise exception 'FALHOU: o teste nao montou um corpo grande (% bytes)', length(v_muitas::text);
  end if;
  if not public.save_summary_notes('teste-resumo', '[]', v_muitas) then
    raise exception 'FALHOU: 300 anotacoes (~% KB) nao foram gravadas', length(v_muitas::text) / 1024;
  end if;
  -- E o estado anterior do tamanho de um resumo anotado continua comparável.
  if not public.save_summary_notes('teste-resumo', v_muitas, '[]') then
    raise exception 'FALHOU: a comparacao com um estado anterior grande falhou';
  end if;
  raise notice '05 OK  300 anotacoes (~% KB) gravam e se comparam sem passar pela URL', length(v_muitas::text) / 1024;
end $$;

-- ---------- 06: o isolamento é por aluno, e vale para o professor ----------
do $$ begin
  perform app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
  if exists (select 1 from public.summary_annotations
              where user_id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'FALHOU: Carla le a anotacao de Bruno';
  end if;
  perform app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora de ambos
  if exists (select 1 from public.summary_annotations
              where user_id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')) then
    raise exception 'FALHOU: a professora le a anotacao pessoal do aluno';
  end if;
  raise notice '06 OK  anotacao e pessoal: nem outro aluno nem a professora leem';
end $$;

-- ---------- 07: dono e tópico ficam fora do grant de UPDATE; a escrita alheia é recusada ----------
do $$ begin
  perform app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
  begin
    update public.summary_annotations set user_id = '33333333-3333-4333-8333-333333333333'
     where user_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FALHOU: o aluno trocou o dono da anotacao';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.summary_annotations set topic_id = 'outro'
     where user_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FALHOU: o aluno trocou o topico da anotacao';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.summary_annotations (user_id, topic_id, notes)
    values ('33333333-3333-4333-8333-333333333333', 'teste-resumo', '[]');
    -- Carla já tinha linha em 05? Não: terminou em '[]' mas a linha existe, e a PK recusaria
    -- com outro código. O que importa é que a escrita em nome dela não passa.
    raise exception 'FALHOU: Bruno gravou anotacao em nome de Carla';
  exception when insufficient_privilege or unique_violation then null;
  end;
  begin
    delete from public.summary_annotations;
    raise exception 'FALHOU: authenticated apagou anotacao (nao ha grant de DELETE)';
  exception when insufficient_privilege then null;
  end;
  raise notice '07 OK  user_id e topic_id fora do UPDATE, sem INSERT em nome alheio, sem DELETE';
end $$;

-- ---------- 08: o formato tem teto no banco ----------
do $$ begin
  perform app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
  begin
    perform public.save_summary_notes('teste-resumo', (select notes from public.summary_annotations
      where user_id = '22222222-2222-4222-8222-222222222222' and topic_id = 'teste-resumo'),
      '{"nao":"e lista"}');
    raise exception 'FALHOU: o banco aceitou notes que nao e array';
  exception when check_violation then null;
  end;
  begin
    perform public.save_summary_notes('teste-resumo', (select notes from public.summary_annotations
      where user_id = '22222222-2222-4222-8222-222222222222' and topic_id = 'teste-resumo'),
      (select jsonb_agg(jsonb_build_object('id', i::text)) from generate_series(1, 2001) i));
    raise exception 'FALHOU: o banco aceitou 2001 anotacoes';
  exception when check_violation then null;
  end;
  raise notice '08 OK  notes: so array, no maximo 2000';
end $$;

-- ---------- 09: acesso vencido — replay passa, escrita nova não ----------
do $$
declare
  v_velha jsonb := '[{"id":"velha","path":"0","start":0,"end":5,"quote":"Texto","style":"bold","color":"#146a4a","comment":""}]';
begin
  perform app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
  if not public.save_summary_notes('teste-resumo', '[]', v_velha) then
    raise exception 'FALHOU: a retentativa de quem gravou antes de vencer foi recusada';
  end if;
  begin
    perform public.save_summary_notes('teste-resumo', v_velha, '[]');
    raise exception 'FALHOU: acesso vencido gravou anotacao nova';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.summary_annotations
       where user_id = '66666666-6666-4666-8666-666666666666') <> 1 then
    raise exception 'FALHOU: a aluna vencida nao le a propria anotacao';
  end if;
  raise notice '09 OK  acesso vencido: replay devolve true, escrita nova da 42501, leitura da propria continua';
end $$;

-- ---------- 10: o bucket entrega a imagem e NUNCA o original ----------
do $$
declare v_nomes text;
begin
  perform app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno, vigente
  select string_agg(name, ',' order by name) into v_nomes
    from storage.objects where bucket_id = 'flash-summaries';
  if v_nomes is distinct from 'pf2029/' || repeat('a', 64) || '.png' then
    raise exception 'FALHOU: o aluno enxerga no bucket: %', coalesce(v_nomes, '(nada)');
  end if;
  perform app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora
  if exists (select 1 from storage.objects where bucket_id = 'flash-summaries' and name like '%source.docx') then
    raise exception 'FALHOU: a professora enxerga o .docx original';
  end if;
  perform app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
  if exists (select 1 from storage.objects where bucket_id = 'flash-summaries') then
    raise exception 'FALHOU: o aluno com acesso vencido enxerga o bucket';
  end if;
  raise notice '10 OK  bucket: so pf2029/<sha256>.<imagem>, e so com acesso vigente; o original nao sai';
end $$;

reset role;

-- O bucket recusa o que o importador nunca envia: HTML numa URL assinada seria XSS.
do $$
declare v_tipos text[];
begin
  if (select public from storage.buckets where id = 'flash-summaries') then
    raise exception 'FALHOU: o bucket flash-summaries e publico';
  end if;
  select allowed_mime_types into v_tipos from storage.buckets where id = 'flash-summaries';
  if v_tipos is null or 'text/html' = any (v_tipos) then
    raise exception 'FALHOU: o bucket aceita qualquer tipo de arquivo';
  end if;
  raise notice '11 OK  bucket privado e com lista de tipos aceitos';
end $$;

rollback;
