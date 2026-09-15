# 25 — Tempo de estudo, série semanal e sequência de dias

**Situação:** implementada · **Comparativo:** §12 item 10 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §5 e §9 · **Fluxos e2e:** F-EST-01

> **Atualizada em 14/09/2026.** As views `vw_study_time` e as séries derivadas não foram portadas. Os números
> saem hoje de `goal_entries`, agregados em `lib/domain` com teste de unidade, e
> conferidos na tela por `F-EST-01`.

---

## Problema

O tempo é registrado e nunca lido.

`record_quiz_session_time` grava `quiz_sessions.duration_minutes` desde a
migration inicial. `complete_goal` grava `goals.spent_minutes` desde a spec
[12](12-conclusao-de-meta.md). `vw_goal_performance` já combina os dois em
`minutes_spent`. E nenhuma tela mostra quanto o aluno estudou — nem hoje, nem
esta semana, nem no total.

Faltam três leituras, e a versão anterior tinha as três:

- **tempo por período**, dividido por disciplina e por atividade extra —
  `obterResumoTempoEstudo` (aluno.js:924) e `renderTempoEstudoStats`
  (professor.js:644). Cinco períodos: hoje, semana, mês, ano, total;
- **série por semana** — `getWeeklyStats` (aluno.js:3549): metas concluídas,
  questões, acertos, tempo e percentual, semana a semana. É a única leitura do
  produto que mostra **evolução** em vez de estado;
- **sequência de dias** — `calcularSequenciaEstudos` (aluno.js:1162): quantos
  dias seguidos o aluno concluiu alguma coisa.

As três respondem à mesma pergunta que nenhuma tela responde hoje: **o aluno
está mantendo o ritmo?** O desempenho diz se ele acerta; nada diz se ele
aparece.

---

## Regras

### A fonte

| Id | Regra |
|---|---|
| R-TEMP-01 | Os três números saem de uma **view nova**, `vw_study_time`, com uma linha por **meta concluída**. Nenhum contador mantido à mão, como em todo agregado deste schema. |
| R-TEMP-02 | O tempo da linha é `coalesce(sum(duration_minutes), spent_minutes)` — a **mesma regra** de `vw_goal_performance`, e é por isso que ela mora numa view e não no cliente. Três caminhos independentes calculando o mesmo número foi o defeito da versão anterior. |
| R-TEMP-03 | A data da linha é `goals.completed_at`, convertida para **data local do fuso do produto** (`America/Sao_Paulo`). Contar em UTC jogaria um estudo das 22h de sexta para sábado, e a sequência de dias quebraria sozinha. |
| R-TEMP-04 | Só entram metas **`completed`** e não excluídas. Meta reaberta sai da série no mesmo instante — é o que `complete_goal`/`reopen_goal` da spec [12](12-conclusao-de-meta.md) já significam. |
| R-TEMP-05 | A view tem `with (security_invoker = true)` e não ganha policy nova: as tabelas base já passam por `can_view_context`, então aluno e professor enxergam o que lhes cabe. |
| R-TEMP-06 | A linha carrega **disciplina** (do bloco) e **atividade extra** (`goals.extra_activity`), porque a divisão do tempo da v96 é por um ou por outro, nunca pelos dois ao mesmo tempo. |

### Tempo por período

| Id | Regra |
|---|---|
| R-TEMP-07 | Os períodos são os cinco da v96: **hoje, semana, mês, ano, total**. "Semana" é a semana **corrente começando na segunda**, não os últimos sete dias — é o que `filtrarMetasPorPeriodoTempo` faz (aluno.js:1201). |
| R-TEMP-08 | Meta **sem bloco** — teoria avulsa, estudo extra — é agrupada pela **atividade**; meta com bloco, pela **disciplina**. Uma linha por grupo, da maior para a menor, e o total é a soma. |
| R-TEMP-09 | **Toda meta concluída tem tempo**, e a view pode contar com isso. Os dois únicos caminhos até `status = 'completed'` exigem o minuto: `complete_goal` recusa fora de 1..240 e `record_quiz_session_time` recusa nulo. A v96 aceitava meta concluída sem tempo e somava `Number(m.tempo)||0`; aqui o estado não é exprimível, e é o banco que garante. *Corrigido em 30/08/2026, ao implementar: a regra anterior descrevia um estado impossível.* |
| R-TEMP-10 | Período sem meta concluída nenhuma mostra estado vazio nomeado — "Nenhum tempo registrado neste período" —, e não zero. Zero e "não registrou" são coisas diferentes. |

### Série por semana

| Id | Regra |
|---|---|
| R-TEMP-11 | A série é por **semana do planejamento** (`goals.week_number`), não por semana do calendário. É o eixo que o resto do produto usa, e é o que torna a série comparável com a tela de metas. |
| R-TEMP-12 | Cada ponto traz **metas concluídas, questões, acertos, tempo e percentual**. O percentual é `acertos ÷ questões` das metas **de bateria**: teoria e extra não têm questão e diluiriam a conta. |
| R-TEMP-13 | Semana planejada e **sem nada concluído** aparece com zeros, e não some. Sumir esconderia justamente a semana em que o aluno parou. |
| R-TEMP-14 | A série mostra no máximo as **12 últimas semanas** com movimento, como a v96. Um planejamento de 40 semanas vira uma parede ilegível. |

### Sequência de dias

| Id | Regra |
|---|---|
| R-TEMP-15 | A sequência conta **dias distintos com pelo menos uma meta concluída**, para trás, sem buraco. Duas metas no mesmo dia contam um dia. |
| R-TEMP-16 | Contando de hoje: se hoje não tem nada, tenta **ontem**; se ontem também não, a sequência é **zero**. É a regra da v96, e é o que impede a sequência de zerar às 00h01 de quem estudou ontem à noite. |
| R-TEMP-17 | A sequência é calculada por **função pura** sobre a lista de datas, testada em `apps/web/src/lib/domain`. É a única das três leituras com regra de calendário, e é onde erro de fuso se esconde. |
| R-TEMP-18 | O aluno vê a própria sequência; o professor vê a de cada aluno na ficha. Nenhuma comparação entre alunos: sequência é sinal de ritmo, não placar. |

---

## Fluxo

```
goals concluídas ──┐
                   ├─ vw_study_time: uma linha por meta concluída
quiz_sessions ─────┘     data local · minutos · disciplina · atividade
                         semana · questões · acertos
      │
      ├─ tempo por período   → filtra por data, agrupa por disciplina/atividade
      ├─ série por semana    → agrupa por week_number, últimas 12
      └─ sequência de dias   → datas distintas, conta para trás sem buraco
                                hoje vazio? tenta ontem. ontem vazio? zero.
      ▼
 /aluno/estatisticas      as três
 /professor/alunos/:id    as três, do aluno
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno/estatisticas` e `/professor/alunos/:studentId` |
| Componentes | `StudyTime.tsx`, `WeeklySeries.tsx`, `StudyStreak.tsx` |
| Actions | **nenhuma** — as três são só leitura |
| Leitura | `getStudyTime`, em `lib/data/student.ts` |
| Domínio | `lib/domain/study-time.ts` — períodos, agrupamento, série e sequência |
| RPCs | **nenhuma nova** |
| Migration | **uma:** `create view vw_study_time` |
| Testes | `apps/web/src/lib/domain/week.test.ts` (`streakDays`, `summarizeWeek`), `apps/e2e/tests/student-analysis.spec.ts` |

**A fila previa "site" e saiu com uma migration.** O motivo é `R-TEMP-02`: a
regra de qual minuto conta já mora em `vw_goal_performance`, e reimplementá-la
no cliente criaria o segundo caminho para o mesmo número. Uma view aditiva custa
menos que essa duplicação.

**O período é escolhido na tela e não vai para o banco.** A view devolve as
linhas do planejamento; filtrar por data é trabalho de função pura, testada sem
banco. É o que permite os oito casos de borda de fuso serem teste de unidade.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | A view traz uma linha por meta concluída, com o minuto vindo da bateria ou do declarado | `12_study_time.sql` |
| CA-02 | Meta reaberta sai da view; meta excluída nunca entra | `12_study_time.sql` |
| CA-03 | A view tem `security_invoker`, e um aluno não vê o tempo de outro | `12_study_time.sql` |
| CA-04 | Os cinco períodos filtram pelo que a v96 filtra, com a semana começando na segunda | `study-time.test.ts` |
| CA-05 | O agrupamento separa disciplina de atividade extra, e ordena por tempo | `study-time.test.ts` |
| CA-06 | A sequência conta dias distintos, tolera hoje vazio e zera com ontem vazio | `study-time.test.ts` |
| CA-07 | A série traz as 12 últimas semanas, com semana parada em zero | `study-time.test.ts` |
| CA-08 | O aluno vê o tempo do período, dividido por disciplina | F-TEMP-01 |
| CA-09 | Trocar o período troca os números | F-TEMP-02 |
| CA-10 | Período sem tempo mostra o estado vazio, não zero | F-TEMP-03 |
| CA-11 | A série mostra uma linha por semana, com metas, questões e tempo | F-TEMP-04 |
| CA-12 | A sequência aparece e conta os dias de estudo | F-TEMP-05 |
| CA-13 | Não existe meta concluída sem minuto: os dois caminhos de conclusão recusam nulo | `12_study_time.sql` |
| CA-14 | O professor vê as três leituras do aluno na ficha | F-TEMP-06 |
| CA-15 | Reabrir uma meta tira o tempo dela das três leituras | F-TEMP-07 |

---

## Fora de escopo

- **Compartilhar post de tempo de estudo em canvas** (`gerarPostTempoEstudoCanvas`,
  aluno.js:986, 1080×1350). É conforto, e depende de `navigator.share`, que não
  existe em todo navegador.
- **Radar por disciplina.** `svgRadarDisciplinas` (aluno.js:3679) é outra
  leitura, com outra regra de mínimo de matérias.
- **Filtros de histórico por plano e por ano.** `carregarHistoricoEstatisticasAluno`
  (aluno.js:777) é navegação entre planejamentos, e vale para todas as telas de
  estatística de uma vez.
- **Série por semana de calendário.** A v96 tinha os dois eixos; aqui é a semana
  do planejamento (`R-TEMP-11`), porque é a que o resto do produto usa.
- **Comparar sequência entre alunos.** Ver `R-TEMP-18`.
- **Meta de tempo semanal.** `study_plans.weekly_goals` existe e conta metas,
  não minutos. Transformá-la em meta de tempo é outra decisão de produto.
