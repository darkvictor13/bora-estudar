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

### Execução do reforço de ciclo — F-RCIC-01 a 06

Spec: [`specs/20-execucao-do-reforco.md`](specs/20-execucao-do-reforco.md). O
cartão é "Reforço — <bloco>" em `/aluno/revisoes`, com uma linha por erro e dois
radios (`input[value="correct"]` e `input[value="incorrect"]`).

**`.all()` não espera por nada.** Marcar os radios logo depois do `goto`
encontra a lista vazia, nenhum é marcado, e o teste falha dizendo que faltaram
15 — quando na verdade nada foi lido. Faça uma asserção que aguarde
`tbody tr` antes.

**Os erros são deduplicados por questão.** O bloco do seed tem 30 questões, e
três baterias de 15 já repetem: 7 erros por bateria dão **15 únicos**, não 21.

#### F-RCIC-01 — O ciclo aberto aparece
**Esperado** "Ciclo de 3 baterias com 53% nas principais · 15 questão(ões) a
revisar", badge "Prioridade alta" (abaixo de 75%), e 15 linhas.

#### F-RCIC-02 — Concluir o reforço
**Esperado** "Reforço concluído."; o cartão some; `reinforcements` ganha 1 linha,
`reinforcement_sessions` 3 e `reinforcement_questions` 15.

#### F-RCIC-03 — Faltando marcar
**Esperado** "faltam 2" e nenhuma linha em `reinforcements`. A tela impede antes
de a RPC recusar, para o aluno não perder o trabalho.

#### F-RCIC-04 — O que muda depois
**Esperado** "Ciclos revisados" sobe para 1 e o desempenho oficial do bloco
continua **53%** — reforço não anula bateria.

#### F-RCIC-05 — Quando não há reforço
**Esperado** com menos de três baterias, e com o acumulado em 80% exatos, o
cartão não existe.

#### F-RCIC-06 — O professor vê e não executa
**Esperado** `/professor/revisoes` mostra o bloco e **não** tem "Concluir
reforço".

### Estudo extra avulso — F-EXTRA-01 a 06

Spec: [`specs/19-estudo-extra-avulso.md`](specs/19-estudo-extra-avulso.md). O
botão "Registrar estudo extra" fica no cabeçalho do cartão da semana; o submit
do formulário é "Registrar", e o clique precisa de `{ exact: true }` para não
casar o botão que o abriu.

#### F-EXTRA-01 — Registrar
**Esperado** "Estudo extra registrado."; a linha aparece como "Estudo extra —
Anki", concluída, com a observação e o tempo; no banco, `status='completed'`,
`extra_activity='flashcards'`, `created_by` do aluno, `block_id` nulo.

#### F-EXTRA-02 — Entra no tempo, não no desempenho
**Esperado** "0 de 5" vira "1 de 6" — a meta nasce concluída, então sobe os
dois lados; `1:20` vira 80 minutos em `minutes_spent`; `questions_answered`
continua 0.

#### F-EXTRA-03 — Os sete tipos
**Esperado** o `<select>` oferece Lei seca, Anki, Simulado, Revisão, Questões
extras, Videoaula e Outro, nessa ordem, e grava o valor em inglês.

#### F-EXTRA-04 — Remover
**Esperado** "Registro removido."; a linha some da semana e `deleted_at` fica
preenchido — a linha continua no banco.

#### F-EXTRA-05 — A meta do professor não é removível pelo aluno
**Esperado** a linha planejada não tem "Remover", e `delete_extra_study`
chamada direto levanta "planejada pelo professor". `created_by` é o que separa
as duas: ambas são `extra_study`.

#### F-EXTRA-06 — Validação do tempo
**Esperado** `241` e texto sem número são recusados, e a contagem de metas não
muda.

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

### F-RESU-01 — Tópicos do bloco antes de estudar
**Esperado** cada bloco do catálogo traz um `<details>` "Ver o que será
estudado" com os tópicos e quantas questões cada um tem. Recolhido: um bloco de
27 tópicos empurraria a tabela para fora da tela.

### F-RESU-02 — Bloco sem catálogo vinculado
**Esperado** bloco criado à mão pelo professor **não** mostra a seção. Não é
erro: é bloco sem questões cadastradas. `addBlocks` do e2e cria exatamente esse
caso, sem `catalog_block_id`.

### F-RESU-03 — Resumo da bateria concluída
**Esperado** "Ver tópicos" abre o resumo daquela bateria, uma linha por tópico.
O estado vai na query string (`?bateria=`), como `?bloco=` em `/aluno/revisoes`:
recarregar mantém o resumo aberto.

### F-RESU-04 — O resumo separa as três fases
**Esperado** colunas de principais, reforços e extras. Fase que não aconteceu
vem com `—`, e não `0/0`: não ter tido extra é diferente de ter errado todas.

### F-RESU-05 — Bateria alheia na query string
**Esperado** a tela abre normalmente e **nenhum resumo** aparece. A RLS já não
devolveria a linha; a tela não pode reagir a isso com erro. Não existe status
404 neste servidor — verifica-se a TELA.

### F-TEMP-01 — Tempo do período, por disciplina e por atividade
**Esperado** o cartão soma o tempo das metas concluídas e divide em uma linha
por grupo: meta **com bloco** vai pela disciplina, meta **sem bloco** pela
atividade. Nunca pelos dois — misturar os eixos produziria fatias que se
sobrepõem.

### F-TEMP-02 — Trocar o período
**Esperado** as abas hoje/semana/mês/ano/total trocam os números **sem buscar
nada**: a view devolveu o planejamento inteiro e o recorte é função pura. A aba
ativa carrega `aria-pressed="true"`.

### F-TEMP-03 — Período sem tempo
**Esperado** "Nenhum tempo registrado neste período" e **nenhuma linha** — não
um total de zero. Zero e "não registrou" são coisas diferentes.

### F-TEMP-04 — Série semana a semana
**Esperado** uma linha por semana **planejada**, incluindo a semana intocada,
que aparece com `0min` e desempenho `—`. Sumir com ela esconderia justamente a
semana em que o aluno parou; e `—` não é 0%, porque não responder não é errar.

### F-TEMP-05 — Sequência de dias
**Esperado** zero antes de qualquer conclusão, e 1 depois da primeira. A
sequência conta dias distintos para trás, tolera **hoje** vazio se ontem tem, e
zera quando ontem também não teve.

### F-TEMP-07 — Reabrir uma meta
**Esperado** o tempo dela sai das **três** leituras no mesmo instante:
`vw_study_time` filtra `status = 'completed'`, e reabrir é mudar o status.

### F-REVE-02 — O aluno marca uma revisão
**Esperado** a célula da revisão vira "Feita", a mensagem aparece no nível da
página, e recarregar mantém a marcação. Uma linha viva em `review_completions`.

**A asserção é no badge, nunca em `hasText: "Feita"`.** O `hasText` do Playwright
é case-insensitive, e o botão "Marcar feita" casa com ele: a asserção passaria
antes de qualquer clique.

### F-REVE-03 — Desmarcar
**Esperado** a célula volta ao pendente e `review_completions` fica com **zero
linhas vivas e uma linha total** — desmarcar escreve `deleted_at`, não apaga.

### F-REVE-06 — Mudar o espaçamento não perde a marcação
**Esperado** apertar o intervalo reordena a grade e a revisão já feita continua
feita, agora noutra linha. A chave é `(bloco, ordinal)`: na v96 era
`disciplina:linha:tipo:aula`, e mexer no intervalo órfãava tudo.

### F-DIFI-04 — O aluno vê onde está errando
**Esperado** `/aluno/estatisticas` traz o cartão "Onde você está errando" com o
mesmo recorte de F-DIFI-01, para o próprio aluno. Não há policy nova: a RLS de
`quiz_session_questions` já passa por `can_view_context`, e a view tem
`security_invoker`.

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

### F-TOPI-01/02/03 — Rodízio por tópico
Spec: [`specs/22-rodizio-por-topico.md`](specs/22-rodizio-por-topico.md).
**Esperado** as 15 principais saem equilibradas entre os tópicos do bloco —
nenhum tópico leva mais que um a mais que o menor —, a segunda bateria do bloco
não repete questão, e a fila reproduzida pela fixture é a que o banco registrou.

**Nenhum teste deve fixar quantas questões um ciclo tem.** Quais questões cada
bateria pega é propriedade do motor, e ela mudou quando o rodízio entrou. Os
testes de `F-RCIC` derivam esse número do banco.

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

### Reforço correlato e rodada extra — F-FASE-01 a 06

Spec: [`specs/21-fases-na-extensao.md`](specs/21-fases-na-extensao.md).
**O protocolo é o 2**: `availableQuestions` carrega `{ id, topic }`.

**A fila CRESCE durante a bateria.** Cada erro acrescenta uma correlata do
mesmo tópico ao fim, então "N de M respondidas" tem o M subindo — todo teste
que conta precisa somar os erros já cometidos. Foi o que quebrou três testes de
F-BAT quando esta spec entrou.

#### F-FASE-01 — Errar põe uma correlata na fila
**Esperado** o total sobe de 2 para 3, e o painel passa a mostrar
"N principais · N reforços · N extras".

#### F-FASE-02 — A correlata é gravada com fase e origem
**Esperado** `phase='reinforcement'`, `sourceQuestionId` da questão errada, e o
`topic` da correlata igual ao da origem.

#### F-FASE-03 — Rodada extra
**Esperado** com todas as principais respondidas, "+ 5 questões extras"
acrescenta 5 com `round = 1`. Com principal pendente, o botão **não existe**.

#### F-FASE-04 — Tudo ou nada
**Esperado** sem 5 inéditas, um `alert` diz "Não há 5 questões inéditas" e a
fila não muda. O banco exige `mod(extras, 5) = 0`.

#### F-FASE-05 — Finalização antecipada descarta o que não é principal
**Esperado** o resultado leva só a principal respondida. Sem o descarte,
`finish_quiz_session` recusaria a bateria inteira.

#### F-FASE-06 — As fases chegam ao ledger
Provado dentro da **volta completa**: 15 principais com 4 erros geram 4
correlatas, o ledger fica com 19 linhas, nenhuma correlata sem
`source_question_id`, a nota da meta continua **11/15** — porque
`vw_goal_performance` conta só `main` — e `/aluno/estatisticas` passa a mostrar
"4 reforços".

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

### Prévia e distribuição da semana — F-PREV-01 a 06

Spec: [`specs/18-previa-e-distribuicao-da-semana.md`](specs/18-previa-e-distribuicao-da-semana.md).
O campo de peso é `input[name="peso:<Disciplina>"]` — endereçar por `id` não
funciona, porque o nome da disciplina tem espaço e acento. A prévia é a seção
`.preview`, e o botão que a gera é `type="button"`.

**O formulário tem `noValidate`**, como o de login: quem valida é a action. Sem
isso, `max` no campo de total faria o navegador barrar o envio e a mensagem em
português nunca apareceria.

#### F-PREV-01 — A prévia não grava nada
**Esperado** a seção mostra "4 meta(s)", "nada foi gravado ainda" e os dias; a
contagem de metas do planejamento não muda.

#### F-PREV-02 — O que a prévia mostrou é o que a semana recebe
**Esperado** o conjunto de títulos da prévia é igual ao dos títulos gravados.

#### F-PREV-03 — Peso maior gera mais metas
**Esperado** com total 8 e pesos 3 e 1, a primeira disciplina recebe 6 e a
segunda 2.

#### F-PREV-04 — Peso 0 tira a disciplina da semana
**Esperado** zero metas da disciplina zerada; o total inteiro vai para a outra.

#### F-PREV-05 — Validação do total e do peso
**Esperado** total 81 → "O total de metas precisa ficar entre 1 e 80."; peso 21
→ "entre 0 e 20". Nada é gravado em nenhum dos dois.

#### F-PREV-06 — Mudar um peso não é replay
**Esperado** a segunda geração da mesma semana, com peso diferente, cria metas
em vez de devolver "Este lote já tinha sido aplicado". É `R-PREV-16`: o peso
entra no hash do `batch_id`.

### Ficha da turma — F-TURMA-01 a 05

Spec: [`specs/17-ficha-da-turma.md`](specs/17-ficha-da-turma.md). Busca e
filtros vivem na query string: `?busca=`, `?situacao=`, `?plano=`.

**A linha tem DOIS badges** — situação de estudo e situação de acesso. Use
`td.situacao .badge` e `td.acesso .badge`; `tr .badge` é violação de modo
estrito. E **`allTextContents()` não espera por nada**: para ler a ordem da
lista, faça antes uma asserção que aguarde a tabela existir.

#### F-TURMA-01 — A lista mostra o diagnóstico
**Esperado** metas `concluídas/total` com o percentual, desempenho oficial, e o
badge da faixa; os quatro números do resumo batem com as linhas.

#### F-TURMA-02 — O limiar de desempenho decide a faixa
**Esperado** 10 de 15 (67%) é "Atenção"; com a segunda bateria de 15 de 15 o
acumulado sobe e vira "Em ritmo".

#### F-TURMA-03 — Busca e filtros
**Esperado** `?busca=` casa nome **e** e-mail, sem acento; `?situacao=` e
`?plano=` filtram; termo sem correspondência mostra "Nenhum aluno neste filtro".

#### F-TURMA-04 — Filtro inválido não quebra
**Esperado** situação inexistente, plano inexistente e valores vazios devolvem a
lista inteira, sem erro de console. Mesma regra de `?semana=`.

#### F-TURMA-05 — Quem precisa de atenção vem primeiro
**Esperado** Atrasado antes de Sem dados. A ordenação é por faixa e, dentro
dela, por nome.

### Histórico de baterias e anulação — F-ANUL-01 a 05

Spec: [`specs/16-historico-e-anulacao-de-bateria.md`](specs/16-historico-e-anulacao-de-bateria.md).
O cartão "Baterias" fica na ficha do aluno. O botão "Anular" abre o campo de
motivo; o submit é o segundo "Anular", então o clique precisa de
`{ exact: true }` para não casar o que abriu o formulário.

#### F-ANUL-01 — A ficha lista as baterias
**Esperado** bloco, número, `acertos/principais` com o percentual, tempo e
situação, da mais recente para a mais antiga.

#### F-ANUL-02 — Anular preserva o ledger
**Esperado** "Bateria anulada."; a situação vira "Anulada"; o motivo aparece na
linha; `quiz_session_questions` **continua com as mesmas 15 linhas**.

#### F-ANUL-03 — O desempenho desce e a meta volta
**Esperado** "Desempenho oficial" sai de 73% para "—" — é
`vw_quiz_session_performance` filtrando `status = 'completed'` — e a meta volta a
"Pendente" na tela do aluno.

#### F-ANUL-04 — As questões voltam a ser inéditas
**Esperado** `vw_seen_questions` volta a zero para o bloco, e a bateria seguinte
da mesma meta escolhe **exatamente a mesma fila**. É a consequência que a tela
avisa antes de o professor clicar.

#### F-ANUL-05 — O que não é anulável
**Esperado** bateria `in_progress` não tem botão; motivo vazio grava
`Anulação administrativa`.

### Cadernos do planejamento — F-CAD-01 a 06

Spec: [`specs/15-cadernos-do-planejamento.md`](specs/15-cadernos-do-planejamento.md).
`/professor/cadernos?plano=<id>&ver=<recorte>`, com os recortes `ativos`
(padrão), `desativados`, `excluidos` e `todos`.

**Duas armadilhas.** Desativar ou excluir **tira a linha do recorte atual** — a
conferência do badge tem de ser feita em outro `ver=`, não na mesma tela. E a
confirmação é do nível da página, nunca do formulário: todas as ações devolvem
`redirectTo` com `?feito=`.

#### F-CAD-01 — Desativar tira do rodízio sem mexer no histórico
**Esperado** "Metas concluídas e estatísticas antigas foram preservadas"; a
linha sai de `ativos` e aparece em `desativados`; o bloco some de
`/professor/metas`; o ledger continua com as 15 linhas da bateria concluída.

#### F-CAD-02 — Bloco desativado não abre bateria
**Esperado** "Este bloco não está disponível no seu planejamento." na linha da
meta, e a meta continua `pending`. É `start_quiz_session` exigindo
`active and deleted_at is null`, traduzida.

#### F-CAD-03 — Editar vale só para este planejamento
**Esperado** o nome e a meta mudam na tela; `catalog_blocks` — compartilhado
entre alunos — fica intacto.

#### F-CAD-04 — Excluir e restaurar
**Esperado** o bloco sai de `ativos`, aparece em `excluidos` com badge
"Excluído", e restaurar devolve `deleted_at = null`, `active = true` e um
`block_order` recalculado, sem violar `study_plan_block_order_uidx`.

#### F-CAD-05 — Bloco com meta não oferece excluir
**Esperado** a coluna mostra "N meta(s)" no lugar do botão.

#### F-CAD-06 — Caderno avulso
**Esperado** "Caderno avulso criado."; a linha nasce com `catalog_block_id`
nulo e `active = true`, e passa a aparecer em `/professor/metas`.

### Gestão do planejamento — F-GPLAN-01 a 07

Spec: [`specs/14-gestao-do-planejamento.md`](specs/14-gestao-do-planejamento.md).
O formulário fica no cartão "Novo planejamento" de `/professor/planejamentos`;
as ações por linha são "Ativar" e "Arquivar".

**Duas armadilhas do harness aqui.** A confirmação de ativar e arquivar é do
NÍVEL DA PÁGINA — `.content > .alert--success` —, porque o alerta do formulário
de criação continua na tela dentro do cartão e `.alert--success` sozinho casa os
dois, em violação do modo estrito. E o formulário some na revalidação: quem
anuncia é a página, lendo `?feito=`.

#### F-GPLAN-01 — Criar planejamento
**Esperado** "criado como rascunho"; `study_plans` com `status='draft'`;
`study_plan_blocks` com os blocos ativos do catálogo, `block_order` começando em
0 dentro de cada disciplina.

#### F-GPLAN-02 — O rascunho não é visível para o aluno
**Esperado** badge "Rascunho" para o professor; o aluno continua com "Nenhum
planejamento ativo".

#### F-GPLAN-03 — Ativar
**Esperado** "Planejamento ativado."; **exatamente um** ativo para o aluno; o
anterior fica `archived` e **não** apagado; o aluno passa a ver o novo no
cabeçalho da Visão geral.

#### F-GPLAN-04 — Gerar metas usa os blocos materializados
**Esperado** `/professor/metas` não diz "não tem blocos ativos" e oferece os
checkboxes de bloco.

#### F-GPLAN-05 — Arquivar
**Esperado** "Planejamento arquivado."; a contagem de metas do planejamento não
muda; o aluno volta ao estado vazio.

#### F-GPLAN-06 — Nome repetido
**Esperado** "Este aluno já tem um planejamento com esse nome. Escolha outro." e
nenhuma linha nova — é `study_plan_name_unique` traduzida.

#### F-GPLAN-07 — Professor sem aluno vinculado
**Esperado** o cartão diz "Vincule um aluno a você" e **não** renderiza o
seletor de alunos.

### Vínculo e liberação de acesso — F-VINC-01 a 07

Spec: [`specs/13-vinculo-e-liberacao-de-acesso.md`](specs/13-vinculo-e-liberacao-de-acesso.md).
O cartão "Candidatos" em `/professor` só existe por causa da policy
`waitlist_teacher_read`: sem ela, `waitlist_own` passa por `is_teacher_of` e a
consulta volta vazia. As ações de acesso ficam no cartão "Acesso" da ficha do
aluno.

**Armadilha, e ela custou um teste vermelho.** `tbody tr` com o nome do
candidato casa **a linha da própria fila**, então esperar por ela depois de
clicar em "Vincular a mim" passa de imediato e a conferência no banco roda antes
de a action terminar. Espere o candidato **sair** do cartão "Candidatos" —
`toHaveCount(0)` —, que é o que só é verdade depois da gravação.

#### F-VINC-01 — O candidato aparece na fila
**Pré** aluno com linha em `waitlist` e sem `student_teacher_links`.
**Esperado** ele aparece em "Candidatos" com nome, e-mail e concurso em foco.
Aluno que já tem professor **não** aparece.

#### F-VINC-02 — Vincular
**Esperado** o candidato sai da fila; passa a constar em "Meus alunos" com
"Aguardando liberação"; `student_teacher_links` ganha a linha com
`teacher_id` de quem clicou e `ended_at` nulo; `waitlist.teacher_id` é
reivindicado.

#### F-VINC-03 — O candidato reivindicado sai da fila dos outros
**Esperado** outro professor, autenticado em seguida, não o enxerga.

#### F-VINC-04 — Liberar acesso
**Pré** cenário com `access: "none"`; o aluno é empurrado para
`/aluno/lista-espera`.
**Esperado** "Acesso liberado por 3 meses."; `subscriptions` ganha a linha
`active` com `validity` fechada no início e aberta no fim; o aluno passa a abrir
`/aluno`.

#### F-VINC-05 — Liberar de novo estende a mesma linha
**Esperado** "Acesso estendido por 12 meses." e **uma** assinatura ativa. O
índice `active_subscription_uidx` recusaria a segunda.

#### F-VINC-06 — Suspender
**Esperado** "Acesso suspenso."; o status vira `suspended` e **a vigência é
preservada** (R-VINC-18); o badge na lista vira "Suspenso"; o aluno volta a ser
mandado para a lista de espera.

#### F-VINC-07 — Vincular duas vezes
**Esperado** uma linha em `student_teacher_links`. Chamar `link_student` de novo,
com `request_id` novo, continua devolvendo o vínculo existente em vez de
esbarrar no índice `active_link_uidx`.

### F-PROF-09 — Revisões
Lista os blocos com **3 ou mais** baterias válidas e desempenho oficial
acumulado **abaixo de 80%**. É a mesma regra do reforço automático, que avalia
somente as questões `main`.

### F-CONTA-01 — O professor vê os próprios dados
**Esperado** `/professor/conta` abre a **mesma** tela de `/aluno/conta`, com o
nome preenchido e o texto do papel dele. Não é rota duplicada: são os mesmos
campos e o mesmo action, e o que muda é uma frase.

### F-CONTA-02 — Salvar um nome novo
**Esperado** "Dados atualizados" e o nome muda **na sidebar** sem recarregar. A
revalidação que o `useFormActionState` dispara ao ver `success` re-roda o loader
do layout, que é quem alimenta a sidebar.

### F-CONTA-03 — Nome curto demais
**Esperado** "Informe seu nome completo." e a sidebar intacta. A tela exige 3
caracteres e a `check` da tabela exige 2: a tela é mais estrita de propósito.

### F-CONTA-04 — O e-mail é bloqueado nas duas telas
**Esperado** o campo vem desabilitado para os dois papéis, com a frase de cada
um. A frase agora é sustentada pela fronteira: `contact_email` saiu do
`grant update` (`supabase/tests/14_profile_grants.sql`).

### F-RESU-06 — O resumo da bateria na ficha
**Esperado** o professor abre "Ver tópicos" no cartão "Baterias" e vê o mesmo
resumo. Só bateria `completed` oferece o link: anulada saiu do desempenho, e
mostrá-la contradiria a tela que a anulou.

### F-TEMP-06 — As três leituras na ficha do aluno
**Esperado** o professor vê tempo, sequência e série do aluno, com os mesmos
números que o aluno vê. Nenhuma policy nova: `vw_study_time` tem
`security_invoker` e as tabelas base já passam por `can_view_context`.

### F-REVE-01 — O professor define o espaçamento
**Esperado** a disciplina aparece com "sem revisão programada"; preenchidos os
dois campos e salvo, a página anuncia "Espaçamento salvo" e a grade do aluno
passa a mostrar as revisões.

**`teacherPage` e `studentPage` embrulham a MESMA Page.** Pedir os dois no mesmo
teste faz o segundo login sobrescrever o primeiro, e a tela do professor abre
como aluno — sem erro visível, só um cartão que não existe. Troca de identidade
é `signIn`, explícita.

### F-REVE-04 — Disciplina sem espaçamento
**Esperado** ela **não** entra na grade do aluno, e aparece na tabela do
professor com os campos zerados e "sem revisão programada". Grade vazia com dez
disciplinas listadas seria ruído.

### F-REVE-05 — Espaçamento fora da faixa
**Esperado** 61 é recusado com "entre 0 e 60" e nada é gravado. O formulário é
`noValidate` de propósito: a validação nativa bloquearia o submit e a action
nunca rodaria, deixando a tela muda. Quem garante é a `check` do banco.

### F-REVE-07 — Isolamento do espaçamento
**Esperado** o professor sem vínculo abre a ficha e não vê nem o aluno nem a
disciplina. Não existe status 404 neste servidor: verifica-se a TELA e a
ausência do dado no HTML.

**A garantia de RLS não é testável por aqui.** `asUser` do e2e conecta como
superusuário, que não exerce policy nenhuma; quem prova o isolamento é
`supabase/tests/11_review_spacing.sql`, que roda como `authenticated`.

### F-DIFI-01 — Dificuldades por tópico na ficha
**Esperado** o cartão "Dificuldades por tópico" lista um tópico por linha, **do
que mais errou para o que menos errou**, com o bloco de origem, respondidas,
erros, em quantas baterias houve erro, questões distintas erradas e o acerto.

O cenário erra dois tópicos numa bateria e um deles de novo na seguinte, usando
`incorrectTopics` do `completeQuiz`: a fila é montada pelo rodízio por tópico
(F-TOPI), então **"as N últimas" não diz em que assunto o aluno errou**. Um
teste de dificuldade precisa nomear o assunto, não a posição.

### F-DIFI-02 — Recorrente é erro em duas baterias distintas
**Esperado** o tópico errado nas duas baterias vem com o badge "Recorrente" e
"em 2 bateria(s)"; o errado numa só vem sem o badge e com "em 1 bateria(s)".
Errar duas vezes na mesma bateria pode ser o enunciado; em duas diferentes, é a
matéria.

### F-DIFI-03 — Tópico sem erro não aparece
**Esperado** o tópico respondido e todo certo **não** tem linha, e a bateria
inteira certa deixa o cartão com "Nenhum erro registrado ainda". A tela responde
"onde está o problema", e 100% não é problema (R-DIFI-07). Quem esconde é a
leitura, não a view: `vw_topic_difficulty` descreve, a tela decide.

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
| `npm run db:test` | 141 invariantes de banco: fluxo completo com replay em cada RPC, RLS entre dois alunos, ciclo de reforço, recorte por fase, escrita do professor, preferência de interface, conclusão de meta, vínculo e acesso, estudo extra |
| `npm run test:e2e` | volta completa da extensão sem navegador, contra o Supabase local |
| `npm run check` | typecheck, lint e os testes de unidade de `packages/protocol` e `apps/web` — inclui a classificação da turma em `lib/domain/students.test.ts` |
| `npm run e2e` | 259 testes num Chromium de verdade — este catálogo, implementado |

O que nenhum dos três primeiros alcança é a camada de interface e de fluxo, que
é justamente onde vivia todo bug de [`bugs-encontrados.md`](bugs-encontrados.md).
É o que `apps/e2e` cobre:

| Arquivo | Fluxos | Testes |
|---|---|---|
| `tests/auth.spec.ts` | §1 inteira, F-AUTH-01 a 12 | 47 |
| `tests/student.spec.ts` | §2 inteira, mais F-BAT-14, F-CONC-01 a 06, F-EXTRA-01 a 06 e F-RCIC-01 a 06 | 59 |
| `tests/quiz.spec.ts` | §3 pelo lado do site: F-BAT-01/02/09/10/11/12/13/15/16/17 | 15 |
| `tests/extension.spec.ts` | §3 pelo lado da extensão: F-BAT-03/05/06/07/08/16/18/19 e F-FASE-01 a 06, mais a volta completa | 15 |
| `tests/teacher.spec.ts` | §4 inteira, F-PROF-01 a 09, F-VINC-01 a 07, F-GPLAN-01 a 07, F-CAD-01 a 06, F-ANUL-01 a 05, F-TURMA-01 a 05 e F-PREV-01 a 06 | 71 |
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

O catálogo completo do que a versão anterior fazia e ainda não existe está em
[`inventario-v96.md`](inventario-v96.md), com a fila de reconstrução.

### Reservados pela spec 28 — painel arrastável e resumo por tópicos

Spec: [`specs/28-painel-arrastavel-e-topicos.md`](specs/28-painel-arrastavel-e-topicos.md).
Migram para a §3 quando os testes existirem.

- **F-PAIN-01** — arrastar move o painel, e a posição sobrevive à navegação.
- **F-PAIN-02** — o painel não sai da tela.
- **F-PAIN-03** — minimizar reduz a um botão, e restaurar traz de volta.
- **F-PAIN-04** — o estado minimizado sobrevive à navegação.
- **F-PAIN-05** — o resumo por tópicos aparece com as respostas.
- **F-PAIN-06** — clicar num botão do painel não vira arrasto.


















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
