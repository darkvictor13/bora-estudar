# 12 — Conclusão de meta sem bateria

**Situação:** implementada · **Comparativo:** §12 item 1 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §2 · **Fluxos e2e:** F-META-03, F-META-04 e F-META-08

> **Atualizada em 14/09/2026.** `complete_goal` e `reopen_goal` não foram portadas para o schema de
> 14/09/2026. A conclusão passou a ser escrita direta em `goals`, sustentada
> pelo grant por coluna e pelos gatilhos de `app_private` — o COMPORTAMENTO
> descrito aqui continua valendo; a superfície é que mudou.

> **Atualizada em 06/10/2026 (QA-04, QA-07, QA-10, QA-28, N-05).** Registrar estudo passou a ser a RPC
> `record_goal_entry` (R-CONC-21 a R-CONC-27): idempotente por `goal_entries.request_id`, com os limites
> de D-04 em CHECK, e o aluno com o acesso vencido deixa de concluir, reabrir, pular e apagar. As regras
> de 01 a 20 acima descrevem as RPCs `complete_goal` e `reopen_goal`, que não existem neste schema;
> concluir, reabrir e pular continuam escrita direta em `goals` (R-CONC-01 segue como dívida).

---

## Problema

O aluno não tem como dizer que estudou.

Toda semana montada pelo professor mistura tipos de meta. A semana 1 do seed tem
cinco: duas de teoria, duas de bateria e uma de estudo extra. **Só as duas de
bateria têm como ser fechadas** — e mesmo essas não fecham por decisão do aluno,
e sim como efeito de `record_quiz_session_time`. As outras três ficam
`pending` para sempre, porque nenhuma action da web escreve em `goals` e o aluno
não tem grant nenhum nessa tabela.

O custo é maior do que "uma linha na tela fica amarela". A contagem "X de Y metas
concluídas" que o aluno vê, o `progress.completed` da ficha do professor e a
classificação de ritmo que o professor usa para decidir onde intervir saem todos
de `goals.status`. Com três quintos das metas travadas em `pending`, esses
números descrevem o produto, não o aluno: quem estudou a teoria inteira e não
abriu bateria nenhuma aparece com 0% de progresso. O professor lê isso como
abandono.

A versão anterior resolvia isso com **`UPDATE` direto do navegador na tabela de
metas** (`patchMetaAlunoDiretoSupabase`, aluno.js:4969), gravando de uma vez
`status`, `tempo_gasto_minutos`, `questoes_feitas`, `acertos` e `concluida_em`. É
o mesmo caminho por onde o aluno também apagava meta e alterava o resultado de
bateria já respondida — três escritas de naturezas diferentes na mesma porta.
Aqui a porta não existe, e é por isso que o problema aparece.

Um detalhe da v96 vale ser preservado, porque ela acertou: **bateria concluída
não podia ser desfeita pelo aluno** (aluno.js:2915). O comentário dizia que
correção de resultado é "fluxo próprio" — que é a anulação pelo professor.
Desfazer vale para o que o aluno afirmou, nunca para o que o ledger registrou.

---

## Regras

### Máquina de estados

Só duas transições existem nesta feature. As demais continuam sendo de quem já
as fazia.

| De | Para | Quem | Como |
|---|---|---|---|
| `pending` | `completed` | aluno dono | `complete_goal` |
| `completed` | `pending` | aluno dono | `reopen_goal` |
| `pending` → `in_progress` → `completed` | — | aluno dono | bateria: `start_quiz_session` + `record_quiz_session_time` |
| `completed` | `pending` | professor | `void_quiz_session`, só para meta de bateria |

`goal_completion_consistent` — a `check` que já existe — garante que
`status = 'completed'` e `completed_at is not null` andem sempre juntos, nos dois
sentidos. Nenhuma das duas RPCs pode produzir um estado que a viole.

### Quem escreve, e por onde

| Id | Regra |
|---|---|
| R-CONC-01 | Concluir meta é **execução**, não planejamento: muda `goals.status`, a mesma coluna que `record_quiz_session_time` e `void_quiz_session` escrevem. Vai por **RPC**. Nenhum grant novo é concedido ao aluno em `goals` — a tabela continua com `insert`/`update` só para o professor, restrita por `WITH CHECK` e por grant de coluna. |
| R-CONC-02 | `complete_goal` e `reopen_goal` aceitam **qualquer `goal_type` exceto `question_block`** — `theory`, `extra_study` e `reinforcement`. Meta de bateria conclui-se pela bateria; a RPC recusa com `meta de bateria conclui-se pela bateria`. É o que impede fechar uma meta de questões sem passar pelo ledger. |
| R-CONC-03 | Só **o aluno dono** conclui ou reabre: `student_id <> auth.uid()` levanta `42501`. O professor não conclui pelo aluno — quem afirma ter estudado é quem estudou. |
| R-CONC-04 | Exige o planejamento em `active`, como `start_quiz_session`. Meta de planejamento arquivado não fecha, e a mensagem diz por quê. |
| R-CONC-05 | `complete_goal` exige a meta em `pending`. `completed`, `skipped` e `cancelled` são recusados fora do replay. `in_progress` também: esse estado só existe para meta de bateria, posto por `start_quiz_session`. |
| R-CONC-06 | `reopen_goal` exige a meta em `completed` **e** sem nenhuma bateria em estado diferente de `cancelled`/`voided`. A segunda condição é cinto e suspensório: `R-CONC-02` já barra `question_block`, mas a checagem torna impossível reabrir por engano uma meta que tenha ledger atrás dela. |
| R-CONC-07 | Meta com `deleted_at` não é encontrada por nenhuma das duas. |

### O que é gravado

| Id | Regra |
|---|---|
| R-CONC-08 | `complete_goal` grava `status='completed'`, `completed_at=now()`, `spent_minutes` e `student_note`. Não grava questões nem acertos: **desempenho vem do ledger, e meta sem bateria não tem ledger**. É a regra que a v96 quebrava ao deixar o aluno digitar `questoes_feitas` e `acertos` à mão. |
| R-CONC-09 | `goals.spent_minutes` é **coluna nova, `integer`, nullable**, com `check (spent_minutes is null or spent_minutes between 1 and 240)`. Nasce nullable e sem default, então é compatível com o bundle que já está no ar. |
| R-CONC-10 | O limite de **240 minutos** é o da v96 (`interpretarTempoRegistro`, aluno.js:2748). `record_quiz_session_time` continua aceitando até 1440 para bateria — os dois números divergem de propósito nesta entrega: mexer no limite da bateria é mudança na spec [05](05-bateria-inteligente.md), já implantada, e não cabe aqui. **Suposição registrada para revisão humana.** *(06/10/2026: `record_quiz_session_time` não existe neste schema. O tempo da bateria é `quiz_sessions.duration_minutes`, e o teto de `goal_entries` não o alcança.)* |
| R-CONC-11 | O tempo é obrigatório em `complete_goal`. Uma meta concluída sem tempo não alimenta nenhum dos números que o professor lê, e a v96 também o exigia. |
| R-CONC-12 | `student_note` é **o único campo de texto livre desta feature** — texto que humano escreve para humano ler. Vazio vira `null` (`nullif(btrim(...),'')`) e o tamanho é limitado por `check (length(student_note) <= 2000)`. Nenhum metadado é codificado nele: era ali que a v96 escrevia `TIPO_REFORCO:1` e o resultado da bateria em base64. |
| R-CONC-13 | `reopen_goal` volta a meta a `pending`, zera `completed_at` e `spent_minutes`, e **preserva `student_note`**. O que o aluno escreveu sobre o estudo continua valendo; o que se desfaz é a afirmação de que terminou. |
| R-CONC-14 | As duas operações entram no `audit_log` pelo gatilho `tg_goals_auditoria`, que já existe. Nenhuma tabela nova de histórico é criada. |

### Idempotência

| Id | Regra |
|---|---|
| R-CONC-15 | As duas RPCs carregam payload e passam por **`reserve_operation`**: `complete_goal` com hash de `goal_id \| spent_minutes \| student_note`, `reopen_goal` com hash de `goal_id`. Mesmo `request_id` com mesmo payload devolve o estado anterior sem reexecutar; payload diferente é recusado com `23505`. |
| R-CONC-16 | O `request_id` é **gerado uma vez, na origem**, e reusado em toda retentativa — a terceira ordenação do `CLAUDE.md`. Um duplo clique que reenvie o formulário chega ao banco como a mesma operação. |
| R-CONC-17 | As duas funções declaram `set search_path = ''`, levam `revoke execute ... from public` e só então recebem `execute` nominal para `authenticated`. |

### Onde o número aparece

| Id | Regra |
|---|---|
| R-CONC-18 | `vw_goal_performance.minutes_spent` passa a ser `coalesce(sum(s.duration_minutes), g.spent_minutes)`: o tempo da bateria quando há bateria, o tempo declarado quando não há. Nome, tipo e posição da coluna não mudam, então `create or replace view` basta — inserir coluna no meio exigiria `drop` e `create`. O `with (security_invoker = true)` é **repetido** no `create or replace`: sem ele a view volta a rodar com privilégio do dono e vaza dado entre alunos. |
| R-CONC-19 | `questions_answered` e `correct_answers` da mesma view continuam vindo **só do ledger** e continuam `0` para meta sem bateria. Meta de teoria não tem desempenho, tem tempo. |
| R-CONC-20 | Nenhum contador é mantido à mão. "X de Y metas concluídas", o `progress.completed` da ficha do professor e a classificação de ritmo continuam derivando de `goals.status`, que é o que estas RPCs movem. |

### O registro de estudo (QA-04, QA-07, QA-10, QA-28)

Acrescentado em 06/10/2026. Vale para o schema de 14/09/2026, em que o estudo do aluno é uma linha em
`goal_entries`.

| Id | Regra |
|---|---|
| R-CONC-21 | Registrar estudo é **`record_goal_entry`**: insere em `goal_entries` e passa a meta de `pending` para `in_progress` na mesma transação. Recusa meta com `notebook_block_id` (a de bateria se registra pela bateria), meta de outro aluno (`P0002`, sem revelar que ela existe) e aluno sem acesso vigente (`42501`). |
| R-CONC-22 | Idempotência **com payload**, sustentada por `goal_entries_request_uidx`. O payload são as colunas do próprio registro (`goal_id`, `minutes`, `questions`, `correct_answers`, `note`, `manual_lesson`, `theory_stage`): mesma chave e mesmo payload devolve o registro anterior sem gravar de novo, e mesma chave com outro payload é recusada com `23505`. |
| R-CONC-23 | Os limites de D-04, nas CHECKs `goal_entries_minutes_check` (0 a 240), `goal_entries_questions_check` (0 a 500), `goal_entries_correct_answers_check` (0 a `questions`) e `goal_entries_not_empty_check` (tempo ou questões). As frases moram em `checkStudyEntry`, que as duas implementações do contrato chamam. |
| R-CONC-24 | **Concluir, reabrir, pular e apagar exigem acesso vigente:** `has_active_access()` no `WITH CHECK` de `goals_update` e no `USING` de `goals_delete` e de `goal_entries_delete`. O UPDATE barrado levanta `42501`; o DELETE barrado afeta zero linhas, e o adaptador conta. |
| R-CONC-25 | O aluno não escreve `spent_minutes`, `questions_answered` nem `correct_answers` de meta sem bateria: o resultado sai dos registros. Quem impede é `protect_goal_planning_fields`; a meta de bateria é de `protect_goal_quiz_result`. |
| R-CONC-26 | `record_goal_entry` grava `studied_on` **nulo**: registrar numa meta é "estudei agora", e o dia do registro é o dia local de `created_at`. A data escolhida existe só no estudo extra (spec [19](19-estudo-extra-avulso.md), R-EXTRA-28). |
| R-CONC-27 | **`goal_entries` não tem INSERT nem UPDATE para `authenticated`** — aluno e professor. O registro nasce numa das três RPCs (`record_goal_entry`, `record_extra_study`, `record_initial_questions`) e não se edita: corrigir é apagar e registrar de novo. O professor não tem tela que registre, e quem afirma ter estudado é quem estudou (D-19). O que sobra é SELECT e o DELETE da policy, com acesso vigente para o aluno (R-CONC-24). Fecha o caminho direto que o bundle anterior ao QA-04 ainda usava (PR 5c, 06/10/2026). |

---

## Fluxo

```
aluno abre /aluno, semana N
      │
      ├─ meta de bateria  ──► StartQuizButton (spec 05), inalterado
      │
      └─ meta de teoria / estudo extra / reforço
               │
               ├─ formulário: tempo (obrigatório) + observação (opcional)
               │
               ├─ requestId gerado UMA vez, aqui
               │
               ▼
         complete_goal(goal_id, request_id, minutes, note)
               │
               ├─ reserve_operation ──► replay? devolve o estado, não reexecuta
               ├─ dono? plano active? tipo ≠ question_block? status = pending?
               │        └─ não ──► raise exception ──► tradução para o aluno
               │
               ├─ UPDATE goals: completed, completed_at, spent_minutes, student_note
               └─ gatilho tg_goals_auditoria grava em audit_log
               ▼
      contagem da semana, ficha do professor e minutes_spent
      passam a incluir a meta — todos derivados, nenhum contador escrito

      [desfazer] ──► reopen_goal(goal_id, request_id)
               └─ volta a pending, zera tempo, PRESERVA a observação
```

A ordem entre gerar o `requestId` e enviar não é decorativa: gerá-lo dentro do
`onClick` do botão, a cada tentativa, transforma a proteção do servidor em
decoração. É a mesma armadilha que `batchIdFor` resolve na geração da semana.

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno` — a tabela da semana já existe; ganha a ação por linha |
| Componentes | `CompleteGoalForm` (tempo + observação) e o botão de desfazer, em `components/student/` |
| Actions | `completeGoal` e `reopenGoal`, em `lib/data/goal-actions.ts` |
| Leitura | `getWeekGoals` passa a trazer `spent_minutes` e `student_note` |
| RPCs | **duas novas:** `complete_goal(uuid, uuid, integer, text)` e `reopen_goal(uuid, uuid)` |
| Migration | **uma:** `goals.spent_minutes` + `check` de `student_note` + `create or replace view vw_goal_performance` + as duas funções, com `revoke`/`grant` |
| Banco | `goals` (coluna nova), `vw_goal_performance` (expressão de uma coluna), `operations` (via `reserve_operation`), `audit_log` (via gatilho existente) |
| Protocolo | **nada muda** — a extensão não participa |
| Testes | `supabase/tests/03_goals.sql`, `apps/e2e/tests/student-week.spec.ts` |

**Reuso de `parseDuration`.** O `"80"`/`"1:20"` já é entendido por
`lib/domain/goals.ts`, escrito para o registro de tempo da bateria. A mesma
função serve aqui; o que muda é o teto validado.

**Por que não é grant de coluna para o aluno.** Seria a alternativa barata:
`grant update (status, completed_at, spent_minutes, student_note) on goals to
authenticated` mais uma policy `student_id = auth.uid()`. Ela abre um segundo
caminho de escrita para `goals.status` — o primeiro é `record_quiz_session_time`
— e nada impediria o aluno de fechar uma meta `question_block` sem ledger, que é
exatamente o estado que `quiz_session_goal_uidx` e a máquina de estados da
bateria existem para tornar inexprimível.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Concluir uma meta de teoria com tempo grava `completed`, `completed_at` e `spent_minutes`, e a linha passa a aparecer como concluída sem recarregar | F-CONC-01 |
| CA-02 | A contagem "X de Y metas concluídas" da semana e o `progress.completed` da ficha do professor sobem junto — nenhum dos dois é escrito à mão | F-CONC-02 |
| CA-03 | O tempo aceita `80` e `1:20`; `0`, `241` e texto sem número são recusados com mensagem em português, e nada é gravado | F-CONC-03 |
| CA-04 | A observação do aluno é gravada, exibida na linha e sobrevive a desfazer | F-CONC-04 |
| CA-05 | Desfazer volta a meta a `pending`, zera tempo e `completed_at`, e a contagem da semana desce | F-CONC-05 |
| CA-06 | Meta de bateria **não** oferece o formulário de conclusão; chamada direta à RPC com meta `question_block` é recusada | F-CONC-06 + **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-07 | Reenviar o mesmo `request_id` com o mesmo payload devolve o estado anterior sem segunda gravação; com payload diferente é recusado com `23505` | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-08 | O aluno não conclui nem reabre meta de outro aluno: `42501`, e a meta alheia fica intacta | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-09 | Planejamento fora de `active` recusa as duas operações | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-10 | Meta já `completed` recusa `complete_goal`, e meta `pending` recusa `reopen_goal` — fora do caminho de replay | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-11 | `vw_goal_performance.minutes_spent` devolve o tempo declarado para meta sem bateria e continua devolvendo o da sessão para meta de bateria; `questions_answered` continua `0` na primeira | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-12 | O aluno continua **sem** `insert`, `update` e `delete` em `goals`: a escrita direta é recusada, e `delete` não é concedido | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-13 | As duas funções não têm `execute` para `public`; `authenticated` tem, nominalmente | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-14 | `spent_minutes` recusa `0`, negativo e `241` no próprio banco, mesmo por fora da RPC | **sem cobertura**: `complete_goal` e `reopen_goal` não foram portadas |
| CA-15 | Registrar estudo grava uma linha só mesmo quando a resposta se perde e a pessoa tenta de novo; mesma chave com outro payload é recusada | F-META-03 e `03_goals.sql` |
| CA-16 | Minutos fora de 0 a 240, questões fora de 0 a 500, acertos acima das questões e registro todo zerado são recusados com a frase da regra, e nada é gravado | F-META-03, `07_schema.sql` e `validation.test.ts` |
| CA-17 | Aluno com acesso vencido não conclui, reabre, pula nem apaga, e a tela diz que o acesso venceu | F-META-08 e `03_goals.sql` |
| CA-18 | O aluno não escreve o resultado de meta sem bateria | `03_goals.sql` |
| CA-19 | `record_goal_entry` recusa meta de bateria, meta alheia e acesso vencido, cada uma com o seu SQLSTATE | `03_goals.sql` |

---

## Fora de escopo

- **Registrar estudo extra avulso**, criado pelo aluno fora da semana montada
  pelo professor. A v96 permitia (`salvarEstudoExtra`, aluno.js:2367) e é a
  metade que faltou aqui: exigiria uma terceira RPC — que **criaria** meta em vez
  de concluir — mais o enum de `extra_activity` com os sete tipos. O portão de
  escopo do fluxo de spec corta em duas RPCs novas. Entra na fila do inventário
  como spec própria, depois da autonomia do professor: a semana do professor já
  tem meta de estudo extra, e concluí-la é o que destrava o seed hoje.
- **Questões e acertos digitados à mão.** A v96 deixava, e o resultado era o
  ledger disputando o mesmo número com o teclado do aluno. Desempenho vem de
  `quiz_session_questions`, sem exceção.
- **Desfazer bateria concluída.** É `void_quiz_session`, do professor, e ganha
  tela na spec de anulação. A v96 já separava as duas coisas.
- **Professor concluir a meta pelo aluno.** Quem afirma ter estudado é quem
  estudou. Se aparecer necessidade real — aluno sem acesso ao sistema, correção
  de lançamento —, entra como RPC própria com autorização explícita, nunca
  afrouxando `R-CONC-03`.
- **Marcar meta como pulada ou cancelada.** `skipped` e `cancelled` existem no
  enum e nada os escreve. Enquanto não houver decisão de produto sobre o que
  significam para o desempenho, continuam sem caminho.
- **Alterar o tempo de uma meta já concluída** sem desfazer antes. Desfazer e
  concluir de novo faz o mesmo, com duas linhas no `audit_log` em vez de uma
  edição silenciosa.
- **Anexar arquivo ou link de comprovação.** `external_link` é do professor.
