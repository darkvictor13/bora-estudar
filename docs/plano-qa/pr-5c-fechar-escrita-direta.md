# PR 5c — Fechar a escrita direta que as RPCs substituíram

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-04 (fecha o caminho antigo) |
| Branch | `fix/qa-5c-fechar-escrita-direta` |
| Depende de | 5b mergeado **e publicado em staging**: o `deploy-staging` do commit do merge terminou verde nos jobs de banco e de site (`gh run list --workflow deploy-staging.yml --limit 5`). Por ele, 5a, 4, 3 e 1 |
| Migration | sim |

## O defeito

O 5a e o 5b puseram a escrita de execução atrás de RPCs com `request_id` UNIQUE, mas não
revogaram nada, porque o bundle anterior ainda escrevia direto (README, "Compatibilidade
com o bundle no ar"). Enquanto o caminho direto existir, toda a proteção é opcional: quem
chamar a API sem passar pela RPC volta a ter os defeitos do QA-04.

- **`goal_entries`.**
  - `goal_entries_insert` (`20260914150000_initial_schema.sql:1734`) aceita o aluno com
    acesso vigente e o professor, e o grant de INSERT por coluna do 5a continua
    concedido.
  - Um INSERT sem `request_id` não tem idempotência nenhuma, e um registro de questões
    iniciais inserido assim não soma no progresso.
  - `goal_entries_update` (`:1739`) e o grant de UPDATE por coluna (`:1914-1916`) deixam
    reescrever `questions` de um registro que já somou em `initial_questions_done`. O
    contador e o ledger divergem.
- **`goals`.** O ramo do aluno em `goals_insert` (`:1691-1707`) ainda aceita meta `extra`
  e `reinforcement`. O gatilho do QA-28 (5a) é `BEFORE UPDATE`, então a meta pode nascer
  com `spent_minutes`, `questions_answered` e `correct_answers` preenchidos.
- **`theory_progress`.**
  - O grant de UPDATE por coluna (`:1935-1939`) inclui `initial_questions_done`,
    `initial_questions_complete(_at)` e `lesson_done(_at)`.
  - O INSERT é de tabela inteira (`:1934`).
  - Com isso o aluno escreve o contador e a conclusão da aula sem passar pelo ledger.
- **`theory_reviews`.** INSERT de tabela e UPDATE de `minimum_questions`,
  `questions_answered`, `status`, `started_at` e `completed_at` (`:1941-1944`). O aluno
  baixa o mínimo da própria revisão para 1, ou a marca concluída.

## Decisões aplicadas

- **README, "revogar o que o bundle antigo usa é PR seguinte (é o 5c)".** Produção não
  existe, e staging tem só dado de teste: nenhum dado é corrigido. Esta migration não cria
  constraint.
- **Escolhas deste plano.** Quem discordar reabre antes do código.
  1. **`goal_entries` perde INSERT e UPDATE para `authenticated` inteiro, professor
     incluído.**
     - Depois do 5b, quem insere são três RPCs: `record_goal_entry`,
        `record_extra_study` e `record_initial_questions`.
     - Nenhuma tela do professor insere nem altera registro. Os dois ramos do professor
       nunca tiveram uso, e a spec 12 (R-CONC-03) diz que quem afirma ter estudado é quem
       estudou.
     - Corrigir um registro é apagar e registrar de novo (spec 19, R-EXTRA-16).
     - Fica igual a `quiz_session_questions`: SELECT, e escrita por RPC.
  2. **DELETE fica como está** nas quatro tabelas.
     - `removeStudyEntry` está no contrato, o 5a já exige acesso vigente no
       `goal_entries_delete`, e o `CLAUDE.md` diz que o aluno apaga o que criou.
     - Apagar um registro de questões iniciais não desconta o progresso, e nenhuma tela
       faz isso (5b, "Fora do escopo").
  3. **`goals_insert` fica só com o ramo do professor.** O adaptador não cria
     `reinforcement` em lugar nenhum (conferido em 06/10/2026: `grep -rn reinforcement
     apps/web/src/lib/api/` só acha o tipo, em `contract.ts:76` e `teacher-goals.ts:117`).
     Quando o reforço voltar a ser criado pelo aluno, será por RPC.
  4. **`theory_progress` continua aceitando escrita direta, mas só da LEITURA**:
     `current_page`, `theory_done` e `theory_done_at`, com grant por coluna também no
     INSERT. Gravar a página leva a coluna a um valor e não acumula, então não precisa de
     RPC.
  5. **`theory_reviews` perde INSERT e UPDATE.** A revisão nasce em
     `record_initial_questions` e avança em `record_review_questions`. A policy `for all`
     dá lugar a uma de DELETE, que é o que sobra.

## Passo a passo

1. **Spec** (primeiro commit, sozinho). Não há id de e2e novo, e `docs/fluxos-e2e.md` não
   muda: diga isso na descrição do PR.
   - `docs/specs/32-fluxo-da-teoria.md`, R-TEO-20:
     - o aluno grava direto só a leitura, com grant por coluna no INSERT e no UPDATE;
     - questões iniciais, conclusão da aula e revisões são das RPCs;
     - `theory_reviews` não tem INSERT nem UPDATE para `authenticated`;
     - quem venceu continua lendo e apagando o que era dele.
   - `docs/specs/12-conclusao-de-meta.md`, R-CONC-26 (ou o próximo id livre depois dos do
     5a): `goal_entries` não tem INSERT nem UPDATE para `authenticated`. O registro nasce
     numa das três RPCs e não se edita. Tire das regras do 5a a ressalva "o INSERT direto
     ainda é aceito, até o 5c".
   - `docs/specs/19-estudo-extra-avulso.md`: nota em R-EXTRA-06. "O aluno não tem `insert`
     em `goals`" passa a ser verdade desde esta migration.

2. **Conferir que o bundle publicado não usa o que vai fechar.** Rode na `main` e cole a
   saída na descrição do PR:

   ```bash
   # goal_entries, theory_reviews e theory_review_entries: nenhuma escrita além de delete
   grep -rnE 'from\("(goal_entries|theory_reviews|theory_review_entries)"\)' -A4 apps/web/src/lib/api/supabase/ \
     | grep -E '\.(insert|upsert|update)\('
   # goals: insert só em teacher-goals.ts (professor)
   grep -rn 'from("goals")' -A3 apps/web/src/lib/api/supabase/ | grep -E '\.(insert|upsert)\('
   # theory_progress: só as três colunas de leitura
   grep -n "interface ProgressWrite" -A6 apps/web/src/lib/api/supabase/theory.ts
   ```

   - O primeiro `grep` tem de sair vazio, e o segundo só pode mostrar `teacher-goals.ts`.
   - Se aparecer algo, este PR espera: o caminho que sobrou precisa de RPC antes.
   - `seed.sql`, `supabase/tests/1[234]_*.sql` e `apps/e2e/fixtures/db.ts` escrevem
     como dono do banco, e o `revoke` não os alcança.

3. **Migration**, criada com `supabase migration new close_direct_execution_writes`.
   - Antes de recriar qualquer policy, leia a definição vigente: 1, 3 e 5a podem tê-la
     mudado. Ela está em `pg_policies`:

     ```bash
     docker exec supabase_db_bora-estudar psql -U postgres -c \
       "select tablename, policyname, cmd, qual, with_check from pg_policies
         where tablename in ('goals','goal_entries','theory_progress','theory_reviews') order by 1,2"
     ```

   - Confira também que as RPCs são `security definer`. Uma que não seja depende do grant
     que este PR revoga:

     ```sql
     select proname, prosecdef from pg_proc
      where proname in ('record_goal_entry','record_extra_study',
                        'record_initial_questions','record_review_questions');
     -- todas precisam de prosecdef = true
     ```

   - Esboço:

   ```sql
   -- Fecha a escrita direta que as RPCs do 5a e do 5b substituíram (QA-04, PR 5c).
   --
   -- O QUE FECHA
   --   goal_entries     INSERT e UPDATE para authenticated, professor incluído. O registro
   --                    nasce em record_goal_entry, record_extra_study ou
   --                    record_initial_questions, e não se edita.
   --   goals            o ramo do aluno em goals_insert. Estudo extra é record_extra_study.
   --   theory_progress  as colunas de contagem e de conclusão, no INSERT e no UPDATE.
   --   theory_reviews   INSERT e UPDATE. Nascem e avançam pelas RPCs da teoria.
   -- O QUE FICA: DELETE nas quatro, como antes; a leitura do PDF em theory_progress.
   --
   -- COMPATIBILIDADE: o bundle no ar (5b) não usa nada disto — ver a descrição do PR,
   -- com os greps. As RPCs são SECURITY DEFINER e não dependem destes grants.
   -- DADOS: nenhum alterado; nenhuma constraint nova.

   -- goal_entries. Revogar no nível da tabela leva junto os grants de coluna (os do 5a e
   -- os de :1914-1916).
   drop policy goal_entries_insert on public.goal_entries;
   drop policy goal_entries_update on public.goal_entries;
   revoke insert, update on public.goal_entries from authenticated;

   -- goals: só o professor insere direto.
   alter policy goals_insert on public.goals
     with check (teacher_id = (select auth.uid()));

   -- theory_progress. O UPDATE é por coluna: revoga-se coluna a coluna. O INSERT é de
   -- TABELA, e revogar coluna de um grant de tabela não tira nada — por isso revoga a
   -- tabela e concede as colunas de novo.
   revoke update (initial_questions_done, initial_questions_complete,
                  initial_questions_complete_at, lesson_done, lesson_done_at)
     on public.theory_progress from authenticated;
   revoke insert on public.theory_progress from authenticated;
   grant insert (student_id, study_plan_id, theory_lesson_id,
                 current_page, theory_done, theory_done_at)
     on public.theory_progress to authenticated;

   -- theory_reviews: sobra o DELETE do dono.
   drop policy theory_reviews_write on public.theory_reviews;
   create policy theory_reviews_delete on public.theory_reviews for delete to authenticated
     using (student_id = (select auth.uid()));
   revoke insert, update on public.theory_reviews from authenticated;
   ```

   Se `pg_policies` mostrar que `goals_insert` ganhou outra condição no ramo do professor
   (do 1 ou do 3), mantenha a condição e tire só o `or (...)` do aluno.

4. **`npm run db:types`.** Grants e policies não mudam o arquivo gerado, então o diff deve
   sair vazio. Se não sair, investigue antes de commitar.

5. **Testes de banco** (ver Testes) e `npm run db:test`.

6. **Código.** O adaptador não muda: o passo 2 provou que ele não usa o que fechou. Mudam
   comentários:
   - `apps/web/src/lib/api/supabase/idempotency.ts`, o cabeçalho (`:1-18`), que o 5a já
     mexeu:
     - Sai a frase "O pedido à frente do banco é `operations` + `reserve_operation` de
       volta".
     - Entra: a idempotência mora no banco, num índice UNIQUE por tabela de execução, e
       `once()` só poupa a segunda viagem do clique duplo dentro da aba.
     - Liste os índices a partir de
       `grep -rn "request_id\|_uidx" supabase/migrations/`. Devem aparecer:
       - `access_grants_request_uidx`;
       - a PK de `goal_batches` (PR 1);
       - `goal_entries_request_uidx`, das três RPCs do registro;
       - `theory_review_entries_request_uidx`.
     - Liste as naturalmente idempotentes e o que sustenta cada uma: `link_student`,
       `activate_study_plan` (PR 3) e `clear_pending_goals` (PR 1).
     - Diga quais escritas diretas ficam só com o `once()`, e por quê: as que levam uma
       coluna a um VALOR, como a página da teoria e o status da meta, não acumulam.
   - `apps/web/src/lib/api/supabase/index.ts:26-27`: o item "Idempotência de verdade" sai
     da lista "O que o banco de 14/09/2026 ainda não permite".

7. **Docs.**
   - `CLAUDE.md`, tabela "A fronteira da escrita". As linhas de `goal_entries`,
     `theory_progress` e `theory_reviews` (como o 5a as deixou) passam a ser:

     | | Quem escreve | Como |
     |---|---|---|
     | `goal_entries` | ninguém direto | INSERT só por `record_goal_entry`, `record_extra_study` e `record_initial_questions`, com `request_id` UNIQUE; sem UPDATE (corrigir é apagar e registrar de novo); DELETE pela policy, com acesso vigente para o aluno |
     | `theory_progress` | o aluno, com acesso vigente | direto, só a leitura (`current_page`, `theory_done`, `theory_done_at`), com grant por coluna no INSERT e no UPDATE; questões iniciais e conclusão da aula só por `record_initial_questions` |
     | `theory_reviews` | ninguém direto | nascem em `record_initial_questions`, avançam em `record_review_questions`; o aluno só apaga a dele |

     Na linha de `goals`, acrescente: "o aluno não insere meta; estudo extra é
     `record_extra_study`".
   - `CLAUDE.md`, parágrafo "Escrita de execução continua fechada…" (`:97`):
     `goal_entries` e `theory_reviews` entram na lista do que é escrito por RPC.
   - `docs/de-para-schema.md`, "Estado dos dois lados": uma coluna nova. As policies caem
     2 (`goal_entries_insert`, `goal_entries_update`); a troca em `theory_reviews` é
     neutra. Os demais números não mudam.
   - `docs/bugs-encontrados.md`: o QA-04 ganha "caminho direto fechado em <data>".

## Testes

As suítes compartilham estado e rodam depois desta migration. Lembretes:

- INSERT ou UPDATE sem privilégio levanta `42501` sempre, mesmo sem linha casando.
- O `WITH CHECK` também levanta `42501`.
- Só DELETE e UPDATE barrados pelo `USING` filtram em silêncio, e esses se conferem
  com `get diagnostics … row_count`.

**`01_grants.sql`**

- O teste 10 ("o aluno corrige os minutos do proprio registro") inverte: espera
  `insufficient_privilege`, com o comentário "corrigir é apagar e registrar de novo".
- O teste 11 continua passando, porque aceita `generated_always` ou
  `insufficient_privilege`.
- Casos novos, todos com `insufficient_privilege`:
  - Bruno: INSERT em `goal_entries` na meta `a5…03`, que é dele, com
    `minutes, questions, correct_answers`;
  - Ana: INSERT em `goal_entries` na meta do Bruno, e UPDATE de `minutes` em `a6…01`;
  - Bruno: UPDATE de `initial_questions_done` em `b3…01`; depois, UPDATE de `lesson_done`;
  - Bruno: INSERT em `theory_progress` com `initial_questions_done`, numa aula qualquer.
    O privilégio de coluna recusa antes de qualquer FK;
  - Bruno: INSERT em `theory_reviews`, e UPDATE de `questions_answered` e de
    `minimum_questions` em `b4…01`.
- O teste 12 (Bruno avança `current_page`) continua aceito. É a prova de que a leitura
  ficou.

**`02_rls.sql`**, teste 03:

- Bruno inserindo na meta da Carla passa a receber `insufficient_privilege`, antes da FK.
  Troque o `exception when foreign_key_violation` e o comentário.
- A FK composta continua conferida pelo teste 06 de `07_schema.sql`.
- O isolamento pela RPC já está no 5a: `record_goal_entry` na meta da Carla dá
  `no_data_found`.

**`03_goals.sql`**

- Teste 02 ("o aluno cria estudo extra"): Bruno inserindo `extra` direto passa a esperar
  `insufficient_privilege`, pelo `WITH CHECK`. Logo depois, um caso novo: Bruno chama
  `record_extra_study` com a assinatura do 5a, e ela grava.
- Teste 03 (Fabi): continua `insufficient_privilege`. Ajuste o `notice`, porque o motivo
  agora é a falta do ramo e não o acesso vencido; o acesso vencido pela RPC é teste do 5a.
- O caso do 5a "INSERT direto, compatibilidade com o bundle no ar… sai no 5c" inverte:
  espera `insufficient_privilege`.
- Procure outros INSERTs diretos de `authenticated` nestas tabelas e inverta-os também:
  `grep -n "insert into public.\(goal_entries\|goals\|theory_reviews\)" supabase/tests/0[1-7]*.sql`.

**`06_theory.sql`**

- O teste 02 (Bruno cria revisão no plano da Carla) passa a receber
  `insufficient_privilege`, porque o INSERT foi revogado.
- O teste 01 (`theory_progress` no plano da Carla, só com colunas concedidas) continua
  dando `foreign_key_violation`.
- Os testes 16 a 26, do 5b, rodam depois desta migration. Isso prova que as RPCs da
  teoria funcionam sem os grants.

**`07_schema.sql`**, uma varredura nova:

```sql
do $$
declare v_erro text := '';
begin
  if has_any_column_privilege('authenticated', 'public.goal_entries', 'INSERT') then v_erro := v_erro || ' goal_entries(insert)'; end if;
  if has_any_column_privilege('authenticated', 'public.goal_entries', 'UPDATE') then v_erro := v_erro || ' goal_entries(update)'; end if;
  if has_any_column_privilege('authenticated', 'public.theory_reviews', 'INSERT') then v_erro := v_erro || ' theory_reviews(insert)'; end if;
  if has_any_column_privilege('authenticated', 'public.theory_reviews', 'UPDATE') then v_erro := v_erro || ' theory_reviews(update)'; end if;
  -- e, para cada coluna de contagem/conclusão de theory_progress, INSERT e UPDATE
  -- com has_column_privilege; e o contrário para current_page, que precisa continuar.
  if v_erro <> '' then
    raise exception 'FALHOU: escrita de execucao com grant direto:%', v_erro;
  end if;
  raise notice 'NN OK  o que virou RPC nao tem grant direto';
end $$;
```

**Unitários e e2e.** Não há teste novo. `npm run check` e a suíte e2e inteira são a prova
de que nenhuma tela usava o caminho fechado. Os que mais importam:

- `F-META-03`, `F-META-08` e `F-EXTRA-01`, do 5a;
- `F-TEO-01` a `F-TEO-09`;
- `F-REV-01`.

## Critério de pronto

- [ ] O `deploy-staging` do merge do 5b estava verde antes deste PR abrir.
- [ ] A saída dos `grep` do passo 2 está na descrição do PR: o primeiro vazio, o segundo
      só com `teacher-goals.ts`.
- [ ] As quatro RPCs têm `prosecdef = true`.
- [ ] `npm run db:test` está verde, com os testes invertidos e a varredura do 07.
- [ ] Depois de `npm run db:reset`, `npm run e2e` está verde, sem novo `fixme`.
- [ ] `npm run check` está verde, e o `db:types` saiu sem diff.
- [ ] `CLAUDE.md`, as specs 12, 19 e 32, `idempotency.ts`, `index.ts`, o de-para e
      `bugs-encontrados.md` estão atualizados.

## Armadilhas

- **Revogar tabela e revogar coluna não são simétricos.**
  - `revoke … on table` leva junto os grants de coluna.
  - `revoke (col) …` num grant de TABELA não tira nada. O INSERT de `theory_progress` é
    de tabela, por isso a migration revoga a tabela e concede as colunas de novo.
  - Confira com `has_column_privilege`, não lendo o SQL.
- **As policies vigentes podem não ser as de `20260914150000`.** O 5a usa `alter policy`
  em `goals_update`, `goals_delete` e `goal_entries_delete`, e o 1 e o 3 podem ter
  mexido em outras. Leia `pg_policies` antes de escrever o `alter`.
- **Testes que esperavam violação de FK passam a ver `42501`**, porque o privilégio é
  conferido antes. Ajuste o teste, não o grant. A FK continua coberta pela lista de FKs
  compostas do 07.
- **RPC `security invoker` quebraria em silêncio aqui.** Dentro dela, o INSERT passaria a
  dar `42501`. Por isso o `prosecdef` é critério de pronto.
- **Aba aberta com o bundle anterior ao 5b** passa a receber `42501` ao registrar.
  Staging só tem dado de teste, e recarregar resolve.
- **O DELETE barrado pela RLS não levanta.** Ele não muda aqui, mas qualquer teste novo
  sobre ele conta `row_count`.
- **Não confie no `CLAUDE.md` sobre as RPCs de bateria.** `start_quiz_session`,
  `finish_quiz_session`, `record_quiz_session_time` e `void_quiz_session` não existem
  (o 5a corrige o texto). `quiz_sessions` e o ledger já são SELECT puro, e não há nada a
  fechar ali.
- **`npm run db:test` antes de `npm run e2e` quebra o `global-setup`.** Rode
  `npm run db:reset` entre os dois.

## Fora do escopo

- **DELETE** em `goal_entries`, `goals` (`extra`/`reinforcement`), `theory_progress` e
  `theory_reviews`: continua como está (escolha 2).
- **Concluir, reabrir e pular por RPC** (spec 12, R-CONC-01). O status da meta continua
  sendo UPDATE direto do aluno; README, "Fora deste plano".
- **A escrita direta de planejamento pelo professor** em `goals`. Não é execução, e a
  semana já tem RPC desde o PR 1.
- **Criar `reinforcement` pelo aluno.** Não existe caminho hoje; quando existir, nasce
  como RPC.
- **Descontar progresso ao apagar registro de questões iniciais** (ver o 5b).

## Notas da implementação (06/10/2026)

Onde o plano divergiu do código e do `CLAUDE.md`; vale o que está aqui.

- **A pré-condição de deploy não foi cumprida, e este PR não relaxa nada por causa disso.**
  O 5c foi escrito sobre a pilha local (1, 2, 3, 4, 5a e 5b), sem nada enviado ao GitHub nem a
  staging. **Só pode ser mergeado depois de o `deploy-staging` do 5b estar verde nos jobs de banco
  e de site, e de o bundle antigo — que ainda escreve direto em `goal_entries`, `theory_progress`
  e `theory_reviews` — ter sido substituído.** Mergear antes quebra o registro de estudo de
  qualquer aba com o bundle anterior (`42501`).
- **Os `grep` do passo 2** foram rodados na pilha local (o bundle do 5b), e não na `main`; os dois
  primeiros saíram vazios e o terceiro mostrou só `current_page`, `theory_done` e
  `theory_done_at`. Repita-os na `main` quando o 5b for mergeado e cole a saída na descrição.
  Uma varredura mais larga (todo `.insert/.upsert/.update` do adaptador) confirmou que nenhuma
  escrita direta restante toca as quatro tabelas, fora o `update` de status em `goals` e a
  escrita da leitura em `theory_progress`.
- **Id da regra de `goal_entries`: R-CONC-27**, e não R-CONC-26, que o 5a já usou
  (`studied_on` nulo no registro de meta). A ressalva "o INSERT direto ainda é aceito, até o 5c"
  não existia mais nas specs: ela morava só no `CLAUDE.md` e em dois comentários de teste, e saiu
  dos três.
- **O cabeçalho que ainda tinha a frase de `operations` + `reserve_operation` é o de
  `request-memory.ts`**, não o de `idempotency.ts` (o 5a já tinha limpado este último). Os dois
  foram reescritos, e `idempotency.ts` agora lista as chaves com payload, as naturalmente
  idempotentes e as escritas diretas que ficam só com `once()`.
- **Policies vigentes** (`pg_policies`) conferidas antes do `alter`: `goals_insert` não tinha
  ganhado condição nova no ramo do professor, então ficou só `teacher_id = auth.uid()`. As quatro
  RPCs têm `prosecdef = true`, e a `07_schema` passou a conferir isso.
- **Testes de banco além do plano:** os casos 02b e 02c de `03_goals` (reforço já com resultado,
  e o estudo extra pela RPC), o 21 de `03_goals` (o registro na meta gerada passou a ser pela
  `record_goal_entry`), e o 24 da `07_schema` (a `goals_insert` não cita mais `student_id`).
- **O de-para** ganhou a coluna "06/10 · 5c": policies 121 para 119, os demais números iguais.
