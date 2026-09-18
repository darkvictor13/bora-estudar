# 13 — Vínculo, acesso e turmas

**Situação:** implementada · **Comparativo:** §12 item 2 · **Fluxos e2e:** F-VINC-01 a F-VINC-08 e F-MATR-01 a F-MATR-05

> **Reescrita e implementada em 18/09/2026**, pela migration
> `20260918120000_link_access_and_classes.sql`. A versão anterior desta spec
> estava marcada
> `implementada` e descrevia um schema que não existe mais: `student_teacher_links`,
> `subscriptions`, `reserve_operation` e `student_has_teacher` saíram com a
> reimplementação de 14/09. O vínculo virou `profiles.teacher_id` e o acesso virou
> `profiles.access_status` com `access_expires_at` — os três fora de todo `GRANT
> UPDATE`, e nada do que a spec prometia funcionava. Quem os escreve agora são as
> RPCs desta spec.
>
> **A spec passou a cobrir turmas também.** `classes` e `class_students` existiam
> no banco desde a migration inicial, com RLS, FK composta e grants, e nunca
> tinham ganhado contrato nem tela. Entram aqui por decisão de produto de 18/09/2026:
> quem opera uma escola física precisa do aluno vinculado **e** na turma no
> mesmo movimento, e o lado do banco já está pronto — turma não acrescenta
> migration nenhuma além do que o vínculo já exige.
>
> Os ids antigos foram preservados. Os que morreram com o schema estão na tabela
> **Regras removidas**, com a data e o motivo, como manda o README.

---

## Problema

> **Este é o problema que a spec resolveu**, e fica no tempo presente de
> propósito: é o estado do produto em 17/09/2026, que a migration
> `20260918120000` fechou. O README pede que spec implementada descreva o que
> É — e o que É, hoje, está nas seções **Regras** e **Fluxo**.

**Quem se cadastra não é de ninguém.**

O perfil nasce por gatilho em `auth.users` — sempre aluno, sempre `pending`,
sempre com `teacher_id` nulo (`app_private.create_profile_for_new_user`, na
migration `20260914190000`). A partir daí o produto acaba: `profiles.teacher_id`,
`access_status` e `access_expires_at` estão **fora de todo grant**, e não existe
RPC que os escreva. Não há tela, não há função, não há caminho.

O efeito é que **o produto não funciona sem alguém abrir o SQL editor.** Isso não
é hipótese: `scripts/turma-de-teste.sql` existe exatamente para isso, e o
cabeçalho dele lista as três operações que faz como dono do banco porque o
produto não as faz — promover a professor, vincular aluno a professor e liberar
acesso. Um professor que se cadastrasse sozinho hoje veria a lista de alunos
vazia para sempre, e o aluno que se cadastrasse veria a lista de espera para
sempre. Nenhum dos dois tem como sair desse estado por conta própria.

Três `test.fixme` em `apps/e2e/tests/teacher.spec.ts` guardam a falta, e o
adaptador do Supabase a diz em voz alta: `grantAccess` e `revokeAccess` **lançam**
com o motivo em vez de tentar e colher `42501`.

**A regra que resolvia isso antes era pior que a falta.** O gatilho de origem
anexava quem se cadastrava ao professor MAIS ANTIGO da base — um `order by
created_at limit 1` que entregava os dados de um aluno a quem por acaso tivesse
criado a conta primeiro. A v96 escapava de outro jeito: todo aluno novo era
amarrado no cadastro a um UUID fixo no bundle (`PROFESSOR_PADRAO_ID`,
`index.js:2045`), e a tela de estado vazio do professor instruía, em português, a
inserir o perfil à mão no banco com `professor_id` igual ao seu UID
(`professor.js:4124`). Um produto com um professor só funciona assim; com dois,
não.

**E a fila de entrada, hoje, é um diretório.** A `20260914190000` abriu
`waitlist_select` para que a inscrição sem professor fosse visível a quem é
professor — sem isso ela não apareceria para ninguém além de quem a escreveu, e a
fila seria invisível por construção. O preço está dito na própria migration:
enquanto `user_role` não tiver `admin`, nome, e-mail, WhatsApp e data de
nascimento de todo mundo que ainda não tem professor são legíveis por **qualquer**
professor. Numa escola física isso não é necessário: o professor sabe de quem
está falando, porque a pessoa está na frente dele.

**Organizar quem já entrou também não existe.** `classes` e `class_students` estão
no banco com policy, grant e a FK composta que impede matricular aluno de outro
professor — e nenhuma linha de contrato ou de tela as alcança.
`StudentCard.className` é lido e exibido (`teacher-students.ts:74`), e
`StudentListFilter.classId` é declarado no contrato e **silenciosamente ignorado**
por `applyFilter` (`teacher-students.ts:146`): filtrar por turma hoje devolve a
lista inteira, sem erro.

---

## Regras

### A máquina de estados do acesso

`profiles.access_status` × `profiles.access_expires_at`, e o que cada par
significa para `public.has_active_access()`:

| `access_status` | `access_expires_at` | Entra? | Quem escreve |
|---|---|---|---|
| `pending` | nulo | não | o gatilho, no nascimento da conta |
| `active` | data futura | **sim** | `set_student_access`, ação `grant` |
| `active` | data passada | não | **ninguém escreve**: inexprimível, ver `R-VINC-27` |
| `suspended` | preservada | não | `set_student_access`, ação `suspend` |
| `expired` | qualquer | não | **ninguém**, ver `R-VINC-28` |

### Achar o aluno

| Id | Regra |
|---|---|
| R-VINC-21 | **Não existe lista de candidatos.** O professor acha o aluno pelo **e-mail inteiro**, por `public.find_student_by_email(p_email text)` — `security definer`, porque o e-mail mora em `auth.users` e a API não expõe aquele schema. A função casa `lower(btrim(...))` inteiro e devolve **no máximo uma linha**. Sem `like`, sem prefixo, sem busca por nome: casar parcial é enumeração com outro nome. |
| R-VINC-22 | A função devolve `student_id`, `name`, `has_teacher` e `is_mine`, e **nada além**. Em particular não devolve QUAL professor — revelar transformaria a busca num mapa de quem é aluno de quem. Só quem é professor a executa (`public.is_teacher()`), e o `execute` é nominal para `authenticated` depois do `revoke ... from public`. |
| R-VINC-23 | `waitlist_select` **deixa de mostrar a fila sem dono.** A cláusula `or teacher_id is null` sai da policy, que volta a ser `student_id = auth.uid() or (is_teacher() and teacher_id = auth.uid())`. Com a busca no lugar da lista, manter a policy aberta deixaria o diretório a uma chamada de API de distância — e bloqueio que só existe na tela é o que este repositório trata como bug. |
| R-VINC-24 | Um aluno que já tem professor **é encontrado**, com `has_teacher = true`, e o vínculo é recusado. Responder "não existe" faria a tela mentir para quem digitou o e-mail certo do próprio aluno. |
| R-VINC-25 | **Suposição registrada:** a busca por e-mail exato continua sendo um oráculo — quem já é professor descobre se um endereço tem conta neste produto. É aceito porque o alvo é restrito (só `is_teacher()`), o casamento é exato, não há listagem e não há iteração barata. **Merece revisão humana** no dia em que qualquer pessoa puder se cadastrar como professora. |

### Vincular

| Id | Regra |
|---|---|
| R-VINC-05 | O professor **não ganha escrita** na lista de espera nem em `profiles` alheio. Os grants de `waitlist` e o `grant update (name)` de `profiles` ficam como estão. Quem escreve `teacher_id` é a RPC, como `security definer`. |
| R-VINC-07 | Vincular é **RPC**: `public.link_student(p_student_id uuid)`. `profiles.teacher_id` não tem grant e não é para ganhar — o vínculo é o predicado de `is_teacher_of()`, e portanto a entrada das policies de `study_plans`, `goals`, `goal_entries`, `study_plan_notebooks` e `class_students`. Conceder `update` nele seria conceder a capacidade de escolher o que se enxerga. |
| R-VINC-08 | Só quem tem `role = 'teacher'` vincula (`public.is_teacher()`), e o vínculo é **sempre com quem chama**: a RPC grava `auth.uid()`, e não recebe `teacher_id` por parâmetro. Não existe vincular aluno ao professor alheio. |
| R-VINC-09 | O alvo precisa ser um perfil com `role = 'student'`. Vincular um professor a outro é recusado com mensagem, antes de qualquer escrita. |
| R-VINC-10 | **Um professor por aluno.** O que sustenta não é índice: é a coluna. `profiles.teacher_id` cabe um valor só, e a RPC escreve por `update ... where id = p_student_id and teacher_id is null`, num comando só. Duas chamadas simultâneas serializam no bloqueio de linha e a segunda vê `row_count = 0` — a exclusão mútua é do Postgres, não do código. |
| R-VINC-11 | A RPC **reivindica a linha da lista de espera** no mesmo comando, gravando `waitlist.teacher_id = auth.uid()` onde ele for nulo. Aluno sem linha na fila é vinculável do mesmo jeito: o `update` não acha linha e segue. |
| R-VINC-12 | `link_student` é **naturalmente idempotente**, e `R-VINC-10` diz o que a sustenta. Chamar de novo com o aluno já sendo seu devolve o mesmo resultado, sem erro e sem segunda escrita; com o aluno de outro, recusa. Não recebe `request_id`: não há payload a comparar, porque o único parâmetro já é a identidade do alvo. |
| R-VINC-13 | As três funções declaram `set search_path = ''`, levam `revoke execute ... from public, anon, authenticated` e só então recebem `execute` nominal para `authenticated`. O `revoke` dos dois papéis sozinho não tira nada — o privilégio vem do grantee vazio que ambos herdam, que foi o BUG-14. |
| R-VINC-14 | **Vincular não libera acesso.** São dois atos: o vínculo diz de quem o aluno é, o acesso diz se ele entra. Um aluno vinculado e sem acesso continua vendo a lista de espera — é `R-ACC-04`, no loader de cada tela de estudo. É o estado de quem foi matriculado e cuja mensalidade ainda não entrou. |
| R-VINC-26 | `protect_waitlist_identity` ganha **uma** exceção: `teacher_id` nulo pode virar o `auth.uid()` de quem é professor, uma vez. Qualquer outra alteração de `student_id`, `teacher_id` ou `email` continua barrada. Sem isso a RPC não escreve a reivindicação de `R-VINC-11`: o gatilho congela para todo ator `authenticated`, e o JWT **continua sendo o do chamador** dentro de um `security definer` — `auth.jwt()` lê `request.jwt.claims`, que é ajuste de sessão e não muda com o dono da função. A afirmação em contrário no comentário da `20260914190000` está errada, e `supabase/tests/05_waitlist.sql` passa a prová-lo nos dois sentidos. |

### Liberar e bloquear

| Id | Regra |
|---|---|
| R-VINC-15 | Liberar e bloquear são **RPC**: `public.set_student_access(p_student_id uuid, p_action public.access_grant_action, p_months integer, p_request_id uuid)`. `access_status` e `access_expires_at` ficam fora do `GRANT UPDATE` de `profiles` para que ninguém estenda o próprio acesso nem se promova, e afrouxar o grant para a tela funcionar abriria o buraco que ele fecha. |
| R-VINC-16 | A vigência padrão é de **3 meses**, o valor da v96 (`liberarAlunoAcesso`, chamado com o literal `3`). O professor escolhe entre 1, 3, 6 e 12 — e a `check` `access_grants_months_check` recusa qualquer outro valor. |
| R-VINC-17 | Liberar **soma ao que ainda falta**: a vigência nova é `greatest(now(), coalesce(access_expires_at, now())) + p_months`. Quem renova antes do fim não perde dia pago, que é como mensalidade funciona. |
| R-VINC-18 | Bloquear grava `access_status = 'suspended'` e **preserva** `access_expires_at`. Dá para reativar sem redigitar, e fica auditável até quando o acesso valia. |
| R-VINC-20 | Nada é apagado. Bloquear é mudança de status, e `access_grants` não tem `delete` para papel nenhum. |
| R-VINC-27 | O par `active` com data passada é **inexprimível**: liberar sempre produz data futura por `R-VINC-17`, e é o único caminho que escreve `active`. É o estado que o BUG-07 explorava — status e data divergentes. |
| R-VINC-28 | `expired` fica **sem escritor** nesta spec. `has_active_access()` já recusa data vencida, e um status que só uma rotina agendada escreveria seria um segundo caminho afirmando o mesmo fato — que é exatamente o que os nove contadores de `baterias` custaram. |
| R-VINC-29 | **Idempotência com payload.** `access_grants.request_id` é `UNIQUE`; a RPC compara o payload guardado (`student_id`, `action`, `months`) e, sendo igual, devolve o resultado da primeira chamada sem reexecutar. Payload diferente com o mesmo `request_id` é rejeitado. O `request_id` é gerado **uma vez, na origem** — gerá-lo no ponto de uso transforma a proteção do servidor em decoração. |
| R-VINC-30 | `access_grants` é o **histórico**: uma linha por liberação e por bloqueio, com quem fez, quantos meses e a vigência resultante. Responde "desde quando este aluno tem acesso", que é a lacuna nº 2 de `lib/api/contract.ts`. Referencia `profiles` com `on delete restrict`, como `quiz_sessions`: liberação órfã é dado que nenhuma tela explica. |
| R-VINC-31 | `access_grants` tem `select` para `authenticated`, com policy `student_id = auth.uid() or teacher_id = auth.uid()`, e **zero** `insert`, `update` e `delete`. Por isso, e só por isso, ela não leva FK composta: a defesa 3 do `CLAUDE.md` existe para linha montada por quem escreve, e aqui ninguém fora da RPC escreve. Amarrar `(student_id, teacher_id)` a `profiles` seria ainda pior — quebraria no dia em que o aluno trocar de professor, apagando o histórico de quem o liberou antes. |

### Turmas

| Id | Regra |
|---|---|
| R-MATR-01 | Criar, renomear e apagar turma é **escrita direta** do professor, com RLS — está na linha de planejamento da tabela de fronteira do `CLAUDE.md`, ao lado de `study_plans`. As policies `classes_insert`, `classes_update` e `classes_delete` já existem e não mudam. |
| R-MATR-02 | O `grant` de `classes` passa a ser **por coluna**: `grant update (name, description)`. Hoje é `grant update` inteiro, com `teacher_id` dentro — o `WITH CHECK` da policy impede a transferência, mas a defesa 2 do `CLAUDE.md` diz que a RLS decide qual linha e nunca qual coluna. Restringir um grant que a interface não usa é compatível com o bundle que já está no ar. |
| R-MATR-03 | **Um aluno está em uma turma.** Índice único `class_students_one_per_student_uidx` sobre `(student_id)`. Não precisa ser parcial nem por professor: um aluno tem um professor só (`R-VINC-10`), e `class_students_insert` exige `is_teacher_of(student_id)`, então todas as turmas de um aluno são do mesmo professor por construção. |
| R-MATR-04 | Mudar um aluno de turma é **um `UPDATE`**, não apagar e inserir: policy `class_students_update` espelhando a de insert (`is_teacher()`, `teacher_id = auth.uid()`, `is_teacher_of(student_id)`) e `grant update (class_id)` — as colunas de contexto `student_id` e `teacher_id` ficam fora. Em dois comandos o aluno fica fora de turma nenhuma no meio do caminho, e o índice de `R-MATR-03` transforma a corrida em erro. A FK composta `class_students_class_fk` continua garantindo que a turma de destino é de quem está escrevendo. |
| R-MATR-05 | **Apagar turma com aluno dentro é recusado**, pelo gatilho `app_private.protect_class_with_students`, `before delete on classes`. Não por FK `restrict`: o `on delete cascade` de `class_students` precisa continuar valendo quando a conta do professor for removida em cascata a partir de `auth.users`, e um `restrict` no meio faria essa remoção falhar. O gatilho leva a mesma exceção de manutenção dos outros três — quem age sai de `auth.jwt() ->> 'role'`, e sem JWT é manutenção. |
| R-MATR-06 | Desmatricular **apaga a linha**. `class_students` já tem `delete` concedido, e matrícula em turma não é histórico: o que não pode sumir — planejamento, metas, ledger, `access_grants` — não tem `delete` para `authenticated` em lugar nenhum. |
| R-MATR-07 | `StudentCard` ganha `classId`, e `applyFilter` passa a aplicar `filter.classId`. Hoje o campo é declarado no contrato e ignorado em silêncio, e filtrar por turma devolve a lista inteira. O recorte fica na **query string** (`?turma=`), como `?busca=`, `?situacao=` e `?plano=` de `R-TURMA-07`; valor inválido é ignorado e a lista volta inteira, como `R-TURMA-10`. |
| R-MATR-08 | Matricular exige o **vínculo vigente**, e quem impõe é `is_teacher_of(student_id)` no `WITH CHECK` de `class_students_insert`. A ordem entre vincular e matricular não pode inverter, e é o banco que a impõe — não a tela. |

### Regras removidas

Ids não são renumerados. Estes descreviam um schema que não existe mais:

| Id | Removida em | Motivo |
|---|---|---|
| R-VINC-01 | 18/09/2026 | A lista de espera deixou de ser fila de candidatos navegável. `R-VINC-21` a substitui pela busca por e-mail exato. |
| R-VINC-02 | 18/09/2026 | A policy `waitlist_teacher_read` nunca existiu com esse nome; quem fez o papel foi `waitlist_select`, na `20260914190000`, e `R-VINC-23` a fecha. |
| R-VINC-03 | 18/09/2026 | `student_has_teacher()` não foi portada e não é mais necessária: o vínculo é uma coluna de `profiles`, não uma tabela com RLS própria. |
| R-VINC-04 | 18/09/2026 | Substituída por `R-VINC-24`: sem lista, "não aparecer na fila" deixou de ser o mecanismo. |
| R-VINC-06 | 18/09/2026 | A exposição que esta suposição registrava foi resolvida por `R-VINC-23`. A suposição que resta é outra, e está em `R-VINC-25`. |
| R-VINC-19 | 18/09/2026 | Reativar com vigência vencida virou estado inexprimível por `R-VINC-17`. |

---

## Fluxo

```
aluno se cadastra ──► auth.users ──► gatilho ──► profiles
                                    (student, pending, teacher_id NULL)
                                                        │
                                          o aluno cai em /aluno/lista-espera
                                                        ▼
                                        waitlist (teacher_id NULL) — opcional

   professor abre /professor
        │
        ├─ digita o e-mail INTEIRO do aluno que está na frente dele
        │        └─ find_student_by_email  ──► no máximo uma pessoa
        │                 ├─ has_teacher = true  ──► "já tem professor", sem dizer quem
        │                 └─ is_mine = true      ──► "já é seu aluno"
        │
        ├─ [Assumir] ──► link_student(student_id)
        │                     ├─ é professor? alvo é aluno?
        │                     ├─ UPDATE profiles SET teacher_id = auth.uid()
        │                     │        WHERE id = ? AND teacher_id IS NULL
        │                     │        └─ row_count = 0 ──► "já tem professor"
        │                     └─ UPDATE waitlist SET teacher_id = auth.uid()
        │                              WHERE student_id = ? AND teacher_id IS NULL
        ▼
   o aluno aparece em "Meus alunos", com "Aguardando liberação"
        │
        ├─ [Liberar N meses] ──► set_student_access(id, 'grant', N, request_id)
        │        ├─ request_id já visto? ──► devolve o resultado guardado
        │        ├─ INSERT access_grants  (UNIQUE em request_id)
        │        └─ UPDATE profiles: status 'active',
        │                 expira em greatest(now(), expira_atual) + N meses
        │
        ├─ [Bloquear] ──► set_student_access(id, 'suspend', null, request_id)
        │                 └─ status 'suspended', a data fica como está
        │
        └─ [Colocar na turma] ──► INSERT class_students   (escrita direta, RLS)
                 └─ WITH CHECK is_teacher_of(student_id) ──► exige o vínculo
```

**Duas ordenações não podem inverter, e nas duas quem impõe é o banco:**

1. **vincular antes de liberar** — `set_student_access` recusa alvo que não seja
   aluno de quem chama;
2. **vincular antes de matricular** — `class_students_insert` exige
   `is_teacher_of(student_id)` no `WITH CHECK` (`R-MATR-08`).

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor` — ganha a busca por e-mail e o filtro `?turma=`; `/professor/turmas` — **nova**; `/professor/alunos/:studentId` — ganha liberar, bloquear e escolher a turma |
| Componentes | `FindStudentForm` e `AccessForm` em `components/teacher/`; a tela de turmas usa `Card`, `PageHeader`, `Empty` e `Field` de `packages/ui/src/primitives` |
| Contrato | `TeacherStudentsApi` ganha `findStudentByEmail` e `linkStudent`; `grantAccess` e `revokeAccess` **deixam de lançar**; `StudentCard` ganha `classId`; `TeacherClassesApi` é **nova** — `listClasses`, `createClass`, `renameClass`, `deleteClass`, `enrollStudent`, `moveStudent`, `unenrollStudent` |
| Adaptadores | `lib/api/supabase/teacher-students.ts` e um `teacher-classes.ts` novo, compostos em `index.ts`; `lib/api/fixtures.ts` cobre os mesmos; as regras de formulário em `lib/api/validation.ts`, chamadas pelos dois |
| RPCs | **duas mutantes** — `link_student(uuid)` e `set_student_access(uuid, access_grant_action, integer, uuid)` — mais **uma de leitura**, `find_student_by_email(text)` |
| Migration | **uma.** Enum `access_grant_action`; tabela `access_grants` com policy, grant de `select` e nada mais; as três funções com `search_path` vazio, `revoke` e `execute` nominal; `protect_waitlist_identity` com a exceção de `R-VINC-26`; `waitlist_select` fechada (`R-VINC-23`); gatilho `protect_class_with_students`; índice `class_students_one_per_student_uidx`; policy `class_students_update` e `grant update (class_id)`; `grant update (name, description)` em `classes` |
| Banco | `profiles` (escrita só por RPC), `waitlist` (policy fechada, gatilho ajustado), `access_grants` (nova), `classes` e `class_students` (grants e policy ajustados) |
| Testes | `supabase/tests/01_grants.sql`, `02_rls.sql`, `04_profiles.sql`, `05_waitlist.sql`, `07_schema.sql`; `apps/e2e/tests/teacher.spec.ts` |

**Por que o vínculo e o acesso viram RPC e a turma não.** As três colunas de
`profiles` que esta spec escreve estão na linha "ninguém escreve" da tabela de
fronteira, e estão lá porque decidem o que cada pessoa enxerga e por quanto
tempo. `classes` e `class_students` estão na linha de planejamento, com as três
defesas já montadas desde a migration inicial — `WITH CHECK` amarrando a linha a
quem escreve, `is_teacher_of` conferindo pelo ALUNO, e a FK composta
`(class_id, teacher_id)` conferindo a turma. Criar RPC ali não acrescentaria
garantia nenhuma e acrescentaria superfície.

**O escopo estourou o portão do fluxo, e foi decisão de produto.** São duas
features numa spec: vínculo com acesso, e turmas. O portão pede duas specs; o
pedido de 18/09/2026 foi entregar a escola funcionando de uma vez. O que segura o
tamanho é que turmas **não acrescenta migration nem RPC** — o banco já está
pronto, e o custo é contrato e tela.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Buscar o e-mail inteiro de um aluno sem professor devolve uma pessoa, com o nome; buscar um prefixo ou um pedaço não devolve nada | F-VINC-01 |
| CA-02 | Assumir cria o vínculo, reivindica a linha da lista de espera e o aluno passa a aparecer em "Meus alunos" com "Aguardando liberação" | F-VINC-02 |
| CA-03 | Buscar o e-mail de um aluno de outro professor devolve a pessoa com `has_teacher`, o botão recusa, e a tela **não** diz de quem ele é | F-VINC-03 |
| CA-04 | Assumir duas vezes seguidas — duplo clique — devolve o mesmo vínculo, sem segunda escrita e sem erro na tela | F-VINC-04 |
| CA-05 | Liberar 3 meses põe `active` com vencimento em hoje+3 meses, e o aluno passa a abrir as telas de estudo | F-VINC-05 |
| CA-06 | Liberar 3 meses para quem ainda tem 20 dias soma: o vencimento vai para hoje+3 meses+20 dias, e nasce uma linha em `access_grants` | F-VINC-06 |
| CA-07 | Liberar duas vezes com o **mesmo** `request_id` grava uma linha só e devolve o mesmo vencimento; com o mesmo `request_id` e meses diferentes, é rejeitado | F-VINC-07 |
| CA-08 | Bloquear muda o badge, **preserva** `access_expires_at`, e o aluno volta a ser mandado para a lista de espera | F-VINC-08 |
| CA-09 | `link_student` recusa quem não é professor, e recusa alvo cujo `role` não seja `student` | `supabase/tests/04_profiles.sql` |
| CA-10 | O vínculo criado é sempre com quem chamou: `link_student` não tem parâmetro de `teacher_id` | `supabase/tests/04_profiles.sql` |
| CA-11 | `teacher_id`, `access_status` e `access_expires_at` continuam fora do `GRANT UPDATE` de `profiles`, e um `UPDATE` direto neles levanta `42501` | `supabase/tests/01_grants.sql` |
| CA-12 | Nenhuma das três funções tem `execute` para `public`; as três têm `search_path` vazio | `supabase/tests/07_schema.sql` |
| CA-13 | Um professor **não** enxerga mais inscrição de lista de espera sem professor: `select` em `waitlist` devolve zero linhas alheias | `supabase/tests/05_waitlist.sql` |
| CA-14 | A RPC consegue gravar `waitlist.teacher_id` de nulo para o id de quem chama, e `protect_waitlist_identity` continua recusando qualquer outra alteração de vínculo ou e-mail | `supabase/tests/05_waitlist.sql` |
| CA-15 | `access_grants` não aceita `insert`, `update` nem `delete` de `authenticated`, e um aluno não lê a linha de outro | `supabase/tests/01_grants.sql` e `02_rls.sql` |
| CA-16 | A `check` de `access_grants` recusa `months` fora de 1, 3, 6 e 12, e recusa `months` preenchido na ação `suspend` | `supabase/tests/07_schema.sql` |
| CA-17 | Criar turma, renomear e matricular funcionam pela tela; a lista de alunos mostra a turma na linha | F-MATR-01 |
| CA-18 | Matricular um aluno que já está em outra turma **move**, e o índice único impede as duas matrículas coexistirem | F-MATR-02 e `supabase/tests/07_schema.sql` |
| CA-19 | Apagar turma com aluno dentro é recusado, com a mensagem traduzida na tela; esvaziar e apagar funciona | F-MATR-03 |
| CA-20 | `?turma=` filtra a lista; valor inválido devolve a lista inteira sem erro de console | F-MATR-04 |
| CA-21 | Um professor não matricula aluno de outro, nem em turma de outro — as duas recusas são do banco | F-MATR-05 e `supabase/tests/02_rls.sql` |
| CA-22 | `teacher_id` e `student_id` continuam fora do `grant update` de `class_students`, e `classes` passa a conceder `update` só de `name` e `description` | `supabase/tests/01_grants.sql` |

---

## Fora de escopo

- **Promover alguém a professor.** Continua sem caminho no produto, e de
  propósito: `create_profile_for_new_user` ignora o `role` do metadado porque
  `raw_user_meta_data` é escrito pelo cliente, e quem mandasse
  `{"role":"teacher"}` nasceria professor. Resolver exige decidir se nasce um
  papel `admin` em `user_role` — migration de enum, mais policies, mais a
  pergunta de quem concede o primeiro. É spec própria. Até lá, promover é o
  `update` que a `20260914190000` documenta no comentário, feito por quem tem a
  chave do banco, e é o que `scripts/turma-de-teste.sql` faz.
- **Desvincular e transferir aluno.** Levanta o que acontece com o planejamento
  ativo, as metas e o histórico de baterias — e `quiz_sessions` referencia
  `profiles` com `on delete restrict` de propósito. É regra de produto, não
  detalhe de implementação, e bloquear o acesso já resolve o caso urgente. O
  vínculo, por ora, só nasce.
- **Registro de passagem por turma.** Desmatricular apaga (`R-MATR-06`). Guardar
  "em que turma o aluno estava no primeiro semestre" exige coluna de saída e tirar
  o `delete` do grant, e hoje ninguém pergunta isso.
- **O aluno ver a turma dele.** A policy `class_students_select` já deixaria, mas
  mostrar abre a pergunta de o que mais ele vê dos colegas, e a resposta hoje
  precisa ser "nada".
- **Turma com período ou ano próprio.** `classes` tem `name` e `description`, e
  "Fiscal 2027" cabe no nome. Coluna de período só se paga junto com arquivar
  turma, que também está fora.
- **Aluno escolher o professor, ou entrar por código de turma.** A busca é do
  professor. Um código que o aluno digita no cadastro resolveria a exposição da
  fila de outro jeito e encaixaria numa escola física — mas exige tabela de
  código, expiração e mexer em `waitlist_insert_student`. É a alternativa
  descartada em 18/09/2026, e volta como spec própria se a busca por e-mail
  incomodar.
- **Cupom de acesso.** `coupons` existe com RLS ligada, zero policy e zero grant.
  Se voltar, é RPC que valida o código e chama o mesmo caminho de
  `set_student_access` — nunca escrita do aluno. É a spec 30, e continua `fixme`.
- **Aviso ao aluno quando o acesso é liberado.** Nem e-mail nem notificação: ele
  vê ao entrar. Notificação é superfície nova, com fila e reenvio.
- **`access_status = 'expired'` escrito por rotina.** `R-VINC-28` diz por quê.
- **Mais de um professor sobre o mesmo aluno.** É o cenário B da análise de
  17/09/2026: `profiles.teacher_id` é um uuid e está denormalizado com FK composta
  em nove tabelas. Se voltar, o caminho de menor dano é uma tabela de leitura
  delegada entrando nas policies de `select`, sem tocar na defesa 3.
