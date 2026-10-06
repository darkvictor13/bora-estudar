# 04 — Geração da semana

**Situação:** implementada · **Fluxos e2e:** F-PROF-04, F-PROF-05, F-PROF-06, F-PROF-10, F-PROF-11

> **Reescrita em 06/10/2026 (QA de 06/10/2026).** `apply_study_plan_batch`, `study_plan_batches`
> e `batch_mode` saíram no schema de 14/09/2026. A geração passou a `generate_week`, com um
> comportamento só: o modo "Replanejar semana inteira" foi removido.

---

## Problema

Montar a semana é a única coisa que o professor escreve hoje, e é a operação
com o maior potencial de estrago: ela cria dezenas de metas de uma vez e apaga o
que estava lá e não foi feito.

Na versão anterior isso era `DELETE` seguido de `INSERT`, disparados do
navegador, sem transação. Um `DELETE` que passava e um `INSERT` que falhava
deixavam a semana vazia. Pior: o botão não era idempotente — clicar duas vezes
gerava a semana duas vezes, e a `day_order` era calculada no cliente lendo o
máximo atual, o que colidia sempre que duas gerações se cruzavam.

**O QA de 06/10/2026 achou os dois defeitos de volta**, agora no adaptador do
Supabase. **QA-01:** gerar a semana apagava o estudo registrado — o critério de
"o que fica" só olhava `completed`, e `goal_entries_goal_fk` em `cascade` levava
o registro da meta em andamento junto, sem erro. **QA-05:** o `DELETE` e o
`INSERT` eram duas requisições; com a segunda caindo, a semana ia de 5 metas
para 0. E a retentativa chegava como operação nova, porque o `request_id` nascia
a cada clique.

---

## Regras

| Id | Regra |
|---|---|
| R-GEN-01 | Só o professor responsável pelo planejamento gera, limpa ou vê a prévia: `generate_week`, `clear_pending_goals` e `week_replacement_preview` conferem `study_plans.teacher_id = auth.uid()` e `is_teacher_of(student_id)`. Senão, levantam `42501`. |
| R-GEN-02 | **O lote é idempotente pela própria chave.** `goal_batches.id` (a PK) É o `request_id`. Mesmo id com o mesmo `(plano, semana)` devolve `true` (replay) sem tocar em `goals`; o mesmo id com outro `(plano, semana)` é recusado. |
| R-GEN-03 | **Removida em 06/10/2026**, substituída por R-GEN-19: o `batch_id` derivado do conteúdo morreu com `apply_study_plan_batch`. |
| R-GEN-04 | **Removida em 06/10/2026**: não há mais modos (R-GEN-12). |
| R-GEN-05 | **Removida em 06/10/2026**: meta com bateria, aberta ou não, é preservada (R-GEN-13). |
| R-GEN-06 | **`day_position` é calculada no banco**, depois da maior posição que sobrou no dia. Ver R-GEN-16. |
| R-GEN-07 a R-GEN-10 | **Removidas em 14/09/2026**: o formulário de blocos e dias não existe mais; a distribuição é `planWeek` (spec [18](18-previa-e-distribuicao-da-semana.md)). |
| R-GEN-11 | **Removida em 14/09/2026**: não há `deleted_at`. Meta sem histórico sai da tabela; meta com histórico não sai (R-GEN-14). |
| R-GEN-12 | **Gerar tem um comportamento só.** Não há modo, nem seletor de substituição, nem confirmação extra.<br><br>"Replanejar semana inteira" foi removido em 06/10/2026 por decisão do dono do produto. Com a meta concluída preservada (R-GEN-13), ele apagaria exatamente o mesmo que o padrão, e uma tela com dois caminhos iguais promete uma diferença que não existe. |
| R-GEN-13 | **Fica de pé** a meta concluída e a meta com HISTÓRICO, que é ter linha em `goal_entries` ou ter bateria (`quiz_sessions.goal_id` ou `origin_goal_id`).<br><br>**Sai** a pendente, a pulada e a em andamento sem histórico.<br><br>O critério mora num lugar só, `app_private.goal_is_preserved`, usado pela geração, pela prévia e pela limpeza. |
| R-GEN-14 | **Nenhum caminho apaga meta com estudo registrado.** `goal_entries_goal_fk` é `on delete no action`, então até o `DELETE` direto pela API falha com `23503`. |
| R-GEN-15 | **Gerar é uma transação.** O `generate_week` apaga e insere na mesma chamada; uma falha em qualquer ponto deixa a semana como estava. |
| R-GEN-16 | As metas novas entram **depois da maior posição que sobrou** em cada dia. Dentro do dia, são renumeradas na ordem do lote. O cálculo é no banco, nunca no cliente. |
| R-GEN-17 | A semana é um inteiro de 1 a 520 (`goals_week_number_check`, `checkWeekNumber`). Os minutos previstos são ≥ 0 (`goals_planned_minutes_check`). |
| R-GEN-18 | A prévia conta o que fica e o que sai pelo mesmo critério (`week_replacement_preview`). A métrica "Preservadas" diz que inclui as metas com estudo registrado. |
| R-GEN-19 | O `request_id` nasce com a prévia e é o mesmo em toda tentativa de gravá-la. |
| R-GEN-20 | "Limpar pendentes" (`clear_pending_goals`) apaga exatamente o que Gerar substituiria, e nada insere. É naturalmente idempotente: só apaga, e o pior caso é segurado por `goal_entries_goal_fk`. Não tem botão: nenhuma tela chama `clearPendingGoals`, e se ganhar uma será "Esvaziar a semana", não uma variante de Gerar. |
| R-GEN-21 | `goal_batches` é SELECT para o professor dono. Quem escreve é `generate_week`. |

---

## Fluxo

```
/professor/metas
   plano · semana · minutos · dias · blocos · teoria
        │
        ▼
[Ver prévia]  ── planWeek no navegador (distribuição)
   ├─ checkGenerateWeek                   → recusa semana fora de 1 a 520
   ├─ week_replacement_preview(plano, semana)
   │        └─ (total, preservadas)       → o que fica e o que sai, pelo critério do banco
   └─ guarda a prévia JUNTO com o request_id (nasce aqui, uma vez)
        │
        ▼
[Gerar N metas]  ── repete o mesmo request_id em toda tentativa
   └─ generate_week(p_request_id, plano, semana, p_goals)
              │
              ├─ confere o dono do plano          → 42501 se não for
              ├─ for no key update no plano       → seriação
              ├─ o lote já existe?                → replay: true, nada muda
              ├─ grava goal_batches
              ├─ apaga o que goal_is_preserved não segura
              └─ insere as metas, depois da maior posição que sobrou
```

A fixture (`VITE_API_IMPL=fixtures`) cumpre o mesmo contrato, com as mesmas
frases.

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/metas` (`?plano=<uuid>`, `?semana=<n>`) |
| Tela | `routes/teacher/Goals.tsx` |
| Adaptador | `lib/api/supabase/teacher-goals.ts` |
| Validação | `checkWeekNumber` e `checkGenerateWeek`, em `lib/api/validation.ts` |
| Domínio | `planWeek` — `lib/domain/teacher.ts` |
| RPC | `generate_week(p_request_id, p_study_plan_id, p_week_number, p_goals)`, `clear_pending_goals(p_study_plan_id, p_week_number)`, `week_replacement_preview(p_study_plan_id, p_week_number)` |
| Banco | `goals` e `goal_batches`; `app_private.goal_is_preserved`; `goal_entries_goal_fk` |
| Migration | `generate_week` (06/10/2026) |

---

## Critérios de aceitação

CA-01 a CA-04 e CA-08 foram **removidos em 06/10/2026**: descreviam a forma do
formulário e o modo `append`, que não existem mais. CA-05 a CA-07 foram
**substituídos** por CA-11 a CA-13.

| Id | Critério | Cobertura |
|---|---|---|
| CA-09 | Professor de outro aluno chamando a RPC recebe `42501` | F-ISO-02, `supabase/tests/03_goals.sql` |
| CA-10 | `?plano=` com id inválido cai no planejamento ativo | sem cobertura — PR 8 (D-13) |
| CA-11 | A meta em andamento com registro sobrevive a Gerar, com os registros | F-PROF-05, `03_goals` |
| CA-12 | A meta concluída sem registro sobrevive; a pendente, a pulada e a em andamento sem registro saem | F-PROF-05, `03_goals` |
| CA-13 | A prévia conta como preservadas a concluída e a com registro | F-PROF-05 |
| CA-14 | Gravação que falha deixa a semana intacta | F-PROF-10, `03_goals` |
| CA-15 | Repetir o mesmo pedido depois de gravado não duplica | F-PROF-10, `03_goals` |
| CA-16 | Id reusado com outro `(plano, semana)` é recusado | `03_goals` |
| CA-17 | Professor alheio e aluno recebem `42501` | `03_goals` |
| CA-18 | Semana fora de 1 a 520 é recusada | F-PROF-11, `07_schema` |
| CA-19 | `DELETE` direto de meta com registro dá `23503` | `03_goals` |
| CA-20 | Limpar apaga o mesmo que Gerar substituiria; a segunda chamada apaga 0 | `03_goals` |
| CA-21 | Apagar a conta continua passando | `07_schema` |
| CA-22 | Metas novas entram depois da maior posição do dia | `03_goals` |
| CA-23 | A tela não tem seletor de substituição nem confirmação de "replanejar" | F-PROF-05 |

---

## Fora de escopo

- **`goals.batch_id`.** Nenhuma tela lê de qual lote veio uma meta, e a coluna
  nasceria exposta pelo `grant insert` de tabela inteira em `goals`.
- **Gerar em planejamento pausado ou arquivado.** A tela só lista os ativos, e a
  RPC não decide isso.
- **O modo `append`.**
- **Um caminho que apague meta concluída ou com histórico.** Quem precisar disso
  precisa de spec nova, porque é exatamente o que o QA-01 condenou.
- **Apagar planejamento com estudo registrado.** Passa a falhar com `23503`
  (R-GEN-14); nenhuma tela apaga planejamento.
- **Peso por matéria, copiar a semana anterior e editar meta individual:** ver
  a spec [18](18-previa-e-distribuicao-da-semana.md).
- **Metas de reforço e de estudo extra.** `planWeek` só produz `theory` e
  `question_block`.
