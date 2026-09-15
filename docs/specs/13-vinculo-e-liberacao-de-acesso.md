# 13 — Vínculo do aluno e liberação de acesso

**Situação:** implementada · **Comparativo:** §12 item 2 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §6 · **Fluxos e2e:** F-VINC (em `fixme`)

> **Atualizada em 14/09/2026.** O vínculo virou `profiles.teacher_id`, e o acesso,
> `profiles.access_status` com `access_expires_at` — os três FORA do `GRANT
> UPDATE`. `link_student` não foi portada: vincular e liberar **precisam nascer
> como RPC**, e os fluxos de `F-VINC` estão `fixme` até lá.

---

## Problema

Quem se cadastra some.

O cadastro público cria `auth.users` e `profiles`, o aluno cai em
`/aluno/lista-espera` e se inscreve. E acaba ali. Não nasce
`student_teacher_links`, não nasce `subscriptions`, e **não existe caminho para
um professor mudar isso** — nem tela, nem RPC, nem grant. `getMyStudents` parte
de `student_teacher_links`, então o aluno recém-cadastrado é invisível para todo
mundo e fica na lista de espera para sempre. Está registrado como GAP-01 e como
a primeira linha do §7 de [`fluxos-e2e.md`](../fluxos-e2e.md).

**E o problema é mais fundo do que "falta a tela".** Duas policies fecham o
círculo:

```
profiles_read    using (id = auth.uid() or public.is_teacher_of(id))
waitlist_own     using (student_id = auth.uid() or public.is_teacher_of(student_id))
```

`is_teacher_of` exige vínculo vigente. Ou seja: **o professor só enxerga quem já
é aluno dele.** Não existe consulta que devolva a pessoa a vincular. Uma tela
construída sobre a leitura atual mostraria uma lista vazia, sempre. É por isso
que este item exige policy nova, e é o único da fila que exige.

A versão anterior **também não tinha essa tela**, e vale registrar como ela
escapava: todo aluno novo era amarrado no cadastro a um UUID de professor fixo
no bundle — `PROFESSOR_PADRAO_ID`, em `index.js:2045` — e a tela de estado vazio
do professor instruía, em português, a "criar um usuário aluno e inserir o
perfil dele com `professor_id` igual ao seu UID", à mão, no banco
(`professor.js:4124`). Um produto com um professor só funciona assim. Com dois,
não.

O que a v96 tinha e funcionava era o segundo passo: **liberar acesso por 3
meses** e **bloquear acesso** (`liberarAlunoAcesso`, `bloquearAlunoAcesso`),
com um badge que dizia "Acesso ativo · até DD/MM/AAAA". Isso ela fazia por
`UPDATE` direto do navegador em `profiles.status_acesso` — a mesma porta por
onde o aluno, no cadastro com cupom, liberava o próprio acesso
(`aluno.js:3955`). Aqui a liberação já mora onde deve, em `subscriptions`, com
RLS e grant por coluna prontos: falta só quem a acione.

---

## Regras

### Descobrir quem vincular

| Id | Regra |
|---|---|
| R-VINC-01 | A **lista de espera é a fila de candidatos**. Quem se inscreve fica visível para os professores até ser reivindicado; depois disso, só para quem reivindicou. É o que dá ao professor uma lista não vazia por onde começar. |
| R-VINC-02 | A policy nova é de **leitura apenas** e aditiva: `waitlist_teacher_read`, `for select to authenticated`, com `using (public.is_teacher() and (teacher_id = auth.uid() or (teacher_id is null and not public.student_has_teacher(student_id))))`. A `waitlist_own` continua como está, e as duas são combinadas com `or`. |
| R-VINC-03 | `public.student_has_teacher(uuid)` é predicado `security definer` — como `is_teacher_of` e `can_view_context`. Referenciar `student_teacher_links` direto na policy aplicaria a RLS daquela tabela dentro da expressão e abre risco de recursão entre policies; é a mesma razão pela qual os predicados existentes são `security definer`. |
| R-VINC-04 | Um candidato **já vinculado a outro professor não aparece** para ninguém além do dono. É o `not student_has_teacher(...)` da `R-VINC-02`, e é o que impede a fila de virar um diretório de alunos alheios. |
| R-VINC-05 | O professor **não ganha escrita** na lista de espera. O grant de `waitlist` continua como está e o `with check (student_id = auth.uid())` da `waitlist_own` continua recusando qualquer gravação que não seja do próprio dono. Quem escreve `teacher_id` é a RPC, `security definer`. |
| R-VINC-06 | **Suposição registrada:** dados de contato de quem ainda não foi reivindicado — nome, e-mail, WhatsApp, concurso em foco — ficam visíveis a **qualquer professor**. É o desenho de fila compartilhada, e é o que o produto precisa hoje. Num cenário com professores que não se conhecem, isto vira um diretório e a policy precisa mudar para uma fila por convite. **Merece revisão humana.** |

### Vincular

| Id | Regra |
|---|---|
| R-VINC-07 | Vincular é **RPC**, `link_student(p_student_id uuid, p_request_id uuid)`. `student_teacher_links` não tem grant para papel nenhum, e não é para ganhar: o vínculo decide quem enxerga o quê em quinze policies. |
| R-VINC-08 | Só quem tem papel de professor vincula — `public.is_teacher()`, que já cobre `teacher` e `admin`. O vínculo é sempre **com quem chama**: `teacher_id` é `auth.uid()`, nunca um parâmetro. Não existe vincular aluno ao professor alheio. |
| R-VINC-09 | O alvo precisa ser um perfil com `role = 'student'`. Vincular um professor a outro é recusado. A `check` `link_not_self` já impede o caso de vincular a si mesmo, e a RPC recusa antes, com mensagem. |
| R-VINC-10 | **Um professor vigente por aluno**, garantido pelo índice parcial `active_link_uidx` (`student_id` onde `ended_at is null`). A RPC verifica antes e recusa com mensagem legível; o índice é a rede embaixo, e é ele que segura duas requisições simultâneas. |
| R-VINC-11 | A RPC **reivindica a linha da lista de espera** no mesmo comando, gravando `waitlist.teacher_id = auth.uid()`. É o que tira o candidato da fila compartilhada. Aluno sem linha na lista de espera é vinculável do mesmo jeito — o `update` simplesmente não acha linha. |
| R-VINC-12 | Idempotência **com payload**: `request_id` + `reserve_operation`, com hash de `student_id`. Um duplo clique devolve o vínculo já criado em vez de esbarrar no índice. |
| R-VINC-13 | As duas funções declaram `set search_path = ''`, levam `revoke execute ... from public` e só então recebem `execute` nominal para `authenticated`. **`student_has_teacher` precisa desse grant**: a expressão de uma policy é avaliada com o privilégio de quem consulta, não do dono da tabela, e sem ele todo `select` em `waitlist` morre com `permission denied for function`. É por isso que `is_teacher`, `is_teacher_of`, `is_admin` e `can_view_context` já estão na lista de grants da migration inicial. O `security definer` resolve outra coisa: a leitura de `student_teacher_links` lá dentro. *Corrigido em 30/08/2026, ao implementar — a redação anterior dizia que a função ficaria sem grant nenhum.* |
| R-VINC-14 | Vincular **não libera acesso**. São dois passos, como na v96: o vínculo diz de quem o aluno é; a assinatura diz se ele entra. Um aluno vinculado e sem assinatura continua vendo a lista de espera, o que é o comportamento de `R-ACC-01`. |

### Liberar e suspender

| Id | Regra |
|---|---|
| R-VINC-15 | Liberar acesso é **escrita direta em `subscriptions`**, sem RPC. É planejamento, não execução: não tem máquina de estados, não tem ledger, e as três defesas já estão montadas — `subscriptions_teacher_insert` e `subscriptions_teacher_update` com `is_teacher_of(student_id)` no `using` e no `with check`, e `grant update (status, plan, validity, coupon_id)` deixando `student_id` de fora. |
| R-VINC-16 | A vigência padrão é de **3 meses** a partir de hoje, o valor da v96 (`liberarAlunoAcesso`, chamado com o literal `3`). O professor escolhe entre 1, 3, 6 e 12 meses. |
| R-VINC-17 | **Uma assinatura ativa por aluno**, garantida pelo índice parcial `active_subscription_uidx`. Liberar quem já tem assinatura ativa **estende a linha existente** — `update` da `validity` — em vez de inserir outra. Inserir seria violação de índice, e criar um histórico de linhas ativas paralelas é o estado que o índice existe para tornar inexprimível. |
| R-VINC-18 | Suspender é `update` de `status` para `suspended` na assinatura ativa. A `check` `active_subscription_has_validity` só exige vigência para `active`, então a vigência é **preservada** ao suspender — é o que permite reativar sem redigitar a data, e é o que torna auditável até quando o acesso valia. |
| R-VINC-19 | Reativar uma assinatura suspensa cuja vigência já passou **exige nova vigência**. Sem isso o aluno voltaria `active` com validade vencida, que é a divergência entre status e data explorada pelo BUG-07. |
| R-VINC-20 | Nada é apagado. Suspender é mudança de `status`; `delete` não é concedido em `subscriptions`, como em nenhuma tabela. |

---

## Fluxo

```
aluno se cadastra ──► profiles (role student) ──► /aluno/lista-espera
                                                        │
                                          preenche WhatsApp, área, concurso
                                                        ▼
                                                    waitlist
                                              (teacher_id NULL)
                                                        │
   professor abre /professor ◄───────────────────────────┘
        │
        ├─ "Candidatos" lê waitlist pela policy nova:
        │     is_teacher() AND teacher_id IS NULL AND aluno sem professor
        │
        ├─ [Vincular] ──► link_student(student_id, request_id)
        │                     ├─ reserve_operation ──► replay devolve o vínculo
        │                     ├─ é professor? alvo é aluno? já tem professor?
        │                     ├─ INSERT student_teacher_links (teacher_id = auth.uid())
        │                     └─ UPDATE waitlist SET teacher_id = auth.uid()
        │                            └─ o candidato SAI da fila compartilhada
        ▼
   o aluno aparece em "Meus alunos", com badge "Aguardando liberação"
        │
        ├─ [Liberar por N meses] ──► subscriptions, escrita direta com RLS
        │        ├─ tem ativa?  → UPDATE validity (estende)
        │        └─ não tem     → INSERT status='active'
        ▼
   o aluno entra nas telas de estudo — requireStudentAccess passa a deixar

        [Suspender] ──► UPDATE status='suspended', vigência preservada
```

A ordem entre vincular e liberar não pode inverter, e não por elegância:
`subscriptions_teacher_insert` exige `is_teacher_of(student_id)`. Sem o vínculo,
a liberação é recusada pelo `WITH CHECK` — o banco impõe a sequência.

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor` — ganha a seção "Candidatos"; `/professor/alunos/:studentId` ganha as ações de acesso |
| Componentes | `LinkStudentForm` e `AccessForm`, em `components/teacher/` |
| Actions | `linkStudent`, `grantAccess`, `suspendAccess`, em `lib/data/teacher-actions.ts` |
| Leitura | `getWaitlistCandidates` e a assinatura vigente do aluno, em `lib/data/teacher.ts` |
| RPCs | **uma nova:** `link_student(uuid, uuid)`. Liberar e suspender não têm RPC |
| Migration | **uma:** `student_has_teacher`, `link_student`, a policy `waitlist_teacher_read`, e os grants |
| Banco | `student_teacher_links` (escrita só por RPC), `waitlist` (policy de leitura nova), `subscriptions` (escrita direta, já concedida) |
| Protocolo | **nada muda** |
| Testes | `supabase/tests/01_grants.sql` e `02_rls.sql`, `apps/e2e/tests/teacher.spec.ts` |

**Por que a liberação não vira RPC.** Seria coerência aparente — "toda escrita
por RPC" — contra o que o `CLAUDE.md` de fato divide. `subscriptions` está na
linha de planejamento da tabela de fronteira, ao lado de `study_plans` e
`goals`, e já tem as três defesas montadas desde a migration inicial. Criar uma
RPC ali não acrescentaria garantia nenhuma e acrescentaria uma superfície.

**Por que o vínculo vira.** `student_teacher_links` não está naquela linha: está
na de "ninguém escreve, só RPC ou `service_role`", junto de `operations` e
`audit_log`. Não é arbitrário — o vínculo é o predicado de `is_teacher_of`, e
portanto a entrada de quinze policies. Conceder `insert` nele seria conceder a
capacidade de escolher o que se enxerga.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Um aluno recém-cadastrado, com linha na lista de espera e sem professor, aparece em "Candidatos" para um professor qualquer | F-VINC-01 |
| CA-02 | Vincular cria o vínculo, tira o candidato da fila e o aluno passa a aparecer em "Meus alunos" com "Aguardando liberação" | F-VINC-02 |
| CA-03 | Depois de vinculado, o candidato **não aparece** na fila de outro professor | F-VINC-03 |
| CA-04 | Liberar por 3 meses cria a assinatura com vigência de hoje a hoje+3 meses, e o aluno passa a abrir as telas de estudo | F-VINC-04 |
| CA-05 | Liberar de novo quem já tem assinatura ativa **estende a mesma linha**, sem criar uma segunda | F-VINC-05 |
| CA-06 | Suspender muda o badge, preserva a vigência, e o aluno volta a ser mandado para a lista de espera | F-VINC-06 |
| CA-07 | Vincular duas vezes seguidas — duplo clique — devolve o mesmo vínculo, sem segunda linha e sem erro na tela | F-VINC-07 |
| CA-08 | `link_student` recusa quem não é professor, e recusa alvo que não tenha `role = 'student'` | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-09 | `link_student` recusa aluno que já tem professor vigente, e o índice `active_link_uidx` continua impedindo o estado | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-10 | O vínculo criado é sempre com quem chamou: não há parâmetro de `teacher_id`, e a linha nasce com `auth.uid()` | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-11 | O professor continua **sem** `insert`, `update` e `delete` diretos em `student_teacher_links` | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-12 | A policy nova é só de leitura: o professor não escreve na lista de espera de ninguém | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-13 | Um professor não vê, na fila, candidato já reivindicado por outro | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-14 | Liberar acesso de aluno **sem vínculo** é recusado pelo `WITH CHECK` de `subscriptions` | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-15 | `student_id` continua fora do `grant update` de `subscriptions`, e `delete` continua não concedido | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |
| CA-16 | Nenhuma das duas funções tem `execute` para `public`, e `student_has_teacher` tem para `authenticated` — sem esse grant a policy de `waitlist` quebraria | **sem cobertura**: `link_student` e `student_teacher_links` não foram portados |

---

## Fora de escopo

- **Encerrar o vínculo.** `student_teacher_links.ended_at` existe e nada o
  escreve. A v96 também não tinha. Encerrar levanta uma pergunta que esta spec
  não responde — quem continua vendo o histórico, e o que acontece com o
  planejamento ativo —, e a resposta é regra de produto, não detalhe de
  implementação. Enquanto não for decidida, o vínculo só nasce.
- **Transferir aluno entre professores.** Consequência da anterior.
- **Cupom de acesso.** A v96 deixava o aluno liberar o próprio acesso digitando
  `CUPOM3MESES` no cadastro, por upsert direto em `profiles`. A tabela `coupons`
  existe aqui e continua sem leitor. Se voltar, é RPC que valida o código e cria
  a assinatura — nunca escrita do aluno. Está na fila do inventário, na faixa de
  conforto.
- **Convite por e-mail.** O professor não convida ninguém; quem se cadastra
  aparece. Convite exige envio de e-mail e um token de uso único, que é outra
  spec inteira.
- **Aluno escolher o professor.** A lista de espera tem `teacher_id` e o aluno
  não o preenche. Quem reivindica é o professor.
- **Vigência com hora.** `validity` é `daterange`. Acesso que vence no meio do
  dia não é necessidade de nenhum fluxo conhecido.
- **Aviso ao aluno quando o acesso é liberado.** Nem e-mail nem notificação: ele
  vê ao entrar. Notificação é superfície nova, com fila e reenvio.
