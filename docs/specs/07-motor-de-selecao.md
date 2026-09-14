# 07 — Motor de seleção

> **Histórico.** Esta spec descreve o fluxo conduzido pela extensão de
> navegador, que foi removida do repositório. O que ela diz do banco continua
> valendo; o que diz da execução, não — não existe hoje caminho por onde o aluno
> responda uma bateria.

**Situação:** implementada · **Fluxos e2e:** F-BAT-04, F-BAT-17, F-BAT-18

---

## Problema

Um bloco do catálogo tem centenas ou milhares de questões; uma bateria tem 15.
Escolher quais 15 é a decisão que dá sentido ao produto: se ela repetir o que o
aluno já acertou, a hora de estudo foi desperdiçada; se ignorar o que ele errou,
o erro nunca é corrigido.

Duas coisas quebraram na versão anterior. A escolha não era determinística —
duas execuções com a mesma entrada podiam produzir filas diferentes, o que
tornava qualquer defeito irreprodutível. E o histórico era lido com um `SELECT`
cru no ledger que trazia dezenas de milhares de linhas para agregar em
JavaScript, sob o teto de linhas do PostgREST: passado o teto, o motor
**silenciosamente** passava a tratar questões já vistas como inéditas.

---

## Regras

| Id | Regra |
|---|---|
| R-SEL-01 | A ordem de prioridade é, do mais para o menos importante: **1.** inédita; **2.** mais erros; **3.** vista há mais tempo; **4.** vista menos vezes. |
| R-SEL-02 | O desempate final é o `questionId`. É o que torna a fila **determinística**: a mesma entrada produz sempre a mesma ordem. |
| R-SEL-03 | A fila tem exatamente `mainTarget` questões, ou menos se o bloco não tiver tantas. |
| R-SEL-04 | Uma questão é "vista" se aparece em `vw_seen_questions` — que conta **todas as fases**, incluindo extra e reforço. Uma questão respondida como extra não deve reaparecer como inédita na sessão seguinte. |
| R-SEL-05 | Só sessões `completed` contam como vistas. Bateria cancelada ou anulada não consome questão. |
| R-SEL-06 | O histórico é lido da **view agregada**, uma linha por questão distinta — não uma por resposta. |
| R-SEL-07 | A leitura pagina em blocos de 1000, com teto de 50 páginas. Atingido o teto, `historyComplete` volta `false`. |
| R-SEL-08 | Com `historyComplete: false` a extensão **degrada visivelmente**: o painel avisa "Histórico incompleto: pode repetir questão." Fingir que o histórico é autoritativo foi o defeito da v2. |
| R-SEL-09 | O motor roda **na extensão**, sobre o payload recebido. O site não escolhe as questões; ele entrega o universo e o histórico. |
| R-SEL-10 | `nextUnanswered` devolve a primeira da fila ainda sem resposta — a navegação segue a fila, não a ordem do TEC. |

---

## Como o rank funciona

Para cada `questionId`, `pickQuestions` monta uma tupla e ordena por ela:

| Questão | Tupla |
|---|---|
| inédita | `[0, 0, 0, 0]` |
| já vista | `[1, -incorrectAnswers, Date.parse(lastSeenAt), timesSeen]` |

Ordenação crescente, campo a campo:

- **`0` antes de `1`** — toda inédita vem antes de qualquer revisão;
- **`-incorrectAnswers` crescente** — quem tem mais erros tem o valor mais
  negativo, então vem primeiro;
- **`lastSeenAt` crescente** — vista há mais tempo primeiro, que é o
  espaçamento;
- **`timesSeen` crescente** — entre iguais, a menos praticada;
- **`questionId`** — desempate estável.

Entre inéditas, os quatro campos empatam em zero e o desempate é o id: elas
saem na ordem do catálogo, que é a ordem em que `availableQuestions` chega.

---

## Fluxo

```
site: getBlockQuestions(catalog_block_id)     → availableQuestions (ordem do catálogo)
      getQuestionHistory(plano, bloco)         → history + complete
                    │
                    ▼  payload quiz.start [06]
extensão: pickQuestions(start) ──► queue[0..mainTarget-1]
                    │
                    ▼
          writeSession({ queue, answers: {}, requestId: null })   [05, R-BAT-23]
                    │
                    ▼
          nextUnanswered(queue, answers) → navega para a questão
```

---

## Superfície

| Camada | Item |
|---|---|
| Motor | `pickQuestions`, `nextUnanswered`, `progressOf` — `apps/extension/src/content/engine.ts` |
| Testes | `apps/extension/src/content/engine.test.ts`, runner nativo do Node |
| Histórico | `getQuestionHistory`, `getBlockQuestions` — `apps/web/src/lib/data/quiz.ts` |
| View | `vw_seen_questions` |
| Payload | `QuizStart.availableQuestions`, `.history`, `.historyComplete`, `.mainTarget` — [06](06-protocolo-site-extensao.md) |
| Painel | `apps/extension/src/content/panel.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A mesma entrada produz sempre a mesma fila | F-BAT-04, `engine.test.ts` |
| CA-02 | Toda inédita vem antes de qualquer questão já vista | `engine.test.ts` |
| CA-03 | Entre vistas, a de mais erros vem primeiro; empatado em erros, a vista há mais tempo; empatado, a vista menos vezes | `engine.test.ts` |
| CA-04 | A fila tem `mainTarget` itens, ou o total do bloco se for menor | `engine.test.ts` |
| CA-05 | Segunda bateria no mesmo bloco: `history` volta com as 15 vistas, a fila nova é de 15 inéditas, e a interseção com a anterior é vazia | F-BAT-17 |
| CA-06 | Com `historyComplete: false` o painel mostra "Histórico incompleto: pode repetir questão." | F-BAT-18 |
| CA-07 | Questão respondida como `extra` não reaparece como inédita na sessão seguinte | **sem cobertura** — depende das fases extra, que a extensão ainda não conduz |
| CA-08 | Questões de bateria cancelada não entram em `vw_seen_questions` | F-BAT-15, `supabase/tests/` |
| CA-09 | Um bloco com mais de 1000 questões distintas no histórico é lido inteiro, em páginas | **sem cobertura** |

---

## Fora de escopo

- **Balanceamento por tópico.** A v2 distribuía a fila entre os tópicos do
  bloco. Aqui `topic` viaja no ledger e não influencia a seleção.
- **Dificuldade da questão.** O catálogo não a registra.
- **Peso configurável.** A ordem de prioridade é fixa; não há ajuste por aluno
  nem por professor.
- **Seleção no servidor.** Deliberado: o motor precisa funcionar com o payload
  em mãos, sem rede, porque a extensão não fala com o Supabase (R-PROTO-10).
