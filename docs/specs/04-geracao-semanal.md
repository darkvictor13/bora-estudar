# 04 — Geração da semana

**Situação:** implementada · **Fluxos e2e:** F-PROF-04 a F-PROF-06

---

## Problema

Montar a semana é a única coisa que o professor escreve hoje, e é a operação
com o maior potencial de estrago: ela cria dezenas de metas de uma vez e, nos
modos que substituem, apaga o que estava lá.

Na versão anterior isso era `DELETE` seguido de `INSERT`, disparados do
navegador, sem transação. Um `DELETE` que passava e um `INSERT` que falhava
deixavam a semana vazia. Pior: o botão não era idempotente — clicar duas vezes
gerava a semana duas vezes, e a `day_order` era calculada no cliente lendo o
máximo atual, o que colidia sempre que duas gerações se cruzavam.

---

## Regras

| Id | Regra |
|---|---|
| R-GEN-01 | Só o professor responsável pelo planejamento gera: `apply_study_plan_batch` compara `study_plans.teacher_id` com `auth.uid()` e levanta `42501`. |
| R-GEN-02 | **O lote é idempotente pela própria chave.** `study_plan_batches.id` é o `p_batch_id`; se já existe, a RPC devolve `{replay: true}` e não toca em `goals`. |
| R-GEN-03 | O `batch_id` é **derivado do conteúdo do lote** — SHA-256 de `(plano, semana, modo, minutos, teoria, dias, blocos)`, formatado como UUID v8. Gerar um UUID novo a cada submissão transformaria R-GEN-02 em decoração: todo reenvio chegaria como lote inédito. |
| R-GEN-04 | Três modos, no enum `batch_mode`: `append` acrescenta; `replace` marca `deleted_at` nas metas `pending`/`in_progress`/`skipped` da semana; `replan` marca todas **exceto** as que têm bateria concluída. |
| R-GEN-05 | Bateria aberta na semana bloqueia `replace` e `replan`: `ha bateria aberta nesta semana`. Os resultados dela ainda não foram gravados e seriam perdidos. |
| R-GEN-06 | **`day_order` é calculada no banco**, somando o maior valor sobrevivente daquele dia. Nunca por leitura-do-máximo no cliente. |
| R-GEN-07 | A ordem dos blocos que decide em que dia cada um cai é a **ordem que o banco devolveu** (`subject_order`, `block_order`), não a ordem do formulário. É essa ordem que entra no `batch_id`. |
| R-GEN-08 | Os blocos escolhidos precisam pertencer ao planejamento; um id de outro planejamento faz a action recusar antes de chamar a RPC. |
| R-GEN-09 | A distribuição é rodízio simples: bloco *i* cai no dia `weekdays[i % weekdays.length]`. Com teoria ligada, cada bloco ganha uma meta `theory` no mesmo dia e imediatamente antes. |
| R-GEN-10 | Sem dia marcado ou sem bloco marcado, a action recusa com mensagem própria, antes de qualquer ida ao banco. |
| R-GEN-11 | O soft delete dos modos que substituem é `deleted_at`; nada sai da tabela, e o `audit_log` registra. |

---

## Fluxo

```
/professor/metas  (GenerateWeekForm)
   semana · minutos · modo · dias · blocos · teoria
        │
        ▼
generateWeek (action)
   ├─ requireRole("teacher")
   ├─ valida dias e blocos               → recusa sem ir ao banco
   ├─ lê os blocos do planejamento        (ordem: subject_order, block_order)
   ├─ buildWeek(...)                      → rascunho das metas, position por dia
   ├─ batchIdFor(...)                     → SHA-256 do conteúdo → UUID v8
   └─ rpc apply_study_plan_batch
              │
              ├─ lote já existe?          → { replay: true }, nada muda
              ├─ for update no plano       → seriação
              ├─ modo replace/replan       → checa bateria aberta, soft delete
              ├─ grava o lote em study_plan_batches
              └─ insere as metas, day_order = maior sobrevivente + seq
```

A mensagem de volta distingue os dois casos: *"N meta(s) criada(s) na semana W"*
ou *"Este lote já tinha sido aplicado: as N meta(s) da semana W continuam como
estavam."*

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/metas` (`?plano=<uuid>`) |
| Tela | `routes/teacher/Goals.tsx`, `components/teacher/GenerateWeekForm.tsx` |
| Action | `generateWeek` — `lib/data/teacher-actions.ts` |
| Domínio | `buildWeek` — `lib/domain/week-planner.ts` (testado em `week-planner.test.ts`) |
| Idempotência | `batchIdFor` — SHA-256 via `crypto.subtle`, UUID v8 |
| RPC | `apply_study_plan_batch(p_batch_id, p_study_plan_id, p_week, p_mode, p_goals)` |
| Banco | `study_plan_batches`, `goals`, enum `batch_mode` |

Campos do formulário: `#week` (padrão: última semana + 1), `#minutes` (60),
`#mode`, `input[name=weekdays]` (seg–sex marcados), `input[name=blocks]` (todos
marcados), `input[name=withTheory]`.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Com 2 blocos e teoria ligada, a submissão cria 4 metas e responde "4 meta(s) criada(s) na semana N" | F-PROF-04 |
| CA-02 | Submeter o **mesmo formulário** duas vezes não cria metas novas, e a resposta diz que o lote já tinha sido aplicado | F-PROF-05 |
| CA-03 | Mudar qualquer campo — outro dia, outro bloco, outro modo — produz um lote novo | F-PROF-05 |
| CA-04 | Sem dia: "Escolha pelo menos um dia de estudo." Sem bloco: "Escolha pelo menos um bloco." | F-PROF-06 |
| CA-05 | `replace` marca `deleted_at` nas metas `pending`/`in_progress`/`skipped` da semana | F-PROF-07 |
| CA-06 | `replan` preserva as metas com bateria concluída | F-PROF-07 |
| CA-07 | Bateria aberta na semana bloqueia `replace` e `replan` com `ha bateria aberta nesta semana` | F-PROF-07 |
| CA-08 | Gerar duas vezes em `append` não colide: `day_order` continua a maior sobrevivente do dia | F-PROF-04, `supabase/tests/03_goals.sql` |
| CA-09 | Professor de outro aluno chamando a RPC recebe `42501` | F-ISO-02 |
| CA-10 | `?plano=` com id inválido cai no planejamento ativo | F-PROF-08 |

---

## Fora de escopo

- **Prévia antes de salvar.** A v2 mostrava a distribuição por dia antes de
  gravar; aqui a submissão já grava. O que protege é a idempotência, não a
  prévia.
- **Peso por matéria.** O rodízio é uniforme: um bloco por dia, em ordem. A v2
  distribuía por peso e por quantidade de metas por matéria.
- **Copiar a semana anterior.** Não existe.
- **Editar meta individual depois de gerada.** O `GRANT UPDATE` em `goals`
  permite, nenhuma tela usa.
- **Metas de reforço e de estudo extra.** `buildWeek` só produz `theory` e
  `question_block`. Os outros dois tipos existem no enum e no seed, e não são
  gerados por aqui.
