# 16 — Histórico de baterias e anulação

**Situação:** implementada · **Comparativo:** §12 item 6 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §6 e §9 · **Fluxos e2e:** F-ANUL (em `fixme`)

> **Atualizada em 14/09/2026.** `void_quiz_session` não foi portada e `quiz_sessions` é SELECT: anular
> **precisa nascer como RPC**, e `F-ANUL` está `fixme`. O histórico, que é
> leitura, continua na ficha do aluno.

---

## Problema

Um resultado errado fica para sempre.

O aluno abre a bateria por engano e responde no automático. A extensão registra
o resultado de uma questão que ele já tinha resolvido antes. O celular fica sem
rede no meio e ele reabre em outro aparelho. Em qualquer um desses casos, quinze
questões entram no ledger, a meta fecha, e o número passa a mentir — para o
aluno, que vê um desempenho que não é dele, e para o professor, que decide onde
intervir olhando esse número.

Não existe caminho. O ledger é append-only por gatilho, e é para ser: era
justamente o desfazer improvisado que a versão anterior fazia com `UPDATE` na
meta. O que existe, e ninguém chama, é `void_quiz_session` — a RPC que anula sem
apagar. Ela está pronta desde a migration inicial, testada em
`supabase/tests/`, e é a última das três RPCs órfãs do GAP-02.

**E o professor não vê as baterias do aluno.** A ficha em
`/professor/alunos/:studentId` mostra três números agregados — metas concluídas,
desempenho oficial, semanas planejadas. Não há lista de baterias, então não há
onde apontar para dizer "esta aqui não conta". A anulação precisa dessa lista
para existir, e a lista tem valor por si: é como o professor confere o que o
aluno andou fazendo.

A v96 tinha as duas coisas (`abrirBateriasAluno` e `anularBateriaAluno`,
professor.js:3962 e 3979) e vale copiar dela duas decisões: o botão de anular
aparece **só** para bateria finalizada, e o motivo é pedido — com
"Anulação administrativa" como texto padrão quando o professor não escreve nada.

---

## Regras

### O que a RPC já garante, e esta spec não reimplementa

| Id | Regra |
|---|---|
| R-ANUL-01 | Anular é `void_quiz_session(p_quiz_session_id, p_request_id, p_reason)`, que **já existe**. Nenhuma linha desta spec repete as verificações dela no cliente. |
| R-ANUL-02 | **Só o professor responsável** anula: `teacher_id <> auth.uid()` levanta `42501`. |
| R-ANUL-03 | **Só bateria finalizada** é anulável — `completed` ou `awaiting_time`. `in_progress` não: para essa existe cancelar, que é do aluno. `cancelled` já está fora do desempenho. |
| R-ANUL-04 | A anulação é **idempotente por `request_id` + `reserve_operation`**, com hash de `quiz_session_id \| motivo`; e a RPC ainda devolve cedo se a sessão já está `voided`. |
| R-ANUL-05 | **Nada é apagado.** O ledger fica intacto: as linhas de `quiz_session_questions` continuam lá. O que muda é o status da sessão, e é o status que tira o registro de todas as leituras — `vw_quiz_session_performance` filtra `status = 'completed'`, e `vw_seen_questions` também. |
| R-ANUL-06 | A meta **volta a `pending`**, com `completed_at` nulo, e pode ser refeita. `quiz_session_goal_uidx` ignora `cancelled` e `voided`, então a bateria nova encontra o slot livre. |
| R-ANUL-07 | O número visível do bloco é **liberado**: `quiz_session_number_uidx` também ignora `voided`, então a próxima bateria reemite o mesmo `session_number`. |
| R-ANUL-08 | O motivo é **texto livre de humano para humano**, guardado em `void_reason` e normalizado com `nullif(btrim(...),'')`. Vazio na tela vira o padrão `Anulação administrativa`, que é o texto da v96. Nenhum metadado é codificado nele. |

### O que esta spec acrescenta

| Id | Regra |
|---|---|
| R-ANUL-09 | A ficha do aluno passa a listar **as baterias dele**, da mais recente para a mais antiga, com bloco, número, situação, desempenho oficial e tempo. A leitura é permitida por `quiz_sessions_read`, que usa `can_view_context(student_id, teacher_id)` e já cobre o professor. |
| R-ANUL-10 | O desempenho de cada linha vem de `vw_quiz_session_performance` — `main_correct` sobre `main_count`. Nenhum número é recalculado na tela nem guardado em coluna. |
| R-ANUL-11 | O botão de anular aparece **apenas** nas linhas `completed` e `awaiting_time`, espelhando `R-ANUL-03`. A tela não oferece um caminho que o banco recusa. |
| R-ANUL-12 | Bateria anulada continua na lista, com a situação "Anulada" e o motivo visível. Sumir com ela esconderia justamente o que o professor precisa auditar depois. |
| R-ANUL-13 | O `request_id` é gerado **uma vez por submissão**, na tela. Um duplo clique chega ao banco como a mesma operação. |

---

## Fluxo

```
professor abre /professor/alunos/:studentId
      │
      └─ cartão "Baterias" — todas as do aluno, mais recente primeiro
             bloco · nº · situação · acertos/principais · tempo · motivo
             │
             ├─ linha `completed` ou `awaiting_time` ──► [Anular]
             │        │
             │        ├─ motivo (opcional; vazio vira "Anulação administrativa")
             │        ├─ requestId gerado UMA vez, aqui
             │        ▼
             │   void_quiz_session(id, requestId, motivo)
             │        ├─ reserve_operation ──► replay devolve o estado
             │        ├─ é o professor responsável? está finalizada?
             │        ├─ status = 'voided', voided_at, voided_by, void_reason
             │        └─ a meta volta a 'pending', completed_at = null
             ▼
   o ledger continua INTACTO; o que muda é o status
      ├─ vw_quiz_session_performance filtra completed → sai do desempenho
      ├─ vw_seen_questions filtra completed → as questões voltam a ser inéditas
      ├─ quiz_session_goal_uidx ignora voided → a meta pode ser refeita
      └─ quiz_session_number_uidx ignora voided → o número é reemitido
```

A consequência do meio dessa lista é a que o professor precisa entender antes de
clicar, e a tela diz: **as questões da bateria anulada voltam a ser inéditas**.
Não é efeito colateral, é o ponto — se o resultado não conta, o motor de seleção
não deve tratá-las como já vistas.

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/alunos/:studentId` — ganha o cartão "Baterias" |
| Componentes | `VoidSessionForm`, em `components/teacher/` |
| Actions | `voidQuizSession`, em `lib/data/teacher-actions.ts` |
| Leitura | `getStudentSessions`, juntando `quiz_sessions` e `vw_quiz_session_performance` |
| RPCs | **nenhuma nova.** `void_quiz_session` já existe |
| Migration | **nenhuma** |
| Banco | `quiz_sessions` e `vw_quiz_session_performance`, leitura; escrita só pela RPC |
| Protocolo | **nada muda** |
| Testes | `apps/e2e/tests/teacher.spec.ts` |

**Por que não há teste novo em `supabase/tests/`.** `void_quiz_session` já é
exercitada em `01_flow.sql`, incluindo o replay e a volta da meta a `pending`.
O que falta provar é o comportamento de tela e a propagação para os números —
que é e2e por natureza.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A ficha do aluno lista as baterias dele com bloco, número, situação e desempenho oficial, da mais recente para a mais antiga | F-ANUL-01 |
| CA-02 | Anular uma bateria concluída muda a situação para "Anulada", mostra o motivo, e **o ledger continua com as mesmas linhas** | F-ANUL-02 |
| CA-03 | Depois de anular, o desempenho oficial do aluno na ficha e nas estatísticas **desce**, e a meta volta a "Pendente" para o aluno | F-ANUL-03 |
| CA-04 | As questões da bateria anulada voltam a ser inéditas: a bateria seguinte do bloco pode escolhê-las de novo | F-ANUL-04 |
| CA-05 | Bateria `in_progress` não oferece o botão; motivo vazio grava "Anulação administrativa" | F-ANUL-05 |

---

## Fora de escopo

- **Anular pelo aluno.** Cancelar em andamento é dele (F-BAT-15); anular
  resultado registrado é do professor. A v96 separava as duas, e o comentário
  dela dizia que correção de resultado é "fluxo próprio".
- **Desanular.** `voided` é terminal, como `cancelled`. O que se refaz é a
  bateria, não o registro anulado — a meta volta a `pending` e o aluno responde
  de novo, o que produz um registro novo e auditável em vez de um estado
  reeditado.
- **Editar o resultado de uma bateria.** É o que a v96 fazia com `UPDATE` na
  meta e é a razão de o ledger ser append-only por gatilho.
- **Anular em lote.** Um clique que apaga o desempenho de uma semana inteira é
  fácil de errar e difícil de auditar.
- **Avisar o aluno.** Ele vê a meta voltar a pendente. Notificação é superfície
  nova, com fila e reenvio.
- **Histórico de baterias para o próprio aluno.** A tela dele mostra a semana e
  as estatísticas; uma lista cronológica de baterias é outra tela, e ninguém
  pediu.
