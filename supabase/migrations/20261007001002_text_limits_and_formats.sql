-- Tetos, formatos e nomes únicos — QA-15, QA-16, QA-19, QA-24 e N-06 (QA de 06/10/2026).
--
-- O QUE ESTA MIGRATION FEZ COM OS DADOS (só existia staging, com dado de teste):
--   1. texto acima do teto foi cortado no teto, sem aviso; `quote` de marcação
--      acima do teto foi APAGADA (cortar viola length(quote) = end - start);
--   2. nome com menos de 3 caracteres: perfil -> null, turma -> 'Turma sem
--      nome', planejamento -> 'Planejamento sem nome';
--   3. turma, planejamento e deck pessoal repetidos (ignorando maiúsculas e
--      espaço nas pontas) ganharam " (2)", " (3)"…; o mais antigo ficou
--      intacto. Deck não foi fundido: fundir arrastaria cartões e revisões;
--   4. link que não é https:// virou '' (caderno) ou null (bloco, aula);
--   5. inscrição com WhatsApp fora do formato foi APAGADA; nascimento fora de
--      1900-01-01..hoje virou null.
--
-- Compatível com o bundle no ar: só restringe o que ele grava. O que o bundle
-- antigo mandar fora da regra volta 23514/23505 com a frase genérica, até o
-- bundle novo chegar.
--
-- A ORDEM IMPORTA: tetos -> pisos -> duplicatas -> links -> lista de espera ->
-- constraints -> índices -> gatilho. Cortar no teto cria duplicata nova (dois
-- nomes de 487 caracteres com o mesmo começo), e o piso precisa ver o valor já
-- cortado.
--
-- O TETO MEDE O VALOR GRAVADO, E O PISO MEDE SEM AS PONTAS. As catorze CHECKs
-- que antes mediam `char_length(btrim(x))` dos dois lados são recriadas com o
-- mesmo nome: `'abc' || repeat(' ', 1000000)` passava num teto de 160.

-- 0. O índice antigo de planejamento sai ANTES de tudo -------------------------
-- Ele é único em `(teacher_id, student_id, name)` pelo valor exato: cortar dois
-- nomes de 487 e 500 caracteres com o mesmo começo (item 1) o violaria no meio
-- da própria migration. O novo, que ignora caixa e pontas, nasce no item 7,
-- depois de as duplicatas serem renomeadas (item 3).
drop index public.study_plans_name_per_student_uidx;

-- 1. Tetos -------------------------------------------------------------------
-- Nome: apara, corta e apara de novo (o corte pode terminar num espaço).
update public.profiles    set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
update public.classes     set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
update public.study_plans set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
update public.waitlist    set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;

-- Perfil: o grant de INSERT é da tabela inteira, por isso `plan`, `coupon_used`
-- e `access_origin` também.
update public.profiles set plan = left(plan, 120)                where char_length(plan) > 120;
update public.profiles set coupon_used = left(coupon_used, 64)   where char_length(coupon_used) > 64;
update public.profiles set access_origin = left(access_origin, 64) where char_length(access_origin) > 64;

update public.classes set description = left(description, 2000) where char_length(description) > 2000;

update public.study_plans set area = left(area, 120)               where char_length(area) > 120;
update public.study_plans set stage = left(stage, 120)             where char_length(stage) > 120;
update public.study_plans set study_model = left(study_model, 120) where char_length(study_model) > 120;
update public.study_plans set target_exam = left(target_exam, 200) where char_length(target_exam) > 200;

update public.goals set subject = left(subject, 120)           where char_length(subject) > 120;
update public.goals set title = left(title, 200)               where char_length(title) > 200;
update public.goals set lesson = left(lesson, 200)             where char_length(lesson) > 200;
update public.goals set block = left(block, 200)               where char_length(block) > 200;
update public.goals set description = left(description, 2000)  where char_length(description) > 2000;
update public.goals set weekday_name = left(weekday_name, 20)  where char_length(weekday_name) > 20;

-- O registro de estudo escreve nestas duas pela RPC (o aluno perdeu o INSERT
-- direto no 5c), e a RPC não corta: a CHECK é a única barreira do servidor.
update public.goal_entries set note = left(note, 2000)               where char_length(note) > 2000;
update public.goal_entries set manual_lesson = left(manual_lesson, 200) where char_length(manual_lesson) > 200;

update public.study_plan_notebooks set subject_key = left(subject_key, 120)     where char_length(subject_key) > 120;
update public.study_plan_notebooks set subject_name = left(subject_name, 120)   where char_length(subject_name) > 120;
update public.study_plan_notebooks set notebook_key = left(notebook_key, 120)   where char_length(notebook_key) > 120;
update public.study_plan_notebooks set notebook_name = left(notebook_name, 200) where char_length(notebook_name) > 200;
update public.study_plan_notebooks set subject_color = left(subject_color, 7)   where char_length(subject_color) > 7;

update public.subjects set name = left(name, 120)   where char_length(name) > 120;
update public.subjects set color = left(color, 7)   where char_length(color) > 7;
update public.subject_blocks  set name = left(name, 200) where char_length(name) > 200;
update public.subject_lessons set name = left(name, 200) where char_length(name) > 200;

update public.theory_catalogs set key = left(key, 120)                   where char_length(key) > 120;
update public.theory_catalogs set name = left(name, 200)                 where char_length(name) > 200;
update public.theory_catalogs set description = left(description, 2000)  where char_length(description) > 2000;

update public.theory_subject_rules         set subject = left(subject, 120)         where char_length(subject) > 120;
update public.theory_subject_rules         set subject_key = left(subject_key, 120) where char_length(subject_key) > 120;
update public.theory_catalog_subject_rules set subject = left(subject, 120)         where char_length(subject) > 120;
update public.theory_catalog_subject_rules set subject_key = left(subject_key, 120) where char_length(subject_key) > 120;
update public.theory_review_rules          set subject = left(subject, 120)         where char_length(subject) > 120;
update public.theory_review_rules          set subject_key = left(subject_key, 120) where char_length(subject_key) > 120;

update public.theory_lessons set subject = left(subject, 120)           where char_length(subject) > 120;
update public.theory_lessons set subject_key = left(subject_key, 120)   where char_length(subject_key) > 120;
update public.theory_lessons set title = left(title, 200)               where char_length(title) > 200;
update public.theory_lessons set lesson_code = left(lesson_code, 40)    where char_length(lesson_code) > 40;
update public.theory_lessons set pdf_file = left(pdf_file, 255)         where char_length(pdf_file) > 255;
update public.theory_lessons set note = left(note, 2000)                where char_length(note) > 2000;
update public.theory_lessons set pdf_url = left(pdf_url, 2048)                       where char_length(pdf_url) > 2048;
update public.theory_lessons set flashcards_url = left(flashcards_url, 2048)         where char_length(flashcards_url) > 2048;
update public.theory_lessons set flash_summary_url = left(flash_summary_url, 2048)   where char_length(flash_summary_url) > 2048;
update public.theory_lessons set tec_questions_url = left(tec_questions_url, 2048)   where char_length(tec_questions_url) > 2048;
update public.theory_lessons set qc_questions_url = left(qc_questions_url, 2048)     where char_length(qc_questions_url) > 2048;

-- `quote` não se corta: o corte viola `length(quote) = end_offset - start_offset`.
delete from public.law_marks       where char_length(quote) > 10000;
delete from public.flashcard_marks where char_length(quote) > 4000;

-- As catorze CHECKs recriadas no item 6 só precisam do valor aparado quando o
-- valor cru passa do teto (a regra antiga media o aparado). O que o novo teto
-- apertou (waitlist.name, de 160 para 120) já foi cortado acima.
update public.waitlist set email = btrim(email)                        where char_length(email) > 320;
update public.waitlist set whatsapp = btrim(whatsapp)                  where char_length(whatsapp) > 30;
update public.waitlist set interest_area = btrim(left(btrim(interest_area), 120)) where char_length(interest_area) > 120;
update public.waitlist set target_exam = btrim(left(btrim(target_exam), 200))     where char_length(target_exam) > 200;
update public.waitlist set timezone = btrim(timezone)                  where char_length(timezone) > 80;
update public.mock_exams set title = btrim(title)                      where char_length(title) > 160;
-- Alvo de FK (`mock_exam_subject_results`, sem `on update`): se algum caso
-- referenciado passar por aqui, a migration falha alto, e o conserto é à mão.
update public.mock_exam_subjects set subject = btrim(subject)          where char_length(subject) > 100;
update public.personal_flashcard_decks set subject = btrim(subject)    where char_length(subject) > 120;
update public.personal_flashcard_decks set title = btrim(title)        where char_length(title) > 160;
update public.personal_flashcards set front = btrim(front)             where char_length(front) > 2000;
update public.personal_flashcards set back = btrim(back)               where char_length(back) > 4000;
update public.theory_lesson_flashcards set front = btrim(front)        where char_length(front) > 2000;
update public.theory_lesson_flashcards set back = btrim(back)          where char_length(back) > 4000;

-- 2. Pisos -------------------------------------------------------------------
update public.profiles    set name = null                    where char_length(btrim(name)) < 3;
update public.classes     set name = 'Turma sem nome'        where char_length(btrim(name)) < 3;
update public.study_plans set name = 'Planejamento sem nome' where char_length(btrim(name)) < 3;

-- 3. Duplicatas --------------------------------------------------------------
-- O FOR lê as duplicatas uma vez; a conferência do candidato lê a tabela já
-- com as renomeações anteriores, então "X (2)" que já exista empurra para (3).
-- Fica de pé o mais antigo (`created_at`, depois `id`).
do $$
declare
  r record;
  v_n integer;
  v_suffix text;
  v_candidate text;
begin
  -- Turma: único por professor.
  for r in
    select d.id, d.teacher_id, d.name
      from (select c.id, c.teacher_id, c.name,
                   row_number() over (partition by c.teacher_id, lower(btrim(c.name))
                                      order by c.created_at, c.id) as rn
              from public.classes c) d
     where d.rn > 1
  loop
    v_n := 2;
    loop
      v_suffix := ' (' || v_n || ')';
      v_candidate := btrim(left(btrim(r.name), 120 - char_length(v_suffix))) || v_suffix;
      exit when not exists (
        select 1 from public.classes
         where teacher_id = r.teacher_id and lower(btrim(name)) = lower(v_candidate));
      v_n := v_n + 1;
    end loop;
    update public.classes set name = v_candidate where id = r.id;
  end loop;

  -- Planejamento: único por aluno (e professor, que é a chave do índice).
  for r in
    select d.id, d.teacher_id, d.student_id, d.name
      from (select p.id, p.teacher_id, p.student_id, p.name,
                   row_number() over (partition by p.teacher_id, p.student_id, lower(btrim(p.name))
                                      order by p.created_at, p.id) as rn
              from public.study_plans p) d
     where d.rn > 1
  loop
    v_n := 2;
    loop
      v_suffix := ' (' || v_n || ')';
      v_candidate := btrim(left(btrim(r.name), 120 - char_length(v_suffix))) || v_suffix;
      exit when not exists (
        select 1 from public.study_plans
         where teacher_id = r.teacher_id and student_id = r.student_id
           and lower(btrim(name)) = lower(v_candidate));
      v_n := v_n + 1;
    end loop;
    update public.study_plans set name = v_candidate where id = r.id;
  end loop;

  -- Deck pessoal: o par (disciplina, assunto) é único por aluno; renomeia o
  -- assunto (`title`), que tem folga até 160.
  for r in
    select d.id, d.student_id, d.subject, d.title
      from (select k.id, k.student_id, k.subject, k.title,
                   row_number() over (partition by k.student_id, lower(btrim(k.subject)), lower(btrim(k.title))
                                      order by k.created_at, k.id) as rn
              from public.personal_flashcard_decks k) d
     where d.rn > 1
  loop
    v_n := 2;
    loop
      v_suffix := ' (' || v_n || ')';
      v_candidate := btrim(left(btrim(r.title), 160 - char_length(v_suffix))) || v_suffix;
      exit when not exists (
        select 1 from public.personal_flashcard_decks
         where student_id = r.student_id
           and lower(btrim(subject)) = lower(btrim(r.subject))
           and lower(btrim(title)) = lower(v_candidate));
      v_n := v_n + 1;
    end loop;
    update public.personal_flashcard_decks set title = v_candidate where id = r.id;
  end loop;
end $$;

-- 4. Links -------------------------------------------------------------------
-- A mesma expressão de theory_lessons_resource_urls_https_check (20260925033641).
update public.study_plan_notebooks set notebook_link = ''
 where notebook_link <> ''
   and not (char_length(notebook_link) <= 2048 and notebook_link ~* '^https://[^[:space:]]+$');
update public.subject_blocks set link = null
 where link is not null
   and not (char_length(link) <= 2048 and link ~* '^https://[^[:space:]]+$');
update public.subject_lessons set link = null
 where link is not null
   and not (char_length(link) <= 2048 and link ~* '^https://[^[:space:]]+$');

-- 5. Lista de espera ---------------------------------------------------------
-- Não há valor certo a inventar para um WhatsApp fora do formato: o aluno se
-- inscreve de novo. O nascimento é opcional, então vira nulo.
delete from public.waitlist
 where not (char_length(whatsapp) <= 30
            and whatsapp ~ '^[0-9 ()+-]+$'
            and char_length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) between 10 and 13);
update public.waitlist set birth_date = null
 where birth_date < date '1900-01-01' or birth_date > current_date;

-- 6. Constraints -------------------------------------------------------------
-- Nome: <tabela>_<coluna>_check, o padrão do Postgres e o das que já existem.
-- Teto SEMPRE em char_length(<coluna>) <= N: é o que a varredura de
-- `supabase/tests/07_schema.sql` reconhece.
alter table public.profiles
  add constraint profiles_name_check
    check (name is null or (char_length(btrim(name)) >= 3 and char_length(name) <= 120)),
  add constraint profiles_plan_check          check (char_length(plan) <= 120),
  add constraint profiles_coupon_used_check   check (char_length(coupon_used) <= 64),
  add constraint profiles_access_origin_check check (char_length(access_origin) <= 64);

alter table public.classes
  add constraint classes_name_check        check (char_length(btrim(name)) >= 3 and char_length(name) <= 120),
  add constraint classes_description_check check (char_length(description) <= 2000);

alter table public.study_plans
  add constraint study_plans_name_check        check (char_length(btrim(name)) >= 3 and char_length(name) <= 120),
  add constraint study_plans_area_check        check (char_length(area) <= 120),
  add constraint study_plans_stage_check       check (char_length(stage) <= 120),
  add constraint study_plans_study_model_check check (char_length(study_model) <= 120),
  add constraint study_plans_target_exam_check check (char_length(target_exam) <= 200);

alter table public.goals
  add constraint goals_subject_check      check (char_length(subject) <= 120),
  add constraint goals_title_check        check (char_length(title) <= 200),
  add constraint goals_lesson_check       check (char_length(lesson) <= 200),
  add constraint goals_block_check        check (char_length(block) <= 200),
  add constraint goals_description_check  check (char_length(description) <= 2000),
  add constraint goals_weekday_name_check check (char_length(weekday_name) <= 20);

alter table public.goal_entries
  add constraint goal_entries_note_check          check (char_length(note) <= 2000),
  add constraint goal_entries_manual_lesson_check check (char_length(manual_lesson) <= 200);

alter table public.study_plan_notebooks
  add constraint study_plan_notebooks_notebook_link_check check (
    notebook_link = ''
    or (char_length(notebook_link) <= 2048 and notebook_link ~* '^https://[^[:space:]]+$')),
  add constraint study_plan_notebooks_subject_key_check    check (char_length(subject_key) <= 120),
  add constraint study_plan_notebooks_subject_name_check   check (char_length(subject_name) <= 120),
  add constraint study_plan_notebooks_notebook_key_check   check (char_length(notebook_key) <= 120),
  add constraint study_plan_notebooks_notebook_name_check  check (char_length(notebook_name) <= 200),
  add constraint study_plan_notebooks_subject_color_check  check (char_length(subject_color) <= 7);

alter table public.subjects
  add constraint subjects_name_check  check (char_length(name) <= 120),
  add constraint subjects_color_check check (char_length(color) <= 7);

alter table public.subject_blocks
  add constraint subject_blocks_link_check check (
    link is null or (char_length(link) <= 2048 and link ~* '^https://[^[:space:]]+$')),
  add constraint subject_blocks_name_check check (char_length(name) <= 200);

alter table public.subject_lessons
  add constraint subject_lessons_link_check check (
    link is null or (char_length(link) <= 2048 and link ~* '^https://[^[:space:]]+$')),
  add constraint subject_lessons_name_check check (char_length(name) <= 200);

alter table public.theory_catalogs
  add constraint theory_catalogs_key_check         check (char_length(key) <= 120),
  add constraint theory_catalogs_name_check        check (char_length(name) <= 200),
  add constraint theory_catalogs_description_check check (char_length(description) <= 2000);

alter table public.theory_subject_rules
  add constraint theory_subject_rules_subject_check     check (char_length(subject) <= 120),
  add constraint theory_subject_rules_subject_key_check check (char_length(subject_key) <= 120);
alter table public.theory_catalog_subject_rules
  add constraint theory_catalog_subject_rules_subject_check     check (char_length(subject) <= 120),
  add constraint theory_catalog_subject_rules_subject_key_check check (char_length(subject_key) <= 120);
alter table public.theory_review_rules
  add constraint theory_review_rules_subject_check     check (char_length(subject) <= 120),
  add constraint theory_review_rules_subject_key_check check (char_length(subject_key) <= 120);

alter table public.theory_lessons
  add constraint theory_lessons_subject_check           check (char_length(subject) <= 120),
  add constraint theory_lessons_subject_key_check       check (char_length(subject_key) <= 120),
  add constraint theory_lessons_title_check             check (char_length(title) <= 200),
  add constraint theory_lessons_lesson_code_check       check (char_length(lesson_code) <= 40),
  add constraint theory_lessons_pdf_file_check          check (char_length(pdf_file) <= 255),
  add constraint theory_lessons_note_check              check (char_length(note) <= 2000),
  add constraint theory_lessons_pdf_url_check           check (char_length(pdf_url) <= 2048),
  add constraint theory_lessons_flashcards_url_check    check (char_length(flashcards_url) <= 2048),
  add constraint theory_lessons_flash_summary_url_check check (char_length(flash_summary_url) <= 2048),
  add constraint theory_lessons_tec_questions_url_check check (char_length(tec_questions_url) <= 2048),
  add constraint theory_lessons_qc_questions_url_check  check (char_length(qc_questions_url) <= 2048);

-- O maior parágrafo da biblioteca local tem 687 caracteres; o verso de cartão
-- tem 4000 de teto.
alter table public.law_marks
  add constraint law_marks_quote_check check (char_length(quote) <= 10000);
alter table public.flashcard_marks
  add constraint flashcard_marks_quote_check check (char_length(quote) <= 4000);

-- As catorze que mediam btrim no teto: drop e add com O MESMO NOME, piso em
-- btrim e teto no valor gravado. Dois `alter table`, e não um com drop e add
-- juntos.
alter table public.waitlist
  drop constraint waitlist_name_check,
  drop constraint waitlist_email_check,
  drop constraint waitlist_whatsapp_check,
  drop constraint waitlist_interest_area_check,
  drop constraint waitlist_target_exam_check,
  drop constraint waitlist_timezone_check;
alter table public.waitlist
  add constraint waitlist_name_check          check (char_length(btrim(name)) >= 3 and char_length(name) <= 120),
  add constraint waitlist_email_check         check (char_length(btrim(email)) >= 5 and char_length(email) <= 320),
  -- Só dígitos, espaço, `()`, `+` e `-`, com 10 a 13 dígitos (D-08). Antes: 8 a
  -- 30 caracteres, e 'abcdefgh' passava (QA-19).
  add constraint waitlist_whatsapp_check      check (
    char_length(whatsapp) <= 30
    and whatsapp ~ '^[0-9 ()+-]+$'
    and char_length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) between 10 and 13),
  add constraint waitlist_interest_area_check check (char_length(btrim(interest_area)) >= 2 and char_length(interest_area) <= 120),
  add constraint waitlist_target_exam_check   check (char_length(btrim(target_exam)) >= 2 and char_length(target_exam) <= 200),
  add constraint waitlist_timezone_check      check (char_length(btrim(timezone)) >= 3 and char_length(timezone) <= 80),
  -- `current_date` é STABLE, e a condição é monotônica: se vale hoje, vale
  -- amanhã; o piso é constante. Por isso CHECK, e não gatilho.
  add constraint waitlist_birth_date_check    check (birth_date between date '1900-01-01' and current_date);

alter table public.mock_exams drop constraint mock_exams_title_check;
alter table public.mock_exams
  add constraint mock_exams_title_check
    check (char_length(btrim(title)) >= 1 and char_length(title) <= 160);

alter table public.mock_exam_subjects drop constraint mock_exam_subjects_subject_check;
alter table public.mock_exam_subjects
  add constraint mock_exam_subjects_subject_check
    check (char_length(btrim(subject)) >= 1 and char_length(subject) <= 100);

alter table public.personal_flashcard_decks
  drop constraint personal_flashcard_decks_subject_check,
  drop constraint personal_flashcard_decks_title_check;
alter table public.personal_flashcard_decks
  add constraint personal_flashcard_decks_subject_check
    check (char_length(btrim(subject)) >= 2 and char_length(subject) <= 120),
  add constraint personal_flashcard_decks_title_check
    check (char_length(btrim(title)) >= 2 and char_length(title) <= 160);

alter table public.personal_flashcards
  drop constraint personal_flashcards_front_check,
  drop constraint personal_flashcards_back_check;
alter table public.personal_flashcards
  add constraint personal_flashcards_front_check
    check (char_length(btrim(front)) >= 1 and char_length(front) <= 2000),
  add constraint personal_flashcards_back_check
    check (char_length(btrim(back)) >= 1 and char_length(back) <= 4000);

alter table public.theory_lesson_flashcards
  drop constraint theory_lesson_flashcards_front_check,
  drop constraint theory_lesson_flashcards_back_check;
alter table public.theory_lesson_flashcards
  add constraint theory_lesson_flashcards_front_check
    check (char_length(btrim(front)) >= 1 and char_length(front) <= 2000),
  add constraint theory_lesson_flashcards_back_check
    check (char_length(btrim(back)) >= 1 and char_length(back) <= 4000);
-- Os `*_topic_check` já medem o valor gravado e ficam como estão.

-- 7. Índices -----------------------------------------------------------------
create unique index classes_name_per_teacher_uidx
  on public.classes (teacher_id, lower(btrim(name)));
create unique index personal_flashcard_decks_name_per_student_uidx
  on public.personal_flashcard_decks (student_id, lower(btrim(subject)), lower(btrim(title)));
-- O índice de planejamento passa a ignorar maiúsculas e espaço nas pontas: sem
-- isso o `select` de planejamentos do aluno mostra "Área Fiscal" e "área fiscal".
-- O `drop` do antigo está no item 0.
create unique index study_plans_name_per_student_uidx
  on public.study_plans (teacher_id, student_id, lower(btrim(name)));

-- 8. O gatilho de cadastro corta, em vez de derrubar o cadastro --------------
-- Sem o corte, `profiles_name_check` recusa o nome longo e o GoTrue devolve
-- "Database error saving new user": a conta inteira deixa de nascer por causa
-- do nome. Nome com menos de 3 caracteres grava nulo, como antes gravava o
-- vazio.
create or replace function app_private.create_profile_for_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  -- Apara, corta e apara de novo: o corte pode terminar num espaço, e o piso
  -- da CHECK mede sem as pontas.
  v_name text := btrim(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 120));
begin
  -- `on conflict do nothing` para o caso de alguém já ter criado o perfil (o
  -- seed, uma rotina administrativa): o gatilho completa, não sobrescreve.
  insert into public.profiles (id, name)
  values (new.id, case when char_length(v_name) >= 3 then v_name end)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_profile_for_new_user() from public, anon, authenticated;
