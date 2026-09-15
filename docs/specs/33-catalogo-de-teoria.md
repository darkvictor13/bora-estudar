# 33 — Catálogo de teoria do professor

**Situação:** implementada · **Origem:** MASTER v16 e `p-disciplinas` do professor, na v2 · **Fluxos e2e:** F-TCAT-01

> **Spec escrita depois do código**, pelo mesmo motivo da
> [32](32-fluxo-da-teoria.md): a feature veio na Fase 6 da reconstrução da v2. O
> que ela guarda é a regra de quem manda no quê — o professor define o
> conteúdo, o aluno percorre — e as três decisões que impedem o catálogo de
> virar um arquivo dentro do bundle.

---

## Problema

**O fluxo da teoria só existe se alguém disser onde a teoria começa e termina.**

A spec [32](32-fluxo-da-teoria.md) descreve um aluno lendo da página 12 à 40 de
um PDF e sendo liberado para a aula seguinte depois de quinze questões. Nada
disso é derivável: o intervalo de páginas é uma AUDITORIA feita aula por aula, o
mínimo de questões é uma escolha pedagógica, e o espaçamento das revisões é
outra. Sem uma tela onde isso seja definido, o fluxo do aluno nasce sem dado, e
a única saída seria embutir o catálogo no código — que foi o que a versão
anterior fez, com 1,9 MB de JSON no pacote da extensão.

Havia ainda um erro de acoplamento: na v2 o catálogo era **global**. Um
professor que corrigisse o intervalo de páginas de uma aula mudava o material de
todos os alunos de todos os professores, sem saber.

---

## Regras

| Id | Regra |
|---|---|
| R-TCAT-01 | O catálogo (`theory_catalogs`) é **do professor**. Um professor só lê e escreve os próprios; o aluno lê os do professor dele, por `can_access_teacher()`. |
| R-TCAT-02 | **O MASTER não entra no bundle.** Ele chega como arquivo escolhido num `<input type="file">`, é achatado no navegador e vira linhas de `theory_lessons`. Importá-lo pelo site faria todo aluno baixar 1,9 MB para abrir a tela de metas. |
| R-TCAT-03 | Ao achatar o MASTER: **sem arquivo PDF não há aula**; `tem_teoria` só vale com fim de teoria maior que zero; e o código da aula sai do campo, do nome do arquivo ou de um número sequencial — nessa ordem, porque o MASTER v16 tem as três formas. |
| R-TCAT-04 | A importação é **idempotente pelo par (catálogo, arquivo PDF)**: reimportar o mesmo MASTER atualiza as aulas que já existem em vez de duplicá-las. Imposto por `unique (teacher_id, catalog_id, pdf_file)`. |
| R-TCAT-05 | Arquivo sem nenhuma aula reconhecível é recusado com mensagem, e nada é gravado. |
| R-TCAT-06 | **Aula sem páginas auditadas é MARCADA, não escondida.** Ela continua na lista, sinalizada, porque é assim que o professor sabe o que falta auditar. |
| R-TCAT-07 | O fim da teoria não pode vir antes do início, nem passar do total de páginas do PDF. As duas na tela e no banco — `theory_lessons_pages_valid_check` e `theory_lessons_end_within_pdf_check`. |
| R-TCAT-08 | O mínimo de questões iniciais é **por disciplina do catálogo**, entre 1 e 200 (`theory_catalog_subject_rules`). |
| R-TCAT-09 | O professor configura de **zero a cinco revisões** por disciplina. Cada uma tem número, espaçamento em aulas concluídas e mínimo de questões. Salvar a regra **substitui** as revisões daquela disciplina, em vez de acumular. |
| R-TCAT-10 | Espaçamento fora da faixa é recusado (`theory_review_rules_lesson_spacing_check`, 1 a 200). |
| R-TCAT-11 | **Um catálogo por planejamento** (`study_plan_theory_catalogs.study_plan_id` é UNIQUE). Vincular de novo troca o catálogo, não acrescenta. |
| R-TCAT-12 | O vínculo só aceita catálogo **do próprio professor** e planejamento **do próprio par**. As duas pontas por FK composta — sem a segunda, o aluno ficaria com um catálogo que ele não tem permissão de ler. |
| R-TCAT-13 | A ordem das aulas é `position`, e o professor a edita. É ela que a spec 32 usa para decidir qual é a aula atual. |
| R-TCAT-14 | A chave canônica da disciplina (`subject_key`) é escrita na importação, e é por ela que a meta do aluno encontra a aula. A normalização é a mesma dos dois lados — `normalizeSubjectKey`. |

---

## Fluxo

```
  /professor/teoria
        │
        ├─ criar catálogo ──────────────► theory_catalogs
        │
        ├─ importar MASTER (arquivo) ───► flattenMaster no navegador
        │                                 └─► theory_lessons (upsert por pdf_file)
        │
        ├─ por disciplina ──────────────► questões iniciais (1 a 200)
        │                                 0 a 5 revisões: nº, espaçamento, mínimo
        │
        ├─ por aula ────────────────────► páginas auditadas, ordem, título
        │
        └─ vincular ao planejamento ────► study_plan_theory_catalogs (1 por plano)
                                                  │
                                                  ▼
                                          o fluxo da spec 32
```

---

## Superfície

| | |
|---|---|
| Rota | `/professor/teoria` |
| Componente | `routes/teacher/Theory.tsx` |
| Contrato | `listCatalogs`, `loadCatalogLessons`, `loadSubjectRules`, `saveSubjectRule`, `saveLesson`, `saveLessonOrder`, `linkCatalogToPlan`, `importMaster` |
| Adaptador | `lib/api/supabase/teacher-theory.ts` (`flattenMaster` é função pura, exportada para teste) |
| Banco | `theory_catalogs`, `theory_lessons`, `theory_catalog_subject_rules`, `theory_review_rules`, `study_plan_theory_catalogs` |
| RPCs | **nenhuma** — escrita direta, com RLS e FK composta |
| Migration | nenhuma: as cinco tabelas vieram no schema de 14/09/2026 |
| Testes | `apps/e2e/tests/teacher.spec.ts` (`F-TCAT-01`), `supabase/tests/06_theory.sql` |

---

## Critérios de aceitação

| Id | Critério | Onde |
|---|---|---|
| CA-01 | As regras por disciplina salvam, com até cinco revisões | `F-TCAT-01` |
| CA-02 | A aula sem páginas auditadas aparece marcada, e não sumida | `F-TCAT-01` |
| CA-03 | Editar as páginas de uma aula grava | `F-TCAT-01` |
| CA-04 | O fim da teoria além do total de páginas é recusado, com o campo marcado | `F-TCAT-01` |
| CA-05 | Vincular o catálogo ao planejamento, um por planejamento | `F-TCAT-01` |
| CA-06 | Espaçamento fora da faixa é recusado | `F-TREV-01` |
| CA-07 | Um professor não cria regra dentro do catálogo de outro | `supabase/tests/06_theory.sql` |
| CA-08 | Um professor não liga o catálogo de outro ao próprio planejamento | `supabase/tests/06_theory.sql` |
| CA-09 | O aluno lê o catálogo do professor dele, e não escreve nele | `supabase/tests/06_theory.sql` |
| CA-10 | Reimportar o mesmo MASTER não duplica aula | **sem cobertura** |
| CA-11 | Arquivo sem aula reconhecível é recusado sem gravar nada | **sem cobertura** |

CA-10 e CA-11 são dívida visível: a importação é exercitada na tela pelo caminho
feliz, e as duas bordas dependem de subir um arquivo de teste pelo
`<input type="file">`, que a suíte ainda não faz.

---

## Fora de escopo

- **Catálogo compartilhado entre professores.** Era assim na v2, e é a causa do
  problema descrito acima. Se um dia fizer sentido, é um catálogo `template`
  copiado na criação — nunca uma linha escrita por dois donos.
- **Auditar as páginas automaticamente.** Ler o PDF e adivinhar onde a teoria
  termina é o que produz o número inventado que a spec 32 recusa a exibir.
- **Editar o MASTER pelo site.** O arquivo é insumo, não produto: ele nasce fora
  e entra por importação.
