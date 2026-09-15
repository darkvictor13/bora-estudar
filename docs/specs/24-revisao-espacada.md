# 24 — Revisão espaçada

**Situação:** implementada · **Comparativo:** §12 item 9 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §4 e §9 · **Fluxos e2e:** F-REV-01 e F-TREV-01

> **Atualizada em 14/09/2026.** A grade passou a viver em `theory_review_rules` e `theory_reviews`, dentro do
> fluxo da teoria; `review_spacings` e `review_cycles` não foram portadas. O
> espaçamento continua sendo do professor, e o aluno continua sem editá-lo.

---

## Problema

Reforço e revisão são a mesma palavra e coisas diferentes, e o produto só tem
uma delas.

**Reforço** é reação a erro: o aluno foi abaixo de 80% num ciclo de três
baterias e refaz as erradas únicas. Existe, tem RPC, tem tela — specs
[20](20-execucao-do-reforco.md) e [21](21-fases-na-extensao.md).

**Revisão espaçada** é o oposto: não depende de ter errado. É voltar a um
caderno já estudado depois de N cadernos, porque esquecer é o padrão e não a
exceção. O aluno estuda a Aula 7 e, na mesma semana, revisa a Aula 4 e a Aula 1.
Nada disso existe hoje: não há onde guardar o espaçamento nem onde registrar que
a revisão foi feita.

Na versão anterior existia, e era `localStorage` puro — `renderControleRevisoes`
(aluno.js:3164, e o mesmo código copiado em professor.js:1792). Nada chegava ao
banco. Trocar de navegador perdia a grade inteira, e professor e aluno tinham
cada um a sua cópia particular, que nunca conversavam: o professor definia o
espaçamento no navegador dele e o aluno não via.

As fórmulas eram `r1Idx = i − (r1 − 1)` e `r2Idx = i − (r1 + r2 − 1)`, contagem
inclusiva (aluno.js:3194). Elas ficam. O `localStorage` não.

---

## Regras

### O espaçamento

| Id | Regra |
|---|---|
| R-REVE-01 | O espaçamento é **por disciplina, dentro de um planejamento**, e vive na tabela nova `review_spacings`. Uma linha por `(planejamento, disciplina)`. |
| R-REVE-02 | A identidade da disciplina é `subject_name`, porque é a identidade que o resto do produto já usa — `groupIntoSubjects` agrupa por ela, e `study_plan_blocks` não tem chave de disciplina. Renomear a disciplina órfã o espaçamento; é o mesmo custo que renomear já tem em toda tela que agrupa por nome. |
| R-REVE-03 | **Quem define é o professor**, com escrita direta e RLS — é planejamento, e fica do mesmo lado da fronteira que `study_plan_blocks`. Na v96 as duas telas escreviam, cada uma no seu `localStorage`; ter dois donos para o mesmo número foi o que fez professor e aluno verem grades diferentes. |
| R-REVE-04 | `first_interval` e `second_interval` vão de **0 a 60**, o intervalo dos campos da v96. **Zero desliga a coluna**: `first_interval = 0` desliga a grade inteira da disciplina, `second_interval = 0` desliga só a segunda revisão. |
| R-REVE-05 | **Não há default de negócio.** A disciplina sem linha em `review_spacings` não tem revisão programada, e a tela diz isso. Os números por matéria que o `aluno.js` sugeria (TI 8/16, RLM 6/10) eram heurística de tela: `sugestaoEspacamentoRevisao` devolvia `{r1:0, r2:0}` para tudo (professor.js:1732). Inventar default aqui seria inventar regra que a v96 não tinha. |
| R-REVE-06 | As colunas de contexto — `student_id`, `teacher_id`, `study_plan_id`, `subject_name` — ficam **fora do `grant update`**. É a segunda das três defesas do `CLAUDE.md`: sem isso a RLS deixaria mover a linha de um aluno para outro do mesmo professor. |

### A grade

| Id | Regra |
|---|---|
| R-REVE-07 | A grade é **derivada, nunca gravada**. Para o bloco na posição `i` da disciplina, a primeira revisão cai no bloco `i − (r1 − 1)` e a segunda no bloco `i − (r1 + r2 − 1)`, contagem inclusiva. São as fórmulas da v96, e ficam num módulo de domínio testado. |
| R-REVE-08 | Índice negativo significa **ainda não há o que revisar** — o aluno não estudou blocos suficientes. A célula fica vazia, e isso não é erro. |
| R-REVE-09 | A ordem dos blocos dentro da disciplina é `block_order`, a mesma de `study_plan_block_order_uidx`. Bloco excluído (`deleted_at`) e bloco inativo **não entram na grade**: revisar o que saiu do planejamento é trabalho jogado fora. |
| R-REVE-10 | A grade mostra, por linha, o bloco atual e os dois a revisar. É a tabela da v96 menos as colunas "Teoria/PDF" e "Caderno TEC", que aqui são **derivadas de `goals`** — o produto já sabe o que o aluno concluiu, e duplicar isso criaria um segundo caminho de escrita para o mesmo fato. |

### A marcação

| Id | Regra |
|---|---|
| R-REVE-11 | Marcar revisão feita grava em `review_completions`, uma linha por `(bloco, ordinal)` — ordinal 1 ou 2. **A chave é o bloco revisado, não a linha da grade.** A v96 usava `disciplina:linha:tipo:aula`, e mudar o espaçamento órfãava todas as marcações; "fiz a primeira revisão da Aula 3" é verdade independentemente de quando ela foi agendada. |
| R-REVE-12 | A escrita é por **RPC**, `set_review_done`. É execução: registra o que o aluno fez, como `complete_goal` da spec [12](12-conclusao-de-meta.md), e pelo mesmo motivo — abrir `grant insert` numa tabela de execução criaria um segundo caminho de escrita sem a validação de contexto. |
| R-REVE-13 | A RPC é **naturalmente idempotente e não recebe `request_id`**: ela leva o par `(bloco, ordinal)` a um estado — marcado ou desmarcado — e não acumula. Chamá-la duas vezes com o mesmo argumento produz exatamente o mesmo estado, e não há payload cujo hash comparar. É a segunda das duas formas do `CLAUDE.md`, e esta é a justificativa que a regra exige por escrito. |
| R-REVE-14 | Desmarcar **não apaga**: escreve `deleted_at`, e remarcar limpa. Nada é apagado fisicamente neste schema, e o histórico de "marquei, desmarquei, marquei" é o tipo de coisa que o `audit_log` responde. |
| R-REVE-15 | **Aluno e professor marcam.** Na v96 as duas telas tinham a caixa, e é o professor quem conduz a revisão do aluno em atendimento. A RPC aceita `auth.uid()` igual ao aluno **ou** professor com vínculo vigente, e recusa qualquer outro com `42501`. |
| R-REVE-16 | Marcar revisão de bloco que não está no planejamento informado, ou de bloco excluído, é recusado. Um ordinal fora de `{1, 2}` é recusado pela `check` da tabela. |

### A tela

| Id | Regra |
|---|---|
| R-REVE-17 | O aluno vê a grade em `/aluno/revisoes`, ao lado do caderno de erros que já mora lá — as duas respondem "o que eu preciso revisitar", por caminhos diferentes. |
| R-REVE-18 | O professor vê e edita o espaçamento na ficha do aluno, `/professor/alunos/:studentId`. Uma disciplina por linha, com os dois campos e o que a grade produz. |
| R-REVE-19 | Disciplina sem espaçamento aparece na lista do professor com os campos zerados e o texto "sem revisão programada". Some da grade do aluno: grade vazia com dez disciplinas listadas seria ruído. |

---

## Fluxo

```
professor define, por disciplina:  1ª revisão = 3 · 2ª revisão = 5
      ▼
review_spacings (plano, disciplina)          ← escrita direta, RLS
      │
      └─ a grade é DERIVADA, nunca gravada:
             bloco i     →  1ª revisão: bloco i − (3 − 1) = i − 2
                            2ª revisão: bloco i − (3 + 5 − 1) = i − 7
             índice < 0  →  ainda não há o que revisar
      ▼
/aluno/revisoes            /professor/alunos/:id
      │
      └─ [Marcar feita] → set_review_done(bloco, ordinal, feito)
                              └─ review_completions, uma linha por (bloco, ordinal)
                                 desmarcar escreve deleted_at, não apaga
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/aluno/revisoes` e `/professor/alunos/:studentId` |
| Componentes | `ReviewGrid.tsx`, `SpacingForms.tsx` |
| Actions | `setReviewDone`, `setReviewSpacing` |
| Leitura | `getReviewSpacings` e `getReviewCompletions` |
| Domínio | `lib/domain/spacing.ts` — as duas fórmulas e a montagem da grade |
| RPCs | **uma nova:** `set_review_done` |
| Migration | **uma:** duas tabelas, políticas, grants por coluna, a RPC |
| Banco | `review_spacings` e `review_completions`, ambas novas |
| Testes | `supabase/tests/06_theory.sql`, `apps/e2e/tests/student-analysis.spec.ts` e `teacher.spec.ts` |

**A auditoria é por gatilho, não por `insert` dentro da RPC.** `audit_log` tem
colunas fixas — `table_name`, `record_id`, `action`, `old_value`, `new_value` —
e quem as preenche é `tg_write_audit_log`, o mesmo gatilho de `study_plans`,
`goals`, `quiz_sessions` e `subscriptions`. As duas tabelas novas entram nele.
*Corrigido em 30/08/2026, ao implementar: a primeira versão escrevia à mão, num
formato que a tabela não tem.*

**`review_completions` carrega `teacher_id` denormalizado.** `can_view_context`
COMPARA ids, não consulta vínculo: sem a coluna, a grade sumiria para o
professor. É o mesmo motivo pelo qual `quiz_sessions` a carrega. *Ajustado em
30/08/2026, ao implementar.*

**Duas tabelas novas e nenhuma alterada** — é o caso mais simples de
compatibilidade com o bundle no ar: nada que já roda as conhece.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | As duas fórmulas produzem a grade da v96, e índice negativo vira célula vazia | `spacing.test.ts` |
| CA-02 | Zero na primeira desliga a disciplina; zero na segunda desliga só a segunda coluna | `spacing.test.ts` |
| CA-03 | Bloco excluído e bloco inativo não entram na grade | `spacing.test.ts` |
| CA-04 | Só o professor com vínculo escreve `review_spacings`; o aluno lê e não escreve | `11_review_spacing.sql` |
| CA-05 | As colunas de contexto ficam fora do `grant update`, e mover a linha entre alunos é recusado | `11_review_spacing.sql` |
| CA-06 | `set_review_done` é idempotente, desmarca com `deleted_at` e remarca a mesma linha | `11_review_spacing.sql` |
| CA-07 | Aluno e professor marcam; um terceiro leva `42501` | `11_review_spacing.sql` |
| CA-08 | O professor define o espaçamento e a grade do aluno passa a mostrar as revisões | F-REVE-01 |
| CA-09 | O aluno marca uma revisão como feita e ela permanece marcada após recarregar | F-REVE-02 |
| CA-10 | Desmarcar volta a célula ao estado pendente | F-REVE-03 |
| CA-11 | Disciplina sem espaçamento não aparece na grade do aluno e aparece zerada na do professor | F-REVE-04 |
| CA-12 | Espaçamento fora de 0..60 é recusado com mensagem | F-REVE-05 |
| CA-13 | Mudar o espaçamento não perde a marcação já feita | F-REVE-06 |
| CA-14 | Um professor sem vínculo não vê nem escreve o espaçamento do aluno alheio | F-REVE-07 |

---

## Fora de escopo

- **Revisão por data**, e não por contagem de cadernos. A v96 conta cadernos, e
  contar dias exigiria saber quando cada caderno foi estudado — informação que o
  ledger tem para bateria e não tem para teoria.
- **Terceira revisão.** São duas na v96, e o produto não pede a terceira.
- **Sugestão automática de espaçamento por matéria.** `sugestaoEspacamentoRevisao`
  devolvia zero para tudo; os números do `aluno.js` eram heurística de tela.
  Trazer isso seria inventar regra nova travestida de resgate.
- **Gerar meta de revisão na semana.** A grade diz o que revisar; transformar
  isso em meta é a distribuição da semana, spec [18](18-previa-e-distribuicao-da-semana.md).
- **PDFs por caderno.** A v96 listava PDF vinculado em cada célula. `link` já
  existe em `study_plan_blocks` e a grade o mostra; anexar arquivo é outra coisa.
- **Marcar teoria e caderno TEC na grade.** São `goals`, e o aluno já os conclui
  pela spec [12](12-conclusao-de-meta.md). Ver `R-REVE-10`.
