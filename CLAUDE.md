# Regras de desenvolvimento

Convenções deste repositório. A arquitetura e o porquê de cada limite estão em
[`docs/arquitetura.md`](docs/arquitetura.md) — leia antes de mexer em fronteira
entre pacotes.

---

## Idioma

**Identificadores em inglês. Texto em português.**

| Em inglês | Em português |
|---|---|
| variáveis, funções, tipos, arquivos | comentários |
| tabelas, colunas, enums e seus valores | mensagens de `raise exception` |
| funções e parâmetros SQL | texto de interface |
| chaves de JSON expostas em API | descrições de teste |
| nomes de constraint, índice e policy | documentação |

O produto é para concurseiros brasileiros e o time é brasileiro: o que a pessoa
lê fica em português. O que o compilador lê fica em inglês.

Cuidado com palavras que traduzem para duas coisas diferentes conforme o
contexto. Já aconteceu duas vezes:

- `fase` → `stage` (fase do concurso, em `study_plans`) mas `phase` (fase da
  questão, no ledger);
- `resultado` → `outcome` (acerto/erro, no ledger) mas `result` (o retorno
  guardado de uma RPC idempotente — a tabela `operations` que o guardava saiu no
  schema de 14/09/2026; o par de traduções, não).

---

## Comandos

```bash
npm install
npm run db:start      # Supabase local (exige Docker)
npm run dev           # site em http://localhost:3000 (Vite)

npm run check         # typecheck + lint + testes de todos os pacotes
npm run db:test       # recria o banco e roda as suítes de invariante
npm run db:reset      # recria o banco: migration + seed
npm run db:types      # regenera packages/database a partir do schema local

npm run e2e           # suíte Playwright, modo rápido
npm run e2e:video     # a mesma suíte, gravando .webm por teste
```

---

## Banco

> **O perfil nasce com a conta, e nasce sem professor.**
> `app_private.create_profile_for_new_user`, em `auth.users`, cria a linha em
> `profiles` — sempre ALUNO, sempre `pending`, sempre `teacher_id` nulo. Ele
> **não lê `role` do metadado**: `raw_user_meta_data` é escrito pelo cliente na
> chamada de cadastro, e quem mandasse `{"role":"teacher"}` nasceria professor.
> Promover é trabalho privilegiado, no mesmo lugar onde liberar acesso mora.
>
> A regra de origem — anexar quem se cadastra ao professor MAIS ANTIGO da base
> — morreu com a migration `20260914190000`: o vínculo é ato de alguém, não
> efeito colateral de um `order by created_at limit 1`. Em troca,
> `waitlist.teacher_id` é **nulável**: é a fila de quem ainda não tem professor.
>
> **Quem faz o vínculo é `link_student`**, de `20260918120000`, e o professor
> acha o aluno pelo e-mail INTEIRO (`find_student_by_email`). NÃO EXISTE LISTA
> DE CANDIDATOS: a cláusula que deixava `waitlist_select` mostrar a fila sem
> dono a qualquer professor saiu junto, porque uma lista de nome, e-mail,
> WhatsApp e nascimento de quem ainda não é aluno de ninguém é um diretório com
> outro nome. Casar por prefixo, também não — é enumeração com outro nome.

O de-para coluna a coluna, contra o banco de origem, está em
[`docs/de-para-schema.md`](docs/de-para-schema.md).

**A fronteira da escrita é entre planejar e executar.**

| | Quem escreve | Como |
|---|---|---|
| `study_plans`, `study_plan_notebooks`, `goals` | professor | direto, com RLS e grant por coluna |
| `goal_entries`, `theory_progress`, `theory_reviews` | o aluno, com acesso vigente | direto, com RLS e grant por coluna |
| `theory_catalogs`, `theory_lessons`, as três de regra | professor | direto, com RLS |
| `profiles` (só `name`), `waitlist` | o próprio dono | direto, com RLS |
| `profiles.access_status`, `access_expires_at`, `teacher_id` | ninguém | fora de todo grant: `link_student` e `set_student_access` |
| `profiles.role` | ninguém | fora de todo grant, e **sem RPC**: promover é spec própria |
| `access_grants` | ninguém | SELECT e nada mais: escrita é de `set_student_access` |
| `classes`, `class_students` | professor | direto, com RLS e grant por coluna |
| `catalog_blocks` | ninguém | leitura para autenticado; carga por `service_role` |
| `coupons` | ninguém | RLS ligada, zero policy, zero grant |
| `quiz_sessions`, `quiz_session_questions`, `reinforcement_cycles` | ninguém | SELECT e nada mais: escrita é de RPC |

Escrita de execução continua fechada porque é onde moram a máquina de estados,
a idempotência por `request_id` e o ledger append-only — coisas que uma tela
não tem como respeitar sozinha. Se uma tela precisa mexer em execução e não
existe RPC, **crie a RPC; não afrouxe o grant.** As três operações que hoje não
têm RPC lançam com o motivo em `apps/web/src/lib/api/supabase/`, e é assim que
devem continuar até a RPC existir.

**Turma é planejamento, e por isso NÃO tem RPC.** `classes` e `class_students`
têm as três defesas montadas desde a migration inicial — `WITH CHECK`,
`is_teacher_of` conferindo pelo ALUNO, e a FK composta `(class_id, teacher_id)`
conferindo a turma de destino. Uma RPC ali não acrescentaria garantia nenhuma, e
acrescentaria superfície. O que mora no banco é o que não cabe numa tela: um
aluno em uma turma só (`class_students_one_per_student_uidx`) e turma com aluno
dentro que não se apaga (`protect_class_with_students`).

Três defesas sustentam a escrita direta, e as três precisam continuar valendo
em qualquer tabela nova:

1. **`WITH CHECK` em todo INSERT e UPDATE**, amarrando a linha a quem escreve —
   e, quando o alvo é aluno de professor, a `is_teacher_of`, que confere o
   vínculo pelo ALUNO e não pelo `teacher_id` que quem escreve escolheu.
2. **`GRANT UPDATE` por coluna.** As colunas de contexto — `student_id`,
   `teacher_id`, `study_plan_id`, o `goal_id` de `goal_entries` — ficam de fora
   do grant. A RLS decide QUAL LINHA, nunca QUAL COLUNA: sem o grant por coluna,
   um UPDATE legítimo carrega junto a troca de dono.
3. **FK composta em todo contexto denormalizado.** `(study_plan_id, teacher_id,
   student_id)` e parentes. A FK de coluna única garante que a linha EXISTE, não
   que ela é de quem está escrevendo — foi assim que um aluno lançava registro
   na meta de outro.

**`DELETE` é concedido, e quem o restringe é a policy.** Mudou em 14/09/2026: o
schema anterior não concedia DELETE em lugar nenhum e removia por `deleted_at`.
Hoje o professor apaga o que planejou, o aluno apaga só o que ele mesmo criou
(`goals_delete` decide pelo `type`), e o que não pode sumir do histórico —
`profiles`, `quiz_sessions`, o ledger, `access_grants`, `catalog_blocks`,
`coupons` — simplesmente não tem DELETE para `authenticated`. Caderno continua
sendo removido por marca (`study_plan_notebooks.deleted`), porque meta antiga
aponta para ele. Matrícula em turma, ao contrário, é apagada mesmo:
`class_students` não é histórico, e guardar "em que turma o aluno estava no
primeiro semestre" exigiria coluna de saída que ninguém pediu.

**Cuidado ao testar RLS: `UPDATE` e `DELETE` filtram em silêncio.** A linha não
fica visível para a operação e o comando afeta zero linhas, sem erro. Só o
`WITH CHECK`, no INSERT e no UPDATE, levanta `42501`. Um teste que espere
exceção num UPDATE bloqueado passa por engano no dia em que a policy sumir —
conte linhas com `get diagnostics ... row_count`. Privilégio de COLUNA é o
oposto: levanta `42501` sempre, mesmo sem linha nenhuma casando.

**`quiz_session_questions` é o ledger e a única fonte de desempenho da
bateria.** É append-only, sem policy de INSERT, UPDATE ou DELETE. Nunca crie
coluna de contador mantida à mão: o problema da versão anterior não era ter
agregados, era ter três caminhos independentes escrevendo o mesmo número — os
nove contadores de `baterias` deram lugar a `vw_quiz_session_performance`.

**Toda RPC mutante precisa ser segura a retentativa.** As duas que existem —
`link_student` e `set_student_access`, de `20260918120000` — nasceram assim, uma
em cada forma:

- **Com payload** — recebe `request_id`, grava-o numa coluna única e compara o
  payload guardado: mesmo id e mesmo payload devolve o resultado anterior sem
  reexecutar; payload diferente é rejeitado. É `set_student_access`, e o que a
  sustenta é `access_grants_request_uidx`. O payload guardado são as PRÓPRIAS
  colunas (`student_id`, `action`, `months`): repeti-lo num `jsonb` ao lado
  seria um segundo caminho afirmando o mesmo fato.
  `quiz_sessions.finish_request_id` (UNIQUE) e `finish_payload` são as colunas
  que o schema reserva para a próxima.
- **Naturalmente idempotente** — `link_student` não recebe `request_id`, porque
  não há payload a comparar: o único parâmetro já é a identidade do alvo. Quem
  garante é a COLUNA `profiles.teacher_id`, que cabe um valor só, com a escrita
  num `update ... where teacher_id is null` único. O mesmo vale para o segundo
  "iniciar" da mesma meta, que o índice `quiz_sessions_one_open_per_plan_uidx`
  vai garantir.

RPC nova que grava e aceita payload entra na primeira forma. Se você acha que
ela é naturalmente idempotente, **diga qual índice ou constraint sustenta isso**
— idempotência que mora só no código volta a falhar na primeira condição de
corrida.

**O que não pode sumir do histórico usa `ON DELETE RESTRICT`**, não `SET NULL`:
uma bateria que perde o vínculo com a meta vira dado órfão que nenhuma tela
consegue explicar. `quiz_sessions` referencia `profiles` e o caderno assim, e
`access_grants` referencia `profiles` pelo mesmo motivo — liberação órfã não
responde "quem liberou este aluno".

**Nenhum dado de domínio em texto livre.** Tipo, origem e flag são enum ou FK.
A versão anterior codificava `TIPO_REFORCO:1` e o resultado inteiro de uma
bateria em base64 dentro do campo de observações, e o round-trip destruía texto
a cada gravação.

**Invariante que dá para expressar em constraint vai para o banco.** Um
planejamento ativo por aluno é índice único parcial, não uma sequência de
`UPDATE` no cliente.

**Contexto denormalizado é protegido por FK composta.** `student_id` e
`teacher_id` são repetidos nas tabelas filhas porque a RLS precisa, mas a FK
composta garante que a cópia nunca diverge do pai.

### Migrations

**O schema já está implantado.** `20260914150000_initial_schema.sql` é a
migration única desta reimplementação, aplicada em staging em 14/09/2026, e
está **congelada**: migration nova sempre, nunca reescreva um arquivo já
aplicado em qualquer ambiente. A regra anterior — editar a migration única no
lugar enquanto nada estivesse no ar — deixou de valer.

**O congelamento já foi quebrado uma vez, de propósito.** O commit `7c597cc`
apagou as doze migrations de 22/08 a 31/08 — todas já aplicadas em staging — e
as substituiu por este arquivo único. Era a reimplementação inteira do schema
em inglês, com a auditoria do banco de origem aplicada, e isso não cabe em
migration incremental. A conciliação foi recriar o banco de staging do zero,
com `supabase db reset --linked --no-seed`.

**Isso não abre precedente, e o motivo é o custo do acerto.** O reset apagou
tudo, inclusive o schema `auth`: staging saiu sem nenhum usuário, e quem for
usar o ambiente precisa cadastrar um professor de novo. Foi aceitável porque
staging é descartável e o que havia lá era dado de teste. O mesmo movimento em
produção exigiria um script de migração de dados, que não existe — o que existe
é o de-para em [`docs/de-para-schema.md`](docs/de-para-schema.md), que é insumo
para escrevê-lo, não substituto.

- Rode `npm run db:types` depois de **toda** alteração de schema. O arquivo
  gerado é versionado: o CI precisa dele sem subir um Supabase, e o diff mostra
  o impacto na superfície de tipos.
- Toda view precisa de `with (security_invoker = true)`. Sem isso ela roda com
  privilégio do dono e vaza dados entre alunos.
- **Função nova precisa de `revoke execute ... from public`.** O default do
  Postgres concede `EXECUTE` a `PUBLIC`, que não é `anon` nem `authenticated`:
  revogar dos dois papéis não tira nada, porque o privilégio vem do grantee
  vazio que ambos herdam. Foi assim que `reserve_operation` ficou chamável por
  qualquer autenticado apesar do `revoke` e do comentário dizendo o contrário —
  BUG-14. A função era do schema anterior e não existe mais; a regra que ela
  custou, sim. Depois do revoke, conceda nominalmente só às funções que são API.
- **Toda função precisa de `set search_path = ''`**, inclusive as de gatilho.
  Duas escaparam disso na primeira migration inicial, e uma delas era a que
  sustentava o ledger append-only. Em `20260914150000` as oito têm.

**`gen types --linked` e `--local` não produzem arquivos idênticos, e isso não
é drift.** O gerador contra a nuvem emite um bloco `__InternalSupabase` com
`PostgrestVersion` que o local não emite. Fora dele os dois são iguais. Não
regenere o arquivo versionado a partir do remoto: `npm run db:types` é
`--local`, gere localmente e commite. Contra a nuvem, use o diff só para
conferir:

```bash
supabase gen types typescript --linked --schema public | diff - packages/database/src/schema.gen.ts
```

---

## A extensão foi removida

`apps/extension` e `packages/protocol` não existem mais. A extensão conduzia a
bateria de questões dentro do TEC Concursos; o site montava o payload, ela
respondia, e o resultado voltava pelo fragmento da URL.

O que **saiu junto**, para que ninguém vá procurar: `QuizResultHandler`,
`StartQuizButton`, `startQuizSession`, `submitQuizResult` e os dois leitores de
catálogo que alimentavam o payload (`getBlockQuestions`, `getQuestionHistory`).

O que **ficou de pé**, e é onde uma execução nova se apoia:

- **o banco inteiro** — `quiz_sessions`, o ledger `quiz_session_questions`,
  `start_quiz_session`, `finish_quiz_session`, `record_quiz_session_time` e
  `void_quiz_session`. Nenhuma migration foi escrita para desfazer nada;
- **o fechamento da bateria na tela do aluno** — registrar tempo e cancelar,
  que é o que destrava um planejamento com sessão aberta;
- **o caderno de erros e o reforço**, que linkam para o TEC como páginas
  comuns. `TEC_QUESTION_URL` continua sendo isso, e só isso.

A tela do aluno hoje **não tem por onde começar uma bateria**. É deliberado: o
caminho novo ainda vai ser desenhado, e um botão que abre sessão sem ter onde
respondê-la só produziria sessão travada.

---

## `request_id` gerado uma vez, na origem

Era a terceira de três ordenações que não podiam inverter; as outras duas
viviam na extensão (persistir antes de limpar a hash, aguardar a gravação antes
de navegar) e saíram com ela. Esta continua valendo, e continua correspondendo
a uma perda silenciosa de bateria já respondida na versão anterior — o dado
mais caro do sistema, porque custa uma hora de estudo do aluno e não pode ser
recriado.

Gerar o `request_id` no ponto de uso transforma a proteção do servidor em
decoração: cada tentativa chega ao banco como operação nova, e `finish_quiz_session`
grava duas vezes o que deveria gravar uma.

---

## Armadilhas já verificadas nas ferramentas

**React Router 8** — leia `node_modules/react-router/docs/` antes de escrever
rota. O pacote traz a documentação dele, e a versão é posterior ao conhecimento
de modelo. Já confirmados:

- o site usa o **modo data**: `createBrowserRouter` mais `RouterProvider`, que
  vem de `react-router/dom` e não de `react-router`;
- a propriedade da rota é `Component` (maiúscula) e o limite de erro é
  `ErrorBoundary`, não `element`/`errorElement`;
- `useFormAction` JÁ É um export do react-router. O hook desta base chama-se
  `useFormActionState` — nomear o seu de `useFormAction` compila e importa o
  errado;
- `redirect()` devolve uma Response e precisa ser **lançada** de dentro do
  loader. Um `return` vira o valor de retorno da função e o loader segue em
  frente;
- `useNavigate` e o `revalidate` de `useRevalidator` são estáveis dentro de uma
  rota de dados (memoizados no router, que é criado fora do React). Podem
  entrar em lista de dependências de efeito sem provocar laço — e guardá-los em
  ref escrito durante o render é o que o React Compiler recusa.

**O `redirect` do router descarta o fragmento.** Um redirecionamento HTTP
preserva o `#` por conta do navegador; este monta a URL nova só com o caminho.
`requireSession` concatena `location.hash` de propósito. O motivo original era
a volta do TEC com a sessão expirada, em que o fragmento era a única cópia do
resultado da bateria; esse caminho saiu com a extensão, mas a concatenação fica
— descartar fragmento num redirecionamento de login é perda de estado em
qualquer rota que venha a usá-lo.

**Vite só injeta variável de ambiente com prefixo `VITE_`,** e só quando o
acesso é literal: `import.meta.env.VITE_X`. Indexar por variável compila para
`undefined` em produção, sem aviso.

**`@vitejs/plugin-react` 6 transforma com oxc, não com Babel.** O React
Compiler entra por `react({ compiler: true })` e exige `oxc-transform-react`
instalado — não é `babel-plugin-react-compiler`.

**O preset flat do `eslint-plugin-react-hooks` vive em `configs.flat`.** O
homônimo no topo do pacote ainda é eslintrc, com `plugins` como array de
string, e o ESLint 9 recusa com uma mensagem que não diz qual config está
errada.

**Node roda TypeScript em modo strip-only.** Só remove tipos, não gera código.
Nada de parameter property (`constructor(readonly x: T)`), `enum` ou
`namespace` — declare o campo e atribua no corpo. Imports usam extensão `.ts`
explícita, que é o que o runner nativo exige.

**`create or replace view` só acrescenta coluna no fim.** Inserir no meio é
lido como renomear a que estava na posição, e o Postgres recusa. Reordenar
exige `drop` e `create`, respeitando a ordem de dependência.

**Substituição de string em SQL não enxerga JSON com aspas duplas.** Um replace
de `'valor'` não pega `"valor"` dentro de um literal jsonb. Já quebrou o seed
duas vezes ao renomear valor de enum.

---

## Testes

`npm run db:test` recria o banco e roda as oito suítes de `supabase/tests/`, na
ordem: `00_fixtures` monta o cenário e as sete seguintes atacam uma DEFESA cada
— grant por coluna, isolamento de RLS, os gatilhos da meta, o perfil, a lista de
espera, a teoria e os invariantes do schema. Por defesa, e não por feature:
feature muda de nome e de tela, defesa não.

- **Encene quem está chamando com `app_test.act_as(<uuid>)`**, e não com
  `set_config('request.jwt.claim.sub', …)`. Os gatilhos de proteção leem o papel
  de `auth.jwt() ->> 'role'`: sem `request.jwt.claims` completo, `auth.jwt()`
  volta nulo, todo gatilho trata a sessão como MANUTENÇÃO e o teste passa sem
  exercitar nada. Teste que passa sempre é pior que teste nenhum.
- **Teste de estado proibido usa `raise exception` se o banco aceitar.** É o
  que faz a suíte falhar quando uma constraint desaparece, e não só quando o
  código quebra.
- **As suítes compartilham estado**, rodam em sequência na mesma base. O que uma
  apagar, a seguinte não encontra — por isso o cenário traz dois estudos extras
  para o aluno, um para ser apagado e um para sobreviver.
- **`db:test` apaga os usuários do seed.** Rode `npm run db:reset` depois, ou o
  login local para de funcionar.
- Testes de TypeScript ficam ao lado do código, em `*.test.ts`, e rodam pelo
  runner nativo do Node — que exige **Node 24** (ver `.nvmrc`): o Node do
  sistema pode ser um build sem suporte a TypeScript, e aí `node --test` falha
  com `ERR_NO_TYPESCRIPT` antes de rodar asserção nenhuma.

### Ponta a ponta, com navegador

`apps/e2e` roda a suíte Playwright contra o site. O catálogo de fluxos que ela
implementa é
[`docs/fluxos-e2e.md`](docs/fluxos-e2e.md); cada `describe` cita o código do
fluxo (`F-AUTH-04`, `F-BAT-09`, …) e, quando o teste existe por causa de um
defeito conhecido, o número do bug.

- **Cada teste cria o próprio par professor/aluno.** `createScenario()` gera
  usuário, vínculo, assinatura, planejamento, blocos e metas com UUID novo.
  Não use o aluno do seed, e não presuma base limpa: é o que permite a suíte
  rodar em paralelo sem `db:reset` entre testes.
- **Pré-condição vai pelas RPCs reais**, nunca por INSERT no ledger. É o que
  `fixtures/battery.ts` faz — se uma regra de negócio regredir, a
  pré-condição falha em vez de fabricar dado impossível.
- **`button[type=submit]` também casa o "Sair" da sidebar.** Escope todo
  clique de formulário em `.content` — e `.content` não basta onde a tela tem
  dois formulários. `/aluno/lista-espera` sem acesso liberado mostra o cadastro
  e o resgate de cupom: ali, clique pelo nome do botão.
- **O domínio do TEC é interceptado automaticamente**, em todo teste. Nenhuma
  requisição pode sair para o site de terceiro — o caderno de erros e o reforço
  ainda linkam para lá.
- **A fila de pré-condição é da suíte, não do produto.** `fixtures/questions.ts`
  substituiu o motor de seleção que vinha da extensão. Ela garante o que os
  testes pedem (não repetir questão entre baterias do mesmo bloco) e nada além
  disso; quando existir um motor novo, é ele que passa a ser exercitado ali.
- **`locator().all()` não espera por nada.** Devolve o que casa naquele
  instante. O site é uma SPA: o conteúdo só existe depois de os loaders da rota
  resolverem, o que é DEPOIS do evento `load` que o `goto` aguarda. Sem uma
  asserção que espere antes, `.all()` volta vazia, o laço não roda, e o teste
  falha acusando outra coisa — foi assim que dois testes de validação de
  formulário passaram a relatar "falta a mensagem de erro" quando na verdade o
  lote tinha sido criado.
- **Não existe status 404.** O servidor devolve o mesmo `index.html` para
  qualquer caminho. Teste de recurso inexistente ou alheio verifica a TELA e a
  ausência do dado no HTML, não `response.status()`.
- **`npm run db:test` antes de `npm run e2e` quebra o `global-setup`.** As
  suítes de invariante inserem blocos de catálogo reusando `catalog_key` e
  `block_key` do seed com ids diferentes; o `on conflict do nothing` do setup
  então pula a inserção e as questões batem em violação de FK. O comentário do
  `global-setup` afirma imunidade à ordem e não tem. Rode `npm run db:reset`
  entre os dois.

---

## A interface

**A UI não fala com o Supabase. Ela fala com um contrato.**

`apps/web/src/lib/api/` expõe funções tipadas por caso de uso — `loadWeek`,
`saveTheoryProgress`, `generateWeek`. Nenhum componente importa
`@supabase/supabase-js`, e nenhum componente sabe que existe uma tabela
`goals`. Duas implementações vivem atrás do contrato, e `VITE_API_IMPL` escolhe:
`fixtures`, em memória, e `supabase` — que é **o padrão** desde que a frente do
banco entregou o schema.

**O adaptador do Supabase cobre o contrato inteiro** — um módulo por assunto em
`lib/api/supabase/`, composto em `index.ts`. Três operações LANÇAM com o motivo
em vez de recusar educadamente, porque não são erro de uso: são coisas que este
schema não permite (anular bateria, resgatar cupom, selecionar matérias do
ciclo). **Eram cinco:** liberar e bloquear acesso saíram da lista em
18/09/2026, com `set_student_access`. Uma tela que finge ter tentado é pior do que uma que
explica, e a recusa muda no dia em que o banco mudar.

**`VITE_API_IMPL=fixtures` continua servindo** para construir tela sem banco no
ar. As duas implementações compartilham `lib/api/validation.ts`, então recusam
com a mesma frase.

**Validação de formulário é do contrato, não de quem o cumpre.** As regras e as
frases moram em `lib/api/validation.ts`, e as DUAS implementações chamam as
mesmas funções. Sem isso a fixture recusa nome curto com uma frase, o Supabase
com outra, e o teste que fixou a primeira passa a mentir.

Existe porque a reconstrução da v2 e a reescrita do banco correm em paralelo.
Sem a camada, cada tela nasceria acoplada a um schema que ainda vai mudar, e a
integração seria um segundo reescrever — de telas, não de adaptadores.

- **`contract.ts` é o pedido formal ao banco.** Operação que a UI precisa e o
  schema não cumpre é resolvida no schema ou no contrato, nunca num `any` no
  meio do caminho. As lacunas conhecidas estão no cabeçalho do arquivo.
- **Leitura lança; escrita devolve `Result`.** Loader que falha é trabalho do
  `ErrorBoundary` da rota. Erro de escrita — acesso vencido, meta já concluída
  noutra aba — é caminho normal, e `throw` obrigaria cada formulário a um
  try/catch que ninguém lembra de escrever.
- **`fixtures` muta e recusa.** Um mock que devolve sempre o mesmo objeto
  esconde os defeitos que a UI tem: revalidação que não roda, lista que não
  reordena, contador que não soma. E um que aceita tudo faz o caminho de erro
  nascer sem tela.
- **`fixtures.test.ts` é a especificação executável do contrato.** Cada
  asserção é uma promessa que o adaptador do Supabase vai ter de cumprir igual.

### Tema

**O tema vem da conta, e o MUI não participa da decisão.**

**HOJE ELE NÃO TEM ONDE MORAR NA CONTA.** `user_preferences` saiu no schema de
14/09/2026 e nada a substituiu — é a lacuna nº 1 de `lib/api/contract.ts`, e o
pedido à frente do banco é uma coluna `theme_preference` em `profiles`.
Enquanto ela não existe, `supabaseApi` guarda a escolha no APARELHO, pelo mesmo
`lib/theme.ts` que pinta antes do primeiro paint. A consequência a dizer em voz
alta: quem escolhe escuro no computador continua vendo claro no celular, e
R-TEMA-11 está suspenso — com F-TEMA-02 e F-TEMA-04 marcados `fixme` para que a
falta continue visível na saída da suíte.

**`null` é "nunca escolheu", e não se grava.** A ausência equivale a claro
(R-TEMA-07), mas não é a mesma coisa que ter escolhido claro: gravar `light` na
primeira visita transformaria toda abertura numa escolha que ninguém fez.

Quem escreve `data-theme` no `<html>` é `lib/theme.ts` — o script embutido de
`index.html` antes do primeiro paint, e o loader do layout logo depois. O tema
de `@bora/ui` usa `colorSchemeSelector: 'data-theme'`, então ele GERA as duas
folhas de variável (`:root, [data-theme="light"]` e `[data-theme="dark"]`) mas
não escolhe qual vale.

O desligamento é explícito em `RootLayout`: `colorSchemeNode={null}`,
`storageManager={null}`, `storageWindow={null}`. Sem as três, o
`useColorScheme` do MUI leria `mui-mode` do `localStorage` na montagem e
sobrescreveria, na frente de quem escolheu, o tema que veio da conta.

**Consequência ao escrever override: `theme.palette.*` congela no
`defaultColorScheme`.** Cor sempre por `theme.vars.palette.*`, que é CSS
variable e troca junto com o atributo, sem re-render de árvore.

**Nada de `transition` no `body`.** Havia ali `background-color, color`, e as
duas quebravam. `color` é HERDADO: animá-lo no `body` anima a cor de cada nó de
texto ao mesmo tempo, e durante os 180ms o texto não é de nenhum dos dois temas
— o F-TEMA-07 chegou a medir 2.33:1 num título que, parado, dá 18:1. E a
transição pega a PRIMEIRA aplicação do estilo, não só a troca: o Emotion injeta
o estilo do `body` e as variáveis de cor em tempo de execução, e se o `body`
chega primeiro o fundo desliza do branco para o preto — a piscada que o script
embutido de `index.html` existe para impedir. Transição continua onde vale:
hover, foco, largura da barra lateral.

### Tipografia

**DM Sans no texto, DM Mono no número** — o par da v2, auto-hospedado por
`@fontsource`. Nenhuma requisição sai para `fonts.googleapis.com`, e não é
preferência: a suíte e2e proíbe rede externa.

- **DM Mono não tem negrito.** Publica 300, 400 e 500, e nada além. A v2 pedia
  700 em 19 dos 56 lugares onde usa o mono, e o navegador sintetizava um
  falso-negrito — traço engordado de forma irregular, justamente no que precisa
  ser lido com precisão. Todo peso de mono passa por `monoWeight`.
- **O mono é a face dos números, não enfeite.** É o que faz coluna de
  porcentagem e de tempo alinhar. `Chip`, `Badge` e a variante `numeric` já
  apontam para ele.
- **A raiz fica nos 16px do navegador.** A v2 usava `html{font-size:14px}`;
  fixar a raiz sequestra a preferência de quem aumentou a letra e redefine o
  que `rem` significa para o MUI, que calcula presumindo 16. A densidade vem da
  escala: `body1` é `0.875rem`.

### Gráficos

**Uma série por gráfico, e uma cor por série.** Duas medidas de escalas
diferentes viram dois gráficos, nunca dois eixos y — a sobreposição de duas
escalas inventa uma correlação que o dado não tem. Pintar a barra maior mais
escura gasta o único canal livre repetindo o que o comprimento já diz.

**A cor da série foi VALIDADA, não escolhida.** `chart.series` é o petróleo 600,
e é o único degrau da escala que passa nas seis checagens do método — faixa de
luminosidade, piso de croma, contraste — contra o branco E contra o preto. O 700
reprova o piso de croma e lê como cinza num traço fino; o 400 sai da faixa no
escuro. Antes de trocar, rode o validador; não confie no olho.

**Menos de dois pontos não é gráfico, é número.** `BarChart` e `LineChart` caem
para `SinglePoint` sozinhos: uma barra só ocupa a largura inteira e não compara
nada com nada.

**Toda figura tem tabela.** É o que sustenta leitor de tela, impressão em preto e
branco, e quem só quer o número.

### A casca e as primitivas

**`packages/ui/src/primitives` é de todo mundo; `apps/web/src/components` é da
aplicação.** `Card`, `PageHeader`, `Metric`, `Empty`, `Badge`, `DayChip`,
`Alert` e `Field` são as caixas que a v2 repete em toda tela, e a área do
professor usa as mesmas da do aluno. Cada uma carrega o próprio `data-testid`:
é isso que permite reescrever o interior sem reescrever a suíte.

**A barra lateral tem DUAS noções de recolhida, e elas não são a mesma.**
`collapsed` é a preferência do aparelho, em `localStorage`; `compact` é o que a
barra mostra. Abaixo de 820px — o breakpoint da v2 — `compact` é imposto e a
preferência continua guardada, para voltar a valer quando a janela crescer.
Recolher por falta de espaço não pode apagar a escolha de quem usa monitor
grande.

**`ErrorBoundary` de área fica numa rota SEM CAMINHO, dentro do layout.** O
React Router substitui pelo boundary o elemento da rota que o DECLARA, não o da
rota que falhou: declarado no próprio layout, um erro de loader de tela apagava
a barra lateral junto, e a pessoa perdia a navegação no momento em que mais
precisa dela — para sair dali.

### `data-testid` nos seletores de teste

**Casar por classe CSS é casar com o que não é contrato.** As classes de
`globals.css` somem junto com as telas antigas, e as que o MUI gera mudam
quando o Emotion decide que mudam.

O testid nomeia o PAPEL; o que varia entra num `data-*` ao lado:

```tsx
<div data-testid="alert" data-status="success">…</div>
<tr  data-testid="goal-row" data-goal-id={goal.id} data-status={goal.status}>
```

Um testid por componente, não um por combinação — `alert-success` e
`alert-error` seriam dois nomes para a mesma caixa. Em kebab-case, em inglês, e
sem o nome da tela: `goal-row` serve ao aluno e ao professor. Os localizadores
ficam em `apps/e2e/support/ui.ts`.

**A conversão acontece na fase em que a tela é reescrita**, nunca antes nem
depois: converter cedo deixa a suíte testando o que vai sumir, converter tarde
deixa a fase sem rede. **Está feita:** `grep -c 'locator("\.'` em `apps/e2e` dá
zero.

**`teacherPage` e `studentPage` SÃO A MESMA ABA.** Os dois derivam do `page`
embutido, e pedir os dois na assinatura de um teste faz o segundo login
sobrescrever o primeiro EM SILÊNCIO — o teste então navega como o papel errado e
falha acusando outra coisa. Quem precisa dos dois troca de identidade com
`signIn`, na ordem que quiser.

**`count()` não espera por nada**, como `.all()`. Ponha uma asserção que espere
antes de contar, senão o contador lê zero e o teste acusa "sem resultado" quando
o que faltou foi esperar os loaders da rota.

### Contraste

`packages/ui/src/contrast.test.ts` mede os tokens na aritmética; `F-TEMA-07`
mede a página de verdade. Os dois valem, e o primeiro falha no commit em que
alguém trocar um papel de cor, antes de a tela existir.

**Borda de cartão e limite de CONTROLE são coisas diferentes.** A WCAG 1.4.11
pede 3:1 em componente de interface e nada em cartão. `surface.border` é
acabamento; `surface.controlBorder` é o cinza opaco que identifica campo e
botão. Usar o primeiro num campo reprova.

**Preenchimento com texto branco escurece no hover; com texto escuro, clareia.**
O petróleo clareando dava 3.88:1 com branco por cima. A direção do hover segue
a cor do texto, não o hábito.

---

## O relato de erro

**Sentry, só no navegador.** O porquê de cada decisão está em
[`docs/arquitetura.md`](docs/arquitetura.md#o-relato-de-erro). O que muda o jeito
de escrever código aqui:

**`lib/observability.ts` liga por EFEITO DE IMPORTAÇÃO, e o `main.tsx` o importa
primeiro.** Não mova, e não transforme numa função chamada no corpo do
`main.tsx`. Importação é hoisted: `import { router }` avalia `lib/env.ts`, que
LANÇA quando falta uma `VITE_*`, antes da primeira linha do corpo. Um `init` no
corpo nunca rodaria no deploy compilado sem as variáveis — que é a tela branca,
e o erro que mais interessa relatar. Pelo mesmo motivo o módulo não importa
`@/lib/env`, e importa `@/lib/api/contract` e não `@/lib/api`.

**Erro de loader NÃO chega em `window.onerror`.** O React Router em modo data
captura e renderiza o `ErrorBoundary`; os manipuladores globais do SDK não veem
nada. Quem relata é `routes/RouteError.tsx`, explicitamente. Rota nova que
declare o próprio `ErrorBoundary` sem passar por lá nasce sem relato.

**Erro de escrita NÃO é lançado** — o contrato devolve `Result`. Quem relata é
`fail`/`failure` em `lib/api/supabase/errors.ts`, quando o código é `unknown`.
Adaptador novo que monte o `Result` na mão, sem passar por essas duas funções,
grava um erro que ninguém vai ver.

**Filtre por `ApiErrorCode`, nunca pela mensagem.** `throwDb` e `readFailure`
lançam `ApiThrownError` justamente para o código sobreviver ao `throw`. Casar a
frase em português acopla o filtro a texto de interface, e ele se desliga
sozinho no dia em que alguém melhorar a copy.

**`VITE_SENTRY_DSN` fica VAZIO em desenvolvimento e na suíte e2e** — inclusive
no seu `.env.local`. Com o DSN vazio o SDK é removido do bundle na compilação,
não só desligado; preenchê-lo faz a suíte despejar erro sintético no painel do
ambiente publicado. `F-OBS-01` confere que nada sai.

**Sourcemap só existe quando há `SENTRY_AUTH_TOKEN`.** `wrangler` publica o
`dist` inteiro, sem filtro: gerar sem ter para onde enviar é publicar o
código-fonte. Não ligue `build.sourcemap` incondicionalmente.

**Nada de dado pessoal.** `sendDefaultPii: false` e identidade só por
`profileId`. Session Replay e tracing estão fora, e a decisão é de privacidade —
não a reabra sem decidir de novo.

---

## Deploy

**`main` publica staging a cada commit. Produção é disparo manual.**

| Ambiente | Gatilho | Workflow |
|---|---|---|
| staging | push em `main` | `.github/workflows/deploy-staging.yml` |
| produção | `workflow_dispatch` | `.github/workflows/deploy-producao.yml` |

O plano inteiro, com o porquê de cada decisão, está em
[`docs/deploy-staging.md`](docs/deploy-staging.md).

**Toda migration precisa ser compatível com o bundle que já está no ar.** Em
staging o banco sobe minutos antes do site; entre um commit e o deploy manual
de produção podem passar dias e dezenas de commits. Coluna nova nasce
`nullable` ou com default; RPC nova não substitui a antiga no mesmo commit.

**Banco antes de site, e essa ordem não pode inverter** — o bundle novo é quem
chama a RPC nova. Ela tem um custo conhecido: se o job `site` falhar, o banco
já mudou e o bundle antigo continua no ar. É a regra de compatibilidade acima
que segura o estrago.

**O gate de qualidade é um workflow reusável só.** `ci.yml` é chamado pelos dois
deploys por `workflow_call`; não copie os steps dele para outro arquivo. Gate
copiado deriva, e um gate que derivou em silêncio deixa staging publicar o que
o `npm run check` reprova.

**Produção só publica commit que já esteve na `main`.** O job `resolver` valida
com `git merge-base --is-ancestor` antes de qualquer coisa acontecer. A
deployment branch rule do Environment não cobre isso sozinha: ela valida o ref
de onde o dispatch saiu, não o SHA que o input pede.

**`scripts/fumaca.sh <site> <supabase>` roda à mão.** É o mesmo script que o CI
usa depois de publicar, e vale contra qualquer ambiente. Ele verifica conteúdo,
nunca status de erro — não existe 404 neste servidor.

---

## Antes de commitar

1. `npm run check` — typecheck, lint e testes.
2. `npm run db:test` se tocou em schema, RPC ou view.
3. `npm run db:types` se tocou em schema, e commite o arquivo gerado.
4. Não afirme que algo funciona sem ter rodado. Se algo ficou por verificar,
   diga qual parte e por quê.
5. Nunca commite `.env.local` nem credencial. As chaves do Supabase local são
   fixas e públicas, e vivem em `apps/web/.env.example`.
