# 14 — Gestão do planejamento pelo professor

**Situação:** implementada · **Comparativo:** §12 item 3 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §7 · **Fluxos e2e:** F-GPLAN-01

> **Atualizada em 06/10/2026 (QA-03, QA-12):** o índice e a RPC citados aqui
> não existiam no schema de 14/09; voltaram na migration
> `20261006221607_one_active_study_plan`. Onde esta spec diz `draft`, leia
> `paused`, que é como o planejamento nasce.

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

**E `activate_study_plan` estava pronta, sem ninguém para chamá-la** — até sair
com o schema de 14/09 e deixar a tela trocando o ativo por duas escrituras
soltas (QA-03, QA-12). Hoje ela existe de novo: arquiva o anterior e ativa o
novo na mesma transação, com o índice `study_plans_one_active_per_student_uidx`
tornando impossível terminar com dois ativos.

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
| R-GPLAN-01 | Um planejamento **nasce `paused`**, nunca `active`. O default da coluna continua `active` (as suítes de invariante inserem sem `status` e dependem disso), mas o adaptador sempre grava `paused`: criar já ativo trocaria o planejamento do aluno antes de o professor conferir, e esbarraria no índice quando o aluno já tem um ativo. |
| R-GPLAN-02 | **Ativar é a RPC `activate_study_plan(p_study_plan_id)`.** Ela trava os planejamentos do aluno, **arquiva o ativo anterior** e ativa o escolhido, numa transação. Nenhuma linha desta spec reimplementa isso no cliente: eram duas requisições, e a rede caindo entre elas deixava o aluno sem planejamento. A limpeza da migration que criou o índice **pausou** os duplicados; ativar pela tela **arquiva**, porque é gesto do professor. |
| R-GPLAN-03 | `activate_study_plan` é **naturalmente idempotente**, sem `request_id`: o único parâmetro é a identidade do alvo, e "este plano está ativo" é estado. Ativar o que já está ativo devolve a linha sem escrever. Quem sustenta é o índice `study_plans_one_active_per_student_uidx` (o estado final nunca tem dois ativos) mais a trava `for no key update` sobre os planejamentos do aluno, em ordem de `id` (a segunda chamada enxerga a primeira em vez de bater no índice). |
| R-GPLAN-04 | **Um ativo por aluno**, garantido pelo índice parcial `study_plans_one_active_per_student_uidx` — `(student_id) where status = 'active'`. Não há `deleted_at` em `study_plans`. É o índice que torna inexprimível o estado "o aluno vê um, o professor edita outro". |
| R-GPLAN-05 | Arquivar é `update` de `status` para `archived`, escrita direta. Um aluno pode ficar **sem nenhum planejamento ativo** — é estado legítimo, e a tela do aluno já o trata com "Nenhum planejamento ativo". |

### Quem escreve

| Id | Regra |
|---|---|
| R-GPLAN-06 | Criar e editar planejamento é **escrita direta com RLS**, sem RPC: é planejamento, a linha exata da tabela de fronteira do `CLAUDE.md`, e as três defesas já estão montadas desde a migration inicial. |
| R-GPLAN-07 | `study_plans_teacher_insert` exige `teacher_id = auth.uid() and public.is_teacher_of(student_id)`. **Criar planejamento para aluno sem vínculo é recusado pelo banco** — é a spec 13 sustentando esta. |
| R-GPLAN-08 | O `grant update` de `study_plans` cobre `name`, `area`, `target_exam`, `stage`, `study_model`, `weekly_goals`, `start_date`, `status` e `deleted_at`. `student_id`, `teacher_id` e `id` ficam **de fora**: nem com SQL na mão o professor move um planejamento para outro aluno. |
| R-GPLAN-09 | O índice `study_plans_name_per_student_uidx (teacher_id, student_id, lower(btrim(name)))` impede dois planejamentos de mesmo nome para o mesmo aluno, ignorando maiúsculas e espaço nas pontas — "Área Fiscal" e "área fiscal" são o mesmo nome. A tela traduz a violação, identificada pelo nome do índice: "Este aluno já tem um planejamento com esse nome." (`code: "conflict"`, `field: "name"`). O nome vai de 3 a 120 caracteres; área, fase e modelo até 120, concurso até 200 (QA-15, QA-16, D-06, D-07). |
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
      │            └─ study_plans_one_active_per_student_uidx torna "dois ativos" inexprimível
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
| RPCs | `activate_study_plan` |
| Migration | `20261006221607_one_active_study_plan`: o índice único parcial e a RPC |
| Banco | `study_plans` e `study_plan_blocks`, escrita direta já concedida; `catalog_blocks`, leitura |
| Protocolo | **nada muda** |
| Testes | `apps/e2e/tests/teacher.spec.ts` |

**Ativar e arquivar não devolvem `success`.** As duas mudam a situação da linha
e, com ela, quais botões existem — o formulário que mostraria a mensagem some na
revalidação, levando junto o `useActionState` dono dela. As duas devolvem
`redirectTo` com `?feito=`, e a página anuncia. É o mesmo motivo de
`registerQuizTime` e de `completeGoal`, e foi descoberto no primeiro teste
vermelho desta spec.

**Criar, editar e arquivar seguem sem RPC e sem migration**, como na primeira
versão desta spec: são planejamento, escrita direta com as três defesas. Só
ativar precisou voltar ao banco, porque "trocar o ativo" é a parte que uma tela
não faz sozinha — duas requisições não são uma transação.

**Por que há teste em `supabase/tests/`.** O índice e a RPC são invariante de
banco: `07_schema` confere que o índice existe e é único, que ativar arquiva o
anterior e que ativar de novo não muda nada; `02_rls` confere que professor
alheio e aluno não ativam.

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
| CA-08 | Falha de rede durante a ativação **não deixa o aluno sem planejamento ativo**: o anterior continua ativo até a RPC completar | F-GPLAN-01 |
| CA-09 | Duas ativações simultâneas para o mesmo aluno terminam com **um** ativo, sem erro | F-GPLAN-01 |

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
