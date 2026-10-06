# PR 3 — Um planejamento ativo por aluno

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-03 e QA-12 (os `BUG-03` e `BUG-12` de [`../relatorio-qa-2026-10-06.md`](../relatorio-qa-2026-10-06.md)) |
| Branch | `fix/qa-3-um-planejamento-ativo` |
| Depende de | PR 1 (a fila de migrations: a branch nasce da `main` depois do merge dele) |
| Migration | sim |

## O defeito

**O índice que três textos afirmam não existe.** O `CLAUDE.md` diz "Um
planejamento ativo por aluno é índice único parcial". O cabeçalho de
`apps/web/src/lib/api/supabase/teacher-plans.ts:4-7` diz o mesmo, e as specs
03 (R-PLAN-01) e 14 (R-GPLAN-04) também. Mas `study_plans` só tem
`study_plans_name_per_student_uidx` (`supabase/migrations/20260914150000_initial_schema.sql:901`).
Nenhuma migration posterior cria o índice. Em `pg_indexes` local, nenhum
índice de `study_plans` olha `status`.

A RPC que as specs citam, `activate_study_plan`, também não existe. Ela saiu
com o schema de 14/09 (commit `7c597cc`), e o GAP-02 de `bugs-encontrados.md`
ainda a dá como pronta.

Hoje `activatePlan` (`teacher-plans.ts:142-179`) faz duas requisições: arquiva
os ativos do aluno e depois ativa o novo. Daí:

- **QA-03.** Duas abas intercalam as quatro escritas, e o aluno termina com
  dois ativos. Pela API, `PATCH /rest/v1/study_plans?id=eq.<outro>`
  `{"status":"active"}` devolve 200.
- **QA-12.** Se a rede cai entre as duas requisições, o anterior fica
  arquivado e o novo não fica ativo. O aluno fica sem planejamento.

O banco local tem hoje **6 alunos com dois ativos**, criados pelo QA:
`select student_id, count(*) from public.study_plans where status = 'active' group by 1 having count(*) > 1`.

## Decisões aplicadas

- **D-03.** Na limpeza da migration, o ativo que sobra é o de `updated_at`
  mais recente, e os outros viram `paused`, que é reversível. A limpeza não
  sabe qual dos dois o professor quis, e por isso não arquiva.
- **Ativar ARQUIVA o anterior, e não pausa. Decidido aqui.** É o que diz a
  spec 14 (R-GPLAN-02, CA-03 e a máquina de estados, `active → archived`
  "efeito de ativar outro"). Dizem o mesmo a spec 03 (R-PLAN-05), o contrato
  (`contract.ts:1045`, "ativar um arquiva o anterior"), o subtítulo da tela
  (`routes/teacher/Plans.tsx`, "Um ativo por aluno — ativar um arquiva o
  anterior") e o F-GPLAN-01, que confere `archived`. A troca é gesto do
  professor, e por isso é diferente da limpeza. `paused` continua sendo "ainda
  não ativado", que é como `createPlan` cria (`teacher-plans.ts:92-109`).
- **A RPC é naturalmente idempotente, e quem sustenta isso é o índice
  `study_plans_one_active_per_student_uidx` mais a trava.** Ela não recebe
  `request_id`. O único parâmetro é a identidade do alvo, e "este plano está
  ativo" é estado, não incremento: ativar de novo o que já está ativo devolve a
  linha sem escrever nada. O índice garante que o estado final nunca tem dois
  ativos. A trava `for no key update` sobre os planejamentos do aluno serializa duas
  chamadas, de modo que a segunda enxerga o resultado da primeira em vez de
  bater no índice.
- **Nome do parâmetro: `p_study_plan_id`, e não `p_plan_id`.** É o nome que a
  spec 14 já usa (R-GPLAN-03), e o schema chama a referência de
  `study_plan_id` em toda tabela.
- **O default de `status` continua `'active'`.** Mudá-lo para `paused`
  quebraria as suítes 12, 13 e 14, que inserem planejamento sem `status` e
  dependem de ele nascer ativo (as funções delas filtram
  `sp.status = 'active'`). Com o índice, um INSERT sem `status` para aluno que
  já tem ativo bate em `23505`. Isso é o índice funcionando.

## Passo a passo

1. **Spec e catálogo** (commit próprio):
   - `docs/specs/14-gestao-do-planejamento.md`:
     - abaixo do cabeçalho, a nota "**Atualizada em 06/10/2026 (QA-03,
       QA-12):** o índice e a RPC citados aqui não existiam no schema de
       14/09; voltaram na migration `<timestamp>_one_active_study_plan`. Onde
       esta spec diz `draft`, leia `paused`, que é como o planejamento nasce.";
     - reescreva no lugar, sem renumerar, R-GPLAN-01 (nasce `paused`),
       R-GPLAN-02 (a RPC arquiva o anterior numa transação, travando os
       planejamentos do aluno), R-GPLAN-03 (naturalmente idempotente: índice
       mais trava, sem `request_id`) e R-GPLAN-04 (o índice novo,
       `(student_id) where status = 'active'`, sem `deleted_at`, que não existe
       mais);
     - critérios novos: **CA-08**, "falha de rede durante a ativação não deixa
       o aluno sem planejamento ativo", e **CA-09**, "duas ativações
       simultâneas para o mesmo aluno terminam com um ativo, sem erro". Os dois
       são cobertos por F-GPLAN-01;
     - "Superfície": RPC `activate_study_plan` e migration nova. O parágrafo
       "Por que não há teste em `supabase/tests/`" sai: agora há (`02_rls`,
       `07_schema`).
   - `docs/specs/03-planejamento-e-metas.md`:
     - R-PLAN-01 e R-PLAN-05 com o nome novo do índice. "Zero ativos" é estado
       legítimo (R-GPLAN-05); o que é inexprimível é "dois ativos" e "zero no
       meio da troca";
     - CA-09 aponta para `07_schema.sql`.
   - `docs/fluxos-e2e.md`, F-GPLAN-01: acrescente "; ativar é uma transação:
     rede caindo não deixa o aluno sem planejamento, e duas ativações
     simultâneas terminam com um ativo — QA-03, QA-12". Não há id novo.

2. **Migration**: `supabase migration new one_active_study_plan`. O timestamp
   precisa sair depois do da migration do PR 1. Esboço:

   ```sql
   -- =============================================================================
   -- Um planejamento ativo por aluno (QA-03, QA-12)
   -- =============================================================================
   -- O índice que o CLAUDE.md, as specs 03 e 14 e `teacher-plans.ts` davam como
   -- existente, e a RPC que troca o ativo numa transação.
   --
   -- O QUE ESTA MIGRATION FAZ COM OS DADOS: por aluno com mais de um planejamento
   -- `active`, fica ativo o de `updated_at` mais recente (desempate por
   -- `created_at` e `id`); os outros viram `paused` (D-03 do plano do QA —
   -- reversível, porque a limpeza não sabe qual o professor quis). No banco local
   -- de 06/10/2026 eram 6 alunos. A contagem sai no log do deploy.
   -- =============================================================================

   do $$
   declare v_paused integer;
   begin
     with ranked as (
       select id,
              row_number() over (
                partition by student_id
                order by updated_at desc, created_at desc, id desc
              ) as position
         from public.study_plans
        where status = 'active'
     )
     update public.study_plans p
        set status = 'paused'
       from ranked r
      where r.id = p.id
        and r.position > 1;
     get diagnostics v_paused = row_count;
     raise notice 'study_plans: % planejamento(s) ativo(s) a mais passaram a paused', v_paused;
   end $$;

   -- Nasce validado: a limpeza acima deixou no máximo um ativo por aluno.
   create unique index study_plans_one_active_per_student_uidx
     on public.study_plans (student_id)
     where status = 'active';

   -- Ativa um planejamento e arquiva o ativo anterior do mesmo aluno, numa
   -- transação.
   --
   -- NATURALMENTE IDEMPOTENTE, sem `request_id`: o parâmetro é a identidade do
   -- alvo e o efeito é um estado. Ativar o que já está ativo devolve a linha sem
   -- escrever. Quem sustenta: `study_plans_one_active_per_student_uidx` (o
   -- estado final nunca tem dois ativos) e a trava abaixo (a segunda chamada
   -- enxerga a primeira em vez de bater no índice).
   create or replace function public.activate_study_plan(p_study_plan_id uuid)
   returns public.study_plans
   language plpgsql security definer set search_path = '' as $$
   declare
     v_uid  uuid := (select auth.uid());
     v_plan public.study_plans;
   begin
     if v_uid is null then
       raise exception 'usuario nao autenticado' using errcode = '42501';
     end if;

     select * into v_plan from public.study_plans p where p.id = p_study_plan_id;
     -- Inexistente e alheio dão o MESMO erro: distinguir diria a quem pergunta
     -- que o id existe. `is_teacher_of` confere o vínculo pelo ALUNO, como o
     -- WITH CHECK de `study_plans_update`.
     if not found
        or v_plan.teacher_id <> v_uid
        or not public.is_teacher()
        or not public.is_teacher_of(v_plan.student_id) then
       raise exception 'planejamento nao encontrado, ou nao e seu' using errcode = '42501';
     end if;

     -- SERIALIZA as ativações do MESMO ALUNO: trava todos os planejamentos dele,
     -- sempre na ordem do id (duas chamadas nunca se esperam em ciclo). Travar só
     -- o alvo, como a versão de agosto fazia, não basta: duas abas ativando
     -- planos DIFERENTES não disputam a mesma linha, e a segunda bate no índice.
     --
     -- `no key update`, e não `update`: `status` não é chave, e `for update`
     -- bloquearia o `for key share` que a FK pega quando o aluno lança estudo
     -- extra. É o modo de `generate_week`.
     perform 1
        from public.study_plans p
       where p.student_id = v_plan.student_id
       order by p.id
         for no key update;

     -- Releitura DEPOIS da trava: quem esperou decide pelo que a outra
     -- transação gravou, e não pelo que leu antes de esperar.
     select * into v_plan from public.study_plans p where p.id = p_study_plan_id;
     if v_plan.status = 'active' then
       return v_plan;
     end if;

     update public.study_plans p
        set status = 'archived'
      where p.student_id = v_plan.student_id
        and p.status = 'active'
        and p.id <> p_study_plan_id;

     update public.study_plans p
        set status = 'active'
      where p.id = p_study_plan_id
     returning * into v_plan;

     return v_plan;
   end;
   $$;

   comment on function public.activate_study_plan(uuid) is
     'Ativa um planejamento e arquiva o ativo anterior do mesmo aluno, numa transação. Naturalmente idempotente: quem sustenta é study_plans_one_active_per_student_uidx, com a trava dos planejamentos do aluno.';

   revoke all on function public.activate_study_plan(uuid) from public, anon, authenticated;
   grant execute on function public.activate_study_plan(uuid) to authenticated;
   ```

   Depois, rode `npm run db:types` e inclua `packages/database/src/schema.gen.ts`
   no commit.

3. **Adaptador**, em `apps/web/src/lib/api/supabase/teacher-plans.ts`:
   - `activatePlan` (`:142-179`) vira uma chamada. Mantenha o `once`, que só
     junta o clique duplo; a garantia é da RPC.

     ```ts
     const { data, error } = await supabase.rpc("activate_study_plan", { p_study_plan_id: planId });
     if (error) {
       // As duas recusas desta chamada têm origem única. `42501` é a RPC
       // dizendo "não existe ou não é seu". `23505` só vem do índice de um
       // ativo por aluno: a única coluna que ela escreve é `status`.
       if (error.code === "42501") return fail("not_found", "Planejamento não encontrado, ou não é seu.");
       if (error.code === "23505") {
         return fail("conflict", "Este aluno já tem outro planejamento ativo. Atualize a página e tente de novo.");
       }
       return failure(translateDbError(error));
     }
     return done(toPlan(data as PlanRow));
     ```

   - O `fail("conflict", "Este planejamento já está ativo.")` sai. Ativar o que
     já está ativo passa a ser sucesso, porque é a retentativa depois de
     resposta perdida.
   - Reescreva o cabeçalho (`:1-8`): o índice existe (cite a migration), ativar
     é a RPC, que arquiva o anterior numa transação, e a idempotência é
     natural. A frase "arquiva o anterior ANTES de ativar … a ordem inversa bate
     no índice" sai, porque descrevia o caminho de duas requisições.

4. **Fixture**, em `apps/web/src/lib/api/fixtures.ts`. `PLAN` é `const`
   declarada depois de `seedState()`, que roda na inicialização do módulo: o
   plano semeado vem de uma função, `seedPlan()` (zona morta, como em
   `seedStudents`). Hoje
   `listPlans`, `activatePlan` e `archivePlan` devolvem o `PLAN` constante, e
   `createPlan` devolve `status: "active"`, o contrário do Supabase. Para a
   fixture mutar e recusar:
   - `State` ganha `plans: StudyPlanSummary[]`, semeado com `[PLAN]` em
     `seedState()`;
   - `listPlans(studentId?)` lê de `state.plans`;
   - `createPlan` insere com `status: "paused"`;
   - `activatePlan` recusa id desconhecido com a mesma frase do adaptador
     ("Planejamento não encontrado, ou não é seu.") e devolve sucesso sem
     mudar nada se o plano já estiver ativo. Nos outros casos, arquiva o ativo
     do mesmo `studentId` e ativa o alvo;
   - `archivePlan` muta `state.plans`.

5. **Tela**: nada muda em `routes/teacher/Plans.tsx`. O botão já gera
   `newRequestId()` por clique (`:252`) e mostra `error.message`.

6. **Testes** (ver a seção abaixo).

7. **Docs**:
   - `docs/de-para-schema.md:992-998`: depois da tabela de "duas ausências",
     uma frase registrando a terceira, `study_plans_one_active_per_student_uidx`,
     reposta em 06/10/2026 (QA-03);
   - `CLAUDE.md`. A frase "Um planejamento ativo por aluno é índice único
     parcial" passa a ser verdade, e não precisa de edição. A lista "Toda RPC
     mutante precisa ser segura a retentativa" ganha `activate_study_plan` na
     forma "naturalmente idempotente", com o índice e a trava (a regra pede
     "diga qual índice ou constraint sustenta isso");
   - `docs/bugs-encontrados.md`:
     - entradas QA-03 e QA-12 na seção "Varredura de 06/10/2026" (crie-a se
       nenhum PR anterior a criou);
     - no GAP-02, a nota de que `activate_study_plan` foi recriada e agora é
       chamada pela tela.

## Testes

**`supabase/tests/07_schema.sql`** (invariantes):
- **Índice**: confere que `study_plans_one_active_per_student_uidx` existe e
  é único. Depois, como dono, insere um segundo planejamento `active` para o
  Bruno (`2222…`, que já tem `a2000000-…-0001`):
  `raise exception 'FALHOU: …'` se o banco aceitar, `when unique_violation`
  para o OK. É o mesmo molde do teste 11 (`class_students_one_per_student_uidx`).
- **A RPC**, num bloco `begin; … rollback;` (como as suítes 12 a 14), para não
  arquivar o plano do Bruno de que as suítes seguintes dependem:
  - `select app_test.act_as('1111…')` (Ana), e insere um segundo plano do
    Bruno com `status = 'paused'`;
  - `perform public.activate_study_plan(<novo>)`. Confere que o novo ficou
    `active`, que `a2…01` ficou `archived` e que o Bruno tem exatamente um
    ativo;
  - chama de novo com o mesmo id. Não levanta, e o estado continua igual: é
    a idempotência natural;
  - `rollback;` e `select app_test.act_as_owner();`.
- **Grant**: acrescente `'activate_study_plan'` ao array do teste 08
  (`:179-181`) e ajuste a contagem na frase do `raise notice`. O PR 1 terá
  acrescentado as dele.

**`supabase/tests/02_rls.sql`** (isolamento):
- na seção do Davi (`4444…`): `perform public.activate_study_plan('a2000000-0000-4000-8000-000000000001')`
  → `exception when insufficient_privilege` para o OK, `raise exception` se
  passar. Professor alheio não ativa;
- na seção do Bruno (aluno), a mesma chamada sobre o plano dele → `42501`.
  Aluno não ativa.

**e2e, `apps/e2e/tests/teacher.spec.ts`, dentro de `describe("F-GPLAN-01 …")`**.
Cada teste cria o segundo plano por SQL: `insert into public.study_plans
(id, student_id, teacher_id, name, status) values (…, 'paused')`, com nome
único por cenário, como o teste existente faz.

1. **"ativar com a rede caindo não deixa o aluno sem planejamento — QA-12"**:
   - `teacherPage.route("**/rest/v1/rpc/activate_study_plan", (r) => r.abort())`
     e clique em `plan-activate` do plano novo;
   - `alert(teacherPage, "error")` visível. Afirme a frase "Sem conexão…" só se
     o PR 4 já estiver na `main`; senão, só que há erro;
   - no banco, o plano do cenário continua `active`, o novo continua `paused`,
     e há um ativo;
   - `unroute`, clique de novo. A linha vira `data-status="active"`, e o
     anterior fica `archived`.
2. **"resposta perdida: o servidor ativou, e a retentativa confirma sem erro"**.
   Use a técnica do README (`await route.fetch(); await route.abort();`, com
   `{ times: 1 }`):
   - depois do erro na tela, o banco já mostra o novo `active`;
   - clique de novo (requestId novo). Sem alerta de erro, a linha fica
     `active`, e há um ativo.
3. **"duas ativações simultâneas terminam com um ativo — QA-03"**, pelo banco,
   porque duas abas não garantem a intercalação:

   ```ts
   let release!: () => void;
   const firstHolds = new Promise<void>((resolve) => (release = resolve));
   const first = asUser(scenario.teacher.id, async (c) => {
     await c.query("select public.activate_study_plan($1)", [planA]);
     release();                          // A já está ativo, e a trava continua
     await c.query("select pg_sleep(0.3)");
   });
   const second = firstHolds.then(() =>
     asUser(scenario.teacher.id, (c) => c.query("select public.activate_study_plan($1)", [planB])),
   );
   await Promise.all([first, second]);   // nenhuma das duas lança
   ```

   Depois: B `active`, A e o plano do cenário `archived`, e exatamente um
   ativo. Sem a trava a segunda chamada levanta `23505`. Para conferir que o
   teste morde, rode-o uma vez com o `perform … for update` comentado; ele
   precisa falhar.

## Critério de pronto

- [ ] `npm run db:test` verde, e depois `npm run db:reset` antes do e2e.
- [ ] `npm run db:types` rodado, e `schema.gen.ts` no commit.
- [ ] `npm run check` verde (inclui `fixtures.test.ts`, que ganha casos de
      plano: id desconhecido recusado com a frase; ativar arquiva o outro ativo
      do mesmo aluno; ativar duas vezes é sucesso com um ativo).
- [ ] F-GPLAN-01 inteiro verde, inclusive o teste antigo, que confere
      `archived`.
- [ ] Contra o banco local antes do reset, a migration pausa os 6 duplicados.
      `supabase migration up` aplica só o arquivo novo: confira o
      `raise notice` e que a consulta de "O defeito" volta vazia.
- [ ] Cabeçalho de `teacher-plans.ts`, specs 03 e 14, `fluxos-e2e.md`,
      `de-para-schema.md`, `CLAUDE.md` e `bugs-encontrados.md` no PR.

## Armadilhas

- **A trava é `for no key update`, e não `for update`.** O `status` não é
  chave, e `for update` conflita com o `for key share` que a FK de `goals` pega
  quando o aluno lança estudo extra: o aluno esperaria a ativação do
  professor. `generate_week` usa o mesmo modo, na linha do plano, e por isso
  as duas não formam ciclo (conferido ao implementar).
- **A função tem de ser `volatile`** (o padrão; não declare `stable`). Em
  READ COMMITTED, cada comando de uma função volátil tira snapshot novo. É isso
  que faz o `update` depois da trava enxergar o ativo que a outra transação
  acabou de gravar.
- **`on conflict (id) do nothing` não arbitra o índice novo.** O seed e
  `scripts/turma-de-teste.sql` inserem `active` com `on conflict (id)`. Isso
  funciona porque são alunos novos. Num aluno que já tenha outro ativo, o
  INSERT levanta `23505` em vez de ser ignorado.
- **`02_rls.sql`, teste 12** (`:181-188`), insere sem `status` para o Bruno,
  que já tem ativo. Continua levantando `42501`, e não `23505`, porque o
  `WITH CHECK` da RLS roda antes da checagem de índice no INSERT. Não mexa no
  teste.
- **Não revogue `status` do `grant update`.** Arquivar é escrita direta
  (R-GPLAN-05), e o bundle no ar ativa por dois PATCHes. Com o índice, esses
  PATCHes continuam funcionando (arquivar primeiro, ativar depois), e a corrida
  entre abas deixa de produzir dois ativos. Ela passa a produzir um `23505`,
  que o bundle antigo traduz como "Este registro já existe.". É a
  compatibilidade da regra comum.
- **Outra RPC que trave mais de um planejamento do mesmo aluno usa a mesma
  ordem, por `id`.** Com ordens diferentes, duas transações se esperam em
  ciclo. Confira a `generate_week` do PR 1: se ela trava só a linha do plano,
  não há ciclo.
- **`asUser` roda como `postgres`** (`apps/e2e/fixtures/db.ts:87-103`). No
  teste 3 ele prova a trava, não o grant. O grant é do `07_schema`, e o
  isolamento é do `02_rls`.
- **A suíte compartilha estado.** O teste da RPC em `07_schema` precisa do
  `rollback`. Sem ele, o plano `a2…01` do Bruno chega arquivado às suítes
  08 em diante.

## Fora do escopo

- Arquivar por RPC, ou tirar `status` do grant (ver Armadilhas).
- Decidir o que `paused` significa para o aluno (a spec 14, Fora de escopo,
  "Pausar planejamento"). A tela do aluno já trata "sem ativo".
- Validação de nome e de metas por semana em `validation.ts`. Hoje ela mora
  em `teacher-plans.ts:69-80`, e a fixture não a repete. Os tetos são do PR 7
  (QA-15).
- O nome de plano repetido (`23505` em `study_plans_name_per_student_uidx`)
  traduzido com `field`. É do PR 7 (QA-16).
