# 32 — O fluxo da teoria

**Situação:** implementada · **Origem:** v108.2 e v108.5 da v2 (`theory-engine.js`, `aluno-theory.js`) · **Fluxos e2e:** F-TEO-01 a F-TEO-07

> **Spec escrita depois do código, e a ordem inverteu por um motivo.** A regra
> do repositório é spec antes de código; esta feature veio na Fase 4 da
> reconstrução da v2, junto com dezenas de telas, e a spec ficou para trás. Está
> aqui agora porque a regra que ela guarda — em que ordem a aula fecha — não
> cabe num comentário e não se lê no SQL.

---

## Problema

**"Estudei a aula" não quer dizer nada verificável.**

Antes deste fluxo, a meta de teoria da semana era uma caixa de marcar. O aluno
lia — ou não —, marcava, e o sistema registrava a mesma coisa nos dois casos. O
professor via "concluída" e não sabia se aquilo eram quarenta páginas lidas ou
um clique. Quem estudava de verdade não tinha onde retomar: fechava o PDF na
página 23 e, na sessão seguinte, procurava de novo onde tinha parado.

E havia um erro de ordem, que é o mais caro: nada impedia o aluno de fechar a
aula sem fazer questão nenhuma. A v2 aprendeu, em três versões seguidas, que
**ler sem responder não fixa** — e que quem pula as questões iniciais descobre o
buraco na semana da prova, não na semana da aula.

Ao mesmo tempo, o catálogo auditado **não cobre todas as disciplinas**.
Matemática Financeira e TI ficaram de fora na v108.5. A tentação é preencher com
um intervalo de páginas qualquer; a v2 recusou, e a reconstrução mantém a
recusa. Número de página inventado manda o aluno ler o PDF errado e faz com que
ele ache que a culpa é dele.

---

## Regras

| Id | Regra |
|---|---|
| R-TEO-01 | A aula é a unidade de estudo da teoria. Uma aula tem código, posição, PDF e, quando auditada, um **intervalo de páginas** (`theory_lessons.theory_start_page`, `theory_end_page`). |
| R-TEO-02 | O progresso do aluno numa aula é a **última página lida** (`theory_progress.current_page`), e o zero natural é `primeira − 1`: quem não começou está uma página ANTES da primeira, não na primeira. |
| R-TEO-03 | A página gravada é presa ao intervalo auditado: nunca antes de `primeira − 1`, nunca depois de `theory_end_page`. Imposto por `clampPage` na escrita, e pelo `CHECK (current_page >= 0)`. |
| R-TEO-04 | **A teoria está lida quando a última página lida é a última da teoria.** Aula sem teoria (`has_theory = false`) tem a teoria por lida desde o início. |
| R-TEO-05 | **Encerrar a sessão não conclui a aula.** "Salvar e encerrar" grava a página e fecha o modal; a aula continua aberta. |
| R-TEO-06 | **A aula fecha com as duas coisas**: teoria lida E `initial_questions_done >= mínimo` da disciplina. Fechar libera a aula seguinte. |
| R-TEO-07 | O mínimo de questões iniciais é do professor, por disciplina (`theory_catalog_subject_rules.initial_questions`). Sem regra configurada, o mínimo é **15**. |
| R-TEO-08 | As questões iniciais **somam** entre sessões, nunca substituem: elas podem ser feitas em duas sentadas. |
| R-TEO-09 | Acertos acima do total de questões são recusados, e questão zero não é registro. |
| R-TEO-10 | Toda questão inicial entra também no **ledger da meta** (`goal_entries`, com `theory_stage`), para contar no tempo e no desempenho da semana como qualquer outro estudo. |
| R-TEO-11 | A aula em que o aluno está é a **primeira que ele ainda não concluiu**, na ordem `position` com desempate por `lesson_code`. Quando não sobra nenhuma, é a última, marcada como disciplina concluída — devolver "sem aula" para quem terminou diz o oposto do que aconteceu. |
| R-TEO-12 | **A revisão é espaçada em AULAS CONCLUÍDAS, não em dias.** A revisão `n` de uma aula vence quando o aluno conclui a `lesson_spacing`-ésima aula depois dela. Ritmo irregular quebraria a conta de calendário. |
| R-TEO-13 | Quando a disciplina inteira termina, as revisões restantes **vencem juntas** — senão a matéria nunca fecharia, por não haver aula nova para empurrá-las. |
| R-TEO-14 | **Revisão vencida não bloqueia o avanço.** Ela entra numa fila própria. Bloquear transformaria um lembrete em muro exatamente para quem está atrasado. |
| R-TEO-15 | A revisão fecha quando `questions_answered >= minimum_questions`; revisão concluída não aceita novo registro (`conflict`). |
| R-TEO-16 | O professor configura de **zero a cinco** revisões por disciplina (`theory_review_rules`, `review_number` de 1 a 10 no banco, 5 na tela). Espaçamento zero desliga a revisão. |
| R-TEO-17 | **Disciplina não auditada recebe diagnóstico, não controle de página.** É descoberto pelo DADO — disciplina cujas aulas vêm todas sem intervalo de teoria —, e nunca por uma lista de exceções escrita à mão, que envelheceria na próxima auditoria. |
| R-TEO-18 | Planejamento sem catálogo de teoria vinculado recebe o diagnóstico `no_catalog_linked`, e a tela explica em vez de ficar vazia. |
| R-TEO-19 | A meta guarda o **nome** da disciplina, em texto livre; o catálogo guarda `subject_key`. O casamento é por chave canônica e **exato depois de normalizar** — nunca por `includes`: "ti" está dentro de "adminisTIativo". |
| R-TEO-20 | O progresso é do aluno: `theory_progress` e `theory_reviews` só aceitam escrita de quem é dono da linha E tem acesso vigente (`has_active_access()` no `WITH CHECK`). Quem venceu continua lendo e apagando o que já era dele. |

---

## Fluxo

```
  meta de teoria da semana
        │  abre o modal
        ▼
  ┌─ aba Teoria ─────────────┐   página atual, dentro do intervalo auditado
  │  "Salvar e continuar"    │ → grava a página, segue aberto
  │  "Salvar e encerrar"     │ → grava a página, FECHA — aula continua aberta
  └──────────────────────────┘
        │  última página lida == fim da teoria  → theory_done
        ▼
  ┌─ aba Questões iniciais ──┐   quantas fez, quantas acertou
  │  soma ao que já havia    │ → goal_entries (ledger) + initial_questions_done
  └──────────────────────────┘
        │  mínimo da disciplina atingido
        ▼
  aula CONCLUÍDA  →  libera a próxima  →  pode vencer revisão de aula anterior
        │
        ▼
  ┌─ aba Revisões ───────────┐   fila do que venceu, por regra
  │  registra questões       │ → fecha ao atingir o mínimo da regra
  └──────────────────────────┘   NÃO bloqueia o avanço
```

---

## Superfície

| | |
|---|---|
| Rotas | `/aluno` (a meta de teoria abre o modal), `/aluno/teoria` (o controle por disciplina) |
| Componentes | `components/student/TheoryDialog.tsx`, `routes/student/Theory.tsx` |
| Regras puras | `lib/domain/theory.ts` — `lessonProgressPercent`, `clampPage`, `isTheoryDone`, `currentLesson`, `isLessonComplete`, `dueReviews`, `diagnose`, `normalizeSubjectKey` |
| Contrato | `loadTheoryGoal`, `loadTheoryControl`, `saveTheoryProgress`, `recordInitialQuestions`, `recordReviewQuestions`, `loadDueReviews` |
| Adaptador | `lib/api/supabase/theory.ts` |
| Banco | `theory_lessons`, `theory_progress`, `theory_reviews`, `theory_catalog_subject_rules`, `theory_review_rules`, `study_plan_theory_catalogs`, `goal_entries` |
| RPCs | **nenhuma** — escrita direta, com RLS, grant por coluna e FK composta |
| Migration | nenhuma: as sete tabelas vieram no schema de 14/09/2026 |
| Testes | `apps/web/src/lib/domain/theory.test.ts`, `apps/e2e/tests/student-theory.spec.ts`, `supabase/tests/06_theory.sql` |

---

## Critérios de aceitação

| Id | Critério | Onde |
|---|---|---|
| CA-01 | O modal abre na primeira aula não concluída, com as três abas | `F-TEO-01` |
| CA-02 | O progresso é por página e continua de onde parou | `F-TEO-02` |
| CA-03 | A página é presa ao intervalo auditado, nos dois extremos | `F-TEO-02`, `theory.test.ts` |
| CA-04 | Encerrar a sessão grava a página e **não** conclui a aula | `F-TEO-03` |
| CA-05 | Abaixo do mínimo a aula não fecha; no mínimo, fecha e libera a próxima | `F-TEO-04` |
| CA-06 | As questões iniciais entram no ledger da meta | `F-TEO-04` |
| CA-07 | Acertos acima do total são recusados, com o campo marcado | `F-TEO-04` |
| CA-08 | Uma revisão nasce por regra ativa, e a fila não bloqueia o avanço | `F-TEO-05` |
| CA-09 | Registrar a revisão a fecha ao atingir o mínimo | `F-TEO-05` |
| CA-10 | Disciplina fora do catálogo mostra o diagnóstico em vez do controle por página | `F-TEO-06` |
| CA-11 | A tela de controle **marca** a disciplina não auditada, em vez de escondê-la | `F-TEO-06` |
| CA-12 | Sem catálogo vinculado, a tela explica em vez de ficar vazia | `F-TEO-07` |
| CA-13 | O aluno não grava progresso dentro do planejamento de outro | `supabase/tests/06_theory.sql` |
| CA-14 | Acesso vencido recebe `42501` ao gravar, e continua lendo o que era dele | `supabase/tests/06_theory.sql` |

---

## Fora de escopo

- **Ler o PDF dentro do site.** O PDF vive onde sempre viveu; o produto guarda a
  página, não o arquivo. Embutir um leitor significaria hospedar material de
  terceiro, que é decisão jurídica e não de interface.
- **Contar o tempo de leitura automaticamente.** A v2 tentou, e o número media
  aba aberta, não estudo. O tempo continua sendo declarado pelo aluno no
  registro da meta.
- **Revisão por calendário.** Descartada em R-TEO-12, com o motivo.
- **Amarrar o progresso ao catálogo do planejamento.** `theory_progress` aponta
  para a aula, não para o vínculo; amarrar exigiria `teacher_id` na tabela. O
  resíduo — o aluno marcar progresso numa aula de outro professor dentro do
  próprio planejamento — é sujeira na linha dele, sem leitura de dado alheio.
  Está registrado em `de-para-schema.md`, seção "O que ficou em aberto".
