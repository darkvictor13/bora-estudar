# 21 — Reforço correlato e rodada extra na extensão

**Situação:** implementada · **Comparativo:** §12 item 8 (segunda metade) · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §10 · **Fluxos e2e:** F-FASE-01 a F-FASE-06

---

## Problema

O banco sabe conduzir três fases. A extensão conduz uma.

`question_phase` tem `main`, `reinforcement` e `extra` desde a migration
inicial. `finish_quiz_session` valida as três: extras só depois de **todas** as
principais, extras em blocos de **5**, e `reinforcement_has_source` exigindo a
questão de origem. `vw_quiz_session_performance` separa as três colunas, e
`/aluno/estatisticas` já mostra "P: … E: … R: …" — sempre zerado nas duas
últimas, porque nada as escreve.

O content script só monta a fila de `main`. O aluno erra uma questão e a bateria
segue em frente; termina as quinze e não tem como pedir mais.

São **duas coisas diferentes**, e a v96 as tinha separadas — o inventário
precisou desembaraçá-las porque o §12 as tratava como uma:

- **reforço correlato**, `pickReinforcement` (content.js:261): a cada erro, **uma**
  questão do **mesmo tópico** entra no fim da fila, automaticamente. Profundidade
  máxima 2 — errar a correlata gera mais uma, e errar essa não gera mais nada;
- **rodada extra**, `appendExtraRound` (content.js:280): terminada a fila, o
  aluno pode pedir **mais 5** do bloco. Tudo ou nada.

E o reforço correlato exige algo que o protocolo hoje não carrega: **o tópico de
cada questão do bloco**. `availableQuestions` é uma lista de números.

---

## Regras

### O protocolo

| Id | Regra |
|---|---|
| R-FASE-01 | `availableQuestions` deixa de ser `number[]` e passa a ser `{ id, topic }[]`. Sem o tópico no payload não existe "correlata do mesmo tópico", e a extensão **não fala com o Supabase** para buscá-lo. |
| R-FASE-02 | A mudança é incompatível, então `PROTOCOL_VERSION` vai de **1 para 2**. Toda leitura já compara a versão e recusa a diferente com mensagem acionável; é para isso que ela existe. |
| R-FASE-03 | O tópico vem de `catalog_questions.topic`, que já é `not null` na tabela e viaja como `string | null` no envelope — o bloco pode não ter tópico cadastrado, e o motor degrada para "qualquer questão" em vez de quebrar. |
| R-FASE-04 | **A extensão continua sem catálogo embutido.** A v96 empacotava 1,97 MB de JSON com 126 blocos. Aqui o tópico chega no payload, do banco, e some quando a bateria termina. |

### A sessão salva

| Id | Regra |
|---|---|
| R-FASE-05 | A fila guardada em `storage.local` passa de `number[]` para uma lista de itens com `id`, `topic`, `phase`, `round`, `sourceQuestionId` e `depth`. |
| R-FASE-06 | Uma sessão gravada pela versão anterior — fila de números — é **migrada em memória** na leitura, cada número virando um item `main`, rodada 0, sem origem. **Não se descarta bateria em andamento por causa de atualização de extensão**: é uma hora de estudo do aluno, e é o tipo de perda que as três ordenações do `CLAUDE.md` existem para impedir. |

### Reforço correlato

| Id | Regra |
|---|---|
| R-FASE-07 | A cada resposta **errada**, uma questão entra no **fim da fila**, com `phase = 'reinforcement'` e `sourceQuestionId` igual à questão errada. Automático, sem botão. |
| R-FASE-08 | A escolha tenta primeiro o **mesmo tópico** da questão errada; esgotado o tópico, cai para qualquer uma, pelo mesmo critério de `pickQuestions`. Nunca repete questão já na fila. |
| R-FASE-09 | A profundidade máxima é **2**: a principal errada gera uma correlata; errar a correlata gera mais uma; errar essa não gera mais nada. Sem o teto, uma sequência de erros gera fila infinita. |
| R-FASE-10 | A correlata **herda a rodada** da questão de origem. A correlata de uma extra da rodada 1 fica na rodada 1. |
| R-FASE-11 | Se não houver candidata — bloco esgotado —, nada entra e a bateria segue. Não é erro. |

### Rodada extra

| Id | Regra |
|---|---|
| R-FASE-12 | Terminada a fila inteira, o aluno pode pedir **+5 questões**. É oferta explícita, com botão, nunca automática. |
| R-FASE-13 | É **tudo ou nada**: se não houver 5 questões inéditas na fila, nenhuma é acrescentada e a tela diz por quê. O banco exige `mod(extras, 5) = 0`, então um bloco de 3 seria recusado na gravação. |
| R-FASE-14 | Cada leva incrementa a **rodada**: as principais são a rodada 0, a primeira leva de extras é a 1, a seguinte é a 2. Não há teto de rodadas. |
| R-FASE-15 | O botão **só aparece com todas as principais respondidas**, porque é o que `finish_quiz_session` exige: extras e reforços só existem depois de todas as principais planejadas. |

### As guardas de ordem

| Id | Regra |
|---|---|
| R-FASE-16 | Enquanto houver principal sem resposta, responder uma correlata ou uma extra **não é registrado**. A fila leva o aluno à pendente. É a mesma regra que o banco impõe, aplicada antes de o aluno perder o trabalho. |
| R-FASE-17 | Uma correlata de rodada `N > 0` só é registrada depois de **todas as extras daquela rodada** terem resposta. É a ordem da v96, e é o que mantém "extras primeiro, reforços no fim" dentro de cada rodada. |
| R-FASE-18 | **Na finalização antecipada, tudo que não é `main` é descartado do resultado.** Quem para com 7 de 15 não envia correlata nem extra — `finish_quiz_session` recusaria com "reinforcements/extras so podem existir depois de todas as principais", e o aluno perderia a bateria inteira por causa de uma correlata. É a regra mais importante desta spec. |

---

## Fluxo

```
site monta QuizStart com availableQuestions = [{id, topic}, …]   ← protocolo 2
      ▼
extensão: fila = 15 principais, rodada 0, depth 0
      │
      ├─ resposta CERTA  → nada acontece
      │
      └─ resposta ERRADA → pickCorrelate(mesmo tópico → qualquer)
             ├─ depth da origem >= 2?  → nada
             ├─ candidata já na fila?  → próxima
             └─ entra no FIM da fila: phase reinforcement,
                sourceQuestionId = a errada, round herdado, depth+1
      ▼
   fila inteira respondida
      │
      ├─ [+5 questões extras]   ← só com todas as principais respondidas
      │      └─ 5 ou nenhuma; round = maior + 1
      │
      └─ [Finalizar]
             ├─ principais < alvo?  → DESCARTA tudo que não é main
             └─ envia o resultado
```

---

## Superfície

| Camada | Item |
|---|---|
| Protocolo | `AvailableQuestion { id, topic }`; `PROTOCOL_VERSION` 1 → 2 |
| Site | `getBlockQuestions` passa a trazer o tópico; `startQuizSession` monta o payload novo |
| Extensão | `engine.ts` ganha `pickCorrelate` e `appendExtraRound`; `session.ts` migra a fila antiga; `index.ts` grava a fase certa; `panel.ts` ganha o botão e a composição |
| RPCs | **nenhuma nova** |
| Migration | **nenhuma** — o banco já valida as três fases desde agosto |
| Testes | `packages/protocol/src/codec.test.ts`, `apps/extension/src/content/engine.test.ts`, `apps/e2e/tests/extension.spec.ts` |

**A composição aparece no painel assim que a FILA cresce**, não quando a
primeira correlata é respondida. Condicioná-la às respostas a esconderia
justamente no momento em que ela explica o que acabou de acontecer: o total
subiu porque o aluno errou. *Ajustado em 30/08/2026, ao implementar.*

**Esta é a única spec da fila que toca as duas pontas**, e é por isso que ela é
separada da [20](20-execucao-do-reforco.md). Não há migration junto: o banco não
muda uma linha, o que reduz a superfície do commit à metade.

**O `dist/` da extensão precisa ser recompilado.** O `global-setup` do e2e já o
faz; quem roda a extensão instalada precisa atualizá-la, e é o
`PROTOCOL_VERSION` que avisa — payload de versão diferente é recusado com
"Atualize a extensão".

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | `availableQuestions` com tópico atravessa a codificação e é validada; payload da versão 1 é recusado | `codec.test.ts` |
| CA-02 | Uma sessão gravada com fila de números é migrada para itens `main`, sem perder resposta | `engine.test.ts` |
| CA-03 | `pickCorrelate` escolhe o mesmo tópico quando há, cai para qualquer um quando não há, e respeita a profundidade 2 | `engine.test.ts` |
| CA-04 | `appendExtraRound` acrescenta exatamente 5 ou nenhuma, e incrementa a rodada | `engine.test.ts` |
| CA-05 | Errar uma questão põe uma correlata do mesmo tópico no fim da fila, e o painel a mostra | F-FASE-01 |
| CA-06 | A correlata registrada vai com `phase='reinforcement'` e `source_question_id` da errada | F-FASE-02 |
| CA-07 | Com todas as principais respondidas, "+5 questões extras" acrescenta 5 na rodada 1 | F-FASE-03 |
| CA-08 | Sem 5 inéditas, o botão não acrescenta nada e diz por quê | F-FASE-04 |
| CA-09 | Finalizar antecipadamente descarta correlatas e extras, e o site aceita a gravação | F-FASE-05 |
| CA-10 | O ledger recebe as três fases, e as estatísticas passam a mostrar E e R diferentes de zero | F-FASE-06 |

---

## Fora de escopo

- **Resumo por tópicos no painel.** A v96 mostrava "TÓPICOS ESTUDADOS" com
  acertos e erros por tópico. É leitura, não condução, e entra na fila.
- **Painel arrastável.** Item próprio, e independe das fases.
- **Escolher quantas extras.** São 5, porque o banco exige múltiplo de 5.
- **Correlata por dificuldade**, e não por tópico. O critério da v96 é tópico, e
  não há sinal de dificuldade no catálogo.
- **Conduzir o reforço de ciclo dentro do TEC.** É a sessão inteira de erros da
  spec [20](20-execucao-do-reforco.md), que o aluno faz pelo site. Trazê-la para
  a extensão exigiria um terceiro tipo de envelope.
- **Profundidade configurável.** Fica em 2, como na v96.
