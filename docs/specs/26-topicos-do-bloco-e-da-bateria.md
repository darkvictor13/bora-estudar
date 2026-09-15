# 26 — Tópicos do bloco e resumo da bateria

**Situação:** implementada · **Comparativo:** §12 item 11 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §5 · **Fluxos e2e:** **sem cobertura** — depende do motor de baterias

> **Atualizada em 14/09/2026.** O resumo por tópicos lê o ledger da bateria, e o motor saiu com a extensão.
> `vw_session_topics` não foi portada.

---

## Problema

O aluno estuda um bloco sem saber o que tem dentro, e termina uma bateria sem
saber onde errou.

Antes: `/aluno/cadernos` lista "Bloco 3 — Regência, Concordância, Paralelismo e
Correção" e o número de questões. O que **cai** ali dentro, o aluno descobre
respondendo. A v96 mostrava, num `<details>` chamado "Ver o que será estudado"
— `htmlTopicosBloco` (aluno.js:1514) —, e para isso baixava um JSON de 1,97 MB
com o catálogo inteiro.

Depois: a bateria termina, o aluno vê "11/15" e nada mais. A v96 mostrava
"TÓPICOS ESTUDADOS", com acertos e erros por tópico daquela bateria —
`resumoBateriaDb` (aluno.js:4444), reconstruído de
`reconstruirResumoTopicosBateriaDb` (aluno.js:4425).

São a mesma pergunta em dois momentos: **de que assunto é isso?** A spec
[23](23-dificuldades-por-topico.md) respondeu para o planejamento inteiro —
"onde você está errando, no acumulado". Falta o recorte de **uma bateria**, que
é o que o aluno quer ver no minuto em que termina.

E aqui o dado já está no banco: `catalog_questions.topic` é `not null`,
`quiz_session_questions.topic` guarda o tópico da ocorrência desde a spec
[21](21-fases-na-extensao.md). Nada de JSON de 1,97 MB.

---

## Regras

### Antes: os tópicos do bloco

| Id | Regra |
|---|---|
| R-RESU-01 | Cada bloco do planejamento mostra os tópicos que ele cobre, com **quantas questões** cada um tem, num bloco recolhido — "Ver o que será estudado". Recolhido porque um bloco de 27 tópicos empurraria a tabela inteira para fora da tela. |
| R-RESU-02 | Os tópicos vêm de `catalog_questions` do bloco de catálogo vinculado. **A extensão continua sem catálogo embutido**, e o site não baixa JSON nenhum: é uma consulta agregada, e a lista é do bloco aberto, não de todos. |
| R-RESU-03 | Bloco **sem catálogo vinculado** — criado à mão pelo professor — não mostra a seção. Não é erro: é bloco sem questões cadastradas. |
| R-RESU-04 | A ordem é por **número de questões**, da maior para a menor. É a ordem que responde "o que pesa neste bloco". |

### Depois: o resumo da bateria

| Id | Regra |
|---|---|
| R-RESU-05 | O resumo é por **bateria**, não por planejamento: uma linha por tópico daquela sessão, com feitas, acertos e erros. O acumulado é a spec [23](23-dificuldades-por-topico.md), e as duas respondem a perguntas diferentes. |
| R-RESU-06 | O resumo sai de uma **view nova**, `vw_session_topics`, com uma linha por `(bateria, tópico)` e as três fases separadas. É a mesma forma de `vw_quiz_session_performance`, um nível abaixo. |
| R-RESU-07 | **As três fases entram, e separadas.** Diferente da spec 23, que olha só `main`: ali o número é nota, e nota é das principais; aqui o número é diagnóstico da sessão, e o aluno quer saber que errou a correlata do mesmo assunto. |
| R-RESU-08 | Só bateria **`completed`**. Bateria em andamento não tem resumo, e anulada saiu do desempenho — mostrá-la contradiria a tela que a anulou. |
| R-RESU-09 | Questão sem tópico entra como **"Tópico não identificado"**, como em `vw_topic_difficulty`. Sumir esconderia erro real por falha de cadastro. |
| R-RESU-10 | A view tem `with (security_invoker = true)` e nenhuma policy nova: `quiz_session_questions` já passa por `can_view_context`. |

### A tela

| Id | Regra |
|---|---|
| R-RESU-11 | O aluno vê as **próprias baterias concluídas** em `/aluno/estatisticas`, da mais recente para a mais antiga, e abre o resumo de uma por vez. Hoje ele não tem tela nenhuma de histórico — a de baterias é do professor, na spec [16](16-historico-e-anulacao-de-bateria.md). |
| R-RESU-12 | A bateria escolhida vai na **query string** (`?bateria=`), como `?bloco=` em `/aluno/revisoes`. Estado de navegação mora na URL: recarregar mantém, e o link é compartilhável com o professor. |
| R-RESU-13 | Id de bateria que não é do aluno, ou não existe, **não quebra a tela**: nenhum resumo é mostrado. A RLS já não devolveria a linha; a tela não pode reagir a isso com erro. |
| R-RESU-14 | O professor vê o mesmo resumo na ficha do aluno, a partir do cartão "Baterias" que a spec 16 já criou. |

---

## Fluxo

```
catalog_questions ──► tópicos do bloco (contagem por tópico)
      ▼
 /aluno/cadernos    "Ver o que será estudado", recolhido

quiz_session_questions ──► vw_session_topics
      │                       uma linha por (bateria, tópico)
      │                       principais · extras · reforços, separados
      ▼
 /aluno/estatisticas       lista de baterias concluídas
      │                    └─ ?bateria=<id> abre o resumo
 /professor/alunos/:id     o mesmo resumo, do cartão "Baterias"
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno/cadernos`, `/aluno/estatisticas`, `/professor/alunos/:studentId` |
| Componentes | `BlockTopics.tsx`, `SessionTopics.tsx` |
| Actions | **nenhuma** — tudo é leitura |
| Leitura | `getBlockTopics` e `getSessionTopics`, em `lib/data/student.ts` |
| RPCs | **nenhuma nova** |
| Migration | **uma:** `create view vw_session_topics` |
| Banco | `catalog_questions` e `quiz_session_questions`, leitura |
| Testes | **sem cobertura** enquanto o motor de baterias não voltar |

**A v96 baixava 1,97 MB de catálogo para responder isto.** Aqui são duas
consultas agregadas, e a extensão continua sem catálogo embutido — o tópico
viaja no payload desde a spec 21, e some quando a bateria termina.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A view agrupa por (bateria, tópico) e separa as três fases | `13_session_topics.sql` |
| CA-02 | Só bateria `completed` entra; em andamento e anulada ficam de fora | `13_session_topics.sql` |
| CA-03 | Questão sem tópico entra como "Tópico não identificado" | `13_session_topics.sql` |
| CA-04 | A view tem `security_invoker`, e um aluno não vê a bateria de outro | `13_session_topics.sql` |
| CA-05 | O bloco mostra seus tópicos com a contagem de questões | F-RESU-01 |
| CA-06 | Bloco sem catálogo vinculado não mostra a seção | F-RESU-02 |
| CA-07 | O aluno abre uma bateria concluída e vê o resumo por tópico | F-RESU-03 |
| CA-08 | O resumo separa principais de extras e reforços | F-RESU-04 |
| CA-09 | Bateria de outro aluno em `?bateria=` não mostra nada e não quebra | F-RESU-05 |
| CA-10 | O professor vê o mesmo resumo na ficha | F-RESU-06 |

---

## Fora de escopo

- **Resumo por tópicos no painel da extensão.** É a spec
  [28](28-painel-arrastavel-e-topicos.md): mesmo número, outro momento — ali o
  aluno ainda está no TEC, e o painel o calcula localmente, sem rede.
- **Comparar tópicos entre duas baterias.** Evolução por tópico é a série da
  spec [25](25-tempo-de-estudo-e-series.md) aplicada a outro eixo, e pede outra tela.
- **Editar o tópico de uma questão.** É catálogo, e catálogo é do admin.
- **Filtrar a bateria por tópico antes de começar.** Escolher o que cai é do
  motor de seleção, spec [22](22-rodizio-por-topico.md), e ali o critério é
  cobertura, não escolha do aluno.
- **Anular bateria pela tela do aluno.** Anular é do professor, spec
  [16](16-historico-e-anulacao-de-bateria.md).
