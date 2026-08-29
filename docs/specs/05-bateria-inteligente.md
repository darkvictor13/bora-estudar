# 05 — Bateria inteligente

**Situação:** implementada · **Fluxos e2e:** F-BAT-01 a F-BAT-19

---

## Problema

É o fluxo mais caro do produto. Uma bateria custa cerca de uma hora de estudo do
aluno, atravessa três contextos que não compartilham memória — o site, o content
script no TEC, e o site de novo — e o dado que ela produz **não pode ser
recriado**: a pessoa não vai responder as mesmas quinze questões de novo só
porque uma gravação falhou.

A versão anterior perdeu bateria já respondida de três maneiras distintas, e
cada uma virou uma ordenação que não pode inverter (`CLAUDE.md`):

1. limpava a hash antes de confirmar a gravação — e a hash era a única cópia;
2. navegava sem aguardar o `storage.set` — `location.assign` derruba o content
   script e leva o `storage` pendente junto;
3. gerava o `request_id` no ponto de uso — cada retentativa chegava ao banco
   como operação nova, e a proteção do servidor virava decoração.

---

## Regras

### Abertura

| Id | Regra |
|---|---|
| R-BAT-01 | **Uma bateria aberta por planejamento**, garantido pelo índice parcial `open_quiz_session_uidx` sobre `status in ('in_progress','awaiting_time')`. Não é só validação da RPC. |
| R-BAT-02 | `start_quiz_session` é **naturalmente idempotente**: a segunda chamada para a mesma meta devolve a sessão já aberta. Por isso a retomada é avaliada **antes** da validação da meta — a primeira chamada moveu a meta para `in_progress`, e exigir `pending` faria a segunda falhar. |
| R-BAT-03 | Chamar para **outra** meta com bateria aberta levanta `ja existe uma bateria aberta neste planejamento`. |
| R-BAT-04 | `main_target` é **15**, fixo em `start_quiz_session`. A coluna aceita de 1 a 50; nenhuma tela escolhe. |
| R-BAT-05 | Só o aluno dono abre: `somente o aluno pode iniciar a bateria`, `42501`. |
| R-BAT-06 | O planejamento precisa estar `active` e o bloco precisa estar `active` e não excluído. |
| R-BAT-07 | A meta precisa ser `question_block`, `pending` e do bloco pedido. |
| R-BAT-08 | `session_number` é o número visível do bloco e **não é consumido** por bateria cancelada ou anulada (`quiz_session_number_uidx`). `execution_sequence` conta todas. |
| R-BAT-09 | Uma meta tem no máximo uma bateria válida (`quiz_session_goal_uidx`), e pode ser refeita se a anterior caiu. |
| R-BAT-10 | Abrir move a meta para `in_progress`. |

### Máquina de estados

`quiz_session_state_check` é uma constraint `case status ... end` que define,
para cada estado, exatamente quais marcos temporais existem. Não há estado
alcançável fora desta tabela:

| Status | `finished_at` | `completed_at` | `cancelled_at` | `voided_at` | `duration_minutes` | `completion_id` |
|---|---|---|---|---|---|---|
| `in_progress` | — | — | — | — | — | — |
| `awaiting_time` | ✔ | — | — | — | — | ✔ |
| `completed` | ✔ | ✔ | — | — | ✔ | ✔ |
| `cancelled` | ✔ | — | ✔ | — | — | ✔ |
| `voided` | ✔ | — | — | ✔ (+ `voided_by`) | | ✔ |

| Id | Regra |
|---|---|
| R-BAT-11 | Os contadores saíram da tabela. A contagem vem do ledger; a validação de quantidade acontece dentro de `finish_quiz_session`. |

### Finalização

| Id | Regra |
|---|---|
| R-BAT-12 | `finish_quiz_session` passa por `reserve_operation`: mesmo `request_id` com o mesmo payload devolve o estado anterior sem reexecutar; payload diferente é recusado com `ja utilizado com outro payload`. |
| R-BAT-13 | Concluir exige entre **1 e `main_target`** questões principais. Finalização antecipada é válida; zero não é. |
| R-BAT-14 | Reforços e extras só existem depois de **todas** as principais. |
| R-BAT-15 | Questões extras entram em blocos de 5 (`mod(v_extras, 5) = 0`). |
| R-BAT-16 | Cancelar aceita zero respostas e devolve a meta para `pending`. |
| R-BAT-17 | Finalizar leva a sessão para `awaiting_time`, não para `completed`: a meta só fecha com o tempo registrado. |
| R-BAT-18 | O ledger é append-only, protegido pelo gatilho `tg_block_ledger_mutation` — nem `UPDATE` nem `DELETE`, nem por RPC `security definer`. |

### Registro de tempo

| Id | Regra |
|---|---|
| R-BAT-19 | `record_quiz_session_time` também passa por `reserve_operation`. |
| R-BAT-20 | Só sai de `awaiting_time`; qualquer outro estado levanta `bateria nao esta aguardando tempo`. |
| R-BAT-21 | Aceita minutos (`80`) e hora:minuto (`1:20`), por `parseDuration`. Teto de 1440 minutos. |
| R-BAT-22 | Conclui a sessão **e** a meta na mesma transação. |

### As três ordenações

| Id | Regra |
|---|---|
| R-BAT-23 | **Persistir antes de limpar a hash.** A extensão grava a sessão em `storage.local` e só então limpa `location.hash`. Do lado do site, `QuizResultHandler` só chama `history.replaceState` **depois** da confirmação da RPC; em caso de erro a hash **continua** na URL e a mensagem manda atualizar a página, nunca refazer a bateria. |
| R-BAT-24 | **Aguardar a gravação antes de navegar.** `await writeSession(...)` antes de `location.assign`. |
| R-BAT-25 | **`request_id` gerado uma vez, na origem.** A extensão o gera ao finalizar, persiste junto do estado e o reusa em toda retentativa. |

---

## Fluxo

```
/aluno ──[Iniciar bateria]──► startQuizSession (action)
                                   │  rpc start_quiz_session
                                   │  lê catalog_questions + vw_seen_questions
                                   ▼
        https://www.tecconcursos.com.br/questoes#boraQuizStart=<b64url>
                                   │
              extensão: pickQuestions → PERSISTE ──► só então limpa a hash
                                   │
              aluno responde; cada resposta vai para storage.local
                                   │
              finalizar: requestId gerado UMA vez, AGUARDA a gravação,
                         só então navega
                                   ▼
        http://<origem>/aluno#boraQuizResult=<b64url>
                                   │
              QuizResultHandler ──► rpc finish_quiz_session
                                   │  status → awaiting_time
                                   └─► só então history.replaceState
                                   ▼
        [Registrar tempo] ──► rpc record_quiz_session_time
                                   │  sessão → completed
                                   └─► meta → completed
```

**Cancelar** tem dois caminhos, e os dois passam por `finish_quiz_session` com
`p_cancel = true`: pelo site (`CancelSessionForm`) ou pela extensão. A bateria
cancelada não conta em `vw_block_performance` nem em `vw_seen_questions` — as
views filtram `status = 'completed'` — mas as respostas ficam no ledger para
auditoria.

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno` |
| Componentes | `StartQuizButton`, `QuizResultHandler`, `QuizSessionPanel` (`RegisterTimeForm`, `CancelSessionForm`) |
| Actions | `startQuizSession`, `submitQuizResult`, `registerQuizTime`, `cancelQuizSession` — `lib/data/quiz-actions.ts` |
| Leitura | `getBlockQuestions`, `getQuestionHistory` — `lib/data/quiz.ts` |
| RPCs | `start_quiz_session`, `finish_quiz_session`, `record_quiz_session_time`, `void_quiz_session` (sem tela) |
| Idempotência | `reserve_operation` + tabela `operations` |
| Banco | `quiz_sessions`, `quiz_session_questions`, índices `open_quiz_session_uidx`, `quiz_session_number_uidx`, `quiz_session_goal_uidx`, `quiz_session_completion_uidx` |
| Extensão | `content/index.ts`, `shared/session.ts` |
| Protocolo | [06](06-protocolo-site-extensao.md) |

**Tradução de erro.** `raise exception` é escrito para quem lê log — minúsculo,
sem acento, no vocabulário do schema. `translateQuizError` transforma cada um
numa frase para o aluno. Sem essa camada a tela mostraria *"ja existe uma
bateria aberta neste planejamento"*.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Iniciar cria `quiz_sessions` `in_progress`, `session_number=1`, `main_target=15`, move a meta para `in_progress` e navega para o TEC com o payload no fragmento | F-BAT-01 |
| CA-02 | Com sessão aberta não há botão "Iniciar bateria"; aparecem "Continuar no TEC" e "Cancelar bateria"; a RPC para outra meta levanta erro | F-BAT-02 |
| CA-03 | A extensão grava `bora.quiz.session.v1` **antes** de a hash ser limpa; `queue.length === mainTarget`; `requestId === null`; `finishedAt === null` | F-BAT-03 |
| CA-04 | Ao finalizar, o `requestId` é gerado uma vez e gravado antes de navegar | F-BAT-08 |
| CA-05 | O site mostra "Gravando o resultado da bateria…", depois "Resultado gravado…"; a hash é limpa **só depois**; sessão em `awaiting_time`; ledger com 15 linhas | F-BAT-09 |
| CA-06 | Com erro na gravação, a hash **continua** na URL e a mensagem manda atualizar a página | F-BAT-10 |
| CA-07 | Reenvio com mesmo `requestId` e mesmo payload é replay; com payload diferente é recusado | F-BAT-11 |
| CA-08 | Base64 corrompido e `protocol` diferente de 1 têm mensagens distintas | F-BAT-12 |
| CA-09 | Registrar tempo leva a sessão a `completed`, grava `duration_minutes`, conclui a meta; aceita `80` e `1:20` | F-BAT-13 |
| CA-10 | Com 11/15, `/aluno` mostra `11/15 · 73%` e os mesmos números aparecem nas outras quatro telas do aluno | F-BAT-14 |
| CA-11 | Cancelar pelo site devolve a meta para `pending`, o botão reaparece, e a bateria não conta nas views | F-BAT-15 |
| CA-12 | Cancelar pela extensão volta com `cancel:true` e `answers:[]` se nada foi respondido | F-BAT-16 |
| CA-13 | Uma bateria já entregue ao site não pode ser reenviada como se estivesse aberta | F-BAT-19 |
| CA-14 | Aluno chamando `start_quiz_session` na meta de outro recebe `somente o aluno pode iniciar a bateria` | F-ISO-02 |
| CA-15 | `UPDATE` ou `DELETE` em `quiz_session_questions` levanta erro do gatilho, mesmo por RPC `security definer` | `supabase/tests/` |
| CA-16 | Concluir com zero principais, com extras antes do fim das principais, ou com extras fora de múltiplo de 5, é recusado | `supabase/tests/` |

---

## Fora de escopo

- **Bateria fora da meta.** Toda bateria nasce de uma meta `question_block`; o
  enum `quiz_session_origin` prevê `error_notebook` e nada o produz.
- **Fases de reforço e extra conduzidas pela extensão.** O protocolo e o banco
  aceitam; o content script só conduz `main`. Ver [09](09-reforco-e-revisoes.md).
- **Anular bateria.** `void_quiz_session` está pronta e nenhuma tela chama.
- **Cancelar a atual e iniciar outra em um passo.** A v2 oferecia; aqui são duas
  ações.
- **Cronômetro.** O tempo é digitado pelo aluno depois, não medido.
