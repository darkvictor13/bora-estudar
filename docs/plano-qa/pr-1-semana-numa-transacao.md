# PR 1 — A semana do professor numa transação

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-01 (Crítico), QA-05 (Alto), QA-17 (Baixo) |
| Branch | `fix/qa-1-semana-numa-transacao` |
| Depende de | — (é o primeiro da fila de migrations 1 → 3 → 5a → 5b → 5c → 7) |
| Migration | sim — `supabase migration new generate_week` |

## O defeito

Números de linha conferidos em `main` (`1769ae2`).

**QA-01: regenerar a semana apaga o estudo do aluno.** O aluno registra 40 min
numa meta de teoria, e ela passa a `in_progress`. O professor abre
`/professor/metas`, escolhe o modo "Segura", clica em **Ver prévia** e em
**Gerar**. A meta some, e o `goal_entries` do aluno vai de 1 linha para 0. A
prévia mostrava "Preservadas 0".

- `apps/web/src/lib/api/supabase/teacher-goals.ts:43`: `isPreserved` só olha
  `completed`. Três lugares usam esse critério:
  - `generateWeek`, que apaga (`:213-220`);
  - `clearPendingGoals` (`:276-280`);
  - `previewWeek`, que conta (`:161-163`).
- `supabase/migrations/20260914150000_initial_schema.sql:501-503`:
  `goal_entries_goal_fk ... on delete cascade` leva o registro junto, sem erro.
- O modo `full` ("Replanejar semana inteira — apaga tudo",
  `routes/teacher/Goals.tsx:212`) apaga até a meta concluída com registro. Hoje
  isso é de propósito. **Este PR remove esse modo** (ver Decisões).
- Dois textos dizem que o modo `safe` substitui meta EM ANDAMENTO:
  - o cabeçalho de `teacher-goals.ts:10-11`;
  - `lib/api/contract.ts:1055-1056`.

  Os dois descrevem o código, e o código é o defeito.

**QA-05: uma falha no meio apaga a semana.** Com o `POST /rest/v1/goals`
caindo, Gerar leva a semana de 5 metas para 0. A causa é que `generateWeek` faz
o `DELETE` (`teacher-goals.ts:218`) e o `INSERT` (`:231`) em duas requisições,
sem transação.

**A retentativa também não é segura**, e o relatório não diz isso.

- `routes/teacher/Goals.tsx:110` chama `newRequestId()` dentro de `input()`, ou
  seja, a cada clique em "Gerar".
- `once()` (`supabase/idempotency.ts:26`) é memória da aba e não chega ao banco.
- Por isso, repetir o pedido depois de a resposta se perder chega como operação
  nova.
- E o replay depois de um sucesso não é inofensivo. Se o aluno registrou numa
  meta recém-criada, a segunda execução preserva essa meta e insere a semana
  inteira de novo: a semana fica duplicada.

**A posição das metas novas também colide.** `teacher-goals.ts:224-239` soma ao
`day_position` novo a QUANTIDADE de metas preservadas no dia, e não a MAIOR
posição. Exemplo: a meta preservada está na posição 2 e a da posição 1 foi
apagada; a nova recebe 1+1=2 e bate no `goals_one_per_slot_idx`
(`initial_schema.sql:896-897`). Com a preservação de metas com registro, esse
caso passa a acontecer de verdade.

**QA-17: semana fora do intervalo.** `Goals.tsx:38` faz `Number(...) || 1`:

- 0 vira 1 em silêncio;
- -3 e 99999 montam a prévia e gravam;
- 1.5 chega ao banco e volta `22P02` cru.

`goals.week_number` (`initial_schema.sql:432`) e `goals.planned_minutes`
(`:442`) não têm CHECK.

## Decisões aplicadas

| Id | Valor aqui |
|---|---|
| D-01 | Gerar preserva três tipos de meta:<br>• a concluída;<br>• a com linha em `goal_entries`;<br>• a com bateria.<br><br>"Com bateria" é existir `quiz_sessions` com `goal_id = meta` **ou** `origin_goal_id = meta`. É o mesmo predicado de `freeze_goal_with_sessions` (`initial_schema.sql:1264`). |
| D-02, revista | **Decisão do dono do produto, posterior ao README:** a meta concluída SEM registro também é preservada, porque concluir já é uma afirmação do aluno sobre o que fez.<br><br>Com isso, os dois modos apagariam exatamente as mesmas metas. **O modo "Replanejar semana inteira" sai**, junto com o seletor de substituição e a confirmação extra.<br><br>Gerar metas fica com um comportamento só: **sai a meta pendente, a pulada e a em andamento sem histórico; fica todo o resto.**<br><br>Se o README ainda descrever dois modos na D-02, corrija a linha neste PR. |
| Design comum | Três constraints, já definidas (outros planos dependem delas):<br>• `goal_entries_goal_fk` recriada com `on delete no action`;<br>• `goals_week_number_check (week_number between 1 and 520)`;<br>• `goals_planned_minutes_check (planned_minutes >= 0)`.<br><br>`goal_entries.request_id` e as CHECKs de `goal_entries` são do PR 5a. Não entram aqui. |

**Escolhas deste plano, além das dadas.** Quem discordar reabre antes do código.

1. **Sem `goals.batch_id`.**
   - Nenhuma tela lê de qual lote veio uma meta.
   - O replay não precisa dessa ligação: ele não toca em `goals`, e o adaptador
     relê a semana.
   - E a coluna nasceria exposta pelo `grant insert` de tabela inteira em
     `goals` (`initial_schema.sql:1904`). Para cumprir a defesa 3 do
     `CLAUDE.md`, ela exigiria uma FK composta `(batch_id, study_plan_id)`.
     Seria superfície sem leitor.
2. **O replay compara as colunas `(study_plan_id, week_number)`, e não o
   `p_goals`.**
   - O `request_id` nasce com a prévia (passo 4), então o mesmo id leva sempre a
     mesma intenção.
   - Um `p_goals` diferente sob o mesmo id seria defeito do cliente. O replay
     não grava nada, então esse caso não estraga dado.
   - Guardar o `p_goals` num `jsonb` seria o segundo caminho afirmando o que
     `goals` já diz.
3. **O request_id é gerado UMA VEZ por prévia.** Ele é guardado junto com a
   prévia e reusado em toda tentativa de "Gerar" daquela prévia. Mudar o plano,
   a semana ou a cópia descarta a prévia e o id juntos.
4. **A prévia lê o critério do banco**, por `week_replacement_preview`, que é
   `security definer`. O motivo: a 07 proíbe `authenticated` de executar
   funções de `app_private`, e é lá que o critério mora.
5. **O plano é travado com `for no key update`**, e não com `for update`. Duas
   gerações do mesmo plano continuam serializadas. Já o aluno que lança estudo
   extra pega `for key share` no plano pela FK, e não precisa esperar.
6. **As mensagens de `raise exception` têm acento e ponto final**, como
   `20260924210319_classroom_mock_exams.sql`, e não a forma sem acento de
   `20260918120000`. O motivo é que o `P0001` chega à tela como está
   (`supabase/errors.ts:102-103`).

   A autorização é a exceção: ela levanta `42501`
   (`errcode = 'insufficient_privilege'`), que `translateDbError` já transforma
   em `forbidden`.
7. **"Limpar pendentes" continua no contrato e no banco, sem botão.**
   - `clear_pending_goals` apaga exatamente o que "Gerar" substituiria, sem
     inserir nada.
   - Como operações, as duas continuam distintas. Gerar recusa uma semana vazia
     (`p_goals` sem meta). Esvaziar o que não foi feito — o aluno de férias, por
     exemplo — é a única coisa que só Limpar faz.
   - Como botões, não há o que decidir: hoje nenhuma tela chama
     `clearPendingGoals`, e este PR não cria o botão.
   - Se a operação ganhar tela um dia, ela é "Esvaziar a semana", e não uma
     variante de Gerar.

## Passo a passo

### 1. Spec e catálogo: o primeiro commit, só de documentação

**`docs/specs/04-geracao-semanal.md`** descreve `apply_study_plan_batch`,
`study_plan_batches` e o enum `batch_mode`, que não existem desde 14/09. Ela
passa a descrever o que este PR implementa. **Os ids são estáveis**
(`docs/specs/README.md`, Convenções): uma regra que sai fica marcada como
removida, com a data e o motivo.

O cabeçalho fica assim:

```
**Situação:** implementada · **Fluxos e2e:** F-PROF-04, F-PROF-05, F-PROF-06, F-PROF-10, F-PROF-11
> **Reescrita em <data> (QA de 06/10/2026).** `apply_study_plan_batch`, `study_plan_batches`
> e `batch_mode` saíram no schema de 14/09/2026. A geração passou a `generate_week`, com um
> comportamento só: o modo "Replanejar semana inteira" foi removido.
```

Em **Problema**, acrescente um parágrafo sobre QA-01 e QA-05: o estudo
registrado sumia, e a falha no meio deixava a semana vazia.

As regras antigas mudam assim:

| Regra | O que fazer |
|---|---|
| R-GEN-01 | Reescrever: `generate_week`, `clear_pending_goals` e `week_replacement_preview` conferem `study_plans.teacher_id = auth.uid()` e `is_teacher_of(student_id)`. Senão, levantam `42501`. |
| R-GEN-02 | Reescrever: o lote é idempotente pela chave `goal_batches.id` (a PK, que É o `request_id`). Mesmo id com o mesmo `(plano, semana)` devolve `true` (replay) sem tocar em `goals`; outro `(plano, semana)` é recusado. |
| R-GEN-03 | Removida (data): substituída por R-GEN-19. |
| R-GEN-04 | Removida: não há mais modos (R-GEN-12). |
| R-GEN-05 | Removida: meta com bateria, aberta ou não, é preservada (R-GEN-13). |
| R-GEN-06 | Reescrever apontando para R-GEN-16. |
| R-GEN-07 a 10 | Removidas em 14/09: o formulário de blocos e dias não existe; a distribuição é `planWeek` (spec 18). |
| R-GEN-11 | Removida: não há `deleted_at`. Meta sem histórico sai da tabela; meta com histórico não sai (R-GEN-14). |

Regras novas:

| Id | Regra |
|---|---|
| R-GEN-12 | **Gerar tem um comportamento só.** Não há modo, nem seletor de substituição, nem confirmação extra.<br><br>"Replanejar semana inteira" foi removido em <data> por decisão do dono do produto. Com a meta concluída preservada (R-GEN-13), ele apagaria exatamente o mesmo que o padrão, e uma tela com dois caminhos iguais promete uma diferença que não existe. |
| R-GEN-13 | **Fica de pé** a meta concluída e a meta com HISTÓRICO, que é ter linha em `goal_entries` ou ter bateria (`quiz_sessions.goal_id` ou `origin_goal_id`).<br><br>**Sai** a pendente, a pulada e a em andamento sem histórico.<br><br>O critério mora num lugar só, `app_private.goal_is_preserved`, usado pela geração, pela prévia e pela limpeza. |
| R-GEN-14 | **Nenhum caminho apaga meta com estudo registrado.** `goal_entries_goal_fk` é `on delete no action`, então até o `DELETE` direto pela API falha com `23503`. |
| R-GEN-15 | **Gerar é uma transação.** O `generate_week` apaga e insere na mesma chamada; uma falha em qualquer ponto deixa a semana como estava. |
| R-GEN-16 | As metas novas entram **depois da maior posição que sobrou** em cada dia. Dentro do dia, são renumeradas na ordem do lote. O cálculo é no banco, nunca no cliente. |
| R-GEN-17 | A semana é um inteiro de 1 a 520 (`goals_week_number_check`, `checkWeekNumber`). Os minutos previstos são ≥ 0 (`goals_planned_minutes_check`). |
| R-GEN-18 | A prévia conta o que fica e o que sai pelo mesmo critério (`week_replacement_preview`). A métrica "Preservadas" diz que inclui as metas com estudo registrado. |
| R-GEN-19 | O `request_id` nasce com a prévia e é o mesmo em toda tentativa de gravá-la. |
| R-GEN-20 | "Limpar pendentes" (`clear_pending_goals`) apaga exatamente o que Gerar substituiria, e nada insere. É naturalmente idempotente: só apaga, e o pior caso é segurado por `goal_entries_goal_fk`. Não tem botão: ver a escolha 7 do plano. |
| R-GEN-21 | `goal_batches` é SELECT para o professor dono. Quem escreve é `generate_week`. |

Os demais itens da spec 04:

- **Fluxo:** um diagrama novo, `Ver prévia` → `week_replacement_preview`, e
  `Gerar` → `generate_week`. Use a sequência da função (passo 2) como roteiro.
- **Superfície:**
  - a rota `/professor/metas`;
  - a tela `routes/teacher/Goals.tsx`;
  - o adaptador `lib/api/supabase/teacher-goals.ts`;
  - o domínio `planWeek` (`lib/domain/teacher.ts`);
  - as RPCs `generate_week`, `clear_pending_goals` e `week_replacement_preview`;
  - no banco: `goals` e `goal_batches`.
- **Critérios de aceitação antigos:**
  - CA-01 a CA-04 e CA-08: removidos (a forma do formulário, e o modo
    `append`);
  - CA-05 a CA-07: substituídos por CA-11 a CA-13;
  - CA-09: passa a citar `supabase/tests/03_goals.sql`;
  - CA-10: fica "sem cobertura — PR 8 (D-13)".
- **Critérios de aceitação novos:**

  | Id | Critério | Cobertura |
  |---|---|---|
  | CA-11 | A meta em andamento com registro sobrevive a Gerar, com os registros | F-PROF-05, `03_goals` |
  | CA-12 | A meta concluída sem registro sobrevive; a pendente, a pulada e a em andamento sem registro saem | F-PROF-05, `03_goals` |
  | CA-13 | A prévia conta como preservadas a concluída e a com registro | F-PROF-05 |
  | CA-14 | Gravação que falha deixa a semana intacta | F-PROF-10, `03_goals` |
  | CA-15 | Repetir o mesmo pedido depois de gravado não duplica | F-PROF-10, `03_goals` |
  | CA-16 | Id reusado com outro `(plano, semana)` é recusado | `03_goals` |
  | CA-17 | Professor alheio e aluno recebem `42501` | `03_goals` |
  | CA-18 | Semana fora de 1 a 520 é recusada | F-PROF-11, `07_schema` |
  | CA-19 | `DELETE` direto de meta com registro dá `23503` | `03_goals` |
  | CA-20 | Limpar apaga o mesmo que Gerar substituiria; a segunda chamada apaga 0 | `03_goals` |
  | CA-21 | Apagar a conta continua passando | `07_schema` |
  | CA-22 | Metas novas entram depois da maior posição do dia | `03_goals` |
  | CA-23 | A tela não tem seletor de substituição nem confirmação de "replanejar" | F-PROF-05 |

- **Fora de escopo:**
  - `goals.batch_id` (escolha 1);
  - gerar em planejamento pausado ou arquivado;
  - o modo `append`;
  - um caminho que apague meta concluída ou com histórico. Quem precisar disso
    precisa de spec nova, porque é exatamente o que o QA-01 condenou.

**`docs/specs/18-previa-e-distribuicao-da-semana.md`:**

- R-PREV-11 é reescrita. A distribuição continua sendo calculada no navegador
  (`planWeek`), mas as contagens do que fica e do que sai vêm do banco, por
  `week_replacement_preview`.
- R-PREV-16 é removida (data) e substituída por R-GEN-19, da spec 04.
- No **Fluxo**:
  - "dias · tempo · modo · blocos marcados" perde o "modo";
  - `batchIdFor` e `apply_study_plan_batch` dão lugar a
    `generate_week(p_request_id = id da prévia)`.
- Na **Superfície**, "RPCs: nenhuma nova" e "Migration: nenhuma" passam a
  apontar para a spec 04 e para a migration deste PR.

**`docs/specs/03-planejamento-e-metas.md:87-88`** passa a dizer:

- **Escrita:** `goals` é escrita direta do professor (planejamento); gerar e
  limpar a semana passam por `generate_week` e `clear_pending_goals`.
- **Banco:** `goal_batches` no lugar de `study_plan_batches`.

**`docs/fluxos-e2e.md`:**

- Na seção "Professor", a linha F-PROF-05 vira: *"gerar a semana preserva o
  concluído e o estudo registrado; só sai o que está pendente, pulado ou em
  andamento sem registro; a prévia conta o que fica; não há modo de substituição
  — QA-01"*.
- **O critério antigo "replanejar a semana exige confirmação" sai, e o teste
  que o cobria também** (ver Testes): o caminho não existe mais. Em troca, o
  F-PROF-05 afirma que o seletor e a confirmação não estão na tela.
- Na tabela de testids (`:118`), `goals-confirm` sai.
- Em "Fluxos que ainda não existem", reserve:
  - **F-PROF-10**: *"gerar a semana é uma transação: a gravação que falha deixa
    a semana como estava, e repetir o mesmo pedido depois de gravado não
    duplica — QA-05"*;
  - **F-PROF-11**: *"a semana vai de 1 a 520: fora disso a prévia recusa, e
    nada chega ao banco — QA-17"*.
- **Não use F-PROF-07, 08 nem 09.** Esses ids continuam citados nas specs 03, 04
  e 09 e em `comparativo-fluxos-v2.md` com outro significado.

**`docs/plano-qa/README.md`:** a linha D-02 passa a registrar a decisão revista
(a concluída é preservada, e o modo "Replanejar" sai).

### 2. Migration, suítes de banco e tipos (um commit)

O arquivo é `supabase migration new generate_week`. Não toque em nenhuma
migration já aplicada. Segue o esboço, para copiar e ajustar os comentários; o
cabeçalho segue o modelo de `20260918120000` ("O QUE ESTA MIGRATION FECHA",
"COMPATIBILIDADE", "O QUE FEZ COM OS DADOS").

```sql
-- COMPATIBILIDADE COM O BUNDLE QUE JÁ ESTÁ NO AR
-- Nenhum grant encolhe. O bundle anterior continua fazendo DELETE + INSERT
-- direto em `goals`, e ainda oferece "Replanejar semana inteira": com a FK em
-- `no action`, apagar meta com registro passa a falhar com 23503 ("O registro
-- depende de outro que não existe.") em vez de levar o estudo junto. A
-- mensagem piora e o dado fica, que é a troca certa. Apagar `study_plans` com
-- estudo registrado também passa a dar 23503 — nenhuma tela apaga planejamento.
--
-- O QUE ESTA MIGRATION FEZ COM OS DADOS (só existe staging, com dado de teste)
-- 1. Apagou as metas com `week_number` fora de 1..520. O cascade, que ainda vale
--    NESTE ponto do arquivo, levou os registros delas.
-- 2. `planned_minutes` negativo virou 0.

delete from public.goals where week_number not between 1 and 520;
update public.goals set planned_minutes = 0 where planned_minutes < 0;

alter table public.goals
  add constraint goals_week_number_check check (week_number between 1 and 520),
  add constraint goals_planned_minutes_check check (planned_minutes >= 0);

-- NO ACTION, e não RESTRICT: o no action confere no fim do comando, e é isso que
-- deixa o apagamento de conta — que desce por `profiles` até `goals` E até
-- `goal_entries` no mesmo comando — continuar passando. `07_schema` confere.
alter table public.goal_entries
  drop constraint goal_entries_goal_fk,
  add constraint goal_entries_goal_fk
    foreign key (goal_id, teacher_id, student_id)
    references public.goals (id, teacher_id, student_id)
    on delete no action;

-- O lote. `id` É o request_id, gerado uma vez na origem (com a prévia): a PK é
-- o que sustenta a idempotência de `generate_week`.
create table public.goal_batches (
  id            uuid primary key,
  study_plan_id uuid not null,
  teacher_id    uuid not null,
  student_id    uuid not null,
  week_number   integer not null,
  created_at    timestamptz not null default now(),
  constraint goal_batches_week_number_check check (week_number between 1 and 520),
  -- Defesa 3: o contexto copiado não diverge do planejamento.
  constraint goal_batches_study_plan_fk
    foreign key (study_plan_id, teacher_id, student_id)
    references public.study_plans (id, teacher_id, student_id) on delete cascade
);

comment on table public.goal_batches is
  'Uma linha por geração de semana. SELECT para o professor dono; quem escreve é `generate_week`.';

-- Índice do lado que referencia, na ordem da FK: é o que o cascade usa.
create index goal_batches_study_plan_idx
  on public.goal_batches (study_plan_id, teacher_id, student_id);

alter table public.goal_batches enable row level security;
create policy goal_batches_select on public.goal_batches for select to authenticated
  using (teacher_id = (select auth.uid()));
grant select on public.goal_batches to authenticated;

-- O CRITÉRIO, UMA VEZ. Fica de pé a meta concluída — concluir já é afirmação
-- do aluno — e a com histórico: registro, ou bateria pelo mesmo predicado de
-- `freeze_goal_with_sessions`.
create or replace function app_private.goal_is_preserved(p_goal_id uuid, p_status public.goal_status)
  returns boolean
  language sql stable set search_path = '' as $$
  select p_status = 'completed'
      or exists (select 1 from public.goal_entries e where e.goal_id = p_goal_id)
      or exists (select 1 from public.quiz_sessions s
                  where s.goal_id = p_goal_id or s.origin_goal_id = p_goal_id);
$$;

-- Em função própria pelo mesmo motivo de `replay_access_grant`: é chamada de
-- dois lugares, e duas cópias da comparação divergem numa alteração futura.
create or replace function app_private.check_goal_batch_replay(
  p_batch public.goal_batches, p_study_plan_id uuid, p_week_number integer
) returns void
  language plpgsql immutable set search_path = '' as $$
begin
  if p_batch.study_plan_id is distinct from p_study_plan_id
     or p_batch.week_number is distinct from p_week_number then
    raise exception 'Este pedido já foi usado para outra semana. Monte a prévia de novo.';
  end if;
end;
$$;

-- A prévia. Definer porque o critério mora em `app_private`, que o cliente não
-- executa (07_schema, teste 04); por isso confere o dono à mão.
create or replace function public.week_replacement_preview(p_study_plan_id uuid, p_week_number integer)
  returns table (goals_total integer, goals_preserved integer)
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if not exists (
    select 1 from public.study_plans p
     where p.id = p_study_plan_id and p.teacher_id = v_uid
       and public.is_teacher() and public.is_teacher_of(p.student_id)
  ) then
    raise exception 'Somente o professor do aluno vê a prévia da semana dele.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select count(*)::integer,
           (count(*) filter (where app_private.goal_is_preserved(g.id, g.status)))::integer
      from public.goals g
     where g.study_plan_id = p_study_plan_id and g.week_number = p_week_number;
end;
$$;

-- GERAR A SEMANA NUMA TRANSAÇÃO. Devolve `true` quando foi replay.
create or replace function public.generate_week(
  p_request_id    uuid,
  p_study_plan_id uuid,
  p_week_number   integer,
  p_goals         jsonb
) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_plan public.study_plans%rowtype;
  v_seen public.goal_batches%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_request_id is null then
    raise exception 'request_id é obrigatório.';
  end if;
  if p_week_number is null or p_week_number not between 1 and 520 then
    raise exception 'A semana precisa ser um número inteiro de 1 a 520.';
  end if;
  if p_goals is null or jsonb_typeof(p_goals) <> 'array' or jsonb_array_length(p_goals) = 0 then
    raise exception 'A semana gerada precisa ter ao menos uma meta.';
  end if;

  -- Trava o plano: duas gerações (duas abas, ou a retentativa que chega com a
  -- primeira ainda rodando) passam uma de cada vez. `no key update` não
  -- bloqueia o `for key share` que a FK pega quando o aluno lança estudo extra.
  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.teacher_id = v_uid
   for no key update;

  if not found or not public.is_teacher() or not public.is_teacher_of(v_plan.student_id) then
    raise exception 'Somente o professor do aluno gera a semana dele.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O REPLAY vem DEPOIS da trava: a retentativa que esperou na linha do plano
  -- enxerga agora o lote que a primeira gravou.
  select * into v_seen from public.goal_batches b where b.id = p_request_id;
  if found then
    perform app_private.check_goal_batch_replay(v_seen, p_study_plan_id, p_week_number);
    return true;
  end if;

  begin
    insert into public.goal_batches (id, study_plan_id, teacher_id, student_id, week_number)
    values (p_request_id, v_plan.id, v_plan.teacher_id, v_plan.student_id, p_week_number);
  exception when unique_violation then
    -- Mesmo id para OUTRO plano, ao mesmo tempo: a trava não os serializou, a PK sim.
    select * into v_seen from public.goal_batches b where b.id = p_request_id;
    perform app_private.check_goal_batch_replay(v_seen, p_study_plan_id, p_week_number);
    return true;
  end;

  -- Sai só o que o critério não preserva. Se o aluno registrar numa destas
  -- metas entre o snapshot e o delete, `goal_entries_goal_fk` (no action) falha
  -- no fim do comando e nada muda.
  begin
    delete from public.goals g
     where g.study_plan_id = v_plan.id
       and g.week_number = p_week_number
       and not app_private.goal_is_preserved(g.id, g.status);
  exception when foreign_key_violation then
    raise exception 'O aluno registrou estudo numa destas metas enquanto a semana era gerada. Monte a prévia de novo.';
  end;

  -- Depois da MAIOR posição que sobrou no dia, e renumeradas por dia na ordem
  -- do lote. Contar as preservadas, como o adaptador fazia, colide.
  insert into public.goals (
    study_plan_id, teacher_id, student_id, week_number,
    weekday, weekday_name, day_position, type, subject, title,
    description, lesson, block, planned_minutes, notebook_block_id
  )
  select v_plan.id, v_plan.teacher_id, v_plan.student_id, p_week_number,
         x.weekday, x.weekday_name,
         coalesce(kept.max_position, 0)
           + row_number() over (partition by x.weekday order by x.day_position nulls last, e.ord),
         x.type, x.subject, x.title,
         x.description, x.lesson, x.block, x.planned_minutes, x.notebook_block_id
    from jsonb_array_elements(p_goals) with ordinality as e(item, ord)
   cross join lateral jsonb_to_record(e.item) as x(
         weekday integer, weekday_name text, day_position integer,
         type public.goal_type, subject text, title text, description text,
         lesson text, block text, planned_minutes integer, notebook_block_id uuid)
    left join (
         select g.weekday, max(g.day_position) as max_position
           from public.goals g
          where g.study_plan_id = v_plan.id and g.week_number = p_week_number
          group by g.weekday
    ) kept on kept.weekday = x.weekday;

  return false;
end;
$$;

-- NATURALMENTE IDEMPOTENTE, sem request_id: só APAGA, e o critério é
-- reavaliado contra o estado atual sob a trava do plano. A segunda chamada não
-- acha o que apagar; uma chamada depois de o aluno registrar preserva a meta.
-- O pior caso (corrida com o registro) é segurado por `goal_entries_goal_fk`.
-- Apaga exatamente o que `generate_week` substituiria, e nada insere.
create or replace function public.clear_pending_goals(p_study_plan_id uuid, p_week_number integer)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_plan public.study_plans%rowtype;
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_plan from public.study_plans p
   where p.id = p_study_plan_id and p.teacher_id = v_uid
   for no key update;

  if not found or not public.is_teacher() or not public.is_teacher_of(v_plan.student_id) then
    raise exception 'Somente o professor do aluno limpa a semana dele.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.goals g
   where g.study_plan_id = v_plan.id
     and g.week_number = p_week_number
     and not app_private.goal_is_preserved(g.id, g.status);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- BUG-14: revogar de PUBLIC antes do grant nominal, inclusive nas de app_private,
-- que nascem executáveis pelo grantee vazio.
revoke all on function app_private.goal_is_preserved(uuid, public.goal_status)
  from public, anon, authenticated;
revoke all on function app_private.check_goal_batch_replay(public.goal_batches, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.week_replacement_preview(uuid, integer) from public, anon, authenticated;
revoke all on function public.generate_week(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.clear_pending_goals(uuid, integer) from public, anon, authenticated;

grant execute on function public.week_replacement_preview(uuid, integer) to authenticated;
grant execute on function public.generate_week(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.clear_pending_goals(uuid, integer) to authenticated;
```

Os gatilhos de `goals` continuam valendo dentro do definer:
`auth.jwt() ->> 'role'` é o JWT do chamador (o comentário de
`20260918120000:28-33` explica). Por isso, `protect_goal_notebook_block` confere
a meta de bateria como professor real.

As suítes de banco também mudam neste commit (detalhe em **Testes**):
`00_fixtures`, `01_grants`, `02_rls`, `03_goals` e `07_schema`.

A tabela "Estado dos dois lados" de **`docs/de-para-schema.md`** (`:926`) ganha
a coluna **06/10** e um parágrafo que nomeia a migration. Os valores abaixo são
os esperados; **meça** com as consultas de catálogo antes de escrever.

| | Esperado | Por quê |
|---|---|---|
| Tabelas / com RLS | 51 / 51 | + `goal_batches` |
| Colunas | 520 | + 6 |
| Policies | 120 | + `goal_batches_select` |
| Tipos enumerados | **20** | nenhum novo |
| CHECK constraints | 132 | + 2 em `goals`, + 1 em `goal_batches` |
| Foreign keys | 91 | + `goal_batches_study_plan_fk`; a de `goal_entries` é recriada |
| Índices | 161 | + PK e índice da FK |
| Views | 3 | |
| Gatilhos | 51 | |
| Funções | 34 | + 2 em `app_private`, + 3 em `public` |

Depois:

```bash
npm run db:test   # verde
npm run db:types  # commitar packages/database/src/schema.gen.ts
```

### 3. Contrato, validação e as duas implementações (um commit)

O contrato muda, e as duas implementações e a tela precisam compilar no mesmo
commit. `ReplaceMode` só é usado em `contract.ts:1064` e `:1070` e em
`routes/teacher/Goals.tsx:16`, `:99` e `:206` (conferido com `grep`). `.mode`
aparece em `teacher-goals.ts:162`, `:214` e `:225`, em `fixtures.ts:1447`,
`:1448` e `:1455` e em `fixtures.test.ts:472`, `:480`, `:499` e `:507`. **Por
isso a tela (passo 4) entra neste mesmo commit**, ou o `typecheck` quebra no
meio.

**`apps/web/src/lib/api/contract.ts`:**

- No cabeçalho, a lacuna 3 (`:50-52`) fica riscada e marcada "Resolvida em
  <data>": `generate_week` numa transação, o critério em
  `app_private.goal_is_preserved`, e `goal_entries_goal_fk` em `no action`.
- **Saem o `type ReplaceMode` (`:1064`) e o comentário dele (`:1052-1063`).**
- **Sai `GenerateWeekInput.mode` (`:1070`).**
- No lugar do comentário que sai, um comentário sobre `GenerateWeekInput` /
  `generateWeek` com a regra única:
  - fica a meta concluída e a com estudo registrado ou bateria;
  - sai a pendente, a pulada e a em andamento sem registro;
  - não existe modo que apague mais do que isso, e o porquê é a decisão de
    06/10/2026.
- `GenerateWeekPreview` (`:1082-1089`) **não ganha campo**. Muda só o comentário
  de `goalsPreserved`: "concluídas ou com estudo registrado: ficam de pé".
- O comentário de `clearPendingGoals` (`:1094`) passa a dizer: "apaga o que
  Gerar substituiria — pendentes, puladas e em andamento sem registro".

**`apps/web/src/lib/api/validation.ts`:**

```ts
/** Dez anos de semanas. É o mesmo número de `goals_week_number_check`. */
export const MAX_WEEK_NUMBER = 520;

export function checkWeekNumber(week: number, field = "weekNumber"): ApiError | null {
  if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK_NUMBER) {
    return invalid(
      field === "copyFromWeek"
        ? `A semana a copiar precisa ser um número inteiro de 1 a ${MAX_WEEK_NUMBER}.`
        : `A semana precisa ser um número inteiro de 1 a ${MAX_WEEK_NUMBER}.`,
      field,
    );
  }
  return null;
}

export function checkGenerateWeek(input: GenerateWeekInput): ApiError | null {
  return (
    checkWeekNumber(input.weekNumber) ??
    (input.copyFromWeek === undefined ? null : checkWeekNumber(input.copyFromWeek, "copyFromWeek"))
  );
}
```

Exporte também `MAX_WEEK_NUMBER` em `lib/api/index.ts:27`, ao lado de
`ACCESS_MONTHS`. A tela usa o número no `max`.

**`apps/web/src/lib/api/supabase/teacher-goals.ts`:**

- **O cabeçalho (`:1-19`) é reescrito.** Ele passa a dizer três coisas:
  - a prévia vem antes da escrita;
  - há um comportamento só (o que fica e o que sai);
  - o banco garante o critério (`generate_week` e `goal_entries_goal_fk`), e o
    adaptador não é mais "o único guardião".

  O item 3, sobre o `full` como caminho separado, sai.
- Saem `isPreserved` (`:42-45`), `existing` do `Context` (`:54`) e a consulta
  dele (`:75-81`).
- **`previewWeek`:**
  - valida antes de tudo:
    `const invalid = checkGenerateWeek(input); if (invalid) readFailure(invalid.message, "validation");`;
  - monta as linhas como hoje;
  - lê as contagens:
    ```ts
    const { data, error } = await supabase.rpc("week_replacement_preview", {
      p_study_plan_id: input.studyPlanId, p_week_number: input.weekNumber,
    });
    if (error) throwDb(error);
    const counts = data?.[0] ?? { goals_total: 0, goals_preserved: 0 };
    // goalsToReplace = goals_total - goals_preserved; goalsPreserved = goals_preserved
    ```
- **`generateWeek`:**
  - valida com `checkGenerateWeek` FORA do `once()`, como `grantAccess` faz em
    `teacher-students.ts:347-348`;
  - dentro do `once()`, continua lendo `context` e `build`;
  - continua recusando `rows.length === 0` com a frase de hoje;
  - troca o DELETE e o INSERT (`:211-248`, inclusive o `preservedPerDay`) por
    uma chamada:
    ```ts
    const { error } = await supabase.rpc("generate_week", {
      p_request_id: input.requestId,
      p_study_plan_id: input.studyPlanId,
      p_week_number: input.weekNumber,
      p_goals: rows.map(toPayload),
    });
    if (error) return failure<Week>(translateDbError(error));
    return done(await loadWeek(ctx.studyPlanId, input.weekNumber));
    ```
  - `toPayload(row): Json` (`import type { Json } from "@bora/database"`)
    devolve `weekday`, `weekday_name: WEEKDAY_NAMES[row.weekday - 1]!`,
    `day_position`, `type`, `subject`, `title`, `planned_minutes`, `lesson`,
    `block` e `notebook_block_id`. Os campos ausentes vão como `null`, nunca
    como `undefined`, porque o tipo `Json` não aceita `undefined`.
  - O `once()` fica: ele cobre o clique duplo sem ida ao servidor. A garantia,
    porém, é `goal_batches`. Diga isso no comentário, como em
    `teacher-students.ts:341-345`.
- **`clearPendingGoals`:**
  - chama `supabase.rpc("clear_pending_goals", { p_study_plan_id, p_week_number })`
    e depois `loadWeek`;
  - fica SEM `once()`, como `linkStudent` (`teacher-students.ts:317-328`);
  - o `requestId` continua na assinatura do contrato e não vai ao banco. Escreva
    por quê: a função é naturalmente idempotente, porque só apaga, e o pior caso
    é segurado por `goal_entries_goal_fk`.
  - O comentário de `:255-261`, que fala em "separada de replanejar", sai.

**`apps/web/src/lib/api/fixtures.ts` (`:1438-1476`)** fica com a mesma regra e
as mesmas frases.

- Um `isPreserved(row)` igual ao do banco:
  `row.status === "completed" || entriesOf(row.id).length > 0`. Nenhuma bateria
  da fixture aponta para meta; diga isso no comentário.
- `previewWeek`:
  - valida e, se for o caso, faz
    `return Promise.reject(new ApiThrownError("validation", invalid.message))`;
  - devolve `goalsPreserved` pelo predicado e
    `goalsToReplace = existing.length - preserved`;
  - sai o ramo `input.mode === "full"`.
- `generateWeek`:
  - valida fora do `once`;
  - remove só o que não é preservado (sem o `if (input.mode === "safe")`);
  - empurra as novas com `dayPosition` deslocada pela MAIOR posição que sobrou
    no dia.
- `clearPendingGoals` usa o mesmo `isPreserved(row)`.

### 4. A tela (no mesmo commit do passo 3)

**`apps/web/src/routes/teacher/Goals.tsx`:**

- **O modo sai.**
  - Saem o `import type ReplaceMode` (`:16`) e o `useState<ReplaceMode>`
    (`:99`).
  - Sai o `TextField select` "Substituição" (`:199-213`), com o testid
    `goals-mode`.
  - Sai o aviso do `full` (`:234-242`).
  - Sai o estado `confirming` (`:103`).
  - O bloco de botões (`:249-274`) fica com um só: `goals-generate` com
    "Gerar N metas", e "Descartar prévia". O testid `goals-confirm` deixa de
    existir.
  - `input()` não passa mais `mode`.
- **O comentário do topo (`:21-31`).** Sai o parágrafo "A SUBSTITUIÇÃO SEGURA É
  O PADRÃO… Replanejar semana inteira é caminho separado". No lugar, a regra
  única: gerar substitui só o que não foi feito, porque meta concluída e estudo
  registrado não se apagam.
- **Loader (`:38`).** Saia do `|| 1`. A ideia é que a recusa venha do contrato,
  com a frase, e não de uma troca silenciosa:
  ```ts
  const weekParam = params.get("semana") ?? "1";
  return { plans, planId, week: Number(weekParam), weekParam };
  ```
  O `TextField` da semana passa a mostrar `weekParam` (para não aparecer
  "NaN"), com `htmlInput: { min: 1, max: MAX_WEEK_NUMBER, step: 1, ... }`.
  O campo "Copiar da semana" ganha o mesmo `max`.
- **O request_id por prévia.** Troque o `preview` por um estado que guarda a
  prévia e a entrada que a produziu:
  ```ts
  const [pending, setPending] =
    useState<{ input: GenerateWeekInput; preview: GenerateWeekPreview } | null>(null);
  ```
  - `buildPreview` monta a entrada UMA vez, com `newRequestId()`, e grava as
    duas coisas.
  - `generate` chama `api.generateWeek(pending.input)`.
  - Em caso de falha, `pending` FICA: um novo clique em "Gerar" repete o mesmo
    id.
  - Mudar plano, semana ou cópia continua descartando, como já acontece em
    `setPreview(null)` nos `onChange`.
  - Monte a entrada a partir de `plan` já conferido, depois do
    `if (!plan) return`, e não com `plan!` num closure.
- **`PreviewPanel` (`:45-92`):** a nota de "Preservadas" (`:62`) vira
  "concluídas ou com estudo registrado". É o aviso que faltou no QA-01: a meta
  em andamento com 40 minutos aparece ali. Nenhum testid novo.

**Conflito com o PR 8**, que mexe nesta tela (`docs/plano-qa/pr-8-telas-e-casca.md`).

- Ele cita `Goals.tsx:209`, o `minWidth: 260` do seletor "Substituição", entre
  os selects de largura fixa. **Esse select deixa de existir aqui.** Quem
  implementar o PR 8 depois deste ignora o item; se o PR 8 entrar antes, este
  PR apaga o select junto com o ajuste.
- O `:166` (o select "Planejamento") continua, e é do PR 8.
- O passo 5 do PR 8 ("Gerar metas sem `plan!`", `:105-142`) se sobrepõe ao
  request_id por prévia deste passo. Quem mergear depois rebaseia, e o PR 8
  confere se o N-03 ainda reproduz.

### 5. Testes de ponta a ponta

Ver **Testes**. Neste commit:

- os ids F-PROF-10 e F-PROF-11 saem de "Fluxos que ainda não existem" e entram
  na seção "Professor" de `docs/fluxos-e2e.md`;
- dois comentários deixam de mentir:
  - `apps/e2e/tests/teacher.spec.ts:178-179` ("o banco NÃO a garante — o
    adaptador é o único guardião");
  - `apps/e2e/fixtures/scenario.ts:488-492` ("`apply_study_plan_batch` não foi
    portada"). O cenário continua por INSERT, porque monta metas fixas com
    sufixo e caderno, mas o motivo escrito precisa ser este.

### 6. Documentação

**`CLAUDE.md`:**

- Na tabela "A fronteira da escrita":
  - a linha de `goals` ganha "; gerar e limpar a semana passam por
    `generate_week` e `clear_pending_goals`";
  - uma linha nova: `goal_batches` | ninguém | SELECT para o professor dono;
    escrita é de `generate_week`.
- Um parágrafo novo, depois de "Turma é planejamento, e por isso NÃO tem RPC":
  **"Gerar a semana é planejamento, e TEM RPC."**
  - O motivo é que ela apaga e insere várias linhas, que precisam acontecer
    juntas ou não acontecer.
  - E um replay depois de sucesso não é inofensivo: a meta nova que ganhou
    registro seria preservada e duplicada.
  - Nenhuma das três defesas da escrita direta dá transação nem idempotência
    com payload.
  - Acrescente: gerar não apaga meta concluída nem estudo registrado, e não
    existe modo que apague.
- Em "Toda RPC mutante…", "As duas que existem" vira quatro:
  - `generate_week` entra em **Com payload**, sustentada pela PK
    `goal_batches.id`, que compara `(study_plan_id, week_number)`;
  - `clear_pending_goals` entra em **Naturalmente idempotente**: só apaga, e
    `goal_entries_goal_fk` segura o pior caso.
- Em "O que não pode sumir do histórico usa `ON DELETE RESTRICT`", acrescente:
  - `goal_entries_goal_fk` é `NO ACTION`, e não `RESTRICT`, para o apagamento
    de conta continuar passando (`07_schema`);
  - meta com registro não se apaga por caminho nenhum.

**`docs/arquitetura.md:151-154`:** um item dizendo que gerar e limpar a semana
passam por RPC, e por quê.

**`docs/comparativo-fluxos-v2.md:162`:** trocar `study_plan_batches` e os três
modos (`append`/`replace`/`replan`) por: `generate_week`, um comportamento só,
F-PROF-04/05/10.

**`docs/bugs-encontrados.md`:** se a seção `## Varredura de 06/10/2026` não
existir, crie-a no fim, com uma linha apontando para
`relatorio-qa-2026-10-06.md` e `plano-qa/README.md`.

- Entram três entradas, no formato das existentes: `### QA-01 · CRÍTICO · …`,
  `### QA-05 · ALTO · …` e `### QA-17 · BAIXO · …`.
- Cada uma tem **Reproduzir** e **Correção**, e cita o fluxo e2e.
- A do QA-01 registra que o modo "Replanejar semana inteira" foi removido, e
  por quê.

## Testes

### Banco (`npm run db:test`)

As suítes rodam em sequência na mesma base. A 03 cria o próprio cenário na
**semana 7** do plano do Bruno, e só no fim mexe na semana 1. Nenhuma suíte
depois da 03 usa as metas `a5…` (conferido: a 06 usa só os planos).

**`00_fixtures.sql`:** um lote para a 02 ler.

```sql
insert into public.goal_batches (id, study_plan_id, teacher_id, student_id, week_number) values
  ('ac000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',1);
```

**`01_grants.sql` (34).** Com `has_table_privilege('authenticated', 'public.goal_batches', …)`:
`select` é verdadeiro; `insert`, `update` e `delete` são falsos.

**`02_rls.sql` (18).** A suíte termina agindo como Davi, que conta 0 lotes.
Bruno também conta 0. Ana conta 1.

**`03_goals.sql`.** Preparação, como dono (`reset role; select app_test.act_as_owner();`):

- 0101: `pending`, sem registro, segunda-feira na posição 1;
- 0102: `in_progress`, com 1 registro, segunda-feira na posição 2;
- 0103: `completed`, sem registro, terça-feira na posição 1;
- 0104: `skipped`, sem registro, quarta-feira na posição 1.

Os ids são `a5000000-0000-4000-8000-0000000001NN` e, para o registro,
`a6000000-…-000000000102`. Depois: `set role authenticated`.

| # | Quem | Faz | Espera |
|---|---|---|---|
| 15 | Davi | `generate_week` no plano do Bruno | `insufficient_privilege`; a semana 7 continua com 4 metas |
| 16 | Bruno | `generate_week` no próprio plano | `insufficient_privilege` |
| 17 | Ana | `week_replacement_preview(plano, 7)` | `(4, 2)`; Davi recebe `insufficient_privilege` |
| 18 | Ana | `p_goals` com `"weekday": 9` | `check_violation`, e depois **4 metas e o registro de 0102 intactos**. É o QA-05 no banco, porque o delete já tinha rodado dentro da chamada |
| 19 | Ana | `p_goals = '[]'` e semana 0 | `raise_exception`, e nada muda |
| 20 | Ana | id R1, uma meta na segunda e uma na terça | retorno `false`; 0101 e 0104 somem; 0102 e 0103 ficam; a nova da segunda tem `day_position = 3`, a da terça tem `2` (CA-12, CA-22) |
| 21 | Bruno | insere `goal_entries` na meta nova da segunda | aceito (acesso vigente) |
| 22 | Ana | repete R1 com o mesmo payload | retorno `true`; a semana 7 continua com **4** metas. Sem `goal_batches` seriam 6: é o caso que o README chama de "replay não inofensivo" |
| 23 | Ana | R1 com semana 8 | `raise_exception` com `sqlerrm like '%outra semana%'` |
| 24 | Ana | id R2, uma meta | ficam 0102, 0103 e a nova com o registro do Bruno; sai a nova da terça (pendente); total 4 |
| 25 | Ana | `delete from public.goals where id = '…0102'` direto | `foreign_key_violation`, e o registro continua lá (CA-19, o caminho do bundle antigo) |
| 26 | Ana | `clear_pending_goals(plano, 7)` duas vezes | a primeira devolve 1 (a nova de R2); a segunda devolve `0`; 0102 e 0103 continuam |
| 27 | Ana | id R3, na **semana 1** | `a5…001` (bateria concluída de `00_fixtures`) e `a5…002` (registro) ficam. Esta vem por último porque apaga as extras da semana 1 |

O padrão do caso 22:

```sql
do $$
declare v_replay boolean; v_total integer;
begin
  v_replay := public.generate_week('ad000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 7,
    '[{"weekday":1,"weekday_name":"Segunda-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Nova de segunda","planned_minutes":60},
      {"weekday":2,"weekday_name":"Terça-feira","day_position":1,"type":"theory","subject":"Ciências Forenses","title":"Nova de terça","planned_minutes":60}]');
  select count(*) into v_total from public.goals
   where study_plan_id = 'a2000000-0000-4000-8000-000000000001' and week_number = 7;
  if not v_replay or v_total <> 4 then
    raise exception 'FALHOU: a retentativa reexecutou a geracao (replay %, % metas)', v_replay, v_total;
  end if;
  raise notice '22 OK  mesmo pedido depois de gravado devolve sem reexecutar';
end $$;
```

O cabeçalho da 03 ganha `generate_week`, `clear_pending_goals` e
`goal_entries_goal_fk` na lista do que sustenta a fronteira.

**`07_schema.sql`:**

| Teste | O que faz |
|---|---|
| 06 | Acrescenta `goal_batches_study_plan_fk` à lista e troca "catorze" por "quinze" |
| 08 | Acrescenta `generate_week`, `clear_pending_goals` e `week_replacement_preview` ao array e troca "tres" por "seis" |
| 13 | Usa **51 tabelas, 20 enums, 91 FKs e 3 views**: os enums não mudam. Os mesmos números vão para o de-para |
| 14 (novo) | Recusa, por `check_violation`, um INSERT em `goals` com `week_number` 0 e com 521, e outro com `planned_minutes` -1 |
| 15 (novo) | `confdeltype` de `goal_entries_goal_fk` é `'a'` (no action) |
| 16 (novo) | **O apagamento de conta continua passando.** Ver abaixo |

O teste 16 roda como dono, sem `set role`:

- cria um par novo em `auth.users` com os ids `c1000000-…-01` (a professora) e
  `c1000000-…-02` (o aluno);
- promove a professora, liga o aluno e cria um plano, uma meta e um registro;
- `delete from auth.users where id = <professora>` passa, e não sobra nenhum
  `goal_entries` dela;
- `delete from auth.users where id = <aluno>` passa;
- `exception when foreign_key_violation` levanta "FALHOU".

Se o teste 16 falhar, o `no action` não basta (ver **Armadilhas**).

### Unitários (`npm run check`, runner nativo, Node 24)

**`apps/web/src/lib/api/validation.test.ts`:** `checkWeekNumber` aceita 1 e 520.
Recusa 0, 521, -3, 1.5 e `NaN`, com a frase "1 a 520" e
`field: "weekNumber"`. `checkGenerateWeek` com `copyFromWeek: 0` aponta
`field: "copyFromWeek"`.

**`apps/web/src/lib/api/fixtures.test.ts`.** Dois testes mudam:

- `:461` perde o `mode` das duas chamadas e passa a se chamar "gerar a semana
  preserva o que já foi concluído". O resto continua igual.
- `:491` ("replanejar a semana inteira é o caminho que apaga a concluída")
  **sai**, porque o caminho não existe mais. No lugar entra "gerar preserva a
  concluída SEM registro, e tira a pulada e a pendente":
  1. conclui uma meta pendente com `api.completeGoal`, sem registro;
  2. pula outra com `api.skipGoal`;
  3. a prévia mostra `goalsPreserved === 2`;
  4. depois de gerar, as duas concluídas continuam e a pulada sumiu.

Três testes novos:

- "meta EM ANDAMENTO com estudo registrado sobrevive a gerar, e a prévia a
  conta": `api.recordStudy` numa meta pendente; a prévia mostra
  `goalsPreserved === 2`; depois de gerar, a meta continua `in_progress` com o
  registro.
- "semana fora de 1 a 520 é recusada nas duas operações": com 0, -3, 1.5 e 521,
  `previewWeek` rejeita com `ApiThrownError` de código `validation`, e
  `generateWeek` devolve `ok: false`. `loadWeek(1)` continua igual.
- "as novas entram depois das preservadas": nenhum par `(weekday, dayPosition)`
  se repete na semana gerada.

### Ponta a ponta (`apps/e2e/tests/teacher.spec.ts`)

**Pré-condição de registro.** Use `query("insert into public.goal_entries …")`,
como o F-PROF-05 já faz em `:165-169`. Não existe RPC de registro antes do PR 5a;
quando ela existir, a pré-condição migra para ela. A pré-condição de bateria não
existe no e2e, porque as RPCs de execução não foram portadas: ela fica só no
`03_goals`.

**F-PROF-05 · QA-01.** O título do `describe` (`:156`) passa a "F-PROF-05 ·
QA-01 · gerar a semana preserva o concluído e o estudo registrado".

- `:157` ("o modo seguro preserva a meta CONCLUÍDA e os registros dela")
  continua, só sem "modo seguro" no nome.
- **`:190-218` ("replanejar a semana inteira EXIGE confirmação, e aí apaga")
  sai inteiro.** Ele selecionava a opção "Replanejar", conferia o aviso e o
  `goals-confirm`, e afirmava que a concluída sumia. Nada disso existe depois
  deste PR.
- No lugar entra "meta EM ANDAMENTO com registro e meta CONCLUÍDA sem registro
  ficam; a prévia as conta; não há seletor de substituição":
  1. a primeira meta de teoria vai a `in_progress`, com 1 registro;
  2. a segunda meta de teoria vai a `completed`, sem registro;
  3. `goto("/professor/metas")`;
  4. `expect(teacherPage.getByRole("combobox", { name: "Substituição" })).toHaveCount(0)`
     (CA-23);
  5. Ver prévia;
  6. a métrica "Preservadas" mostra 2:
     ```ts
     const preservadas = testId(teacherPage, "metric").filter({ hasText: "Preservadas" });
     await expect(testId(preservadas, "metric-value")).toHaveText("2");
     await expect(preservadas).toContainText("com estudo registrado");
     ```
  7. `testId(teacherPage, "goals-confirm")` com `toHaveCount(0)`;
  8. Gerar;
  9. as duas continuam, com o status de antes, e o registro também; as duas
     metas de bateria do cenário (pendentes, sem bateria) saíram.

**F-PROF-10 · QA-05** (`describe` novo, com o cenário padrão de 5 metas):

```ts
test("a gravação que não chega ao banco deixa a semana como estava", async ({ teacherPage, scenario }) => {
  const ids = () => query<{ id: string }>(
    "select id from public.goals where study_plan_id = $1 and week_number = 1 order by id", [scenario.planId]);
  const antes = await ids();
  await teacherPage.goto("/professor/metas");
  await testId(teacherPage, "goals-preview").click();
  await expect(testId(teacherPage, "week-preview")).toBeVisible();

  await teacherPage.route("**/rest/v1/rpc/generate_week", (route) => route.abort(), { times: 1 });
  await testId(teacherPage, "goals-generate").click();
  await expect(alert(teacherPage, "error")).toBeVisible();
  expect(await ids()).toEqual(antes);

  // A mesma prévia, o mesmo pedido: agora grava.
  await testId(teacherPage, "goals-generate").click();
  await expect(alert(teacherPage, "success")).toContainText("Semana 1 gerada");
});

test("resposta perdida: repetir o mesmo pedido não grava a semana duas vezes", async ({ teacherPage, scenario }) => {
  // … prévia como acima …
  await teacherPage.route("**/rest/v1/rpc/generate_week", async (route) => {
    await route.fetch();   // o servidor grava
    await route.abort();   // a resposta não chega
  }, { times: 1 });
  await testId(teacherPage, "goals-generate").click();
  await expect(alert(teacherPage, "error")).toBeVisible();

  const gravadas = await count("select count(*) from public.goals where study_plan_id = $1 and week_number = 1", [scenario.planId]);
  // O aluno registra numa meta NOVA antes da retentativa: é o que faria uma reexecução duplicar.
  const nova = await one<{ id: string }>(
    "select id from public.goals where study_plan_id = $1 and week_number = 1 order by weekday, day_position limit 1",
    [scenario.planId]);
  await query("insert into public.goal_entries (goal_id, student_id, teacher_id, minutes) values ($1, $2, $3, 30)",
    [nova.id, scenario.student.id, scenario.teacher.id]);

  await testId(teacherPage, "goals-generate").click();
  await expect(alert(teacherPage, "success")).toBeVisible();
  expect(await count("select count(*) from public.goals where study_plan_id = $1 and week_number = 1", [scenario.planId])).toBe(gravadas);
  expect(await count("select count(*) from public.goal_batches where study_plan_id = $1", [scenario.planId])).toBe(1);
});
```

Não afirme o TEXTO do alerta de erro. Hoje a queda de rede chega como "TypeError:
Failed to fetch", e o PR 4 muda essa frase.

**F-PROF-11 · QA-17.** Para cada valor em `["0", "-3", "1.5", "99999"]`:

1. `goto(`/professor/metas?semana=${v}`)`;
2. Ver prévia;
3. `alert(page, "error")` contém "1 a 520";
4. `week-preview` com `toHaveCount(0)`;
5. `count(... week_number not between 1 and 520) === 0`.

## Critério de pronto

- [ ] `npm run check` verde.
- [ ] `npm run db:test` verde. Os avisos novos aparecem:
  - `03_goals`: 15 a 27;
  - `07_schema`: 14, 15 e 16, com 16 = "apagar a conta continua descendo por
    metas e registros";
  - `01_grants`: 34;
  - `02_rls`: 18.
- [ ] `npm run db:types` rodado. O diff de `packages/database/src/schema.gen.ts`
      só acrescenta `goal_batches` e as três funções de `public`. Nenhum enum
      novo.
- [ ] Este comando não devolve nada:
      ```bash
      grep -rn "ReplaceMode\|goals-confirm\|goals-mode\|Replanejar" apps/web/src apps/e2e/tests
      ```
- [ ] Este comando também não devolve nada:
      ```bash
      grep -n 'isPreserved\|from("goals").delete\|from("goals").insert' apps/web/src/lib/api/supabase/teacher-goals.ts
      ```
- [ ] `npm run db:reset` e depois
      `cd apps/e2e && npx playwright test --project=fast -g "F-PROF-0[4-6]|F-PROF-1[01]"`
      verdes.
- [ ] `npm run e2e` inteiro verde. A linha de base era 216 verdes e 4 `fixme`.
      O F-PROF-05 troca um teste por outro, e entram os de F-PROF-10 e
      F-PROF-11.
- [ ] Este comando devolve `a`:
      ```bash
      docker exec supabase_db_bora-estudar psql -U postgres -tAc \
        "select confdeltype from pg_constraint where conname='goal_entries_goal_fk'"
      ```
- [ ] Reprodução manual do QA-01 pela tela:
  1. o aluno registra numa meta de teoria e conclui outra sem registro;
  2. o professor abre Gerar metas: não há seletor de substituição;
  3. a prévia mostra "Preservadas 2";
  4. depois de gerar, as duas metas e o registro continuam na semana do aluno.
- [ ] Specs 03, 04 e 18 atualizadas, `fluxos-e2e.md` também (F-PROF-05, 10 e 11
      na seção Professor, e `goals-confirm` fora da tabela de testids).
      `CLAUDE.md`, `de-para-schema.md`, `bugs-encontrados.md` e a D-02 do
      README atualizados.
- [ ] Se tiver acesso ao SQL editor de staging, rode antes do merge a consulta
      abaixo, e ponha o número na descrição do PR (é o que a migration vai
      apagar):
      ```sql
      select count(*) from goals where week_number not between 1 and 520
      ```
      No banco local, em 06/10/2026, o resultado é 0.

## Armadilhas

- **`Goals.tsx:110` gera o id a cada clique.** Se `generate` continuar chamando
  `input()`, `goal_batches` vira decoração. É a regra "`request_id` gerado uma
  vez, na origem" do `CLAUDE.md`, e o F-PROF-10 é quem pega o deslize.
- **Tirar o `mode` quebra o typecheck em nove lugares** (ver passo 3). Por isso
  contrato, adaptador, fixtures, `fixtures.test.ts` e tela vão no mesmo commit.
- **O bundle no ar ainda oferece "Replanejar semana inteira"** nos minutos entre
  a migration e o site em staging. Com a FK nova, ele falha com `23503` na meta
  com registro, e apaga só o resto — inclusive a concluída sem registro, porque
  o critério dele mora no TypeScript antigo. É aceitável: staging só tem dado de
  teste.
- **Funções novas em `app_private` nascem executáveis por PUBLIC.** O
  `revoke all on all functions in schema app_private` da migration inicial só
  valeu para as funções daquela época. Sem o `revoke` explícito, o teste 04 da
  07 falha. Com o revoke mas sem a função na lista do teste 08, o grant de
  `public` fica sem conferência.
- **`set search_path = ''`.** Qualifique tudo: `public.goal_type` dentro do
  `jsonb_to_record`, `public.goal_status`, `app_private.*`.
- **A trava vem antes do replay.** Se o replay for consultado antes do
  `for no key update`, a retentativa que chega com a primeira ainda rodando não
  vê o lote. Ela então cai no `unique_violation`, que só a salva por acaso.
- **NO ACTION e apagamento de conta.** A expectativa: os cascades disparados de
  `profiles` são enfileirados antes da checagem de `goal_entries_goal_fk`, e por
  isso a conferência no fim do comando acha os registros já apagados.

  **O teste 16 da 07 decide.** Se ele falhar, não troque para `cascade`. A
  alternativa é esta:
  - a FK volta a `cascade`;
  - um gatilho `before delete` em `goals`, no molde de
    `protect_class_with_students` (`20260918120000:483-503`), recusa apagar meta
    com registro quando o ator é `authenticated`. A manutenção e o
    `service_role` passam.

  Registre a troca no `CLAUDE.md` e na spec 04 (R-GEN-14).
- **Apagar planejamento com registro passa a falhar com `23503`.** Nenhuma tela
  apaga planejamento, e o resultado é coerente com a D-02. Mesmo assim, diga
  isso na migration e na spec 04.
- **O `db:test` quebra o `global-setup` do e2e.** Rode `npm run db:reset` entre
  os dois. O `db:test` também apaga os usuários do seed.
- **N-01 (PR 4).** Até o PR 4, uma LEITURA que lança dentro do `once()`
  (`context`, `build`) prende o id para sempre. Por isso o F-PROF-10 derruba só
  `rpc/generate_week`, e nunca `rest/v1/goals` nem `study_plans`.
- **`translateDbError` não conhece `23514`.** Um `p_goals` inválido vira
  `unknown` e é relatado ao Sentry. É raro, porque o adaptador monta o payload,
  e quem traduz é o PR 4. Não acrescente o mapeamento aqui.
- **`count()` e `.all()` não esperam.** Espere o alerta antes de contar no
  banco. `teacherPage` e `studentPage` são a mesma aba: este PR não precisa de
  `studentPage`.
- **`07_schema` teste 13.** O número muda junto com a tabela do de-para, no
  mesmo commit, ou a asserção fica mentindo para o próximo. Os enums continuam
  20.
- **PR 3 também trava `study_plans`** (`activate_study_plan`, `for update`). Não
  há risco de deadlock: `generate_week` trava uma linha só, e nunca espera por
  outra linha de plano.

## Fora do escopo

- **Do PR 5a:** `goal_entries.request_id`, as CHECKs de `goal_entries` e
  `record_goal_entry`.
- Concluir, reabrir e pular por RPC.
- **Revogar o DELETE e o INSERT diretos do professor em `goals`.** Planejamento
  continua sendo escrita direta, e a FK protege o histórico.
- **Do PR 8:** N-03, `?plano=` inválido (D-13) e a largura dos selects que
  continuam na tela.
- **Do PR 4:** a frase de rede e a tradução de `23514`, `22P02` e `""`.
- **Do PR 7:** os tetos de texto em `subject` e `title`.
- **Gerar em planejamento pausado ou arquivado:** a tela só lista os ativos, e
  a RPC não decide isso.
- **`goals.batch_id`** (escolha 1).
- **Um botão para "Limpar pendentes"** (escolha 7).
- **Um caminho para apagar meta concluída ou com histórico.** Ele saiu por
  decisão, e voltar exige spec.
- Montar as metas do `createScenario` por `generate_week`.
