# Fluxos da aplicação

Catálogo dos fluxos exercitáveis de ponta a ponta, no formato que um teste e2e
precisa: pré-condição, passos, resultado esperado e o seletor de cada elemento.

Foi levantado percorrendo a aplicação inteira com um navegador de verdade
contra o Supabase local. Os bugs encontrados nessa varredura estão em
[`bugs-encontrados.md`](bugs-encontrados.md).

---

## Como montar o ambiente do teste

```bash
npm run db:start        # exige Docker
npm run db:reset        # ponto de partida conhecido: seed
npm run dev             # http://localhost:3000
```

`db:reset` é a única forma confiável de isolar um teste do anterior. As suítes
de `supabase/tests/` **apagam os usuários do seed** — rodar `db:test` antes de
um e2e quebra o login.

### Rodando contra um ambiente remoto

A suíte aponta para onde as variáveis mandarem, e roda contra um projeto
hospedado — com quatro ressalvas que custam meia hora cada quando descobertas
na marra:

```bash
E2E_BASE_URL=https://<dominio> \
E2E_SUPABASE_URL=https://<ref>.supabase.co \
E2E_SUPABASE_KEY=sb_publishable_... \
E2E_DATABASE_URL="postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres" \
npm run e2e --workspace @bora/e2e
```

- **`auth.spec.ts` vai falhar.** `support/mailpit.ts` fala a API do Mailpit,
  que não existe fora do ambiente local. Ou aponte `E2E_MAILPIT_URL` para um
  catcher com API compatível, ou exclua esse arquivo da execução.
- **As fixtures apagam usuários.** `fixtures/scenario.ts` escreve direto em
  `auth.users` e limpa o que criou. Não aponte para um ambiente com dado que
  alguém precisa.
- **Use a conexão direta, na 5432** — não o pooler em modo transaction.
- **O `webServer` tem `reuseExistingServer: true`**, então com uma URL remota
  que responde ele não sobe o Vite. É o comportamento desejado, mas significa
  que uma URL remota fora do ar faz o Playwright servir o site local sem avisar.

`extension.spec.ts` independe do ambiente: carrega `apps/extension/dist` num
Chromium de verdade, e o `global-setup` compila a extensão antes.

`npm run test:e2e` (o `scripts/roundtrip.mjs`) **não** acompanha: tem
`127.0.0.1:54321` fixo no código, e só roda local até alguém parametrizar.

### Usuários do seed

| Papel | E-mail | Senha | UUID |
|---|---|---|---|
| Admin | `admin@boraestudar.local` | `BoraEstudar#2026!` | `ad000000-0000-4000-8000-000000000001` |
| Professor | `professor@boraestudar.local` | `BoraEstudar#2026!` | `d65a965f-0ccb-4a12-ac7b-858519d9df00` |
| Aluno | `aluno@boraestudar.local` | `BoraEstudar#2026!` | `a1000000-0000-4000-8000-000000000001` |

### Dados do seed

| Objeto | Id | Observação |
|---|---|---|
| Planejamento ativo | `aaaa0000-…-000000000001` | "Plano PCPR 2026" |
| Bloco 1 | `bbbb0000-…-000000000001` | Ciências Forenses, meta 80% |
| Bloco 2 | `bbbb0000-…-000000000002` | Direito Penal, meta 80% |
| Catálogo | `cb000000-…-000000000001/2` | 30 questões cada (ids 100001–100030 e 200001–200030) |
| Metas da semana 1 | 5 | 2 de teoria, 2 de bateria, 1 de estudo extra |

`main_target` de toda bateria é **15**, fixo em `start_quiz_session`.

### Três armadilhas do harness

1. **`button[type=submit]` também casa o "Sair" da sidebar.** Todo clique de
   formulário precisa ser escopado em `.content`.
2. **Voltar do TEC é navegação de documento.** Um `goto` para a mesma URL
   trocando só o fragmento é navegação *same-document*: o React não remonta e
   `QuizResultHandler` nunca roda. Passe por `about:blank` antes.
3. **O fragmento não chega ao servidor.** Interceptar a request para o TEC dá a
   URL sem `#`. Leia a URL do frame depois da navegação.

### Isolando o TEC Concursos

`tec-page.ts` tem `https://www.tecconcursos.com.br` fixo no código:
`goToQuestion()` navega direto para lá e não há como apontá-la para outro host.
Um teste da extensão **precisa** interceptar `**://*.tecconcursos.com.br/**` e
responder localmente, senão bate no site de terceiro. HTML mínimo que
`tec-page.ts` sabe ler:

```html
<div class="id-questao">Questão 100001</div>
<div class="questao-enunciado-resolucao-acertou" style="display:none">Você acertou!</div>
<div class="questao-enunciado-resolucao-errou"  style="display:none">Você errou!</div>
<button class="questao-alternativa">Responder</button>
```

O resultado é detectado por **visibilidade**, não por presença: alternar
`display` é o que dispara `detectOutcome()`.

---

## Mapa das rotas

| Rota | Papel | Guarda |
|---|---|---|
| `/` | — | redireciona para a home do papel, ou `/entrar` |
| `/entrar`, `/cadastro`, `/recuperar-senha` | anônimo | com sessão, redireciona para a home |
| `/redefinir-senha` | link do e-mail | sem sessão, mostra "link expirou" |
| `/aluno`, `/aluno/disciplinas`, `/aluno/cadernos`, `/aluno/estatisticas`, `/aluno/revisoes` | aluno | `requireStudentAccess` — exige assinatura ativa |
| `/aluno/conta`, `/aluno/lista-espera` | aluno | `requireRole` — acessíveis sem liberação |
| `/professor`, `/professor/planejamentos`, `/professor/metas`, `/professor/cadernos`, `/professor/revisoes`, `/professor/estatisticas` | professor | `requireRole("teacher")` |
| `/professor/alunos/:studentId` | professor | `notFound()` sem vínculo vigente |

---

## 1. Autenticação

### F-AUTH-01 — Anônimo é mandado para o login
**Passos** GET em cada rota protegida.
**Esperado** todas terminam em `/entrar`. Verificado nas 13 rotas.

### F-AUTH-02 — Login com credencial errada
**Passos** `/entrar` → `#field-email`, `#field-password` → submit.
**Esperado** permanece em `/entrar`; `.alert--error` = "E-mail ou senha incorretos."
A mesma mensagem vale para e-mail inexistente — não revelar quais contas existem é intencional.

### F-AUTH-03 — Campos vazios
O `<form>` tem `noValidate`; quem valida é a action.
**Esperado** "Informe e-mail e senha."

### F-AUTH-04 — Login por papel
| Usuário | Destino |
|---|---|
| aluno | `/aluno` |
| professor | `/professor` |
| admin | `/professor` |

### F-AUTH-05 — Papel errado é devolvido para a própria casa
Aluno em qualquer `/professor/*` → `/aluno`. Professor em qualquer `/aluno/*` → `/professor`.

### F-AUTH-06 — `/entrar` e `/cadastro` com sessão ativa
**Esperado** redirecionam para a home do papel.

### F-AUTH-07 — Logout
**Passos** `.sidebar__foot button[type=submit]`.
**Esperado** `/entrar`, cookie `sb-*-auth-token` removido, `/aluno` volta a barrar.

### F-AUTH-08 — Cadastro público
**Passos** `/cadastro` → `#field-name`, `#field-email`, `#field-password` → submit.
**Esperado** `/aluno/lista-espera`; aviso "Seu acesso ainda não foi liberado".
**Efeito no banco** `auth.users` + `profiles` (role `student`, pelo gatilho
`tg_create_profile_for_new_user`). **Não** cria `student_teacher_links` nem
`subscriptions` — ver BUG-07.

### F-AUTH-09 — Validações do cadastro
| Entrada | Mensagem |
|---|---|
| nome com menos de 3 caracteres | "Informe seu nome completo." |
| senha com menos de 6 | "A senha precisa ter pelo menos 6 caracteres." |
| e-mail já cadastrado | "Já existe uma conta com este e-mail." |

### F-AUTH-10 — Recuperação de senha
**Passos** `/recuperar-senha` → e-mail → submit → ler o e-mail no Mailpit
(`http://127.0.0.1:54324/api/v1/messages`) → seguir o link.
**Esperado** resposta neutra na tela ("Se houver uma conta…"); o link leva a
`/redefinir-senha` **com sessão de recuperação ativa**; nova senha → login com
ela funciona; a senha antiga deixa de funcionar.

### F-AUTH-11 — Link de recuperação expirado
`/redefinir-senha` sem sessão → "Este link expirou ou já foi usado."

### F-AUTH-12 — Nova senha
`#field-password` ≠ `#field-passwordConfirmation` → "As senhas não conferem."
Menos de 6 caracteres → "A senha precisa ter pelo menos 6 caracteres."

---

## 2. Aluno

### F-ALU-01 — Todas as telas renderizam
| Rota | Título |
|---|---|
| `/aluno` | Visão geral |
| `/aluno/disciplinas` | Disciplinas |
| `/aluno/cadernos` | Cadernos TEC |
| `/aluno/estatisticas` | Estatísticas |
| `/aluno/revisoes` | Revisões |
| `/aluno/conta` | Meus dados |
| `/aluno/lista-espera` | Lista de espera |

Nenhuma pode produzir erro de runtime nem de console.

### F-ALU-02 — Seletor de semana
`?semana=<n>`. Semana inexistente, texto ou negativo caem na primeira semana
com metas, sem quebrar.

### F-ALU-03 — Caderno de erros por bloco
`?bloco=<uuid>`; id que não pertence ao planejamento é ignorado.
Botão: `a:has-text("Ver erros")`.

### F-ALU-04 — Editar os próprios dados
`#field-name`, `#field-phone`; e-mail é `readOnly`.
**Esperado** "Dados atualizados."; o nome novo aparece na sidebar; persiste
depois de recarregar. Nome com menos de 3 caracteres → "Informe seu nome completo."

### F-ALU-05 — Lista de espera
`#field-whatsapp`, `#field-interestArea`, `#field-focusExam`, `#field-birthDate`,
`#field-timezone`. Os três primeiros são obrigatórios na action.
**Esperado** "Cadastro salvo. Você está na lista de espera."; é upsert por
`student_id`, então salvar duas vezes não duplica. Com acesso liberado a tela
mostra "Seu acesso já está liberado."

### F-ALU-06 — Estados vazios (aluno sem planejamento)
As cinco telas de estudo mostram "Nenhum planejamento ativo." e nenhum dado de
outro aluno.

### F-ALU-07 — Aluno sem assinatura ativa
**Pré** `update subscriptions set status='suspended'`.
**Esperado** as cinco telas de estudo redirecionam para `/aluno/lista-espera`;
`/aluno/conta` e `/aluno/lista-espera` continuam abrindo; os itens de estudo da
sidebar vêm com `aria-disabled="true"`.

### Conclusão de meta sem bateria — F-CONC-01 a 06

Spec: [`specs/12-conclusao-de-meta.md`](specs/12-conclusao-de-meta.md). Meta de
teoria, de estudo extra e de reforço concluem por `complete_goal`; meta de
bateria continua concluindo por `record_quiz_session_time`, e a RPC recusa
`question_block` — a tela nunca oferece um caminho que o banco recusa.

O formulário abre sob demanda: o botão "Concluir" é `type="button"` e o único
submit da linha é o "Concluir meta". Campos `input[name="minutes"]` e
`textarea[name="note"]`.

#### F-CONC-01 — Concluir meta de teoria
**Passos** abrir o formulário, preencher tempo e observação, enviar.
**Esperado** "Meta concluída."; a linha vira "Concluída"; aparece "Você anotou:"
e o tempo realizado; `goals` fica com `status='completed'`, `completed_at` não
nulo, `spent_minutes` e `student_note` gravados.

#### F-CONC-02 — A contagem sobe dos dois lados
**Esperado** "0 de 5 metas concluídas" vira "1 de 5"; `1:20` é lido como 80
minutos e exibido como "1h20"; a ficha do professor mostra "1 / 5" para o mesmo
aluno. Nenhum dos dois números é contador escrito à mão — os dois derivam de
`goals.status`.

#### F-CONC-03 — Validação do tempo
Texto sem número e `0` → "Informe o tempo em minutos ou no formato hora:minuto.
Ex.: 80 ou 1:20." `241` → "O tempo de uma meta não passa de 240 minutos (4
horas)." Em qualquer um deles a meta continua `pending` e `spent_minutes` nulo.

#### F-CONC-04 — A observação sobrevive a desfazer
**Esperado** depois de desfazer, `spent_minutes` é nulo e `student_note`
continua como estava. É `R-CONC-13`: o que se desfaz é a afirmação de que
terminou, não o que o aluno escreveu.

#### F-CONC-05 — Desfazer derruba a contagem
**Esperado** "Meta reaberta. Ela voltou para pendente."; "1 de 5" volta a "0 de
5"; o status no banco volta a `pending`.

#### F-CONC-06 — Meta de bateria não conclui por aqui
**Esperado** a linha da meta de bateria oferece "Iniciar bateria" e **não** tem
botão "Concluir". Chamar `complete_goal` direto no banco com essa meta levanta
`meta de bateria conclui-se pela bateria`, e ela continua `pending` — a regra
mora no banco, não na ausência do botão.

---

## 3. Bateria — a volta completa

O fluxo mais caro do produto: cada etapa custa uma hora de estudo do aluno e
não pode ser recriada. As três ordenações de `docs/arquitetura.md` são o que
um teste precisa provar.

```
/aluno  ──[Iniciar bateria]──►  RPC start_quiz_session
                                     │
                                     ▼
              https://www.tecconcursos.com.br/questoes#boraQuizStart=<b64url>
                                     │
                    extensão: PERSISTE ──► depois limpa a hash
                                     │
                    aluno responde; cada resposta vai para storage.local
                                     │
                    finalizar: requestId gerado UMA vez, AGUARDA gravação,
                               só então navega
                                     ▼
              http://localhost:3000/aluno#boraQuizResult=<b64url>
                                     │
                    site: RPC finish_quiz_session ──► só então limpa a hash
                                     ▼
              registrar tempo ──► RPC record_quiz_session_time ──► meta concluída
```

### F-BAT-01 — Abrir a bateria
**Pré** meta `question_block` com `status='pending'` e nenhuma sessão aberta.
**Passos** `/aluno` → `button:has-text("Iniciar bateria")`.
**Esperado**
- navegação para `https://www.tecconcursos.com.br/questoes#boraQuizStart=…`;
- `quiz_sessions` ganha uma linha `in_progress`, `session_number=1`, `main_target=15`;
- a meta vira `in_progress`.

**Payload recebido pela extensão** (`parseStartHash`):

| Campo | Valor no seed |
|---|---|
| `returnUrl` | `http://localhost:3000/aluno` |
| `mainTarget` | 15 |
| `availableQuestions` | 30 ids, na ordem do catálogo |
| `history` | `[]` na primeira bateria |
| `historyComplete` | `true` |
| `sessionNumber` | 1 |

### F-BAT-02 — Sessão aberta bloqueia abrir outra
**Esperado** cartão "Bateria 1 · Em andamento"; **nenhum** botão "Iniciar
bateria"; aparecem "Continuar no TEC" e "Cancelar bateria". Chamar a RPC de
novo para outra meta levanta `ja existe uma bateria aberta neste planejamento`
(índice `open_quiz_session_uidx`).

### F-BAT-03 — Extensão persiste antes de limpar a hash
**Esperado** `storage.local["bora.quiz.session.v1"]` existe **antes** de
`location.hash` ser limpa; `queue.length === mainTarget`; `requestId === null`;
`finishedAt === null`.

### F-BAT-04 — Motor de seleção
`pickQuestions` ordena por: inédita → mais erros → vista há mais tempo → vista
menos vezes → id. Determinística: a mesma entrada dá sempre a mesma fila.

### F-BAT-05 — Painel e navegação
Painel em `#bora-panel`: "Bateria N", "x de y respondidas", e os botões "Ir
para a próxima" / "Finalizar e enviar" / "Finalizar agora" / "Cancelar bateria".
Ao abrir, a extensão navega para a primeira pendente da fila.

### F-BAT-06 — Registrar respostas
**Passos** clicar num `.questao-alternativa` e tornar visível
`.questao-enunciado-resolucao-acertou` ou `…-errou`.
**Esperado** a resposta entra em `answers[questionId]`; `executionOrder`
sequencial sem colisão (o banco tem `unique(quiz_session_id, execution_order)`).

### F-BAT-07 — Guarda de abertura
**Cenário** abrir uma questão da fila que o aluno já resolveu **fora** desta
bateria: o TEC mostra o resultado já na carga.
**Esperado** o resultado antigo **não** é registrado. Depois do primeiro clique
num controle de resposta a trava cai e o resultado passa a contar.

### F-BAT-08 — Finalizar
**Esperado** `requestId` gerado uma única vez e gravado **antes** de navegar;
URL de volta `…/aluno#boraQuizResult=<b64url>` com `cancel:false` e todas as
respostas.

### F-BAT-09 — Site grava o resultado
**Esperado** alerta "Gravando o resultado da bateria…" e depois "Resultado
gravado. Falta registrar o tempo para concluir a meta."; a hash é limpa **só
depois** da confirmação; sessão vai para `awaiting_time`; ledger com 15 linhas.

### F-BAT-10 — Falha na gravação preserva a hash
**Esperado** com erro, a hash **continua** na URL (é a única cópia do resultado
no navegador) e a mensagem manda atualizar a página em vez de refazer a bateria.

### F-BAT-11 — Idempotência
| Reenvio | Esperado |
|---|---|
| mesmo `requestId`, mesmo payload | replay: devolve o estado anterior, ledger continua com 15 linhas |
| mesmo `requestId`, payload diferente | recusado: `request_id … ja utilizado com outro payload` |

### F-BAT-12 — Payload inválido na volta
| Hash | Mensagem |
|---|---|
| base64 corrompido | "O resultado voltou da extensão em formato inválido." |
| `protocol` diferente de 1 | "Atualize a extensão: ela devolveu o resultado num formato que este site ainda não entende." |

### F-BAT-13 — Registrar o tempo
**Passos** `#minutes` → `button:has-text("Registrar tempo")`.
**Esperado** sessão `completed`, `duration_minutes` gravado, meta `completed`,
`vw_goal_performance` com 15 respondidas / 11 certas / 85 min.
Aceita minutos (`80`) e hora:minuto (`1:20`).

### F-BAT-14 — Números propagados
Com 11/15:

| Tela | Esperado |
|---|---|
| `/aluno` | `11/15 · 73%`, meta "Concluída" |
| `/aluno/estatisticas` | desempenho oficial 73%, "11 acertos em 15 principais" |
| `/aluno/disciplinas` | 73%, badge "Abaixo" (meta 80%) |
| `/aluno/cadernos` | 73% no bloco |
| `/aluno/revisoes` | 4 questões no caderno de erros, fase "principal" |

### F-BAT-15 — Cancelar pelo site
**Esperado** sessão `cancelled`; meta volta para `pending`; o botão "Iniciar
bateria" reaparece; a bateria cancelada **não** conta em `vw_block_performance`
nem em `vw_seen_questions` (as views filtram `status='completed'`), mas as
respostas ficam no ledger para auditoria.

### F-BAT-16 — Cancelar pela extensão
`#bora-panel button:has-text("Cancelar bateria")` → confirm → volta com
`cancel:true` e `answers:[]` se nada foi respondido.

### F-BAT-17 — Segunda bateria não repete questão
**Pré** primeira bateria concluída no mesmo bloco.
**Esperado** `history` volta com as 15 vistas; `pickQuestions` escolhe 15
inéditas; interseção com a fila anterior é vazia.

### F-BAT-18 — Histórico incompleto
Com `historyComplete:false` o painel mostra "Histórico incompleto: pode repetir
questão." O site marca assim quando o teto de 50 páginas de `vw_seen_questions`
é atingido.

### F-BAT-19 — Bateria já enviada, reabrindo o TEC
**Esperado** a extensão **não** pode reoferecer "Finalizar e enviar" para uma
bateria que já foi entregue ao site.

---

## 4. Professor

### F-PROF-01 — Todas as telas renderizam
`/professor` (Meus alunos), `/professor/planejamentos`, `/professor/metas`,
`/professor/cadernos`, `/professor/revisoes`, `/professor/estatisticas`.

### F-PROF-02 — Lista de alunos
Uma linha por vínculo vigente em `student_teacher_links`, com contato,
planejamento ativo e badge de acesso (`Acesso ativo`, `Aguardando liberação`,
`Suspenso`, `Expirado`).

### F-PROF-03 — Ficha do aluno
`/professor/alunos/:studentId`. Cartões: Planejamentos, Metas (concluídas /
total), Desempenho oficial, Semanas planejadas.
Id inexistente, id de aluno de outro professor e id malformado → **404**.

### F-PROF-04 — Gerar metas da semana
**Campos** `#week` (padrão: última semana + 1), `#minutes` (60), `#mode`
(`append` / `replace` / `replan`), `input[name=weekdays]` (seg–sex marcados),
`input[name=blocks]` (todos marcados), `input[name=withTheory]`.
**Esperado** com 2 blocos e teoria ligada → "4 meta(s) criada(s) na semana N";
`day_order` é calculado no banco, continuando o maior sobrevivente do dia.

### F-PROF-05 — Reenviar o mesmo lote é no-op
**Passos** submeter o mesmo formulário duas vezes, sem mudar nada.
**Esperado** a segunda vez **não** cria metas novas; o total do planejamento
continua igual.

### F-PROF-06 — Validações
Sem dia → "Escolha pelo menos um dia de estudo."
Sem bloco → "Escolha pelo menos um bloco."

### F-PROF-07 — Modos `replace` e `replan`
`replace` marca `deleted_at` nas metas `pending`/`in_progress`/`skipped` da
semana. `replan` preserva as que têm bateria concluída. Bateria aberta na
semana bloqueia os dois: `ha bateria aberta nesta semana`.

### F-PROF-08 — Query string de planejamento
`?plano=<uuid>` em `/professor/metas` e `/professor/cadernos`; id inválido cai
no planejamento ativo (ou no primeiro) sem quebrar.

### F-PROF-09 — Revisões
Lista os blocos com **3 ou mais** baterias válidas e desempenho oficial
acumulado **abaixo de 80%**. É a mesma regra do reforço automático, que avalia
somente as questões `main`.

---

## 5. Isolamento entre contextos

Suíte que precisa de um segundo par professor/aluno. Todos os pontos abaixo
foram verificados e **passam**.

### F-ISO-01 — Leitura
Aluno 2 lê 0 planejamentos, 0 metas e 0 linhas do ledger do aluno 1.
Professor 2 não vê o aluno 1 em nenhuma tela; a ficha dele dá 404.

### F-ISO-02 — Escrita por RPC
| Tentativa | Esperado |
|---|---|
| aluno 2 chama `start_quiz_session` na meta do aluno 1 | `somente o aluno pode iniciar a bateria` |
| aluno insere meta em planejamento alheio | `42501` |
| aluno insere a própria `subscription` ativa | `42501` |
| professor 2 chama `void_quiz_session` em bateria alheia | `somente o professor responsavel pode anular` |
| professor 2 renomeia planejamento alheio | 0 linhas afetadas (RLS filtra em silêncio no UPDATE) |

> `UPDATE` e `DELETE` **filtram em silêncio**: a linha não fica visível e o
> comando afeta zero linhas, sem erro. Um teste que espere exceção passa por
> engano no dia em que a policy sumir — conte linhas afetadas.

### F-ISO-03 — Escrita direta bloqueada
`quiz_sessions`, `quiz_session_questions`, `audit_log` e
`student_teacher_links` não têm grant para `authenticated`: qualquer
INSERT/UPDATE vindo do cliente é `42501`. Coberto por `supabase/tests/02_rls.sql`
e `05_teacher_writes.sql`.

---

## 6. Onde cada fluxo é coberto

| Comando | Cobertura |
|---|---|
| `npm run db:test` | 96 invariantes de banco: fluxo completo com replay em cada RPC, RLS entre dois alunos, ciclo de reforço, recorte por fase, escrita do professor, preferência de interface, conclusão de meta |
| `npm run test:e2e` | volta completa da extensão sem navegador, contra o Supabase local |
| `npm run check` | typecheck, lint e os testes de unidade de `packages/protocol` e `apps/web` |
| `npm run e2e` | 164 testes num Chromium de verdade — este catálogo, implementado |

O que nenhum dos três primeiros alcança é a camada de interface e de fluxo, que
é justamente onde vivia todo bug de [`bugs-encontrados.md`](bugs-encontrados.md).
É o que `apps/e2e` cobre:

| Arquivo | Fluxos | Testes |
|---|---|---|
| `tests/auth.spec.ts` | §1 inteira, F-AUTH-01 a 12 | 47 |
| `tests/student.spec.ts` | §2 inteira, mais F-BAT-14 e F-CONC-01 a 06 | 45 |
| `tests/quiz.spec.ts` | §3 pelo lado do site: F-BAT-01/02/09/10/11/12/13/15/16/17 | 15 |
| `tests/extension.spec.ts` | §3 pelo lado da extensão: F-BAT-03/05/06/07/08/16/18/19, mais a volta completa site → extensão → site | 9 |
| `tests/teacher.spec.ts` | §4 inteira, F-PROF-01 a 09 | 29 |
| `tests/isolation.spec.ts` | §5 pelo lado das telas | 6 |
| `tests/theme.spec.ts` | §8 inteira, F-TEMA-01 a 08 | 13 |

Fica de fora, de propósito, o que já é provado sem navegador: F-BAT-04
(determinismo de `pickQuestions`, em `engine.test.ts`) e o lado RPC do §5
(`supabase/tests/02_rls.sql` e `05_teacher_writes.sql`). Testar de novo custaria
tempo de execução sem cobrir nada novo.

### As três armadilhas, resolvidas

As armadilhas do harness descritas mais acima não voltaram a ser problema de
quem escreve teste — cada uma virou uma peça da suíte:

| Armadilha | Onde mora a solução |
|---|---|
| `button[type=submit]` casa o "Sair" | `support/ui.ts`, e todo clique escopado em `.content` |
| Voltar do TEC é navegação de documento | `returnToSite()`, em `fixtures/quiz.ts` |
| O fragmento não chega ao servidor | `readStartPayload()`, que lê a URL do frame |
| `tec-page.ts` aponta para o TEC de verdade | `fixtures/tec.ts`, interceptando **automaticamente** em todo teste |
| `db:reset` é a única forma de isolar | `createScenario()`, que dá a cada teste um par professor/aluno próprio |

---

## 7. Fluxos que ainda não existem

Nenhum deles tem tela; ficam registrados porque um e2e futuro vai esbarrar neles.

- **Vincular aluno a professor.** Só direto no banco. Sem isso, quem se cadastra
  fica na lista de espera para sempre.
- **Liberar/suspender acesso.** A RLS e o grant já permitem ao professor
  escrever em `subscriptions`; falta a tela.
- **Criar planejamento e cadastrar blocos.** `study_plans` e
  `study_plan_blocks` só nascem no seed.
- **Ativar planejamento.** A RPC `activate_study_plan` existe e ninguém chama.
- **Anular bateria.** `void_quiz_session` existe e ninguém chama.
- **Reforço de ciclo.** `record_reinforcement` existe; as telas de Revisões só
  recomendam, não executam. O content script também só conduz a fase `main`.
- **Editar os próprios dados como professor.** `updateProfile` exige
  `requireRole("student")`.

O catálogo completo do que a versão anterior fazia e ainda não existe está em
[`inventario-v96.md`](inventario-v96.md), com a fila de reconstrução.



---

## 8. Tema claro e escuro

Spec: [`specs/11-tema-claro-escuro.md`](specs/11-tema-claro-escuro.md). A
preferência é da conta e vale para os três papéis; o banco guarda em
`user_preferences`, e os critérios de RLS, grant por coluna e enum são provados
sem navegador em `supabase/tests/06_preferences.sql`.

O controle é `.sidebar__theme button`, e é `type="button"` de propósito: o único
submit da sidebar continua sendo o "Sair".

### F-TEMA-01 — Escolher o tema
**Pré** qualquer pessoa autenticada, sem linha em `user_preferences`.
**Passos** clicar em "Tema escuro" na sidebar.
**Esperado**
- `<html data-theme="dark">` imediatamente;
- o botão passa a dizer "Tema claro";
- `user_preferences` ganha a linha com `theme='dark'`;
- `localStorage` tem `bora.theme.active` = id do perfil e `bora.theme.<id>` = `dark`;
- recarregar mantém o escuro.

Voltar ao claro grava de novo, sem criar uma segunda linha.

### F-TEMA-02 — A escolha é da conta
**Cenário** contexto de navegador NOVO, sem `localStorage`, autenticado como a
mesma pessoa. **Esperado** a tela abre escura — o único caminho possível para o
escuro ali é a conta.

### F-TEMA-03 — Sem piscada
**Cenário** a resposta de `/rest/v1/profiles` é segurada, então nenhum loader
resolve e nenhuma tela renderiza.
**Esperado** `<html data-theme="dark">` **já está aplicado** e `h1` ainda não
existe. É o script embutido de `index.html` provando que roda antes do primeiro
paint; se o tema dependesse do loader, aqui o documento estaria claro.

**Espere a gravação antes de recarregar.** A conta é a fonte da verdade: trocar
o tema e recarregar antes de o valor subir faz o loader devolver o antigo e
desfazer a escolha. É `R-TEMA-11` funcionando, e um teste que não aguarda a
gravação falha de forma intermitente acusando piscada.

### F-TEMA-04 — A gravação falha
**Cenário** `/rest/v1/user_preferences` responde 500.
**Esperado** a tela troca de cor assim mesmo; aparece "Tema aplicado neste
aparelho. Não foi possível salvar na sua conta."; `user_preferences` continua
sem linha.

### F-TEMA-05 — Sair
**Esperado** as duas chaves do `localStorage` somem, `/entrar` fica clara, e
outra pessoa autenticando no mesmo navegador não herda o escuro.

### F-TEMA-06 — Os três papéis
Aluno, professor e **admin** têm o controle e a preferência persiste. O admin é
criado com `createUser("admin", …)` e removido no fim do teste.

### F-TEMA-07 — Contraste AA nos dois temas
**Esperado** em `/aluno`, `/aluno/estatisticas`, `/aluno/revisoes`,
`/aluno/conta`, `/professor`, `/professor/planejamentos` e
`/professor/estatisticas`, nos dois temas: texto a 4.5:1 — 3:1 se grande — e
limite de campo e de botão a 3:1.

Os pares saem de `getComputedStyle` na página, em `support/contrast.ts`, com
duas correções que a medição ingênua erra:

- **o fundo é resolvido subindo pelos ancestrais**, compondo alfa. Quase todo
  elemento tem `background-color: rgba(0,0,0,0)`, e comparar texto contra
  transparente não mede nada;
- **`opacity` é multiplicada no alfa da cor.** Ela não aparece em
  `getComputedStyle().color`, e três rótulos da sidebar a usam — sem isso o
  teste aprovaria um contraste que ninguém enxerga.

Borda de cartão fica **fora** de propósito: contêiner não interativo não é
componente na acepção da 1.4.11, e o tema claro nunca cumpriu 3:1 ali.

### F-TEMA-08 — Sem escolha
**Cenário** `emulateMedia({ colorScheme: "dark" })`, sem linha na tabela.
**Esperado** a tela abre **clara**. Não existe "seguir o sistema":
`prefers-color-scheme` não é lido em lugar nenhum do site.
