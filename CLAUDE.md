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
- `resultado` → `outcome` (acerto/erro, no ledger) mas `result` (retorno
  guardado da RPC, em `operations`).

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
npm run ext:build     # compila a extensão em apps/extension/dist

npm run e2e           # suíte Playwright, modo rápido
npm run e2e:video     # a mesma suíte, gravando .webm por teste
```

---

## Banco

**A fronteira da escrita é entre planejar e executar.**

| | Quem escreve | Como |
|---|---|---|
| `study_plans`, `study_plan_blocks`, `goals`, `subscriptions` | professor | direto, com RLS |
| `profiles`, `waitlist`, `student_preferences` | o próprio dono | direto, com RLS |
| `catalogs`, `catalog_blocks`, `catalog_questions` | admin | direto, com RLS |
| `quiz_sessions`, `quiz_session_questions`, `reinforcements`, `review_cycles` | ninguém | só RPC |
| `operations`, `audit_log`, `student_teacher_links` | ninguém | só RPC ou service_role |

Escrita de execução continua fechada porque é onde moram a máquina de estados,
a idempotência por `request_id` e o ledger append-only — coisas que uma tela
não tem como respeitar sozinha. Se uma tela precisa mexer em execução e não
existe RPC, crie a RPC; não afrouxe o grant.

Três defesas sustentam a escrita direta, e as três precisam continuar valendo
em qualquer tabela nova:

1. **`WITH CHECK` em todo INSERT e UPDATE**, amarrando a linha ao professor
   autenticado E a um aluno com vínculo vigente (`is_teacher_of`).
2. **`GRANT UPDATE` por coluna.** As colunas de contexto — `student_id`,
   `teacher_id`, `study_plan_id` — ficam de fora do grant. A RLS sozinha
   deixaria mover uma linha entre dois alunos do mesmo professor; o grant por
   coluna não deixa.
3. **`DELETE` não é concedido em lugar nenhum.** Remover é `UPDATE` em
   `deleted_at`.

**Cuidado ao testar RLS: `UPDATE` e `DELETE` filtram em silêncio.** A linha não
fica visível para a operação e o comando afeta zero linhas, sem erro. Só o
`WITH CHECK`, no INSERT e no UPDATE, levanta `42501`. Um teste que espere
exceção num UPDATE bloqueado passa por engano no dia em que a policy sumir —
conte linhas com `get diagnostics ... row_count`.

**`quiz_session_questions` é o ledger e a única fonte de desempenho.** É
append-only, protegido por trigger. Todo número agregado vem de view. Nunca
crie coluna de contador mantida à mão: o problema da versão anterior não era
ter agregados, era ter três caminhos independentes escrevendo o mesmo número.

**Toda RPC mutante precisa ser segura a retentativa.** Há duas formas, e a
escolha depende de a operação ter payload:

- **Com payload** — recebe `request_id` e passa por `reserve_operation`, que
  compara o hash: mesmo id e mesmo payload devolve o resultado anterior sem
  reexecutar; payload diferente é rejeitado. Usam isso `finish_quiz_session`,
  `record_quiz_session_time`, `void_quiz_session` e `record_reinforcement`.
- **Naturalmente idempotente** — o segundo `start_quiz_session` da mesma meta
  devolve a sessão já aberta; `activate_study_plan` chega ao mesmo estado.
  `apply_study_plan_batch` faz o replay pela própria chave do lote em
  `study_plan_batches`.

RPC nova que grava e aceita payload entra na primeira forma. Se você acha que
ela é naturalmente idempotente, escreva no comentário por quê.

**Nada é apagado fisicamente.** `deleted_at` mais a tabela `audit_log`. FKs de
histórico usam `ON DELETE RESTRICT`, não `SET NULL` — uma bateria que perde o
vínculo com a meta vira dado órfão que nenhuma tela consegue explicar.

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

- Enquanto **nada estiver implantado**, o schema é uma migration única. Edite-a
  no lugar e rode `npm run db:reset`.
- **Depois do primeiro deploy**, migration nova sempre. Nunca reescreva um
  arquivo já aplicado em qualquer ambiente.
- Rode `npm run db:types` depois de **toda** alteração de schema. O arquivo
  gerado é versionado: o CI precisa dele sem subir um Supabase, e o diff mostra
  o impacto na superfície de tipos.
- Toda view precisa de `with (security_invoker = true)`. Sem isso ela roda com
  privilégio do dono e vaza dados entre alunos.

---

## Protocolo site ↔ extensão

`packages/protocol` é a **única** definição. As duas pontas importam de lá;
nenhuma redefine as formas localmente. Elas são versionadas separadamente na
prática — o site atualiza sozinho, a extensão só quando o usuário quer — e na
versão anterior cada lado tinha sua cópia e elas derivaram.

- Toda leitura compara `PROTOCOL_VERSION` e rejeita versão diferente com
  mensagem acionável.
- Valide na fronteira: `JSON.parse` devolve `any`, e tipo de TypeScript não
  sobrevive à serialização.
- Mudança incompatível incrementa `PROTOCOL_VERSION`.
- **A extensão nunca fala com o Supabase.** Recebe um payload e devolve outro.
  Assim o pacote distribuído na loja não carrega credencial e toda regra de
  negócio fica atrás das RPCs. Por isso `@bora/extension` depende de
  `@bora/protocol` e não de `@bora/database`.

---

## Três ordenações que não podem inverter

Cada uma corresponde a uma perda silenciosa de bateria já respondida na versão
anterior — o dado mais caro do sistema, porque custa uma hora de estudo do
aluno e não pode ser recriado.

1. **Persistir antes de limpar a hash.** O payload da URL é a única cópia no
   navegador. Limpar antes de confirmar a gravação e depois falhar não deixa de
   onde recuperar.

2. **Aguardar a gravação antes de navegar.** `location.assign` destrói o
   content script; um `storage.set` não aguardado se perde junto. Sempre
   `await writeSession(...)` antes de sair da página.

3. **`request_id` gerado uma vez, na origem, e reusado em todo retry.** Gerá-lo
   no ponto de uso transforma a proteção do servidor em decoração: cada
   tentativa chega ao banco como operação nova.

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
`requireSession` concatena `location.hash` de propósito: quem volta do TEC com
a sessão expirada chega em `/aluno#boraQuizResult=…`, e esse fragmento é a
única cópia do resultado. Ver a primeira das três ordenações acima.

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

`npm run db:test` recria o banco e roda as suítes de `supabase/tests/`.

- **Teste de estado proibido usa `raise exception` se o banco aceitar.** É o
  que faz a suíte falhar quando uma constraint desaparece, e não só quando o
  código quebra.
- **As suítes compartilham estado**, rodam em sequência na mesma base. Teste
  novo que agrega por bloco precisa criar o próprio bloco, senão soma o que as
  anteriores deixaram.
- Testes de TypeScript ficam ao lado do código, em `*.test.ts`, e rodam pelo
  runner nativo do Node.

### Ponta a ponta, com navegador

`apps/e2e` roda a suíte Playwright contra o site e contra a extensão
instalada. O catálogo de fluxos que ela implementa é
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
  clique de formulário em `.content`.
- **Voltar do TEC é navegação de documento.** Um `goto` para a mesma URL
  trocando só o fragmento é *same-document*: o React não remonta e
  `QuizResultHandler` nunca roda. Use `returnToSite()`, que passa por
  `about:blank`.
- **O fragmento não chega ao servidor.** Leia a URL do frame depois da
  navegação; interceptar a request do TEC dá a URL sem `#`.
- **O domínio do TEC é interceptado automaticamente**, em todo teste. Nenhuma
  requisição pode sair para o site de terceiro.
- **Extensão exige `channel: "chromium"`.** No headless antigo ela não carrega
  e o teste falha dizendo que o painel não existe.
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

## Antes de commitar

1. `npm run check` — typecheck, lint e testes.
2. `npm run db:test` se tocou em schema, RPC ou view.
3. `npm run db:types` se tocou em schema, e commite o arquivo gerado.
4. Não afirme que algo funciona sem ter rodado. Se algo ficou por verificar,
   diga qual parte e por quê.
5. Nunca commite `.env.local` nem credencial. As chaves do Supabase local são
   fixas e públicas, e vivem em `apps/web/.env.example`.
