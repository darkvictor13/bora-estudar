# PR 7 — Tetos, formatos e nomes únicos no banco

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-15, QA-16, QA-18, QA-19, QA-24, N-06 |
| Branch | fix/qa-7-limites-no-banco |
| Depende de | 5c (ordem das migrations). O 4 também, por tabela: `23514` precisa chegar como `validation` |
| Migration | sim |

---

## O defeito

### QA-15 — o teto de texto só existe no navegador

Só `routes/public/SignUp.tsx:42` tem `maxLength` (120). `routes/student/Account.tsx:78`,
`routes/teacher/Plans.tsx:104` e `routes/teacher/Classes.tsx:76` não têm teto nem
no navegador. `checkName` e `checkClassName` (`apps/web/src/lib/api/validation.ts:46,87`)
só têm mínimo, e a fixture `createPlan` (`lib/api/fixtures.ts:1409`) não valida nada.
O QA gravou nome de 400 caracteres no cadastro, 300 em Meus dados, plano de 487 e
turma de 502. O banco local tem 7 perfis, 2 planejamentos e 1 turma acima de 120.

O dado é maior que o relatório. A consulta da varredura (passo 3) acha **65
colunas** (eram 67 antes do 5c: `goal_entries.note` e `manual_lesson` deixaram de
ser graváveis pelo aluno, mas a RPC de registro as grava sem cortar, e por isso
a CHECK delas entra do mesmo jeito) `text` que `authenticated` grava sem teto no banco. São de dois tipos:

- **Sem teto nenhum:** `profiles.name`, `classes.*`, `study_plans.*`, `goals.*`,
  `goal_entries.note` e `manual_lesson`, os seis textos de
  `study_plan_notebooks`, `subjects`, `subject_blocks`, `subject_lessons`,
  `theory_catalogs`, as três tabelas de regra, `theory_lessons`, as duas `quote`
  de marcação e `profiles.plan`/`coupon_used`/`access_origin` (o grant de INSERT
  de `profiles` é da tabela inteira).
- **Com teto que não mede o que é gravado:** `waitlist` (6), `mock_exams.title`,
  `mock_exam_subjects.subject`, `personal_flashcard_decks` (2),
  `personal_flashcards.front/back`, `theory_lesson_flashcards.front/back`. Todas
  usam `char_length(btrim(x)) between a and b`. `btrim` tira espaço das pontas,
  então `'abc' || repeat(' ', 1000000)` passa num teto de 160.

O gatilho de cadastro (`supabase/migrations/20260914190000_profile_on_signup.sql:54-58`)
copia o nome do metadado sem cortar. Com a CHECK nova e sem corte, um nome longo
mandado pela API derruba o cadastro inteiro com "Database error saving new user".

### QA-16 — duplicidades aceitas, e a recusa que existe fala genérico

- `classes` não tem índice de nome (`20260914150000_initial_schema.sql:223-232`).
  O banco local já tem um par duplicado.
- `personal_flashcard_decks` também não (`20260930113138_personal_flashcards.sql:3-11`),
  e também já tem um par duplicado.
- `study_plans_name_per_student_uidx` (`initial_schema.sql:901-902`) é
  `(teacher_id, student_id, name)` e diferencia maiúscula e espaço.
- O `23505` dele chega como "Este registro já existe." (`lib/api/supabase/errors.ts:104-105`).
  A spec 14 R-GPLAN-09 pede que a tela traduza a violação.

### QA-18 — senha só de espaços

`checkPassword` (`validation.ts:30-38`) só mede comprimento, e é a mesma função
da troca de senha (`lib/api/supabase/auth.ts:101-103`). O GoTrue local aceita
(`supabase/config.toml:190,193`: `minimum_password_length = 6`,
`password_requirements = ""`).

### QA-19 — WhatsApp sem formato, nascimento no futuro, três regras para um campo

- `waitlist_whatsapp_check` (`initial_schema.sql:322`) só mede comprimento: 8 a
  30 caracteres, e "abcdefgh" passa.
- `birth_date` (`:316`) não tem CHECK.
- O mesmo campo tem três regras. O banco pede 8 a 30. O adaptador
  (`lib/api/supabase/access.ts:69`) pede só não vazio. A fixture
  (`fixtures.ts:1248`) pede 10 dígitos, com outra frase ("WhatsApp incompleto.").
- "Área de interesse" vazia chega ao banco e volta `23514` cru. A tela não marca
  o campo como obrigatório (`routes/student/Waitlist.tsx:131`).

### QA-24 — `javascript:` no link do caderno

`study_plan_notebooks.notebook_link` é `text not null default ''` sem CHECK
(`initial_schema.sql:401`). `saveNotebook` (`lib/api/supabase/notebooks.ts:115-136`)
e a fixture (`fixtures.ts:1633`) gravam o que vier. O link é renderizado em
`routes/student/Notebooks.tsx:105`. O banco local tem 2 linhas com
`javascript:window.__pwn=1;alert(1)`, deixadas pelo QA.

### N-06 — o mesmo, em `subject_blocks.link` e `subject_lessons.link`

As duas colunas são `text` nulável (`initial_schema.sql:269,279`), sem CHECK, e
são renderizadas em `routes/student/Subjects.tsx:80`. Nenhuma tela as escreve,
mas o professor as grava pela API. A CHECK é a única defesa.

---

## Decisões aplicadas

Do README:

- **D-06:** nome de pessoa tem 120, o `maxLength` do cadastro. Nome de plano e de
  turma, 120. Observação, 2000.
- **D-07:** turma e deck pessoal com nome repetido são recusados, ignorando
  maiúsculas e espaço nas pontas.
- **D-08:** WhatsApp com 10 a 13 dígitos. Nascimento entre 1900-01-01 e hoje, sem
  idade mínima.
- **D-09:** o link do caderno aceita qualquer `https://`.
- **D-10:** senha em branco é recusada no contrato. A política do GoTrue fica.

Tomadas por este plano (o padrão recomendado; quem discordar reabre antes do código):

1. **Faixas para o resto:**
   - **120** para nome, rótulo curto, matéria e chave;
   - **200** para título;
   - **2000** para texto livre;
   - **2048** para link, o mesmo teto que `validateLink` já impõe;
   - **especiais:** `weekday_name` 20, `lesson_code` 40, `pdf_file` 255,
     `coupon_used` e `access_origin` 64, `flashcard_marks.quote` 4000 (o verso
     de cartão), `law_marks.quote` 10000 (o maior parágrafo da biblioteca local
     tem 687).

   Assim todo derivado cabe na origem. `goals.subject` vem de `subjects.name` e
   de `subject_name`, que têm 120. `goals.title` é `Teoria — <matéria>`, com até
   129 caracteres. `manual_lesson` vem de `theory_lessons.title`, que tem 200.
2. **O teto mede o valor gravado (`char_length(x)`); o piso mede sem as pontas
   (`char_length(btrim(x))`).** As 14 CHECKs que hoje aparam antes de medir são
   recriadas com o mesmo nome. Sem isso a varredura aceitaria um teto falso.
3. **Piso de 3 no banco para os três nomes da casca:** `profiles.name`,
   `study_plans.name` e `classes.name`. É o mesmo `MIN_NAME_LENGTH` do contrato,
   e evita uma segunda regra para o mesmo campo, que é o defeito do QA-19. O
   gatilho de cadastro grava nulo quando o nome tem menos de 3 caracteres.
4. **O índice de nome do planejamento também passa a ignorar maiúsculas e
   espaços.** D-07 não pede, mas é a mesma regra e o custo é zero (há 0
   duplicatas locais nesse critério). Sem ela, o `select` de planejamentos do
   aluno mostra "Área Fiscal" e "área fiscal". R-GPLAN-09 é reescrita.
5. **Nascimento usa CHECK com `current_date`, e não gatilho.** O Postgres aceita
   função `STABLE` em CHECK. Só recusa subconsulta, agregado e função que
   devolve conjunto. A ressalva da documentação ("PostgreSQL assumes that CHECK
   constraints' conditions are immutable", em *5.5.1 Check Constraints*) diz
   respeito a uma linha válida deixar de ser válida, e quebrar um
   dump/restore. Aqui isso não acontece, porque a condição é monotônica: se
   `birth_date <= current_date` vale hoje, vale amanhã. O piso é constante.
6. **Duplicata existente é renomeada, nunca fundida.** O mais antigo fica
   intacto, e os outros ganham " (2)", " (3)"… Fundir decks arrastaria cartões,
   revisões e grifos.
7. **Inscrição na lista de espera com WhatsApp fora do formato é apagada pela
   migration.** Não há valor certo a inventar, e staging só tem dado de teste. O
   aluno se inscreve de novo. Nascimento fora da faixa vira `null`, porque a
   coluna é opcional.
8. **Link fora da regra é limpo, não corrigido.** No caderno vira `''` (a
   coluna é `not null default ''`). Em bloco e aula vira `null`.
9. **`quote` de marcação acima do teto é apagada, não cortada.** Cortar viola
   `length(quote) = end_offset - start_offset`.
10. **Frases de conflito moram em `validation.ts`, e o `23505` é identificado
    pelo NOME do índice.** O deck pessoal tem PK escolhida pelo cliente, então
    um replay com o mesmo `id` também dá `23505`, em
    `personal_flashcard_decks_pkey`, e não é deck repetido.

---

## Passo a passo

Um commit por passo, nesta ordem.

### 1. Spec e catálogo (primeiro commit, sem código)

- `docs/specs/01-autenticacao.md`:
  - **regra nova** (próximo `R-AUTH-NN` livre — os PRs 2 e 6 também acrescentam
    regras aqui; confira o arquivo): "Senha formada só por espaços é recusada no
    cadastro e na redefinição: 'A senha não pode ser formada só por espaços.' O
    login NÃO recusa, para a conta criada antes desta regra continuar entrando.
    A política do GoTrue não muda (D-10)." Acrescente à CA-09 e à CA-12;
  - **R-AUTH-07:** o gatilho grava o nome aparado e cortado em 120, e grava nulo
    abaixo de 3.
- `docs/specs/10-conta-e-lista-de-espera.md`:
  - **R-CTA-03:** o nome tem de 3 a 120 caracteres;
  - **R-CTA-07** passa a dizer:
    - WhatsApp: só dígitos, espaço, `()`, `+` e `-`, com 10 a 13 dígitos;
    - área de interesse: de 2 a 120;
    - concurso: de 2 a 200;
    - nascimento: opcional, entre 01/01/1900 e hoje;
    - a regra mora em `checkWaitlist` e nas CHECKs de `waitlist`, com a mesma
      faixa.
- `docs/specs/13-vinculo-e-liberacao-de-acesso.md`, **R-MATR-09** (nova): o nome
  da turma tem de 3 a 120 caracteres e é único por professor, ignorando
  maiúsculas e espaço nas pontas (`classes_name_per_teacher_uidx`). A frase é
  "Você já tem uma turma com esse nome.". A descrição vai até 2000.
- `docs/specs/14-gestao-do-planejamento.md`, **R-GPLAN-09** reescrita: o índice é
  `study_plans_name_per_student_uidx (teacher_id, student_id, lower(btrim(name)))`,
  e a frase é "Este aluno já tem um planejamento com esse nome." com
  `field: "name"`. O nome vai de 3 a 120.
- `docs/specs/15-cadernos-do-planejamento.md`, **R-CAD-16** (nova): o link do
  caderno é `''` ou `https://…` sem espaço, até 2048. `subject_blocks.link` e
  `subject_lessons.link` seguem a mesma regra, com `null` no lugar de `''`. O
  nome do caderno vai até 200.
- `docs/specs/34-cronograma-leis-flashcards.md`, uma linha em "Comportamento":
  - o deck pessoal tem disciplina de 2 a 120 e assunto de 2 a 160;
  - o par disciplina + assunto é único por aluno, ignorando maiúsculas e espaços;
  - a frase é "Você já tem um deck com essa disciplina e esse assunto.".

  Deck pessoal não tem spec própria. É a mais próxima.
- `docs/fluxos-e2e.md`: reserve em "Fluxos que ainda não existem" os ids
  `F-GPLAN-06` (a CA-06 da spec 14 já o cita), `F-MATR-06` e `F-FLASH-06`.
  Confira antes que continuam livres.

### 2. Migration

`supabase migration new text_limits_and_formats`. Um arquivo, nesta ordem:
índice antigo do planejamento → tetos → pisos → duplicatas → links → lista de
espera → constraints → índices → gatilho. A ordem importa. Cortar no teto cria duplicata nova (dois nomes de 487
caracteres com o mesmo começo), e o piso precisa ver o valor já cortado.

```sql
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

-- 0. O índice antigo de planejamento sai ANTES de tudo -----------------------
-- Ele é único em `(teacher_id, student_id, name)` pelo valor EXATO: cortar dois
-- nomes de 487 e 500 caracteres com o mesmo começo (item 1) o violaria no meio
-- da própria migration. O novo nasce no item 7, depois das duplicatas.
drop index public.study_plans_name_per_student_uidx;

-- 1. Tetos -------------------------------------------------------------------
update public.profiles    set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
update public.classes     set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
update public.study_plans set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
update public.waitlist    set name = btrim(left(btrim(name), 120)) where char_length(name) > 120;
-- Uma linha por coluna da tabela "O resto", no molde:
--   update public.<t> set <c> = left(<c>, <N>) where char_length(<c>) > <N>;
-- As 14 CHECKs recriadas (item 6) só precisam aparar:
--   update public.<t> set <c> = btrim(<c>) where char_length(<c>) > <N>;
delete from public.law_marks       where char_length(quote) > 10000;
delete from public.flashcard_marks where char_length(quote) > 4000;

-- 2. Pisos -------------------------------------------------------------------
update public.profiles    set name = null where char_length(btrim(name)) < 3;
update public.classes     set name = 'Turma sem nome'        where char_length(btrim(name)) < 3;
update public.study_plans set name = 'Planejamento sem nome' where char_length(btrim(name)) < 3;

-- 3. Duplicatas --------------------------------------------------------------
-- O FOR lê as duplicatas uma vez; a conferência do candidato lê a tabela já
-- com as renomeações anteriores, então "X (2)" que já exista empurra para (3).
do $$
declare
  r record;
  v_n integer;
  v_suffix text;
  v_candidate text;
begin
  for r in
    select id, teacher_id, name
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
end $$;
-- O mesmo molde, mais duas vezes:
--   study_plans: partição (teacher_id, student_id, lower(btrim(name))), teto 120;
--   personal_flashcard_decks: partição (student_id, lower(btrim(subject)),
--     lower(btrim(title))); renomeia `title`, teto 160.

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
-- A regra antiga media `btrim(whatsapp)`: o valor cru pode passar de 30 com
-- espaço nas pontas. O item 1 apara esse caso; o `char_length <= 30` abaixo
-- apaga o que sobrar.
delete from public.waitlist
 where not (char_length(whatsapp) <= 30
            and whatsapp ~ '^[0-9 ()+-]+$'
            and char_length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) between 10 and 13);
update public.waitlist set birth_date = null
 where birth_date < date '1900-01-01' or birth_date > current_date;

-- 6. Constraints -------------------------------------------------------------
-- Nome: <tabela>_<coluna>_check, o padrão do Postgres e o das que já existem.
-- Teto SEMPRE em char_length(<coluna>) <= N: é o que a varredura de
-- 07_schema.sql reconhece. `between` também serve (o catálogo o imprime como
-- `>= and <=`); char_length(btrim(<coluna>)) no teto, não.
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
  add constraint study_plans_name_check check (char_length(btrim(name)) >= 3 and char_length(name) <= 120),
  add constraint study_plans_area_check        check (char_length(area) <= 120),
  add constraint study_plans_stage_check       check (char_length(stage) <= 120),
  add constraint study_plans_study_model_check check (char_length(study_model) <= 120),
  add constraint study_plans_target_exam_check check (char_length(target_exam) <= 200);

-- O 5a NÃO criou `goal_entries_note_check`: a RPC grava a observação sem cortar.
alter table public.goal_entries
  add constraint goal_entries_note_check          check (char_length(note) <= 2000),
  add constraint goal_entries_manual_lesson_check check (char_length(manual_lesson) <= 200);

alter table public.study_plan_notebooks
  add constraint study_plan_notebooks_notebook_link_check check (
    notebook_link = ''
    or (char_length(notebook_link) <= 2048 and notebook_link ~* '^https://[^[:space:]]+$')),
  add constraint study_plan_notebooks_notebook_name_check check (char_length(notebook_name) <= 200);
  -- …e subject_key, subject_name, notebook_key (120), subject_color (7).

alter table public.subject_blocks
  add constraint subject_blocks_link_check check (
    link is null or (char_length(link) <= 2048 and link ~* '^https://[^[:space:]]+$')),
  add constraint subject_blocks_name_check check (char_length(name) <= 200);
-- subject_lessons: as duas iguais, com o nome da tabela.

-- As 14 que medem btrim no teto: drop e add com O MESMO NOME, piso em btrim e
-- teto no valor gravado. Dois `alter table`, e não um com drop e add juntos.
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
  add constraint waitlist_whatsapp_check      check (
    char_length(whatsapp) <= 30
    and whatsapp ~ '^[0-9 ()+-]+$'
    and char_length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) between 10 and 13),
  add constraint waitlist_interest_area_check check (char_length(btrim(interest_area)) >= 2 and char_length(interest_area) <= 120),
  add constraint waitlist_target_exam_check   check (char_length(btrim(target_exam)) >= 2 and char_length(target_exam) <= 200),
  add constraint waitlist_timezone_check      check (char_length(btrim(timezone)) >= 3 and char_length(timezone) <= 80),
  -- current_date é STABLE, e a condição é monotônica: válida hoje, válida amanhã.
  add constraint waitlist_birth_date_check    check (birth_date between date '1900-01-01' and current_date);
-- Mesmo molde, mesmos números de hoje: mock_exams_title_check (1..160),
-- mock_exam_subjects_subject_check (1..100), personal_flashcard_decks_subject_check
-- (2..120) e _title_check (2..160), personal_flashcards_front_check (1..2000) e
-- _back_check (1..4000), theory_lesson_flashcards_front_check e _back_check (idem).
-- Os _topic_check já medem o valor gravado e ficam.

-- 7. Índices -----------------------------------------------------------------
create unique index classes_name_per_teacher_uidx
  on public.classes (teacher_id, lower(btrim(name)));
create unique index personal_flashcard_decks_name_per_student_uidx
  on public.personal_flashcard_decks (student_id, lower(btrim(subject)), lower(btrim(title)));
-- (o `drop index` do antigo está no item 0)
create unique index study_plans_name_per_student_uidx
  on public.study_plans (teacher_id, student_id, lower(btrim(name)));

-- 8. O gatilho de cadastro corta, em vez de derrubar o cadastro --------------
create or replace function app_private.create_profile_for_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  -- Apara, corta e apara de novo: o corte pode terminar num espaço, e o piso da
  -- CHECK mede sem as pontas.
  v_name text := btrim(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 120));
begin
  -- Sem o corte, profiles_name_check recusa e o GoTrue devolve "Database error
  -- saving new user": a conta inteira deixa de nascer por causa do nome.
  insert into public.profiles (id, name)
  values (new.id, case when char_length(v_name) >= 3 then v_name end)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function app_private.create_profile_for_new_user() from public, anon, authenticated;
```

**O resto** — teto por coluna, para os comentários "uma linha por coluna" acima:

| Tabela | Colunas e teto |
|---|---|
| `goals` | `subject` 120 · `title`, `lesson`, `block` 200 · `description` 2000 · `weekday_name` 20 |
| `study_plan_notebooks` | `subject_key`, `subject_name`, `notebook_key` 120 · `notebook_name` 200 · `subject_color` 7 |
| `subjects` | `name` 120 · `color` 7 |
| `subject_blocks`, `subject_lessons` | `name` 200 (o link está no SQL acima) |
| `theory_catalogs` | `key` 120 · `name` 200 · `description` 2000 |
| `theory_subject_rules`, `theory_catalog_subject_rules`, `theory_review_rules` | `subject`, `subject_key` 120 |
| `theory_lessons` | `subject`, `subject_key` 120 · `title` 200 · `lesson_code` 40 · `pdf_file` 255 · `note` 2000 · `pdf_url`, `flashcards_url`, `flash_summary_url`, `tec_questions_url`, `qc_questions_url` 2048 cada |
| `law_marks` · `flashcard_marks` | `quote` 10000 · `quote` 4000 |

Ficam como estão, porque a varredura já as aceita:

- os `prefix`/`suffix` de marcação e os `*_topic` (teto no valor gravado);
- `last_grade` e `state` das três tabelas de revisão (`= ANY (ARRAY[…])`);
- as colunas que são FK: `flashcard_marks.library_deck_id`, `law_marks.law_id` e
  `article_id`, `library_flashcard_reviews.deck_id`,
  `mock_exam_subject_results.subject` e `study_plan_notebooks.catalog_key`.

Se o 1–5c tiver criado coluna `text` gravável, a varredura a acusa: dê teto aqui.

### 3. Suítes SQL (no mesmo commit da migration)

Ver [Testes](#testes). A varredura vai em `07_schema.sql`.

### 4. `npm run db:types`

CHECK, índice e função de `app_private` não mudam a superfície de tipos: o
esperado é diff vazio. Rode mesmo assim, e commite se houver diff.

### 5. Contrato: `validation.ts`, `lesson-resources.ts`, `errors.ts`

- `lib/domain/lesson-resources.ts`:
  - extraia de `validateLink` (`:8-28`) e exporte
    `validateHttpsLink(value): string | null`. Ela confere `new URL`, protocolo
    `https:`, `hostname`, ausência de usuário e senha, e ≤ `MAX_LINK_LENGTH`;
  - exporte `MAX_LINK_LENGTH = 2048` daqui. O `api` importa o `domain`, nunca o
    contrário;
  - `validateLink` continua com o ramo `/materials/prf/` e o de token, e chama a
    extraída;
  - as frases não mudam.
- `lib/api/validation.ts`:
  - **constantes:**
    - `MAX_NAME_LENGTH = 120`, `MAX_TITLE_LENGTH = 200` e
      `MAX_NOTE_LENGTH = 2000`;
    - `MAX_DECK_TITLE_LENGTH = 160` e `MAX_WHATSAPP_LENGTH = 30`;
    - `WHATSAPP_DIGITS = { min: 10, max: 13 }` e `MIN_BIRTH_DATE = "1900-01-01"`;
    - reexporte `MAX_LINK_LENGTH`.

    Toda medida usa `value.trim().length`, que é o que os adaptadores gravam.
  - **`checkPassword`:** depois do comprimento, se `password.trim() === ""`,
    recuse com "A senha não pode ser formada só por espaços." (`field:
    "password"`). Não apare a senha que segue para o GoTrue.
    `checkCredentials` **não muda**.
  - **`checkName`** ganha o teto: "O nome pode ter até 120 caracteres.".
    `checkSignUp` passa a chamar `checkName`, em vez de repetir o mínimo.
  - **Funções novas.** Cada uma devolve a primeira recusa, na ordem dos campos da
    tela:

    | Função | Regra |
    |---|---|
    | `checkClass(input: ClassInput)` | nome por `checkClassName`, que ganha o teto ("O nome da turma pode ter até 120 caracteres."); descrição até 2000 |
    | `checkPlan(input: Partial<StudyPlanInput>)` | vem de `validate()` em `supabase/teacher-plans.ts:69-80`, com as mesmas frases, mais nome até 120, área, fase e modelo até 120, e concurso até 200 |
    | `checkWaitlist(input: WaitlistInput, today: IsoDate)` | as regras de R-CTA-07; `today` entra por parâmetro para o teste fixar a data |
    | `checkNotebook(notebook: Notebook)` | vem de `supabase/notebooks.ts:122-127`, mais nome até 200, `checkLink(notebook.notebookLink, "notebookLink")` e `subjectTarget` inteiro de 0 a 100 ("A meta de acerto vai de 0 a 100%.", campo `subjectTarget`). A CHECK `study_plan_notebooks_subject_target_check` já existe; o que falta é a regra no contrato — hoje 150% chega ao banco e volta como `23514` cru, e é a única regra desta tela que o PR 4 deixou sem dono |
    | `checkLink(value, field)` | `""` passa; o resto passa por `validateHttpsLink`, e o ESPAÇO é recusado ali mesmo: `new URL` aceita `https://x.com/a b` e a CHECK (`[^[:space:]]`) não. A regra de espaço fica fora de `validateHttpsLink` para `readLessonMaterialBlocks` não passar a descartar bloco já gravado |
    | `checkPersonalDeck({ subject, title })` | vem de `supabase/personal-flashcards.ts:74-77`, mais 120 e 160 |

    Mensagens de `checkWaitlist`:
    - WhatsApp vazio: "Informe um WhatsApp para o professor falar com você."
      (a frase de hoje);
    - fora do formato: "Informe o WhatsApp com DDD, como (11) 90000-0000.";
    - área: "Informe sua área de interesse.";
    - concurso: "Informe para qual concurso você estuda.";
    - nascimento: "A data de nascimento precisa ser entre 01/01/1900 e hoje.".
  - **Observação e matéria do estudo extra.** O 5a criou `checkStudyEntry`. A
    observação ganha teto lá: "A observação pode ter até 2000 caracteres.",
    `field: "note"` (e `manualLesson`, até 200: "A aula pode ter até 200
    caracteres."; `checkExtraStudy` passa a aceitar `note` no `Pick`). A matéria ganha teto onde o 5a deixou "Informe a matéria.":
    "A matéria pode ter até 120 caracteres.".
  - **Conflitos**, como constantes `ApiError` com `code: "conflict"`, para as
    duas implementações usarem a mesma frase:

    | Constante | Frase | `field` |
    |---|---|---|
    | `PLAN_NAME_TAKEN` | "Este aluno já tem um planejamento com esse nome." | `name` |
    | `CLASS_NAME_TAKEN` | "Você já tem uma turma com esse nome." | `name` |
    | `DECK_TAKEN` | "Você já tem um deck com essa disciplina e esse assunto." | `title` |
- `lib/api/index.ts:27`: reexporte as `MAX_*`, `MIN_BIRTH_DATE` e
  `MAX_WHATSAPP_LENGTH` ao lado de `ACCESS_MONTHS`. É de lá que a tela importa.
- `lib/api/supabase/error-translation.ts` (reexportada por `errors.ts`): crie
  `isUniqueViolation(error: DbErrorLike, index: string): boolean`, que é
  `error.code === "23505" && error.message.includes(`"${index}"`)`. Casa o nome
  do índice entre aspas, e nunca uma frase de interface. Mora em
  `error-translation.ts` porque `errors.ts` importa `@/lib/observability`, que o
  runner do Node não resolve: o teste só alcança o primeiro.

### 6. Adaptador do Supabase e fixtures

- `supabase/teacher-plans.ts`:
  - `validate()` sai, e `checkPlan` entra;
  - em `createPlan` e em `updatePlan`, antes do `translateDbError`:
    `if (isUniqueViolation(error, "study_plans_name_per_student_uidx")) return failure(PLAN_NAME_TAKEN);`
    no molde de `teacher-classes.ts:203`. Depois do PR 3 existe outro índice
    único em `study_plans`, por isso o nome.
- `supabase/teacher-classes.ts`: `createClass` e `renameClass` chamam
  `checkClass`, e `classes_name_per_teacher_uidx` vira `CLASS_NAME_TAKEN`.
- `supabase/personal-flashcards.ts`: `checkPersonalDeck`, e
  `personal_flashcard_decks_name_per_student_uidx` vira `DECK_TAKEN`. O `23505`
  da `_pkey` segue o caminho de hoje.
- `supabase/access.ts:63-74`: as três checagens à mão dão lugar a
  `checkWaitlist(input, today())`, com `today` de `supabase/session.ts` (que
  chama `todayLocal` de `lib/domain/dates.ts`), data do aparelho (D-11).
- `supabase/notebooks.ts:122-127` dá lugar a `checkNotebook`.
- `supabase/auth.ts`: nada muda no arquivo. Cadastro, redefinição e Meus dados
  recebem as regras novas por `checkSignUp`, `checkPassword` e `checkName`.
- `fixtures.ts`:
  - `joinWaitlist` (`:1247`) chama `checkWaitlist(input, TODAY)`, e "WhatsApp
    incompleto." sai;
  - `saveNotebook` (`:1633`) chama `checkNotebook`;
  - `createPersonalFlashcardDeck` (`:1210`) chama `checkPersonalDeck` e recusa
    `DECK_TAKEN` contra `personalFlashcardDecks`, comparando
    `trim().toLowerCase()` do par;
  - `createClass` e `renameClass` (`:1683,1701`) chamam `checkClass` e recusam
    `CLASS_NAME_TAKEN` contra `state.classes`, excluída a própria turma no
    renomear;
  - **planejamentos:** o PR 3 já pôs `plans` no `State`. `createPlan` e
    `updatePlan` chamam `checkPlan` e recusam `PLAN_NAME_TAKEN` contra os
    planos do mesmo `studentId` (na atualização, excluído o próprio).

### 7. Telas

Todo `maxLength` vem das constantes, e nunca de literal:

| Tela | Campos |
|---|---|
| `routes/public/SignUp.tsx:42` | o `120` literal vira `MAX_NAME_LENGTH` |
| `routes/student/Account.tsx:78` | `name` |
| `routes/teacher/Plans.tsx:104-113` | `name`, `area`, `stage`, `studyModel` (120); `targetExam` (200) |
| `routes/teacher/Classes.tsx:76-87` | `name` (120); `description` (2000) |
| `routes/student/Waitlist.tsx:107-150` | `name`, `interestArea` (120), `targetExam` (200), `whatsapp` (30); `birthDate` com `min={MIN_BIRTH_DATE}` e `max={localDate()}`; `interestArea` ganha `required`; `interestArea` e `birthDate` ganham `invalid={error?.field === …}` |
| `components/student/ExtraStudyDialog.tsx` | `subject` (120); `note` (2000) |
| `components/student/RecordStudyDialog.tsx` | `note` (2000) |
| `routes/teacher/Notebooks.tsx:219-220` | `notebookName` (200); `notebookLink` (`MAX_LINK_LENGTH`) |
| `routes/student/Flashcards.tsx:704,706` | os literais `120` e `160` viram constante |

### 8. Testes de TypeScript e e2e

Ver [Testes](#testes).

### 9. Documentação

- `CLAUDE.md`, seção Banco, perto de "Nenhum dado de domínio em texto livre", um
  parágrafo:

  > Texto que o cliente grava tem teto no banco. É uma CHECK de
  > `char_length(<coluna>) <= N`, que mede o valor GRAVADO, e não o aparado.
  > `07_schema.sql` varre o catálogo e falha com a coluna `text` que
  > `authenticated` grava sem isso.
- `docs/de-para-schema.md:997`: `study_plans_name_per_student_uidx` passa a
  ignorar maiúsculas e espaço nas pontas. Acrescente os dois índices novos à
  mesma tabela.
- `docs/fluxos-e2e.md`:
  - os três ids reservados saem de "Fluxos que ainda não existem" e entram nas
    seções `Professor` e `Flashcards`;
  - atualize a coluna "Cobre" de F-AUTH-09, F-AUTH-10/11/12, F-CONTA-01,
    F-ESP-01 e F-CAD-01 (o do professor).
- `docs/bugs-encontrados.md`: uma entrada na seção "Varredura de 06/10/2026",
  com QA-15, 16, 18, 19, 24 e N-06.

---

## Testes

### SQL (`npm run db:test`)

Numere os `raise notice` a partir do último `NN OK` de cada arquivo. Os PRs
anteriores também acrescentam.

**`07_schema.sql` — a varredura.** `has_column_privilege` em vez de
`information_schema.column_privileges`, porque enxerga grant de tabela, de
coluna e o herdado de PUBLIC:

```sql
-- ---------- Texto que o cliente grava tem teto no banco ----------
do $$
declare
  -- Quem acrescentar exceção escreve o motivo ao lado. Começa vazia.
  v_excecoes text[] := array[]::text[];
  v_sem text;
begin
  with writable as (
    select distinct c.oid as relid, c.relname, a.attnum, a.attname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where c.relkind = 'r'
       and a.atttypid in ('text'::regtype, 'varchar'::regtype)
       and (has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')
         or has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')))
  select string_agg(w.relname || '.' || w.attname, ', ' order by w.relname, w.attname)
    into v_sem
    from writable w
   where not exists (           -- CHECK só desta coluna, com teto no valor gravado,
           select 1 from pg_constraint k          -- ou lista fechada de valores
            where k.conrelid = w.relid and k.contype = 'c' and k.conkey = array[w.attnum]
              and (pg_get_constraintdef(k.oid)
                     ~ ('(char_length|length)\(' || quote_ident(w.attname) || '\) <= [0-9]+')
                or pg_get_constraintdef(k.oid)
                     ~ ('\(' || quote_ident(w.attname) || ' = ANY \(ARRAY\[')))
     and not exists (           -- ou é FK: o valor tem de existir na outra tabela
           select 1 from pg_constraint k
            where k.conrelid = w.relid and k.contype = 'f' and w.attnum = any(k.conkey))
     and (w.relname || '.' || w.attname) <> all (v_excecoes);

  if v_sem is not null then
    raise exception 'FALHOU: coluna de texto gravavel por authenticated sem teto no banco: %', v_sem;
  end if;
  raise notice 'NN OK  toda coluna de texto que authenticated grava tem teto no banco';
end $$;
```

Rodada como SELECT contra o banco de hoje, a consulta acusa as 65 colunas
listadas no defeito. Depois da migration, acusa zero.

**`07_schema.sql` — os ataques.** Um bloco por item, como postgres. A CHECK não
depende de papel. Cada um no molde
`do $$ begin <escrita>; if not found then raise exception 'FALHOU: sem linha para atacar'; end if; raise exception 'FALHOU: …'; exception when check_violation then raise notice '…'; end $$;`.

- `profiles.name` com `repeat('a', 121)` (Bruno, `2222…`): recusado.
- `classes.name` com 121 (`a9000000-…-0001`): recusado.
- `study_plans.name` com 121 (`a2000000-…-0001`): recusado.
- `goal_entries.note` com 2001 (qualquer linha): recusado.
- Turma `' TURMA DA ANA '` para Ana (`1111…`): `unique_violation`.
- Plano `' plano do bruno '` para Ana e Bruno: `unique_violation`.

A suíte não roda numa transação. O ataque precisa falhar DENTRO do bloco, para
o `exception` desfazer a escrita.

**`04_profiles.sql`**, depois de um `reset role`:

- `auth.users` com `{"name": repeat('N', 300)}`: o perfil nasce com 120
  caracteres, e a conta NASCE;
- `auth.users` com `{"name":"Jo"}`: o perfil nasce com `name` nulo.

Use ids novos (`78000000-0000-4000-8000-00000000000N`).

**`05_waitlist.sql`**, no fim, como postgres sobre a linha de Bruno, com o
guarda de `not found`:

- **recusados:** `'abcdefgh'`, `'4199999'` (9 dígitos), 14 dígitos,
  `current_date + 1` e `'1899-12-31'`;
- **aceitos:** `'(41) 99999-0000'`, `'+55 41 99999-0000'` e `current_date`.

**`09_lesson_resource_links.sql`**, dentro do `begin`/`rollback` que já existe:

- o professor `1111…` grava em `study_plan_notebooks` (`a3000000-…-0001`):
  `'javascript:alert(1)'` e `'http://x.com'` dão `check_violation`; `''` e
  `'https://www.tecconcursos.com.br/'` passam;
- `subject_blocks` com `link = 'javascript:alert(1)'` na disciplina
  `a1000000-…-0001` é recusado.

**`16_personal_flashcards.sql`**, dentro do `begin`/`rollback`: o segundo deck
`' direito constitucional '`/`'MEU DECK'` de Bruno dá `unique_violation`. O teste
fica aqui, e não na 07, porque a 16 conta os decks de Bruno e não pode herdar
linha.

### TypeScript (`npm run check`)

- **`validation.test.ts`:**
  - oito espaços recusados por `checkPassword` e aceitos por `checkCredentials`;
  - nome de 121 recusado;
  - os formatos de WhatsApp acima;
  - nascimento `today`+1 recusado e `today` aceito;
  - `checkLink` com `javascript:`, `http:`, `''` e `https:`;
  - `checkPlan`, `checkClass` e `checkPersonalDeck` nos dois limites.
- **`lesson-resources.test.ts`:** `validateHttpsLink`.
- **`supabase/error-translation.test.ts`** (o PR 4 o criou; não existe
  `errors.test.ts`): `isUniqueViolation` casa o nome do índice, e não casa
  `_pkey`.
- **`fixtures.test.ts`:** a especificação executável do contrato.
  - turma repetida com outra caixa, ao criar e ao renomear;
  - deck repetido;
  - plano repetido para o mesmo aluno, e aceito para outro;
  - WhatsApp `'abcdefgh'` com a frase nova;
  - link `javascript:` no caderno.

  Cada um afirma o `code`, o `field` e a frase.

### e2e (`npm run db:reset` antes, se rodou `db:test`)

| Id | Arquivo | O que afirma |
|---|---|---|
| F-AUTH-09 (estende `F-AUTH-08/09`) | `auth.spec.ts:165` | "senha só de espaços é recusada — QA-18": oito espaços, a frase nova, e nenhum `auth.users` com o e-mail |
| F-AUTH-12 (estende) | `auth.spec.ts:311` | no teste de senhas diferentes e curtas, mais um caso com oito espaços nos dois campos |
| F-CONTA-01 (estende) | `student-analysis.spec.ts:193` | o campo `name` tem `maxlength="120"` — QA-15 |
| F-ESP-01 (estende) | `student-analysis.spec.ts:227` | "WhatsApp sem formato e nascimento no futuro são recusados — QA-19": `abcdefgh` e depois `2031-01-01`, cada um com a frase; `count(*)` da inscrição é 0 |
| F-GPLAN-06 (novo) | `teacher.spec.ts` | "nome repetido é recusado — QA-16": o nome do plano do cenário, em maiúsculas e com espaço; a frase no `plan-dialog`; continua 1 plano com aquele `lower(btrim(name))`; o campo tem `maxlength="120"` |
| F-MATR-06 (novo) | `teacher.spec.ts`, no describe `F-MATR` | "turma com nome repetido é recusada — QA-16", no molde de `criarTurmas` |
| F-FLASH-06 (novo) | `flashcards.spec.ts` | "deck pessoal repetido é recusado — QA-16" |
| F-CAD-01 (estende o do professor) | `teacher.spec.ts:332` | "link `javascript:` é recusado — QA-24": edita o link, lê "Informe um link HTTPS válido.", e o banco continua com `https://www.tecconcursos.com.br/` |

Pré-condição só pela tela ou pelas fixtures existentes, nunca por INSERT que
fabrique estado impossível.

---

## Desvios na implementação (registrados em 07/10/2026)

O que a realidade do código mudou em relação ao texto acima, já corrigido nele:

- **O índice antigo de planejamento cai antes do corte (item 0).** O plano
  deixava o `drop index` para o item 7, mas cortar dois nomes de 487 e 500
  caracteres com o mesmo começo viola o índice ANTIGO (único pelo valor exato)
  dentro da própria migration. Descoberto exercitando a migration com dado sujo.
- **65 colunas na varredura, não 67**, depois do 5c; a CHECK de
  `goal_entries.note` e `manual_lesson` entra mesmo assim, e o 5a não a criou.
- **`goals.*` também ganha CHECK** (`subject`, `title`, `lesson`, `block`,
  `description`, `weekday_name`): é o que a tabela "O resto" já pedia, e a RPC do
  estudo extra grava `goals.subject` direto.
- **`isUniqueViolation` mora em `error-translation.ts`** e casa o nome entre
  aspas; o teste está em `error-translation.test.ts`.
- **A fixture já guardava `plans`** (PR 3).
- **A data de hoje** vem de `today()` (`supabase/session.ts`) no adaptador e de
  `todayLocal()` (`lib/domain/dates.ts`) na tela, e não de `localDate`.
- **A regra de espaço no link mora em `checkLink`**, não em `validateHttpsLink`.
- **O gatilho de cadastro corta ANTES de aparar**, para o nome cujo corte acaba
  em espaço não ficar abaixo do piso e derrubar a conta.
- **A migration apara o WhatsApp cru antes de apagar** (a regra antiga media
  `btrim`), e apaga o que passar de 30.
- **A numeração dos testes SQL:** `07_schema` 25 a 33, `04_profiles` 21 e 22,
  `05_waitlist` 19 a 21, `09_lesson_resource_links` 06 a 10,
  `16_personal_flashcards` 06 e 07. O ataque de turma repetida lê o nome ATUAL da
  turma da Ana, porque a `01_grants` a renomeia para "Turma da Ana (2027)".
- **R-AUTH-19** (não R-AUTH-NN livre: o 6 tomou o 18), e a regra do gatilho
  entrou no texto de R-AUTH-07.

---

## Critério de pronto

- [ ] A varredura de `07_schema.sql` passa com a lista de exceções vazia.
- [ ] Os quatro valores do QA são recusados pelo banco:
  - nome de cadastro com 400 caracteres por metadado: CORTADO em 120, e a conta
    nasce;
  - Meus dados com 300, plano com 487 e turma com 502: `23514`.
- [ ] Turma, deck e plano repetidos, com outra caixa e espaço, recebem a frase
      própria nas duas implementações. "Este registro já existe." não aparece
      em nenhum dos três.
- [ ] Oito espaços são recusados no cadastro e na redefinição, e uma conta
      antiga com senha assim continua entrando.
- [ ] `'abcdefgh'` e nascimento no futuro são recusados pelo banco e pelo
      contrato, com a mesma faixa. "WhatsApp incompleto." sumiu do código.
- [ ] `javascript:` não entra em `notebook_link`, `subject_blocks.link` nem
      `subject_lessons.link`. As duas linhas do QA viraram `''`.
- [ ] Nenhum `maxLength` literal nas telas da tabela do passo 7.
- [ ] `npm run check`, `npm run db:test`, `npm run db:reset` e `npm run e2e`
      verdes; `npm run db:types` sem diff, ou com o diff commitado.
- [ ] Specs 01, 10, 13, 14, 15 e 34, `fluxos-e2e.md`, `CLAUDE.md`, de-para e
      `bugs-encontrados.md` atualizados.

---

## Armadilhas

- **Teto antes de piso, e os dois antes da duplicata.** Cortar dois nomes de 487
  caracteres com o mesmo começo cria a duplicata que o índice vai recusar. O
  piso precisa ver o valor já cortado.
- **O gatilho de cadastro é a única escrita de `profiles.name` que não passa pelo
  contrato.** Sem o corte, a CHECK nova transforma "nome longo" em "não consigo
  me cadastrar". `create or replace` mantém o gatilho e o dono. Repita o
  `revoke` mesmo assim, como o README pede.
- **Teto em `char_length(btrim(x))` é teto falso.** E a varredura só o recusa se
  a regex for a do passo 3. Não a afrouxe para aceitar `btrim`.
- **`23505` de deck pessoal pode ser replay.** A PK é escolhida pelo cliente
  (`input.id`). Traduza só o do índice de nome.
- **Login fica de fora da regra da senha em branco.** `checkCredentials`
  continua aceitando o que o GoTrue aceitar.
- **`current_date` é do banco, em UTC; a tela usa a data do aparelho.** Às 22h
  em Brasília o banco já está no dia seguinte e aceita um dia a mais. O
  contrato recusa antes, e o contrário não acontece no Brasil.
- **`quote` de marcação não se corta.** O corte viola
  `length(quote) = end_offset - start_offset`, e por isso a limpeza apaga.
- **`mock_exam_subjects.subject` é alvo de FK** (`mock_exam_subject_results`, sem
  `on update`). A limpeza dele só apara, e só acima do teto. Se staging tiver um
  caso referenciado, a migration falha alto, e o conserto é à mão.
- **`07_schema.sql` não roda numa transação, e as suítes compartilham estado.**
  O ataque precisa falhar dentro do bloco. Deck vai na 16, que tem `rollback`.
- **`btrim` tira só espaço, e `trim()` do JS tira todo branco.** Não é problema,
  porque o adaptador grava já aparado. Não "corrija" o índice para
  `regexp_replace`.
- **Há dois `F-CAD-01` no catálogo**, o do aluno (`student-analysis.spec.ts:305`)
  e o do professor (`teacher.spec.ts:332`). O deste PR é o do professor.
- **`npm run db:test` antes de `npm run e2e` quebra o `global-setup`.** Rode
  `npm run db:reset` entre os dois.

---

## Fora do escopo

- **A política de senha do GoTrue (D-10).** A API direta continua aceitando
  senha só de espaços. O contrato é a barreira, e a decisão é aceitar isso.
- **Formato de valor**, além do teto:
  - cor `#RRGGBB` em `subjects.color` e `subject_color`;
  - `weekday_name` (redundante com `weekday`, e as suítes gravam `'Segunda'`);
  - `access_origin` como enum.

  São pendências de "nenhum dado de domínio em texto livre", não de tamanho.
- **`theory_lessons.material_blocks` e `tec_notebooks`.** São `jsonb`
  graváveis, sem teto de conteúdo.
- **`maxLength` nas telas do catálogo de teoria.** As CHECKs as cobrem, e a
  recusa chega pela tradução genérica de `23514` do PR 4.
- **Validação de link na renderização.** A CHECK basta, e o React 19 já
  neutraliza `javascript:` no `href`.
- **A divergência que já existe entre `validateLink` e o banco.** O ramo
  `/materials/prf/` aceita um caminho que `theory_lessons_resource_urls_https_check`
  recusa. Não é tocada aqui.
- **O resto das specs 10 e 14 desatualizado** (`phone`, upsert, `draft`,
  `deleted_at`). Só mudam as regras citadas.
