# 19 — Estudo extra avulso

**Situação:** implementada · **Comparativo:** §12 item 1 (segunda metade) · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §2 · **Fluxos e2e:** F-EXTRA-01

> **Atualizada em 14/09/2026.** O enum `extra_activity_kind` não existe no schema de 14/09/2026, e
> `record_extra_study` não foi portada. O estudo extra é hoje uma meta de tipo
> `extra` mais o registro, criados na mesma operação pela tela — são cinco
> tipos, os da v2, e o tipo vive no título da meta.

---

## Problema

O que o aluno estuda fora da semana montada pelo professor não existe.

Ele revisa flashcards no ônibus, faz um simulado no sábado, lê a lei seca antes
de dormir. Nada disso tem onde ser registrado: a spec
[12](12-conclusao-de-meta.md) deu como **concluir** uma meta de estudo extra que
o professor planejou, mas o aluno não tem como **criar** o registro do que fez
por conta.

O custo é o mesmo de antes, e é de medida. "Tempo de estudo" — que é o número que
o aluno olha para saber se está cumprindo a rotina — só conta o que passou pelo
planejamento. Quem estuda três horas por dia, sendo uma delas de Anki, vê duas.
O professor lê o mesmo número, e conclui errado.

A versão anterior tinha o fluxo inteiro (`salvarEstudoExtra`, aluno.js:2367) com
**sete tipos fechados** num `<select>`. E o fazia por `INSERT` direto do
navegador na tabela de metas — a mesma porta por onde o aluno também apagava
meta e reescrevia resultado de bateria.

**E deixou uma dívida aqui.** `goals.extra_activity` é `text`, e a única linha
que existe no banco guarda `'revisao'` — valor de domínio, em português, em campo
livre. É exatamente o que o `CLAUDE.md` proíbe, e o momento de corrigir é agora:
enquanto há uma linha, a conversão custa um `update`; depois de existir tela que
escreva, custa migração de dado.

---

## Regras

### Os sete tipos

| Id | Regra |
|---|---|
| R-EXTRA-01 | `extra_activity` vira o enum `extra_activity_kind`, com **sete valores**, os mesmos que a v96 oferecia: `statute` (lei seca), `flashcards` (Anki), `mock_exam` (simulado), `review` (revisão), `extra_questions` (questões extras), `video_lesson` (videoaula) e `other` (outro). |
| R-EXTRA-02 | Os valores são **em inglês**, como todo enum do schema; o rótulo em português vive na tela. É a mesma correção que a spec [11](11-tema-claro-escuro.md) fez em `student_preferences.theme`, que era `text` com `'claro'` dentro. |
| R-EXTRA-03 | A migration **converte o dado antes do tipo**: `'revisao'` vira `'review'`, e só então a coluna muda de `text` para o enum. Sem essa ordem o `alter ... using` falha na única linha que existe. |
| R-EXTRA-04 | `apply_study_plan_batch` passa a **converter o texto do payload** para o enum. A assinatura não muda, e o bundle que já está no ar continua funcionando: ele só envia `null` nesse campo. É `create or replace` da mesma função, não uma segunda RPC. |
| R-EXTRA-05 | `other` existe para o que não cabe nos seis, e o que a pessoa quis dizer vai em `student_note`. Não há oitavo valor "digite aqui": tipo é enum, observação é texto. |

### Quem cria, e o quê

| Id | Regra |
|---|---|
| R-EXTRA-06 | Registrar estudo extra é **execução**, e vai por RPC: `record_extra_study`. Ela **cria** linha em `goals`, e o aluno não tem — nem passa a ter — `insert` nessa tabela. |
| R-EXTRA-07 | O registro nasce `completed`, com `completed_at = now()`. Não existe "estudo extra planejado pelo aluno": é o registro de algo que já aconteceu. Meta de estudo extra **planejada pelo professor** continua nascendo `pending` e sendo fechada por `complete_goal`. |
| R-EXTRA-08 | O aluno escolhe a **semana** e o **dia** do registro. `day_order` é calculado pela RPC — o maior do dia mais um —, nunca pelo cliente. É a mesma regra de `apply_study_plan_batch`. |
| R-EXTRA-09 | Exige planejamento `active`, e a semana precisa existir nele — ou seja, ter ao menos uma meta. Registrar estudo numa semana que o professor ainda não montou criaria uma semana fantasma no seletor do painel. |
| R-EXTRA-10 | `created_by` é o **aluno**; `teacher_id` e `student_id` vêm do planejamento, nunca de parâmetro. `type` é `extra_study`, `block_id` é nulo e `batch_id` é nulo — o registro não pertence a lote nenhum. |
| R-EXTRA-11 | O tempo é obrigatório, entre **1 e 240 minutos**, gravado em `spent_minutes` — a mesma coluna e o mesmo teto da spec [12](12-conclusao-de-meta.md), com a `check` `goal_spent_minutes_range` valendo igual. |
| R-EXTRA-12 | O título é **derivado do tipo**, não digitado: "Estudo extra — Anki". O que a pessoa quer escrever vai em `student_note`. Título livre viraria o campo multiuso que a v96 tinha. |
| R-EXTRA-13 | Idempotência **com payload**: `request_id` + `reserve_operation`, com hash de plano, semana, dia, tipo, minutos e observação. Um duplo clique não cria dois registros. |

### Desfazer

| Id | Regra |
|---|---|
| R-EXTRA-14 | O aluno remove um registro que ele mesmo criou, por `delete_extra_study`. É `deleted_at`, nunca `DELETE`, e o `audit_log` guarda o que havia. |
| R-EXTRA-15 | Só remove registro **`extra_study` criado pelo próprio aluno** — `created_by = auth.uid()`. Meta de estudo extra que o professor planejou não é removível pelo aluno: ela é da semana dele, e desfazê-la é `reopen_goal`. |
| R-EXTRA-16 | Remover não é editar. Corrigir o tempo ou o tipo é remover e registrar de novo, com duas linhas no `audit_log` em vez de uma edição silenciosa — a mesma decisão da spec 12. |

### Onde o número aparece

| Id | Regra |
|---|---|
| R-EXTRA-17 | O registro entra em `vw_goal_performance.minutes_spent` como qualquer meta sem bateria, pelo `coalesce` que a spec 12 criou. Nenhuma view nova, nenhum contador. |
| R-EXTRA-18 | Ele **não** entra em nenhum número de desempenho: `questions_answered` e `correct_answers` continuam vindo só do ledger. Estudo extra tem tempo, não tem acerto — é a regra que a v84 já enunciava. |
| R-EXTRA-19 | Ele conta como meta concluída da semana, então mexe em "X de Y metas concluídas" e no progresso da spec [17](17-ficha-da-turma.md) — subindo **os dois lados** da fração, porque a meta é criada já concluída. |

---

## Fluxo

```
aluno abre /aluno, semana N
      │
      └─ [Registrar estudo extra]
             ├─ tipo (7 opções) · dia · tempo · observação
             ├─ requestId gerado UMA vez
             ▼
       record_extra_study(plano, requestId, semana, dia, tipo, minutos, nota)
             ├─ reserve_operation ──► replay devolve a meta criada
             ├─ é o aluno do plano? plano active? a semana existe?
             ├─ day_order = maior do dia + 1        ← nunca do cliente
             └─ INSERT goals (extra_study, completed, completed_at, spent_minutes)
             ▼
      a linha aparece no dia escolhido, já concluída
      o tempo entra em minutes_spent; nenhum número de acerto muda

      [Remover] ──► delete_extra_study ──► deleted_at
             └─ só o que o próprio aluno criou
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno` — ganha o formulário e o botão de remover na linha |
| Componentes | `ExtraStudyForm` e `DeleteExtraForm`, em `components/student/` |
| Actions | `recordExtraStudy` e `deleteExtraStudy`, em `lib/data/goal-actions.ts` |
| Domínio | os sete tipos e seus rótulos, em `lib/domain/goals.ts` |
| RPCs | **duas novas:** `record_extra_study` e `delete_extra_study` |
| Migration | **uma:** `create type extra_activity_kind`, migração do dado, `alter column ... type`, `create or replace apply_study_plan_batch`, e as duas funções |
| Banco | `goals` (coluna muda de tipo), `operations`, `audit_log` |
| Testes | `supabase/tests/03_goals.sql`, `apps/e2e/tests/student-week.spec.ts` |

**A conversão de `text` para enum é compatível com o bundle no ar** por um
motivo verificável: o único caminho do site que escreve `extra_activity` é
`buildWeek`, e ele manda sempre `null`. O valor `'revisao'` que existe no banco
veio do seed, e a migration o converte antes de trocar o tipo.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Registrar um estudo extra cria a meta no dia escolhido, já concluída, com tempo e tipo, e o título derivado | F-EXTRA-01 |
| CA-02 | O tempo entra em "X de Y metas concluídas" e no tempo da meta; nenhum número de acerto muda | F-EXTRA-02 |
| CA-03 | Os sete tipos são oferecidos e gravam o valor em inglês correspondente | F-EXTRA-03 |
| CA-04 | Remover marca `deleted_at` e a linha some da semana | F-EXTRA-04 |
| CA-05 | O aluno **não** remove meta de estudo extra planejada pelo professor | F-EXTRA-05 |
| CA-06 | Tempo fora de 1–240 é recusado com mensagem, e nada é gravado | F-EXTRA-06 |
| CA-07 | `extra_activity` recusa valor fora dos sete, no próprio banco | **sem cobertura**: `record_extra_study` e o enum não foram portados |
| CA-08 | Replay do mesmo `request_id` devolve a meta sem criar a segunda | **sem cobertura**: `record_extra_study` e o enum não foram portados |
| CA-09 | O aluno não registra em planejamento alheio, nem em semana inexistente, nem com o plano fora de `active` | **sem cobertura**: `record_extra_study` e o enum não foram portados |
| CA-10 | O aluno continua sem `insert` direto em `goals` | **sem cobertura**: `record_extra_study` e o enum não foram portados |
| CA-11 | `apply_study_plan_batch` continua aceitando o texto do payload e gravando o enum | **sem cobertura**: `record_extra_study` e o enum não foram portados |
| CA-12 | As duas funções não têm `execute` para `public` e declaram `search_path` fixo | **sem cobertura**: `record_extra_study` e o enum não foram portados |

---

## Fora de escopo

- **Editar um registro.** Remover e registrar de novo (`R-EXTRA-16`).
- **Estudo extra sem planejamento ativo.** Quem não tem planejamento não tem
  onde pendurar a semana. Um diário de estudo independente do planejamento é
  outro produto.
- **Anexar material ou link.** `external_link` é do professor.
- **Estudo extra recorrente**, do tipo "todo dia 30 minutos de Anki". Vira
  agendamento, com as perguntas de fuso e de fim que agendamento traz.
- **Contar estudo extra no desempenho.** Ele não tem acerto — `R-EXTRA-18`, e é
  o que a v84 já dizia em voz alta.
- **Oitavo tipo configurável pelo professor.** Sete valores fechados cobrem o
  que a v96 cobria; `other` mais a observação resolvem o resto.
