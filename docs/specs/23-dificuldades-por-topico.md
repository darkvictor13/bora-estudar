# 23 — Dificuldades por tópico

**Situação:** implementada · **Comparativo:** §12 item 8 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §9 · **Fluxos e2e:** **sem cobertura** — depende do motor de baterias

> **Atualizada em 14/09/2026.** O tópico vinha do ledger da bateria, e o motor saiu com a extensão. A view
> `vw_topic_difficulty` não foi portada; a ficha do aluno explica a ausência em
> vez de mostrar uma tabela vazia.

---

## Problema

O professor vê o número, não vê a causa.

A ficha do aluno diz "desempenho oficial 73%". `/aluno/revisoes` lista as
questões erradas por bloco, uma a uma — dezenas de linhas com número de questão
e nada mais. Nenhuma das duas responde à pergunta que decide a intervenção:
**em que o aluno está errando?**

Um bloco com 73% pode ser um aluno razoável em tudo, ou um aluno bom em quase
tudo e perdido num assunto. Os dois casos pedem conversas diferentes, e o
sistema não os distingue. O professor abre o caderno de erros, lê "#100003,
#100017, #100022" e não tem como agrupar aquilo mentalmente.

O tópico está no banco desde sempre: `catalog_questions.topic` é `not null`, e
`quiz_session_questions.topic` guarda o tópico da ocorrência. `vw_block_errors`
já traz `max(q.topic)` por questão — o dado existe, falta a agregação.

A versão anterior tinha a tela (`abrirDificuldadesAluno`, professor.js:3925) e
uma distinção que vale copiar: um tópico é **recorrente** quando o aluno errou
nele em **duas baterias diferentes**. Errar duas vezes na mesma bateria é
possível não ter entendido o enunciado; errar em duas baterias distintas é não
saber a matéria.

---

## Regras

| Id | Regra |
|---|---|
| R-DIFI-01 | A agregação é uma **view nova**, `vw_topic_difficulty`, com uma linha por `(aluno, planejamento, bloco, tópico)`. Nenhum número é mantido à mão, como em todo agregado deste schema. |
| R-DIFI-02 | A view tem `with (security_invoker = true)`. Sem isso ela roda com privilégio do dono e vaza dado entre alunos — a regra vale para toda view do repositório. |
| R-DIFI-03 | Só entram baterias **`completed`** e questões de fase **`main`**. É o mesmo recorte de `record_reinforcement` e o mesmo da v96: o diagnóstico olha a nota oficial, não o treino extra. |
| R-DIFI-04 | Cada linha traz: questões respondidas, erros, **questões distintas erradas**, e **em quantas baterias distintas houve erro**. As duas últimas são o que separa "errei três vezes a mesma questão" de "erro espalhado". |
| R-DIFI-05 | Um tópico é **recorrente** quando houve erro em **duas ou mais baterias distintas**. É o limiar da v96, e é calculado na leitura a partir da coluna da view — a view não guarda o rótulo, guarda o número. |
| R-DIFI-06 | O percentual de acerto do tópico sai da própria view: `acertos ÷ respondidas`. As faixas de cor são as do resto do produto — na meta, acima de `meta × 0,75`, abaixo. |
| R-DIFI-07 | Tópico sem erro nenhum **não aparece** na tela de dificuldades. A tela responde "onde está o problema", e um tópico com 100% não é problema. |
| R-DIFI-08 | Questão sem tópico registrado entra agrupada como **"Tópico não identificado"**, e não some. Sumir esconderia erro real por falha de cadastro. |
| R-DIFI-09 | A leitura é permitida pela RLS das tabelas base: `quiz_session_questions_read` já passa por `can_view_context`, então **aluno e professor** enxergam o que lhes cabe, sem policy nova. |
| R-DIFI-10 | A tela mostra no máximo **60 linhas**, as de mais erros primeiro. É o teto da v96, e existe porque um planejamento de 92 blocos com dezenas de tópicos cada produz uma parede. |

---

## Fluxo

```
quiz_session_questions (completed, phase = main)
      │
      └─ vw_topic_difficulty
            agrupa por (aluno, plano, bloco, tópico)
            conta: respondidas · acertos · erros
                   questões distintas erradas
                   baterias distintas com erro   ← ≥ 2 é recorrente
      ▼
 /professor/alunos/:id   cartão "Dificuldades por tópico"
 /aluno/estatisticas     o mesmo recorte, para o próprio aluno
      │
      └─ ordenado por mais erros; no máximo 60 linhas
         badge "Recorrente" onde houve erro em 2+ baterias
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/alunos/:studentId` e `/aluno/estatisticas` |
| Componentes | a tabela, inline nas duas telas |
| Actions | **nenhuma** — as duas são só leitura |
| Leitura | `getTopicDifficulty`, em `lib/data/student.ts` |
| RPCs | **nenhuma nova** |
| Migration | **uma:** `create view vw_topic_difficulty` |
| Banco | `quiz_session_questions` e `quiz_sessions`, leitura |
| Testes | **sem cobertura**; a tela explica a ausência, e isso é conferido por `F-PROF-03` |

**O fixture de bateria mandava `topic: null`.** A extensão real manda o tópico
do item da fila (`content/index.ts`), então toda bateria de teste agregava como
"Tópico não identificado". Corrigido junto: um fixture que existe para passar
pelo caminho real não pode divergir dele. *Ajustado em 30/08/2026, ao
implementar.*

**A décima suíte SQL não rodava.** `supabase/tests/run.sh` fazia glob em
`0*.sql`, e ainda imprimia "todas as suítes passaram". O glob agora é
`[0-9]*.sql`. *Ajustado em 30/08/2026, ao implementar.*

**A view é aditiva e o bundle no ar não a conhece** — nenhuma consulta existente
muda. É o caso mais simples de compatibilidade que a regra do `CLAUDE.md`
admite.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A view agrega por tópico, contando respondidas, acertos, erros, questões distintas erradas e baterias distintas com erro | **sem cobertura**: `vw_topic_difficulty` não foi portada |
| CA-02 | Só bateria `completed` e fase `main` entram; cancelada, anulada, extra e reforço ficam de fora | **sem cobertura**: `vw_topic_difficulty` não foi portada |
| CA-03 | A view tem `security_invoker`, e um aluno não vê a dificuldade de outro | **sem cobertura**: `vw_topic_difficulty` não foi portada |
| CA-04 | A ficha do aluno mostra os tópicos com erro, ordenados por mais erros | F-DIFI-01 |
| CA-05 | Tópico com erro em duas baterias distintas vem marcado como recorrente; com erro numa só, não | F-DIFI-02 |
| CA-06 | Tópico sem erro não aparece | F-DIFI-03 |
| CA-07 | O aluno vê o mesmo recorte para si em `/aluno/estatisticas` | F-DIFI-04 |

---

## Fora de escopo

- **Dificuldade agregada da turma inteira.** É outra pergunta — "o que a turma
  não está entendendo" —, e pede outra tela.
- **Sugerir bloco ou material por tópico fraco.** Vira recomendação, e
  recomendação sem alguém para revisá-la é chute com autoridade.
- **Tendência do tópico no tempo.** Série temporal está na fila, e vale para
  todos os números de uma vez.
- **Tópico no reforço e no extra.** O ciclo avalia só as principais
  (`R-DIFI-03`); trazer as outras fases mudaria o significado do percentual.
- **Editar o tópico de uma questão.** É catálogo, e catálogo é do admin.
