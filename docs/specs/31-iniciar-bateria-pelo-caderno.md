# 31 — Iniciar a bateria pelo caderno

**Situação:** não implementada · **Comparativo:** §12 item 16 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §3 · **Fluxos e2e:** F-LIVR-01 a F-LIVR-05

---

## Problema

A bateria só começa de um lugar, e não é o lugar onde o aluno está olhando.

`StartQuizButton` existe apenas em `/aluno` — a visão geral, na linha da meta da
semana. Quem abre `/aluno/cadernos` para escolher o que estudar vê a lista de
blocos com desempenho e situação, decide "vou fazer o Bloco 3", e precisa voltar
à visão geral, achar a meta certa na semana certa e clicar ali. O mesmo em
`/aluno/disciplinas`.

**O que o inventário dizia estava errado, e a correção muda o item inteiro.**
A linha registrava *"Bateria livre por bloco, **fora da meta da semana**"*, e a
fila previa *"1 RPC"*. Não é o que a v96 faz. `htmlAcaoBateriaLivre`
(aluno.js:1525) chama `metasPendentesSemanaDoBloco`, que filtra
`Number(m.semana)===Number(sem)` — **metas da semana selecionada** — e termina
chamando `iniciarBateriaMeta(alvo.id)`, isto é, a bateria de uma **meta**.
Quando não há meta pendente do bloco, o botão nem aparece: a função devolve
`'—'`.

"Livre" ali é a **ordem**, não a ausência de meta — e ordem livre já existe
aqui, marcada ✅ na spec [05](05-bateria-inteligente.md). O que falta é o
**ponto de partida**: o botão na lista de cadernos.

Isso derruba a RPC prevista, a mudança de protocolo que ela exigiria e o valor
novo de `quiz_session_origin`. Uma sessão sem meta forçaria `goalId` a virar
anulável em `QuizStart`, e isso é `PROTOCOL_VERSION` 2 → 3 — a extensão
instalada pararia de aceitar batalhas até o usuário atualizá-la. Um custo
grande para um flow que a v96 nunca teve.

---

## Regras

| Id | Regra |
|---|---|
| R-LIVR-01 | Cada bloco em `/aluno/cadernos` oferece **iniciar a bateria da meta pendente** daquele bloco. É o mesmo `StartQuizButton` e a mesma `start_quiz_session`: nada de caminho paralelo para o mesmo ato. |
| R-LIVR-02 | Bloco **sem meta pendente** não oferece botão, e diz por quê — "Sem meta pendente". É o `'—'` da v96 com a razão escrita. |
| R-LIVR-03 | Havendo mais de uma meta pendente do bloco, a escolhida é a **mais antiga**: menor semana, depois menor dia, depois menor ordem no dia. É a ordenação de `metasPendentesSemanaDoBloco`, estendida para além da semana corrente porque aqui não há semana selecionada. |
| R-LIVR-04 | A meta escolhida é de **qualquer semana**, não só da corrente. A tela de cadernos não tem seletor de semana, e exigir que o aluno adivinhasse a semana da meta é o próprio problema que esta spec resolve. |
| R-LIVR-05 | Com uma bateria **aberta** no planejamento, todo bloco mostra "Continuar no TEC" apontando para ela — inclusive os outros blocos. Só existe uma bateria aberta por planejamento (`start_quiz_session` recusa a segunda), e esconder isso deixaria o aluno clicando num botão que só levanta erro. |
| R-LIVR-06 | Bateria **aguardando tempo** bloqueia o início de outra, e o bloco correspondente aponta para onde se registra o tempo, em `/aluno`. É o mesmo estado que `record_quiz_session_time` fecha. |
| R-LIVR-07 | Bloco **inativo** ou excluído não oferece nada: `start_quiz_session` já recusa com "bloco invalido ou indisponivel", e oferecer o botão seria oferecer o que o banco recusa. |
| R-LIVR-08 | Nenhuma RPC nova, nenhuma migration, **nenhuma mudança de protocolo**. Ver o Problema: a alternativa custaria `PROTOCOL_VERSION` 3. |

---

## Fluxo

```
/aluno/cadernos — um bloco por linha
      │
      ├─ existe bateria aberta no planejamento?
      │     └─ sim → todo bloco mostra "Continuar no TEC", apontando para ela
      │
      ├─ existe meta pendente deste bloco?
      │     ├─ não → "Sem meta pendente"
      │     └─ sim → [Iniciar bateria]
      │                └─ a mais antiga: semana, dia, ordem no dia
      ▼
 start_quiz_session — a MESMA de /aluno, sem caminho paralelo
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno/cadernos` |
| Componentes | `StartQuizButton`, reusado |
| Leitura | `getPendingGoalByBlock` e `getOpenSession`, em `lib/data/student.ts` |
| Domínio | `lib/domain/goals.ts` — a ordenação de "meta mais antiga" |
| Actions | **nenhuma nova** |
| RPCs | **nenhuma** |
| Migration | **nenhuma** |
| Protocolo | **nada muda** |
| Testes | `goals.test.ts`, `apps/e2e/tests/student.spec.ts` |

**É a menor spec da fila, e por um motivo que vale registrar:** ler o código da
v96 antes de implementar transformou "1 RPC, 1 enum novo, protocolo 3" em "um
botão". O inventário foi corrigido junto.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A meta escolhida é a mais antiga por semana, dia e ordem no dia | `goals.test.ts` |
| CA-02 | Só metas `question_block` pendentes do bloco entram na escolha | `goals.test.ts` |
| CA-03 | O aluno inicia a bateria pelo caderno e chega ao TEC | F-LIVR-01 |
| CA-04 | Bloco sem meta pendente diz que não tem | F-LIVR-02 |
| CA-05 | Com bateria aberta, todo bloco aponta para ela | F-LIVR-03 |
| CA-06 | A bateria iniciada pelo caderno é a mesma da visão geral — uma sessão, uma meta | F-LIVR-04 |
| CA-07 | Bloco desativado não oferece início | F-LIVR-05 |

---

## Fora de escopo

- **Bateria sem meta nenhuma.** Não existe na v96, e custaria
  `PROTOCOL_VERSION` 3. Ver o Problema.
- **Escolher qual meta pendente iniciar.** A v96 pega a primeira da ordem, e
  oferecer uma lista transformaria um botão numa tela.
- **Iniciar pela tela de disciplinas.** `/aluno/disciplinas` agrupa por
  disciplina e não lista bloco a bloco; o botão pede a linha do bloco.
- **Trocar de bateria em um passo** (cancelar a aberta e já iniciar outra).
  É o item 🟡 vizinho do inventário, e é outra decisão: cancelar bateria é
  perder trabalho, e merece confirmação própria.
