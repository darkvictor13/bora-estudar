# 14 — Gestão do planejamento pelo professor

**Situação:** implementada · **Comparativo:** §12 item 3 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §7 · **Fluxos e2e:** F-GPLAN-01

---

## Problema

Fora do seed, um professor novo não tem por onde começar.

`study_plans` e `study_plan_blocks` só nascem em `supabase/seed.sql`.
`/professor/planejamentos` lista e nada mais; `/professor/metas` recusa gerar
com a mensagem "Nenhum planejamento criado. Crie um planejamento antes de gerar
metas" — e não existe lugar onde criar. A spec [13](13-vinculo-e-liberacao-de-acesso.md)
resolveu o passo anterior: o professor já consegue vincular um aluno e liberar o
acesso dele. O aluno entra, e vê "Nenhum planejamento ativo. Aguarde seu
professor montar e ativar um planejamento". O professor não tem como atender.

**E `activate_study_plan` está pronta há tempo, sem ninguém para chamá-la.** Ela
arquiva o anterior e ativa o novo na mesma transação, com o índice
`active_study_plan_uidx` tornando impossível terminar com dois ativos ou com
nenhum. Está testada em `supabase/tests/` e é citada no GAP-02 como RPC órfã.

A versão anterior tinha tudo isso e o fazia por escrita direta do navegador:
`salvarNovoPlanejamentoAluno` (professor.js:4365) inseria o planejamento e, no
mesmo caminho, fazia um `UPDATE` em massa em todos os outros do aluno para
`'arquivado'` — com um fallback para `'pausado'` quando a constraint reclamava
(professor.js:4443). Duas escritas não transacionais imitando o que aqui é uma
chamada de RPC.

Uma regra da v96 vale ser preservada porque ela acertou, e está no comentário do
próprio código: **planejamento com estudo realizado nunca é apagado**, só
arquivado (professor.js:4733). Aqui isso já é mais forte — `DELETE` não é
concedido em tabela nenhuma —, mas a tela precisa dizer isso ao professor em vez
de deixar o banco recusar.

---

## Regras

### Máquina de estados

`study_plan_status` já existe com quatro valores. Esta spec não acrescenta
nenhum; ela dá caminho aos que estavam inalcançáveis.

| De | Para | Quem | Como |
|---|---|---|---|
| — | `draft` | professor | criar |
| `draft`, `paused`, `archived` | `active` | professor | `activate_study_plan` |
| `active` | `archived` | professor | efeito de ativar outro, na mesma transação |
| `active`, `draft`, `paused` | `archived` | professor | arquivar |

| Id | Regra |
|---|---|
| R-GPLAN-01 | Um planejamento **nasce `draft`**, nunca `active`. Criar já ativo esbarraria em `active_study_plan_uidx` quando o aluno já tem um ativo, e a troca atômica é justamente o que `activate_study_plan` existe para fazer. |
| R-GPLAN-02 | **Ativar é a RPC `activate_study_plan`**, que já existe. Ela arquiva o ativo anterior do mesmo aluno e ativa o escolhido na mesma transação. Nenhuma linha desta spec reimplementa isso no cliente — era o `UPDATE` em massa da v96. |
| R-GPLAN-03 | `activate_study_plan` é **naturalmente idempotente**: ativar o que já está ativo chega ao mesmo estado, e o `update` que arquiva os demais tem `id <> p_study_plan_id` no predicado. Não recebe `request_id`, e não precisa. |
| R-GPLAN-04 | **Um ativo por aluno**, garantido pelo índice parcial `active_study_plan_uidx` (`student_id` onde `status = 'active' and deleted_at is null`). É o índice que torna inexprimível o estado "o aluno vê um, o professor edita outro". |
| R-GPLAN-05 | Arquivar é `update` de `status` para `archived`, escrita direta. Um aluno pode ficar **sem nenhum planejamento ativo** — é estado legítimo, e a tela do aluno já o trata com "Nenhum planejamento ativo". |

### Quem escreve

| Id | Regra |
|---|---|
| R-GPLAN-06 | Criar e editar planejamento é **escrita direta com RLS**, sem RPC: é planejamento, a linha exata da tabela de fronteira do `CLAUDE.md`, e as três defesas já estão montadas desde a migration inicial. |
| R-GPLAN-07 | `study_plans_teacher_insert` exige `teacher_id = auth.uid() and public.is_teacher_of(student_id)`. **Criar planejamento para aluno sem vínculo é recusado pelo banco** — é a spec 13 sustentando esta. |
| R-GPLAN-08 | O `grant update` de `study_plans` cobre `name`, `area`, `target_exam`, `stage`, `study_model`, `weekly_goals`, `start_date`, `status` e `deleted_at`. `student_id`, `teacher_id` e `id` ficam **de fora**: nem com SQL na mão o professor move um planejamento para outro aluno. |
| R-GPLAN-09 | `study_plan_name_unique (student_id, name)` impede dois planejamentos de mesmo nome para o mesmo aluno. A tela traduz a violação em vez de mostrar o erro do Postgres. |
| R-GPLAN-10 | `weekly_goals` fica entre 1 e 200 pela `check` existente; o padrão é **24**, o mesmo de cinco dos seis cursos-modelo da v96. |

### Os blocos que o planejamento nasce tendo

| Id | Regra |
|---|---|
| R-GPLAN-11 | Um planejamento sem bloco **não gera meta de bateria** — `GenerateWeekForm` recusa com "Este planejamento não tem blocos ativos". Por isso a criação **materializa os blocos de um catálogo** escolhido, em `study_plan_blocks`, no mesmo fluxo. Criar um planejamento vazio seria entregar um estado inútil. |
| R-GPLAN-12 | A materialização copia os blocos **ativos** do catálogo, com `catalog_block_id` apontando para a origem. `subject_order` é a posição da disciplina na ordem alfabética de `subject_name`; `block_order` é a posição do bloco dentro da disciplina, por `number`. É o que `study_plan_block_order_uidx` exige ser único. |
| R-GPLAN-13 | `question_count` e `name` vêm do catálogo; `subject_target` nasce em **80**, o padrão da v96 e o do seed. `subject_color` nasce no default da coluna. |
| R-GPLAN-14 | O bloco materializado é **cópia, não referência viva**. O professor edita nome, meta e ordem no planejamento dele sem afetar o catálogo nem os outros alunos — é o que a v96 dizia em "a alteração vale somente para este planejamento". `catalog_block_id` é `on delete restrict`, então o catálogo não some por baixo. |
| R-GPLAN-15 | Materializar duas vezes o mesmo catálogo no mesmo planejamento é recusado por `study_plan_block_order_uidx`. A tela só oferece a materialização na criação. |

### O que não se apaga

| Id | Regra |
|---|---|
| R-GPLAN-16 | **Planejamento não é excluído por esta tela, nem soft delete.** A v96 já recusava apagar planejamento com estudo realizado e só oferecia arquivar; aqui arquivar é a única saída oferecida. `deleted_at` está no grant e continua sendo caminho de manutenção, não de produto. Ver Fora de escopo. |
| R-GPLAN-17 | Arquivar **não toca nas metas nem nas baterias**. Elas continuam existindo, e o histórico de desempenho do aluno continua inteiro — que é a razão de arquivar em vez de apagar. |
| R-GPLAN-18 | Toda escrita em `study_plans` entra no `audit_log` pelo gatilho `tg_study_plans_auditoria`, que já existe. |

---

## Fluxo

```
professor abre /professor/planejamentos
      │
      ├─ [Novo planejamento]
      │      ├─ escolhe o aluno   (só os que têm vínculo vigente)
      │      ├─ escolhe o catálogo (catalogs ativos)
      │      ├─ nome, concurso, fase, modelo, metas/semana, início
      │      ▼
      │   INSERT study_plans (status = 'draft')
      │      │   └─ WITH CHECK: teacher_id = auth.uid() E is_teacher_of(student_id)
      │      ▼
      │   INSERT study_plan_blocks — os blocos ativos do catálogo,
      │      subject_order por disciplina, block_order por número
      │      ▼
      │   o planejamento aparece como "Rascunho"
      │
      ├─ [Ativar] ──► activate_study_plan(id)
      │      └─ arquiva o ativo anterior E ativa este, na MESMA transação
      │            └─ active_study_plan_uidx torna "dois ativos" inexprimível
      ▼
   o aluno passa a ver a Visão geral com o planejamento;
   /professor/metas passa a aceitar gerar a semana

   [Arquivar] ──► status = 'archived'; metas e baterias intactas
```

A ordem entre criar o planejamento e materializar os blocos importa por uma
razão de integridade, não de estética: `study_plan_block_context_fk` é composta
sobre `(study_plan_id, student_id, teacher_id)`, então o bloco só existe depois
do pai. Se a segunda escrita falhar, o professor fica com um rascunho sem
blocos — visível, nomeado, e corrigível pela tela de cadernos. É o modo de falha
aceito, e é melhor que o inverso.

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/planejamentos` — ganha o formulário de criação e as ações por linha |
| Componentes | `NewPlanForm` e `PlanActions`, em `components/teacher/` |
| Actions | `createStudyPlan`, `activateStudyPlan`, `archiveStudyPlan`, em `lib/data/teacher-actions.ts` |
| Confirmação | Ativar e arquivar devolvem `redirectTo` com `?feito=`, e a página anuncia |
| Leitura | `getAllTeacherPlans` (já existe), mais os catálogos ativos e os alunos vinculados |
| RPCs | **nenhuma nova.** `activate_study_plan` já existe |
| Migration | **nenhuma** |
| Banco | `study_plans` e `study_plan_blocks`, escrita direta já concedida; `catalog_blocks`, leitura |
| Protocolo | **nada muda** |
| Testes | `apps/e2e/tests/teacher.spec.ts` |

**Ativar e arquivar não devolvem `success`.** As duas mudam a situação da linha
e, com ela, quais botões existem — o formulário que mostraria a mensagem some na
revalidação, levando junto o `useActionState` dono dela. As duas devolvem
`redirectTo` com `?feito=`, e a página anuncia. É o mesmo motivo de
`registerQuizTime` e de `completeGoal`, e foi descoberto no primeiro teste
vermelho desta spec.

**Esta spec não tem migration nem RPC, e isso é o ponto.** O banco já sabia
fazer tudo o que ela precisa desde agosto — inclusive a parte difícil, que é a
troca atômica do planejamento ativo. O que faltava era interface. É o padrão que
o inventário previu para vários itens da fila.

**Por que não há teste em `supabase/tests/`.** Não há invariante nova para
provar: `active_study_plan_uidx`, `study_plan_name_unique`, o `WITH CHECK` de
`study_plans_teacher_insert` e o grant por coluna já são cobertos por
`05_teacher_writes.sql` e `01_flow.sql`. Acrescentar asserções que repetem as de
lá custaria tempo de execução sem cobrir nada novo — o mesmo critério que deixa
F-BAT-04 fora do e2e.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Criar um planejamento para um aluno vinculado grava `status='draft'` e materializa os blocos ativos do catálogo escolhido, com `subject_order` e `block_order` coerentes | F-GPLAN-01 |
| CA-02 | O planejamento recém-criado aparece como "Rascunho" e o aluno **ainda não o vê** — a Visão geral dele continua dizendo que não há planejamento ativo | F-GPLAN-02 |
| CA-03 | Ativar troca o estado para "Ativo", **arquiva o anterior do mesmo aluno na mesma transação**, e o aluno passa a ver o novo | F-GPLAN-03 |
| CA-04 | Depois de ativar, `/professor/metas` aceita gerar a semana com os blocos materializados | F-GPLAN-04 |
| CA-05 | Arquivar troca o estado e **preserva metas e baterias**; o aluno volta ao estado vazio | F-GPLAN-05 |
| CA-06 | Nome repetido para o mesmo aluno é recusado com mensagem em português, e nada é gravado | F-GPLAN-06 |
| CA-07 | O `select` de alunos oferece **só quem tem vínculo vigente**; sem aluno vinculado, a tela explica em vez de mostrar um formulário inútil | F-GPLAN-07 |

---

## Fora de escopo

- **Excluir planejamento.** A v96 oferecia, mas só para planejamento **sem
  estudo realizado** — com histórico, ela bloqueava e mandava arquivar
  (professor.js:4733). Reproduzir a regra aqui exige um gatilho que consulte
  `goals` e `quiz_sessions`, porque uma `check` não enxerga outra tabela, e um
  guarda só no cliente seria decoração. Isto é uma migration, e esta spec é
  deliberadamente zero-migration. Arquivar resolve o caso real; excluir volta
  quando alguém precisar dele de fato.
- **Cursos-modelo com blocos embutidos no bundle.** A v96 carregava seis
  catálogos hard-coded no JavaScript — 127, 167, 92, 60, 34 e 28 blocos. Aqui o
  catálogo é tabela (`catalogs`, `catalog_blocks`), administrada pelo admin, e é
  de lá que a materialização copia.
- **Editar os blocos do planejamento** — ativar, desativar, renomear, incluir,
  excluir, restaurar. É o item 4 da fila e ganha spec própria; esta entrega o
  conjunto inicial.
- **Copiar planejamento de outro aluno.** Tentador e barato de imaginar, caro de
  acertar: os blocos carregam `student_id` e `teacher_id` denormalizados sob FK
  composta, e a cópia precisa reescrevê-los sem herdar nada do original.
- **Pausar planejamento.** `paused` existe no enum e nenhuma tela o escreve.
  Enquanto não houver decisão sobre o que ele significa para o aluno — vê e não
  mexe? não vê? —, continua sem caminho, como `skipped` em `goal_status`.
- **Definir a meta por disciplina na criação.** Nasce em 80 para todas; ajustar
  é da tela de cadernos.
