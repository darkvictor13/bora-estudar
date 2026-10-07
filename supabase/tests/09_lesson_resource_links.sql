\set ON_ERROR_STOP on
begin;
set role authenticated;

-- O professor publica links estáveis na própria aula.
select app_test.act_as('11111111-1111-4111-8111-111111111111');
update public.theory_lessons
   set published = true,
       pdf_url = 'https://fronteira.example/materiais/prf/aula-01.pdf',
       tec_questions_url = 'https://www.tecconcursos.com.br/questoes/123',
       material_blocks = '[{"title":"Organização do Estado","pdf":"https://fronteira.example/materiais/prf/aula-01.pdf","tecQuestions":"https://www.tecconcursos.com.br/questoes/123","qcQuestions":null}]'::jsonb
 where id = 'b2000000-0000-4000-8000-000000000001';

do $$ begin
  update public.theory_lessons
     set flashcards_url = 'https://media.example/cards?access_token=segredo'
   where id = 'b2000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: aceitou link com token de sessao';
exception when check_violation then
  raise notice '01 OK  link com token de sessao e recusado';
end $$;

do $$ begin
  update public.theory_lessons
     set flashcards_url = 'javascript:alert(1)'
   where id = 'b2000000-0000-4000-8000-000000000001';
  raise exception 'FALHOU: aceitou esquema nao HTTPS';
exception when check_violation then
  raise notice '02 OK  somente links HTTPS sao aceitos';
end $$;

-- O aluno vinculado pode abrir os links, mas nao alterá-los.
select app_test.act_as('22222222-2222-4222-8222-222222222222');
do $$ declare v_link text; v_blocks jsonb; begin
  select pdf_url, material_blocks into v_link, v_blocks from public.theory_lessons
   where id = 'b2000000-0000-4000-8000-000000000001';
  if v_link <> 'https://fronteira.example/materiais/prf/aula-01.pdf' then
    raise exception 'FALHOU: aluno nao le o link da aula';
  end if;
  if v_blocks->0->>'title' <> 'Organização do Estado' then
    raise exception 'FALHOU: aluno nao le os blocos da aula';
  end if;
  raise notice '03 OK  aluno le o material do professor';
end $$;

do $$ declare v_count integer; begin
  update public.theory_lessons set pdf_url = 'https://outro.example/aula.pdf'
   where id = 'b2000000-0000-4000-8000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'FALHOU: aluno alterou link da aula'; end if;
  raise notice '04 OK  aluno nao altera o material';
end $$;

-- Uma aula retirada de circulação fica invisível ao aluno, mas editável pelo professor.
select app_test.act_as('11111111-1111-4111-8111-111111111111');
update public.theory_lessons set published = false
 where id = 'b2000000-0000-4000-8000-000000000001';
select app_test.act_as('22222222-2222-4222-8222-222222222222');
do $$ declare v_count integer; begin
  select count(*) into v_count from public.theory_lessons
   where id = 'b2000000-0000-4000-8000-000000000001';
  if v_count <> 0 then raise exception 'FALHOU: aluno le aula em rascunho'; end if;
  raise notice '05 OK  aula em rascunho nao aparece ao aluno';
end $$;
-- O link do caderno e os de bloco e aula seguem a mesma regra da aula: `https://`
-- e nada mais (QA-24, N-06). Antes um professor gravava `javascript:` pela API, e
-- a tela do aluno o renderizava como `href`.
select app_test.act_as('11111111-1111-4111-8111-111111111111');
do $$
declare v text;
begin
  foreach v in array array['javascript:alert(1)', 'http://x.com', 'https://a b.com', 'ftp://x.com/y'] loop
    begin
      update public.study_plan_notebooks set notebook_link = v
       where id = 'a3000000-0000-4000-8000-000000000001';
      if not found then raise exception 'FALHOU: sem linha para atacar'; end if;
      raise exception 'FALHOU: notebook_link aceitou %', v;
    exception when check_violation then null;
    end;
  end loop;
  raise notice '06 OK  notebook_link recusa javascript:, http:, espaco e outros esquemas';
end $$;

do $$ begin
  update public.study_plan_notebooks set notebook_link = ''
   where id = 'a3000000-0000-4000-8000-000000000001';
  if not found then raise exception 'FALHOU: sem linha para atacar'; end if;
  update public.study_plan_notebooks set notebook_link = 'https://www.tecconcursos.com.br/'
   where id = 'a3000000-0000-4000-8000-000000000001';
  raise notice '07 OK  notebook_link aceita vazio e qualquer https';
end $$;

do $$ begin
  insert into public.subject_blocks (subject_id, name, link)
  values ('a1000000-0000-4000-8000-000000000001', 'Bloco', 'javascript:alert(1)');
  raise exception 'FALHOU: subject_blocks.link aceitou javascript:';
exception when check_violation then
  raise notice '08 OK  subject_blocks.link recusa javascript:';
end $$;

do $$ begin
  insert into public.subject_lessons (subject_id, name, link)
  values ('a1000000-0000-4000-8000-000000000001', 'Aula', 'javascript:alert(1)');
  raise exception 'FALHOU: subject_lessons.link aceitou javascript:';
exception when check_violation then
  raise notice '09 OK  subject_lessons.link recusa javascript:';
end $$;

do $$ begin
  insert into public.subject_blocks (subject_id, name, link)
  values ('a1000000-0000-4000-8000-000000000001', 'Bloco sem link', null),
         ('a1000000-0000-4000-8000-000000000001', 'Bloco com link', 'https://www.tecconcursos.com.br/');
  raise notice '10 OK  subject_blocks.link aceita nulo e https';
end $$;
rollback;
