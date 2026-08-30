# 20 — Execução do reforço de ciclo

**Situação:** não implementada · **Comparativo:** §12 item 8 (primeira metade) · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §4 · **Fluxos e2e:** F-RCIC-01 a F-RCIC-06

---

## Problema

O sistema diz ao aluno que ele precisa reforçar, e não dá o que fazer.

`/aluno/revisoes` marca o bloco com "Reforço recomendado" quando três baterias
válidas acumulam menos de 80% nas principais. O aluno lê, concorda, e não tem
botão nenhum. `/professor/revisoes` mostra a mesma coisa para o professor, que
também não tem o que fazer com a informação. A tela **recomenda e não executa** —
está escrito assim na spec [09](09-reforco-e-revisoes.md), e é dívida assumida
desde então.

`record_reinforcement` está pronta desde a migration inicial. Ela recebe as três
baterias do ciclo, confere que o acumulado é mesmo abaixo de 80%, grava o
reforço, e **exige que todo erro principal do ciclo tenha sido revisado** — um
`EXCEPT` entre as questões erradas e as revisadas, que recusa a gravação se
faltar uma. Está testada em `supabase/tests/03_reinforcement.sql`. É a última das
três RPCs que o GAP-02 listava como implementadas e sem chamador.

O ciclo é a peça pedagógica do produto: é o que transforma "você errou" em "você
revisou". Sem ele, o erro fica registrado no caderno e nada acontece — que é
exatamente o que o aluno faria sozinho, sem sistema nenhum.

---

## Regras

### Que ciclo está aberto

| Id | Regra |
|---|---|
| R-RCIC-01 | Um ciclo é um grupo **fechado de exatamente 3 baterias concluídas** do mesmo bloco, na ordem de conclusão. Baterias `cancelled` e `voided` não entram — elas já estão fora de todo número de desempenho. |
| R-RCIC-02 | Os grupos são formados **do mais antigo para o mais novo, de três em três**. A quarta e a quinta bateria não formam ciclo: ficam esperando a sexta. É o `i += 3` da v96, e é o que dá ao ciclo um significado estável em vez de uma janela deslizante. |
| R-RCIC-03 | Uma bateria **nunca participa de dois ciclos**. O banco garante: `reinforcement_sessions` tem `unique (quiz_session_id)`. A tela não oferece o que já foi usado. |
| R-RCIC-04 | Um ciclo **exige reforço** quando o acumulado das principais fica **abaixo de 80%**. Em 80% ou mais ele se fecha sozinho e não aparece. A RPC recusa gravar reforço de ciclo com 80% ou mais — a regra mora nos dois lugares, e o banco é quem manda. |
| R-RCIC-05 | Abaixo de **75%** o ciclo é marcado como **prioridade alta**. É o limiar da v96 (`prioridade: desempenho<75?'alta':'normal'`), e hoje não existe aqui. É rótulo de urgência, não muda o que é gravado. |
| R-RCIC-06 | A formação dos ciclos é **função pura**, com teste de unidade. São três regras de agrupamento com bordas — menos de três, sobra de uma ou duas, sessão já usada — e provar isso sem navegador é mais barato. |

### O que o aluno faz

| Id | Regra |
|---|---|
| R-RCIC-07 | O reforço lista **as questões erradas únicas** do ciclo, na fase `main`. Erro em extra ou em reforço anterior não entra: o ciclo avalia somente as principais, como `record_reinforcement` já impõe. |
| R-RCIC-08 | Cada questão traz o **link direto para ela no TEC** e dois botões: acertei e errei. O aluno refaz a questão lá e marca aqui. Não há cronômetro nem captura automática — quem conduz questão dentro do TEC é a extensão, e isso é a spec [21](21-fases-na-extensao.md). |
| R-RCIC-09 | **Todas** as questões precisam ser marcadas para gravar. É o `EXCEPT` da RPC: faltando uma, ela recusa com "o reforco precisa revisar as N questoes erradas restantes do ciclo". A tela impede antes, com a mesma contagem, para o aluno não perder o trabalho. |
| R-RCIC-10 | O resultado de cada questão vai com `phase = 'main'` — é a fase em que o erro aconteceu, e é por ela que o `EXCEPT` casa. `topic` acompanha, vindo do ledger. |
| R-RCIC-11 | Idempotência **com payload**: `request_id` + `reserve_operation`, com hash dos resultados. O `request_id` é gerado uma vez, quando o aluno abre o reforço, e sobrevive à submissão — reenviar devolve o reforço já gravado. |

### O que muda depois

| Id | Regra |
|---|---|
| R-RCIC-12 | Gravar o reforço cria a linha em `reinforcements`, liga as três baterias em `reinforcement_sessions`, guarda cada questão revisada em `reinforcement_questions` e insere o ciclo em `review_cycles`. Tudo na mesma transação, dentro da RPC. |
| R-RCIC-13 | O ciclo revisado **some da lista** e a contagem de "Ciclos revisados" do bloco sobe. As três baterias continuam contando no desempenho — reforço não anula bateria. |
| R-RCIC-14 | O reforço **não cria bateria nem escreve no ledger**. `quiz_session_questions` continua sendo só o que aconteceu dentro de uma bateria. O que o aluno revisou vive em `reinforcement_questions`, que é outra tabela de propósito. |
| R-RCIC-15 | O professor vê o mesmo em `/professor/revisoes`: os ciclos abertos de cada aluno, com prioridade. Ele **não executa** o reforço pelo aluno — quem revisou foi quem estudou, a mesma regra de `R-CONC-03`. |

---

## Fluxo

```
aluno abre /aluno/revisoes
      │
      ├─ por bloco: baterias concluídas, ordenadas por conclusão
      │     menos as que já estão em reinforcement_sessions
      │     agrupadas de 3 em 3, fechadas
      │        └─ acumulado < 80%  →  ciclo aberto
      │           acumulado < 75%  →  prioridade alta
      │
      └─ [Fazer reforço]
             ├─ as questões erradas únicas das 3 baterias, fase main
             ├─ cada uma com link para o TEC + acertei / errei
             ├─ requestId gerado UMA vez, ao abrir
             ▼
       record_reinforcement(plano, bloco, [3 ids], requestId, resultados)
             ├─ confere as 3 concluídas, do mesmo bloco, do aluno
             ├─ recalcula o acumulado e RECUSA se >= 80%
             ├─ grava reinforcements + sessions + questions
             ├─ EXCEPT: recusa se faltou revisar alguma
             └─ insere em review_cycles
             ▼
      o ciclo some da lista; "Ciclos revisados" sobe;
      o desempenho das 3 baterias continua exatamente o mesmo
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno/revisoes` — ganha os ciclos abertos e o formulário; `/professor/revisoes` ganha a prioridade |
| Componentes | `ReinforcementForm`, em `components/student/` |
| Actions | `recordReinforcement`, em `lib/data/goal-actions.ts` |
| Domínio | `buildCycles` e o limiar de prioridade, em `lib/domain/reinforcement.ts`, com teste de unidade |
| Leitura | as baterias concluídas do bloco, as já usadas em ciclo, e os erros principais das três |
| RPCs | **nenhuma nova.** `record_reinforcement` já existe |
| Migration | **nenhuma** |
| Testes | `apps/web/src/lib/domain/reinforcement.test.ts`, `apps/e2e/tests/student.spec.ts` |

**Por que a revisão acontece fora do TEC.** A alternativa seria mandar o aluno
para o TEC com a fila de erros e deixar a extensão conduzir, como a v96 fazia com
`#boraReviewV2=`. Isso exige envelope novo no protocolo e mudança no content
script — as duas pontas ao mesmo tempo, que é o que o portão de escopo separa. E
tem um custo próprio: obriga o aluno a ter a extensão instalada para fechar o
ciclo. Aqui o link leva à questão e o aluno marca o resultado; quando a spec
[21](21-fases-na-extensao.md) existir, ela pode automatizar isso sem mudar nada
do que esta grava.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Os ciclos se formam de três em três, fechados, ignorando canceladas e anuladas e as já usadas | `reinforcement.test.ts` |
| CA-02 | Ciclo com 80% ou mais não aparece; abaixo de 75% vem como prioridade alta | `reinforcement.test.ts` |
| CA-03 | Com três baterias abaixo de 80%, a tela oferece o reforço e lista as questões erradas únicas | F-RCIC-01 |
| CA-04 | Marcar todas e enviar grava o reforço, e o ciclo some da lista | F-RCIC-02 |
| CA-05 | Deixar uma questão sem marcar impede o envio, com a contagem do que falta | F-RCIC-03 |
| CA-06 | Depois do reforço, "Ciclos revisados" sobe e o desempenho das três baterias **não muda** | F-RCIC-04 |
| CA-07 | Com menos de três baterias, ou com o acumulado em 80% ou mais, não há reforço a fazer | F-RCIC-05 |
| CA-08 | O professor vê o ciclo aberto com a prioridade, e não tem como executá-lo | F-RCIC-06 |

---

## Fora de escopo

- **Conduzir o reforço dentro do TEC.** É a spec [21](21-fases-na-extensao.md), e
  o motivo do corte está na Superfície.
- **Reforço correlato dentro da bateria** — uma questão do mesmo tópico a cada
  erro — e a **rodada extra de +5**. São as outras duas coisas que a v96 chamava
  de "reforço", e vivem no content script.
- **Agendar o reforço como meta futura.** A v96 tinha (`agendarReforco`), criando
  meta `reinforcement` com `source_goal_id`. O enum e a coluna existem aqui e
  nada os escreve; entra na fila.
- **Ignorar um reforço sugerido.** `goals.reinforcement_skipped` existe e nada o
  escreve. Enquanto não houver decisão sobre o que "ignorado" significa para o
  ciclo seguinte, continua sem caminho.
- **Caderno de erros no TEC.** Criar um caderno lá dentro é integração com o
  site de terceiro, sem API pública.
- **Reforço de bloco sem ciclo fechado.** Ver os erros do bloco já existe
  (F-ALU-03); reforçar exige o ciclo, porque é o ciclo que define o `cutoff` e o
  que `review_cycles` guarda.
