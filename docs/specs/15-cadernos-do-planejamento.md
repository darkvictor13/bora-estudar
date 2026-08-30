# 15 — Cadernos do planejamento

**Situação:** não implementada · **Comparativo:** §12 item 4 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §7 · **Fluxos e2e:** F-CAD-01 a F-CAD-06

---

## Problema

O planejamento nasce e não muda mais.

A spec [14](14-gestao-do-planejamento.md) faz o planejamento nascer com os blocos
de um catálogo. A partir daí, `/professor/cadernos` **só lista**. O professor não
tem como tirar da rotação um bloco que o aluno já dominou, corrigir o nome de um
caderno que o catálogo trouxe errado, baixar a meta de uma disciplina que está
fora do alcance, nem acrescentar um caderno que não existe no catálogo — que é o
caso comum quando o aluno traz um material próprio.

O custo aparece na geração da semana. `GenerateWeekForm` oferece os blocos
`active` do planejamento, e `proximoBlocoParaMeta` roda entre eles. Sem como
desativar, todo bloco do catálogo entra no rodízio para sempre: um catálogo de
92 blocos vira uma rotação de 92, mesmo que 30 já estejam dominados e 20 sejam de
disciplina que o aluno não vai fazer.

A versão anterior tinha a tela inteira (`p-cadernos`, professor.js:2863) e a
resolvia por escrita direta do navegador — que aqui já é o caminho legítimo,
porque `study_plan_blocks` está na linha de planejamento da tabela de fronteira.
O aviso que ela mostrava vale ser preservado literalmente, porque é a dúvida que
o professor tem na hora de clicar: **"Desativar impede o uso na geração de novas
metas. Metas concluídas e estatísticas antigas são preservadas."**

---

## Regras

### As duas dimensões, que não são a mesma

A v96 mantinha `ativo` e `excluido` como campos separados, e o schema daqui já
espelha isso: `active` (boolean) e `deleted_at` (timestamptz). Confundi-los é o
erro que esta seção existe para evitar.

| Estado | `active` | `deleted_at` | O que significa |
|---|---|---|---|
| Ativo | `true` | `null` | entra no rodízio da geração e o aluno o vê |
| Desativado | `false` | `null` | sai do rodízio, continua visível no histórico e nas estatísticas |
| Excluído | qualquer | preenchido | some das telas; existia por engano |

| Id | Regra |
|---|---|
| R-CAD-01 | **Desativar não apaga nada.** O bloco sai da geração de metas novas e continua no histórico, nas estatísticas e no caderno de erros. É o estado para "o aluno já dominou" ou "não vai cair na prova dele". |
| R-CAD-02 | **Excluir é `deleted_at`**, nunca `DELETE` — que não é concedido em tabela nenhuma. É o estado para "isto entrou por engano", e é reversível. |
| R-CAD-03 | `start_quiz_session` já exige `pb.active and pb.deleted_at is null`. Um bloco desativado ou excluído **não abre bateria**, e a mensagem que sobe é `bloco invalido ou indisponivel`. Nenhuma linha desta spec reimplementa essa checagem. |
| R-CAD-04 | Excluir é oferecido **apenas para bloco sem nenhuma meta**. Com metas, a tela oferece só desativar, e diz por quê. A razão é concreta: uma meta de bateria pendente cujo bloco foi excluído deixa de poder ser iniciada, e o aluno fica com uma linha que não responde. **O banco não impõe isso** — exigiria um gatilho consultando `goals`, o que é uma migration, e esta spec é zero-migration. O estrago é reversível por restaurar, e a tela é o único guarda. **Suposição registrada para revisão humana.** |
| R-CAD-05 | Restaurar devolve `deleted_at` a `null` e **recalcula `block_order`** para o maior da disciplina mais um. Sem isso o restauro colide com `study_plan_block_order_uidx`, que é único em `(study_plan_id, subject_order, block_order)` **onde `deleted_at is null`**: excluir libera a posição, e outro bloco pode tê-la ocupado no meio-tempo. |

### Quem escreve, e o quê

| Id | Regra |
|---|---|
| R-CAD-06 | Tudo aqui é **escrita direta com RLS**, sem RPC: `study_plan_blocks` está na linha de planejamento da tabela de fronteira, e as três defesas já estão montadas. |
| R-CAD-07 | O `grant update` cobre `catalog_block_id`, `subject_name`, `subject_color`, `subject_target`, `name`, `link`, `question_count`, `subject_order`, `block_order`, `active` e `deleted_at`. `study_plan_id`, `student_id` e `teacher_id` ficam **de fora** — nem com SQL na mão o professor move um bloco para outro planejamento. |
| R-CAD-08 | `study_plan_blocks_teacher_insert` exige `teacher_id = auth.uid() and public.is_teacher_of(student_id)`. Acrescentar caderno a planejamento de aluno sem vínculo é recusado pelo banco. |
| R-CAD-09 | O caderno avulso nasce **sem `catalog_block_id`** — a coluna é nullable de propósito. Ele não vem do catálogo e não deve fingir que vem. |
| R-CAD-10 | O caderno avulso entra no fim da disciplina: `block_order` é o maior da disciplina mais um; `subject_order` é o da disciplina, se ela já existe no planejamento, ou o maior mais um se for nova. |
| R-CAD-11 | `subject_target` fica entre 0 e 100 pela `check` existente. O padrão continua **80**. |
| R-CAD-12 | Desativar ou ativar **uma disciplina inteira** é a mesma escrita aplicada a todos os blocos não excluídos dela. A v96 tinha esse atalho e ele é o que torna a tela usável com 92 blocos. |

### O que a tela mostra

| Id | Regra |
|---|---|
| R-CAD-13 | A lista tem quatro recortes — **Ativos, Desativados, Excluídos, Todos** — e abre em **Ativos**, como a v96. Sem o recorte, um catálogo grande vira uma parede. |
| R-CAD-14 | O resumo conta **Cadernos** (não excluídos), **Ativos**, **Desativados** e **Excluídos**, derivados da lista. Nenhum contador é mantido à mão. |
| R-CAD-15 | Reordenar bloco e disciplina fica de fora — ver Fora de escopo. |

---

## Fluxo

```
professor abre /professor/cadernos?plano=<id>
      │
      ├─ recorte: Ativos (padrão) · Desativados · Excluídos · Todos
      │
      ├─ [Desativar] / [Ativar]  ──► update active
      │      └─ sai / volta ao rodízio de GenerateWeekForm
      │         metas concluídas e estatísticas INTACTAS
      │
      ├─ [Desativar matéria] / [Ativar matéria]
      │      └─ o mesmo update em todos os blocos não excluídos da disciplina
      │
      ├─ [Editar] ──► update name, subject_name, subject_color,
      │                       subject_target, link, question_count
      │
      ├─ [Excluir] ──► update deleted_at = now()
      │      └─ só quando o bloco NÃO tem meta nenhuma
      │
      ├─ [Restaurar] ──► update deleted_at = null,
      │                         block_order = maior da disciplina + 1
      │      └─ o recálculo evita colidir com study_plan_block_order_uidx
      │
      └─ [+ Caderno avulso] ──► insert, sem catalog_block_id
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor/cadernos` — ganha os recortes, o resumo e as ações |
| Componentes | `BlockActions`, `EditBlockForm` e `NewBlockForm`, em `components/teacher/` |
| Actions | `setBlockActive`, `setSubjectActive`, `updateBlock`, `deleteBlock`, `restoreBlock`, `createBlock` |
| Leitura | os blocos do planejamento, sem filtro de `deleted_at`, mais a contagem de metas por bloco |
| RPCs | **nenhuma nova** |
| Migration | **nenhuma** |
| Banco | `study_plan_blocks`, escrita direta já concedida; `goals`, leitura, para saber quem pode ser excluído |
| Testes | `apps/e2e/tests/teacher.spec.ts` |

**Por que não há teste novo em `supabase/tests/`.** As invariantes envolvidas —
o grant por coluna, o `WITH CHECK`, a ausência de `DELETE` e o índice de ordem —
já são cobertas por `05_teacher_writes.sql`, que exercita exatamente estas
escritas em `study_plan_blocks`. Repeti-las custaria execução sem cobrir nada
novo.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Desativar um bloco tira-o da lista de blocos oferecida em `/professor/metas`, e **não** muda nenhuma meta nem nenhum número de desempenho já existente | F-CAD-01 |
| CA-02 | Um bloco desativado não abre bateria: o aluno recebe a mensagem traduzida, e a meta continua pendente | F-CAD-02 |
| CA-03 | Editar nome, meta e cor vale só para este planejamento — o catálogo e os outros alunos ficam intactos | F-CAD-03 |
| CA-04 | Excluir um bloco sem metas some da lista de Ativos e aparece em Excluídos; restaurar traz de volta, com `block_order` recalculado e sem violar o índice | F-CAD-04 |
| CA-05 | Bloco **com** meta não oferece excluir, e a tela diz por quê | F-CAD-05 |
| CA-06 | Um caderno avulso nasce sem `catalog_block_id`, no fim da disciplina, e passa a ser oferecido na geração da semana | F-CAD-06 |

---

## Fora de escopo

- **Reordenar blocos e disciplinas.** `subject_order` e `block_order` estão no
  grant, mas trocar duas posições sob um índice único exige uma sequência de
  `UPDATE` que passa por um estado colidente, ou uma coluna de ordem fracionária.
  Fazer isso direito é spec própria; a ordem inicial vem do catálogo e o caderno
  avulso entra no fim.
- **Excluir bloco com histórico.** Nem a v96 fazia: ela marcava `excluido` e o
  bloco sumia da tela, mas o histórico continuava. Aqui o mesmo, e a tela nem
  oferece — ver `R-CAD-04`.
- **Sincronizar com o catálogo depois da criação.** O bloco é cópia
  (`R-GPLAN-14`). Se o admin corrigir um nome no catálogo, os planejamentos já
  criados não mudam. Propagar exigiria decidir o que fazer com o que o professor
  editou à mão.
- **Cadastrar disciplina teórica com PDFs.** A v96 tinha (`p-disciplinas`), em
  `localStorage`, e `DEFAULT_AULAS` com 352 cadernos fixos no bundle. Material de
  teoria não é bloco de questões e precisa de modelagem própria.
- **Marcar caderno como feito.** É do aluno, e depende de uma tabela de progresso
  que não existe. Está na fila do inventário.
