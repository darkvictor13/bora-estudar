# Bugs encontrados na varredura de QA

Levantamento feito percorrendo a aplicação inteira com navegador de verdade
contra o Supabase local: 249 verificações sobre autenticação, telas do aluno,
telas do professor, a volta completa da bateria, a extensão e o isolamento
entre dois pares professor/aluno.

Os fluxos exercitados estão em [`fluxos-e2e.md`](fluxos-e2e.md).

Nenhuma requisição foi feita ao tecconcursos.com.br: a extensão foi testada
contra uma página sintética servida localmente, com o domínio do TEC
interceptado.

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

## Registrados, não corrigidos

Não são defeitos: são telas que ainda não existem. Corrigir cada um seria
construir funcionalidade nova, fora do escopo de uma varredura de QA. Ficam
listados aqui e em `fluxos-e2e.md` §7.

### GAP-01 · ALTO · Quem se cadastra nunca chega a nenhum professor

O cadastro público cria `auth.users` e `profiles`, e o aluno entra na lista de
espera. Não cria `student_teacher_links` nem `subscriptions`, e **não existe
tela** para um professor criar o vínculo ou liberar o acesso. `getMyStudents`
parte de `student_teacher_links`, então o aluno recém-cadastrado é invisível
para todo mundo e fica na lista de espera para sempre.

A RLS e os grants já permitem essa escrita ao professor
(`subscriptions_teacher_insert`, `subscriptions_teacher_update`); o que falta é
a interface. `student_teacher_links` não tem grant nenhum — o vínculo precisa
de RPC ou `service_role`.

### GAP-02 · MÉDIO · RPCs implementadas que nenhuma tela chama

`activate_study_plan`, `void_quiz_session` e `record_reinforcement` estão
prontas e testadas em `supabase/tests/`, sem ponto de entrada na interface. As
telas de Revisões recomendam o reforço mas não têm como executá-lo, e o content
script só conduz a fase `main`.

### GAP-03 · BAIXO · Professor não edita os próprios dados

Não há "Meus dados" na sidebar do professor, e `updateProfile` exige
`requireRole("student")`.

### GAP-04 · INFO · Cadastro repetido não confirma nada

Com a confirmação de e-mail desligada no ambiente local, cadastrar um e-mail já
existente devolve "Já existe uma conta com este e-mail" — o comportamento certo
em desenvolvimento. Em produção, com confirmação ligada, o GoTrue responde
sucesso genérico para não revelar quais e-mails existem, e a pessoa vai para a
lista de espera de uma conta que não é dela. Vale decidir o texto dessa tela
antes de ligar a confirmação.
