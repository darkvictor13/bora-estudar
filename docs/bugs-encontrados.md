# Bugs encontrados na varredura de QA

Levantamento feito percorrendo a aplicação inteira com navegador de verdade
contra o Supabase local: 249 verificações sobre autenticação, telas do aluno,
telas do professor, a volta completa da bateria, a extensão e o isolamento
entre dois pares professor/aluno.

Os fluxos exercitados estão em [`fluxos-e2e.md`](fluxos-e2e.md).

Nenhuma requisição foi feita ao tecconcursos.com.br: a extensão foi testada
contra uma página sintética servida localmente, com o domínio do TEC
interceptado.

> **Registro histórico.** Esta varredura foi feita quando o site rodava em
> Next.js, então o diagnóstico de alguns itens cita `revalidatePath`, Server
> Action e Route Handler — coisas que não existem mais. O defeito e a correção
> continuam válidos; o mecanismo mudou de nome. Ver a seção "O site é uma SPA"
> em [`arquitetura.md`](arquitetura.md).

## Placar

| Área | Verificações | Resultado |
|---|---|---|
| Isolamento entre alunos e professores (RLS, grants, RPCs) | 34 | tudo passa |
| Extensão (protocolo, motor, ordenações críticas) | 29 | tudo passa, 1 achado de ciclo de vida |
| Autenticação e roteamento | 38 | 3 bugs |
| Telas do aluno | 73 | 3 bugs |
| Telas do professor | 43 | 2 bugs, 2 lacunas |
| Recuperação de senha, ponta a ponta | 11 | 1 bug (dois defeitos somados) |
| Extras (HTML, i18n, dados) | 18 | 3 bugs |

Depois das correções: **249 verificações, 0 falhas**.

`npm run check`, `npm run db:test` e `npm run test:e2e` passavam antes e
continuam passando. **Nenhum dos bugs abaixo era detectável por essas suítes** —
todos vivem na camada de interface e de fluxo, que nenhuma delas alcança.

---

## Corrigidos

### BUG-01 · CRÍTICO · Admin não consegue entrar: loop de redirecionamento

O admin faz login e recebe uma página em branco.

`homeForRole("admin")` devolve `/professor`; o layout de `/professor` chama
`requireRole("teacher")`, que não bate e redireciona para
`homeForRole("admin")` — de volta para `/professor`. Loop infinito, resposta
vazia.

**Reproduzir** entrar com `admin@boraestudar.local`.

**Correção** `requireRole("teacher")` passa a aceitar admin, espelhando o
`is_teacher()` do banco, que já é `role in ('teacher','admin')`. Como a RLS usa
`can_view_context`, que não reconhece admin, ele vê a área do professor vazia —
o que é a decisão pendente registrada em `arquitetura.md`, e não mais um
travamento. `requireRole` também ganhou uma trava contra redirecionar alguém
para a rota que acabou de recusá-lo.

---

### BUG-02 · CRÍTICO · Recuperação de senha não funciona de ponta a ponta

Quem esquece a senha nunca consegue trocá-la. Duas falhas somadas:

1. **O link do e-mail não aponta para a tela de nova senha.** A action pede
   `redirectTo: http://localhost:3000/redefinir-senha`, mas o
   `supabase/config.toml` tem `site_url = "http://127.0.0.1:3000"` e
   `additional_redirect_urls = ["https://127.0.0.1:3000"]`. `localhost` não
   está na lista, o GoTrue descarta o destino pedido e cai no `site_url`. O
   e-mail chega com `redirect_to=http://127.0.0.1:3000`.
2. **Ninguém troca o código por sessão.** Mesmo forçando o destino certo, o
   GoTrue redireciona para `…/redefinir-senha?code=<pkce>` e não existia rota
   que chamasse `exchangeCodeForSession`. A página só chamava
   `getSessionContext()`, que devolve `null`, e mostrava "Este link expirou ou
   já foi usado" — sempre.

**Reproduzir** pedir a recuperação, ler o e-mail em `http://127.0.0.1:54324` e
seguir o link: cai em `/entrar`, sem sessão.

**Correção** `site_url` passa a `http://localhost:3000` e
`additional_redirect_urls` cobre `localhost` e `127.0.0.1` com curinga; nova
rota `GET /confirmar` (`app/confirmar/route.ts`) troca o `code` por sessão e
encaminha para o destino, tratando também o `token_hash` do fluxo antigo; a
action passa a apontar o `redirectTo` para essa rota.

---

### BUG-03 · ALTO · O resultado da bateria trava em "Gravando…" e a hash nunca é limpa

O fluxo mais caro do produto. O aluno volta do TEC, o resultado **é gravado no
banco**, e a tela fica para sempre em "Gravando o resultado da bateria…", com o
payload ainda pendurado na URL.

`QuizResultHandler` combina duas proteções que se anulam:

```ts
if (handled.current) return;   // não reenviar
handled.current = true;
let cancelled = false;
(async () => { … if (cancelled) return; setStatus(…) })();
return () => { cancelled = true; };   // limpeza do efeito
```

Em desenvolvimento o React monta duas vezes: **efeito → limpeza → efeito**. A
limpeza marca `cancelled = true` na única execução em andamento; a segunda
execução vê `handled.current === true` e sai sem fazer nada. Ninguém mais
escreve o estado, e o `history.replaceState` que limpa a hash está depois do
`if (cancelled) return`.

**Reproduzir** `npm run dev`, iniciar e finalizar uma bateria. Verificado
também que desligando `reactStrictMode` a mensagem aparece na hora — o que
confirma o mecanismo.

**Correção** a trava de reenvio (`handled`) fica; o `cancelled` deixa de
suprimir a escrita do estado — o trabalho já foi feito, e engolir o resultado é
pior do que um `setState` em componente desmontado, que o React 19 não penaliza.

---

### BUG-04 · ALTO · Registrar tempo e cancelar bateria não dão retorno nenhum

O aluno registra o tempo, a meta conclui no banco, e a tela não diz nada. Idem
para "Cancelar bateria".

As actions chamam `revalidatePath(ROUTES.student.overview)`, que re-renderiza a
própria página no mesmo retorno. O cartão da sessão aberta some — é o efeito
desejado — e leva junto o `RegisterTimeForm`/`CancelSessionForm`, donos do
`useActionState`. A mensagem de sucesso não tem mais onde ser renderizada.

**Reproduzir** registrar o tempo de uma bateria: nenhum alerta aparece.
Confirmado removendo o `revalidatePath`, com o que a mensagem passa a aparecer.

**Correção** POST-redirect-GET: as duas actions redirecionam para
`/aluno?feito=tempo` / `?feito=cancelada`, e a página — que sobrevive à
revalidação — renderiza a confirmação.

---

### BUG-05 · ALTO · "Reenviar o mesmo lote não duplica a semana" — mas duplica

A tela "Gerar metas" promete isso literalmente. Submeter o mesmo formulário
duas vezes cria as metas duas vezes: no teste o planejamento saltou de 9 para
13 metas.

`apply_study_plan_batch` faz o replay pela chave do lote, mas `generateWeek`
chama `randomUUID()` a cada submissão. Cada reenvio chega como um lote inédito.
É exatamente a armadilha do `CLAUDE.md`: *"request_id gerado no ponto de uso
transforma a proteção do servidor em decoração"*.

**Reproduzir** gerar a semana 2 e submeter o mesmo formulário de novo.

**Correção** o `batch_id` passa a ser derivado do próprio conteúdo do lote
(plano, semana, modo, dias, blocos, minutos, teoria), por sha-256 formatado
como UUID. O mesmo lote produz sempre o mesmo id — a promessa da tela vira
verdade por construção, e uma seleção diferente continua sendo um lote novo.

---

### BUG-06 · MÉDIO · A mensagem de erro promete um formato que o campo recusa

`registerQuizTime` responde *"Informe o tempo em minutos ou no formato
hora:minuto. Ex.: 80 ou 1:20"*. Só que o campo é `type="number"` — o navegador
nem deixa digitar `:` — e o servidor faz `Number(minutes)`, que vira `NaN` para
`"1:20"`. Existe um `parseDuration()` pronto e testado em
`lib/domain/goals.ts`, com teste cobrindo exatamente `"1:20" → 80`, que
**nenhum código de produção chama**.

**Correção** a action passa a usar `parseDuration`, e o campo vira
`type="text"` com `inputMode="numeric"`. A dica do campo passa a dizer o que
ele aceita de verdade.

---

### BUG-07 · MÉDIO · Assinatura antiga esconde a ativa na tela do professor

Um aluno que renovou aparece como "Expirado" para o professor, embora entre no
sistema normalmente.

`getMyStudents` lê todas as linhas de `subscriptions` e monta um `Map` por
`student_id` sem filtrar. Quem sobra é a última linha que o PostgREST devolveu,
não a vigente. O `getSessionContext` do aluno filtra por `status='active'` — daí
a divergência entre o que o aluno vive e o que o professor vê.

**Reproduzir** inserir uma `subscription` `expired` para um aluno que já tem uma
`active` e abrir "Meus alunos".

**Correção** escolher a assinatura ativa; sem nenhuma ativa, a mais recente.

---

### BUG-08 · MÉDIO · A extensão nunca descarta a bateria já enviada

Depois de entregar o resultado ao site, `storage.local` continua com a sessão
inteira, inclusive o `requestId`. Ao reabrir o TEC sem um payload novo,
`boot()` restaura a bateria antiga, redesenha o painel com "3 de 3
respondidas" e volta a oferecer **"Finalizar e enviar"**. Um clique reenvia o
mesmo `requestId` sobre uma sessão que já está em outro estado e joga o aluno
de volta ao site com o resultado de uma bateria encerrada. Só o botão
"Descartar" do popup limpava.

**Correção** `boot()` passa a reconhecer a bateria já finalizada e mostra um
painel próprio — "Bateria já finalizada e enviada" — com **Reenviar ao site**
(deliberado, mesmo `requestId`) e **Descartar**. A sessão continua no disco: ela
ainda é a única cópia do resultado se a gravação tiver falhado, e apagá-la
sozinha reintroduziria a perda silenciosa que a ordenação nº 1 existe para
evitar.

---

### BUG-09 · BAIXO · Mensagem crua do Postgres chega à tela do aluno

Ao tentar abrir uma segunda bateria o aluno lê, literalmente, *"ja existe uma
bateria aberta neste planejamento"* — texto de `raise exception`, sem acento e
em minúsculas. Todas as actions de bateria devolviam `error.message` direto
para a interface.

**Correção** um tradutor, no mesmo espírito do `translateAuthError` que já
existia para o GoTrue.

---

### BUG-10 · BAIXO · E-mails de autenticação em inglês

O único texto que o aluno recebe fora do site chega como "Reset your password",
com corpo em inglês, contrariando a regra de idioma do `CLAUDE.md`.

**Correção** templates em português declarados no `supabase/config.toml`, em
`supabase/templates/`.

---

### BUG-11 · MÉDIO · Erro de login apaga o e-mail que a pessoa digitou

Senha errada no login e a pessoa redigita **e-mail e senha** a cada tentativa.
Mesma coisa no cadastro: qualquer erro de validação limpa nome, e-mail e senha.

O React 19 reseta o `<form action={…}>` assim que a action termina, como uma
submissão nativa faria. Com campos não-controlados isso apaga tudo. Em "Meus
dados" o efeito passava despercebido porque os campos têm `defaultValue` vindo
do servidor, e o `revalidatePath` já havia atualizado esse valor.

**Reproduzir** `/entrar`, e-mail válido + senha errada: o campo de e-mail volta
vazio.

**Correção** o `AuthForm` guarda o que foi enviado e repõe os campos quando a
resposta é erro. Senha e confirmação ficam de fora — segredo digitado errado se
digita de novo.

---

### BUG-12 · BAIXO · Item de menu "desabilitado" continua navegando

Para o aluno sem acesso liberado, `Sidebar.tsx` marca os itens de estudo com
`aria-disabled` e `tabIndex={-1}`, mas mantém o `<Link>`: o clique navega, o
servidor redireciona de volta e a pessoa dá a volta inteira para não sair do
lugar.

**Correção** item desabilitado vira `<span>`, sem destino.

---

### BUG-13 · BAIXO · Campo de e-mail sem rótulo associado

Em "Meus dados" o campo de e-mail usa um `<span class="field__label">` solto:
não há `<label for>`, e leitor de tela não anuncia o campo.

**Correção** `<label htmlFor>` de verdade.

---

### BUG-14 · ALTO · `PUBLIC` mantinha `EXECUTE` em toda função de `public`

> Origem diferente do resto deste arquivo: não saiu da varredura de navegador,
> e sim de `supabase db advisors --linked`, rodado depois do primeiro
> `db push` — 47 `WARN`, nenhum `ERROR`. Os achados abaixo existiam
> **igualmente no banco local**; não são artefato de staging. Por isso não
> entram no placar das 249 verificações.

A migration inicial fez `revoke all on all functions ... from anon,
authenticated` e, na linha 1886, um revoke específico com um comentário
afirmando o controle:

```sql
-- reserve_operation é infraestrutura interna das RPCs, não API pública.
revoke all on function public.reserve_operation(uuid, text, uuid, text) from anon, authenticated;
```

Nenhum dos dois alcançava o privilégio real. O default do Postgres concede
`EXECUTE` a `PUBLIC`, e `PUBLIC` não é `anon` nem `authenticated`: é o grantee
vazio que os dois herdam. O `acl` das 16 funções ficava `=X/postgres`, e
`has_function_privilege('authenticated', ...)` devolvia `true` para todas —
inclusive para a que o comentário chamava de interna.

Isso importa porque `operations` tem RLS de `select` apenas e **nenhum**
`grant insert`: `reserve_operation` é o único caminho de escrita naquela
tabela. Aberta, ela permite a um aluno autenticado gravar linhas arbitrárias,
com `target_id` de sua escolha, e queimar um `request_id` com hash divergente —
fazendo o `finish_quiz_session` legítimo daquele id ser recusado com `23505`.
Não é vazamento nem escalada para o dado de outro aluno: a RLS das demais
tabelas continua de pé. É um controle documentado que não existia, mais escrita
sem limite numa tabela de infraestrutura.

As quatro funções `tg_*` também estavam expostas, com risco prático nulo:
função de gatilho recusa chamada fora de contexto de trigger.

**Reproduzir** com a publishable key, que é o que qualquer visitante tem:

```
POST /rest/v1/rpc/reserve_operation  →  400
23502: null value in column "actor_id" of relation "operations"
```

A chamada **passou** pelo grant e entrou no corpo da função; o que a barrou foi
o `not null` de `operations.actor_id` contra o `auth.uid()` nulo do `anon` — a
regra do `CLAUDE.md` sobre invariante em constraint pagando por si mesma. Para
um usuário **autenticado** o `auth.uid()` não é nulo, e nada barra.

**Segundo defeito, mesma família.** `tg_set_updated_at` e
`tg_block_ledger_mutation` não declaravam `set search_path`; as outras 14
declaram `= ''`. Uma delas é o gatilho que sustenta o ledger append-only, que é
a fonte única de desempenho do sistema.

**Correção** `20260829183000_harden_function_grants.sql`, migration nova — o
schema inicial está congelado desde o push de staging.
`revoke execute on all functions in schema public from public`, seguido do
grant nominal às 11 funções da API pública; as cinco restantes
(`reserve_operation` e as quatro `tg_*`) ficam sem grant para papel nenhum.
Gatilho não precisa: o Postgres confere `EXECUTE` na criação do trigger, e a
execução corre por conta do dono da tabela. As duas funções sem `search_path`
foram recriadas com `= ''` — nenhuma referencia objeto de schema, e `now()` é
built-in resolvida por `pg_catalog`.

**Verificado** depois de `db reset`: `has_function_privilege` devolve `false`
para `anon` e `authenticated` em `reserve_operation`; exatamente 11 funções
continuam executáveis por `authenticated`; nenhuma função de `public` fica sem
`search_path`; o gatilho do ledger segue recusando `UPDATE` e `DELETE` com
`0A000`; `updated_at` segue avançando. `npm run db:test` passa inteiro,
`npm run check` passa, e `npm run db:types` não produz diff.

**O que ficou de fora, de propósito.** A terceira família do relatório —
`auth_rls_initplan`, ~30 avisos — é desempenho, não segurança: policies que
reavaliam `auth.uid()` uma vez por linha. Hoje são 31 usos, nenhum envolvido em
subselect. A correção é mecânica (`(select auth.uid())`), mas toca 31 policies
e merece migration própria, com medição antes e depois. Registrado aqui para
não se perder.

---

### BUG-15 · CRÍTICO · Cadastro cria a conta e nenhum perfil: "Entramos, mas seu perfil não foi encontrado."

> Origem diferente do resto deste arquivo, como a do BUG-14: não saiu de
> varredura nenhuma — saiu de **usar staging**. Alguém criou uma conta,
> confirmou o e-mail, tentou entrar e leu essa frase. Por isso também não entra
> no placar das 249 verificações.

O cadastro criava o usuário no GoTrue e parava aí. `currentSession()` lê
`profiles` pelo `auth.uid()`, não achava linha nenhuma, e `signIn` caía no
`fail("unknown", "Entramos, mas seu perfil não foi encontrado.")` — com a conta
funcionando no GoTrue, a senha certa, e o produto inteiro fechado. Da tela não
havia como perceber a causa: a mensagem descreve o sintoma, e o sintoma é
indistinguível de um erro de leitura.

**Não era regressão, era uma pendência conhecida cobrando.**
`bora_criar_perfil_novo_aluno()` rodava em `auth.users` no banco de origem e não
foi portada para `20260914150000`. Estava registrada em três lugares — o de-para
("o primeiro item a resolver antes de qualquer tela de cadastro funcionar"), o
plano da v2, e o `test.fixme` de `F-AUTH-08` — e o que a manteve aberta foi a
decisão de produto que ela embutia: a qual professor um aluno sem metadado é
anexado.

O que segurou o diagnóstico é que **nada quebrava nas suítes**: as fixtures do
e2e e as de invariante inseriam o perfil à mão para não derrubar o resto, e o
seed local fazia o mesmo. Só o `fixme` apontava a falta, e um `fixme` não falha.

**A decisão que faltava.** O gatilho de origem anexava quem se cadastrava sem
metadado ao professor de menor `created_at`. A regra não foi copiada: ela
dependia da ordem de criação das contas e entregava os dados de um aluno a quem
por acaso tivesse entrado primeiro. **O perfil nasce sem professor**, e o
vínculo passa a ser ato de alguém.

**Correção** `20260914190000_profile_on_signup.sql`, migration nova.
`app_private.create_profile_for_new_user()`, `after insert on auth.users`,
`security definer` — quem insere em `auth.users` é o `supabase_auth_admin`, que
não tem nem deve ter grant em `public.profiles`. O gatilho **não lê `role` do
metadado**: `raw_user_meta_data` é escrito pelo cliente na chamada de cadastro,
e quem mandasse `{"role":"teacher"}` nasceria professor. Toda conta nasce aluno,
`pending` e sem professor.

Três consequências que vieram junto, porque sem elas a fila de entrada não
fecha:

- `waitlist.teacher_id` deixou de ser `not null`, e `waitlist_insert_student`
  troca `p.teacher_id = waitlist.teacher_id` por `is not distinct from`: com o
  `=`, o par nulo/nulo dá `null`, e WITH CHECK que não é `true` barra;
- `waitlist_select` passou a mostrar a inscrição sem dono a quem é professor —
  senão ela não apareceria para ninguém além de quem a escreveu. Enquanto
  `user_role` não tiver 'admin', isso significa **todos** os professores;
- `protect_waitlist_identity` ganhou a exceção de manutenção que os outros
  gatilhos de proteção já tinham. Sem ela, `teacher_id` nulo nunca viraria um
  id — nem por RPC `security definer`.

A migration também **backfilla** quem já estava preso: todo `auth.users` sem
perfil ganha um, aluno e pendente. Inclusive quem pediu `{"role":"teacher"}` no
metadado, pelo mesmo motivo que o gatilho não lê o campo — promover é um
`update` deliberado, e está escrito no comentário da migration.

**Verificado** com `npm run db:test` (oito suítes, incluindo os casos novos de
`04_profiles` e os cinco de `05_waitlist`), `npm run check`, `npm run db:types`
com o diff commitado, e `npm run e2e`: **172 verdes, 7 `fixme`** — `F-AUTH-08`
saiu do `fixme` e passa. As fixtures do e2e e as de invariante deixaram de
inserir perfil à mão: o mesmo gatilho que o cadastro público percorre passou a
sustentar a suíte inteira.

---

## Registrados, não corrigidos

Não são defeitos: são telas que ainda não existem. Corrigir cada um seria
construir funcionalidade nova, fora do escopo de uma varredura de QA. Ficam
listados aqui e em `fluxos-e2e.md` §7.

### GAP-01 · ALTO · Quem se cadastra nunca chega a nenhum professor

> **Atualizado em 14/09/2026.** A primeira metade deste gap virou o BUG-15 e foi
> corrigida: o perfil passou a nascer com a conta, e a inscrição sem professor
> passou a ser aceita e a aparecer para quem é professor. A metade que sobra é a
> de sempre — **não existe tela, nem RPC, para assumir o candidato e liberar o
> acesso.** O texto abaixo foi reescrito contra o schema de 14/09;
> `student_teacher_links` e `subscriptions` não existem mais.

O cadastro público cria `auth.users`, `profiles` (pelo gatilho) e a inscrição na
lista de espera. `profiles.teacher_id` e `profiles.access_status` ficam como
nasceram — nulo e `pending` — e não há por onde mudá-los: as duas colunas estão
**fora do `GRANT UPDATE`** de `profiles`, de propósito, porque nem o dono nem o
professor podem carimbar o próprio acesso. O aluno fica na lista de espera para
sempre.

O que falta não é permissão: é **uma RPC `security definer`** que assuma o
candidato (`waitlist.teacher_id` e `profiles.teacher_id` de uma vez) e libere o
acesso, mais a tela do professor que a chame. É o mesmo item que aparece como
"a liberação de acesso" no de-para e como `F-VINC` na lista de `fixme` do e2e.
A espec está em [`specs/13-vinculo-e-liberacao-de-acesso.md`](specs/13-vinculo-e-liberacao-de-acesso.md).

### GAP-02 · MÉDIO · RPCs implementadas que nenhuma tela chama

`activate_study_plan`, `void_quiz_session` e `record_reinforcement` estão
prontas e testadas em `supabase/tests/`, sem ponto de entrada na interface.
**Atualização de 06/10/2026:** `activate_study_plan` tinha saído com o schema de
14/09 e foi recriada (QA-03, QA-12); a tela de planejamentos já a chama. As
telas de Revisões recomendam o reforço mas não têm como executá-lo, e o content
script só conduz a fase `main`.

### GAP-03 · BAIXO · Professor não edita os próprios dados

Não há "Meus dados" na sidebar do professor, e `updateProfile` exige
`requireRole("student")`.

### GAP-04 · INFO · Cadastro repetido não confirma nada

Com a confirmação de e-mail desligada, cadastrar um e-mail já existente devolve
"Já existe uma conta com este e-mail". Com ela ligada, o GoTrue responde sucesso
genérico para não revelar quais e-mails existem, e a pessoa iria para a lista de
espera de uma conta que não é dela.

**Decidido em 06/10/2026 (D-14, QA-29): a frase FICA.** Não há produção, e staging
também roda sem confirmação; com ela desligada o GoTrue responde 422 a QUALQUER
chamador, então esconder a frase na tela não tira a informação de quem chama a API
direto — só ligar a confirmação corrige, e isso espera staging entregar e-mail
([`plano-email-staging.md`](plano-email-staging.md)). Mitigação: `sign_in_sign_ups = 30`
por 5 min por IP, e os links "Entrar" e "Esqueci minha senha" na própria mensagem.
Revisitar quando a confirmação for ligada. Spec 01, R-AUTH-18.

---

## Varredura de 06/10/2026

Levantamento do QA de 06/10/2026, em [`relatorio-qa-2026-10-06.md`](relatorio-qa-2026-10-06.md). A
numeração é `QA-NN`, para não colidir com os `BUG-NN` acima; o plano de correção, PR a PR, está em
[`plano-qa/README.md`](plano-qa/README.md).

### QA-01 · CRÍTICO · Regenerar a semana apaga o estudo registrado

O aluno registra 40 min numa meta de teoria, e ela passa a `in_progress`. O professor abre
`/professor/metas`, escolhe a substituição "Segura", vê a prévia ("Preservadas 0") e gera: a meta some, e
o `goal_entries` do aluno vai de 1 linha para 0.

`isPreserved` só olhava `completed`, e `goal_entries_goal_fk` era `on delete cascade`: o registro ia junto, sem erro.

**Reproduzir** registrar estudo numa meta pendente e gerar a semana pelo professor
(F-PROF-05, `03_goals` caso 20).

**Correção** `generate_week` apaga só o que `app_private.goal_is_preserved` não segura — a concluída e a com
registro ou bateria —, a FK passou a `no action` e a prévia conta pelo mesmo critério
(`week_replacement_preview`). **O modo "Replanejar semana inteira" foi removido:** com a meta concluída
preservada ele apagaria exatamente o mesmo que o padrão, e uma tela com dois caminhos iguais promete uma
diferença que não existe. Spec 04, R-GEN-12 a R-GEN-14.

---

### QA-05 · ALTO · Uma falha no meio de gerar a semana apaga a semana

Com o `POST /rest/v1/goals` caindo, gerar levava a semana de 5 metas para 0: o `DELETE` e o `INSERT`
eram duas requisições, sem transação. A retentativa também não era segura — o `request_id` nascia a cada
clique, e repetir o pedido depois de a resposta se perder chegava como operação nova, duplicando a
semana quando o aluno tinha registrado numa meta recém-criada. E a posição das metas novas somava a
QUANTIDADE de preservadas, e não a maior posição, e batia em `goals_one_per_slot_idx`.

**Reproduzir** derrubar `rpc/generate_week` com `route.abort()` e, noutro teste, deixar o servidor gravar e
perder a resposta (F-PROF-10, `03_goals` casos 18 e 22).

**Correção** `generate_week` é uma transação, idempotente pela PK `goal_batches.id`, e a tela gera o
`request_id` uma vez por prévia. As posições novas entram depois da maior que sobrou no dia.
Spec 04, R-GEN-15, R-GEN-16 e R-GEN-19.

---

### QA-17 · BAIXO · Semana fora de intervalo é aceita ou vira erro cru

`Number(...) || 1` trocava 0 por 1 em silêncio; -3 e 99999 montavam a prévia e gravavam; 1,5 chegava ao
banco e voltava `22P02`. `goals.week_number` e `goals.planned_minutes` não tinham CHECK.

**Reproduzir** abrir `/professor/metas?semana=0`, `-3`, `1.5` ou `99999` e pedir a prévia (F-PROF-11,
`07_schema` caso 14).

**Correção** `checkWeekNumber` no contrato, chamado pelas duas implementações, recusa fora de 1 a 520 com a
frase "1 a 520"; o banco tem `goals_week_number_check` e `goals_planned_minutes_check`.
Spec 04, R-GEN-17.

---

### QA-02 · ALTO · `/confirmar?next=` redireciona para fora do site

`AuthCallback` aceitava qualquer `next` que começasse com `/` e não com `//`, e o destino é o mesmo com
código válido ou sem: bastava um link, sem login. `/\evil.example/x` e `/\\evil.example` o React Router
lê como URL absoluta (`^[\\/]{2}`) e abre com `location.assign`; `/<TAB>/evil.example/x` o navegador
resolve como `//evil.example/x`, o `pushState` lança e o router cai no mesmo `location.assign`.

Há uma quarta forma, que é a correção ingênua: `new URL("/.//evil.example/x", base).pathname` é
`//evil.example/x`, mesma origem para o `URL` e URL absoluta para o router.

**Reproduzir** abrir `/confirmar?next=` com `encodeURIComponent` de cada payload (F-AUTH-14). Antes da
correção os quatro ficavam fora de `/redefinir-senha`: três saíam para `evil.example`, e `/.//evil.example/x`
parava em `/evil.example/x`, dentro do site mas num destino que ninguém escolheu.

**Correção** `safeInternalPath` (`lib/routes.ts`) resolve contra uma origem fictícia e recusa outra origem, o
`pathname` normalizado que começa com duas barras e as telas públicas; recusado, vale o destino padrão de
quem chama. O login (QA-25, PR 6) usa a mesma função. Spec 01, R-AUTH-16 e CA-16.

---

### QA-03 · ALTO · Um aluno termina com dois planejamentos ativos

Duas abas ativando planos diferentes intercalavam as quatro escritas (arquivar, ativar, arquivar, ativar) e o
aluno terminava com dois ativos. Pela API, `PATCH /rest/v1/study_plans?id=eq.<outro>` com
`{"status":"active"}` devolvia 200. O `CLAUDE.md`, as specs 03 e 14 e o cabeçalho de `teacher-plans.ts`
diziam que havia um índice único parcial; ele não existia (só `study_plans_name_per_student_uidx`), e a RPC
`activate_study_plan` também tinha saído com o schema de 14/09. O banco local tinha 6 alunos com dois ativos.

**Reproduzir** duas chamadas simultâneas a `activate_study_plan` para o mesmo aluno, com a primeira
segurando a trava (F-GPLAN-01; `07_schema` casos 17 e 18; `02_rls` caso 19). Sem a trava, o teste falha.

**Correção** migration `20261006221607_one_active_study_plan`: o índice
`study_plans_one_active_per_student_uidx` (a limpeza deixa ativo o mais recente e **pausa** os outros) e a RPC
naturalmente idempotente, que trava os planejamentos do aluno e arquiva o anterior. Spec 14, R-GPLAN-02 a
R-GPLAN-04 e CA-09; spec 03, R-PLAN-01 e R-PLAN-05.

---

### QA-12 · MÉDIO · Ativar com a rede caindo deixa o aluno sem planejamento

`activatePlan` arquivava os ativos do aluno e só então ativava o novo, em duas requisições. Com a rede caindo
entre as duas, o anterior ficava arquivado e o novo não ficava ativo: o aluno via "Nenhum planejamento ativo".

**Reproduzir** derrubar `rpc/activate_study_plan` com `route.abort()`, e noutro teste deixar o servidor
gravar e perder a resposta (F-GPLAN-01).

**Correção** ativar é uma chamada só à RPC. Ativar o que já está ativo passou a ser sucesso, porque é a
retentativa depois de uma resposta perdida. Spec 14, R-GPLAN-02 e CA-08.

---

### QA-06 · MÉDIO · O erro de escrita chega cru, e cada queda de rede vira relato

`translateDbError` só conhecia `42501`, `P0001`, `23505`, `23503` e `PGRST116`. O resto caía no `default`
com `error.message` e código `unknown`: a queda de rede lia "TypeError: Failed to fetch" na tela (o texto muda
por navegador), o corpo de gateway que não era JSON ia inteiro para o diálogo, as violações de CHECK saíam em
inglês, e todas elas viravam um evento no Sentry. É da mesma classe do BUG-09, dado como corrigido, e a
correção dele cobria só as baterias.

**Reproduzir** `route.abort("internetdisconnected")` no `POST /rest/v1/goal_entries` e gravar um registro de
estudo (F-META-03), ou na criação de turma (F-OBS-01).

**Correção** `error-translation.ts` (puro): `code === ""` é `offline`, com a frase do login — a rede se
reconhece pelo código, nunca pelo texto; corpo sem `code` é `unknown` com frase fixa e continua relatado;
`23514`, `22P02`, `22003` e `23502` viram `validation` genérico. O preço, dito em voz alta: `validation` não é
relatado, então uma CHECK que chega ao banco por falta de regra em `validation.ts` só é pega pelo teste do PR
que escreve a regra. `session.ts` passou a lançar `unauthenticated` (e não `not_found`) para sessão vencida.
`notebooks.ts` e `teacher-theory.ts` deixaram de ignorar o `error` do select que decide entre UPDATE e INSERT.

---

### N-01 · ALTO · `once()` guardava para sempre a promessa REJEITADA

Quando a operação LANÇAVA (`requireSession`, `throwDb`, `currentSession` com a rede caída), o `.then` que
limpava a chave só rodava no sucesso: a rejeição ficava no mapa, toda retentativa com o mesmo `requestId`
devolvia a mesma rejeição sem reexecutar, saía uma `unhandledrejection` por falha, e `RecordStudyDialog` e
`ExtraStudyDialog` ficavam presos em "Registrando…"/"Salvando…" porque o `await onSubmit` rejeitava antes do
`setPending(false)`. As escritas fora de `once` que chamam helper que lança tinham o mesmo defeito, sem a
memória.

**Reproduzir** derrubar só `/auth/v1/user` uma vez e lançar um estudo extra (F-EXTRA-01). Medido: com a
memória antiga o alerta nunca aparece e o botão não volta.

**Correção** `createOnce` (`request-memory.ts`, puro) converte o throw em `failure` — a promessa nunca rejeita
e a chave é liberada —, e `settle` faz o mesmo para a escrita fora de `once`: `joinWaitlist`,
`saveReviewSpacing`, `setClassTheoryCatalog`, `enrollStudent`, `clearPendingGoals`, as quatro de simulado e
`saveAccount`. O throw que escapa é relatado por `recoverThrown`, com a causa, se for `unknown`.

*(Atualização do PR 5a: `recordExtraStudy` deixou de chamar `requireSession`, então o F-EXTRA-01 passou a derrubar
a leitura do `starts_on` do plano — o postgrest-js repete o GET que falha por rede, e o teste derruba enquanto a
rede "cai". O throw de dentro do `once()` já não tem caminho nessa tela, e quem o segura é
`request-memory.test.ts`.)*

---

### QA-04 · ALTO · Registrar estudo duplica na retentativa (fechado, e o caminho direto também)

`recordStudy` eram dois pedidos (INSERT em `goal_entries`, UPDATE `pending` → `in_progress`) e `recordExtraStudy`
três (meta, registro e um DELETE de compensação). A única defesa era `once()`, que esquece a chave quando a
tentativa falha: o servidor gravava, a resposta se perdia, e a nova tentativa gravava de novo. `goal_entries` não
tinha `request_id`.

Na teoria era pior: `recordInitialQuestions` e `recordReviewQuestions` LIAM um contador, somavam e gravavam. A
retentativa somava duas vezes e duplicava o registro; duas abas perdiam uma das somas; a queda entre a soma e o
INSERT deixava progresso sem ledger; e concluir a aula e criar as revisões eram duas escritas com o erro
ignorado. A questão de revisão não ia para ledger nenhum (era só `questions_answered`, mantido à mão), e a
retentativa do envio que FECHOU a revisão voltava "Esta revisão já foi concluída". A chave ainda nascia no clique
(`newRequestId()` dentro do envio), e o formulário de revisão do modal fechava antes do resultado.

**Reproduzir** deixar o servidor gravar e derrubar a resposta, uma vez, em `rpc/record_goal_entry` e em
`rpc/record_extra_study` (F-META-03 e F-EXTRA-01; `03_goals` casos 32 a 38) e, na teoria, em
`rpc/record_initial_questions` e `rpc/record_review_questions` (F-TEO-08 e F-TEO-09; `06_theory` casos 16 a 26).

**Correção** migration `20261006224256_student_study_entries`: `goal_entries.request_id`, índice único
`goal_entries_request_uidx`, e as RPCs `record_goal_entry` e `record_extra_study`, uma transação cada, que travam
a meta (ou o plano) ANTES de buscar a chave e comparam as colunas do registro. Mesma chave com outra carga é
`23505`, e a tela diz "Este estudo já foi registrado com outros valores". Spec 12, R-CONC-21 e R-CONC-22; spec
19, R-EXTRA-25.

**Teoria (PR 5b)** migration `20261006231152_record_theory_questions`: `record_initial_questions` insere em
`goal_entries` com `request_id` e a aula (`goal_entries.theory_lesson_id`, FK composta), e SÓ SE inseriu agora soma
o progresso (`x = x + n`, um upsert que serializa duas abas), fecha a aula e cria as revisões, numa transação.
`record_review_questions` grava no ledger novo `theory_review_entries` (`request_id` UNIQUE) e soma; o replay vem
antes de "já concluída". O mínimo é o da regra da AULA (`initial_questions_required`), e o TypeScript passou a ler
pela aula também. `checkQuestionRecord` (1 a 500 questões, acertos de 0 ao total) vale para as duas implementações,
e a chave de retentativa nasce quando o formulário abre (`TheoryDialog`, `Reviews`) e só muda depois do sucesso.
Spec 32, R-TEO-21 a R-TEO-24. A spec 32, R-TEO-06, exigia "teoria lida E mínimo", e o código (e a spec 36) fechavam
só pelas questões: o texto foi corrigido.

**Caminho direto fechado em 06/10/2026 (PR 5c)** migration `20261006233436_close_direct_execution_writes`:
`goal_entries` perde INSERT e UPDATE para `authenticated`, professor incluído (D-19; corrigir é apagar e registrar
de novo); `goals_insert` fica só com o ramo do professor, então o aluno não cria meta `extra` nem `reinforcement`
(estudo extra é `record_extra_study`) e nenhuma meta nasce com resultado preenchido; `theory_progress` perde, no
INSERT e no UPDATE, `initial_questions_done`, `initial_questions_complete(_at)` e `lesson_done(_at)`, e fica com a
leitura (`current_page`, `theory_done`, `theory_done_at`); `theory_reviews` perde INSERT e UPDATE, e a policy
`for all` dá lugar a `theory_reviews_delete`. Antes disso quem chamasse a API sem passar pela RPC voltava a ter
todos os defeitos acima: o aluno reescrevia `questions` de um registro que já tinha somado, baixava o mínimo da
própria revisão para 1 ou a marcava concluída. As quatro RPCs são `security definer` e não dependem dos grants
revogados. Spec 12, R-CONC-27; spec 19, R-EXTRA-06; spec 32, R-TEO-20. Testes: `01_grants` 10 e 36 a 45, `02_rls`
03, `03_goals` 02, 02b, 02c, 03, 21 e 31, `06_theory` 02 e `07_schema` 22 a 24. Nenhum dado foi alterado e nenhuma
constraint nasceu. **Esta migration só pode ser aplicada depois de o 5b estar publicado em staging:** uma aba aberta
com o bundle anterior passa a receber `42501` ao registrar estudo, e recarregar resolve.

---

### QA-07 · ALTO · Aluno com o acesso vencido conclui, pula e apaga (e N-05)

`goals_update` não chamava `has_active_access()`, então concluir, reabrir e pular — todos UPDATE direto — passavam
com o acesso vencido. `goals_delete` e `goal_entries_delete` também não chamavam, e o aluno vencido apagava
registro de estudo e meta extra (N-05).

**Reproduzir** suspender o acesso depois de abrir a semana e clicar na caixa da meta (F-META-08; `03_goals` casos
29 e 30).

**Correção** `has_active_access()` no `WITH CHECK` de `goals_update` e no `USING` de `goals_delete` e de
`goal_entries_delete`. O UPDATE barrado levanta `42501`; o DELETE barrado afeta zero linhas, e `removeStudyEntry`
passou a contar com `count: "exact"` — sem isso a tela fingia sucesso. Spec 12, R-CONC-24.

---

### QA-10 · MÉDIO · O registro de estudo aceita qualquer número

`goal_entries` não tinha CHECK, e a tela convertia com `Number(x) || 0`, que deixa passar -30, 1.5 e 1e3. A
validação morava no adaptador, com outra frase na fixture. No banco local do QA havia 8 registros fora da regra
(-30, 1000 e 14400 minutos, questões negativas).

**Reproduzir** gravar -30, 241 e 1.5 minutos (F-META-03; `07_schema` caso 19).

**Correção** `checkStudyEntry` em `validation.ts` (0 a 240 minutos, 0 a 500 questões, acertos até o total, não
tudo zero), chamada pelas duas implementações, e as CHECKs `goal_entries_minutes_check`, `_questions_check`,
`_correct_answers_check` e `_not_empty_check`. `parseCount` entrega o texto inválido como `NaN` à validação. A
migration apagou os registros fora da regra. Spec 12, R-CONC-23.

---

### QA-11 · MÉDIO · A data do estudo extra não tem limite

`weekNumberOf` põe qualquer data anterior ao início na semana 1, e não havia teto: um extra para 2031 criava a
meta da "semana 222".

**Reproduzir** lançar um extra com a data antes do `starts_on` e com amanhã (F-EXTRA-01).

**Correção** `checkExtraStudyDate` (de `starts_on` até hoje, no fuso do aparelho) e, no banco, `record_extra_study`
recusa fora de `[starts_on, hoje em UTC+14]` com `23514`. O teto do servidor é "já é hoje em algum lugar do
planeta": ele não conhece o fuso do aparelho. Spec 19, R-EXTRA-20 e R-EXTRA-22.

---

### QA-14 · BAIXO · "Semana inteira" sugere a segunda-feira, não hoje

Com `?dia=todos` o botão "Estudo extra" sugeria `weekOf.startsOn`, e o caminho do cronômetro
(`?estudoExtra=cronometro`) fazia o mesmo.

**Reproduzir** abrir `/aluno?dia=todos` no meio da semana e clicar em "Estudo extra" (F-EXTRA-01).

**Correção** `defaultExtraDate`, em `lib/domain/week.ts`: o dia escolhido, se está na semana e não passa de hoje;
senão hoje; na semana passada, o primeiro dia dela. O `?dia=` do cronômetro só vale se for uma data da semana
vista. Spec 19, R-EXTRA-26.

---

### QA-27 · BAIXO · O diálogo de estudo extra escreve durante o render

`ExtraStudyDialog` chamava `pauseStudyTimerForRecord()` no inicializador do `useState`: a função grava no
`localStorage` e dispara o evento da `StudyTimerBar`, e o React acusava "Cannot update a component
(`StudyTimerBar`) while rendering…" em todo abrir do diálogo. O PR 4 já tinha deixado a asserção do F-EXTRA-01
frouxa por causa disso.

**Reproduzir** abrir `/aluno?estudoExtra=cronometro` com o cronômetro correndo (F-EXTRA-01).

**Correção** o inicializador só LÊ; pausar vai para um efeito de montagem (`pauseStudyTimer`, idempotente). Junto,
D-16: Cancelar, o fundo e o Esc retomam o cronômetro (`resumeStudyTimer`), e lançar o consome. `pauseTimer` e
`resumeTimer` são funções puras em `study-timer.ts`. O F-EXTRA-01 passou a exigir `consoleErrors` vazio.
Spec 19, R-EXTRA-27.

---

### QA-28 · MÉDIO · O aluno escreve o resultado da meta

O grant de UPDATE de `goals` inclui `spent_minutes`, `questions_answered` e `correct_answers`, e
`protect_goal_planning_fields` não as congelava: um PATCH pela API gravava `correct_answers = 999` numa meta de
teoria. Ninguém mais escreve essas colunas — o bundle não as lê nem as escreve, e as RPCs de bateria nunca foram
portadas.

**Reproduzir** `update goals set correct_answers = 5` como o aluno, numa meta sem bateria (`03_goals` caso 28).

**Correção** o gatilho recusa as três colunas para quem não é o professor, em meta SEM `notebook_block_id` (a de
bateria continua de `protect_goal_quiz_result`, que dispara depois). A migration zerou as que já estavam
escritas. O teste 08 de `03_goals`, que gravava `spent_minutes` como aluno, foi corrigido. Spec 12, R-CONC-25.

---

### N-02 · MÉDIO · Não cabe um segundo estudo extra no mesmo dia

Todo extra nascia com `day_position = 99`, e `goals_one_per_slot_idx` é único por (plano, semana, dia, posição): o
segundo extra do dia batia em `23505`.

**Reproduzir** lançar dois extras com a data sugerida (F-EXTRA-01; `03_goals` caso 37).

**Correção** `record_extra_study` calcula `max(day_position) + 1` do dia, com o plano travado. Spec 19, R-EXTRA-20.

---

### N-07 · MÉDIO · O extra de ontem conta como estudo de hoje

O registro só tinha `created_at = now()`, e série, sequência, calendário e estatísticas agrupam por ele: a meta ia
para o dia escolhido, e o registro para o dia do lançamento.

**Reproduzir** lançar um extra com a data de ontem e olhar a semana e a série por dia (F-EXTRA-01, F-EST-01;
`12_student_question_comparison` e as duas seguintes).

**Correção** `goal_entries.studied_on` (nulo = o dia local de `created_at`), escrito só por `record_extra_study`,
e `entryDay` (`lib/domain/schedule.ts`) como a única função que calcula o dia de um registro: a sequência da
semana, o calendário, o desempenho do dia, as séries por dia e por mês e o recorte por ano a usam. As três funções
de comparação por ano leem `coalesce(studied_on, dia UTC de created_at)`. A "última atividade" do professor
continua sendo `created_at`: é um instante, mostrado com hora. A migration preencheu `studied_on` dos extras já
lançados por heurística (meta `extra` concluída, título do diálogo, registro até 60 s depois da meta). Spec 19,
R-EXTRA-28; spec 25, nota do topo.


---

### QA-08 · ALTO · O aluno vinculado lê "Ainda sem professor"

`loadAccount` lia `select name from profiles where id = <teacherId>` e descartava o `error`. A policy
`profiles_select` só abre a própria linha e as dos próprios alunos: a consulta voltava `[]`, e a tela caía em
"Ainda sem professor" para quem tinha um. A leitura certa, `public.my_teacher()`, existia com grant e teste, e o
adaptador nunca a chamava; a fixture devolvia "Professor de Exemplo" sempre, inclusive sem vínculo, e foi o que
escondeu o defeito.

**Reproduzir** abrir `/aluno/conta` com um aluno vinculado (F-CONTA-01).

**Correção** `loadAccount` chama `my_teacher()` e lê `data[0]`, a leitura de `plan` passou por `throwDb`, e as duas
rodam em `Promise.all`. A fixture só devolve o nome com `teacherId`. Spec 10, R-CTA-15.

---

### QA-09 · MÉDIO · A barra do aluno não acompanha liberar e bloquear

O layout do aluno é uma rota sem caminho, e o React Router não reexecuta o loader de uma rota que continua casada
quando só o filho muda. Liberado, o aluno seguia com os itens inertes até o F5; suspenso, seguia com os itens
ativos, e cada clique o devolvia à lista de espera sem explicação.

**Reproduzir** liberar pela RPC com o aluno aberto em `/aluno/conta` e navegar pela barra (F-VINC-09).

**Correção** `shouldRevalidate` na rota do layout: `defaultShouldRevalidate || troca de pathname`. Declarar
desliga o padrão inteiro, e o `||` mantém o `revalidate()` de "Salvar" em Meus dados. **Custo, aceito:**
`studentLayoutLoader` também chama `loadThemePreference`, que são um `getUser` e um `select` em `profiles` a mais por
navegação dentro da área do aluno. Spec 02, R-ACC-08; spec 13, R-VINC-32.

---

### QA-20 · MÉDIO · Vigência e datas em formato de máquina

`access_expires_at` é `timestamptz`, mas o contrato o declarava `IsoDate` e a tela o imprimia cru ("Vigência atual
até 2027-01-06T18:37:06.167505+00:00"). "Liberar soma ao que ainda falta" aparecia também para quem já tinha vencido,
quando a RPC conta de `greatest(now(), …)`. `effectiveAccess` comparava o TEXTO do instante com a data de hoje:
no dia do vencimento a tela dizia "Liberado" enquanto `has_active_access()` já recusava a escrita. E a lista e a ficha
do professor repassavam `access_status` cru, então quem tinha vencido aparecia "Liberado" e `expired` não tinha
escritor (R-VINC-28).

**Reproduzir** a ficha de um aluno com `access: "expired"` (F-PROF-03) e a de um recém-liberado (F-VINC-06).

**Correção** `lib/domain/dates.ts` separa data (`formatDate`, fatia) de instante (`formatInstant`, fuso do
aparelho); `accessExpiresAt` é `IsoDateTime`; `effectiveAccess` compara instantes por `hasExpired`, na fronteira do
banco, e a lista e a ficha passam por ele; a ficha tem três textos de vigência. Spec 13, R-VINC-33; spec 10, R-CTA-16.

---

### N-04 · MÉDIO · Datas no fuso errado

A "Última atividade" e o início de cada bateria, na ficha do professor, saíam 3h adiantados (fatiavam o texto UTC); o
vencimento em Meus dados do aluno aparecia no dia seguinte quando caía depois das 21h de Brasília; "Novo
planejamento" sugeria `new Date().toISOString().slice(0, 10)`, o dia seguinte depois das 21h; e `minutesByDay` e
`minutesByMonth` agrupavam por `created_at.slice(…)`, em UTC — este último o PR 5a (N-07) já tinha corrigido, com
`entryDay`.

**Reproduzir** `lib/domain/dates.test.ts`, com `TZ=America/Sao_Paulo` fixado no próprio arquivo.

**Correção** todo formatador avulso (`slice(8, 10)`, `split("-").reverse()`, `toLocaleString`) saiu das telas e
passou por `lib/domain/dates.ts`; `todayLocal` sugere o dia local. Fica só em `dates.ts`.

---

### QA-21 · BAIXO · "Meus dados" do professor com os textos do aluno

`/professor/conta` serve a mesma tela do aluno, que dizia "O que o seu professor vê sobre você", "fale com seu
professor" e mostrava o cartão Acesso com "Ainda sem professor · — · sem prazo".

**Reproduzir** abrir `/professor/conta` (F-CONTA-01).

**Correção** o loader devolve o papel, e para o professor a tela troca o subtítulo ("Como os seus alunos veem você"),
o texto do e-mail ("É o seu login. A troca de e-mail ainda não está disponível.") e não renderiza o cartão Acesso.
Spec 27, R-CONTA-09.

---

### QA-25 · MÉDIO · O login não devolve ao link aberto

`requireSession` mandava para `/entrar` sem destino (e colava `location.hash` em `/entrar#…`, onde ele morria), e
`landAfterAuth` sempre ia para a casa do papel: quem abria `/professor/alunos/<id>` sem sessão entrava e caía na
lista.

**Reproduzir** abrir uma rota protegida anônimo, entrar, e conferir onde se termina (F-AUTH-13).

**Correção** as três guardas recebem o `request`, obrigatório, e redirecionam para `/entrar?next=<destino>`, com o
fragmento dentro do `next` e só na primeira carga; `signIn` repassa o `next` e `landAfterAuth` o filtra por
`safeInternalPath` (QA-02), com a casa do papel real de fallback. Spec 01, R-AUTH-06 e R-AUTH-17.

---

### QA-29 · BAIXO · O cadastro confirma quem já tem conta (decidido: fica)

A frase "Já existe uma conta com este e-mail." diz a quem digita que o e-mail está cadastrado. Com
`enable_confirmations = false` o GoTrue responde 422 `user_already_exists` a QUALQUER chamador: esconder a frase na
tela não tira a informação de quem chama a API direto, e só ligar a confirmação corrige — o que espera staging
entregar e-mail.

**Decisão (D-14)** a frase fica. A tela ganha os links "Entrar" e "Esqueci minha senha" junto da mensagem
(`existing-account`), decididos pelo CÓDIGO (`conflict` no campo `email`), e `sign_in_sign_ups = 30` por 5 min por IP
é a mitigação. Spec 01, R-AUTH-18; GAP-04. O comentário de `signUp` que dizia que o gatilho lê `role` do metadado
era falso desde `20260914190000`: o `role` saiu do `options.data`.

---

### QA-15 · MÉDIO · O teto de texto só existia no navegador

Só o cadastro tinha `maxLength` (120). Meus dados, planejamento e turma não tinham teto nem no navegador, e o banco
aceitava 400 caracteres no nome, 487 no planejamento e 502 na turma. A varredura do catálogo achou **65 colunas**
`text` que `authenticated` gravava sem teto algum — de `profiles.name` a `theory_lessons.pdf_url` — e outras 14 cujo
teto media `char_length(btrim(x))`: `'abc' || repeat(' ', 1000000)` passava num teto de 160. O gatilho de cadastro
copiava o nome do metadado sem cortar, e com a CHECK nova um nome longo mandado pela API derrubaria a conta inteira
("Database error saving new user").

**Reproduzir** a consulta de `07_schema` (a varredura) contra o banco anterior, e `04_profiles` casos 21 e 22
(F-AUTH-08/09, F-CONTA-01, F-GPLAN-06, F-MATR-06).

**Correção** migration `20261007001002`: CHECK de `char_length(<coluna>) <= N` em toda coluna da varredura, as 14 que
mediam `btrim` recriadas com o mesmo nome, e o gatilho corta o nome em 120 (nulo abaixo de 3). O dado existente foi
cortado no teto (a `quote` de marcação, apagada: cortar viola `length(quote) = end - start`). `checkName`,
`checkClass`, `checkPlan` e as irmãs recusam com a frase, e as telas leem `MAX_*` de `lib/api`. Spec 01, R-AUTH-07;
spec 10, R-CTA-03; spec 13, R-MATR-09.

---

### QA-16 · MÉDIO · Turma, deck e planejamento aceitavam nome repetido

`classes` e `personal_flashcard_decks` não tinham índice de nome, e o de `study_plans` diferenciava maiúscula e
espaço ("Área Fiscal" e "área fiscal" conviviam). O `23505` do planejamento chegava como "Este registro já existe.".

**Reproduzir** criar a mesma turma, o mesmo deck e o mesmo planejamento com outra caixa e espaço nas pontas
(F-MATR-06, F-FLASH-06, F-GPLAN-06; `07_schema` casos 32 e 33; `16_personal_flashcards` casos 6 e 7).

**Correção** os três índices ignoram maiúsculas e pontas (`lower(btrim(...))`), e o adaptador troca o `23505` pela
frase própria olhando o NOME do índice (`isUniqueViolation`) — a PK do deck é escolhida pelo cliente, e um replay com o
mesmo `id` não é deck repetido. A migration renomeou as duplicatas existentes com " (2)", " (3)"…, sem fundir. A
fixture passou a recusar com a mesma frase. Spec 13, R-MATR-09; spec 14, R-GPLAN-09; spec 34.

---

### QA-18 · BAIXO · Senha só de espaços

`checkPassword` só media comprimento, e a mesma função serve ao cadastro e à troca de senha: oito espaços eram
aceitos pelo GoTrue local (`password_requirements = ""`).

**Reproduzir** cadastrar com oito espaços e ler "nenhuma conta nasce" (F-AUTH-09, F-AUTH-12).

**Correção** `checkPassword` recusa "A senha não pode ser formada só por espaços."; o login NÃO recusa
(`checkCredentials` não muda), para a conta antiga continuar entrando. A política do GoTrue não muda (D-10): quem chama
a API direto ainda cria a conta, e o contrato é a única barreira. Spec 01, R-AUTH-19.

---

### QA-19 · MÉDIO · WhatsApp sem formato, nascimento no futuro, três regras para um campo

`waitlist_whatsapp_check` pedia 8 a 30 caracteres (`'abcdefgh'` passava), `birth_date` não tinha CHECK, o adaptador só
pedia "não vazio" e a fixture, 10 dígitos com outra frase ("WhatsApp incompleto."). "Área de interesse" vazia chegava
ao banco e voltava `23514` cru.

**Reproduzir** `abcdefgh` e `2031-01-01` na lista de espera (F-ESP-01; `05_waitlist` casos 19 a 21).

**Correção** uma faixa só (D-08), em `checkWaitlist` e nas CHECKs: só dígitos, espaço, `()`, `+` e `-`, com 10 a 13
dígitos; nascimento entre 1900-01-01 e hoje (CHECK com `current_date`, monotônica: vale hoje, vale amanhã). A migration
apagou as inscrições com WhatsApp fora do formato e zerou o nascimento fora da faixa. A tela marca a área como
obrigatória. Spec 10, R-CTA-07.

---

### QA-24 · MÉDIO · `javascript:` no link do caderno

`study_plan_notebooks.notebook_link` era `text` sem CHECK, o professor gravava `javascript:window.__pwn=1;alert(1)`, e
`routes/student/Notebooks.tsx` o renderizava como `href`. A meta de acerto de 150% também chegava ao banco e voltava
`23514` cru.

**Reproduzir** editar o link do caderno com `javascript:` ou `http://` (F-CAD-01 do professor; `09_lesson_resource_links`
casos 6 a 10).

**Correção** CHECK `https://` sem espaço, até 2048 (`study_plan_notebooks_notebook_link_check`); `checkNotebook` recusa
com "Informe um link HTTPS válido…" e confere a meta de 0 a 100. Qualquer `https://` vale, não só o TEC (D-09). A
migration limpou os links fora da regra para `''`. Spec 15, R-CAD-16.

---

### N-06 · BAIXO · O mesmo, em `subject_blocks.link` e `subject_lessons.link`

As duas colunas eram `text` nulável sem CHECK, renderizadas em `routes/student/Subjects.tsx`. Nenhuma tela as escreve, mas
o professor as grava pela API: a CHECK é a única defesa.

**Reproduzir** `09_lesson_resource_links` casos 8 e 9.

**Correção** a mesma CHECK, com `null` no lugar de `''`; a migration limpou os links fora da regra para `null`.
Spec 15, R-CAD-16.
