# 22 — Rodízio por tópico na seleção

**Situação:** não implementada · **Comparativo:** §12 item 8 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §10 · **Fluxos e2e:** F-TOPI-01 a F-TOPI-03

---

## Problema

A bateria pode cair inteira no mesmo assunto.

`pickQuestions` ordena as questões do bloco por um critério só — inédita, mais
errada, vista há mais tempo, vista menos vezes — e leva as quinze primeiras. O
tópico não entra na conta. Num bloco de 30 questões com três assuntos, é
perfeitamente possível a bateria sair com quinze de "Cadeia de custódia" e
nenhuma dos outros dois, porque foram essas as menos vistas.

O aluno percebe: quinze questões seguidas do mesmo assunto não é uma bateria de
revisão do bloco, é um treino de um tópico. E a nota da meta passa a medir um
assunto em vez do bloco.

Está registrado em [`arquitetura.md`](../arquitetura.md) como decisão pendente
desde a reescrita: *"`pickQuestions` já prioriza inéditas, depois mais erradas,
depois vistas há mais tempo. Falta agrupar por tópico quando o aluno erra muito
na mesma matéria."*

A versão anterior resolvia com `selectBalanced` (content.js:202): em vez de
ordenar as questões, ela ordenava os **tópicos** por cobertura e tirava uma de
cada vez do menos coberto. A spec [21](21-fases-na-extensao.md) acabou de trazer
o tópico para o payload, o que torna isto possível sem tocar no protocolo de
novo.

---

## Regras

| Id | Regra |
|---|---|
| R-TOPI-01 | A fila principal é montada **tópico a tópico**, e não questão a questão. A cada passo escolhe-se o tópico **menos coberto** e dele sai a melhor candidata. |
| R-TOPI-02 | **Cobertura** de um tópico é `(vistas + já escolhidas nesta bateria) ÷ total do tópico`. É a medida da v96, e é o que faz o rodízio respeitar o histórico em vez de recomeçar do zero a cada bateria. |
| R-TOPI-03 | Empate na cobertura é resolvido por **menos escolhidas nesta bateria**; persistindo, pelo **tópico maior**. O tópico maior ganha porque tem mais a cobrir — deixá-lo para depois é o que produz o desequilíbrio no fim da fila. |
| R-TOPI-04 | Dentro do tópico vencedor, a escolha é a **mesma de sempre**: inédita, mais errada, vista há mais tempo, vista menos vezes, e o id como desempate final. Esta spec muda **qual tópico**, nunca qual questão dentro dele. |
| R-TOPI-05 | Questão sem tópico — `topic` nulo — forma um grupo próprio, tratado como qualquer outro. Bloco inteiro sem tópico cadastrado degrada exatamente para o comportamento anterior, uma fila só. |
| R-TOPI-06 | A seleção continua **determinística**: a mesma entrada produz a mesma fila. É o que permite `battery.ts` reproduzir no e2e a fila que a extensão montaria, e é o que faz a prévia da spec [18](18-previa-e-distribuicao-da-semana.md) valer para a geração. |
| R-TOPI-07 | O rodízio vale para a **fila principal e para a rodada extra**. A correlata continua sendo escolhida pelo tópico da questão errada — lá o tópico é o critério, não o contrapeso. |
| R-TOPI-08 | Duas baterias seguidas no mesmo bloco continuam **sem repetir questão** enquanto houver inédita. A cobertura sobe com o histórico, então a segunda bateria começa pelos tópicos que a primeira menos tocou. |

---

## Fluxo

```
para cada vaga da fila (15 principais, ou 5 extras):
      │
      ├─ agrupa as candidatas por tópico
      ├─ cobertura(t) = (vistas + escolhidas) ÷ total do tópico
      │
      ├─ ordena: menor cobertura → menos escolhidas → tópico maior
      │
      └─ do tópico vencedor, tira a melhor candidata
            (inédita → mais errada → mais antiga → menos vista → id)
```

---

## Superfície

| Camada | Item |
|---|---|
| Extensão | `engine.ts` — `pickQuestions` e `appendExtraRound` passam pelo rodízio |
| Protocolo | **nada muda** — o tópico já viaja desde a spec 21 |
| Site | **nada muda** |
| RPCs | **nenhuma** |
| Migration | **nenhuma** |
| Testes | `apps/extension/src/content/engine.test.ts`, `apps/e2e/tests/quiz.spec.ts` |

**É a menor spec da fila, e depende inteiramente da anterior.** Sem
`AvailableQuestion.topic`, que a spec 21 trouxe, não haveria por onde agrupar.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Com três tópicos de tamanho igual, uma fila de 15 sai com 5 de cada | `engine.test.ts` |
| CA-02 | O tópico já coberto pelo histórico entra menos que o intocado | `engine.test.ts` |
| CA-03 | Empate resolve por menos escolhidas e depois por tópico maior, e a fila é determinística | `engine.test.ts` |
| CA-04 | Bloco sem tópico nenhum produz exatamente a fila anterior | `engine.test.ts` |
| CA-05 | A rodada extra também respeita o rodízio | `engine.test.ts` |
| CA-06 | A bateria do seed sai equilibrada entre os tópicos do bloco | F-TOPI-01 |
| CA-07 | A segunda bateria do bloco continua sem repetir questão | F-TOPI-02 |
| CA-08 | A fila que a extensão monta é a mesma que o e2e reproduz | F-TOPI-03 |

---

## Fora de escopo

- **Peso por tópico.** Todos valem igual; o que difere é o tamanho, e ele já
  entra pela cobertura.
- **Cobertura por acerto**, e não por vista. Um tópico que o aluno viu e errou
  já é priorizado dentro do tópico, pela ordem de `R-TOPI-04`.
- **Rodízio na correlata.** Lá o tópico é o critério de escolha, não o
  contrapeso — é o que `R-TOPI-07` diz.
- **Mostrar a composição por tópico no painel.** É o resumo por tópicos, que
  está na fila.
