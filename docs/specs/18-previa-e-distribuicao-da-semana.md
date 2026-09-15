# 18 — Prévia e distribuição por peso na semana

**Situação:** implementada · **Comparativo:** §12 item 7 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §8 · **Fluxos e2e:** F-PROF-04 e F-PROF-05

> **Atualizada em 14/09/2026.** A distribuição por peso e o rodízio foram reescritos na Fase 6 e vivem em
> `lib/domain/teacher.ts` (`shareByWeight` e `planWeek`), com teste de unidade.

---

## Problema

O professor gera a semana às cegas, e todas as matérias pesam igual.

`/professor/metas` pede os dias, os blocos e o tempo, e grava. Entre o clique e o
resultado não há nada: o professor só descobre o que criou abrindo a ficha do
aluno depois. Se ficou errado — dia demais, bloco de menos, a matéria pesada
caindo uma vez enquanto a leve cai três — o conserto é replanejar a semana
inteira, que é uma operação destrutiva e assusta.

E a distribuição é uma meta por bloco marcado, em rodízio pelos dias. Isso trata
Língua Portuguesa, que vale 25 pontos na prova, igual a Direitos Humanos, que
vale 3. Um planejamento de 34 blocos gera 34 metas na semana, com a proporção
errada, e o professor corrige desmarcando bloco na mão toda semana.

A versão anterior resolvia as duas coisas. Tinha uma **prévia** obrigatória antes
de salvar (`gerarPreviaMetasTeoriaAluno`, professor.js:5558), que recusava gerar
se a soma por matéria não batesse com o total, e tinha **distribuição por peso**
(`calcularDistribuicaoPadraoBlocos`, professor.js:5006): cada matéria declara
quantos contatos semanais merece, e o total é repartido proporcionalmente. No
PCPR Reta Final a soma desses contatos é **41**, e o comentário do código diz que
isso "reproduz exatamente a estratégia da planilha".

---

## Regras

### A distribuição

| Id | Regra |
|---|---|
| R-PREV-01 | O professor informa um **total de metas de bateria** para a semana e um **peso por disciplina**. O total é repartido entre as disciplinas proporcionalmente ao peso. |
| R-PREV-02 | A repartição é a da v96: `ideal = total × peso ÷ soma dos pesos`, piso, e o resto distribuído pelo **maior resto fracionário**. Empate no resto é resolvido pela ordem da disciplina no planejamento, para a função ser determinística. |
| R-PREV-03 | Quando o total comporta — `total ≥ número de disciplinas` — **cada disciplina recebe pelo menos 1**. Uma matéria com peso baixo que sumisse da semana inteira é o oposto do que o peso quer dizer. |
| R-PREV-04 | Peso `0` significa **fora da semana**, e não "peso mínimo": a disciplina não recebe meta nenhuma, nem pelo mínimo de `R-PREV-03`. É como o professor tira uma matéria de uma semana específica sem desativar os cadernos dela. |
| R-PREV-05 | Com todos os pesos iguais a zero, a repartição é **por rodízio simples**, uma meta por disciplina até esgotar o total. É a degradação previsível, não um erro. |
| R-PREV-06 | O padrão do formulário é **peso 1 para toda disciplina** e **total igual ao número de blocos marcados**. Com esses valores a repartição produz exatamente uma meta por bloco — que é o comportamento que já existia. A distribuição por peso é uma generalização, não um modo à parte. |

### Qual bloco cada meta usa

| Id | Regra |
|---|---|
| R-PREV-07 | Dentro da disciplina, os blocos entram em **rodízio**: `B1 → B2 → … → Bn → B1`. É a regra da v82, e é o que impede a semana de martelar o mesmo bloco enquanto os outros não saem do lugar. |
| R-PREV-08 | O rodízio **continua de onde a semana anterior parou**. O ponto de partida de cada disciplina é a quantidade de metas de bateria que ela já tem no planejamento, contando todas as semanas não excluídas. Sem isso toda semana recomeçaria no primeiro bloco. |
| R-PREV-09 | Só blocos **marcados** entram. Desmarcar um bloco tira-o do rodízio da disciplina naquela geração, sem mexer no `active` dele — que é decisão de outra tela, a spec [15](15-cadernos-do-planejamento.md). |
| R-PREV-10 | As metas são espalhadas pelos dias em **rodízio entre disciplinas**: uma de cada, na ordem do planejamento, até esgotar. É o que evita a semana inteira de uma matéria num dia só. |

### A prévia

| Id | Regra |
|---|---|
| R-PREV-11 | A prévia é **calculada no navegador**, pela mesma função pura que a action usa. Não há ida ao servidor: `buildWeek` é determinística, então a prévia e o que se grava não têm como divergir por causa do transporte. |
| R-PREV-12 | A prévia mostra as metas **agrupadas por dia**, com tipo, disciplina e bloco, e o total. É o que a v96 mostrava, e é o que responde "o que vai ser criado". |
| R-PREV-13 | A prévia é **opcional**. A v96 a tornava obrigatória — não dava para salvar sem gerar antes. Aqui salvar direto continua valendo: quem já sabe o que quer não precisa de dois cliques. **Suposição registrada.** |
| R-PREV-14 | O ponto de partida do rodízio na prévia vem do **carregamento da tela**; o que a action grava é recalculado do banco no momento de gravar. Se uma meta nascer entre uma coisa e outra, a prévia fica desatualizada em qual bloco cai — nunca em quantas metas. A prévia é conferência, o banco é a verdade. |
| R-PREV-15 | O botão de prévia é `type="button"`. O único `submit` do formulário continua sendo "Gerar metas da semana" — a armadilha do `button[type=submit]` do `CLAUDE.md` vale aqui como em toda tela. |

### O lote

| Id | Regra |
|---|---|
| R-PREV-16 | O `batch_id` continua **derivado do conteúdo** por `batchIdFor`, e passa a incluir o total e os pesos. Sem isso, mudar um peso e reenviar produziria o mesmo id, e `apply_study_plan_batch` devolveria a semana antiga como replay — a promessa "reenviar o mesmo lote não duplica" viraria "mudar o peso não faz nada". |
| R-PREV-17 | Total e pesos são validados na action: total entre 1 e **80** (o teto da v96), peso entre 0 e 20. Fora disso, mensagem em português e nada é gravado. |

---

## Fluxo

```
professor abre /professor/metas
      │
      ├─ dias · tempo · modo · blocos marcados   (como hoje)
      ├─ NOVO: total de metas + peso por disciplina
      │
      ├─ [Gerar prévia]  ── type="button", sem ida ao servidor
      │       │
      │       ├─ distributeByWeight(disciplinas, total)
      │       │     ideal → piso → mínimo 1 se couber → maior resto
      │       ├─ por disciplina, blocos em rodízio a partir do que já existe
      │       └─ rodízio entre disciplinas para espalhar pelos dias
      │       ▼
      │   tabela por dia: tipo · disciplina · bloco
      │
      └─ [Gerar metas da semana]  ── submit
              │
              ├─ a MESMA função pura, com o ponto de partida relido do banco
              ├─ batchIdFor(plano, semana, modo, minutos, teoria, dias,
              │              blocos, total, pesos)
              ▼
        apply_study_plan_batch — replay pelo próprio id do lote
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/metas` |
| Componentes | `GenerateWeekForm` ganha os pesos, o botão de prévia e a tabela |
| Actions | `generateWeek`, que passa a ler total e pesos |
| Domínio | `distributeByWeight` e `buildWeek`, em `lib/domain/week-planner.ts`, com testes de unidade |
| Leitura | o loader passa a trazer, por bloco, quantas metas de bateria já existem |
| RPCs | **nenhuma nova** |
| Migration | **nenhuma** |
| Testes | `apps/web/src/lib/domain/teacher.test.ts` (`shareByWeight`, `planWeek`), `apps/e2e/tests/teacher.spec.ts` |

**O formulário ganhou `noValidate`**, pela mesma razão do de login (F-AUTH-03):
quem valida é a action, e a mensagem sai em português dentro da tela. Com a
validação nativa ligada, `max={80}` no total faria o navegador barrar o envio
com uma tooltip própria — a action nunca rodaria, e a regra do teto viveria em
dois lugares.

**O `id` do campo de peso é por índice, não pelo nome da disciplina.**
"Ciências Forenses" tem espaço e acento, e `#peso-Ciências Forenses` não é
seletor CSS válido. O `name` continua carregando o nome, que é o que a action
lê, e é por ele que o teste endereça o campo.

**Sem `prioridadeCiclo`.** A v96 repetia o bloco no ciclo conforme a incidência
dele na prova — altíssima 3×, alta 2×, média 1× —, lido de um JSON empacotado no
bundle. Aqui não existe coluna de incidência em `catalog_blocks` nem em
`study_plan_blocks`, e inventá-la seria migration. O peso por **disciplina**
cobre o caso principal; peso por bloco é spec própria, se alguém precisar.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A repartição segue ideal → piso → mínimo 1 quando cabe → maior resto, e é determinística no empate | `week-planner.test.ts` |
| CA-02 | Peso 0 tira a disciplina da semana, mesmo com o mínimo de `R-PREV-03` valendo para as outras | `week-planner.test.ts` |
| CA-03 | Pesos todos iguais e total igual ao número de blocos produzem **exatamente** uma meta por bloco — o comportamento anterior | `week-planner.test.ts` |
| CA-04 | O rodízio de blocos continua de onde a semana anterior parou | `week-planner.test.ts` |
| CA-05 | A prévia mostra as metas agrupadas por dia e o total, sem gravar nada | F-PREV-01 |
| CA-06 | O que a prévia mostrou é o que a semana recebe | F-PREV-02 |
| CA-07 | Peso maior numa disciplina faz ela receber mais metas que a de peso menor | F-PREV-03 |
| CA-08 | Peso 0 tira a disciplina da semana gerada | F-PREV-04 |
| CA-09 | Total fora de 1–80 e peso fora de 0–20 são recusados, e nada é gravado | F-PREV-05 |
| CA-10 | Mudar um peso e reenviar **não** é tratado como replay: a semana muda | F-PREV-06 |

---

## Fora de escopo

- **Peso por bloco**, e a `prioridadeCiclo` da v96. Ver a Superfície.
- **Prévia obrigatória.** A v96 exigia; aqui é opcional (`R-PREV-13`).
- **Salvar o peso como configuração do planejamento.** Hoje ele é preenchido a
  cada geração, com o padrão 1. Persistir exigiria coluna em `study_plan_blocks`
  ou tabela nova — migration, e ninguém pediu ainda.
- **Copiar a semana anterior.** A v96 tinha (`copiarSemanaAnterior`), agrupando
  por disciplina e unindo os dias. É fluxo próprio e entra na fila.
- **Editar a prévia antes de salvar** — arrastar uma meta de dia, trocar o bloco
  de uma linha. Vira um editor, e o formulário deixa de ser um formulário.
- **Distribuir metas de teoria por peso.** A teoria continua acompanhando cada
  bateria, como hoje, quando a caixa está marcada.
