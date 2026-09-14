# NN — Título da feature

**Situação:** não implementada · **Comparativo:** §12 item N · **Fluxos e2e:** F-XXX-01 a F-XXX-nn

---

## Problema

<!--
O que não funciona hoje e o que isso custa a quem usa.

Teste de qualidade: se este texto cita botão, tela ou componente, está errado —
reescreva. Metade dos fluxos da v2 existia porque alguém desenhou uma tela, e é
assim que o aluno acaba com permissão para gerar o próprio planejamento.

Quando a versão anterior fazia diferente e deu errado, diga como. É o que dá
critério para julgar a solução depois.
-->

---

## Regras

<!--
Uma por linha, presente do indicativo, testável, numerada `R-XXX-nn`.

Para cada regra, responda antes de escrever:

1. QUEM ESCREVE? Confronte com a tabela de fronteira do CLAUDE.md.
   Planejar → escrita direta com RLS, `WITH CHECK` e `GRANT UPDATE` por coluna
   (colunas de contexto — student_id, teacher_id, study_plan_id — ficam fora).
   Executar → RPC, sem exceção. Se falta RPC, a spec cria a RPC; não afrouxe o
   grant.

2. ONDE A REGRA É IMPOSTA? Nomeie a constraint, o índice parcial, o grant ou o
   gatilho na própria linha. Invariante que dá para expressar em constraint vai
   para o banco. É o que impede alguém de "simplificar" o índice mais tarde sem
   entender o que ele sustentava.

Toda RPC mutante nova declara a forma de idempotência:
  - com payload → `request_id` + `reserve_operation`;
  - naturalmente idempotente → escreva POR QUÊ, em uma frase.

Se houver máquina de estados, a tabela status × marcos temporais vem antes das
regras. É ela que vira a `check` constraint.
-->

| Id | Regra |
|---|---|
| R-XXX-01 |  |
| R-XXX-02 |  |

---

## Fluxo

<!--
Do gatilho ao efeito. Diagrama só quando a ordem entre os passos importa.

Toda ordenação que não pode inverter vira uma regra numerada E um critério de
aceitação próprio. As três do CLAUDE.md existem porque cada uma custou bateria
já respondida — uma hora de estudo do aluno, sem como recriar.
-->

---

## Superfície

<!--
Preenchida como PLANO, não como registro. Apague as linhas que não se aplicam.

Corte: mais de duas RPCs novas, ou mais de uma migration, ou tocar site e
banco ao mesmo tempo → são duas specs.
-->

| Camada | Item |
|---|---|
| Rota |  |
| Componentes |  |
| Actions |  |
| Leitura |  |
| RPCs |  |
| Migration |  |
| Banco |  |

---

## Critérios de aceitação

<!--
Cada `CA-nn` nasce com id de teste já reservado. Distribuição:

  invariante que o banco impõe    → `supabase/tests/`, com `raise exception`
                                     se o banco ACEITAR o estado proibido
  RLS, isolamento entre alunos    → `supabase/tests/` + um `F-ISO-nn`
  laço visível, ordem entre passos,
  mensagem de erro traduzida      → novo `F-XXX-nn` em docs/fluxos-e2e.md

"sem cobertura" vale para as dez specs retroativas. Em spec nova, não: lá é
dívida herdada, aqui seria dívida criada de propósito.
-->

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 |  |  |
| CA-02 |  |  |

---

## Fora de escopo

<!--
Com o motivo. É o motivo que impede a mesma discussão de voltar a cada revisão.
-->

-
