\set ON_ERROR_STOP on
\pset pager off
-- =============================================================================
-- Isolamento: quem enxerga o quê
-- =============================================================================
-- O caso que passa despercebido não é professor vendo aluno alheio — é ALUNO
-- vendo aluno do MESMO professor. Bruno e Carla dividem a professora Ana, e
-- metade das policies deste schema casa por `teacher_id`.
--
-- Onde o teste conta linhas em vez de esperar exceção, é porque a RLS FILTRA:
-- SELECT e UPDATE recusados por policy não levantam erro nenhum, devolvem
-- vazio. É a armadilha que o CLAUDE.md descreve, e um teste que espera exceção
-- aqui passaria sem provar nada.
-- =============================================================================

set role authenticated;

-- ---------- Aluno: só o próprio planejamento ----------
select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.study_plans;
  if v_total <> 1 then
    raise exception 'FALHOU: Bruno enxergou % planejamentos, esperava 1', v_total;
  end if;
  raise notice '01 OK  o aluno enxerga um planejamento: o dele';
end $$;

do $$
declare v_total integer;
begin
  select count(*) into v_total from public.goals;
  if v_total <> 4 then
    raise exception 'FALHOU: Bruno enxergou % metas, esperava 4', v_total;
  end if;
  raise notice '02 OK  o aluno enxerga as proprias metas, e so elas';
end $$;

-- ---------- Registro na meta de outro: barrado pela FK composta ----------
--
-- `goal_entries_insert` exige `student_id = auth.uid()`, e `student_id` é da
-- PRÓPRIA linha — quem insere escolhe o valor. O que recusa é a FK composta.
do $$ begin
  insert into public.goal_entries (goal_id, teacher_id, student_id, minutes, questions, correct_answers)
  values ('a5000000-0000-4000-8000-000000000004',
          '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',30,10,9);
  raise exception 'FALHOU: Bruno lancou registro na meta da Carla';
exception when foreign_key_violation then
  raise notice '03 OK  goal_entries_goal_fk recusa registro na meta de outro aluno';
end $$;

-- ---------- Escrita na meta de outro: filtrada em silêncio ----------
do $$
declare v_afetadas integer;
begin
  update public.goals set status = 'completed'
   where id = 'a5000000-0000-4000-8000-000000000004';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: Bruno alterou % meta(s) da Carla', v_afetadas;
  end if;
  raise notice '04 OK  UPDATE na meta de outro afeta 0 linhas (filtra, nao levanta)';
end $$;

-- ---------- Apagar meta do professor: policy decide pelo tipo ----------
do $$
declare v_afetadas integer;
begin
  delete from public.goals where id = 'a5000000-0000-4000-8000-000000000002';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: o aluno apagou a meta de teoria do professor';
  end if;
  raise notice '05 OK  o aluno nao apaga meta do professor';
end $$;

do $$
declare v_afetadas integer;
begin
  delete from public.goals where id = 'a5000000-0000-4000-8000-000000000006';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 1 then
    raise exception 'FALHOU: o aluno nao apagou o proprio estudo extra';
  end if;
  raise notice '06 OK  o aluno apaga o estudo extra que ele mesmo lancou';
end $$;

-- ---------- Perfis e o professor ----------
do $$
declare v_total integer; v_nome text;
begin
  select count(*) into v_total from public.profiles;
  if v_total <> 1 then
    raise exception 'FALHOU: Bruno enxergou % perfis, esperava so o dele', v_total;
  end if;

  -- `profiles_select` nunca deixa o aluno ler a linha do professor; o nome vem
  -- por função, que devolve id e nome e nada mais.
  select name into v_nome from public.my_teacher();
  if v_nome <> 'Professora Ana' then
    raise exception 'FALHOU: my_teacher() devolveu %', coalesce(v_nome, '<nulo>');
  end if;
  raise notice '07 OK  o aluno le so o proprio perfil, e o professor so por my_teacher()';
end $$;

-- ---------- Teoria de outro aluno ----------
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.theory_progress;
  if v_total <> 1 then
    raise exception 'FALHOU: Bruno enxergou % progressos de teoria', v_total;
  end if;
  raise notice '08 OK  progresso de teoria e do dono';
end $$;

-- ---------- O histórico de acesso é do aluno e de quem o liberou ----------
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.access_grants;
  if v_total <> 1 then
    raise exception 'FALHOU: Bruno enxergou % liberacoes, esperava a dele', v_total;
  end if;
  raise notice '08b OK  o aluno le a propria liberacao de acesso';
end $$;

-- ---------- Bateria de outro aluno ----------
select app_test.act_as('33333333-3333-4333-8333-333333333333');  -- Carla
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.quiz_sessions;
  if v_total <> 0 then
    raise exception 'FALHOU: Carla enxergou % baterias do Bruno', v_total;
  end if;
  raise notice '09 OK  a bateria de um aluno nao aparece para o colega de turma';
end $$;

do $$
declare v_total integer;
begin
  select count(*) into v_total from public.access_grants;
  if v_total <> 0 then
    raise exception 'FALHOU: Carla enxergou % liberacoes do Bruno', v_total;
  end if;
  raise notice '09b OK  a liberacao de um aluno nao aparece para o colega de turma';
end $$;

-- ---------- Professor: os próprios alunos, e nada além ----------
select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana
do $$
declare v_planos integer; v_perfis integer;
begin
  select count(*) into v_planos from public.study_plans;
  if v_planos <> 3 then
    raise exception 'FALHOU: Ana enxergou % planejamentos, esperava 3', v_planos;
  end if;

  -- O dela mais os três alunos.
  select count(*) into v_perfis from public.profiles;
  if v_perfis <> 4 then
    raise exception 'FALHOU: Ana enxergou % perfis, esperava 4', v_perfis;
  end if;
  raise notice '10 OK  o professor enxerga os proprios alunos, e so eles';
end $$;

select app_test.act_as('44444444-4444-4444-8444-444444444444');  -- Davi
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.study_plans;
  if v_total <> 1 then
    raise exception 'FALHOU: Davi enxergou % planejamentos, esperava 1', v_total;
  end if;
  raise notice '11 OK  professor de outra turma nao enxerga planejamento alheio';
end $$;

-- ---------- Planejamento para aluno alheio: `is_teacher_of` ----------
do $$ begin
  insert into public.study_plans (teacher_id, student_id, name, starts_on)
  values ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',
          'Plano invasor', current_date);
  raise exception 'FALHOU: Davi criou planejamento para o aluno da Ana';
exception when insufficient_privilege then
  raise notice '12 OK  is_teacher_of recusa planejamento para aluno de outro professor';
end $$;

-- ---------- Caderno dentro do planejamento de outro professor ----------
do $$ begin
  insert into public.study_plan_notebooks (
    study_plan_id, teacher_id, student_id, subject_key, subject_name,
    notebook_key, notebook_name
  ) values (
    'a2000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222','forenses','Ciências Forenses',
    'invasor','Caderno invasor');
  raise exception 'FALHOU: Davi criou caderno no planejamento da Ana';
exception when insufficient_privilege then
  raise notice '13 OK  o caderno so nasce no planejamento do proprio professor';
end $$;

-- ---------- Catálogo de teoria de outro professor ----------
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.theory_catalogs;
  if v_total <> 1 then
    raise exception 'FALHOU: Davi enxergou % catalogos de teoria, esperava 1', v_total;
  end if;
  raise notice '14 OK  catalogo de teoria e do professor que o criou';
end $$;

-- ---------- Matricular aluno alheio: `is_teacher_of` de novo ----------
--
-- `teacher_id = auth.uid()` diz que quem escreve é o professor da LINHA, que é
-- um valor que quem escreve escolheu. Quem confere pelo ALUNO é `is_teacher_of`.
do $$ begin
  insert into public.class_students (class_id, student_id, teacher_id)
  values ('a9000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',
          '44444444-4444-4444-8444-444444444444');
  raise exception 'FALHOU: Davi matriculou o aluno da Ana na turma dele';
exception when insufficient_privilege then
  raise notice '15 OK  is_teacher_of recusa matricular aluno de outro professor';
end $$;

-- Contado, e não esperando exceção: `class_students_update` filtra a linha da
-- Ana antes de o WITH CHECK ver qualquer coisa, e UPDATE recusado por policy
-- afeta zero linhas em silêncio.
do $$
declare v_afetadas integer;
begin
  update public.class_students set class_id = 'a9000000-0000-4000-8000-000000000002'
   where student_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU: Davi moveu % matricula(s) da turma da Ana', v_afetadas;
  end if;
  raise notice '16 OK  mover matricula alheia afeta 0 linhas (filtra, nao levanta)';
end $$;

-- A turma alheia também não é destino: a FK composta `class_students_class_fk`
-- confere de quem é a TURMA, e não só de quem é o aluno.
do $$
declare v_total integer;
begin
  select count(*) into v_total from public.classes;
  if v_total <> 1 then
    raise exception 'FALHOU: Davi enxergou % turmas, esperava a dele', v_total;
  end if;
  raise notice '17 OK  turma e do professor que a criou';
end $$;
