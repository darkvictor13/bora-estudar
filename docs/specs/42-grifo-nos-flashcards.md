# 42 — Grifo nos flashcards

**Situação:** implementada em 03/10/2026 · **Fluxos e2e:** F-GRIFO-01 a F-GRIFO-03

Primeira de duas. Esta põe as marcações de cartão no banco e o grifo dentro da
revisão; a **43** traz a leitura do deck inteiro, que grifa nas mesmas
marcações e não toca o banco. Leva aos cartões o que a
[40](40-leis-editais-e-marcacoes-no-banco.md) fez com a lei seca.

---

## Problema

Revisando um cartão, o aluno percebe o que importa nele: o prazo, a exceção, a
palavra que o faz errar toda vez. Não tem como guardar essa percepção. Na
revisão seguinte o cartão volta igual, e ele precisa redescobrir sozinho o
que já tinha descoberto — ou não redescobre, e erra pelo mesmo motivo.

Na lei seca isso já existe: o aluno grifa, o grifo fica na conta e reaparece
em qualquer aparelho. O cartão é texto do mesmo tipo, estudado pelo mesmo
aluno, e não tem nada.

O texto do cartão também muda. O professor reescreve o cartão da aula, a carga
corrige o da biblioteca, o aluno edita o próprio. Um grifo preso só à posição
do caractere passaria a pintar o trecho errado na primeira correção, sem
ninguém perceber — o defeito que a 40 já resolveu para as leis.

---

## Regras

### A marcação

| Id | Regra |
|---|---|
| R-GRIFO-01 | A marcação é do aluno e mora em `flashcard_marks`, uma linha por trecho marcado: `id` gerado no navegador, `student_id`, o cartão (R-GRIFO-02), `side`, `start_offset`, `end_offset`, `style`, `color` e a âncora de texto (R-GRIFO-05). |
| R-GRIFO-02 | Vale para os três tipos de cartão. `card_kind` (enum `flashcard_card_kind`: `library`, `lesson`, `personal`) diz qual, e cada tipo preenche só as próprias colunas de referência: `library_deck_id` + `library_card_id`, `lesson_id` + `lesson_card_id`, ou `personal_deck_id` + `personal_card_id`. A CHECK `flashcard_marks_card_ref_check` exige o par do tipo e nulos nos outros dois. *(Uma tabela, e não três como as revisões: a regra de grifo é uma só, e três tabelas seriam três cópias da mesma policy para derivar.)* |
| R-GRIFO-03 | Cada referência tem FK composta para o cartão: `(library_deck_id, library_card_id)` → `library_flashcards (deck_id, id)`; `(lesson_card_id, lesson_id)` → `theory_lesson_flashcards (id, theory_lesson_id)`; `(personal_card_id, personal_deck_id, student_id)` → `personal_flashcards (id, deck_id, student_id)`. A última inclui `student_id`: o cartão pessoal grifado é do próprio aluno, e não só um cartão que existe. |
| R-GRIFO-04 | Frente e verso: `side` (enum `flashcard_side`: `front`, `back`) diz em qual lado está o trecho. As posições são índices no texto daquele lado. |
| R-GRIFO-05 | **Âncora por trecho, além da posição**, como R-LEI-11: `quote` (o texto exato), `prefix` e `suffix` (até 32 caracteres antes e depois, CHECK). `quote` tem o tamanho exato de `end_offset - start_offset` (CHECK), e `end_offset > start_offset` (CHECK). |
| R-GRIFO-06 | Estilo e cor são os da lei, pelos mesmos enums: `law_mark_style` e `law_mark_color`. As quatro ferramentas e as sete cores são uma paleta só; uma cor nova entra nas duas telas de uma vez. *(Decidido pelo autor: renomear os enums agora mudaria o tipo gerado que o bundle no ar usa.)* |

### Quem escreve

| Id | Regra |
|---|---|
| R-GRIFO-07 | O aluno escreve direto, com RLS. Lê só as próprias marcações, sempre — também com o acesso vencido (`flashcard_marks_select`). |
| R-GRIFO-08 | Criar, alterar e **apagar** exigem acesso vigente (`has_active_access()` em `flashcard_marks_insert`, `_update` e `_delete`). *(Decidido na entrevista. Diverge da lei, onde apagar não exige acesso.)* |
| R-GRIFO-09 | Criar exige cartão vivo que o aluno enxerga: da biblioteca, `retired_at is null`; da aula, `not deleted` numa aula ativa e publicada que a RLS de `theory_lessons` mostra a ele, como `flashcard_reviews_insert`; o pessoal, garantido pela FK de R-GRIFO-03. |
| R-GRIFO-10 | `GRANT UPDATE` só em `start_offset`, `end_offset`, `quote`, `prefix`, `suffix`, `style` e `color`. `student_id`, `card_kind`, `side` e as seis colunas de referência ficam fora: mudar de cartão ou de lado é apagar e criar. |
| R-GRIFO-11 | O professor não lê marcação de aluno nenhum, nem dos próprios alunos: a policy de SELECT é só `student_id = auth.uid()`. *(Decidido na entrevista: o grifo é anotação privada.)* |

### O cartão muda ou sai

| Id | Regra |
|---|---|
| R-GRIFO-12 | Ao mostrar o cartão, cada marcação é reancorada no texto do lado gravado: se `quote` ainda está na posição gravada, pinta ali; senão procura `quote` no mesmo lado e escolhe a ocorrência de contexto mais parecido com `prefix` e `suffix`, desempatando pela mais próxima da posição antiga. Empate sem contexto em comum é ambiguidade: a marcação é tratada como perdida. Mesma regra de R-LEI-12, com o lado no lugar do artigo. |
| R-GRIFO-13 | Marcação que não se reancora não é pintada, **continua no banco**, e o cartão diz quantas estão nessa situação. Nenhuma marcação é apagada pela correção de um texto. |
| R-GRIFO-14 | Cartão da biblioteca retirado e cartão de aula apagado por marca (`deleted`) mantêm as marcações: a FK é `on delete restrict`, como `flashcard_reviews` e `library_flashcard_reviews`. Apagar a AULA continua barrado enquanto houver marcação nela, como já é para a revisão. *(Decidido pelo autor, por consistência com a revisão.)* |
| R-GRIFO-15 | Cartão pessoal apagado leva as marcações junto: a FK é `on delete cascade`. O cartão e o grifo são do mesmo aluno, e não há para quem preservar. |
| R-GRIFO-16 | Cartão da biblioteca movido de deck (alias, R-BIB-08) mostra as marcações gravadas no cartão antigo, reancoradas no texto do novo. A linha continua apontando para o par antigo — as colunas de referência estão fora do grant —, e é a leitura que resolve o alias, como faz com a revisão. *(Decidido na entrevista.)* |

### Gravar

| Id | Regra |
|---|---|
| R-GRIFO-17 | Salvar é a diferença entre o antes e o depois de cada ação (criar, alterar, apagar por `id`). É **naturalmente idempotente**, e quem sustenta é a PK `flashcard_marks_pkey`: criar é `insert … on conflict do nothing` com o id do navegador; alterar grava valores absolutos; apagar é por id. As gravações de uma aba saem em fila, uma depois da outra. Mesma forma de R-LEI-15. |
| R-GRIFO-18 | Desfazer vale para a sessão de revisão aberta, e cada desfazer é uma gravação como as outras. |

### Na revisão

| Id | Regra |
|---|---|
| R-GRIFO-19 | O aluno grifa no cartão aberto, na frente e no verso, sem sair da sessão — também no modo foco. As ferramentas são as da lei: marca-texto, sublinhado, tachado, contorno, apagar a marcação do trecho, sete cores e desfazer. |
| R-GRIFO-20 | **Clique simples continua virando o cartão; terminar uma seleção de texto não vira.** O que separa os dois é o ponteiro ter andado entre apertar e soltar, e não haver texto selecionado — clicar sobre uma seleção ainda não a desfez quando o clique chega. No texto do cartão, o clique espera 300 ms antes de virar: pode ser o primeiro de um duplo clique que seleciona a palavra. Espaço, Enter e o atalho do modo foco seguem como hoje. *(Decidido na entrevista.)* |
| R-GRIFO-21 | A seleção vale dentro de um lado só. O trecho que atravessa da pergunta para a resposta não é marcável. |
| R-GRIFO-22 | O grifo aparece na revisão seguinte do mesmo cartão, em qualquer aparelho, e não muda nada na revisão espaçada: não entra em intervalo, nota, contador nem estatística. |

---

## Fluxo

```
/aluno/flashcards?deck=X   → deck + revisões + loadFlashcardMarks(cartões do deck)
(ou ?aula=, ?meuDeck=)     → resolver alias (só biblioteca) → reancorar por lado (R-GRIFO-12)
                           → pintar as encontradas, contar as perdidas por cartão
selecionar num lado        → ferramenta → nova lista → diff por id
                           → saveFlashcardMarks (fila) → INSERT / UPDATE / DELETE
clique sem seleção         → vira o cartão (R-GRIFO-20)
```

---

## Superfície

| Camada | Item |
|---|---|
| Migration | `supabase/migrations/20261003120000_flashcard_marks.sql` — uma: `flashcard_marks`, enums `flashcard_card_kind` e `flashcard_side`, grants, policies, gatilho `updated_at` |
| RPCs | nenhuma — escrita direta, como `law_marks` |
| Contrato | `lib/api/flashcard-marks.ts`: `loadFlashcardMarks`, `saveFlashcardMarks`; tipos `FlashcardMark`, `FlashcardCardRef`, `FlashcardDeckRef`, `SaveFlashcardMarksInput` |
| Adaptadores | `lib/api/supabase/flashcard-marks.ts`; `lib/api/fixtures-flashcard-marks.ts` |
| Domínio | `lib/domain/text-markings.ts` (novo): pintura, âncora, reancoragem e diff sem saber de onde vem o texto. `law-markings.ts` passa a usá-lo, com as mesmas exportações; `flashcard-markings.ts` (novo) é o equivalente para o lado do cartão, mais a resolução de alias |
| Componentes | `components/MarkingToolbar.tsx` (novo): a barra que saiu de `LawContinuousReader.tsx`. `lib/ui/useMarkingSession.ts` (fila de gravação e desfazer) e `lib/ui/textSelection.ts` (seleção em posição de caractere), usados pelas duas telas. `FlashcardSession` em `routes/student/Flashcards.tsx` |
| Testes | `supabase/tests/19_flashcard_marks.sql` (22), `01_grants.sql` (33), `07_schema.sql` (13, com os números novos), `lib/domain/flashcard-markings.test.ts`, `lib/api/fixtures.test.ts`, `apps/e2e/tests/flashcards.spec.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | O aluno lê e escreve só as próprias marcações; o colega e o professor leem zero, alteram zero e apagam zero (contado por linhas). | `supabase/tests/19_flashcard_marks.sql` (01, 14, 15, 22) |
| CA-02 | `student_id`, `card_kind`, `side` e as colunas de referência estão fora do grant de UPDATE (`42501`). | `19_flashcard_marks.sql` (02 a 05) e `01_grants.sql` (33) |
| CA-03 | São recusados: referência de outro tipo preenchida junto, par incompleto, cartão pessoal de outro aluno, `quote` de tamanho errado, cartão da biblioteca retirado, cartão de aula apagado e aula não publicada. | `19_flashcard_marks.sql` (06 a 13) |
| CA-04 | Com o acesso vencido o aluno lê as próprias marcações e não cria, não altera e não apaga nenhuma. | `19_flashcard_marks.sql` (16 a 18) |
| CA-05 | Apagar cartão pessoal apaga as marcações dele; retirar cartão da biblioteca e marcar cartão de aula como apagado as mantêm; apagar a aula com marcação é recusado. | `19_flashcard_marks.sql` (19 a 21) |
| CA-06 | Reancorar por lado: trecho no lugar pinta no lugar; deslocado pinta no lugar novo; repetido escolhe pelo contexto; sumido não pinta e é contado; o grifo do verso nunca se reancora na frente. | `lib/domain/flashcard-markings.test.ts` |
| CA-07 | A marcação gravada num cartão antigo da biblioteca aparece no cartão que o substituiu por alias. | `flashcard-markings.test.ts` e `lib/api/fixtures.test.ts` |
| CA-08 | O contrato de marcações de cartão é o mesmo nas duas implementações, inclusive o diff vazio para listas iguais. | `lib/api/fixtures.test.ts` |
| CA-09 | O aluno grifa o verso de um cartão da biblioteca e a frente de um cartão pessoal; numa sessão nova, os dois grifos aparecem na revisão seguinte de cada cartão. | F-GRIFO-01 |
| CA-10 | O professor reescreve o cartão da aula antes do trecho grifado e o grifo continua no mesmo trecho; apagado o trecho, o cartão avisa que uma marcação ficou sem lugar. | F-GRIFO-02 |
| CA-11 | Clique simples vira o cartão; terminar uma seleção não vira; desfazer remove o último grifo, e ele continua removido depois de recarregar. | F-GRIFO-03 |

---

## Fora de escopo

- **A leitura do deck inteiro.** É a spec 43, e não muda o banco: grifa nas
  mesmas `flashcard_marks`.
- **O professor ver os grifos dos alunos.** Decidido na entrevista
  (R-GRIFO-11); "o que a turma grifou neste cartão" seria uma analítica com
  outra spec e outra discussão de privacidade.
- **O grifo como sinal da revisão espaçada.** Grifar não diz que o aluno sabe
  ou não sabe o cartão (R-GRIFO-22).
- **Buscar ou filtrar cartões pelo grifo.** Não foi pedido.
- **Grifo nos resumos e nas aulas de teoria.** Outros textos, outros donos;
  entram com spec própria se forem pedidos.
- **Gravar a posição reancorada e reancorar entre lados.** Pelos mesmos motivos
  da spec 40: a reancoragem é determinística e roda a cada abertura, e o mesmo
  termo costuma aparecer na pergunta e na resposta.
- **Desfazer entre sessões.**
