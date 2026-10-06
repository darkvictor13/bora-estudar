# PR 4 — Erro legível e retentativa que funciona

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-06 (o `BUG-06` de [`../relatorio-qa-2026-10-06.md`](../relatorio-qa-2026-10-06.md)) e N-01 |
| Branch | `fix/qa-4-erro-legivel` |
| Depende de | — (anda em paralelo). O PR 5a depende deste |
| Migration | não |

## O defeito

### QA-06 — o erro chega cru, e cada queda de rede vira relato

`translateDbError` (`apps/web/src/lib/api/supabase/errors.ts:95-113`) conhece
`42501`, `P0001`, `23505`, `23503` e `PGRST116`. Todo o resto cai no `default`
com `error.message` cru e código `unknown`. `fail` e `failure` passam por
`reportIfUnknown` (`:25-27`), e o resultado é que **cada queda de rede numa
escrita vira um evento no Sentry**.

O que o `@supabase/postgrest-js` 2.112.3 instalado devolve
(`node_modules/@supabase/postgrest-js/dist/index.mjs`):

| Situação | `error` | Onde |
|---|---|---|
| `fetch` falhou (sem rede, DNS, CORS, `route.abort`) | `{ code: "", message: "TypeError: Failed to fetch", details: <stack>, hint: "" }`, `status: 0` | `:392-430` |
| Corpo que não é JSON (502/503 de gateway, página HTML de proxy) | `{ message: <o corpo inteiro> }`, **sem `code`** | `:456`, `:500` |
| `23514`, `22P02`, `22003`, `23502` | a frase do Postgres, em inglês | — |

O texto da falha de rede **muda por navegador**: "Failed to fetch" no
Chromium, "NetworkError when attempting to fetch resource." no Firefox e "Load
failed" no Safari. O `code: ""` é o mesmo nos três. `AbortError` (timeout ou
cancelamento) também sai com `code: ""`.

O login já trata isso. `translateAuthError` (`:76-79`) leva
`AuthRetryableFetchError` a `offline`, com "Sem conexão. Verifique a rede e
tente de novo.". `offline` existe em `ApiErrorCode` (`lib/api/contract.ts:116`),
e `lib/observability.ts:44-51` o trata como estado do produto, sem relatar.

### N-01 — `once()` guarda para sempre a promessa REJEITADA

`apps/web/src/lib/api/supabase/idempotency.ts:26-45`. Quando a operação
**lança**, `running` rejeita. O `.then` que limpa a chave (`:35-37`) só roda
quando a promessa é cumprida. Resultado: a rejeição fica no mapa até sair pelo
`LIMIT` de 200, e toda retentativa com o mesmo `requestId` devolve a mesma
rejeição, sem reexecutar. A promessa derivada do `.then` também rejeita sem
ninguém tratar: **uma `unhandledrejection` por falha**.

Reproduzido no Node com uma cópia de `once()`: a operação roda uma vez só, a
segunda chamada recebe o mesmo erro, a chave continua no mapa e sai um
`unhandledRejection`.

O que lança dentro de uma escrita:
- `requireSession`, que chama `readFailure`;
- os leitores que usam `throwDb` (`goalContext`, `loadTheoryContext`,
  `loadWaitlistEntry`, `context`/`loadWeek`, `cardOf`, `loadSubjectRules`,
  `loadReviewGrid`, `loadAliases`);
- `currentSession`, que com a rede caída lança `ApiThrownError("offline")`
  (`supabase/session.ts:87-96`).

Na tela, `RecordStudyDialog` e `ExtraStudyDialog` criam o `requestId` ao abrir
e só o trocam no sucesso (`RecordStudyDialog.tsx:38, :68-70`;
`ExtraStudyDialog.tsx:55, :86`). O `await onSubmit(...)` rejeita, o
`setPending(false)` nunca roda (`RecordStudyDialog.tsx:62`;
`ExtraStudyDialog.tsx:80`), e o botão fica preso em "Registrando…" ou
"Salvando…" até recarregar.

**As escritas afetadas:**

| Dentro de `once`, com helper que lança | Fora de `once`, com helper que lança |
|---|---|
| `week.ts`: `recordStudy` `:303`, `removeStudyEntry` `:348`, `completeGoal`/`reopenGoal`/`skipGoal` (via `changeStatus` `:377`), `recordExtraStudy` `:432` | `access.ts`: `joinWaitlist` `:63` |
| `theory.ts`: `:576`, `:657`, `:724` | `review.ts`: `saveReviewSpacing` `:149` |
| `personal-flashcards.ts`: `:72`, `:87`, `:112` | `teacher-classes.ts`: `setClassTheoryCatalog` `:140`, `enrollStudent` `:190` |
| `flashcards.ts:187`, `library-flashcards.ts:111`, `laws.ts:103`, `flashcard-marks.ts:75` | `mock-exams.ts`: `createMockExam` `:60`, `saveMockExamScore` `:77`, `saveMockExamSubject` `:96`, `saveMockExamSubjectScore` `:112` |
| `teacher-classes.ts:80`, `teacher-plans.ts:82`, `teacher-goals.ts:199` e `:262` | `auth.ts`: `saveAccount` `:142`, porque `loadAccount` lança DEPOIS do update |
| `teacher-theory.ts`: `:64`, `:191`, `:304`, `:593`; `teacher-students.ts`: `grantAccess`/`revokeAccess` (via `writeAccess`, `cardOf`) | |

Só `auth.ts:33-40` (`sessionForWrite`) converte direito hoje.

**De quebra, no mesmo assunto.** `notebooks.ts:143` e `teacher-theory.ts:486`
fazem `const { data: existing } = await supabase…` e ignoram o `error`. Com o
select falhando, o código toma o caminho do INSERT para uma linha que existe.

## Decisões aplicadas

- **A rede se reconhece por `code === ""`, nunca pelo texto.** É a regra de
  "filtre por `ApiErrorCode`, nunca pela mensagem", aplicada um nível abaixo.
- **Corpo sem `code` vira `unknown`, com frase fixa, e continua relatado.**
  Nunca mostrar HTML de gateway na tela. Um 502 em série é o que alguém
  precisa ver no painel, e o breadcrumb de `fetch` do SDK leva URL e status.
- **`23514` vira `validation` com frase genérica.** Onde a chamada sabe qual
  CHECK disparou, ela troca a frase ali mesmo, como `deleteClass` faz com
  `P0001` (`teacher-classes.ts:170-182`). **`22P02`, `22003` e `23502`** também
  viram `validation` genérico. É rede de segurança: a regra de verdade vai
  para `validation.ts` nos PRs 5a e 7.
- **O preço, dito em voz alta:** `validation` é estado esperado
  (`observability.ts:44-51`). Uma CHECK que chega ao banco porque faltou a
  regra em `validation.ts` deixa de ser relatada. Quem pega a falta é o teste
  do PR que escreve a regra, não o painel.
- **`unknown` continua mostrando a mensagem original.** É o texto que o relato
  leva como título, e uma frase genérica juntaria defeitos diferentes num
  evento só. As frases novas são só para os casos acima.
- **Escrita não lança, e isso é garantido no adaptador, não na tela.** `once`
  converte o throw em `failure` e libera a chave. Escrita fora de `once` que
  chama helper que lança passa por `settle`. Não ponha try/catch em
  componente.
- **A parte pura sai para arquivos sem `@/`.** `errors.ts` importa
  `@/lib/observability`, que o runner do Node não resolve (alias) nem avalia
  (`import.meta.env` não existe fora do Vite). Por isso `errors.test.ts` não
  tem como importar `errors.ts`, e o que é testável vai para módulos puros.

As frases, todas em `error-translation.ts`:

| Constante | Texto |
|---|---|
| `OFFLINE_MESSAGE` | "Sem conexão. Verifique a rede e tente de novo." (a que o login já usa) |
| `INVALID_VALUE_MESSAGE` | "Algum campo tem um valor que não pode ser gravado. Confira e tente de novo." |
| `SERVER_UNAVAILABLE_MESSAGE` | "O servidor não respondeu como esperado. Tente de novo em instantes." |

## Passo a passo

1. **Catálogo e arquitetura** (commit próprio). Não há id novo:
   - `docs/fluxos-e2e.md`, três linhas ampliadas:
     - F-META-03: "; rede caindo mostra 'Sem conexão', e a retentativa no mesmo
       diálogo grava uma vez — QA-06";
     - F-EXTRA-01: "; falha que LANÇA não prende o diálogo — N-01";
     - F-OBS-01: "; nem quando uma escrita cai na rede".
   - `docs/arquitetura.md`, seção "O que é relatado" (`:339`): um parágrafo com
     a tabela "o que chega → código → frase" da seção anterior. Acrescente a
     regra de que escrita que chama helper que lança roda em `once` ou
     `settle`.

2. **`apps/web/src/lib/api/supabase/error-translation.ts`** (novo, puro). O
   único import de runtime é `../contract.ts`; `import type` do
   `@supabase/supabase-js` é apagado pelo strip.

   ```ts
   import type { AuthError } from "@supabase/supabase-js";
   import { ApiThrownError, type ApiError } from "../contract.ts";

   export const OFFLINE_MESSAGE = "Sem conexão. Verifique a rede e tente de novo.";
   export const INVALID_VALUE_MESSAGE =
     "Algum campo tem um valor que não pode ser gravado. Confira e tente de novo.";
   export const SERVER_UNAVAILABLE_MESSAGE =
     "O servidor não respondeu como esperado. Tente de novo em instantes.";

   /** O `error` do postgrest-js. `code` falta quando o corpo não era JSON. */
   export interface DbErrorLike {
     readonly code?: string | null;
     readonly message: string;
   }

   // Move para cá, sem mudar a lógica; o ramo de rede passa a usar OFFLINE_MESSAGE.
   export function translateAuthError(error: Pick<AuthError, "name" | "message" | "code">): ApiError { … }

   export function translateDbError(error: DbErrorLike): ApiError {
     if (error.code === "") return { code: "offline", message: OFFLINE_MESSAGE };
     if (error.code === undefined || error.code === null) {
       return { code: "unknown", message: SERVER_UNAVAILABLE_MESSAGE };
     }
     switch (error.code) {
       // …os cinco casos de hoje, iguais…
       case "23514": // check_violation
       case "22P02": // invalid_text_representation ("1.5" num integer)
       case "22003": // numeric_value_out_of_range
       case "23502": // not_null_violation
         return { code: "validation", message: INVALID_VALUE_MESSAGE };
       default:
         return { code: "unknown", message: error.message };
     }
   }

   /** O que uma escrita LANÇOU, no vocabulário do contrato. */
   export function apiErrorFromThrown(thrown: unknown): ApiError {
     if (thrown instanceof ApiThrownError) return { code: thrown.code, message: thrown.message };
     return { code: "unknown", message: thrown instanceof Error ? thrown.message : String(thrown) };
   }
   ```

   Os comentários que hoje explicam `42501`, `P0001` e `AuthRetryableFetchError`
   vão junto.

3. **`errors.ts`**:
   - `export { translateAuthError, translateDbError } from "./error-translation.ts";`.
     Os ~20 arquivos que importam de `./errors.ts` não mudam;
   - `failure<T>(error: ApiError, cause?: unknown)` passa `cause` a
     `reportIfUnknown`;
   - novas:

     ```ts
     /** O throw que escapou de uma escrita, como `Result` — relatado se for `unknown`. */
     export function recoverThrown(thrown: unknown): Result<never> {
       return failure(apiErrorFromThrown(thrown), thrown);
     }

     /** Para a escrita que chama helper que LANÇA e não passa por `once`. */
     export async function settle<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
       try {
         return await operation();
       } catch (thrown) {
         return recoverThrown(thrown);
       }
     }
     ```

4. **A memória de retentativa**:
   - `apps/web/src/lib/api/supabase/request-memory.ts` (novo, puro, só
     `import type` de `../contract.ts`). Leva o comentário de cabeçalho de
     `idempotency.ts` e o `LIMIT`:

     ```ts
     export function createOnce(recover: (thrown: unknown) => Result<never>) {
       const seen = new Map<RequestId, Promise<Result<unknown>>>();
       return function once<T>(requestId: RequestId, operation: () => Promise<Result<T>>): Promise<Result<T>> {
         const known = seen.get(requestId);
         if (known) return known as Promise<Result<T>>;

         // NUNCA REJEITA. O throw de dentro (requireSession, throwDb) vira
         // `failure` aqui, e é isso que deixa o `.then` abaixo limpar a chave.
         const running = (async (): Promise<Result<T>> => {
           try {
             return await operation();
           } catch (thrown) {
             return recover(thrown);
           }
         })();
         seen.set(requestId, running as Promise<Result<unknown>>);
         void running.then((result) => {
           if (!result.ok) seen.delete(requestId);
         });
         // …o descarte pelo LIMIT, igual ao de hoje…
         return running;
       };
     }
     ```

   - `idempotency.ts` vira a composição:
     `export const once = createOnce(recoverThrown);`. As chamadas de
     `once(...)` não mudam.

5. **`settle` nas escritas fora de `once`** da tabela de "O defeito": o corpo
   inteiro vai para dentro de `return settle(async () => { … })`. Nas de
   `mock-exams.ts` e em `saveAccount`, que são métodos de objeto, o padrão é
   o mesmo.

6. **De quebra**:
   - `notebooks.ts:143` e `teacher-theory.ts:486`: desestruture `error` e
     devolva `failure(translateDbError(error))` antes de decidir entre UPDATE
     e INSERT;
   - `supabase/session.ts:116`: `readFailure("Sua sessão expirou. Entre de
     novo.", "unauthenticated")`. Hoje o código padrão de `readFailure` é
     `not_found`, e o PR 8 (QA-13) vai mostrar `not_found` como "Não
     encontrado". Sessão vencida não pode cair nessa tela. A frase não muda.

7. **Testes** (seção abaixo).

8. **Docs**:
   - `CLAUDE.md`, seção "O relato de erro", no item "Erro de escrita NÃO é
     lançado": uma frase dizendo que escrita que chama helper que lança roda
     dentro de `once` ou `settle`, que convertem o throw em `failure`;
   - `docs/bugs-encontrados.md`: entradas QA-06 e N-01 na seção "Varredura de
     06/10/2026" (crie-a se nenhum PR anterior a criou). Na do QA-06, cite o
     BUG-09, "da mesma classe e dado como corrigido".

## Testes

**`apps/web/src/lib/api/supabase/error-translation.test.ts`**, pelo runner do
Node 24, com import relativo `./error-translation.ts`:

| Entrada | Esperado |
|---|---|
| `{ code: "", message: "TypeError: Failed to fetch" }` | `{ code: "offline", message: OFFLINE_MESSAGE }` |
| o mesmo com "TypeError: NetworkError when attempting to fetch resource." e com "TypeError: Load failed" | igual: o texto não decide |
| `{ message: "<html>502 Bad Gateway</html>" }` (sem `code`) | `unknown` com `SERVER_UNAVAILABLE_MESSAGE`, sem HTML |
| `23514`, `22P02`, `22003`, `23502` | `{ code: "validation", message: INVALID_VALUE_MESSAGE }`, sem `field` |
| `42501`, `P0001`, `23505`, `23503`, `PGRST116` | o de hoje (regressão) |
| `{ code: "XX999", message: "x" }` | `{ code: "unknown", message: "x" }`. O F-OBS-01 depende disso |
| `translateAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", code: undefined })` | `offline` com `OFFLINE_MESSAGE`, a mesma constante |
| `apiErrorFromThrown(new ApiThrownError("offline", "…"))`, `(new TypeError("y"))`, `("z")` | `{ code: "offline", … }`; `unknown` com "y"; `unknown` com "z" |

**`apps/web/src/lib/api/supabase/request-memory.test.ts`**, com
`createOnce((t) => ({ ok: false, error: apiErrorFromThrown(t) }))`:
- operação que lança `ApiThrownError("offline")` → a promessa **resolve** com
  `{ ok: false }` e código `offline`;
- depois disso, a mesma chave reexecuta (contador 2) e pode dar certo;
- `{ ok: false }` devolvido, sem throw → a chave é liberada (o comportamento
  de hoje);
- sucesso é memorizado: contador 1, e a segunda chamada devolve o mesmo valor;
- duas chamadas enquanto a primeira roda → uma execução;
- nenhuma `unhandledRejection`: um ouvinte em
  `process.on("unhandledRejection")`, um `await new Promise(setImmediate)`, e
  a asserção de que ele não disparou.

**e2e**:

1. **F-META-03**, em `apps/e2e/tests/student-week.spec.ts`: "rede caindo ao
   gravar: a frase é 'Sem conexão', e a retentativa grava uma vez — QA-06".
   - `studentPage.route((url) => url.pathname.endsWith("/rest/v1/goal_entries"), …)`:
     com uma flag ligada e método `POST`, `route.abort("internetdisconnected")`;
     senão, `route.fallback()`;
   - `record(...)` (o helper do arquivo);
   - `alert(testId(page, "record-study-dialog"), "error")` tem o texto de
     `OFFLINE_MESSAGE`, e o diálogo não contém "TypeError";
   - desliga a flag e clica "Registrar" de novo, no mesmo diálogo. O diálogo
     fecha e `goal_entries` da meta tem **1** linha;
   - `consoleErrors` vazio. O "Failed to load resource" do abort já é
     filtrado pela fixture.
2. **F-EXTRA-01**, no mesmo arquivo: "falha que LANÇA não prende o diálogo —
   N-01".
   - Abra o diálogo e preencha como o teste existente. Mate só a próxima
     verificação de sessão, como o F-TEMA-09 (`theme.spec.ts:374-377`):
     `let failures = 1; route(/\/auth\/v1\/user/, (r) => failures-- > 0 ? r.abort("internetdisconnected") : r.continue())`;
   - clique "Lançar estudo". `recordExtraStudy` chama `requireSession`, que
     lança `offline` dentro de `once`;
   - o alerta do diálogo diz "Sem conexão…", e o botão volta a ser "Lançar
     estudo" e está habilitado;
   - clique de novo: o diálogo fecha, há **uma** meta `extra` com aquela
     matéria, e `consoleErrors` está vazio. Antes da correção aparece um
     `pageerror` de promessa rejeitada.
   - **Rode antes da correção:** o teste fica vermelho no botão preso em
     "Salvando…".
3. **F-OBS-01**, em `apps/e2e/tests/observability.spec.ts`: "uma escrita que
   cai na rede não é relatada".
   - `teacherPage` em `/professor/turmas`, "Nova turma", nome;
   - `route` que aborta o `POST` em `/rest/v1/classes`, e clique em "Criar";
   - o alerta do `class-dialog` diz "Sem conexão…", e `saidas` está vazio.
   - No comentário do teste, diga o limite dele. Com o DSN vazio nada sai em
     caso nenhum. O que o teste prova é que a escrita chegou ao código
     `offline`, e é o código que decide o relato (`observability.ts:44-51`).
     A asserção sobre `saidas` enuncia a regra, como no teste de cima.

## Critério de pronto

- [ ] `npm run check` verde, com os dois arquivos de teste novos rodando
      (Node 24).
- [ ] e2e verdes: `student-week.spec.ts`, `observability.spec.ts`,
      `theme.spec.ts` (o F-TEMA-09 usa a mesma frase) e o F-MATR de
      `teacher.spec.ts`.
- [ ] O teste de N-01 vermelho antes do passo 4, e verde depois.
- [ ] Varredura à mão: em
      `grep -n "Promise<Result<" apps/web/src/lib/api/supabase/*.ts`, toda
      escrita que alcança `requireSession`, `throwDb`, `readFailure` ou
      `currentSession` passa por `once` ou `settle`. Liste na descrição do PR
      as que você conferiu.
- [ ] `grep -rn --exclude="*.test.ts" '"Sem conexão' apps/web/src` acha uma ocorrência só, a
      constante.

## Armadilhas

- **Leitura (GET) com a rede caída demora uns 7 s para falhar.** O
  postgrest-js repete GET/HEAD/OPTIONS três vezes, com espera de 1 s, 2 s e
  4 s (`index.mjs:23-27, :371-376`). Escrita (POST/PATCH/DELETE) falha na hora.
  Em e2e, derrube a escrita, ou o `/auth/v1/user` (o GoTrue não repete). Se
  precisar derrubar um GET, dê `timeout` de 15 s ou mais à asserção.
- **Não importe `errors.ts`, `idempotency.ts` nem nada com `@/` nos testes.**
  O runner do Node não resolve o alias, e `observability.ts` lê
  `import.meta.env`, que lá não existe. É por isso que a parte pura mora em
  `error-translation.ts` e `request-memory.ts`, e esses dois só podem
  importar `../contract.ts`.
- **O F-OBS-01 precisa continuar caindo no `default`.** O código sintético
  dele é `XX999`. Não escolha, para aquele teste, um código que este PR passou
  a mapear.
- **Relato sem duplicata.** Hoje um `ApiThrownError("unknown")` lançado dentro
  de escrita só chega ao Sentry pela `unhandledrejection` global, quando
  chega. Depois deste PR ele chega uma vez, por `recoverThrown` e com
  `cause`, e a `unhandledrejection` deixa de existir.
- **`AbortError` também tem `code: ""`.** Hoje nenhuma chamada passa
  `AbortSignal`. Se alguém puser timeout, "Sem conexão" é a leitura certa
  para quem está na tela.
- **A fixture tem um `once` próprio** (`lib/api/fixtures.ts:171-177`),
  síncrono e sem rede, e não muda. Este PR não mexe em contrato.
- **O PR 5a reescreve `recordStudy` e `recordExtraStudy` por RPC.** O teste 1
  passa a interceptar `rpc/record_goal_entry`. O teste 2 depende de
  `recordExtraStudy` chamar `requireSession`; se a RPC tirar essa chamada,
  o 5a muda o teste para outra escrita que lance e guarde o `requestId` da
  abertura do diálogo. Deixe isso escrito num comentário no teste.

## Fora do escopo

- **Frases específicas por CHECK.** WhatsApp e nascimento ficam no PR 7
  (`checkWaitlist`). Minutos e questões do registro ("1,5", "99999999999")
  ficam no 5a. "Parei na página 7,5" fica com 5a ou 5b, no PR que escrever a
  regra da teoria. A meta da disciplina acima de 100% (`study_plan_notebooks_subject_target_check`)
  não tem dono no plano e fica com a frase genérica.
- **Outros pontos que ignoram `error`:**
  - `week.ts:367` e `:500`: o 5a reescreve;
  - `theory.ts:403` e `:643`: 5b;
  - `auth.ts:115` e `:125`: PR 6, QA-08;
  - `review.ts:121` e `:166`, `statistics.ts:413` e `:421`: leituras, sem
    efeito em gravação.
- **Tradução de `PGRST301`/`PGRST303`** (JWT vencido). Com o refresh
  automático do cliente é raro, e não apareceu no QA.
- **Frase genérica para `unknown`** (ver Decisões).
