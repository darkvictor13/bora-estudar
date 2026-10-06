# PR 5b — As questões da teoria à prova de retentativa

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-04 (a parte da teoria: questões iniciais e questões de revisão) |
| Branch | `fix/qa-5b-questoes-da-teoria` |
| Depende de | 5a mergeado, e por ele 1, 3 e 4. Do 5a vêm `goal_entries.request_id`, `goal_entries_request_uidx`, as CHECKs de `goal_entries`, o grant de INSERT por coluna, `checkStudyEntry`, `MAX_ENTRY_QUESTIONS`, `STUDY_REPLAY_CONFLICT`, `parseCount`, o `case "P0002"` de `errors.ts` e o `once(requestId, run, payload)` da fixture. Do 4 vêm o `""` → `offline` e o `once()` que captura throw |
| Migration | sim, uma: `supabase migration new record_theory_questions` (gerou `20261006231152_record_theory_questions.sql`) |

## O defeito

Três caminhos que ACUMULAM, nenhum com chave no banco:

- **`recordInitialQuestions`** (`apps/web/src/lib/api/supabase/theory.ts:657-722`) faz
  três escritas soltas:
  - lê `theory_progress` e grava `antes + questões` (`:696`, por `writeProgress`);
  - insere em `goal_entries` sem `request_id` (`:703`);
  - chama `maybeCompleteLesson` (`:717`), que conclui a aula (`:645`) e cria as revisões
    (`createReviewsFor`, `:396`), as duas com o erro **ignorado**.

  Resposta perdida + retentativa soma duas vezes e duplica o registro. Duas abas perdem
  uma das somas. Uma queda entre a soma e o INSERT deixa progresso sem ledger.
- **`recordReviewQuestions`** (`:724-776`) lê `theory_reviews.questions_answered`, soma
  (`:748`) e faz UPDATE (`:754`). Não grava em `goal_entries` nem em lugar nenhum: é
  contador mantido à mão **sem ledger**. Duplica do mesmo jeito, e a retentativa do envio
  que FECHOU a revisão volta "Esta revisão já foi concluída".
- **A chave nasce no clique.** `TheoryDialog.tsx:656` e `:668` e `routes/student/Reviews.tsx:67`
  chamam `newRequestId()` dentro do submit. Mesmo com proteção no banco, cada clique
  chegaria como operação nova. O formulário de revisão do modal fecha antes do resultado
  (`TheoryDialog.tsx:490`), então nem há como repetir o mesmo envio.

A validação também diverge:

- acerto negativo passa no Supabase: `theory.ts:661` e `:727` só comparam com o total;
- a fixture (`fixtures.ts:1008-1012`) recusa com "Informe questões e acertos válidos.",
  frase que o Supabase não tem;
- a tela converte com `Number(x ?? 0)` (`TheoryDialog.tsx:319`, `:485-488`);
- a fixture de revisão não valida nada e não recusa revisão concluída.

## Decisões aplicadas

- **D-04:** teto de 500 questões, acerto entre 0 e o total. Aqui `questões ≥ 1`, porque
  não há campo de minutos (R-TEO-09: "questão zero não é registro").
- **As convenções do 5a valem igual.**
  - SQLSTATEs:
    - meta, aula ou revisão alheia ou inexistente → `P0002`;
    - acesso vencido → `42501`;
    - mesma chave com outro payload → `23505`, que vira `STUDY_REPLAY_CONFLICT`;
    - dado inválido → `23514`.
  - Ordem: trava a linha alvo, procura o `request_id`, e só então confere o acesso. A
    retentativa de quem gravou e venceu logo depois responde "gravado".
- **Questões iniciais vão por RPC no ledger que já existe.** `record_initial_questions`
  insere em `goal_entries` com `request_id` (reusa `goal_entries_request_uidx`). **Só se
  inseriu agora**, ela soma o progresso, conclui a aula e cria as revisões, tudo na mesma
  transação.
- **A revisão ganha ledger próprio, `theory_review_entries`.** `goal_entries` não serve:
  - `goal_id` é `not null`, e `theory_reviews` não tem meta: `/aluno/revisoes` registra
    sem meta nenhuma;
  - contar questão de revisão no desempenho da semana mudaria um número que a spec 36
    fixa ("o aproveitamento vem dos registros").

  O ledger novo segue a forma 1: `request_id` UNIQUE e o payload nas próprias colunas.
- **Os contadores ficam, com UM escritor.** `initial_questions_done` e
  `questions_answered` continuam colunas. Só as RPCs as escrevem, numa instrução que soma
  (`x = x + n`) depois de o ledger aceitar a linha. Não dá para derivar do ledger agora:
  - o histórico anterior não guarda a aula nem a revisão no registro, e derivar zeraria
    progresso;
  - o bundle no ar lê e escreve as colunas até o 5c.

  O que o `CLAUDE.md` proíbe é "três caminhos escrevendo o mesmo número", e depois do 5c
  sobra um.
- **`goal_entries.theory_lesson_id`**, nulável, com FK composta para `theory_lessons (id,
  teacher_id)`. O alvo já existe: `theory_lessons_id_teacher_key`, de
  `20260926024737_lesson_flashcards.sql:13`.
  - Sem ela, a RPC não tem como comparar a aula do payload, e a aula seria identificada
    só pelo título em `manual_lesson`, que é dado de domínio em texto livre.
  - Fica fora do grant de INSERT por coluna do 5a, como `request_id`: só a RPC a escreve.
- **A conclusão preserva o comportamento de hoje.** A aula fecha quando
  `initial_questions_done >= mínimo`, sem olhar a leitura (`isLessonComplete`,
  `lib/domain/theory.ts:185`, e a spec 36). A R-TEO-06 da spec 32 exige as duas coisas;
  está desatualizada e é corrigida no passo 1.
- **O mínimo é o da regra da AULA:** `theory_catalog_subject_rules` com o `subject_key` e
  o `catalog_id` da aula, e 15 sem regra.
  - É o casamento que a tela do professor faz (`teacher-theory.ts:277-289`).
  - Hoje o aluno procura pelo nome da META normalizado (`theory.ts:543`, `:621`, `:715`),
    e as duas coisas divergem quando o nome da meta não normaliza para a chave da aula.
  - O TypeScript passa a ler pela aula também.
- **Na revisão, o replay vem ANTES da recusa "já concluída".**
- **Nada é revogado aqui.** O bundle antigo continua escrevendo direto até o 5c.

## Passo a passo

1. **Spec e catálogo** (commit só de documentação).
   - `docs/specs/32-fluxo-da-teoria.md`:
     - R-TEO-06: a meta de prática fecha com `initial_questions_done >= mínimo`. Ler a
       teoria não é condição, e fechar não libera aula (spec 36).
     - R-TEO-07: o mínimo é o da regra com o `subject_key` da aula, no catálogo da aula.
     - R-TEO-08 e R-TEO-10: a soma e o registro acontecem em `record_initial_questions`, e
       o registro guarda `theory_lesson_id`.
     - R-TEO-15: o registro da revisão vai em `theory_review_entries`, por
       `record_review_questions`.
     - Regras novas:
       - **R-TEO-21:** registrar questões, iniciais ou de revisão, é seguro a retentativa.
         A mesma chave com os mesmos números devolve o estado sem somar; com outros
         números é recusada. A chave nasce quando o formulário abre e só muda depois de
         um sucesso.
       - **R-TEO-22:** duas abas somam as duas, porque a soma é uma instrução só no banco.
       - **R-TEO-23:** a aula fecha, e as revisões nascem, na mesma transação do registro
         que atingiu o mínimo.
       - **R-TEO-24:** a retentativa do envio que concluiu a revisão devolve a revisão, e
         não "já concluída".
     - Superfície: as RPCs `record_initial_questions` e `record_review_questions`, a
       migration nova, e `theory_review_entries` em "Banco".
     - Critérios: CA-15 (`F-TEO-08`), CA-16 (`F-TEO-09`), CA-17 e CA-18 (`06_theory.sql`:
       replay, payload diferente, acesso vencido, meta alheia, aula não publicada,
       conclusão com revisões).
   - `docs/specs/24-revisao-espacada.md`: uma linha no aviso do topo, "registrar questões
     da revisão é `record_review_questions` (spec 32, R-TEO-21 e R-TEO-24)".
   - `docs/fluxos-e2e.md`, em "Fluxos que ainda não existem", dois ids novos:
     - `F-TEO-08`: questões iniciais com a resposta perdida somam uma vez, e mudar os
       números na retentativa é recusado;
     - `F-TEO-09`: a revisão com a resposta perdida soma uma vez, no modal e em
       `/aluno/revisoes`.

     São ids novos, e não testes a mais em F-TEO-04/05, porque a regra é um `describe`
     por id e o `describe` cita o `QA-04`.

2. **Migration**, criada com `supabase migration new record_theory_questions`. Esboço:

   ```sql
   -- As questões da teoria à prova de retentativa (QA-04, PR 5b).
   --
   -- O QUE ESTA MIGRATION FAZ
   --   `record_initial_questions`  questões iniciais: ledger, soma, conclusão e revisões
   --                               numa transação; idempotente por goal_entries.request_id
   --   `record_review_questions`   questões de revisão, idempotente por
   --                               theory_review_entries.request_id
   --   `theory_review_entries`     o ledger da revisão, que não existia
   --   `goal_entries.theory_lesson_id`  a aula do registro, para o replay comparar
   --
   -- COMPATIBILIDADE: nada é revogado. O bundle anterior continua inserindo em
   -- goal_entries e somando em theory_progress/theory_reviews direto; fechar é o 5c.
   -- DADOS: nenhum corrigido. Tabela nova e coluna nulável; os registros antigos ficam
   -- com theory_lesson_id nulo, que quer dizer "anterior a esta migration".

   -- Fora do grant de INSERT por coluna do 5a, como request_id: só a RPC a escreve.
   alter table public.goal_entries add column theory_lesson_id uuid;
   alter table public.goal_entries
     add constraint goal_entries_theory_lesson_fk
     foreign key (theory_lesson_id, teacher_id)
     references public.theory_lessons (id, teacher_id)
     on delete set null (theory_lesson_id);
   create index goal_entries_theory_lesson_idx
     on public.goal_entries (theory_lesson_id, teacher_id) where theory_lesson_id is not null;
   comment on column public.goal_entries.theory_lesson_id is
     'A aula das questões iniciais. Preenchida só por `record_initial_questions`, e é o que o replay compara.';

   -- Alvo da FK composta do ledger da revisão.
   alter table public.theory_reviews
     add constraint theory_reviews_id_student_key unique (id, student_id);

   create table public.theory_review_entries (
     id               uuid primary key default gen_random_uuid(),
     theory_review_id uuid not null,
     student_id       uuid not null,
     questions        integer not null,
     correct_answers  integer not null,
     request_id       uuid not null,
     created_at       timestamptz not null default now(),
     constraint theory_review_entries_questions_check check (questions between 1 and 500),
     constraint theory_review_entries_correct_answers_check
       check (correct_answers between 0 and questions),
     -- Cascade, e não restrict: a revisão é da aula (theory_reviews cascateia de
     -- theory_lessons e de study_plans), e o registro dela vai junto. O desempenho que
     -- não pode sumir mora em goal_entries, não aqui.
     constraint theory_review_entries_review_fk
       foreign key (theory_review_id, student_id)
       references public.theory_reviews (id, student_id) on delete cascade
   );
   create unique index theory_review_entries_request_uidx
     on public.theory_review_entries (request_id);
   create index theory_review_entries_review_idx
     on public.theory_review_entries (theory_review_id, student_id);
   comment on table public.theory_review_entries is
     'Questões registradas numa revisão. Append-only: SELECT para authenticated; quem escreve é `record_review_questions`.';

   alter table public.theory_review_entries enable row level security;
   create policy theory_review_entries_select on public.theory_review_entries
     for select to authenticated
     using (
       student_id = (select auth.uid())
       or exists (
         select 1 from public.theory_reviews r
           join public.study_plans p on p.id = r.study_plan_id
          where r.id = theory_review_entries.theory_review_id
            and p.teacher_id = (select auth.uid())
       )
     );
   grant select on public.theory_review_entries to authenticated;

   -- O mínimo de questões iniciais da aula: a regra da disciplina DA AULA, no catálogo
   -- da aula, e 15 sem regra (R-TEO-07). O 15 é o mesmo de DEFAULT_INITIAL_QUESTIONS em
   -- theory.ts; mudar um é mudar o outro.
   create or replace function app_private.initial_questions_required(p_lesson_id uuid)
     returns integer language sql stable set search_path = '' as $$
     select coalesce(
       (select r.initial_questions
          from public.theory_lessons l
          join public.theory_catalog_subject_rules r
            on r.catalog_id = l.catalog_id and r.subject_key = l.subject_key and r.active
         where l.id = p_lesson_id),
       15);
   $$;

   -- O replay, conferido contra o pedido. Função própria porque a RPC devolve de dois
   -- lugares (entrada normal e corrida perdida no índice), como replay_access_grant.
   create or replace function app_private.replay_initial_questions(
     p_entry public.goal_entries, p_student_id uuid, p_goal_id uuid, p_lesson_id uuid,
     p_questions integer, p_correct_answers integer
   ) returns table (current_page integer, theory_done boolean, initial_questions_done integer,
                    initial_questions_required integer, lesson_done boolean)
     language plpgsql stable set search_path = '' as $$
   #variable_conflict use_column
   begin
     if p_entry.student_id is distinct from p_student_id
        or p_entry.goal_id is distinct from p_goal_id
        or p_entry.theory_lesson_id is distinct from p_lesson_id
        or p_entry.questions is distinct from p_questions
        or p_entry.correct_answers is distinct from p_correct_answers then
       raise exception 'este request_id ja foi usado com outro registro'
         using errcode = 'unique_violation';
     end if;
     -- O progresso ATUAL: o resultado de registrar é o estado da aula, e o que a
     -- retentativa precisa é não somar de novo.
     return query
       select tp.current_page, tp.theory_done, tp.initial_questions_done,
              app_private.initial_questions_required(p_lesson_id), tp.lesson_done
         from public.theory_progress tp
         join public.goals g on g.id = p_entry.goal_id
        where tp.student_id = p_student_id
          and tp.study_plan_id = g.study_plan_id
          and tp.theory_lesson_id = p_lesson_id;
   end;
   $$;

   create or replace function public.record_initial_questions(
     p_request_id uuid, p_goal_id uuid, p_lesson_id uuid,
     p_questions integer, p_correct_answers integer
   ) returns table (current_page integer, theory_done boolean, initial_questions_done integer,
                    initial_questions_required integer, lesson_done boolean)
     language plpgsql security definer set search_path = '' as $$
   #variable_conflict use_column
   declare
     v_uid      uuid := (select auth.uid());
     v_goal     public.goals%rowtype;
     v_catalog  uuid;
     v_lesson   public.theory_lessons%rowtype;
     v_required integer;
     v_seen     public.goal_entries%rowtype;
     v_progress public.theory_progress%rowtype;
   begin
     if v_uid is null then
       raise exception 'usuario nao autenticado' using errcode = 'insufficient_privilege';
     end if;
     if p_request_id is null then
       raise exception 'request_id e obrigatorio';
     end if;
     -- A faixa das CHECKs de goal_entries, mais "questão zero não é registro".
     if p_questions is null or p_questions not between 1 and 500
        or p_correct_answers is null or p_correct_answers not between 0 and p_questions then
       raise exception 'questoes ou acertos fora da faixa' using errcode = 'check_violation';
     end if;

     -- SECURITY DEFINER passa por cima da RLS: o dono é conferido aqui. A trava vem
     -- antes da busca pela chave (mesmo motivo do 5a).
     select * into v_goal from public.goals g
      where g.id = p_goal_id and g.student_id = v_uid and g.type = 'theory'
      for no key update;
     if not found then
       raise exception 'meta nao encontrada' using errcode = 'no_data_found';
     end if;

     select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
     if found then
       return query select * from app_private.replay_initial_questions(
         v_seen, v_uid, p_goal_id, p_lesson_id, p_questions, p_correct_answers);
       return;
     end if;

     if not public.has_active_access() then
       raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
     end if;

     -- O catálogo do planejamento: o da TURMA prevalece, o vínculo individual atende
     -- quem está fora dela. É a regra de `loadTheoryContext` (theory.ts); mudar uma é
     -- mudar as duas.
     select coalesce(
       (select c.theory_catalog_id
          from public.class_students cs
          join public.classes c on c.id = cs.class_id and c.teacher_id = cs.teacher_id
         where cs.student_id = v_goal.student_id and cs.teacher_id = v_goal.teacher_id),
       (select l.catalog_id from public.study_plan_theory_catalogs l
         where l.study_plan_id = v_goal.study_plan_id)
     ) into v_catalog;

     select * into v_lesson from public.theory_lessons l
      where l.id = p_lesson_id and l.catalog_id = v_catalog and l.active and l.published;
     if not found then
       raise exception 'aula nao encontrada no catalogo do planejamento' using errcode = 'no_data_found';
     end if;
     v_required := app_private.initial_questions_required(v_lesson.id);

     begin
       insert into public.goal_entries (
         goal_id, teacher_id, student_id, minutes, questions, correct_answers,
         theory_stage, manual_lesson, theory_lesson_id, request_id)
       values (
         v_goal.id, v_goal.teacher_id, v_uid, 0, p_questions, p_correct_answers,
         'questions_in_progress', v_lesson.title, v_lesson.id, p_request_id);
     exception when unique_violation then
       -- A mesma chave noutra meta, em paralelo: a trava acima é por meta.
       select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
       return query select * from app_private.replay_initial_questions(
         v_seen, v_uid, p_goal_id, p_lesson_id, p_questions, p_correct_answers);
       return;
     end;

     -- SOMA NUMA INSTRUÇÃO SÓ. O bloqueio de linha do upsert serializa duas abas, e a
     -- segunda soma sobre o que a primeira gravou.
     insert into public.theory_progress as tp
       (student_id, study_plan_id, theory_lesson_id, initial_questions_done)
     values (v_uid, v_goal.study_plan_id, v_lesson.id, p_questions)
     on conflict (student_id, study_plan_id, theory_lesson_id)
     do update set initial_questions_done = tp.initial_questions_done + excluded.initial_questions_done
     returning * into v_progress;

     if not v_progress.lesson_done and v_progress.initial_questions_done >= v_required then
       update public.theory_progress tp
          set lesson_done = true, lesson_done_at = now(),
              initial_questions_complete = true, initial_questions_complete_at = now()
        where tp.id = v_progress.id
       returning * into v_progress;

       insert into public.theory_reviews
         (student_id, study_plan_id, theory_lesson_id, review_number, minimum_questions)
       select v_uid, v_goal.study_plan_id, v_lesson.id, r.review_number, r.minimum_questions
         from public.theory_review_rules r
        where r.catalog_id = v_lesson.catalog_id and r.subject_key = v_lesson.subject_key
          and r.active
       on conflict (student_id, study_plan_id, theory_lesson_id, review_number) do nothing;
     end if;

     return query select v_progress.current_page, v_progress.theory_done,
       v_progress.initial_questions_done, v_required, v_progress.lesson_done;
   end;
   $$;

   create or replace function app_private.replay_review_entry(
     p_entry public.theory_review_entries, p_student_id uuid, p_review_id uuid,
     p_questions integer, p_correct_answers integer
   ) returns table (study_plan_id uuid, questions_answered integer,
                    status public.theory_review_status)
     language plpgsql stable set search_path = '' as $$
   #variable_conflict use_column
   begin
     if p_entry.student_id is distinct from p_student_id
        or p_entry.theory_review_id is distinct from p_review_id
        or p_entry.questions is distinct from p_questions
        or p_entry.correct_answers is distinct from p_correct_answers then
       raise exception 'este request_id ja foi usado com outro registro'
         using errcode = 'unique_violation';
     end if;
     return query select r.study_plan_id, r.questions_answered, r.status
                    from public.theory_reviews r where r.id = p_review_id;
   end;
   $$;

   create or replace function public.record_review_questions(
     p_request_id uuid, p_review_id uuid, p_questions integer, p_correct_answers integer
   ) returns table (study_plan_id uuid, questions_answered integer,
                    status public.theory_review_status)
     language plpgsql security definer set search_path = '' as $$
   #variable_conflict use_column
   declare
     v_uid    uuid := (select auth.uid());
     v_review public.theory_reviews%rowtype;
     v_seen   public.theory_review_entries%rowtype;
   begin
     -- (as mesmas três checagens de abertura de record_initial_questions)

     -- A trava serializa duas abas, e a segunda vê o `completed` da primeira.
     -- `no key update` não bloqueia o FOR KEY SHARE da FK do ledger.
     select * into v_review from public.theory_reviews r
      where r.id = p_review_id and r.student_id = v_uid
      for no key update;
     if not found then
       raise exception 'revisao nao encontrada' using errcode = 'no_data_found';
     end if;

     -- O REPLAY VEM ANTES DE "JÁ CONCLUÍDA": a retentativa do envio que fechou a
     -- revisão tem de receber a revisão, não um conflito.
     select * into v_seen from public.theory_review_entries e where e.request_id = p_request_id;
     if found then
       return query select * from app_private.replay_review_entry(
         v_seen, v_uid, p_review_id, p_questions, p_correct_answers);
       return;
     end if;

     if not public.has_active_access() then
       raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
     end if;
     -- P0001: translateDbError mostra a mensagem crua, e ela é a frase de hoje.
     if v_review.status = 'completed' then
       raise exception 'Esta revisão já foi concluída.';
     end if;

     begin
       insert into public.theory_review_entries
         (theory_review_id, student_id, questions, correct_answers, request_id)
       values (v_review.id, v_uid, p_questions, p_correct_answers, p_request_id);
     exception when unique_violation then
       select * into v_seen from public.theory_review_entries e where e.request_id = p_request_id;
       return query select * from app_private.replay_review_entry(
         v_seen, v_uid, p_review_id, p_questions, p_correct_answers);
       return;
     end;

     -- No UPDATE, toda expressão lê a linha ANTIGA.
     update public.theory_reviews r
        set questions_answered = r.questions_answered + p_questions,
            status = case when r.questions_answered + p_questions >= r.minimum_questions
                          then 'completed'::public.theory_review_status
                          else 'in_progress'::public.theory_review_status end,
            started_at = coalesce(r.started_at, now()),
            completed_at = case when r.questions_answered + p_questions >= r.minimum_questions
                                then now() end
      where r.id = v_review.id;

     return query select r.study_plan_id, r.questions_answered, r.status
                    from public.theory_reviews r where r.id = v_review.id;
   end;
   $$;

   comment on function public.record_initial_questions(uuid, uuid, uuid, integer, integer) is
     'Questões iniciais: ledger, soma, conclusão da aula e revisões numa transação. Segura a retentativa por `goal_entries.request_id`, que é UNIQUE.';
   comment on function public.record_review_questions(uuid, uuid, integer, integer) is
     'Questões de revisão. Segura a retentativa por `theory_review_entries.request_id`, que é UNIQUE.';

   revoke all on function app_private.initial_questions_required(uuid) from public, anon, authenticated;
   revoke all on function app_private.replay_initial_questions(
     public.goal_entries, uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
   revoke all on function app_private.replay_review_entry(
     public.theory_review_entries, uuid, uuid, integer, integer) from public, anon, authenticated;
   revoke all on function public.record_initial_questions(uuid, uuid, uuid, integer, integer)
     from public, anon, authenticated;
   revoke all on function public.record_review_questions(uuid, uuid, integer, integer)
     from public, anon, authenticated;
   grant execute on function public.record_initial_questions(uuid, uuid, uuid, integer, integer)
     to authenticated;
   grant execute on function public.record_review_questions(uuid, uuid, integer, integer)
     to authenticated;
   ```

3. **`npm run db:types`** e commit de `packages/database/src/schema.gen.ts`.

4. **Contrato, validação e fixtures.**
   - `lib/api/validation.ts`: `checkQuestionRecord({ questions, correctAnswers })`.
     - Extraia de `checkStudyEntry` as regras de questões e acertos para uma função que as
       duas chamam, com as frases que o 5a fixou: "…de 0 a 500 por registro.",
       "…a partir de 0." e "Os acertos não podem passar do total de questões.".
     - A única regra própria: `questions < 1` → "Informe quantas questões você fez.",
       `field: "questions"`.
     - Casos em `validation.test.ts`: 0, 501, 1,5, `NaN`, acerto −1, acerto > total.
   - `lib/api/fixtures.ts:1005` e `:1041`:
     - chame `checkQuestionRecord` (sai "Informe questões e acertos válidos.");
     - passe o payload ao `once` do 5a (o input sem `requestId`, em `JSON.stringify`);
     - na revisão, o replay vem primeiro e depois `conflict` "Esta revisão já foi
       concluída.".
   - `fixtures.test.ts`, em testes `QA-04 · …`:
     - a mesma chave com os mesmos números soma uma vez;
     - outro payload dá `conflict` com `STUDY_REPLAY_CONFLICT`;
     - a retentativa da revisão que fechou devolve a revisão;
     - acerto negativo é recusado com a frase de `validation.ts`.

5. **Adaptador.**
   - Mova o `studyWriteError` local do 5a (`week.ts`: `23505` → `STUDY_REPLAY_CONFLICT`,
     o resto por `translateDbError`) para `supabase/error-translation.ts` (puro, como
     `translateDbError`, e testável pelo runner do Node), reexportado por
     `supabase/errors.ts`, e use-o nos dois arquivos. O caso entra em
     `error-translation.test.ts`.
   - `supabase/theory.ts`:
     - `recordInitialQuestions`:
       - `checkQuestionRecord` antes do `once()`, como `grantAccess`
         (`teacher-students.ts:346`);
       - dentro do `once()`, `supabase.rpc("record_initial_questions", …)`;
       - o `TheoryProgress` é montado de `data[0]`, porque `returns table` chega como array.
     - `recordReviewQuestions`: o mesmo com `record_review_questions`. Depois,
       `loadTheoryContext(row.study_plan_id)` e `reviewsOf`, como hoje (`:764-767`).
     - Apague `maybeCompleteLesson` (`:633`) e `createReviewsFor` (`:396`).
       `saveTheoryProgress` deixa de concluir aula (`:625`): concluir é efeito de
       registrar questões.
     - `ProgressWrite` (`:431`) encolhe para `current_page`, `theory_done` e
       `theory_done_at`, que é o que o 5c deixa no grant.
     - `requiredQuestions` (`:297`) passa a receber a AULA e a ler
       `context.initialQuestions.get(lesson.subjectKey)`, a chave crua que o SQL
       compara. Use-a em `:543` e `:621`; a de `:715` sai com o corpo antigo.
     - Ponha em `loadTheoryContext` (`:166-191`) um comentário apontando para a cópia SQL
       da regra do catálogo; o comentário da migration aponta para cá.

6. **Tela.** A chave nasce na origem e só muda depois do sucesso, como em
   `RecordStudyDialog.tsx:38` e `:70`.
   - `components/student/TheoryDialog.tsx`:
     - `onRecordQuestions` e `onRecordReview` passam a devolver
       `Promise<ApiError | null>`.
     - O diálogo guarda `questionsRequestId` (`useState(newRequestId)`) e uma chave por
       revisão, criada quando o formulário dela abre pela primeira vez. As chaves ficam no
       diálogo, não nas abas: trocar de aba desmonta a aba e levaria a chave junto.
     - O formulário de revisão só fecha no sucesso (sai o `setOpen(null)` de `:490`).
     - Os campos usam `parseCount` (`lib/domain/week.ts`, do 5a) no lugar de
       `Number(x ?? 0)`, mais `step={1}` e `max={MAX_ENTRY_QUESTIONS}`. As questões ficam com
       `min={1}`, os acertos com `min={0}`.
     - Fechar o modal descarta as chaves. Isso é aceitável porque o `Overview` monta o
       diálogo com `key={theory?.lesson?.id ?? "closed"}`: ao reabrir, ele relê o
       progresso, e quem reabre vê se a primeira tentativa contou.
   - `routes/student/Overview.tsx:377-392`:
     - um helper (`recordTheory`) liga `pending`, chama a API e, **só no sucesso**, passa
       por `afterTheoryWrite`; devolve `result.ok ? null : result.error`. A falha NÃO vai
       para o `error` da página (que fica atrás do modal e duplicaria o alerta): quem a
       mostra é o `TheoryDialog`, que guarda a falha em estado próprio e a limpa no
       envio seguinte e na troca de aba;
     - `onSaveProgress` fica como está: gravar a página leva a coluna a um valor, não
       acumula.
   - `routes/student/Reviews.tsx:64-78`: a mesma regra.
     - A chave da revisão nasce no clique em "Registrar" (`:185`) e fica até o sucesso.
     - `record` usa a chave guardada no lugar de `newRequestId()`.
     - `parseCount` nos dois campos.

7. **Testes SQL.**
   - `00_fixtures.sql`: uma revisão para Fabi, que tem acesso vencido:
     `b4000000-0000-4000-8000-000000000002`, plano `a2…04`, aula `b2…01`, revisão 1.
   - `06_theory.sql`: bloco novo no fim (ver Testes).
   - `07_schema.sql`:
     - teste 06: `goal_entries_theory_lesson_fk` e `theory_review_entries_review_fk` na
       lista, e o texto acompanha ("quinze" vira "dezessete": a lista já tinha quinze
       depois dos PRs 1 e 3);
     - teste 08: as duas RPCs na lista ("as nove RPCs" vira "as onze");
     - teste 13: +1 tabela e +2 FKs sobre o número que a `main` tiver (51 → 52 e 91 → 93).

8. **E2E** em `apps/e2e/tests/student-theory.spec.ts` (ver Testes). `F-TEO-08` e `F-TEO-09`
   saem de "Fluxos que ainda não existem" e vão para a tabela da teoria em
   `docs/fluxos-e2e.md`.

9. **Docs.**
   - `CLAUDE.md`:
     - em "Toda RPC mutante precisa ser segura a retentativa", as duas RPCs novas entram
       na forma 1, ao lado das do 5a;
     - na tabela da fronteira, uma linha nova: `theory_review_entries | ninguém | SELECT e
       nada mais: escrita é de record_review_questions`, e a linha de `theory_progress` e
       `theory_reviews` diz que as questões passam pelas RPCs. A contagem de RPCs sobe de
       sete para nove.
   - `docs/de-para-schema.md`:
     - uma coluna nova em "Estado dos dois lados" (`06/10 · 5b`), medida pelas consultas da
       seção. O delta esperado é +1 tabela, +8 colunas, +1 policy, +2 CHECKs, +2 FKs,
       +5 índices e +5 funções, e **foi esse o medido** (52 tabelas, 530 colunas, 121
       policies, 139 CHECKs, 93 FKs, 168 índices, 44 funções);
     - em `registros` → `goal_entries`, a linha `—` | `theory_lesson_id` | "nova (QA de
       06/10/2026)".
   - `docs/bugs-encontrados.md`: QA-04 deixa de ser parcial.

## Testes

**`supabase/tests/06_theory.sql`**, depois do 15. O cenário é o Bruno, com o plano `a2…01`,
a meta `a5…02` e a aula `b2…01`. Não há regra de disciplina, então o mínimo é 15. Os
request ids usam o prefixo `c1…`; confira com grep que o 5a não o usou.

| # | Quem | O quê | Espera |
|---|---|---|---|
| 16 | Bruno | 10 questões, 8 acertos | `initial_questions_done = 10`, `initial_questions_required = 15`, `lesson_done = false`; uma linha em `goal_entries` com a chave e `theory_lesson_id = b2…01` |
| 17 | Bruno | o replay do 16 | continua 10, com uma linha só |
| 18 | Bruno | a mesma chave com 9 questões | `unique_violation` |
| 19 | Ana, depois Bruno | Ana cria `theory_review_rules` 1 e 2 para `forenses`; Bruno registra 5 com outra chave | 15, `lesson_done = true` e duas revisões da aula: a 1 da fixture, intacta pelo `do nothing`, e a 2 nova |
| 20 | Fabi | na meta `a5…05` | `insufficient_privilege` |
| 21 | Carla | na meta do Bruno; depois, a chave do 16 na meta `a5…04`, dela | `no_data_found`; `unique_violation`, sem vazar nada (a implementação numerou 21a e 21b) |
| 22 | Ana, depois Bruno | Ana cria `b2…02` em rascunho; Bruno registra nela | `no_data_found` |
| 23 | Bruno | 0 questões, 501 questões, acertos > total | `check_violation` nos três |
| 24 | Bruno | na revisão `b4…01` (mínimo 15), em sequência: 10; o replay; outro payload; +5; +1 com chave nova; o replay do +5 | 10; 10; `unique_violation`; 15 e `completed`; `raise_exception` com `like '%conclu%'`; sucesso, e não conflito |
| 25 | Fabi | na revisão `b4…02` | `insufficient_privilege` |
| 26 | Bruno, Ana, Carla | INSERT direto em `theory_review_entries`; leitura | o INSERT do Bruno dá `insufficient_privilege`; Bruno e Ana leem 2, Carla 0 |

Os request ids da implementação usam o prefixo `c5…` (o `c1…` já é o dos perfis de
`07_schema.sql`). No caso 24 o `raise exception 'FALHOU…'` tem o mesmo SQLSTATE (P0001) da
recusa esperada, e o handler `when raise_exception` o engoliria: a implementação usa uma
bandeira (`v_aceitou`) e levanta a falha fora do bloco.

Dentro do `do $$`, chame assim:
`select * into v_row from public.record_initial_questions('c1…'::uuid, …);`.

**E2E, em `apps/e2e/tests/student-theory.spec.ts`.** A técnica é a do README, nas rotas
`**/rest/v1/rpc/record_initial_questions` e `**/rest/v1/rpc/record_review_questions`.

`F-TEO-08 · QA-04 · questões iniciais com a resposta perdida somam uma vez`:

- envia 10/8 com a resposta abortada, espera o alerta de erro e clica de novo;
- a tela mostra `10/15`, e o banco tem `initial_questions_done = 10` e um registro em
  `goal_entries` para a meta;
- em outro teste: depois da resposta perdida, trocar para 12 é recusado com "outros
  valores", e o banco continua com 10.

`F-TEO-09 · QA-04 · a revisão com a resposta perdida soma uma vez`:

- fecha a aula 1 pelo modal (`initialQuestions: 5`, `reviewSpacing: 1`);
- na aba Revisões, envia 10/8 com a resposta abortada; o formulário continua aberto, e
  clica de novo;
- a revisão fica `data-status="completed"`, com `questions_answered = 10` e uma linha em
  `theory_review_entries`;
- em outro teste: o mesmo em `/aluno/revisoes`, pela `review-row`. A pré-condição ali é a
  linha de `theory_reviews` inserida direto (como o `F-REV-01` já faz): o que se exercita é
  registrar, e não criar a revisão.

Não há teste de duas abas: não dá para forçar a intercalação de forma determinística. Quem
a garante é o `on conflict do update`, numa instrução só, e o teste 19 cobre duas chaves
somando.

## Critério de pronto

- [ ] `npm run check` e `npm run db:test` verdes. Depois de `npm run db:reset`,
      `npm run e2e` verde, com `F-TEO-01` a `F-TEO-09` e `F-REV-01` passando.
- [ ] `grep -n "newRequestId()" apps/web/src/components/student/TheoryDialog.tsx apps/web/src/routes/student/Reviews.tsx`
      não mostra chamada dentro de submit nem de `record`.
- [ ] `theory.ts` não escreve mais em `goal_entries` nem em `theory_reviews`, e em
      `theory_progress` grava só as três colunas de leitura.
- [ ] Nenhum grant foi revogado. `git diff main -- supabase/migrations` mostra um arquivo
      novo e nenhum alterado.
- [ ] As cinco funções novas têm `set search_path = ''` e o `revoke`, e só as duas de
      `public` recebem `grant execute`.
- [ ] `schema.gen.ts` regenerado e commitado. Spec 32, catálogo, `CLAUDE.md`, de-para e
      `bugs-encontrados.md` atualizados.

## Armadilhas

- **Os OUT de `returns table` colidem com nomes de coluna.** `current_page`,
  `lesson_done`, `status`, `questions_answered` e `study_plan_id` viram variáveis dentro
  da função.
  - Sem `#variable_conflict use_column`, o Postgres acusa "column reference is
    ambiguous", inclusive no alvo do `on conflict`.
  - Qualifique toda coluna com o alias.
- **Na revisão, o replay vem antes de "já concluída".** Invertido, o `F-TEO-09` falha com
  conflito no envio que deu certo.
- **Procure a chave DEPOIS da trava** (lição do 5a). Antes dela, a segunda chamada não vê
  a primeira e cai no caminho do `unique_violation`. O caminho funciona, mas é o de exceção.
- **`security definer` passa por cima da RLS**, porque `postgres` tem `bypassrls`. Dono,
  acesso e catálogo são conferidos no corpo; a FK composta não sabe quem chamou.
- **O JWT dentro do definer continua sendo o do aluno.** Hoje nenhuma das três tabelas
  tem gatilho de proteção que leia `auth.jwt()`. Se o 1 ou o 5a criaram algum, confira
  que ele deixa a RPC passar.
- **`once()` não é a proteção.** Ele esquece a chave na falha, de propósito. Quem segura é
  o índice; o `once()` só poupa a segunda viagem no clique duplo.
- **A regra do catálogo da turma e o mínimo padrão 15 existem em dois lugares**: no SQL e
  em `loadTheoryContext`. Ponha um comentário cruzado nos dois; o teste 16 fixa o 15.
- **`supabase.rpc` de `returns table` devolve array**, e o gerador declara todo parâmetro
  como não nulo (ver `teacher-students.ts:369`).
- **As linhas que a 06 cria ficam para as suítes seguintes.** A aula do Bruno termina com
  `lesson_done = true`, e Ana passa a ter a aula `b2…02`, em rascunho. A única contagem
  de `theory_lessons` depois da 06 (`09_lesson_resource_links.sql:60`) filtra pelo id de
  `b2…01` e não é afetada. Confira de novo se alguma suíte nova entrar depois da 06.
- **`npm run db:test` antes de `npm run e2e` quebra o `global-setup`.** Rode
  `npm run db:reset` entre os dois.

## Fora do escopo

- **Revogar o caminho direto**: o INSERT em `goal_entries`, as colunas de contagem de
  `theory_progress` e a escrita em `theory_reviews`. É o 5c, depois deste bundle
  publicado.
- **Conclusão retroativa** quando o professor baixa o mínimo: a aula fecha no próximo
  registro de questões. Antes deste PR, salvar a página fechava.
- **Apagar um registro de questões iniciais não desconta o progresso.** `removeStudyEntry`
  não tem tela que o chame.
- **Derivar os contadores do ledger**, pelo motivo dado nas Decisões.
- **Preencher `theory_lesson_id` nos registros antigos** casando pelo título: é ambíguo, e
  nada lê a coluna além do replay.
- **Questões de revisão no desempenho da semana:** continuam fora, como hoje.
- **A corrida do INSERT de página em duas abas** (`writeProgress`, `23505` na segunda):
  página é estado, e o contrato não mudou.
- **A meta de teoria passar de `pending` para `in_progress`** ao registrar questões
  iniciais: hoje não passa, e continua sem passar.
