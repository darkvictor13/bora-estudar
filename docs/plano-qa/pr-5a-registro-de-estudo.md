# PR 5a — A escrita do aluno: registro de estudo e estudo extra

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-04 (registro e estudo extra; a teoria é o 5b), QA-07, QA-10, QA-11, QA-14, QA-27, QA-28, N-02, N-05, N-07 (o extra conta no dia em que foi lançado, não no dia escolhido; decisão do usuário de 06/10/2026) |
| Branch | `fix/qa-5a-registro-de-estudo` |
| Depende de | PR 1, PR 3 e PR 4 mergeados na `main`. 1 e 3 pela fila de migration; o 4 pela tradução de erro (`""` → `offline`, `23514`/`22P02`/`22003`/`23502` → `validation`) e pelo `once()` que limpa a chave quando a tentativa lança |
| Migration | sim, uma: `supabase migration new student_study_entries` |

## O defeito

Tudo verificado contra o commit `1769ae2` e o banco local.

- **QA-04: retentativa duplica.** `recordStudy` (`apps/web/src/lib/api/supabase/week.ts:303-346`) faz duas requisições: INSERT em `goal_entries`, depois UPDATE `pending` → `in_progress`. `recordExtraStudy` (`:432-506`) faz três: INSERT em `goals`, INSERT em `goal_entries` e um DELETE de compensação (`:500`). A única defesa é o `once()` (`idempotency.ts:26-45`). Ele esquece a chave quando a tentativa falha, então "o servidor gravou e a resposta se perdeu" seguido de nova tentativa grava duas vezes. `goal_entries` não tem `request_id`.
- **QA-07, N-05: aluno suspenso continua escrevendo.** `goals_update` (`20260914150000_initial_schema.sql:1717-1719`) não chama `has_active_access()`. Por isso concluir, reabrir e pular (`week.ts:377-421`, todos por UPDATE direto) funcionam com o acesso vencido. `goals_delete` (`:1721-1725`) e `goal_entries_delete` (`:1745-1746`) também não chamam, e o aluno vencido apaga registro e meta extra.
- **QA-28: o aluno escreve o resultado da meta.** O grant de UPDATE de `goals` (`:1904-1909`) inclui `spent_minutes`, `questions_answered` e `correct_answers`. `protect_goal_planning_fields` (`:1212-1250`) não as congela. Ninguém mais escreve essas colunas: o bundle não as escreve (`grep` em `apps/web/src`, `seed.sql` e `apps/e2e`) e **as RPCs de bateria não existem** (`pg_proc` não tem `start_quiz_session`, `finish_quiz_session` nem `record_quiz_session_time`, e nenhuma migration as cria). O tempo da bateria mora em `quiz_sessions.duration_minutes`, nunca em `goal_entries`.
- **QA-10: o registro aceita qualquer número.** `goal_entries` não tem nenhuma CHECK. A validação mora no adaptador (`week.ts:305-313`), fora de `validation.ts`, e só cobre "acertos > questões" e "tudo zero". A tela converte com `Number(x) || 0` (`RecordStudyDialog.tsx:49`, `ExtraStudyDialog.tsx:64`), o que deixa passar −30, 1.5 e 1e3. A fixture recusa com outra frase (`fixtures.ts:803`, "Acertos não podem…"), e o `recordExtraStudy` dela (`:879`) não valida nada. No banco local, em 06/10/2026, havia **8 registros fora da regra**, todos `extra` e todos do QA (−30, 1000 e 14400 minutos, questões negativas), mais **1 meta** com `correct_answers = 999` escrita pela API.
- **QA-11: a data do estudo extra não tem limite.** `weekNumberOf` (`lib/domain/week.ts:50-54`) põe qualquer data anterior ao início na semana 1, e não existe teto.
- **N-02: não cabe um segundo extra no mesmo dia.** Todo extra nasce com `day_position: 99` (`week.ts:472`), e `goals_one_per_slot_idx` (`initial_schema.sql:896`) é único. O segundo extra do dia bate em `23505`.
- **QA-14: a data sugerida é a segunda-feira, não hoje.** Com "Semana inteira", o botão sugere `weekOf.startsOn` (`Overview.tsx:311`). O caminho do cronômetro faz o mesmo (`Overview.tsx:144-148`; `StudentLayout.tsx:146` manda `?estudoExtra=cronometro` sem `dia`).
- **QA-27: setState durante o render.** `ExtraStudyDialog.tsx:58` chama `pauseStudyTimerForRecord()` no inicializador do `useState`. A função grava no `localStorage` e dispara o evento que a `StudyTimerBar` escuta (`StudyTimer.tsx:23-26`, `:74-89`), e o React acusa "Cannot update a component (`StudyTimerBar`) while rendering…".
- **N-07: o extra de ontem conta como estudo de hoje.** O registro só tem `created_at = now()`, e todo leitor que agrupa por dia usa esse instante. A meta vai para o dia escolhido; o registro, para hoje. Os leitores, verificados por `grep` em `goal_entries`, `created_at` e `createdAt`:

  | Onde | O que faz com o instante |
  |---|---|
  | `lib/api/supabase/statistics.ts:143` | `loadStudyDays`, o calendário de constância, pelo dia local |
  | `statistics.ts:357`, `:365`, `:376-380` | tempo por dia, sequência e questões por dia, pelo dia local |
  | `statistics.ts:391-398` | `minutesByDay` e `minutesByMonth` por `created_at.slice(…)`, em **UTC** (o PR 6 troca para o dia local) |
  | `statistics.ts:110-111`, `:137-138`, `:304-305` | filtro de ANO por `created_at` |
  | `lib/api/supabase/week.ts:174-184` | `entryDates`, a sequência da semana, por `created_at.slice(0, 10)` em **UTC** |
  | `lib/domain/schedule.ts:40` | `dailyQuestionPerformance`, o desempenho do dia na semana |
  | `lib/domain/question-performance.ts:32` | `questionsByDay` |
  | `fixtures.ts:653`, `:1107`, `:1167` | sequência e calendário da fixture, por `createdAt.slice(0, 10)` |
  | funções SQL `student_question_comparison` (`20260929230000:96-97`, `:144`), `student_weekly_question_comparison` (`20260930100000:74`) e `student_subject_peer_comparison` (`20260930110000:57`, `:75`) | filtro de ano por `created_at`, com limites UTC |
  | `teacher-students.ts:133-137` | "última atividade", um instante |

  Nenhuma view lê `goal_entries`: `information_schema.view_table_usage` está vazia para ela, e `vw_quiz_session_performance` lê o ledger da bateria. A ordem dos registros dentro de uma meta (`week.ts:115`) é a ordem em que foram lançados, e ela não muda.
- **Achado ao planejar.** O `RecordStudyDialog` nunca desmonta: ele devolve `null` quando não há meta (`:42`). Por isso o `requestId` do `useState` (`:38`) atravessa aberturas. Cancelar depois de uma falha e abrir OUTRA meta reaproveita a chave, e com a idempotência no servidor isso viraria "payload diferente".

## Decisões aplicadas

- **D-04:** um registro vai de 0 a 240 minutos e de 0 a 500 questões, com acertos entre 0 e o número de questões, e não pode ser tudo zero.
- **D-05:** a data do estudo extra vai de `study_plans.starts_on` até hoje. A spec 19 se ajusta à tela, que usa data livre.
- **D-11:** "hoje" é o do aparelho.
- **D-16:** Cancelar o estudo extra retoma o cronômetro.
- **Decisão do usuário de 06/10/2026 (N-07):** o estudo extra conta no DIA ESCOLHIDO, na série, na sequência, no calendário e nas estatísticas.
- Fica fora deste PR (README, "Fora deste plano"): concluir, reabrir e pular **continuam como UPDATE direto**. Aqui só a policy é corrigida.

**Escolhas deste plano.** Quem discordar reabre antes do código.

1. **Meta de bateria é `notebook_block_id is not null`.** É o mesmo critério de `isQuizGoal` e de `protect_goal_quiz_result`. Meta `question_block` sem caderno continua recebendo registro, como hoje.
2. **Erros das RPCs, por SQLSTATE e nunca pela mensagem:**

   | Caso | SQLSTATE | `ApiErrorCode` |
   |---|---|---|
   | Acesso vencido | `42501` | `forbidden`, frase atual |
   | Meta ou plano alheio ou inexistente | `P0002` | `not_found`, case novo em `translateDbError` |
   | Mesma chave com outro payload | `23505` | `conflict`, frase própria (ver passo 5) |
   | Data, tipo ou matéria inválidos | `23514` | `validation`, pelo PR 4 |
   | Bateria ou plano inativo | `P0001` | `conflict`, mensagem crua; nenhuma tela chega aqui |

3. **O "hoje" do banco é `((now() at time zone 'UTC') + interval '14 hours')::date`**, isto é, a data em que já é hoje em algum lugar do planeta. O banco não conhece o fuso do aparelho (D-11). Fixar `America/Sao_Paulo` recusaria o aluno que viaja para leste. A regra estrita, até o hoje DO APARELHO, é de `validation.ts`. O teto do servidor só barra o futuro absurdo do QA-11.
4. **A trava vem antes da busca por `request_id`.** O lock é `for no key update` na meta (`record_goal_entry`) ou no plano (`record_extra_study`). Duas chamadas com a mesma chave na mesma linha se serializam, e a segunda enxerga a gravação da primeira. `no key update`, e não `update`, para não bloquear o `FOR KEY SHARE` da FK de quem insere outras metas do plano.
5. **A retentativa vem antes da checagem de acesso.** Se a primeira tentativa gravou e o acesso venceu em seguida, a retentativa responde "gravado", que é o que aconteceu.
6. **`request_id` e `created_at` ficam fora do grant de INSERT de `goal_entries`.** A coluna que sustenta a idempotência só é escrita pela RPC, e o aluno deixa de poder datar registro no passado. As colunas que ficam no grant são exatamente as que o bundle no ar manda (`week.ts:320-330`, `:486-494`; `theory.ts:703-712`).
7. **Limpeza do dado (produção não existe).** A migration apaga os registros fora das CHECKs e as metas `extra` que ficarem sem registro nenhum por causa disso. Também zera as três colunas de resultado das metas sem bateria. Apagar, e não grampear: os valores são de teste do QA, e grampear inventaria um número.
8. **`goal_entries.studied_on date`, nulável (N-07).** É o dia em que o estudo aconteceu, quando não é o dia em que foi lançado.
   - `record_extra_study` grava `p_date`.
   - `record_goal_entry` grava **nulo**. Registrar numa meta é "estudei agora", e o momento já está em `created_at`. Gravar a data exigiria do servidor um fuso que ele não conhece: seria o dia UTC, errado depois das 21h em Brasília. Receber a data do cliente seria um parâmetro sempre igual a "hoje", redundante com `created_at` e falsificável. As RPCs da teoria (5b) seguem a mesma regra.
   - A coluna fica fora dos grants de INSERT e de UPDATE: só as RPCs a escrevem.
   - CHECK `goal_entries_studied_on_check (studied_on is null or studied_on <= (created_at at time zone 'UTC')::date + 1)`, o mesmo teto "não é futuro em lugar nenhum" da escolha 3, agora no banco. O piso, que é o `starts_on` do plano, mora na RPC, porque exigiria uma junção.
9. **O dia de um registro é `studied_on ?? dia LOCAL de created_at`.** Uma função só, `entryDay`, em `lib/domain/schedule.ts`, ao lado de `localDate`. Todo leitor da tabela do N-07 passa a usá-la. Duas exceções:
   - **Filtro de ano no SQL:** `coalesce(studied_on, (created_at at time zone 'UTC')::date)`. O banco não tem o fuso do aparelho, e com `studied_on` nulo o resultado é idêntico ao limite UTC de hoje, sem mudança de comportamento.
   - **"Última atividade" do professor continua sendo `created_at`.** É um instante mostrado com hora, e lançar hoje um extra de ontem é atividade de hoje.
10. **Backfill sim, por heurística declarada.** Uma meta conta como extra lançado pelo aluno quando:
    - é do tipo `extra` e está `completed`;
    - o título é um dos cinco do diálogo;
    - o registro foi gravado até 60 s depois da meta. O bundle anterior fazia os dois INSERTs em seguida.

    A meta extra planejada pelo professor não casa: o título dela é livre (o e2e usa "Revisão livre da semana · …"), e o registro vem depois. O dia sai da casa da meta: `starts_on + (week_number − 1) * 7 + ((weekday − isodow(starts_on) + 7) % 7)`, a mesma conta de `dateOfWeekday`.

    Vale fazer: é um comando, e sem ele o extra de teste de staging continua contando no dia do lançamento. O lixo do QA-11 sai inteiro, registro e meta: é a meta da "semana 222", com dia derivado depois do dia do lançamento + 1. No banco local de 06/10/2026, eram 26 registros extras, 2 deles em 2031-01-01.

## Passo a passo

### 1. Spec e catálogo (primeiro commit, sozinho)

**`docs/specs/12-conclusao-de-meta.md`.** Acrescente uma nota "Atualizada em <data>" no topo e as regras novas. Ids existentes não mudam; regra substituída é marcada como tal.

- **R-CONC-21.** Registrar estudo é `record_goal_entry`: insere em `goal_entries` e passa `pending` para `in_progress` na mesma transação. Recusa meta com `notebook_block_id`, meta de outro aluno (`P0002`, sem revelar que existe) e aluno sem acesso vigente (`42501`).
- **R-CONC-22.** Idempotência com payload, sustentada por `goal_entries_request_uidx`. O payload são as colunas do próprio registro (`goal_id`, `minutes`, `questions`, `correct_answers`, `note`, `manual_lesson`, `theory_stage`). Mesma chave com outro payload é recusada com `23505`.
- **R-CONC-23.** Os limites de D-04, nas CHECKs `goal_entries_minutes_check`, `_questions_check`, `_correct_answers_check` e `_not_empty_check`. As frases moram em `checkStudyEntry`.
- **R-CONC-24.** Concluir, reabrir, pular e apagar exigem acesso vigente: `has_active_access()` no `WITH CHECK` de `goals_update` e no `USING` de `goals_delete` e `goal_entries_delete`.
- **R-CONC-25.** O aluno não escreve `spent_minutes`, `questions_answered` nem `correct_answers` de meta sem bateria. Quem impede é `protect_goal_planning_fields`.
- **R-CONC-26.** `record_goal_entry` grava `studied_on` nulo: o dia do registro é o dia local de `created_at` (escolha 8).
- **Nota em R-CONC-10.** `record_quiz_session_time` não existe neste schema. O tempo da bateria é `quiz_sessions.duration_minutes`, e o teto de `goal_entries` não o alcança.
- **CA-15 a CA-19:** um por regra, cobertos por F-META-03, F-META-08, `03_goals.sql` e `07_schema.sql`.

**`docs/specs/19-estudo-extra-avulso.md`.** Nota "Atualizada em <data>". R-EXTRA-08, -09, -11, -13 e -18 ficam marcadas como substituídas.

- **R-EXTRA-20.** O aluno escolhe a DATA, de `starts_on` até hoje. A RPC calcula a semana (`(data − starts_on) / 7 + 1`), o dia (`isodow`) e a posição (`max(day_position) + 1` do dia, com o plano travado).
- **R-EXTRA-21.** Exige plano `active` e acesso vigente. Uma semana sem meta passa a existir com o registro, e não se exige mais que a semana já tenha meta.
- **R-EXTRA-22.** O "hoje" da tela é o do aparelho. O banco aceita até UTC+14 (escolha 3).
- **R-EXTRA-23.** O registro extra grava questões e acertos e entra no desempenho, como a tela já faz. Substitui R-EXTRA-18.
- **R-EXTRA-24.** Valem os limites de D-04, nas mesmas CHECKs.
- **R-EXTRA-25.** Idempotência por `goal_entries.request_id`. O payload são as colunas da meta (plano, título, matéria) mais as do registro, `studied_on` incluída.
- **R-EXTRA-26.** A data sugerida é o dia escolhido no calendário quando ele não passa de hoje. Sem dia escolhido, é hoje quando hoje está na semana vista. Semana futura também sugere hoje; semana passada sugere o primeiro dia dela.
- **R-EXTRA-27.** Abrir o diálogo pausa o cronômetro e vincula o tempo, sem escrever durante o render. Cancelar retoma o cronômetro, se ele estava correndo. Lançar zera o cronômetro.
- **R-EXTRA-28 (N-07).** O registro extra guarda o dia escolhido em `goal_entries.studied_on`. O dia de qualquer registro é `studied_on`, ou o dia LOCAL de `created_at` quando a coluna é nula. Isso vale para a sequência, o calendário, o desempenho do dia, as séries por dia e por mês e o recorte por ano. Quem impõe o teto é `goal_entries_studied_on_check`.
- **CA-13 a CA-19:** cobertos por F-EXTRA-01, F-EST-01 e `03_goals.sql`. CA-19 é o extra lançado para ontem contando ontem.

**`docs/specs/25-tempo-de-estudo-e-series.md`.** Nota no topo: o dia de um registro segue R-EXTRA-28. A spec descreve `vw_study_time`, que não existe neste schema, e não é reescrita aqui.

**`docs/fluxos-e2e.md`, em "Fluxos que ainda não existem".** Reserve `F-META-08 · sem acesso vigente, a semana não muda (QA-07)`.

### 2. Migration e tipos

Crie `supabase/migrations/<ts>_student_study_entries.sql`. O cabeçalho segue o estilo de `20260918120000`: o que fecha, o que fez com os dados e por que é compatível com o bundle no ar.

**Compatibilidade.** As duas colunas novas, `request_id` e `studied_on`, são nuláveis, e o bundle no ar não as conhece. Ele continua lendo o dia por `created_at`, o que é o comportamento de antes. RPCs novas não substituem nada. O INSERT direto do aluno continua aceito: o 5c o retira. As policies só ENCOLHEM para quem tem o acesso vencido, e o gatilho só recusa colunas que o bundle nunca escreve.

```sql
-- 1. Dados (README: corrigir e validar no mesmo arquivo)
do $$
declare v_goals uuid[];
begin
  select coalesce(array_agg(distinct e.goal_id), '{}') into v_goals
    from public.goal_entries e
   where not (e.minutes between 0 and 240 and e.questions between 0 and 500
              and e.correct_answers between 0 and e.questions
              and (e.minutes > 0 or e.questions > 0));

  delete from public.goal_entries e
   where not (e.minutes between 0 and 240 and e.questions between 0 and 500
              and e.correct_answers between 0 and e.questions
              and (e.minutes > 0 or e.questions > 0));

  -- Só a meta `extra` que ficou SEM registro: a do professor fica.
  delete from public.goals g
   where g.id = any (v_goals) and g.type = 'extra'
     and not exists (select 1 from public.goal_entries e where e.goal_id = g.id);

  update public.goals
     set spent_minutes = null, questions_answered = 0, correct_answers = 0
   where notebook_block_id is null
     and (spent_minutes is not null or questions_answered is distinct from 0
          or correct_answers is distinct from 0);
end $$;

-- 2. Limites de um registro (D-04)
alter table public.goal_entries
  add constraint goal_entries_minutes_check check (minutes between 0 and 240),
  add constraint goal_entries_questions_check check (questions between 0 and 500),
  add constraint goal_entries_correct_answers_check check (correct_answers between 0 and questions),
  add constraint goal_entries_not_empty_check check (minutes > 0 or questions > 0);

-- 3. A chave de retentativa. Nulável: o bundle no ar insere sem ela.
alter table public.goal_entries add column request_id uuid;
comment on column public.goal_entries.request_id is '…gerada uma vez na origem; o UNIQUE é a idempotência de record_goal_entry e record_extra_study…';
create unique index goal_entries_request_uidx on public.goal_entries (request_id);

-- 3b. O dia do estudo, quando não é o dia do lançamento (N-07). Nulável: o
--     registro numa meta é "estudei agora", e o dia é o local de created_at.
alter table public.goal_entries add column studied_on date;
comment on column public.goal_entries.studied_on is '…o dia escolhido no estudo extra; nulo = o dia local de created_at. Escrito só pelas RPCs…';

-- Backfill do extra lançado pelo aluno (escolha 10). O lixo do QA-11 sai inteiro.
do $$
begin
  create temporary table extra_days on commit drop as
    select e.id as entry_id, g.id as goal_id,
           sp.starts_on + (g.week_number - 1) * 7
             + ((g.weekday - extract(isodow from sp.starts_on)::integer + 7) % 7) as day,
           (e.created_at at time zone 'UTC')::date as recorded_on
      from public.goal_entries e
      join public.goals g on g.id = e.goal_id
      join public.study_plans sp on sp.id = g.study_plan_id
     where g.type = 'extra' and g.status = 'completed'
       and g.title in ('Lei seca', 'Anki', 'Simulado', 'Revisão', 'Questões extras')
       and abs(extract(epoch from e.created_at - g.created_at)) < 60;

  delete from public.goal_entries e using extra_days d
   where e.id = d.entry_id and d.day > d.recorded_on + 1;
  delete from public.goals g using extra_days d
   where g.id = d.goal_id and d.day > d.recorded_on + 1
     and not exists (select 1 from public.goal_entries e where e.goal_id = g.id);

  update public.goal_entries e set studied_on = d.day
    from extra_days d
   where e.id = d.entry_id and d.day <= d.recorded_on + 1;
end $$;

-- O teto da escolha 3, no banco: não é futuro em lugar nenhum. timezone(text,
-- timestamptz) é IMMUTABLE. O piso (starts_on) exige junção e mora na RPC.
alter table public.goal_entries
  add constraint goal_entries_studied_on_check
  check (studied_on is null or studied_on <= (created_at at time zone 'UTC')::date + 1);

-- Revogar no nível da tabela leva junto os grants de coluna; por isso o grant vem DEPOIS.
revoke insert on public.goal_entries from authenticated;
grant insert (goal_id, teacher_id, student_id, minutes, questions, correct_answers,
              manual_lesson, theory_stage, note) on public.goal_entries to authenticated;

-- 4. Acesso vigente nas escritas do aluno (QA-07, N-05)
alter policy goals_update on public.goals
  using (teacher_id = (select auth.uid()) or student_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid())
              or (student_id = (select auth.uid()) and public.has_active_access()));
alter policy goals_delete on public.goals
  using (teacher_id = (select auth.uid())
         or (student_id = (select auth.uid()) and type in ('extra', 'reinforcement')
             and public.has_active_access()));
alter policy goal_entries_delete on public.goal_entries
  using (teacher_id = (select auth.uid())
         or (student_id = (select auth.uid()) and public.has_active_access()));

-- 5. O resultado da meta não é do aluno (QA-28). O corpo é o de
--    20260914150000:1212-1246, mais o bloco marcado.
create or replace function app_private.protect_goal_planning_fields() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := coalesce(auth.jwt() ->> 'role', '');
  v_privileged boolean := v_actor not in ('authenticated', 'anon');
begin
  if v_privileged or (select auth.uid()) = old.teacher_id then return new; end if;
  if old.type is distinct from new.type then
    raise exception 'o tipo da meta so e alterado pelo professor';
  end if;
  -- NOVO. Só meta SEM bateria: a de bateria é de protect_goal_quiz_result, que
  -- conhece o motor (app.quiz_rpc) e dispara DEPOIS deste (ordem alfabética).
  if coalesce(old.notebook_block_id, new.notebook_block_id) is null
     and (old.spent_minutes is distinct from new.spent_minutes
       or old.questions_answered is distinct from new.questions_answered
       or old.correct_answers is distinct from new.correct_answers) then
    raise exception 'o resultado da meta sai dos registros de estudo, e o aluno nao o edita';
  end if;
  -- … bloco `old.type not in ('extra','reinforcement') and (...)` idêntico ao original …
  return new;
end;
$$;

-- 6. A comparação da retentativa, em função própria (o mesmo motivo de replay_access_grant)
create or replace function app_private.replay_goal_entry(
  p_entry public.goal_entries, p_student_id uuid, p_goal_id uuid, p_minutes integer,
  p_questions integer, p_correct_answers integer, p_note text, p_manual_lesson text,
  p_theory_stage public.theory_stage
) returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_entry.student_id is distinct from p_student_id
     or p_entry.goal_id is distinct from p_goal_id
     or p_entry.minutes is distinct from p_minutes
     or p_entry.questions is distinct from p_questions
     or p_entry.correct_answers is distinct from p_correct_answers
     or p_entry.note is distinct from p_note
     or p_entry.manual_lesson is distinct from p_manual_lesson
     or p_entry.theory_stage is distinct from p_theory_stage then
    raise exception 'este request_id ja foi usado com outro registro' using errcode = 'unique_violation';
  end if;
  return p_entry.id;
end;
$$;

-- replay_extra_study(p_entry goal_entries, p_goal goals, p_student_id uuid,
--   p_study_plan_id uuid, p_title text, p_subject text, p_date date,
--   p_minutes integer, p_questions integer, p_correct_answers integer,
--   p_note text) returns uuid
-- Mesma forma. Compara entry.student_id, goal.study_plan_id, goal.type = 'extra',
-- goal.title, goal.subject, entry.studied_on = p_date (o dia é a própria coluna, e
-- semana e dia da meta derivam dele), os três números e a nota. Devolve p_goal.id.

create or replace function public.record_goal_entry(
  p_request_id uuid, p_goal_id uuid, p_minutes integer, p_questions integer,
  p_correct_answers integer, p_note text default null,
  p_manual_lesson text default null, p_theory_stage public.theory_stage default null
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_lesson text := nullif(btrim(p_manual_lesson), '');
  v_goal public.goals%rowtype;
  v_seen public.goal_entries%rowtype;
  v_entry uuid;
begin
  if v_uid is null then
    raise exception 'usuario nao autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_request_id is null then raise exception 'request_id e obrigatorio'; end if;

  select * into v_goal from public.goals g where g.id = p_goal_id for no key update;
  if not found or v_goal.student_id <> v_uid then
    raise exception 'meta nao encontrada' using errcode = 'no_data_found';
  end if;

  select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
  if found then
    return app_private.replay_goal_entry(v_seen, v_uid, p_goal_id, p_minutes, p_questions,
                                         p_correct_answers, v_note, v_lesson, p_theory_stage);
  end if;

  if v_goal.notebook_block_id is not null then
    raise exception 'meta de bateria se registra pela bateria';
  end if;
  if not public.has_active_access() then
    raise exception 'o acesso do aluno nao esta vigente' using errcode = 'insufficient_privilege';
  end if;

  begin
    insert into public.goal_entries (goal_id, teacher_id, student_id, minutes, questions,
      correct_answers, note, manual_lesson, theory_stage, request_id)
    values (v_goal.id, v_goal.teacher_id, v_goal.student_id, p_minutes, p_questions,
      p_correct_answers, v_note, v_lesson, p_theory_stage, p_request_id)
    returning id into v_entry;
  exception when unique_violation then
    -- A mesma chave noutra meta, em paralelo: a trava acima é por meta.
    select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
    return app_private.replay_goal_entry(v_seen, v_uid, p_goal_id, p_minutes, p_questions,
                                         p_correct_answers, v_note, v_lesson, p_theory_stage);
  end;

  -- REGISTRAR NÃO CONCLUI.
  if v_goal.status = 'pending' then
    update public.goals set status = 'in_progress' where id = v_goal.id;
  end if;
  return v_entry;
end;
$$;

create or replace function public.record_extra_study(
  p_request_id uuid, p_study_plan_id uuid, p_kind text, p_subject text, p_date date,
  p_minutes integer, p_questions integer, p_correct_answers integer, p_note text default null
) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  -- O tipo vive no TÍTULO (spec 19): texto conferido aqui, sem enum que nada guardaria.
  v_title text := case p_kind when 'dry_law' then 'Lei seca' when 'anki' then 'Anki'
                    when 'mock_exam' then 'Simulado' when 'review' then 'Revisão'
                    when 'extra_questions' then 'Questões extras' end;
  v_subject text := btrim(p_subject);
  v_note text := nullif(btrim(p_note), '');
  v_latest date := ((now() at time zone 'UTC') + interval '14 hours')::date;
  v_plan public.study_plans%rowtype;
  v_seen public.goal_entries%rowtype;
  v_seen_goal public.goals%rowtype;
  v_week integer; v_weekday integer; v_position integer; v_goal uuid;
begin
  -- 42501 sem uid; request_id nulo; v_title nulo e v_subject vazio com errcode = 'check_violation'
  select * into v_plan from public.study_plans p where p.id = p_study_plan_id for no key update;
  if not found or v_plan.student_id <> v_uid then
    raise exception 'planejamento nao encontrado' using errcode = 'no_data_found';
  end if;

  v_week := (p_date - v_plan.starts_on) / 7 + 1;
  v_weekday := extract(isodow from p_date)::integer;

  select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
  if found then
    select * into v_seen_goal from public.goals g where g.id = v_seen.goal_id;
    return app_private.replay_extra_study(v_seen, v_seen_goal, v_uid, p_study_plan_id, v_title,
      v_subject, p_date, p_minutes, p_questions, p_correct_answers, v_note);
  end if;

  if v_plan.status <> 'active' then raise exception 'o planejamento nao esta ativo'; end if;
  if not public.has_active_access() then raise … using errcode = 'insufficient_privilege'; end if;
  if p_date is null or p_date < v_plan.starts_on or p_date > v_latest then
    raise exception 'a data do estudo extra vai do inicio do planejamento ate hoje'
      using errcode = 'check_violation';
  end if;

  -- N-02: depois de tudo que já existe no dia. Seguro porque o plano está travado.
  select coalesce(max(g.day_position), 0) + 1 into v_position from public.goals g
   where g.study_plan_id = v_plan.id and g.week_number = v_week and g.weekday = v_weekday;

  begin  -- as DUAS inserções no bloco: a exceção desfaz a meta junto
    insert into public.goals (study_plan_id, teacher_id, student_id, week_number, weekday,
      weekday_name, day_position, type, subject, title, planned_minutes, status, completed_at)
    values (v_plan.id, v_plan.teacher_id, v_plan.student_id, v_week, v_weekday,
      (array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira',
             'Sábado','Domingo'])[v_weekday],
      v_position, 'extra', v_subject, v_title, p_minutes, 'completed', now())
    returning id into v_goal;

    insert into public.goal_entries (goal_id, teacher_id, student_id, minutes, questions,
      correct_answers, note, request_id, studied_on)
    values (v_goal, v_plan.teacher_id, v_plan.student_id, p_minutes, p_questions,
      p_correct_answers, v_note, p_request_id, p_date);   -- N-07
  exception when unique_violation then
    select * into v_seen from public.goal_entries e where e.request_id = p_request_id;
    if not found then raise; end if;  -- era outra unicidade: propaga
    select * into v_seen_goal from public.goals g where g.id = v_seen.goal_id;
    return app_private.replay_extra_study(…mesmos argumentos…);
  end;
  return v_goal;
end;
$$;

-- 7. Privilégios. Supabase concede EXECUTE por default a anon e authenticated, e
--    o Postgres a PUBLIC: revogue dos três antes do grant nominal.
revoke all on function app_private.replay_goal_entry(public.goal_entries, uuid, uuid, integer,
  integer, integer, text, text, public.theory_stage) from public, anon, authenticated;
revoke all on function app_private.replay_extra_study(public.goal_entries, public.goals, uuid,
  uuid, text, text, date, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.record_goal_entry(uuid, uuid, integer, integer, integer, text,
  text, public.theory_stage) from public, anon, authenticated;
revoke all on function public.record_extra_study(uuid, uuid, text, text, date, integer, integer,
  integer, text) from public, anon, authenticated;
grant execute on function public.record_goal_entry(…) to authenticated;
grant execute on function public.record_extra_study(…) to authenticated;
-- + comment on function de cada uma, dizendo que índice sustenta a idempotência

-- 8. O recorte por ano das comparações segue o dia do registro (N-07).
--    `create or replace` das três, com o CORPO INTEIRO copiado da migration de
--    origem (mantém `security definer`, `set search_path = ''`, assinatura e
--    retorno; `create or replace` preserva os grants). Troque SÓ o predicado
--      ge.created_at >= v_from and ge.created_at < v_to
--    por
--      coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date)
--        >= make_date(p_year, 1, 1)
--      and coalesce(ge.studied_on, (ge.created_at at time zone 'UTC')::date)
--        <  make_date(p_year + 1, 1, 1)
--    e tire v_from e v_to, que ficam sem uso. Com studied_on nulo é o mesmo
--    limite UTC de hoje: nada muda para quem não é extra.
--      student_question_comparison         20260929230000:96-97 e :144
--      student_weekly_question_comparison  20260930100000:74  (agrupa por
--                                          g.week_number, que no extra já
--                                          deriva do dia escolhido)
--      student_subject_peer_comparison     20260930110000:57 e :75
```

Antes de escrever o comentário de dados, rode o SELECT da condição do passo 1 no banco local. Em 06/10/2026 deu 8 registros e 1 meta. Rode também o `select` de `extra_days`: deu 26 registros, 2 deles no futuro. O comentário registra as duas contagens.

Depois: `npm run db:types` e commite `packages/database/src/schema.gen.ts`.

### 3. Suítes de banco

Ver **Testes**. Rode `npm run db:test` e, depois dele, `npm run db:reset`.

### 4. Contrato

**`apps/web/src/lib/api/validation.ts`**

- `MAX_ENTRY_MINUTES = 240` e `MAX_ENTRY_QUESTIONS = 500`. A tela tira o `max` daqui.
- `checkStudyEntry({ minutes, questions, correctAnswers })`, nesta ordem:
  - "Informe o tempo em minutos inteiros, de 0 a 240 por registro." (`minutes`; `Number.isInteger` recusa `NaN` e 1.5);
  - "Informe as questões em número inteiro, de 0 a 500 por registro." (`questions`);
  - "Informe os acertos em número inteiro, a partir de 0." (`correctAnswers`);
  - "Os acertos não podem passar do total de questões." (`correctAnswers`; frase atual, que o e2e confere);
  - "Informe o tempo estudado ou as questões feitas." (`minutes`).
- `checkExtraStudyDate(date, planStartsOn, today)`:
  - formato `AAAA-MM-DD` que sobrevive à ida e volta por `Date`, senão "Informe a data do estudo." (`date`);
  - fora de `[planStartsOn, today]`: "A data precisa estar entre o início do planejamento e hoje." (`date`).
- `checkExtraStudy(input, planStartsOn, today)`: "Informe a matéria." (`subject`), depois a data, depois `checkStudyEntry`. É a ordem dos campos no diálogo.
- `STUDY_REPLAY_CONFLICT`: "Este estudo já foi registrado com outros valores. Atualize a página para ver o que foi gravado."

**`apps/web/src/lib/domain/week.ts`**, com testes em `week.test.ts`:

- `defaultExtraDate(week: { startsOn; endsOn }, selected: IsoDate | null, today: IsoDate)`. Devolve `selected` se ele está na semana e é ≤ hoje. Senão, hoje, se hoje está na semana ou a semana é futura. Senão, `week.startsOn` (semana passada, como já é hoje).
- `parseCount(raw: string)`: `""` → 0; `/^\d+$/` → número; qualquer outra coisa → `NaN`. Assim −30, 1.5 e 1e3 chegam inválidos à validação.

**`apps/web/src/lib/domain/study-timer.ts`**, com testes em `study-timer.test.ts`:

- `pauseTimer(state, now)` e `resumeTimer(state, now)`, puras e idempotentes. O `pause()` de `useStudyTimer` passa a usar a primeira.

**O dia de um registro (N-07)**

- `contract.ts`: `StudyEntry` ganha `readonly studiedOn: IsoDate | null`, com a doc "o dia escolhido no estudo extra; nulo = o dia local de `createdAt`; leia por `entryDay`".
- `lib/domain/schedule.ts`: `entryDay(entry: { readonly studiedOn?: IsoDate | null; readonly createdAt: string }): IsoDate`, que devolve `entry.studiedOn ?? localDate(new Date(entry.createdAt))`. Testes em `schedule.test.ts`.
- `schedule.ts:40` (`dailyQuestionPerformance`) e `question-performance.ts:32` (`questionsByDay`, cuja entrada ganha `studiedOn?`) passam a usar `entryDay`.

### 5. Adaptador e fixture

**`supabase/week.ts`**

- `recordStudy`:
  - roda `checkStudyEntry` fora do `once`, como `grantAccess`;
  - dentro do `once`, chama `supabase.rpc("record_goal_entry", …)` e depois `reloadGoal(input.goalId)`;
  - os opcionais vão por espalhamento (`...(input.note ? { p_note: input.note } : {})`), por causa de `exactOptionalPropertyTypes`;
  - sai o `goalContext` e saem as duas escritas.
- `recordExtraStudy`:
  - lê `study_plans.starts_on`;
  - roda `checkExtraStudy(input, startsOn, today())`;
  - chama `rpc("record_extra_study")` e depois `reloadGoal(<id devolvido>)`;
  - saem `weekNumberOf`, `day_position: 99`, os dois INSERTs e o DELETE de compensação. Sobra `EXTRA_TITLES` só se alguém o usar.
- Um helper local `studyWriteError(error)`: se `error.code === "23505"`, devolve `{ code: "conflict", message: STUDY_REPLAY_CONFLICT }`; senão, `translateDbError(error)`. Sempre por `failure()`, para o relato.
- `removeStudyEntry`: `.delete({ count: "exact" })`. Com `count === 0`, devolve `fail("forbidden", "Você não tem permissão para esta operação, ou seu acesso venceu.")`. O DELETE barrado pela policy filtra em silêncio, e hoje a tela fingiria sucesso.
- O cabeçalho do arquivo (`:6-12`) passa a dizer que o gatilho congela as três colunas.
- **N-07.** `ENTRY_COLUMNS` (`:54`) e `EntryRow` ganham `studied_on`, e `toEntry` preenche `studiedOn`. Em `entryDates` (`:174-184`), selecione `created_at,studied_on` e devolva `entryDay(...)` no lugar de `.slice(0, 10)`, que é UTC. O filtro `.gte("created_at", since)` fica: um extra é sempre de antes do lançamento.

**Os outros leitores do N-07**

- **`supabase/statistics.ts`:**
  - os selects de `:105`, `:135` e `:301` e o `EntryRow` (`:58-65`) ganham `studied_on`;
  - `:143`, `:357`, `:365` e `:376-380` passam a usar `entryDay` (o último repassa `studiedOn` para `questionsByDay`);
  - `:391-398` usa `entryDay(row)` na chave e no filtro dos 14 dias, e `entryDay(row).slice(0, 7)` no mês.
- **O filtro de ano** (`:110-111`, `:137-138`, `:304-305`) troca os dois `.gte/.lt("created_at")` por um helper local:

  ```ts
  /** O ano de um registro é o do DIA estudado. */
  function entryYear(year: number): string {
    const from = new Date(year, 0, 1).toISOString();
    const to = new Date(year + 1, 0, 1).toISOString();
    return `and(studied_on.gte.${year}-01-01,studied_on.lt.${year + 1}-01-01),` +
      `and(studied_on.is.null,created_at.gte."${from}",created_at.lt."${to}")`;
  }
  // … .or(entryYear(year))
  ```

  As aspas em volta do instante são a forma do PostgREST para valor com `.` e `:` dentro de árvore lógica. Confira contra o banco local antes de seguir.
- **`supabase/teacher-students.ts:133-137`** (última atividade) **não muda**: ver a escolha 9.

**`supabase/errors.ts`:** `case "P0002"` vira `{ code: "not_found", message: "Registro não encontrado." }`, com o caso em `errors.test.ts`.

**`supabase/idempotency.ts`:** o comentário passa a dizer que `once()` é a defesa contra clique duplo e que a de verdade é `goal_entries_request_uidx`.

**`fixtures.ts`**

- `recordStudy` chama `checkStudyEntry`. Sai a frase própria, e a mesma regra vale para as duas implementações.
- `recordExtraStudy` chama `checkExtraStudy(input, PLAN.startsOn, TODAY)`. O `dayPosition` passa a ser o máximo do dia + 1.
- `once` ganha um terceiro parâmetro opcional, `payload`, guardado junto do resultado. Mesma chave com outro payload devolve `fail("conflict", STUDY_REPLAY_CONFLICT)`. As duas operações passam `JSON.stringify` do input sem o `requestId`.
- **N-07.**
  - Todo registro da fixture ganha `studiedOn: null`, exceto o do extra, que recebe `input.date`.
  - `:653`, `:1107` e `:1167` trocam `entry.createdAt.slice(0, 10)` por `entryDay(entry)`.

**`fixtures.test.ts`.** Troque a data `"2026-09-16"` do teste de extra, que passa do `TODAY` fixo (2026-09-14), por `"2026-09-14"`. Acrescente os casos de **Testes**.

### 6. Tela

**`RecordStudyDialog.tsx`**

- `parseCount(String(data.get(name) ?? ""))` no lugar de `Number(x) || 0`.
- `step={1}` e `max={MAX_ENTRY_*}` nos três campos. `noValidate` fica.

**`Overview.tsx`**

- Monte `<RecordStudyDialog key={recording?.id ?? "closed"} …>`. Cada abertura gera um `requestId` novo, e a retentativa dentro do mesmo diálogo continua com o mesmo.
- O botão "Estudo extra" (`:311`) passa a usar `defaultExtraDate(week, interactive ? selectedDate : null, today)`.
- O inicializador do caminho do cronômetro (`:144-148`) também. O `?dia=` só vale se for data ISO dentro de `[week.startsOn, week.endsOn]`.
- Passe ao diálogo `minDate={plan.startsOn}` e `maxDate={today}`.

**`ExtraStudyDialog.tsx`**

- Use `parseCount` e `max`/`step` nos números.
- O campo Data ganha `min={minDate}`, `max={maxDate}` e `invalid={error?.field === "date"}`.
- **QA-27.** O inicializador só LÊ:

  ```ts
  useState(() => {
    const timer = readStudyTimer();
    return { minutes: recordedStudyTimerMinutes(timer, Date.now()), wasRunning: timer.running };
  })
  ```

  A escrita vai para um efeito de montagem, que não chama setState: `useEffect(() => { if (linked.wasRunning) pauseStudyTimer(); }, [linked.wasRunning])`.
- **D-16.** `cancel = () => { if (linked.wasRunning) resumeStudyTimer(); onClose(); }`, ligado ao botão Cancelar e ao `onClose` do `Dialog` (fundo e Esc). O sucesso continua chamando `clearRecordedStudyTimer()` e não retoma nada.

**`StudyTimer.tsx`:** `pauseStudyTimerForRecord` dá lugar a `pauseStudyTimer()` e `resumeStudyTimer()`, que gravam e disparam o evento, sobre as funções puras do passo 4.

### 7. E2E e catálogo

Ver **Testes**. No mesmo commit:

- a linha `F-META-08` sai de "Fluxos que ainda não existem" e entra na seção da semana;
- as descrições de F-META-03 e F-EXTRA-01 ganham o que passaram a cobrir.

### 8. Documentação

**`CLAUDE.md`**

- **"Toda RPC mutante…".** As RPCs passam a ser quatro: `record_goal_entry` e `record_extra_study` entram na forma 1, sustentadas por `goal_entries_request_uidx`, com o payload sendo as colunas do registro.
- **Tabela da fronteira.** A linha de `goal_entries`: o aluno escreve por essas RPCs; o INSERT direto ainda é aceito, até o 5c; apagar exige acesso vigente; `request_id`, `studied_on` e `created_at` ficam fora do grant.
- **Seção "A extensão foi removida".** A frase diz que `start_quiz_session`, `finish_quiz_session`, `record_quiz_session_time` e `void_quiz_session` "ficaram de pé". Está errada: elas nunca foram portadas, como diz `docs/arquitetura.md:128-133`. Corrija.

**`docs/de-para-schema.md`:** em `registros` → `goal_entries`, as linhas `—` | `request_id` | "nova (QA de 06/10/2026)" e `—` | `studied_on` | "nova: o dia escolhido no estudo extra; nulo = o dia local de `created_at`".

**`docs/bugs-encontrados.md`:** uma entrada por bug, na seção "Varredura de 06/10/2026". QA-04 fica marcado como parcial: a teoria vai no 5b.

### 9. Coordenação com o PR 6

O PR 6 (`pr-6-conta-acesso-e-datas.md`) anda em paralelo e mexe nas mesmas linhas:

- cria `lib/domain/dates.ts`, com `localDateOf`, e faz `localDate` (`schedule.ts:33-35`) e `today` delegarem para ela;
- troca `statistics.ts:391-398` de `created_at.slice(…)`, que é UTC, por `localDateOf(row.created_at)`.

**A regra que vale no fim, qualquer que seja a ordem:** o dia de um registro é `studied_on` quando houver, senão o dia LOCAL de `created_at`. E existe uma função só que o calcula, `entryDay`.

- **Se o 5a for mergeado depois:** no rebase, em `statistics.ts:391-398`, a versão do PR 6 (`localDateOf(row.created_at)`) dá lugar a `entryDay(row)`. `entryDay` passa a chamar `localDateOf(entry.createdAt)` no lugar de `localDate(new Date(…))`. Os rótulos com `formatDayMonth` do PR 6 ficam.
- **Se o PR 6 for mergeado depois:** as linhas `:391-398` já chegam com `entryDay(row)`, e o PR 6 não as reescreve: o dia local já vem por dentro de `entryDay`, pela delegação de `localDate`. O PR 6 só aplica `formatDayMonth` ao rótulo, e o `dates.test.ts` dele não precisa saber de `studied_on`.
- **Em qualquer ordem:** nenhum leitor de `goal_entries` pode voltar a chamar `localDateOf(created_at)` ou `created_at.slice` direto. Confira com `grep -rn "created_at.slice\|createdAt.slice\|localDate(new Date(.*createdAt\|localDateOf(.*created" apps/web/src`: o único resultado pode ser o corpo de `entryDay`.

## Testes

### Banco

`npm run db:test`. As suítes compartilham estado. Use `app_test.act_as`. Estado proibido aceito leva a `raise exception`. UPDATE e DELETE barrados pela RLS são conferidos contando `row_count`.

**`03_goals.sql`**

Primeiro, atualize o cabeçalho com as defesas novas e conserte o que quebra:

- **Teste 08** (`:100-105`). Bruno grava `spent_minutes = 45`, o que agora levanta exceção. Tire `spent_minutes` da linha: o teste afirma só `status` e `completed_at`.
- **Teste 10** continua esperando `%motor de baterias%`, e passa porque o bloco novo ignora meta com caderno.

Casos novos, numerados a partir de 15:

1. **Gatilho (QA-28).** Bruno altera `spent_minutes`, `questions_answered` e `correct_answers` em `a5…02` (teoria do professor) e em `a5…03` (o extra dele): exceção `%resultado da meta%`.
2. **Acesso vencido no UPDATE (QA-07).** Fabi (vencida) conclui `a5…05`, e depois pula a mesma meta: `insufficient_privilege` nos dois.
3. **Acesso vencido no DELETE (N-05).**
   - Como dono (`reset role` e `act_as_owner`), crie um registro de Fabi em `a5…05` e uma meta `extra` dela.
   - Como Fabi, apague os dois: `row_count = 0` e as linhas continuam lá.
4. **INSERT direto, compatibilidade com o bundle no ar.** Bruno insere em `goal_entries` direto e é aceito. Comentário: "sai no 5c".
5. **`record_goal_entry`**, com Bruno em `a5…03`, que está `pending`:
   - a primeira chamada devolve um id, deixa uma linha com aquele `request_id` e põe a meta em `in_progress`;
   - a mesma chamada de novo devolve o mesmo id e continua com 1 linha;
   - mesma chave com `p_minutes` diferente: `unique_violation`;
   - mesma chave com `p_goal_id = a5…02`: `unique_violation`;
   - Carla usando a chave de Bruno na meta dela: `unique_violation`, sem vazar nada;
   - Bruno na meta de bateria `a5…01`: `raise_exception` `%bateria%`;
   - Bruno na meta de Carla `a5…04`: `no_data_found`;
   - Fabi em `a5…05`: `insufficient_privilege`;
   - Bruno com 241 minutos: `check_violation`.
6. **`record_extra_study`**, com Bruno no plano `a2…01`, que começa em `current_date`:
   - em `current_date`, nasce `extra`, `completed`, `week_number = 1` e `weekday = isodow(current_date)`, e o registro tem `studied_on = current_date` (N-07). O teste do `record_goal_entry` do item 5 confere o contrário: `studied_on` nulo;
   - **N-02:** um segundo extra no mesmo dia, com outra chave, recebe `day_position` = o do primeiro + 1;
   - repetir a primeira chamada devolve a mesma meta, sem meta nova;
   - mesma chave com outro `p_date` ou outros minutos: `unique_violation`;
   - `starts_on − 1` e `current_date + 2`: `check_violation`;
   - `p_kind = 'outro'`: `check_violation`;
   - Fabi: `insufficient_privilege`;
   - Bruno no plano de Carla: `no_data_found`;
   - um plano `paused` de Bruno, criado como dono: `raise_exception` `%nao esta ativo%`.

**`07_schema.sql`**

- Teste 08: acrescente `record_goal_entry` e `record_extra_study` ao array (`:179-181`) e ajuste o texto do `notice`.
- Bloco novo das CHECKs. Como dono, insira em `goal_entries` com `minutes` −1 e 241, `questions` 501, `correct_answers` maior que `questions` e tudo zero. Cada um precisa dar `check_violation`; senão, `raise exception 'FALHOU…'`.
- No mesmo bloco, `goal_entries_studied_on_check`: como dono, `studied_on = current_date + 3` com `created_at` padrão dá `check_violation`.
- O contador do de-para não muda: nenhuma tabela, enum, FK ou view nova.

**`01_grants.sql`:** Bruno insere em `goal_entries` com `request_id`, depois com `studied_on` e depois com `created_at`. Os três dão `insufficient_privilege` (privilégio de coluna levanta sempre).

**`12_student_question_comparison.sql` (N-07, o ano pelo dia estudado).**

- Como dono, no FIM da suíte, insira para o aluno `fa…02` um registro com `created_at = '2027-01-01 01:00+00'`, `studied_on = '2026-12-31'` e 10 questões.
- Como o aluno, `student_question_comparison(2026)` conta as 10 questões a mais e `student_question_comparison(2027)` não as vê.
- As suítes compartilham estado, por isso o caso vai no fim e confere a DIFERENÇA, não o total.
- `13_…` e `14_…` ganham o mesmo caso, curto, contra as funções delas.

### Unitários

Rodam no runner nativo do Node 24, por `npm run check`.

- **`validation.test.ts`:**
  - `checkStudyEntry` com (30,10,8) aceito, (−30,…), (241,…), (1.5,…) e (`NaN`,…) em `minutes`, (0,501,0) em `questions`, (10,5,−1) e (10,5,6) em `correctAnswers`, (0,0,0) com a frase do vazio, e (0,10,5) aceito (é a teoria);
  - `checkExtraStudyDate` com início e hoje aceitos, início − 1, hoje + 1, `""` e `"2026-02-30"` recusados.
- **`week.test.ts`:**
  - `defaultExtraDate`: semana corrente sem dia dá hoje; dia anterior escolhido dá o dia; dia futuro escolhido dá hoje; semana passada dá `startsOn`; semana futura dá hoje;
  - `parseCount` com `""`, `"45"`, `" 12 "`, `"-30"`, `"1.5"` e `"1e3"`.
- **`study-timer.test.ts`:** pausar e retomar, cada um duas vezes, dá o mesmo estado; o tempo de quem pausou não anda.
- **`fixtures.test.ts`:**
  - limites com o campo marcado;
  - data fora do intervalo com `field: "date"`;
  - dois extras no mesmo dia em posições diferentes;
  - mesma chave com outro payload dá `conflict`;
  - **N-07:** um extra em `"2026-09-10"` (depois de `PLAN.startsOn` e antes de `TODAY`) faz `loadStudyDays(2026)` incluir `"2026-09-10"`.
- **`schedule.test.ts`:** `entryDay` devolve `studiedOn` quando há, e o mesmo que `localDate(new Date(createdAt))` quando é nulo. `dailyQuestionPerformance` põe o registro com `studiedOn` de ontem no dia de ontem, e não no de hoje.
- **`question-performance.test.ts`:** `questionsByDay` agrupa pelo `studiedOn`.
- **`errors.test.ts`:** `P0002` dá `not_found`.

### E2E

`apps/e2e/tests/student-week.spec.ts`. Cada `describe` começa pelo id e cita o `QA-NN`.

**F-META-03**

- **QA-04, a resposta perdida grava um registro só.**
  - Arme a rota antes de clicar:

    ```ts
    await studentPage.route("**/rest/v1/rpc/record_goal_entry", async (r) => {
      await r.fetch();
      await r.abort();
    }, { times: 1 });
    ```

  - Use `record()` com 25 min e espere o alerta de erro no diálogo.
  - Clique "Registrar" de novo e espere o diálogo fechar.
  - `count(goal_entries where goal_id)` é 1, e a linha mostra 25min.
- **QA-10, número inválido é recusado e nada é gravado.** Para `-30`, `241` e `1.5` em minutos, o alerta tem "minutos inteiros, de 0 a 240" e `maybeOne` não acha registro nenhum. Espere o diálogo aparecer antes de cada tentativa.

**F-META-08 (novo), QA-07**

- Carregue a semana e depois rode `setAccess(scenario.student.id, "suspended")`.
- Clique `goal-check` numa meta de teoria. Espere `alert(content(page), "error")` com "acesso venceu", e o banco continua com `status = 'pending'`.
- Abra Registrar, grave 30 min e confira que o diálogo mostra a mesma recusa e que não há registro.

**F-EXTRA-01**

- **N-02, dois extras no mesmo dia.**
  - Lance dois extras seguidos, com matérias diferentes, aceitando a data sugerida.
  - O banco tem 2 metas `extra` no plano, com `day_position` distintos.
  - As duas linhas aparecem na tela.
- **QA-11, data fora do intervalo.**
  - Leia `starts_on` no banco e calcule hoje em São Paulo com `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`; é o `timezoneId` do projeto.
  - Preencha `starts_on − 1` e depois hoje + 1. As duas dão o alerta com "entre o início do planejamento e hoje", e nenhuma meta extra é criada.
- **QA-14, com "Semana inteira" a sugestão é hoje.**
  - `query("update public.study_plans set starts_on = $2::date - 3 where id = $1", [planId, hojeSP])`. Assim hoje cai no meio da semana 1, e o teste distingue "hoje" de "primeiro dia" em qualquer dia da semana.
  - Abra `STUDENT_WEEK_ALL_DAYS` e clique "Estudo extra": `field(page, "date")` tem o valor `hojeSP`.
  - **Sem `page.clock`.** Adiantar o relógio do navegador além do relógio real faz o supabase-js tratar o token como vencido; não verificado, mas evitável.
- **QA-27 e D-16, o cronômetro.** Os dois testes pedem a fixture `consoleErrors`.
  - Antes do `goto`, um `addInitScript` grava em `fronteira.study-timer.v1` um cronômetro `running: true` iniciado há 12 minutos, só se a chave estiver vazia e dentro de `try/catch`.
  - **(a)** Em `/aluno?dia=todos`, clique "Estudo extra":
    - o diálogo mostra "Cronômetro pausado";
    - a barra mostra o botão "Iniciar cronômetro";
    - clique Cancelar: a barra volta a mostrar "Pausar cronômetro";
    - `consoleErrors` está vazio.
  - **(b)** `goto("/aluno?estudoExtra=cronometro")`: o diálogo abre com a data igual a `hojeSP` e `consoleErrors` está vazio.
- **QA-04 no extra.** Repita a técnica da resposta perdida em `**/rest/v1/rpc/record_extra_study`: no fim existe uma meta extra só, com um registro.
- **N-07, o extra lançado para ontem conta ontem, na semana.**
  - Mova `starts_on` para `hojeSP − 3`, como no QA-14.
  - Lance um extra com data `ontemSP`: 20 min, 10 questões, 8 acertos.
  - O `[data-testid="day-group"][data-date="<ontemSP>"]` mostra `day-question-performance` com "10 questões". O cartão de hoje não mostra isso.
  - No banco, o registro tem `studied_on::text = ontemSP`.

**F-EST-01 (`apps/e2e/tests/student-analysis.spec.ts`)**

- **N-07, o extra de ontem cai em ontem na série por dia.**
  - Mova `starts_on` como acima.
  - A pré-condição vai pela RPC real, com `asUser(scenario.student.id, (c) => c.query("select public.record_extra_study($1, $2, 'anki', 'Português', $3::date, 40, 0, 0)", [randomUUID(), planId, ontemSP]))`.
  - Insira mais um registro de hoje, como os testes vizinhos fazem, para a série ter dois pontos.
  - Em `/aluno/estatisticas`, abra a série. O `chart-table` de `chart-minutes-day` tem a linha `dd/mm` de ontem com 40 min.

Depois de `db:test`, rode `npm run db:reset` antes de `npm run e2e`.

## Critério de pronto

- [ ] Spec 12, spec 19, a nota da spec 25 e a reserva de `F-META-08` estão no primeiro commit, sozinhas.
- [ ] A migration é arquivo novo, com timestamp posterior às do PR 1 e do PR 3, e não toca nenhuma migration aplicada.
- [ ] As quatro funções novas têm `set search_path = ''`, `revoke … from public, anon, authenticated` e grant nominal só nas duas de `public`.
- [ ] `schema.gen.ts` foi regenerado com `npm run db:types` e commitado.
- [ ] `grep -n 'from("goal_entries").insert\|day_position: 99\|from("goals").insert' apps/web/src/lib/api/supabase/week.ts` não devolve nada.
- [ ] `checkStudyEntry` e `checkExtraStudy` são chamadas pelas duas implementações, e `grep -n "Acertos não podem" apps/web/src` não devolve nada.
- [ ] `npm run db:test` está verde, com os casos novos de 03, 07, 01, 12, 13 e 14.
- [ ] Nenhum leitor de `goal_entries` calcula o dia sem `entryDay`: o `grep` do passo 9 só acha o corpo dela. As três funções de comparação usam `coalesce(studied_on, …)`.
- [ ] Um extra lançado para ontem aparece ontem na semana (F-EXTRA-01) e na série por dia (F-EST-01).
- [ ] `npm run check` está verde.
- [ ] Depois de `npm run db:reset`, `npm run e2e` está verde, com F-META-03, F-META-08 e F-EXTRA-01 estendidos.
- [ ] O caminho do cronômetro abre sem "Cannot update a component" no console.
- [ ] `CLAUDE.md`, `de-para-schema.md`, `bugs-encontrados.md` e `fluxos-e2e.md` estão atualizados.
- [ ] O que ficou sem verificar está escrito na descrição do PR.

## Armadilhas

- **O teste 08 de `03_goals.sql` quebra de propósito.** Ele grava `spent_minutes` como aluno. Corrija o teste, não o gatilho.
- **Os gatilhos `BEFORE UPDATE` disparam em ordem alfabética.** `protect_goal_planning_fields` vem antes de `protect_goal_quiz_result`. Sem o `coalesce(notebook_block_id…) is null`, o teste 10 recebe a mensagem errada e falha.
- **CTE que modifica dado não enxerga o próprio DELETE.** Um `not exists` no mesmo comando ainda vê os registros apagados. Por isso a limpeza é um `do $$` em passos.
- **O `begin … exception` do plpgsql só desfaz o que está dentro do bloco.** Em `record_extra_study`, as duas inserções ficam dentro, senão a corrida deixa uma meta órfã.
- **Busque o `request_id` DEPOIS da trava.** Antes dela, a segunda chamada com a mesma chave não vê a primeira e cai no caminho do `unique_violation`.
- **`exactOptionalPropertyTypes`.** O gerador de tipos declara `p_note?: string`, e passar `undefined` não compila: use espalhamento.
- **UPDATE e DELETE reagem diferente à RLS.** O UPDATE barrado pelo `WITH CHECK` levanta `42501`. O DELETE barrado pelo `USING` afeta 0 linhas, sem erro, e por isso o adaptador conta. Os testes de banco também contam.
- **Não confie no `CLAUDE.md` sobre as RPCs de bateria.** Elas não existem. Nada além do bundle e das duas RPCs novas escreve `goal_entries` ou as colunas de resultado de `goals`.
- **Fuso no e2e.** O navegador está em `America/Sao_Paulo`; o `current_date` do banco é UTC. O plano do cenário começa na segunda da semana UTC, e entre 21h e 0h de domingo em Brasília hoje fica antes do início. Calcule "hoje" sempre no fuso do navegador.
- **O 23505 tem outra fonte, rara.** Uma corrida do professor gerando a semana no mesmo slot também chega como 23505 e mostra a frase de "outros valores". É raro, e está aceito.
- **Input `type=number` devolve `""` para texto inválido.** Vazio vira 0, e é isso que `parseCount` deve fazer.
- **A heurística do backfill é de propósito estreita.** Título fora dos cinco, meta não concluída ou registro gravado mais de 60 s depois da meta ficam com `studied_on` nulo. É o comportamento de antes, sem prejuízo. Não a alargue: a meta extra do professor também é `extra`.
- **`create or replace` das três funções de comparação.** Copie o corpo INTEIRO da migration de origem: a função é substituída por inteiro, e um trecho esquecido some sem erro.
- **`.or()` do PostgREST com timestamp:** valor com `.` ou `:` dentro de árvore lógica vai entre aspas duplas. Sem as aspas, a consulta falha ou filtra errado. Confira com uma chamada contra o banco local.

## Fora do escopo

- **Concluir, reabrir e pular por RPC** (spec 12, R-CONC-01): só a policy muda.
- **A teoria** (`recordInitialQuestions` e `recordReviewQuestions`) é o 5b. As CHECKs novas já valem para o INSERT dela: 600 questões dão `23514`, que vira `validation` pelo PR 4. Ela continua somando `initial_questions_done` antes de inserir o registro, e esse defeito também é do 5b.
- **Tirar os ramos do aluno das policies de INSERT** é o 5c, depois de staging rodar o bundle novo. Isso vale para `goal_entries_insert` e também para `goals_insert`: o bundle novo não insere mais meta como aluno. Enquanto o ramo de `goals_insert` existir, o aluno ainda consegue INSERIR uma meta `extra` com as três colunas de resultado preenchidas, porque o gatilho é só `BEFORE UPDATE`.
- **O professor escrever as colunas de resultado:** o gatilho só cuida do aluno.
- **Registro retroativo numa meta comum** ("estudei ontem, registro hoje"). `record_goal_entry` grava `studied_on` nulo, pela escolha 8. Se o produto quiser isso um dia, a RPC ganha `p_studied_on` com o mesmo piso e o mesmo teto do extra.
- **"Última atividade" do professor pelo dia estudado:** continua pelo instante do lançamento (escolha 9).
- **A fixture não modela acesso suspenso.**
- **O enum de tipo de extra e os sete tipos** da spec 19.
